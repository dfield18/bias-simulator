"""
Pipeline runner: fetches tweets, classifies, scores intensity, writes to DB.

Usage:
    python -m pipeline.run --topic iran-conflict
    python -m pipeline.run --topic iran-conflict --hours 48
"""

import argparse
import sys
import os
from datetime import datetime, timezone

# Add backend dir to path so imports work when run as module
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

import psycopg2
from psycopg2.extras import Json, execute_values

from pipeline.fetch import fetch_tweets, parse_tweet
from pipeline.classify import classify_tweets
from pipeline.intensity import score_intensity

# In-memory pipeline progress tracking
_pipeline_progress: dict[str, dict] = {}

def set_progress(topic_slug: str, step: int, total_steps: int, label: str, detail: str = ""):
    _pipeline_progress[topic_slug] = {
        "step": step,
        "total_steps": total_steps,
        "label": label,
        "detail": detail,
        "pct": round(step / total_steps * 100),
        "running": step < total_steps,
    }

def get_progress(topic_slug: str) -> dict | None:
    return _pipeline_progress.get(topic_slug)


def get_sync_connection():
    """Get a synchronous psycopg2 connection for pipeline use."""
    database_url = os.getenv("DATABASE_URL", "")
    conn = psycopg2.connect(database_url, keepalives=1, keepalives_idle=30, keepalives_interval=10, keepalives_count=5)
    conn.autocommit = False
    return conn


def load_topic(conn, topic_slug: str) -> dict | None:
    """Load topic from DB."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT slug, name, description, classification_prompt, intensity_prompt, "
            "pro_label, anti_label, search_query, target_language, target_country "
            "FROM topics WHERE slug = %s AND is_active = TRUE",
            (topic_slug,),
        )
        row = cur.fetchone()
        if not row:
            return None
        return {
            "slug": row[0],
            "name": row[1],
            "description": row[2],
            "classification_prompt": row[3],
            "intensity_prompt": row[4],
            "pro_label": row[5],
            "anti_label": row[6],
            "search_query": row[7],
            "target_language": row[8] or "en",
            "target_country": row[9],
        }


def upsert_tweets(conn, parsed_tweets: list[dict]) -> int:
    """Insert tweets, skip on conflict. Returns count of new tweets."""
    if not parsed_tweets:
        return 0

    new_count = 0
    with conn.cursor() as cur:
        for t in parsed_tweets:
            cur.execute(
                """
                INSERT INTO tweets (id_str, topic_slug, created_at, screen_name, author_name,
                    author_bio, author_followers, full_text, likes, retweets, replies, quotes,
                    views, url, raw_json)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (id_str) DO NOTHING
                """,
                (
                    t["id_str"], t["topic_slug"], t["created_at"], t["screen_name"],
                    t["author_name"], t["author_bio"], t["author_followers"],
                    t["full_text"], t["likes"], t["retweets"], t["replies"],
                    t["quotes"], t["views"], t["url"], Json(t["raw_json"]),
                ),
            )
            if cur.rowcount > 0:
                new_count += 1
    conn.commit()
    return new_count


def upsert_classifications(conn, classifications: list[dict], intensity_results: list[dict], cost_class: float, cost_intensity: float):
    """Upsert classifications with intensity scores."""
    if not classifications:
        return

    # Build intensity lookup
    intensity_by_id = {r["id_str"]: r for r in intensity_results}

    def safe_float(val, default=0.0):
        """Safely convert a value to float (LLM sometimes returns strings like 'high')."""
        if val is None:
            return default
        try:
            return float(val)
        except (TypeError, ValueError):
            return default

    def safe_bool(val, default=False):
        """Safely convert a value to bool (LLM sometimes returns strings like 'Israeli-Palestinian conflict')."""
        if isinstance(val, bool):
            return val
        if isinstance(val, str):
            return val.lower() not in ("false", "no", "0", "", "none", "n/a")
        if val is None:
            return default
        return bool(val)

    def safe_str(val, default=""):
        """Safely convert any value to string."""
        if val is None:
            return default
        if isinstance(val, (dict, list)):
            import json
            return json.dumps(val)
        return str(val)

    def safe_int(val, default=None):
        """Safely convert a value to int or None."""
        if val is None:
            return default
        try:
            return int(float(val))
        except (TypeError, ValueError):
            return default

    with conn.cursor() as cur:
        for c in classifications:
            tid = c["id_str"]
            intensity = intensity_by_id.get(tid, {})

            cur.execute(
                """
                INSERT INTO classifications (
                    id_str, about_subject, political_bent, author_lean,
                    classification_basis, confidence, agreement,
                    classification_method, votes,
                    intensity_score, intensity_confidence,
                    intensity_reasoning, intensity_flag,
                    classification_cost_usd, intensity_cost_usd
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (id_str) DO UPDATE SET
                    about_subject = EXCLUDED.about_subject,
                    political_bent = EXCLUDED.political_bent,
                    author_lean = EXCLUDED.author_lean,
                    classification_basis = EXCLUDED.classification_basis,
                    confidence = EXCLUDED.confidence,
                    agreement = EXCLUDED.agreement,
                    classification_method = EXCLUDED.classification_method,
                    votes = EXCLUDED.votes,
                    intensity_score = EXCLUDED.intensity_score,
                    intensity_confidence = EXCLUDED.intensity_confidence,
                    intensity_reasoning = EXCLUDED.intensity_reasoning,
                    intensity_flag = EXCLUDED.intensity_flag,
                    classification_cost_usd = EXCLUDED.classification_cost_usd,
                    intensity_cost_usd = EXCLUDED.intensity_cost_usd
                """,
                (
                    safe_str(tid),
                    safe_bool(c.get("about_subject", False)),
                    safe_str(c.get("political_bent", "error")),
                    safe_str(c.get("author_lean", "")),
                    safe_str(c.get("classification_basis", "")),
                    safe_float(c.get("confidence", 0.0)),
                    safe_str(c.get("agreement", "")),
                    safe_str(c.get("classification_method", "")),
                    safe_str(c.get("votes", "")),
                    safe_int(intensity.get("intensity_score")),
                    safe_float(intensity.get("intensity_confidence", 0.0)),
                    safe_str(intensity.get("intensity_reasoning", "")),
                    safe_str(intensity.get("intensity_flag", "")),
                    safe_float(cost_class / max(len(classifications), 1)),
                    safe_float(cost_intensity / max(len(intensity_results), 1) if intensity else 0.0),
                ),
            )
    conn.commit()


def log_fetch_run(conn, topic_slug: str, tweets_fetched: int, tweets_new: int,
                  tweets_classified: int, total_cost: float, status: str,
                  error_message: str | None = None):
    """Log a pipeline run to fetch_runs table."""
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO fetch_runs (topic_slug, tweets_fetched, tweets_new,
                tweets_classified, total_cost_usd, status, error_message)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (topic_slug, tweets_fetched, tweets_new, tweets_classified,
             total_cost, status, error_message),
        )
    conn.commit()


def run_pipeline(topic_slug: str, hours: int = 24, max_pages: int = 25):
    """Run the full pipeline for a topic."""
    print(f"\n{'='*60}")
    print(f"Pipeline: {topic_slug} | Hours: {hours}")
    print(f"{'='*60}")

    try:
        conn = get_sync_connection()
    except Exception as e:
        print(f"ERROR: Could not connect to database: {e}")
        return

    try:
        # 1. Load topic
        set_progress(topic_slug, 1, 7, "Loading topic")
        print("\n[1/7] Loading topic...")
        topic = load_topic(conn, topic_slug)
        if not topic:
            print(f"ERROR: Topic '{topic_slug}' not found or inactive")
            return

        print(f"  Topic: {topic['name']}")
        print(f"  Labels: {topic['anti_label']} / {topic['pro_label']}")

        # 2. Fetch tweets
        set_progress(topic_slug, 2, 7, "Fetching tweets", "Querying Twitter API...")
        print("\n[2/7] Fetching tweets...")
        # Use topic's search_query if set, otherwise derive from name
        search_query = topic.get("search_query") or topic["name"]
        lang = topic.get("target_language") or "en"
        raw_tweets = fetch_tweets(topic_slug, search_query, hours=hours, max_pages=max_pages, lang=lang)
        tweets_fetched = len(raw_tweets)

        # 3. Parse and upsert tweets
        set_progress(topic_slug, 3, 7, "Saving tweets", f"{tweets_fetched} tweets fetched")
        print("\n[3/7] Saving tweets to database...")
        parsed_tweets = [parse_tweet(t, topic_slug) for t in raw_tweets]
        tweets_new = upsert_tweets(conn, parsed_tweets)
        print(f"  Saved {tweets_new} new tweets ({tweets_fetched - tweets_new} duplicates)")

        # 4. Classify
        set_progress(topic_slug, 4, 7, "Classifying tweets", f"{tweets_new} new, classifying with AI...")
        print("\n[4/7] Classifying tweets...")

        # Inject audience relevance into classification prompt if target_country is set
        class_prompt = topic["classification_prompt"]
        target_country = topic.get("target_country")
        if target_country:
            audience_instruction = (
                f"\n\nAUDIENCE FILTER: The target audience is people in {target_country} who are interested in this topic. "
                f"For about_subject, set it to FALSE if the tweet is about a hyper-local event in another country that "
                f"someone in {target_country} following this topic would never see in their feed. "
                f"However, set it to TRUE for international news, viral content, or anything that would plausibly "
                f"appear in the feed of someone in {target_country} who follows this topic — even if it originates from another country."
            )
            class_prompt = class_prompt + audience_instruction

        classifications, cost_class = classify_tweets(
            parsed_tweets, class_prompt
        )

        # Determine pro/anti bent values from labels
        pro_bent = topic["pro_label"].lower().replace(" ", "-")
        anti_bent = topic["anti_label"].lower().replace(" ", "-")

        # 5. Score intensity — merge tweet text into classifications
        set_progress(topic_slug, 5, 7, "Scoring intensity", f"{len(classifications)} classified, scoring rhetoric...")
        print("\n[5/7] Scoring intensity...")
        tweet_lookup = {t["id_str"]: t for t in parsed_tweets}
        for c in classifications:
            t = tweet_lookup.get(c.get("id_str", ""), {})
            c["full_text"] = t.get("full_text", "")
            c["screen_name"] = t.get("screen_name", "")

        intensity_results, cost_intensity = score_intensity(
            classifications,
            topic["intensity_prompt"],
            topic["pro_label"],
            topic["anti_label"],
            pro_bent,
            anti_bent,
        )

        # Write classifications + intensity to DB
        upsert_classifications(conn, classifications, intensity_results, cost_class, cost_intensity)

        total_cost = cost_class + cost_intensity

        # Log run
        log_fetch_run(conn, topic_slug, tweets_fetched, tweets_new,
                      len(classifications), total_cost, "success")

        # Classify narrative frames and emotions
        set_progress(topic_slug, 6, 7, "Classifying frames", "Assigning narrative frames and emotions...")
        print("\n[6/7] Classifying narrative frames...")
        try:
            from pipeline.framing import classify_frames
            classify_frames(conn, topic_slug)
        except Exception as e:
            print(f"  Frame classification failed: {e}")

        # Generate AI summaries
        set_progress(topic_slug, 7, 7, "Generating summaries", "Writing AI narrative summaries...")
        print("\n[7/7] Generating AI summaries...")
        try:
            from pipeline.summarize import generate_summaries
            generate_summaries(conn, topic_slug)
        except Exception as e:
            print(f"  Summary generation failed: {e}")

        # Summary
        set_progress(topic_slug, 7, 7, "Complete", f"{tweets_new} new tweets, {len(classifications)} classified")
        _pipeline_progress[topic_slug]["running"] = False
        print(f"\n{'='*60}")
        print(f"Fetched: {tweets_fetched} tweets | New: {tweets_new} | "
              f"Classified: {len(classifications)} | Cost: ${total_cost:.4f}")
        print(f"{'='*60}\n")

    except Exception as e:
        set_progress(topic_slug, 0, 7, "Error", str(e)[:100])
        _pipeline_progress[topic_slug]["running"] = False
        print(f"\nERROR: {e}")
        try:
            log_fetch_run(conn, topic_slug, 0, 0, 0, 0.0, "error", str(e))
        except Exception:
            pass
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run tweet classification pipeline")
    parser.add_argument("--topic", required=True, help="Topic slug (e.g. iran-conflict)")
    parser.add_argument("--hours", type=int, default=24, help="Hours to look back (default: 24)")
    args = parser.parse_args()

    run_pipeline(args.topic, hours=args.hours)
