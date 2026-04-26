"""
Lightweight tweet classification for trending/pulse topics.

Fetch + classify only (no framing, no summaries, no DB writes).
Returns volume + sentiment split in ~30-60 seconds per topic.
Results are held in memory for the pulse endpoint.
"""

import os
import json
import requests
import time
from dotenv import load_dotenv

load_dotenv()

SOCIALDATA_API_KEY = os.getenv("SOCIALDATA_API_KEY", "")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")


def fetch_tweets_for_topic(search_query: str, max_pages: int = 25, max_results: int = 500) -> list[dict]:
    """Fetch top tweets for a topic via SocialData, paginating for more volume."""
    if not SOCIALDATA_API_KEY:
        return []

    headers = {
        "Authorization": f"Bearer {SOCIALDATA_API_KEY}",
        "Accept": "application/json",
    }

    results = []
    next_cursor = None

    for page in range(max_pages):
        try:
            params = {"query": f"{search_query} lang:en", "type": "Top"}
            if next_cursor:
                params["cursor"] = next_cursor

            resp = requests.get(
                "https://api.socialdata.tools/twitter/search",
                headers=headers,
                params=params,
                timeout=15,
            )
            resp.raise_for_status()
            data = resp.json()
            tweets = data.get("tweets", [])

            if not tweets:
                break

            for t in tweets:
                eng = (t.get("favorite_count", 0) or 0) + (t.get("retweet_count", 0) or 0) + (t.get("reply_count", 0) or 0)
                results.append({
                    "text": (t.get("full_text", "") or "")[:250],
                    "engagement": eng,
                    "views": t.get("views_count", 0) or 0,
                    "author": t.get("user", {}).get("screen_name", ""),
                })

            next_cursor = data.get("next_cursor")
            if not next_cursor or len(results) >= max_results:
                break

            time.sleep(0.15)
        except Exception as e:
            print(f"[QuickClassify] Fetch error (page {page}): {e}")
            break

    print(f"[QuickClassify] Fetched {len(results)} tweets across {page + 1} pages")
    return results[:max_results]


def classify_tweets_batch(
    tweets: list[dict],
    pro_label: str,
    anti_label: str,
    topic_name: str,
) -> dict:
    """Classify a batch of tweets into pro/anti/neutral using Gemini.

    Returns {
        "pro_count": int, "anti_count": int, "neutral_count": int,
        "pro_engagement": int, "anti_engagement": int,
        "pro_views": int, "anti_views": int,
        "total": int,
        "sample_pro": [str, ...], "sample_anti": [str, ...],
    }
    """
    if not GEMINI_API_KEY or not tweets:
        return _empty_result()

    pro_bent = pro_label.lower().replace(" ", "-")
    anti_bent = anti_label.lower().replace(" ", "-")

    # Build classification prompt
    tweets_text = ""
    for i, t in enumerate(tweets[:500]):
        tweets_text += f"\n[{i}] @{t['author']}: {t['text']}"

    prompt = f"""Classify each tweet's stance on "{topic_name}" into one of these categories:
- "{pro_bent}": supports, agrees with, or leans toward the {pro_label} perspective
- "{anti_bent}": supports, agrees with, or leans toward the {anti_label} perspective
- "neutral": factual reporting without clear editorial lean, or genuinely balanced

Guidelines:
- Most political tweets have a lean — classify them as {pro_bent} or {anti_bent}, not neutral.
- Use neutral ONLY for wire-service-style factual reporting or genuinely mixed takes.
- Sarcasm, criticism, and emotional framing all indicate a lean.
- If a tweet is about this topic and has any opinion, it is NOT neutral.
- If a tweet is completely unrelated to {topic_name}, classify as neutral.

For each tweet index, return a classification.
Return a JSON array: [{{"idx": 0, "class": "{pro_bent}"}}, ...]
You MUST return exactly {min(len(tweets), 500)} entries, one for each tweet.

IMPORTANT: Return ONLY valid JSON."""

    from google import genai

    client = genai.Client(api_key=GEMINI_API_KEY)

    try:
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=prompt,
            config={
                "response_mime_type": "application/json",
                "temperature": 0.1,
            },
        )
        text = (response.text or "").strip()
        classifications = json.loads(text)
        if not isinstance(classifications, list):
            classifications = []
    except Exception as e:
        print(f"[QuickClassify] Gemini error: {e}")
        return _empty_result()

    # Aggregate results
    result = {
        "pro_count": 0, "anti_count": 0, "neutral_count": 0,
        "pro_engagement": 0, "anti_engagement": 0,
        "pro_views": 0, "anti_views": 0,
        "total": 0,
        "sample_pro": [], "sample_anti": [],
    }

    class_by_idx = {c.get("idx", -1): c.get("class", "") for c in classifications}

    for i, tweet in enumerate(tweets[:500]):
        cls = class_by_idx.get(i, "neutral")
        if cls == pro_bent:
            result["pro_count"] += 1
            result["pro_engagement"] += tweet["engagement"]
            result["pro_views"] += tweet["views"]
            result["total"] += 1
            if len(result["sample_pro"]) < 2:
                result["sample_pro"].append(tweet["text"][:120])
        elif cls == anti_bent:
            result["anti_count"] += 1
            result["anti_engagement"] += tweet["engagement"]
            result["anti_views"] += tweet["views"]
            result["total"] += 1
            if len(result["sample_anti"]) < 2:
                result["sample_anti"].append(tweet["text"][:120])
        else:
            result["neutral_count"] += 1
            result["total"] += 1

    return result


def _empty_result() -> dict:
    return {
        "pro_count": 0, "anti_count": 0, "neutral_count": 0,
        "pro_engagement": 0, "anti_engagement": 0,
        "pro_views": 0, "anti_views": 0,
        "total": 0,
        "sample_pro": [], "sample_anti": [],
    }


def quick_analyze_topic(topic: dict) -> dict:
    """Full quick analysis: fetch tweets + classify. Returns enriched topic dict."""
    name = topic["name"]
    slug = topic["slug"]
    search_query = topic["search_query"]
    pro_label = topic["pro_label"]
    anti_label = topic["anti_label"]

    print(f"[QuickClassify] Analyzing '{name}'...")
    t0 = time.time()

    tweets = fetch_tweets_for_topic(search_query)
    if not tweets:
        print(f"[QuickClassify] No tweets found for '{name}'")
        return {**topic, "stats": _empty_result()}

    stats = classify_tweets_batch(tweets, pro_label, anti_label, name)
    elapsed = round(time.time() - t0, 1)
    print(f"[QuickClassify] '{name}': {stats['pro_count']} pro / {stats['anti_count']} anti / {stats['neutral_count']} neutral ({elapsed}s)")

    return {**topic, "stats": stats}


if __name__ == "__main__":
    """Test with a sample topic."""
    test_topic = {
        "name": "Trump Tariffs",
        "slug": "trump-tariffs",
        "search_query": "Trump tariffs",
        "pro_label": "Support Tariffs",
        "anti_label": "Oppose Tariffs",
    }
    result = quick_analyze_topic(test_topic)
    s = result["stats"]
    total = s["total"] or 1
    print(f"\n  {result['pro_label']}: {s['pro_count']} ({round(s['pro_count']/total*100)}%)")
    print(f"  {result['anti_label']}: {s['anti_count']} ({round(s['anti_count']/total*100)}%)")
    print(f"  Neutral: {s['neutral_count']}")
