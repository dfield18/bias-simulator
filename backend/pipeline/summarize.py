"""
Generate AI summaries of tweet themes for a topic.
Produces three summaries: overall, anti (left), pro (right).
"""

import os
import json
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")


def _call_gemini(prompt: str) -> str:
    from google import genai

    client = genai.Client(api_key=GEMINI_API_KEY)
    response = client.models.generate_content(
        model="gemini-2.0-flash",
        contents=prompt,
        config={"temperature": 0.4},
    )
    return response.text or ""


def _build_summary_prompt(tweets: list[dict], side_label: str, topic_name: str) -> str:
    tweets_text = ""
    for i, t in enumerate(tweets[:50]):
        tweets_text += f"""
--- Tweet {i + 1} ---
@{t.get('screen_name', 'unknown')}: {t.get('full_text', '')}
Likes: {t.get('likes', 0)} | Retweets: {t.get('retweets', 0)} | Views: {t.get('views', 0)}
"""

    return f"""You are analyzing tweets about "{topic_name}" from the "{side_label}" perspective.

Based on the tweets below, write a summary organized into short paragraphs:

**Key Themes:** 2-3 sentences on the main talking points and arguments.

**Current Events:** 2-3 sentences on what specific events or developments people are reacting to.

**Tone & Rhetoric:** 1-2 sentences on the emotional tone, language patterns, and rhetorical strategies.

**Divisions:** 1-2 sentences on surprising disagreements or tensions WITHIN this group — not the obvious divide between left and right. Look for: internal debates about strategy or tactics, disagreements about how far to go, tensions between moderates and extremists on the same side, splits between different factions (e.g. libertarians vs nationalists, progressives vs pragmatists), or contradictions in the arguments being made. If no meaningful internal divisions exist, describe what makes this group unusually unified.

Format rules:
- Use the exact bold headers above (**Key Themes:**, **Current Events:**, **Tone & Rhetoric:**, **Divisions:**)
- Each section should be its own paragraph separated by a blank line
- Write in a neutral, analytical tone. Do not editorialize.
- Use present tense. Do not start with "The tweets" or "These tweets".

Tweets:
{tweets_text}
"""


def generate_summaries(conn, topic_slug: str):
    """Generate overall, anti, and pro summaries for a topic."""
    cur = conn.cursor()

    # Load topic info
    cur.execute(
        "SELECT name, pro_label, anti_label FROM topics WHERE slug = %s",
        (topic_slug,),
    )
    row = cur.fetchone()
    if not row:
        print(f"  Summary: Topic '{topic_slug}' not found")
        return
    topic_name, pro_label, anti_label = row

    # Determine bent values
    pro_bent = pro_label.lower().replace(" ", "-")
    anti_bent = anti_label.lower().replace(" ", "-")

    # Fetch top tweets by engagement for each side
    def fetch_side_tweets(bent_filter: str | None, limit: int = 50) -> list[dict]:
        if bent_filter:
            cur.execute(
                """
                SELECT t.screen_name, t.full_text, t.likes, t.retweets, t.views
                FROM tweets t
                JOIN classifications c ON t.id_str = c.id_str
                WHERE t.topic_slug = %s AND c.about_subject = TRUE
                AND c.effective_political_bent = %s
                ORDER BY t.engagement DESC
                LIMIT %s
                """,
                (topic_slug, bent_filter, limit),
            )
        else:
            cur.execute(
                """
                SELECT t.screen_name, t.full_text, t.likes, t.retweets, t.views
                FROM tweets t
                JOIN classifications c ON t.id_str = c.id_str
                WHERE t.topic_slug = %s AND c.about_subject = TRUE
                ORDER BY t.engagement DESC
                LIMIT %s
                """,
                (topic_slug, limit),
            )
        return [
            {
                "screen_name": r[0],
                "full_text": r[1],
                "likes": r[2],
                "retweets": r[3],
                "views": r[4],
            }
            for r in cur.fetchall()
        ]

    import concurrent.futures

    sides = [
        ("overall", None, "Overall"),
        ("anti", anti_bent, anti_label),
        ("pro", pro_bent, pro_label),
    ]

    # Fetch all tweet data first (cursor not thread-safe)
    side_tweets = {}
    for side_key, bent_filter, label in sides:
        tweets = fetch_side_tweets(bent_filter)
        if tweets:
            side_tweets[side_key] = (tweets, label)

    # Generate all 3 summaries in parallel
    def generate_one(side_key, tweets, label):
        print(f"  Summary ({label}): Generating from {len(tweets)} tweets...")
        prompt = _build_summary_prompt(tweets, label, topic_name)
        return side_key, _call_gemini(prompt), len(tweets)

    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        futures = [
            executor.submit(generate_one, sk, tw, lb)
            for sk, (tw, lb) in side_tweets.items()
        ]
        for future in concurrent.futures.as_completed(futures):
            try:
                side_key, summary, count = future.result()
                cur.execute(
                    """
                    INSERT INTO topic_summaries (topic_slug, side, summary_text, tweet_count, generated_at)
                    VALUES (%s, %s, %s, %s, NOW())
                    ON CONFLICT (topic_slug, side) DO UPDATE SET
                        summary_text = EXCLUDED.summary_text,
                        tweet_count = EXCLUDED.tweet_count,
                        generated_at = NOW()
                    """,
                    (topic_slug, side_key, summary.strip(), count),
                )
            except Exception as e:
                print(f"  Summary error: {e}")

    conn.commit()
    print("  Summaries generated successfully")

    # Generate narrative gaps — what each side misses
    # Fetch the just-generated anti and pro summaries
    cur.execute(
        "SELECT side, summary_text FROM topic_summaries WHERE topic_slug = %s AND side IN ('anti', 'pro')",
        (topic_slug,),
    )
    summaries_map = {r[0]: r[1] for r in cur.fetchall()}
    anti_summary = summaries_map.get("anti", "")
    pro_summary = summaries_map.get("pro", "")

    if anti_summary and pro_summary:
        print("  Generating narrative gap analysis...")
        gap_prompt = f"""You are comparing two opposing political perspectives on "{topic_name}".

**{anti_label} perspective summary:**
{anti_summary}

**{pro_label} perspective summary:**
{pro_summary}

For each side, identify what they are MISSING — topics, arguments, facts, or perspectives that the OTHER side discusses but this side ignores or downplays.

Format your response as two sections:

**What {anti_label} doesn't see:**
3-5 bullet points, each one sentence. Each bullet should name a specific topic or argument from the {pro_label} side that {anti_label} supporters rarely encounter. Explain briefly why it matters.

**What {pro_label} doesn't see:**
3-5 bullet points, each one sentence. Each bullet should name a specific topic or argument from the {anti_label} side that {pro_label} supporters rarely encounter. Explain briefly why it matters.

Write analytically and neutrally. Do not take sides. Use bullet points with "- " prefix.
"""
        gap_text = _call_gemini(gap_prompt)

        cur.execute(
            """
            INSERT INTO topic_summaries (topic_slug, side, summary_text, tweet_count, generated_at)
            VALUES (%s, 'narrative_gaps', %s, 0, NOW())
            ON CONFLICT (topic_slug, side) DO UPDATE SET
                summary_text = EXCLUDED.summary_text,
                generated_at = NOW()
            """,
            (topic_slug, gap_text.strip()),
        )
        conn.commit()
        print("  Narrative gaps generated successfully")
