"""
Generate a daily reply queue: viral tweets + ready-to-post reply packages.

Finds high-engagement tweets about each featured topic, generates a
chart/GIF, and saves everything to a folder for manual posting.

Usage:
    python -m promo.reply_queue                    # generate today's queue
    python -m promo.reply_queue --topic trump      # one topic only
    python -m promo.reply_queue --output ~/Desktop/replies  # custom folder

Output structure:
    replies/
      2026-04-25/
        01_donald-trump/
          target_tweet.txt    (URL + text of the tweet to reply to)
          reply_text.txt      (suggested reply text)
          chart.png           (chart image to attach)
        02_israel/
          ...
"""

import os
import sys
import json
import random
import requests
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

SOCIALDATA_API_KEY = os.getenv("SOCIALDATA_API_KEY", "")


def find_viral_tweets(search_query: str, min_engagement: int = 500, limit: int = 5) -> list[dict]:
    """Find high-engagement tweets using SocialData API."""
    if not SOCIALDATA_API_KEY:
        print("ERROR: SOCIALDATA_API_KEY not set")
        return []

    headers = {
        "Authorization": f"Bearer {SOCIALDATA_API_KEY}",
        "Accept": "application/json",
    }

    try:
        resp = requests.get(
            "https://api.socialdata.tools/twitter/search",
            headers=headers,
            params={"query": search_query, "type": "Top", "lang": "en"},
            timeout=15,
        )
        resp.raise_for_status()
        tweets = resp.json().get("tweets", [])
    except Exception as e:
        print(f"  Search error: {e}")
        return []

    results = []
    for t in tweets:
        user = t.get("user", {})
        eng = (t.get("favorite_count", 0) or 0) + (t.get("retweet_count", 0) or 0) + (t.get("reply_count", 0) or 0)
        views = t.get("views_count", 0) or 0
        screen = user.get("screen_name", "")
        followers = user.get("followers_count", 0)

        if eng < min_engagement:
            continue
        # Skip our own account
        if screen.lower() == "dividedviewdata":
            continue

        results.append({
            "id": t.get("id_str", ""),
            "text": (t.get("full_text", "") or "")[:200].replace("\n", " ").strip(),
            "author": screen,
            "author_name": user.get("name", ""),
            "followers": followers,
            "engagement": eng,
            "views": views,
            "url": f"https://x.com/{screen}/status/{t.get('id_str', '')}",
        })

    # Sort by engagement, take top N
    results.sort(key=lambda x: x["engagement"], reverse=True)
    return results[:limit]


# Search queries per topic (broader than the pipeline queries to find viral content)
TOPIC_SEARCHES = {
    "donald-trump": "Trump -is:retweet",
    "israel": "(Israel OR Palestine OR Gaza) -is:retweet",
    "iran-conflict": "(Iran OR Tehran) war -is:retweet",
    "barack-obama": "Obama -is:retweet",
    "openai": "(OpenAI OR ChatGPT OR \"GPT-4\") -is:retweet",
    "anthropic": "(Anthropic OR Claude AI) -is:retweet",
    "pope-leo-xiii": "(Pope Leo OR Vatican) -is:retweet",
}

# Reply templates — conversational, no links, reference the chart
REPLY_TEMPLATES = [
    lambda subject, stats: (
        f"Here's how both sides of X are actually talking about {subject} right now — "
        f"classified by AI from hundreds of real posts."
    ),
    lambda subject, stats: (
        f"We analyzed the top posts about {subject} on X and split them by political stance. "
        f"This is what each side's feed looks like."
    ),
    lambda subject, stats: (
        f"Interesting — here's the data on how X is split on {subject}. "
        f"{_get_insight(stats)}"
    ),
    lambda subject, stats: (
        f"The conversation about {subject} on X is more nuanced than it seems. "
        f"{_get_insight(stats)}"
    ),
]


def _get_insight(stats: dict) -> str:
    """Generate a one-line insight from stats."""
    if not stats:
        return ""
    pro = stats.get("pro", {})
    anti = stats.get("anti", {})
    pro_label = stats.get("pro_label", "")
    anti_label = stats.get("anti_label", "")
    total = stats.get("total_posts", 0)

    if total == 0:
        return ""

    dominant = pro_label if pro.get("posts", 0) > anti.get("posts", 0) else anti_label
    dominant_pct = round(max(pro.get("posts", 0), anti.get("posts", 0)) / total * 100)

    eng_ratio = 0
    eng_winner = ""
    pro_eng = pro.get("avg_eng", 0)
    anti_eng = anti.get("avg_eng", 0)
    if pro_eng > 0 and anti_eng > 0:
        if pro_eng > anti_eng:
            eng_ratio = round(pro_eng / anti_eng, 1)
            eng_winner = pro_label
        else:
            eng_ratio = round(anti_eng / pro_eng, 1)
            eng_winner = anti_label

    if eng_ratio > 1.3 and eng_winner != dominant:
        return f"{dominant} posts dominate ({dominant_pct}%) but {eng_winner} gets {eng_ratio}x more engagement."
    return f"{dominant_pct}% of posts lean {dominant.lower()}."


def generate_reply_queue(topics: list[str] | None = None, output_dir: str | None = None) -> str:
    """Generate reply packages for each topic. Returns the output directory path."""
    from promo.tweet_generator import get_topic_stats
    from promo.chart_generator import generate_chart
    from promo.gif_generator import generate_slider_gif

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    base_dir = Path(output_dir or os.path.expanduser("~/Desktop/reply_queue"))
    day_dir = base_dir / today
    day_dir.mkdir(parents=True, exist_ok=True)

    if not topics:
        topics = list(TOPIC_SEARCHES.keys())

    total_replies = 0

    for i, slug in enumerate(topics):
        search = TOPIC_SEARCHES.get(slug)
        if not search:
            print(f"[{slug}] No search query configured, skipping")
            continue

        print(f"\n{'='*50}")
        print(f"[{slug}] Searching for viral tweets...")

        viral = find_viral_tweets(search, min_engagement=200, limit=3)
        if not viral:
            print(f"[{slug}] No viral tweets found")
            continue

        stats = get_topic_stats(slug)
        subject = stats["subject"] if stats else slug.replace("-", " ").title()

        # Generate chart (pick best type)
        chart_bytes = None
        chart_ext = ".png"
        if stats:
            # Use butterfly or disconnect — most insightful for replies
            from promo.chart_generator import generate_chart
            chart_bytes, chart_type = generate_chart(stats, "auto")
            print(f"[{slug}] Generated {chart_type} chart")

        for j, tweet in enumerate(viral):
            reply_dir = day_dir / f"{i+1:02d}_{slug}" / f"reply_{j+1}"
            reply_dir.mkdir(parents=True, exist_ok=True)

            # Generate reply text
            template = random.choice(REPLY_TEMPLATES)
            reply_text = template(subject, stats)
            if len(reply_text) > 280:
                reply_text = reply_text[:277] + "..."

            info_path = reply_dir / "reply_info.txt"
            info_path.write_text(
                f"URL: {tweet['url']}\n\n"
                f"REPLY: {reply_text}\n"
            )

            # Save chart
            if chart_bytes:
                chart_path = reply_dir / f"chart{chart_ext}"
                chart_path.write_bytes(chart_bytes)

            print(f"  [{j+1}] @{tweet['author']} ({tweet['engagement']:,} eng) → {reply_dir}")
            total_replies += 1

    print(f"\n{'='*50}")
    print(f"Generated {total_replies} reply packages in {day_dir}")
    print(f"\nTo post: open each target_tweet.txt URL in X, click Reply,")
    print(f"paste reply_text.txt, and attach the chart image.")
    return str(day_dir)


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Generate daily reply queue")
    parser.add_argument("--topic", help="Specific topic slug")
    parser.add_argument("--output", help="Output directory (default: ~/Desktop/reply_queue)")
    args = parser.parse_args()

    topics = [args.topic] if args.topic else None
    generate_reply_queue(topics=topics, output_dir=args.output)
