import os
import time
import requests
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv

load_dotenv()

SOCIALDATA_API_KEY = os.getenv("SOCIALDATA_API_KEY", "")
SOCIALDATA_BASE_URL = "https://api.socialdata.tools"


def fetch_tweets(topic_slug: str, search_query: str, hours: int = 24, max_pages: int = 25, lang: str = "en") -> list[dict]:
    """
    Fetch tweets from SocialData API for a given topic.
    Returns list of raw tweet dicts sorted by views descending.
    """
    since_time = int((datetime.now(timezone.utc) - timedelta(hours=hours)).timestamp())

    headers = {
        "Authorization": f"Bearer {SOCIALDATA_API_KEY}",
        "Accept": "application/json",
    }

    all_tweets = []
    next_cursor = None

    for page in range(max_pages):
        params = {
            "query": search_query,
            "type": "Top",
            "lang": lang,
            "since_time": since_time,
        }
        if next_cursor:
            params["cursor"] = next_cursor

        response = requests.get(
            f"{SOCIALDATA_BASE_URL}/twitter/search",
            headers=headers,
            params=params,
            timeout=30,
        )
        response.raise_for_status()
        data = response.json()

        tweets = data.get("tweets", [])
        if not tweets:
            break

        for tweet in tweets:
            all_tweets.append(tweet)

        next_cursor = data.get("next_cursor")
        if not next_cursor:
            break

        # Rate limiting
        time.sleep(0.5)

    # Sort by views descending
    all_tweets.sort(key=lambda t: (t.get("views", 0) or 0), reverse=True)

    print(f"  Fetched {len(all_tweets)} tweets across {page + 1} pages")
    return all_tweets


def parse_tweet(raw: dict, topic_slug: str) -> dict:
    """Parse a raw SocialData tweet dict into our DB schema format."""
    user = raw.get("user", {})
    created_at = None
    if raw.get("tweet_created_at"):
        try:
            created_at = datetime.fromisoformat(raw["tweet_created_at"].replace("Z", "+00:00"))
        except (ValueError, TypeError):
            pass

    screen_name = user.get("screen_name", "")
    id_str = str(raw.get("id_str", raw.get("id", "")))

    return {
        "id_str": id_str,
        "topic_slug": topic_slug,
        "created_at": created_at,
        "screen_name": screen_name,
        "author_name": user.get("name", ""),
        "author_bio": user.get("description", ""),
        "author_followers": user.get("followers_count", 0),
        "full_text": raw.get("full_text", raw.get("text", "")),
        "likes": raw.get("favorite_count", 0) or 0,
        "retweets": raw.get("retweet_count", 0) or 0,
        "replies": raw.get("reply_count", 0) or 0,
        "quotes": raw.get("quote_count", 0) or 0,
        "views": raw.get("views_count", raw.get("views", 0)) or 0,
        "url": f"https://twitter.com/{screen_name}/status/{id_str}",
        "raw_json": raw,
    }
