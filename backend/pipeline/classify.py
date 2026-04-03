import os
import json
import time
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

# Cost per 1M tokens (approximate)
COSTS = {
    "gemini-2.0-flash": {"input": 0.10, "output": 0.40},
    "gemini-2.0-flash-lite": {"input": 0.075, "output": 0.30},
    "gemini-2.5-flash": {"input": 0.15, "output": 0.60},
}


def _call_gemini(prompt: str, model: str = "gemini-2.0-flash") -> tuple[str, float]:
    """Call Gemini API and return (response_text, cost_usd)."""
    from google import genai

    client = genai.Client(api_key=GEMINI_API_KEY)
    response = client.models.generate_content(
        model=model,
        contents=prompt,
        config={
            "response_mime_type": "application/json",
            "temperature": 0.1,
        },
    )

    text = response.text or ""
    # Estimate cost from usage metadata
    cost = 0.0
    if response.usage_metadata:
        input_tokens = response.usage_metadata.prompt_token_count or 0
        output_tokens = response.usage_metadata.candidates_token_count or 0
        rates = COSTS.get(model, COSTS["gemini-2.0-flash"])
        cost = (input_tokens * rates["input"] + output_tokens * rates["output"]) / 1_000_000

    return text, cost


def _build_classification_prompt(tweets_batch: list[dict], topic_prompt: str) -> str:
    """Build the full classification prompt for a batch of tweets."""
    tweets_text = ""
    for i, t in enumerate(tweets_batch):
        tweets_text += f"""
--- Tweet {i + 1} ---
ID: {t['id_str']}
Author: @{t.get('screen_name', 'unknown')}
Author Bio: {t.get('author_bio', 'N/A')}
Followers: {t.get('author_followers', 0)}
Text: {t.get('full_text', '')}
Likes: {t.get('likes', 0)} | Retweets: {t.get('retweets', 0)} | Views: {t.get('views', 0)}
"""

    return f"""{topic_prompt}

Here are the tweets to classify:
{tweets_text}

Return a JSON array where each element has these fields:
- id_str: the tweet ID
- about_subject: boolean, is this tweet about the topic?
- political_bent: one of the valid categories from the prompt above
- author_type: one of "politician", "mainstream_news", "independent_news", "partisan_news", "activist", "general"
- intensity_score: integer from -10 to 10. Negative = anti/left intensity, positive = pro/right intensity. 0 if neutral/unclear. Higher absolute value = more extreme position.
- classification_basis: 1-sentence explanation
- confidence: float 0.0-1.0
"""


def _parse_classifications(response_text: str) -> list[dict]:
    """Parse LLM response into classification dicts."""
    try:
        # Try to parse as JSON directly
        text = response_text.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
        results = json.loads(text)
        if isinstance(results, dict) and "classifications" in results:
            results = results["classifications"]
        if isinstance(results, dict) and "tweets" in results:
            results = results["tweets"]
        if not isinstance(results, list):
            results = [results]
        return results
    except (json.JSONDecodeError, KeyError):
        return []


def classify_tweets(tweets: list[dict], topic_classification_prompt: str) -> tuple[list[dict], float]:
    """
    Classify tweets using LLM with smart escalation and parallel batching.
    Returns (classifications, total_cost_usd).
    """
    import concurrent.futures

    batch_size = 60  # Larger batches — Gemini handles 60 tweets well
    max_parallel = 20  # Process 20 batches simultaneously
    all_classifications = []
    total_cost = 0.0

    # Build all batches
    batches = []
    for i in range(0, len(tweets), batch_size):
        batches.append(tweets[i:i + batch_size])

    def process_batch(batch):
        """Process a single batch: classify + escalate low-confidence."""
        batch_cost = 0.0
        batch_results = []
        prompt = _build_classification_prompt(batch, topic_classification_prompt)

        try:
            response_text, cost = _call_gemini(prompt, model="gemini-2.0-flash")
            batch_cost += cost
            parsed = _parse_classifications(response_text)
        except Exception:
            parsed = []

        parsed_by_id = {str(c.get("id_str", "")): c for c in parsed}

        for tweet in batch:
            tid = tweet["id_str"]
            classification = parsed_by_id.get(tid)

            if not classification:
                classification = {
                    "id_str": tid,
                    "about_subject": False,
                    "political_bent": "error",
                    "confidence": 0.0,
                    "classification_method": "error-no-parse",
                }

            try:
                conf = float(classification.get("confidence", 0.0))
            except (TypeError, ValueError):
                conf = 0.0
            bent = classification.get("political_bent", "")

            # Escalate only errors to Flash (single call, not 3-model ensemble)
            if bent == "error" or conf < 0.2:
                try:
                    escalated, esc_cost = _escalate_classification(tweet, topic_classification_prompt)
                    batch_cost += esc_cost
                    if escalated:
                        classification = escalated
                except Exception:
                    pass

            classification["id_str"] = tid
            classification.setdefault("classification_method", "gemini-2.0-flash")
            batch_results.append(classification)

        return batch_results, batch_cost

    # Process batches in parallel
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_parallel) as executor:
        futures = {executor.submit(process_batch, batch): i for i, batch in enumerate(batches)}
        results_by_index = {}
        for future in concurrent.futures.as_completed(futures):
            idx = futures[future]
            try:
                batch_results, batch_cost = future.result()
                results_by_index[idx] = batch_results
                total_cost += batch_cost
            except Exception:
                # If a batch fails entirely, mark all as errors
                results_by_index[idx] = [{
                    "id_str": t["id_str"],
                    "about_subject": False,
                    "political_bent": "error",
                    "confidence": 0.0,
                    "classification_method": "error-batch-failed",
                } for t in batches[idx]]

    # Reassemble in order
    for i in range(len(batches)):
        all_classifications.extend(results_by_index.get(i, []))

    print(f"  Classified {len(all_classifications)} tweets | Cost: ${total_cost:.4f}")
    return all_classifications, total_cost


def _escalate_classification(tweet: dict, topic_prompt: str) -> tuple[dict | None, float]:
    """
    Escalate to Gemini Flash (full model) for a second opinion.
    Much faster than 3-model ensemble — single API call instead of 3.
    """
    prompt = _build_classification_prompt([tweet], topic_prompt)
    total_cost = 0.0

    try:
        resp, cost = _call_gemini(prompt, model="gemini-2.0-flash")
        total_cost += cost
        parsed = _parse_classifications(resp)
        if parsed:
            result = parsed[0]
            result["classification_method"] = "escalated-flash"
            return result, total_cost
    except Exception:
        pass

    return None, total_cost


def _call_claude_haiku(tweet: dict, topic_prompt: str) -> tuple[dict | None, float]:
    """Call Claude Haiku for classification."""
    import anthropic

    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key:
        return None, 0.0

    client = anthropic.Anthropic(api_key=api_key)
    prompt = _build_classification_prompt([tweet], topic_prompt)

    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )

    text = response.content[0].text if response.content else ""
    parsed = _parse_classifications(text)

    # Estimate cost: Haiku pricing
    cost = 0.0
    if response.usage:
        cost = (response.usage.input_tokens * 0.80 + response.usage.output_tokens * 4.0) / 1_000_000

    return parsed[0] if parsed else None, cost


def _call_gpt_mini(tweet: dict, topic_prompt: str) -> tuple[dict | None, float]:
    """Call GPT-5-Mini for classification."""
    from openai import OpenAI

    api_key = os.getenv("OPENAI_API_KEY", "")
    if not api_key:
        return None, 0.0

    client = OpenAI(api_key=api_key)
    prompt = _build_classification_prompt([tweet], topic_prompt)

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        max_tokens=1024,
    )

    text = response.choices[0].message.content or ""
    parsed = _parse_classifications(text)

    cost = 0.0
    if response.usage:
        cost = (response.usage.prompt_tokens * 0.15 + response.usage.completion_tokens * 0.60) / 1_000_000

    return parsed[0] if parsed else None, cost
