"""
Seed the database with initial topic data.

Usage:
    python -m seed
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv
load_dotenv()

import psycopg2

IRAN_TOPIC = {
    "slug": "iran-conflict",
    "name": "Iran Conflict",
    "description": "US/Israel military conflict with Iran in 2026",
    "pro_label": "Pro-War",
    "anti_label": "Anti-War",
    "classification_prompt": """You are a political content classifier analyzing tweets about the US/Israel-Iran military conflict.

For each tweet, determine:
1. Is this tweet actually about the Iran conflict / US-Iran military tensions? (about_subject: true/false)
2. What is the political bent? Classify as one of:
   - "anti-war": Opposes military action against Iran, calls for diplomacy, criticizes escalation, protests war
   - "pro-war": Supports military action against Iran, advocates for strikes, emphasizes threats from Iran
   - "neutral": Reports facts without clear lean, balanced analysis, or genuinely centrist take
   - "unclear": Cannot determine political lean, ambiguous, or mixed signals

Consider:
- The author's bio and typical audience
- Language choices (loaded words, framing)
- What the tweet emphasizes or omits
- Engagement patterns in context
- Sarcasm and irony (common on political Twitter)

Be especially careful with:
- News outlets: classify the framing, not just the facts
- Sarcasm: look for context clues
- Retweets/quotes: classify the commentary, not the quoted content
- Memes: classify the implied message""",
    "intensity_prompt": """You are scoring the intensity of political positions on the US/Israel-Iran military conflict.

For each tweet that has been classified as either pro-war or anti-war, score how intense/extreme the position is.

Scoring guidelines:
- 1-2 (or -1 to -2): Mild position. Gentle disagreement, measured tone, acknowledges other side
- 3-4 (or -3 to -4): Moderate position. Clear stance but reasonable tone, uses some loaded language
- 5-6 (or -5 to -6): Strong position. Passionate advocacy, emotional language, dismissive of opposition
- 7-8 (or -7 to -8): Very strong position. Aggressive rhetoric, dehumanizing language, conspiracy-adjacent
- 9-10 (or -9 to -10): Extreme position. Calls for radical action, violent rhetoric, propaganda-level messaging

Consider:
- Tone and word choice
- Use of ALL CAPS, exclamation marks, inflammatory language
- Whether they engage with opposing views or dismiss them entirely
- Presence of conspiracy theories or misinformation
- Calls to action and their nature
- Dehumanization of any group""",
}


def seed():
    database_url = os.getenv("DATABASE_URL", "")
    conn = psycopg2.connect(database_url)

    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO topics (slug, name, description, classification_prompt,
                    intensity_prompt, pro_label, anti_label, is_active)
                VALUES (%s, %s, %s, %s, %s, %s, %s, TRUE)
                ON CONFLICT (slug) DO UPDATE SET
                    name = EXCLUDED.name,
                    description = EXCLUDED.description,
                    classification_prompt = EXCLUDED.classification_prompt,
                    intensity_prompt = EXCLUDED.intensity_prompt,
                    pro_label = EXCLUDED.pro_label,
                    anti_label = EXCLUDED.anti_label
                """,
                (
                    IRAN_TOPIC["slug"],
                    IRAN_TOPIC["name"],
                    IRAN_TOPIC["description"],
                    IRAN_TOPIC["classification_prompt"],
                    IRAN_TOPIC["intensity_prompt"],
                    IRAN_TOPIC["pro_label"],
                    IRAN_TOPIC["anti_label"],
                ),
            )
        conn.commit()
        print(f"Seeded topic: {IRAN_TOPIC['name']} ({IRAN_TOPIC['slug']})")
    finally:
        conn.close()


if __name__ == "__main__":
    seed()
