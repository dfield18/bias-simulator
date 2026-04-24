"""
Generate promotional tweets from topic analytics data.

Pulls fresh stats from the DB and crafts engaging tweets with links
to the relevant DividedView analytics page.

Usage:
    python -m promo.tweet_generator                    # preview all
    python -m promo.tweet_generator --topic iran-conflict  # preview one
    python -m promo.tweet_generator --post             # post to X
    python -m promo.tweet_generator --topic openai --post  # post one
"""

import os
import sys
import random
import argparse
from datetime import datetime, timezone, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

SITE_URL = "https://www.dividedview.com"


def get_topic_stats(topic_slug: str) -> dict | None:
    """Pull analytics stats for a topic from the DB."""
    from pipeline.run import get_sync_connection

    conn = get_sync_connection()
    cur = conn.cursor()

    # Topic info
    cur.execute(
        "SELECT name, pro_label, anti_label, topic_type, description, tweet_hook FROM topics WHERE slug = %s AND is_active = TRUE",
        (topic_slug,),
    )
    row = cur.fetchone()
    if not row:
        conn.close()
        return None
    name, pro_label, anti_label, topic_type, description, tweet_hook = row

    pro_bent = pro_label.lower().replace(" ", "-")
    anti_bent = anti_label.lower().replace(" ", "-")

    # Count tweets in last 48h
    cur.execute(
        """
        SELECT c.effective_political_bent,
               COUNT(*) AS posts,
               COALESCE(SUM(t.engagement), 0) AS total_eng,
               COALESCE(SUM(t.views), 0) AS total_views,
               COALESCE(AVG(t.engagement), 0) AS avg_eng
        FROM tweets t JOIN classifications c ON c.id_str = t.id_str
        WHERE t.topic_slug = %s
          AND t.fetched_at >= NOW() - INTERVAL '48 hours'
          AND c.about_subject = TRUE
          AND c.effective_political_bent IN (%s, %s)
        GROUP BY c.effective_political_bent
        """,
        (topic_slug, pro_bent, anti_bent),
    )
    sides = {}
    for r in cur.fetchall():
        sides[r[0]] = {
            "posts": r[1],
            "total_eng": int(r[2]),
            "total_views": int(r[3]),
            "avg_eng": round(float(r[4])),
        }

    pro = sides.get(pro_bent, {"posts": 0, "total_eng": 0, "total_views": 0, "avg_eng": 0})
    anti = sides.get(anti_bent, {"posts": 0, "total_eng": 0, "total_views": 0, "avg_eng": 0})

    total_posts = pro["posts"] + anti["posts"]
    if total_posts == 0:
        conn.close()
        return None

    # Echo chamber score
    cur.execute(
        "SELECT summary_text FROM topic_summaries WHERE topic_slug = %s AND side = 'narrative_gaps'",
        (topic_slug,),
    )
    gap_row = cur.fetchone()

    conn.close()

    # tweet_hook > description-derived > name
    if tweet_hook:
        subject = tweet_hook
    elif description:
        # Extract a short phrase from description
        subject = description.split(".")[0].split(",")[0].strip()
        if len(subject) > 50:
            subject = name
    else:
        subject = name

    return {
        "slug": topic_slug,
        "name": name,
        "subject": subject,
        "pro_label": pro_label,
        "anti_label": anti_label,
        "topic_type": topic_type,
        "pro": pro,
        "anti": anti,
        "total_posts": total_posts,
        "has_gaps": gap_row is not None,
        "url": f"{SITE_URL}/analytics/{topic_slug}",
    }


def fmt(n: int) -> str:
    if n >= 1_000_000:
        return f"{n / 1_000_000:.1f}M"
    if n >= 1_000:
        return f"{n / 1_000:.1f}K"
    return str(n)


def generate_tweet(stats: dict) -> str:
    """Generate a promotional tweet from topic stats."""
    name = stats["name"]
    subject = stats["subject"]
    pro = stats["pro"]
    anti = stats["anti"]
    pro_label = stats["pro_label"]
    anti_label = stats["anti_label"]
    url = stats["url"]
    total = stats["total_posts"]

    pro_pct = round(pro["posts"] / total * 100) if total else 0
    anti_pct = round(anti["posts"] / total * 100) if total else 0
    dominant_label = pro_label if pro["posts"] > anti["posts"] else anti_label
    dominant_pct = max(pro_pct, anti_pct)

    # Engagement comparison
    eng_ratio = 0
    eng_winner = ""
    if pro["avg_eng"] > 0 and anti["avg_eng"] > 0:
        if pro["avg_eng"] > anti["avg_eng"]:
            eng_ratio = round(pro["avg_eng"] / anti["avg_eng"], 1)
            eng_winner = pro_label
        else:
            eng_ratio = round(anti["avg_eng"] / pro["avg_eng"], 1)
            eng_winner = anti_label

    # Views comparison
    total_views = pro["total_views"] + anti["total_views"]

    templates = [
        # Volume + engagement split
        lambda: (
            f"Right now on X, {dominant_label} posts make up {dominant_pct}% of the conversation about {subject}"
            + (f" — but {eng_winner} content gets {eng_ratio}x more engagement per post." if eng_ratio > 1.3 else ".")
            + f"\n\nSee the full simulated feed breakdown\n{url}"
        ),
        # Raw numbers
        lambda: (
            f"We analyzed {total} posts about {subject} from X in the last 48 hours.\n\n"
            f"{anti_label}: {anti['posts']} posts, {fmt(anti['total_eng'])} engagements\n"
            f"{pro_label}: {pro['posts']} posts, {fmt(pro['total_eng'])} engagements\n\n"
            f"See how each side's feed looks different\n{url}"
        ),
        # Engagement hook
        lambda: (
            f"Posts about {subject}: {eng_winner} content gets {eng_ratio}x more engagement on X "
            f"despite being {'the minority' if (eng_winner == pro_label and pro_pct < 50) or (eng_winner == anti_label and anti_pct < 50) else 'the majority'} of the conversation.\n\n"
            f"Explore the simulated feeds\n{url}"
        ) if eng_ratio > 1.3 else None,
        # Views hook
        lambda: (
            f"{fmt(total_views)} views across {total} posts about {subject} on X in the last 48 hours.\n\n"
            f"We split them by stance into simulated feeds — see what each side sees.\n{url}"
        ) if total_views > 100_000 else None,
        # Echo chamber / blind spots
        lambda: (
            f"What does the other side see about {subject}? We pulled {total} real posts from X "
            f"and split them into opposing feeds.\n\n"
            f"The arguments, the top accounts, the blind spots\n{url}"
        ),
    ]

    # Try templates in random order, skip None results
    random.shuffle(templates)
    for t in templates:
        result = t()
        if result and len(result) <= 280:
            return result

    # Fallback
    return (
        f"How does X talk about {subject}? We analyzed {total} real posts and split them "
        f"into opposing simulated feeds.\n\n{url}"
    )


def post_tweet(text: str) -> dict | None:
    """Post a tweet using X API v2 via tweepy."""
    import tweepy

    api_key = os.getenv("X_API_KEY", "")
    api_secret = os.getenv("X_API_SECRET", "")
    access_token = os.getenv("X_ACCESS_TOKEN", "")
    access_secret = os.getenv("X_ACCESS_SECRET", "")

    if not all([api_key, api_secret, access_token, access_secret]):
        print("ERROR: X API credentials not set. Set X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET in .env")
        return None

    client = tweepy.Client(
        consumer_key=api_key,
        consumer_secret=api_secret,
        access_token=access_token,
        access_token_secret=access_secret,
    )

    try:
        response = client.create_tweet(text=text)
        tweet_id = response.data["id"]
        print(f"Posted tweet: https://x.com/i/status/{tweet_id}")
        return {"id": tweet_id, "text": text}
    except Exception as e:
        print(f"ERROR posting tweet: {e}")
        return None


def get_featured_slugs() -> list[str]:
    """Get all featured topic slugs."""
    from pipeline.run import get_sync_connection
    conn = get_sync_connection()
    cur = conn.cursor()
    cur.execute("SELECT slug FROM topics WHERE featured = TRUE AND is_active = TRUE ORDER BY slug")
    slugs = [r[0] for r in cur.fetchall()]
    conn.close()
    return slugs


def main():
    parser = argparse.ArgumentParser(description="Generate promotional tweets from topic data")
    parser.add_argument("--topic", help="Specific topic slug (default: random featured topic)")
    parser.add_argument("--post", action="store_true", help="Actually post to X (default: preview only)")
    parser.add_argument("--all", action="store_true", help="Generate tweets for all featured topics")
    args = parser.parse_args()

    if args.all:
        slugs = get_featured_slugs()
    elif args.topic:
        slugs = [args.topic]
    else:
        # Pick a random featured topic
        featured = get_featured_slugs()
        if not featured:
            print("No featured topics found")
            return
        slugs = [random.choice(featured)]

    for slug in slugs:
        stats = get_topic_stats(slug)
        if not stats:
            print(f"[{slug}] No data available, skipping")
            continue

        tweet = generate_tweet(stats)
        print(f"\n{'='*50}")
        print(f"Topic: {stats['name']} ({slug})")
        print(f"Stats: {stats['pro_label']}={stats['pro']['posts']} / {stats['anti_label']}={stats['anti']['posts']}")
        print(f"{'='*50}")
        print(tweet)
        print(f"[{len(tweet)} chars]")

        if args.post:
            post_tweet(tweet)


if __name__ == "__main__":
    main()
