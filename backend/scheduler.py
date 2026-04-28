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


def _run_refresh_in_thread():
    """Run trending refresh in a separate thread so it doesn't block posts."""
    try:
        from routers.pulse import refresh_trending_cache
        refresh_trending_cache()
        print("[Scheduler] Trending refresh complete")
    except Exception as e:
        print(f"[Scheduler] Trending refresh error: {e}")


def _scheduler_loop():
    """Background loop: refreshes trending at 8am ET, posts 3x daily."""
    time.sleep(60)

    print(f"[Scheduler] Started — refresh at {REFRESH_HOUR_UTC}:00 UTC, posts at {POST_HOURS_UTC} UTC")

    while True:
        now = datetime.now(timezone.utc)
        current_hour = now.hour

        # Build list of ALL events for today/tomorrow
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

        # Cap wait to 1 hour max to prevent long sleeps from missing events
        actual_wait = min(wait, 3600)

        if actual_wait > 60:
            print(f"[Scheduler] Next event: {next_event} at {next_hour}:00 UTC in {wait / 3600:.1f}h")

        time.sleep(actual_wait)

        # Re-check what time it is after sleeping
        now = datetime.now(timezone.utc)

        # Check if we're within 5 minutes of any event
        for event_name, event_hour, _ in events:
            target = now.replace(hour=event_hour, minute=0, second=0, microsecond=0)
            # Check if we're within a 10-minute window of this event
            diff = abs((now - target).total_seconds())
            if diff > 600:
                # Also check yesterday's target (for events near midnight)
                target2 = target - timedelta(days=1)
                diff = abs((now - target2).total_seconds())
            if diff > 600:
                continue

            if event_name == "refresh":
                print(f"[Scheduler] Starting trending-only refresh at {now.isoformat()}")
                # Run in separate thread so it doesn't block post events
                t = threading.Thread(target=_run_refresh_in_thread, daemon=True)
                t.start()

            elif event_name.startswith("post_"):
                slot = int(event_name.split("_")[1])
                if os.getenv("ENABLE_PROMO_TWEETS", "false").lower() == "true":
                    _post_slot(slot)

            # Only handle one event per loop iteration
            break

        # Small sleep to avoid tight loop
        time.sleep(120)


def start_scheduler():
    """Start the background scheduler thread (daemon so it dies with the process)."""
    t = threading.Thread(target=_scheduler_loop, daemon=True, name="topic-scheduler")
    t.start()
    print(f"[Scheduler] Background thread started (refresh at {REFRESH_HOUR_UTC}:00 UTC, posts at {POST_HOURS_UTC} UTC)")
