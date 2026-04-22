"""
Narrative frame and emotion classification for tweets.
Frames and emotions are dynamic per topic, stored in the topic's custom_frames
and custom_emotions JSONB columns.
"""

import os
import json
import time
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

# Default fallback taxonomy — used when a topic has no custom frames/emotions
FRAME_LABELS = {
    "security-crime": "Security / Crime",
    "humanitarian-compassion": "Humanitarian / Compassion",
    "economic-cost": "Economic Cost",
    "economic-contribution": "Economic Contribution",
    "rule-of-law": "Rule of Law / Legality",
    "cultural-identity": "Cultural Identity / Cohesion",
    "political-blame": "Political Blame / Institutional Failure",
    "rights-fairness": "Rights / Fairness / Dignity",
    "military-defense": "Military / Defense",
    "diplomacy-peace": "Diplomacy / Peace",
}

EMOTION_LABELS = {
    "fear-threat": "Fear / Threat",
    "outrage-anger": "Outrage / Anger",
    "empathy-compassion": "Empathy / Compassion",
    "sarcasm-mockery": "Sarcasm / Mockery",
    "urgency-alarm": "Urgency / Alarm",
    "pragmatic-policy": "Pragmatic / Policy",
    "moral-condemnation": "Moral Condemnation",
    "hope-optimism": "Hope / Optimism",
}


def get_topic_labels(conn, topic_slug: str) -> tuple[dict[str, str], dict[str, str]]:
    """Load frame and emotion labels from the topic's custom config.
    Falls back to defaults if the topic has no custom frames/emotions.
    Returns (frame_labels, emotion_labels) dicts mapping key -> display label.
    """
    cur = conn.cursor()
    cur.execute(
        "SELECT custom_frames, custom_emotions FROM topics WHERE slug = %s",
        (topic_slug,),
    )
    row = cur.fetchone()
    if not row:
        return dict(FRAME_LABELS), dict(EMOTION_LABELS)

    custom_frames, custom_emotions = row

    if custom_frames and isinstance(custom_frames, list) and len(custom_frames) > 0:
        fl = {item["key"]: item["label"] for item in custom_frames}
    else:
        fl = dict(FRAME_LABELS)

    if custom_emotions and isinstance(custom_emotions, list) and len(custom_emotions) > 0:
        el = {item["key"]: item["label"] for item in custom_emotions}
    else:
        el = dict(EMOTION_LABELS)

    return fl, el


async def get_topic_labels_async(db, topic_slug: str) -> tuple[dict[str, str], dict[str, str]]:
    """Async version of get_topic_labels for use in FastAPI endpoints."""
    from sqlalchemy import text as sa_text
    result = await db.execute(
        sa_text("SELECT custom_frames, custom_emotions FROM topics WHERE slug = :slug"),
        {"slug": topic_slug},
    )
    row = result.fetchone()
    if not row:
        return dict(FRAME_LABELS), dict(EMOTION_LABELS)

    custom_frames, custom_emotions = row

    if custom_frames and isinstance(custom_frames, list) and len(custom_frames) > 0:
        fl = {item["key"]: item["label"] for item in custom_frames}
    else:
        fl = dict(FRAME_LABELS)

    if custom_emotions and isinstance(custom_emotions, list) and len(custom_emotions) > 0:
        el = {item["key"]: item["label"] for item in custom_emotions}
    else:
        el = dict(EMOTION_LABELS)

    return fl, el


_GEMINI_FLASH_RATES = {"input": 0.10, "output": 0.40}  # USD per 1M tokens


def _call_gemini(prompt: str, max_retries: int = 3) -> tuple[str, float]:
    import time as _t
    from google import genai

    client = genai.Client(api_key=GEMINI_API_KEY)
    total_cost = 0.0

    for attempt in range(max_retries):
        try:
            response = client.models.generate_content(
                model="gemini-2.0-flash",
                contents=prompt,
                config={
                    "response_mime_type": "application/json",
                    "temperature": 0.1,
                },
            )
            if response.usage_metadata:
                in_tok = response.usage_metadata.prompt_token_count or 0
                out_tok = response.usage_metadata.candidates_token_count or 0
                total_cost += (in_tok * _GEMINI_FLASH_RATES["input"] + out_tok * _GEMINI_FLASH_RATES["output"]) / 1_000_000
            return response.text or "", total_cost
        except Exception as e:
            if "429" in str(e) or "RESOURCE_EXHAUSTED" in str(e):
                wait = 2 ** attempt * 5
                print(f"  Framing rate limited (attempt {attempt + 1}/{max_retries}), waiting {wait}s...")
                _t.sleep(wait)
            else:
                raise

    return "", total_cost


def _build_framing_prompt(tweets_batch: list[dict], topic_name: str,
                          frame_labels: dict[str, str], emotion_labels: dict[str, str]) -> str:
    frames_list = "\n".join(f"  - {k}: {v}" for k, v in frame_labels.items())
    emotions_list = "\n".join(f"  - {k}: {v}" for k, v in emotion_labels.items())

    tweets_text = ""
    for i, t in enumerate(tweets_batch):
        tweets_text += f"""
--- Tweet {i + 1} ---
ID: {t['id_str']}
Author: @{t.get('screen_name', 'unknown')}
Text: {t.get('full_text', '')}
"""

    return f"""You are analyzing the narrative framing and emotional rhetoric of tweets about "{topic_name}".

For each tweet, classify:

1. **narrative_frames**: Pick 1-2 frames from this fixed list (use the exact keys):
{frames_list}

2. **emotion_mode**: Pick exactly 1 emotion from this fixed list (use the exact key):
{emotions_list}

3. **confidence**: How confident you are in the frame classification (0.0-1.0)

Rules:
- Always use the exact key strings, not the labels
- Pick the 1-2 most dominant frames. Most tweets have 1-2 clear frames.
- For emotion, pick the single most dominant emotional mode
- If a tweet is purely factual news reporting, pick the most neutral/pragmatic emotion from the list
- Consider the language, framing choices, what's emphasized, and what's omitted

Tweets:
{tweets_text}

Return a JSON array where each element has:
- id_str: the tweet ID
- narrative_frames: array of 1-2 frame keys
- emotion_mode: single emotion key
- confidence: float 0.0-1.0
"""


def classify_frames(conn, topic_slug: str) -> float:
    """Classify narrative frames and emotions for all on-topic tweets. Returns cost USD."""
    cur = conn.cursor()

    # Get topic name
    cur.execute("SELECT name FROM topics WHERE slug = %s", (topic_slug,))
    row = cur.fetchone()
    if not row:
        print(f"  Framing: Topic '{topic_slug}' not found")
        return 0.0
    topic_name = row[0]

    # Load dynamic frame/emotion labels for this topic
    frame_labels, emotion_labels = get_topic_labels(conn, topic_slug)

    # Get tweets that need framing (on-topic, pro or anti only — skip neutral/unclear)
    cur.execute(
        """
        SELECT t.id_str, t.full_text, t.screen_name
        FROM tweets t
        JOIN classifications c ON t.id_str = c.id_str
        WHERE t.topic_slug = %s AND c.about_subject = TRUE
        AND c.effective_political_bent NOT IN ('neutral', 'unclear')
        AND (c.narrative_frames IS NULL OR array_length(c.narrative_frames, 1) IS NULL)
        ORDER BY t.views DESC
        LIMIT 500
        """,
        (topic_slug,),
    )
    tweets = [
        {"id_str": r[0], "full_text": r[1], "screen_name": r[2]}
        for r in cur.fetchall()
    ]

    if not tweets:
        print("  Framing: All tweets already classified")
        return 0.0

    print(f"  Framing: Classifying {len(tweets)} tweets...")

    import concurrent.futures
    import threading

    batch_size = 50
    max_parallel = 15
    total_classified = 0
    total_cost = 0.0
    db_lock = threading.Lock()
    cost_lock = threading.Lock()

    batches = [tweets[i:i + batch_size] for i in range(0, len(tweets), batch_size)]

    def process_batch(batch):
        """Classify framing for a batch and return (updates, cost)."""
        nonlocal total_cost
        prompt = _build_framing_prompt(batch, topic_name, frame_labels, emotion_labels)
        updates = []
        try:
            response_text, batch_cost = _call_gemini(prompt)
            with cost_lock:
                total_cost += batch_cost
            text = response_text.strip()
            if text.startswith("```"):
                text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
            results = json.loads(text)
            if not isinstance(results, list):
                results = results.get("tweets", results.get("results", [results]))

            results_by_id = {str(r.get("id_str", "")): r for r in results}

            for tweet in batch:
                tid = tweet["id_str"]
                result = results_by_id.get(tid, {})

                frames = result.get("narrative_frames", [])
                frames = [f for f in frames if f in frame_labels][:2]
                emotion = result.get("emotion_mode", "")
                if emotion not in emotion_labels:
                    emotion = next(iter(emotion_labels))
                conf = result.get("confidence", 0.5)

                if frames:
                    updates.append((frames, emotion, conf, tid))
        except Exception as e:
            print(f"  Framing batch error: {e}")

        return updates

    with concurrent.futures.ThreadPoolExecutor(max_workers=max_parallel) as executor:
        futures = [executor.submit(process_batch, batch) for batch in batches]
        for future in concurrent.futures.as_completed(futures):
            updates = future.result()
            if updates:
                with db_lock:
                    for frames, emotion, conf, tid in updates:
                        cur.execute(
                            """
                            UPDATE classifications
                            SET narrative_frames = %s, emotion_mode = %s, frame_confidence = %s
                            WHERE id_str = %s
                            """,
                            (frames, emotion, conf, tid),
                        )
                        total_classified += 1

    conn.commit()
    print(f"  Framing: Classified {total_classified} tweets | Cost: ${total_cost:.4f}")
    return total_cost
