import os
import json
import time
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

COSTS = {
    "gemini-2.0-flash": {"input": 0.075, "output": 0.30},
}


def _call_gemini(prompt: str) -> tuple[str, float]:
    """Call Gemini Flash-Lite and return (response_text, cost_usd)."""
    from google import genai

    client = genai.Client(api_key=GEMINI_API_KEY)
    response = client.models.generate_content(
        model="gemini-2.0-flash",
        contents=prompt,
        config={
            "response_mime_type": "application/json",
            "temperature": 0.1,
        },
    )

    text = response.text or ""
    cost = 0.0
    if response.usage_metadata:
        input_tokens = response.usage_metadata.prompt_token_count or 0
        output_tokens = response.usage_metadata.candidates_token_count or 0
        rates = COSTS["gemini-2.0-flash"]
        cost = (input_tokens * rates["input"] + output_tokens * rates["output"]) / 1_000_000

    return text, cost


def _build_intensity_prompt(
    tweets_batch: list[dict],
    topic_intensity_prompt: str,
    pro_label: str,
    anti_label: str,
) -> str:
    """Build the intensity scoring prompt for a batch of tweets."""
    tweets_text = ""
    for i, t in enumerate(tweets_batch):
        tweets_text += f"""
--- Tweet {i + 1} ---
ID: {t['id_str']}
Author: @{t.get('screen_name', 'unknown')}
Text: {t.get('full_text', '')}
Classification: {t.get('political_bent', 'unknown')}
"""

    return f"""{topic_intensity_prompt}

Labels: {pro_label} (positive scores 1-10), {anti_label} (negative scores -10 to -1)

Score each tweet on intensity:
- Negative scores (-10 to -1) indicate {anti_label} intensity
- Positive scores (1 to 10) indicate {pro_label} intensity
- Higher absolute value = more intense/extreme position

Tweets to score:
{tweets_text}

Return a JSON array where each element has:
- id_str: the tweet ID
- intensity_score: integer from -10 to 10
- intensity_confidence: float 0.0-1.0
- intensity_reasoning: brief explanation
- direction_flag: "valid" if score direction matches classification, "mismatch" if not
"""


def score_intensity(
    classifications: list[dict],
    topic_intensity_prompt: str,
    pro_label: str,
    anti_label: str,
    pro_bent: str,
    anti_bent: str,
) -> tuple[list[dict], float]:
    """
    Score intensity for classified tweets.
    Only runs on tweets classified as pro or anti (not neutral/unclear/error).
    Returns (intensity_results, total_cost_usd).
    """
    # Filter to only pro/anti tweets
    scoreable = [
        c for c in classifications
        if c.get("political_bent") in (pro_bent, anti_bent)
        and c.get("about_subject", False)
    ]

    if not scoreable:
        print("  No tweets to score for intensity")
        return [], 0.0

    import concurrent.futures

    batch_size = 20  # Larger batches
    max_parallel = 5
    all_results = []
    total_cost = 0.0

    batches = []
    for i in range(0, len(scoreable), batch_size):
        batches.append(scoreable[i:i + batch_size])

    def process_batch(batch):
        batch_cost = 0.0
        batch_results = []
        prompt = _build_intensity_prompt(batch, topic_intensity_prompt, pro_label, anti_label)

        try:
            response_text, cost = _call_gemini(prompt)
            batch_cost += cost

            text = response_text.strip()
            if text.startswith("```"):
                text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
            results = json.loads(text)
            if isinstance(results, dict):
                results = results.get("tweets", results.get("scores", [results]))
            if not isinstance(results, list):
                results = [results]

            results_by_id = {str(r.get("id_str", "")): r for r in results}

            for item in batch:
                tid = item["id_str"]
                result = results_by_id.get(tid, {})
                score = result.get("intensity_score")

                if score is not None:
                    try:
                        score = max(-10, min(10, int(float(score))))
                    except (ValueError, TypeError):
                        score = None
                    if score is not None:
                        if item.get("political_bent") == anti_bent and score > 0:
                            result["direction_flag"] = "mismatch"
                        elif item.get("political_bent") == pro_bent and score < 0:
                            result["direction_flag"] = "mismatch"

                batch_results.append({
                    "id_str": tid,
                    "intensity_score": score,
                    "intensity_confidence": result.get("intensity_confidence", 0.0),
                    "intensity_reasoning": result.get("intensity_reasoning", ""),
                    "intensity_flag": result.get("direction_flag", "valid"),
                })

        except Exception:
            for item in batch:
                batch_results.append({
                    "id_str": item["id_str"],
                    "intensity_score": None,
                    "intensity_confidence": 0.0,
                    "intensity_reasoning": "parse-error",
                    "intensity_flag": "error",
                })

        return batch_results, batch_cost

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
                results_by_index[idx] = [{
                    "id_str": item["id_str"],
                    "intensity_score": None,
                    "intensity_confidence": 0.0,
                    "intensity_reasoning": "error",
                    "intensity_flag": "error",
                } for item in batches[idx]]

    for i in range(len(batches)):
        all_results.extend(results_by_index.get(i, []))

    print(f"  Scored intensity for {len(all_results)} tweets | Cost: ${total_cost:.4f}")
    return all_results, total_cost
