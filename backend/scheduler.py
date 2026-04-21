"""Background scheduler for automatic topic refreshes."""

import os
import time
import threading
from datetime import datetime, timezone

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


def _scheduler_loop():
    """Background loop that refreshes featured topics on a schedule."""
    time.sleep(60)
    print(f"[Scheduler] Started — will refresh featured topics every {REFRESH_INTERVAL_HOURS}h")

    while True:
        now = datetime.now(timezone.utc)
        print(f"[Scheduler] Starting refresh cycle at {now.isoformat()}")
        try:
            results = refresh_featured_topics()
            success = sum(1 for r in results if r["status"] == "success")
            failed = sum(1 for r in results if r["status"] == "error")
            print(f"[Scheduler] Cycle complete: {success} success, {failed} failed")
        except Exception as e:
            print(f"[Scheduler] Cycle error: {e}")

        time.sleep(REFRESH_INTERVAL_HOURS * 3600)


def start_scheduler():
    """Start the background scheduler thread (daemon so it dies with the process)."""
    t = threading.Thread(target=_scheduler_loop, daemon=True, name="topic-scheduler")
    t.start()
    print(f"[Scheduler] Background thread started (interval: {REFRESH_INTERVAL_HOURS}h)")
