"""
Daily automated posting schedule.

Posts 3 tweets per day at different times, rotating topics and visual formats.
Each post uses a different chart type and text style to keep the feed varied.

Schedule (ET):
  9am  — Post 1: after data refresh, GIF or butterfly (highest engagement formats)
  12pm — Post 2: disconnect or side-by-side chart
  5pm  — Post 3: echo gauge or butterfly

Topics rotate by day of week across the 7 featured topics.
"""

import os
import sys
import random
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Topic rotation by day of week (0=Monday)
DAILY_TOPICS = [
    ["donald-trump", "israel", "iran-conflict"],        # Monday
    ["openai", "barack-obama", "anthropic"],            # Tuesday
    ["iran-conflict", "donald-trump", "openai"],        # Wednesday
    ["israel", "anthropic", "barack-obama"],            # Thursday
    ["donald-trump", "iran-conflict", "israel"],        # Friday
    ["openai", "donald-trump", "iran-conflict"],        # Saturday
    ["israel", "barack-obama", "openai"],               # Sunday
]

# Chart type per post slot (rotates weekly)
CHART_ROTATION = [
    # slot 0 (9am): high-engagement formats
    ["gif", "butterfly", "gif", "butterfly", "gif", "butterfly", "gif"],
    # slot 1 (12pm): data-forward formats
    ["disconnect", "side_by_side", "disconnect", "side_by_side", "disconnect", "side_by_side", "disconnect"],
    # slot 2 (5pm): narrative formats
    ["echo_gauge", "butterfly", "echo_gauge", "butterfly", "echo_gauge", "butterfly", "echo_gauge"],
]

# Text templates — some with product explainer, some without
TEMPLATES_WITH_EXPLAINER = [
    lambda s, stats: (
        f"We pull the top posts across X on any topic and use AI to classify them by political stance. "
        f"Here's how each side frames {s['subject']} right now."
    ),
    lambda s, stats: (
        f"DividedView uses AI to simulate X feeds from both sides of any topic. "
        f"Here's what the {s['subject']} conversation looks like right now."
    ),
    lambda s, stats: (
        f"We classify hundreds of real X posts by political stance using AI. "
        f"This is what each side sees about {s['subject']}."
    ),
]

TEMPLATES_WITH_INSIGHT = [
    lambda s, stats: _insight_template(s, stats),
]


def _insight_template(s, stats):
    """Generate an insight-driven tweet based on the data."""
    pro = stats["pro"]
    anti = stats["anti"]
    total = stats["total_posts"]
    pro_label = stats["pro_label"]
    anti_label = stats["anti_label"]
    subject = stats["subject"]

    pro_pct = round(pro["posts"] / total * 100) if total else 0
    anti_pct = round(anti["posts"] / total * 100) if total else 0
    dominant_label = pro_label if pro["posts"] > anti["posts"] else anti_label
    dominant_pct = max(pro_pct, anti_pct)

    eng_ratio = 0
    eng_winner = ""
    if pro["avg_eng"] > 0 and anti["avg_eng"] > 0:
        if pro["avg_eng"] > anti["avg_eng"]:
            eng_ratio = round(pro["avg_eng"] / anti["avg_eng"], 1)
            eng_winner = pro_label
        else:
            eng_ratio = round(anti["avg_eng"] / pro["avg_eng"], 1)
            eng_winner = anti_label

    templates = []

    if eng_ratio > 1.3:
        vol_winner = dominant_label
        if vol_winner != eng_winner:
            templates.append(
                f"On X right now: {vol_winner} posts make up {dominant_pct}% of the conversation about {subject} "
                f"— but {eng_winner} content gets {eng_ratio}x more engagement per post."
            )

    templates.append(
        f"How does X talk about {subject}? Right now {dominant_pct}% of posts lean {dominant_label.lower()}.\n\n"
        f"We split them into simulated feeds — see what each side sees."
    )

    templates.append(
        f"What does the other side see about {subject}? We split real X posts into opposing feeds "
        f"to show the arguments, top accounts, and blind spots."
    )

    # Pick one that fits
    for t in templates:
        if len(t) <= 280:
            return t
    return templates[-1][:280]


def generate_daily_post(slot: int) -> dict | None:
    """Generate a post for a specific time slot (0=9am, 1=12pm, 2=5pm).

    Returns {text, image_bytes, media_ext, topic_slug} or None.
    """
    from promo.tweet_generator import get_topic_stats

    now = datetime.now(timezone.utc)
    weekday = now.weekday()  # 0=Monday

    topic_slug = DAILY_TOPICS[weekday][slot]
    chart_type = CHART_ROTATION[slot][weekday]

    stats = get_topic_stats(topic_slug)
    if not stats:
        print(f"[DailyPost] No data for {topic_slug}")
        return None

    # Alternate between explainer and insight templates
    # Slot 0 (morning) and slot 2 (evening) get explainer, slot 1 gets insight
    if slot == 1:
        template = random.choice(TEMPLATES_WITH_INSIGHT)
    else:
        template = random.choice(TEMPLATES_WITH_EXPLAINER)

    text = template(stats, stats)
    if len(text) > 280:
        text = text[:277] + "..."

    # Generate visual
    image_bytes = None
    media_ext = ".png"

    if chart_type == "gif":
        from promo.gif_generator import generate_slider_gif
        image_bytes = generate_slider_gif(topic_slug)
        media_ext = ".gif"
    else:
        from promo.chart_generator import generate_chart
        image_bytes, _ = generate_chart(stats, chart_type)

    return {
        "text": text,
        "image_bytes": image_bytes,
        "media_ext": media_ext,
        "topic_slug": topic_slug,
        "chart_type": chart_type,
        "slot": slot,
    }


def post_daily_slot(slot: int) -> bool:
    """Generate and post a tweet for a time slot. Returns True on success."""
    from promo.tweet_generator import post_tweet

    post = generate_daily_post(slot)
    if not post:
        return False

    print(f"[DailyPost] Slot {slot} | {post['topic_slug']} | {post['chart_type']}")
    print(f"[DailyPost] {post['text'][:100]}...")

    result = post_tweet(post["text"], post["image_bytes"], post["media_ext"])
    return result is not None


# Post schedule: UTC hours for each slot
# 9am ET = 13 UTC, 12pm ET = 16 UTC, 5pm ET = 21 UTC
POST_HOURS_UTC = [13, 16, 21]


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Daily posting schedule")
    parser.add_argument("--slot", type=int, choices=[0, 1, 2], help="Post slot (0=9am, 1=12pm, 2=5pm)")
    parser.add_argument("--preview", action="store_true", help="Preview without posting")
    parser.add_argument("--all", action="store_true", help="Preview all 3 slots for today")
    args = parser.parse_args()

    if args.all:
        for s in range(3):
            post = generate_daily_post(s)
            if post:
                weekday = datetime.now(timezone.utc).weekday()
                times = ["9am ET", "12pm ET", "5pm ET"]
                print(f"\n{'='*50}")
                print(f"Slot {s} ({times[s]}) | {post['topic_slug']} | {post['chart_type']}")
                print(f"{'='*50}")
                print(post["text"])
                print(f"[{len(post['text'])} chars]")
    elif args.slot is not None:
        post = generate_daily_post(args.slot)
        if post:
            print(f"\n{post['text']}")
            print(f"\n[{len(post['text'])} chars | {post['chart_type']} | {post['topic_slug']}]")
            if not args.preview:
                from promo.tweet_generator import post_tweet
                post_tweet(post["text"], post["image_bytes"], post["media_ext"])
    else:
        parser.print_help()
