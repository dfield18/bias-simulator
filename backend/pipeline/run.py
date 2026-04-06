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
    if not database_url:
        raise RuntimeError("DATABASE_URL not configured")
    conn = psycopg2.connect(
        database_url,
        connect_timeout=10,
        keepalives=1,
        keepalives_idle=30,
        keepalives_interval=10,
        keepalives_count=5,
    )
    conn.autocommit = False
    return conn


def load_topic(conn, topic_slug: str) -> dict | None:
    """Load topic from DB."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT slug, name, description, classification_prompt, intensity_prompt, "
            "pro_label, anti_label, search_query, target_language, target_country, account_rules "
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
            "account_rules": row[10] or {},
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
                  error_message: str | None = None, step_timings: dict | None = None):
    """Log a pipeline run to fetch_runs table."""
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO fetch_runs (topic_slug, tweets_fetched, tweets_new,
                tweets_classified, total_cost_usd, status, error_message, step_timings)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (topic_slug, tweets_fetched, tweets_new, tweets_classified,
             total_cost, status, error_message, Json(step_timings) if step_timings else None),
        )
    conn.commit()


MODEL_MAP = {
    "fast": "gemini-2.0-flash-lite",
    "balanced": "gemini-2.0-flash",
    "accurate": "gemini-2.5-flash",
}


def run_pipeline(topic_slug: str, hours: int = 24, max_pages: int = 25, classification_model: str = "fast"):
    """Run the full pipeline for a topic."""
    import time as _time
    pipeline_start = _time.time()
    timings: dict[str, float] = {}

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
        set_progress(topic_slug, 1, 7, "Setting up", "Loading topic configuration...")
        print("\n[1/7] Loading topic...")
        topic = load_topic(conn, topic_slug)
        if not topic:
            print(f"ERROR: Topic '{topic_slug}' not found or inactive")
            return

        print(f"  Topic: {topic['name']}")
        print(f"  Labels: {topic['anti_label']} / {topic['pro_label']}")

        # 2. Fetch tweets
        set_progress(topic_slug, 2, 7, "Collecting posts from X", "Searching for relevant posts...")
        print("\n[2/7] Fetching tweets...")
        t_fetch_start = _time.time()
        search_query = topic.get("search_query") or topic["name"]
        lang = topic.get("target_language") or "en"
        raw_tweets = fetch_tweets(topic_slug, search_query, hours=hours, max_pages=max_pages, lang=lang)
        tweets_fetched = len(raw_tweets)
        timings["fetch"] = round(_time.time() - t_fetch_start, 1)

        # 3. Parse and upsert tweets
        set_progress(topic_slug, 3, 7, "Processing collected posts", "Saving posts to database...")
        print("\n[3/7] Saving tweets to database...")
        parsed_tweets = [parse_tweet(t, topic_slug) for t in raw_tweets]
        tweets_new = upsert_tweets(conn, parsed_tweets)
        print(f"  Saved {tweets_new} new tweets ({tweets_fetched - tweets_new} duplicates)")

        # 4. Classify
        print("\n[4/7] Classifying tweets...")

        # Inject audience relevance into classification prompt if target_country is set
        class_prompt = topic["classification_prompt"]
        target_country = topic.get("target_country")
        target_lang = topic.get("target_language") or "en"

        # Language filter: exclude tweets not primarily in the target language
        lang_names = {"en": "English", "es": "Spanish", "fr": "French", "de": "German", "pt": "Portuguese",
                      "ar": "Arabic", "he": "Hebrew", "ja": "Japanese", "ko": "Korean", "zh": "Chinese",
                      "hi": "Hindi", "ru": "Russian", "it": "Italian"}
        lang_name = lang_names.get(target_lang, "English")
        lang_instruction = (
            f"\n\nLANGUAGE FILTER: The target audience reads {lang_name}. "
            f"For about_subject, set it to FALSE if the tweet is primarily written in a different language, "
            f"even if it contains a few {lang_name} words. Bilingual tweets that are mostly in another language "
            f"should be set to FALSE. Tweets that are fully or predominantly in {lang_name} should not be affected by this filter."
        )
        class_prompt = class_prompt + lang_instruction

        if target_country:
            audience_instruction = (
                f"\n\nAUDIENCE FILTER: The target audience is people in {target_country} who are interested in this topic. "
                f"For about_subject, set it to FALSE if the tweet is about a hyper-local event in another country that "
                f"someone in {target_country} following this topic would never see in their feed. "
                f"However, set it to TRUE for international news, viral content, or anything that would plausibly "
                f"appear in the feed of someone in {target_country} who follows this topic — even if it originates from another country."
            )
            class_prompt = class_prompt + audience_instruction

        # Skip already-classified tweets — only classify new ones
        existing_ids = set()
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id_str FROM classifications WHERE id_str IN %s",
                (tuple(t["id_str"] for t in parsed_tweets) or ("__none__",),)
            )
            existing_ids = {row[0] for row in cur.fetchall()}

        tweets_to_classify = [t for t in parsed_tweets if t["id_str"] not in existing_ids]
        print(f"  Skipping {len(existing_ids)} already-classified tweets, classifying {len(tweets_to_classify)} new ones")

        # Apply account rules: auto-classify tweets from ruled accounts
        account_rules = {k.lower(): v for k, v in (topic.get("account_rules") or {}).items()}
        rule_classifications = []
        remaining_tweets = []
        for t in tweets_to_classify:
            screen = (t.get("screen_name") or "").lower()
            if screen in account_rules:
                rule_classifications.append({
                    "id_str": t["id_str"],
                    "about_subject": True,
                    "political_bent": account_rules[screen],
                    "author_lean": account_rules[screen],
                    "classification_basis": f"Account rule: always {account_rules[screen]}",
                    "confidence": 1.0,
                    "agreement": "rule",
                    "classification_method": "account-rule",
                    "votes": "",
                    "full_text": t.get("full_text", ""),
                    "screen_name": screen,
                })
            else:
                remaining_tweets.append(t)
        if rule_classifications:
            print(f"  Auto-classified {len(rule_classifications)} tweets via account rules")
        tweets_to_classify = remaining_tweets

        set_progress(topic_slug, 4, 7, "Analyzing posts with AI",
                     "Classifying posts — each is analyzed by AI, "
                     "with uncertain ones verified by multiple models for accuracy. "
                     "This is the longest step." if tweets_to_classify else "All posts already classified.")

        # Determine pro/anti bent values from labels
        t_classify_start = _time.time()
        pro_bent = topic["pro_label"].lower().replace(" ", "-")
        anti_bent = topic["anti_label"].lower().replace(" ", "-")
        tweet_lookup = {t["id_str"]: t for t in parsed_tweets}

        if tweets_to_classify:
            # COMBINED APPROACH: classification + intensity in one prompt
            import concurrent.futures
            import threading

            classifications = []
            intensity_results = []
            cost_class = 0.0
            cost_intensity = 0.0
            results_lock = threading.Lock()

            batch_size = 40
            max_parallel = 12
            batches = [tweets_to_classify[i:i + batch_size] for i in range(0, len(tweets_to_classify), batch_size)]

            def classify_batch(batch):
                """Classify + score intensity in a single API call."""
                from pipeline.classify import _build_classification_prompt, _call_gemini, _parse_classifications, _escalate_classification
                nonlocal cost_class

                batch_cost = 0.0
                batch_results = []
                batch_intensity = []
                prompt = _build_classification_prompt(batch, class_prompt)

                gemini_model = MODEL_MAP.get(classification_model, "gemini-2.0-flash-lite")
                try:
                    response_text, cost = _call_gemini(prompt, model=gemini_model)
                    batch_cost += cost
                    parsed = _parse_classifications(response_text)
                except Exception:
                    parsed = []

                parsed_by_id = {str(c.get("id_str", "")): c for c in parsed}

                for tweet in batch:
                    tid = tweet["id_str"]
                    classification = parsed_by_id.get(tid)
                    if not classification:
                        classification = {"id_str": tid, "about_subject": False, "political_bent": "error", "confidence": 0.0, "classification_method": "error-no-parse"}

                    try:
                        conf = float(classification.get("confidence", 0.0))
                    except (TypeError, ValueError):
                        conf = 0.0
                    bent = classification.get("political_bent", "")

                    if bent == "error" or conf < 0.2:
                        try:
                            escalated, esc_cost = _escalate_classification(tweet, class_prompt)
                            batch_cost += esc_cost
                            if escalated:
                                classification = escalated
                        except Exception:
                            pass

                    classification["id_str"] = tid
                    classification.setdefault("classification_method", gemini_model)
                    t = tweet_lookup.get(tid, {})
                    classification["full_text"] = t.get("full_text", "")
                    classification["screen_name"] = t.get("screen_name", "")
                    batch_results.append(classification)

                    # Extract intensity from the combined response
                    try:
                        score = int(float(classification.get("intensity_score", 0)))
                    except (TypeError, ValueError):
                        score = 0
                    if score != 0 and classification.get("about_subject"):
                        batch_intensity.append({
                            "id_str": tid,
                            "intensity_score": max(-10, min(10, score)),
                            "intensity_confidence": conf,
                            "intensity_reasoning": classification.get("classification_basis", ""),
                            "intensity_flag": "valid",
                        })

                with results_lock:
                    classifications.extend(batch_results)
                    intensity_results.extend(batch_intensity)
                    cost_class += batch_cost

                return batch_results

            set_progress(topic_slug, 4, 7, "Analyzing posts with AI",
                         "Classifying posts — each is analyzed by AI for stance and intensity in a single pass.")
            print("\n[4-5/7] Classifying + scoring intensity (combined)...")

            with concurrent.futures.ThreadPoolExecutor(max_workers=max_parallel) as executor:
                futures = [executor.submit(classify_batch, batch) for batch in batches]
                concurrent.futures.wait(futures)

            print(f"  Classified {len(classifications)} tweets with {len(intensity_results)} intensity scores | Cost: ${cost_class:.4f}")
        else:
            classifications = []
            intensity_results = []
            cost_class = 0.0
            cost_intensity = 0.0

        timings["classify_and_intensity"] = round(_time.time() - t_classify_start, 1)

        # Merge account-rule classifications into the main list
        if rule_classifications:
            classifications.extend(rule_classifications)

        # Write classifications + intensity to DB
        set_progress(topic_slug, 5, 7, "Saving results", "Writing classifications to database...")
        upsert_classifications(conn, classifications, intensity_results, cost_class, cost_intensity)

        # Cache author_type for cross-topic reuse
        try:
            with conn.cursor() as cur:
                for c in classifications:
                    screen = (c.get("screen_name") or "").lower().strip()
                    atype = c.get("author_type", "")
                    if screen and atype in ("politician", "mainstream_news", "independent_news", "partisan_news", "activist", "general"):
                        cur.execute(
                            """INSERT INTO account_types (screen_name, author_type)
                               VALUES (%s, %s) ON CONFLICT (screen_name) DO NOTHING""",
                            (screen, atype),
                        )
            conn.commit()
        except Exception as e:
            print(f"  Author type cache error (non-fatal): {e}")

        # Backfill author_type for uncached accounts in this topic
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """SELECT DISTINCT t.screen_name, t.author_bio
                       FROM tweets t
                       JOIN classifications c ON t.id_str = c.id_str
                       LEFT JOIN account_types a ON LOWER(t.screen_name) = a.screen_name
                       WHERE t.topic_slug = %s AND c.about_subject = TRUE
                         AND a.screen_name IS NULL AND t.screen_name IS NOT NULL
                       LIMIT 200""",
                    (topic_slug,),
                )
                uncached = cur.fetchall()

            if uncached:
                print(f"  Backfilling author_type for {len(uncached)} uncached accounts...")
                from pipeline.classify import _call_gemini
                # Batch classify via a single LLM call
                accounts_text = "\n".join(
                    f"- @{row[0]}: {(row[1] or 'no bio')[:150]}"
                    for row in uncached
                )
                prompt = f"""Classify each Twitter account into exactly one category based on their bio:
- "politician" = elected officials, candidates, government accounts
- "mainstream_news" = major established outlets and their journalists (NYT, CNN, BBC, Reuters, AP, Fox News, etc.)
- "independent_news" = smaller outlets, freelance journalists, substacks, podcasts
- "partisan_news" = explicitly ideological media (Daily Wire, Breitbart, Jacobin, Mother Jones, etc.)
- "activist" = advocacy orgs, nonprofits, movement accounts, PACs, think tanks, political commentators
- "general" = everyone else (ordinary users, businesses, athletes, entertainers)

Accounts:
{accounts_text}

Return a JSON array of objects: [{{"screen_name": "...", "author_type": "..."}}]"""

                try:
                    resp_text, _ = _call_gemini(prompt, model="gemini-2.0-flash")
                    import json
                    text = resp_text.strip()
                    if text.startswith("```"):
                        text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
                    results = json.loads(text)
                    if not isinstance(results, list):
                        results = []

                    valid_types = {"politician", "mainstream_news", "independent_news", "partisan_news", "activist", "general"}
                    with conn.cursor() as cur:
                        for r in results:
                            sn = (r.get("screen_name") or "").lower().strip().lstrip("@")
                            at = r.get("author_type", "")
                            if sn and at in valid_types:
                                cur.execute(
                                    """INSERT INTO account_types (screen_name, author_type)
                                       VALUES (%s, %s) ON CONFLICT (screen_name) DO NOTHING""",
                                    (sn, at),
                                )
                    conn.commit()
                    print(f"  Backfilled {len(results)} account types")
                except Exception as e:
                    print(f"  Backfill LLM error (non-fatal): {e}")
        except Exception as e:
            print(f"  Backfill query error (non-fatal): {e}")

        total_cost = cost_class + cost_intensity

        # Log run — moved after framing/summaries so timings are complete

        # Early cache invalidation — feed is viewable now even before framing/summaries finish
        from cache import invalidate as invalidate_cache
        invalidate_cache(topic_slug)

        # Classify narrative frames + generate summaries IN PARALLEL
        set_progress(topic_slug, 6, 7, "Analyzing narratives and writing summaries",
                     "Classifying arguments, emotions, and generating AI analysis simultaneously...")
        print("\n[6-7/7] Framing + summaries (parallel)...")
        t_framing_start = _time.time()

        import concurrent.futures as cf

        framing_time = [0.0]
        summary_time = [0.0]

        def run_framing():
            t0 = _time.time()
            try:
                frame_conn = get_sync_connection()
                from pipeline.framing import classify_frames
                classify_frames(frame_conn, topic_slug)
                frame_conn.close()
            except Exception as e:
                print(f"  Frame classification failed: {e}")
            framing_time[0] = round(_time.time() - t0, 1)

        def run_summaries():
            t0 = _time.time()
            try:
                sum_conn = get_sync_connection()
                from pipeline.summarize import generate_summaries
                generate_summaries(sum_conn, topic_slug)
                sum_conn.close()
            except Exception as e:
                print(f"  Summary generation failed: {e}")
            summary_time[0] = round(_time.time() - t0, 1)

        with cf.ThreadPoolExecutor(max_workers=2) as executor:
            executor.submit(run_framing)
            executor.submit(run_summaries)
            executor.shutdown(wait=True)

        timings["framing"] = framing_time[0]
        timings["summaries"] = summary_time[0]
        timings["framing_and_summaries"] = round(_time.time() - t_framing_start, 1)
        timings["total"] = round(_time.time() - pipeline_start, 1)

        # Summary — invalidate backend cache for this topic + demo landing
        from cache import invalidate as invalidate_cache
        invalidate_cache(topic_slug)
        invalidate_cache("demo:")
        # Log run with complete timings
        log_fetch_run(conn, topic_slug, tweets_fetched, tweets_new,
                      len(classifications), total_cost, "success", step_timings=timings)

        set_progress(topic_slug, 7, 7, "Your dashboard is ready", "Analysis complete — your results are ready to explore.")
        _pipeline_progress[topic_slug]["running"] = False
        print(f"\n{'='*60}")
        print(f"Fetched: {tweets_fetched} tweets | New: {tweets_new} | "
              f"Classified: {len(classifications)} | Cost: ${total_cost:.4f} | Time: {timings.get('total', 0)}s")
        print(f"Timings: {timings}")
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
