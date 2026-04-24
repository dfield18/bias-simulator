"""Background scheduler for automatic topic refreshes."""

import os
import time
import threading
from datetime import datetime, timezone, timedelta

REFRESH_INTERVAL_HOURS = int(os.getenv("REFRESH_INTERVAL_HOURS", "24"))
CRON_SECRET = os.getenv("CRON_SECRET", "")


def refresh_featured_topics():
    """Run the pipeline for all featured topics sequentially."""
    from pipeline.run import run_pipeline, get_sync_connection

    try:
        conn = get_sync_connection()
        cur = conn.cursor()
        cur.execute("SELECT slug FROM topics WHERE featured = TRUE AND is_active = TRUE ORDER BY slug")
        slugs = [r[0] for r in cur.fetchall()]
        conn.close()
    except Exception as e:
        print(f"[Scheduler] Failed to load featured topics: {e}")
        return []

    results = []
    for slug in slugs:
        print(f"[Scheduler] Refreshing {slug}...")
        try:
            run_pipeline(slug, hours=48)
            results.append({"slug": slug, "status": "success"})
            print(f"[Scheduler] {slug} done")
        except Exception as e:
            results.append({"slug": slug, "status": "error", "error": str(e)[:200]})
            print(f"[Scheduler] {slug} failed: {e}")

    return results


SCHEDULE_HOUR_UTC = int(os.getenv("SCHEDULE_HOUR_UTC", "13"))  # 13 UTC = 9am EDT


def _seconds_until_next_run() -> float:
    """Seconds until the next scheduled run time."""
    now = datetime.now(timezone.utc)
    target = now.replace(hour=SCHEDULE_HOUR_UTC, minute=0, second=0, microsecond=0)
    if now >= target:
        target += timedelta(days=1)
    wait = (target - now).total_seconds()
    return wait


def _scheduler_loop():
    """Background loop that refreshes featured topics daily at a fixed time."""
    time.sleep(60)
    wait = _seconds_until_next_run()
    target_hr = SCHEDULE_HOUR_UTC
    print(f"[Scheduler] Started — daily refresh at {target_hr}:00 UTC (9am ET). Next run in {wait / 3600:.1f}h")
    time.sleep(wait)

    while True:
        now = datetime.now(timezone.utc)
        print(f"[Scheduler] Starting refresh cycle at {now.isoformat()}")
        try:
            results = refresh_featured_topics()
            success = sum(1 for r in results if r["status"] == "success")
            failed = sum(1 for r in results if r["status"] == "error")
            print(f"[Scheduler] Cycle complete: {success} success, {failed} failed")

            # Post a promotional tweet for a random successful topic
            if os.getenv("ENABLE_PROMO_TWEETS", "false").lower() == "true":
                successful_slugs = [r["slug"] for r in results if r["status"] == "success"]
                if successful_slugs:
                    try:
                        import random
                        from promo.tweet_generator import get_topic_stats, generate_tweet, post_tweet
                        slug = random.choice(successful_slugs)
                        stats = get_topic_stats(slug)
                        if stats:
                            tweet = generate_tweet(stats)
                            print(f"[Scheduler] Posting promo tweet for {slug}: {tweet[:80]}...")
                            post_tweet(tweet)
                    except Exception as e:
                        print(f"[Scheduler] Promo tweet error (non-fatal): {e}")
        except Exception as e:
            print(f"[Scheduler] Cycle error: {e}")

        wait = _seconds_until_next_run()
        print(f"[Scheduler] Next run in {wait / 3600:.1f}h")
        time.sleep(wait)


def start_scheduler():
    """Start the background scheduler thread (daemon so it dies with the process)."""
    t = threading.Thread(target=_scheduler_loop, daemon=True, name="topic-scheduler")
    t.start()
    print(f"[Scheduler] Background thread started (interval: {REFRESH_INTERVAL_HOURS}h)")
