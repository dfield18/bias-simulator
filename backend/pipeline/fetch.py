import os
import time
import requests
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv

load_dotenv()

SOCIALDATA_API_KEY = os.getenv("SOCIALDATA_API_KEY", "")
SOCIALDATA_BASE_URL = "https://api.socialdata.tools"
# SocialData bills per result returned. Default reflects the $0.20/1k rate
# on their public pricing page; override with SOCIALDATA_COST_PER_RESULT_USD.
SOCIALDATA_COST_PER_RESULT_USD = float(os.getenv("SOCIALDATA_COST_PER_RESULT_USD", "0.0002"))


def _fetch_one_query(query: str, hours: int, max_pages: int, lang: str) -> list[dict]:
    """Fetch tweets for a single search query."""
    since_time = int((datetime.now(timezone.utc) - timedelta(hours=hours)).timestamp())
    headers = {
        "Authorization": f"Bearer {SOCIALDATA_API_KEY}",
        "Accept": "application/json",
    }

    tweets = []
    next_cursor = None

    for page in range(max_pages):
        params = {
            "query": query,
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

        batch = data.get("tweets", [])
        if not batch:
            break

        tweets.extend(batch)
        next_cursor = data.get("next_cursor")
        if not next_cursor:
            break

        time.sleep(0.15)

    return tweets


def fetch_tweets(topic_slug: str, search_query: str, hours: int = 24, max_pages: int = 25, lang: str = "en") -> tuple[list[dict], float]:
    """
    Fetch tweets from SocialData API for a given topic.
    Splits OR-separated queries into parallel fetches for speed.
    Returns (deduplicated tweets sorted by views desc, estimated cost in USD).
    Cost reflects raw results billed across all sub-queries before dedup.
    """
    import concurrent.futures

    # Split query into sub-queries on " OR " for parallel fetching
    parts = [p.strip() for p in search_query.split(" OR ") if p.strip()]

    billed_results = 0

    if len(parts) >= 4:
        # Group into 2-3 sub-queries for parallel fetch
        chunk_size = max(len(parts) // 3, 2)
        sub_queries = []
        for i in range(0, len(parts), chunk_size):
            sub_queries.append(" OR ".join(parts[i:i + chunk_size]))
        pages_per = max(max_pages // len(sub_queries), 5)

        print(f"  Parallel fetch: {len(sub_queries)} sub-queries, {pages_per} pages each")
        all_tweets = []
        seen_ids = set()

        with concurrent.futures.ThreadPoolExecutor(max_workers=len(sub_queries)) as executor:
            futures = [
                executor.submit(_fetch_one_query, sq, hours, pages_per, lang)
                for sq in sub_queries
            ]
            for future in concurrent.futures.as_completed(futures):
                try:
                    sub_results = future.result()
                    billed_results += len(sub_results)
                    for t in sub_results:
                        tid = str(t.get("id_str", t.get("id", "")))
                        if tid and tid not in seen_ids:
                            seen_ids.add(tid)
                            all_tweets.append(t)
                except Exception as e:
                    print(f"  Sub-query fetch error: {e}")
    else:
        # Short query — fetch sequentially
        all_tweets = _fetch_one_query(search_query, hours, max_pages, lang)
        billed_results = len(all_tweets)

    all_tweets.sort(key=lambda t: (t.get("views", 0) or 0), reverse=True)
    cost = billed_results * SOCIALDATA_COST_PER_RESULT_USD
    print(f"  Fetched {len(all_tweets)} tweets (deduplicated) | SocialData cost: ${cost:.4f} ({billed_results} billed)")
    return all_tweets, cost


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
