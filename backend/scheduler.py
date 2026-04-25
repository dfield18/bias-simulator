"""Background scheduler for automatic topic refreshes and daily posts."""

import os
import time
import threading
from datetime import datetime, timezone, timedelta

CRON_SECRET = os.getenv("CRON_SECRET", "")

# Track which slots have been posted today to prevent duplicates on restart
_posted_today: dict[str, set[int]] = {}  # {"2026-04-25": {0, 1, 2}}


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


REFRESH_HOUR_UTC = int(os.getenv("REFRESH_HOUR_UTC", "12"))  # 12 UTC = 8am EDT

# Post schedule: 9am ET (13 UTC), 12pm ET (16 UTC), 5pm ET (21 UTC)
POST_HOURS_UTC = [13, 16, 21]


def _seconds_until(hour_utc: int) -> float:
    """Seconds until the next occurrence of a given UTC hour."""
    now = datetime.now(timezone.utc)
    target = now.replace(hour=hour_utc, minute=0, second=0, microsecond=0)
    if now >= target:
        target += timedelta(days=1)
    return (target - now).total_seconds()


def _post_slot(slot: int):
    """Post a tweet for a specific daily slot. Skips if already posted today."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if today not in _posted_today:
        _posted_today.clear()  # clear old days
        _posted_today[today] = set()
    if slot in _posted_today[today]:
        print(f"[Scheduler] Slot {slot} already posted today, skipping")
        return
    try:
        from promo.daily_schedule import post_daily_slot
        success = post_daily_slot(slot)
        if success:
            _posted_today[today].add(slot)
        print(f"[Scheduler] Daily post slot {slot}: {'success' if success else 'failed'}")
    except Exception as e:
        print(f"[Scheduler] Daily post slot {slot} error: {e}")


def _scheduler_loop():
    """Background loop: refreshes data at 9am ET, posts 3x daily."""
    time.sleep(60)

    print(f"[Scheduler] Started — refresh at {REFRESH_HOUR_UTC}:00 UTC, posts at {POST_HOURS_UTC} UTC")

    while True:
        # Find the next event (refresh or post)
        events = []
        # Refresh event
        events.append(("refresh", REFRESH_HOUR_UTC, _seconds_until(REFRESH_HOUR_UTC)))
        # Post events
        if os.getenv("ENABLE_PROMO_TWEETS", "false").lower() == "true":
            for i, hour in enumerate(POST_HOURS_UTC):
                events.append((f"post_{i}", hour, _seconds_until(hour)))

        # Sort by soonest
        events.sort(key=lambda e: e[2])
        next_event, next_hour, wait = events[0]

        print(f"[Scheduler] Next event: {next_event} at {next_hour}:00 UTC in {wait / 3600:.1f}h")
        time.sleep(wait)

        now = datetime.now(timezone.utc)

        if next_event == "refresh":
            print(f"[Scheduler] Starting refresh cycle at {now.isoformat()}")
            try:
                results = refresh_featured_topics()
                success = sum(1 for r in results if r["status"] == "success")
                failed = sum(1 for r in results if r["status"] == "error")
                print(f"[Scheduler] Cycle complete: {success} success, {failed} failed")
            except Exception as e:
                print(f"[Scheduler] Cycle error: {e}")

            # Post slot 0 right after refresh (9am post)
            if os.getenv("ENABLE_PROMO_TWEETS", "false").lower() == "true":
                _post_slot(0)

        elif next_event.startswith("post_"):
            slot = int(next_event.split("_")[1])
            if slot > 0:  # slot 0 is handled after refresh
                _post_slot(slot)

        # Small sleep to avoid re-triggering the same event
        time.sleep(120)


def start_scheduler():
    """Start the background scheduler thread (daemon so it dies with the process)."""
    t = threading.Thread(target=_scheduler_loop, daemon=True, name="topic-scheduler")
    t.start()
    print(f"[Scheduler] Background thread started (interval: {REFRESH_INTERVAL_HOURS}h)")
