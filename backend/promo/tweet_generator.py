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
          AND t.created_at >= NOW() - INTERVAL '48 hours'
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

    # Narrative frames per side (for butterfly chart)
    cur.execute(
        """
        SELECT c.effective_political_bent, unnest(c.narrative_frames) AS frame, COUNT(*)
        FROM tweets t JOIN classifications c ON c.id_str = t.id_str
        WHERE t.topic_slug = %s
          AND t.fetched_at >= NOW() - INTERVAL '48 hours'
          AND t.created_at >= NOW() - INTERVAL '48 hours'
          AND c.about_subject = TRUE
          AND c.narrative_frames IS NOT NULL
          AND c.effective_political_bent IN (%s, %s)
        GROUP BY 1, 2 ORDER BY 1, 3 DESC
        """,
        (topic_slug, pro_bent, anti_bent),
    )
    frame_counts = {"pro": {}, "anti": {}}
    for bent, frame, count in cur.fetchall():
        side = "pro" if bent == pro_bent else "anti"
        frame_counts[side][frame] = count

    # Frame labels
    cur.execute("SELECT custom_frames FROM topics WHERE slug = %s", (topic_slug,))
    cf_row = cur.fetchone()
    frame_labels = {}
    if cf_row and cf_row[0]:
        for f in cf_row[0]:
            frame_labels[f["key"]] = f["label"]

    # Echo chamber score (computed from frame overlap)
    all_frames = set(list(frame_counts["pro"].keys()) + list(frame_counts["anti"].keys()))
    if all_frames:
        pro_total_frames = sum(frame_counts["pro"].values()) or 1
        anti_total_frames = sum(frame_counts["anti"].values()) or 1
        overlap = 0
        for f in all_frames:
            pro_pct_f = frame_counts["pro"].get(f, 0) / pro_total_frames
            anti_pct_f = frame_counts["anti"].get(f, 0) / anti_total_frames
            overlap += min(pro_pct_f, anti_pct_f)
        echo_score = round(overlap * 100)
    else:
        echo_score = None

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
        "frame_counts": frame_counts,
        "frame_labels": frame_labels,
        "echo_score": echo_score,
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
        ),
        # Percentage breakdown
        lambda: (
            f"How X talks about {subject} right now:\n\n"
            f"{anti_label}: {anti_pct}% of posts\n"
            f"{pro_label}: {pro_pct}% of posts\n\n"
            f"Same topic, different realities."
        ),
        # Engagement hook
        lambda: (
            f"Posts about {subject}: {eng_winner} content gets {eng_ratio}x more engagement on X "
            f"despite being {'the minority' if (eng_winner == pro_label and pro_pct < 50) or (eng_winner == anti_label and anti_pct < 50) else 'the majority'} of the conversation."
        ) if eng_ratio > 1.3 else None,
        # Perspective hook
        lambda: (
            f"On X right now, {dominant_pct}% of posts about {subject} lean {dominant_label.lower()}.\n\n"
            f"We split the real posts into simulated feeds — see what each side sees."
        ),
        # Echo chamber / blind spots
        lambda: (
            f"What does the other side see about {subject}? We split real posts from X "
            f"into opposing feeds.\n\n"
            f"The arguments, the top accounts, the blind spots."
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
        f"How does X talk about {subject}? We split real posts "
        f"into opposing simulated feeds."
    )


def _get_tweepy_clients() -> tuple:
    """Return (v2_client, v1_api) for posting tweets with media."""
    import tweepy

    api_key = os.getenv("X_API_KEY", "")
    api_secret = os.getenv("X_API_SECRET", "")
    access_token = os.getenv("X_ACCESS_TOKEN", "")
    access_secret = os.getenv("X_ACCESS_SECRET", "")

    if not all([api_key, api_secret, access_token, access_secret]):
        print("ERROR: X API credentials not set. Set X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET in .env")
        return None, None

    # v2 client for posting tweets
    client = tweepy.Client(
        consumer_key=api_key,
        consumer_secret=api_secret,
        access_token=access_token,
        access_token_secret=access_secret,
    )

    # v1.1 API for media upload (v2 doesn't support media upload yet)
    auth = tweepy.OAuth1UserHandler(api_key, api_secret, access_token, access_secret)
    api = tweepy.API(auth)

    return client, api


def post_tweet(text: str, image_bytes: bytes | None = None, media_ext: str = ".png",
               quote_tweet_id: str | None = None) -> dict | None:
    """Post a tweet with optional image/GIF and optional quote tweet."""
    client, api = _get_tweepy_clients()
    if not client:
        return None

    try:
        media_ids = None
        if image_bytes and api:
            import tempfile
            with tempfile.NamedTemporaryFile(suffix=media_ext, delete=False) as f:
                f.write(image_bytes)
                tmp_path = f.name
            media = api.media_upload(filename=tmp_path)
            media_ids = [media.media_id]
            os.unlink(tmp_path)
            print(f"Uploaded media: {media.media_id}")

        response = client.create_tweet(
            text=text, media_ids=media_ids, quote_tweet_id=quote_tweet_id,
        )
        tweet_id = response.data["id"]
        print(f"Posted tweet: https://x.com/i/status/{tweet_id}")
        return {"id": tweet_id, "text": text, "has_image": bool(media_ids)}
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
    parser.add_argument("--chart", action="store_true", help="Attach a chart image")
    parser.add_argument("--chart-type", default="auto",
                        choices=["auto", "side_by_side", "disconnect", "echo_gauge", "butterfly"],
                        help="Chart type (default: auto-pick best)")
    parser.add_argument("--gif", action="store_true", help="Attach a bias slider GIF")
    parser.add_argument("--quote", help="Quote tweet URL or ID (e.g. https://x.com/user/status/123 or just 123)")
    parser.add_argument("--save-chart", help="Save chart/gif to file instead of attaching")
    args = parser.parse_args()

    if args.all:
        slugs = get_featured_slugs()
    elif args.topic:
        slugs = [args.topic]
    else:
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

        media_bytes = None
        media_ext = ".png"
        if args.gif:
            from promo.gif_generator import generate_slider_gif
            media_bytes = generate_slider_gif(slug)
            media_ext = ".gif"
            if media_bytes:
                print(f"GIF: {len(media_bytes)} bytes")
        elif args.chart or args.save_chart:
            from promo.chart_generator import generate_chart
            media_bytes, chart_type = generate_chart(stats, args.chart_type)
            if media_bytes:
                print(f"Chart: {chart_type} ({len(media_bytes)} bytes)")

        if args.save_chart and media_bytes:
            path = args.save_chart if len(slugs) == 1 else f"/tmp/media_{slug}{media_ext}"
            with open(path, "wb") as f:
                f.write(media_bytes)
            print(f"Saved → {path}")

        if args.post:
            quote_id = None
            if args.quote:
                # Extract tweet ID from URL or use as-is
                import re
                m = re.search(r'status/(\d+)', args.quote)
                quote_id = m.group(1) if m else args.quote
                print(f"Quoting tweet: {quote_id}")
            post_tweet(tweet, media_bytes if (args.chart or args.gif) else None, media_ext, quote_id)


if __name__ == "__main__":
    main()
