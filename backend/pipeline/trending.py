"""
Trending topic discovery for the Daily Pulse.

Searches X for high-engagement political posts via SocialData, then uses
Gemini to cluster them into analyzable topics with two clear sides.

Returns a list of topic definitions ready for quick classification.
"""

import os
import json
import requests
from dotenv import load_dotenv

load_dotenv()

SOCIALDATA_API_KEY = os.getenv("SOCIALDATA_API_KEY", "")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

# Broad searches to capture the political conversation on X
DISCOVERY_QUERIES = [
    "Congress OR Senate OR \"White House\" OR legislation",
    "breaking news politics",
    "Democrats OR Republicans OR bipartisan",
    "Supreme Court OR federal court OR ruling",
    "policy OR regulation OR executive order",
]


def fetch_top_political_posts(max_per_query: int = 20) -> list[dict]:
    """Fetch high-engagement political posts from X."""
    if not SOCIALDATA_API_KEY:
        print("[Trending] SOCIALDATA_API_KEY not set")
        return []

    headers = {
        "Authorization": f"Bearer {SOCIALDATA_API_KEY}",
        "Accept": "application/json",
    }

    all_posts = []
    seen_ids = set()

    for query in DISCOVERY_QUERIES:
        try:
            resp = requests.get(
                "https://api.socialdata.tools/twitter/search",
                headers=headers,
                params={"query": f"{query} lang:en", "type": "Top"},
                timeout=15,
            )
            resp.raise_for_status()
            tweets = resp.json().get("tweets", [])

            for t in tweets[:max_per_query]:
                tid = t.get("id_str", "")
                if tid in seen_ids:
                    continue
                seen_ids.add(tid)

                eng = (t.get("favorite_count", 0) or 0) + (t.get("retweet_count", 0) or 0)
                if eng < 100:
                    continue

                all_posts.append({
                    "text": (t.get("full_text", "") or "")[:200],
                    "engagement": eng,
                    "views": t.get("views_count", 0) or 0,
                    "author": t.get("user", {}).get("screen_name", ""),
                })
        except Exception as e:
            print(f"[Trending] Search error for '{query[:30]}...': {e}")

    # Sort by engagement, take top posts
    all_posts.sort(key=lambda x: x["engagement"], reverse=True)
    print(f"[Trending] Collected {len(all_posts)} high-engagement political posts")
    return all_posts[:50]


def identify_topics_from_posts(posts: list[dict], max_topics: int = 5) -> list[dict]:
    """Use Gemini to cluster posts into analyzable political topics."""
    if not GEMINI_API_KEY or not posts:
        return []

    posts_text = "\n".join(
        f"- [{p['engagement']} eng] @{p['author']}: {p['text']}"
        for p in posts[:40]
    )

    prompt = f"""You are analyzing the most-engaged political posts on X (Twitter) right now to identify the top trending political debates.

Here are the highest-engagement political posts from the last 24 hours:

{posts_text}

From these posts, identify the top {max_topics} distinct political/social TOPICS being debated. Each topic should:
1. Be a specific issue, event, or debate (not a person unless they ARE the topic)
2. Have two clear opposing sides
3. Appear in multiple posts (not just one tweet)

For each topic, return:
- "name": a clean, readable topic name (e.g., "TikTok Ban Vote", "Federal Budget Cuts")
- "slug": a URL-safe slug (lowercase, hyphens, max 40 chars)
- "search_query": an X search query to find more posts about this topic (use OR for variants, keep under 100 chars)
- "pro_label": label for the supportive/favorable side (2-3 words max)
- "anti_label": label for the opposing/critical side (2-3 words max)
- "description": one sentence describing the debate
- "heat": estimated relative engagement level 1-10 (10 = dominating the conversation)

Return a JSON array sorted by heat (highest first). If fewer than {max_topics} topics qualify, return fewer.

IMPORTANT: Return ONLY valid JSON, no markdown code fences."""

    from google import genai

    client = genai.Client(api_key=GEMINI_API_KEY)

    try:
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=prompt,
            config={
                "response_mime_type": "application/json",
                "temperature": 0.3,
            },
        )
        text = (response.text or "").strip()
        topics = json.loads(text)
        if not isinstance(topics, list):
            topics = []

        valid = []
        for t in topics:
            if all(k in t for k in ["name", "slug", "search_query", "pro_label", "anti_label"]):
                t["slug"] = t["slug"][:40].lower().replace(" ", "-")
                t["heat"] = min(10, max(1, int(t.get("heat", 5))))
                valid.append(t)

        print(f"[Trending] Identified {len(valid)} trending topics")
        return valid[:max_topics]
    except Exception as e:
        print(f"[Trending] Gemini analysis failed: {e}")
        return []


def discover_trending_topics(max_topics: int = 5) -> list[dict]:
    """Full discovery pipeline: fetch posts → cluster into topics."""
    print("[Trending] Searching X for political posts...")
    posts = fetch_top_political_posts()
    if not posts:
        return []

    print(f"[Trending] Clustering into topics with Gemini...")
    topics = identify_topics_from_posts(posts, max_topics=max_topics)
    return topics


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Discover trending political topics")
    parser.add_argument("--max", type=int, default=5, help="Max topics to discover")
    args = parser.parse_args()

    topics = discover_trending_topics(max_topics=args.max)
    for t in topics:
        print(f"\n  {'🔥' * t.get('heat', 5)} {t['name']} ({t['slug']})")
        print(f"    {t['pro_label']} vs {t['anti_label']}")
        print(f"    Search: {t['search_query']}")
        print(f"    {t.get('description', '')}")
