"""
Generate shareable PNG images from Pulse data for X posts.

Charts:
  1. Donut chart — share of engagement across trending topics
  2. Word cloud — top keywords from trending tweets
  3. Side-by-side quote cards — opposing quotes from most contested topic

Usage:
    python -m promo.pulse_charts --type donut
    python -m promo.pulse_charts --type wordcloud
    python -m promo.pulse_charts --type quotes
    python -m promo.pulse_charts --type all
    python -m promo.pulse_charts --type donut --post  # post to X
"""

import os
import sys
import io
import re
import math
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

BRAND_BG = "#0a0e17"
BRAND_GRAY = "#1a1f2e"
BRAND_TEXT = "#e5e7eb"
BRAND_MUTED = "#6b7280"
BRAND_URL = "dividedview.com"
COLORS = ["#3b82f6", "#ef4444", "#22c55e", "#eab308", "#a855f7", "#f97316", "#06b6d4", "#ec4899", "#14b8a6", "#f43f5e"]


def _save(fig) -> bytes:
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=150, bbox_inches="tight",
                facecolor=fig.get_facecolor(), edgecolor="none", pad_inches=0.3)
    plt.close(fig)
    buf.seek(0)
    return buf.read()


def get_pulse_data() -> dict | None:
    """Fetch pulse data from the DB."""
    from pipeline.run import get_sync_connection
    import json

    conn = get_sync_connection()
    try:
        cur = conn.cursor()
        # Get trending data
        cur.execute("SELECT data, date FROM trending_pulse ORDER BY date DESC LIMIT 1")
        row = cur.fetchone()
        if not row:
            return None

        trending = row[0] if isinstance(row[0], list) else json.loads(row[0])
        date = row[1]

        # Get featured tweet
        from datetime import datetime, timezone, timedelta
        since = datetime.now(timezone.utc) - timedelta(hours=48)
        cur.execute("""
            SELECT t.full_text, t.screen_name, t.author_name, t.engagement, t.views, t.id_str
            FROM tweets t JOIN classifications c ON c.id_str = t.id_str
            WHERE t.fetched_at >= %s AND t.created_at >= %s AND c.about_subject = TRUE
            ORDER BY t.engagement DESC LIMIT 1
        """, (since, since))
        feat_row = cur.fetchone()
        featured = None
        if feat_row:
            clean = re.sub(r'https?://\S+', '', feat_row[0] or "").strip()
            featured = {
                "text": clean[:200], "author": f"@{feat_row[1]}", "author_name": feat_row[2],
                "engagement": feat_row[3], "views": feat_row[4],
            }

        # Build keywords
        from collections import Counter
        keywords = []
        stop_words = {"about", "their", "which", "would", "should", "could", "being", "after",
                       "other", "those", "these", "there", "where", "while", "https", "before", "because"}
        for t in trending:
            for word in t.get("name", "").split():
                if len(word) > 3:
                    keywords.append(word.lower())
            s = t.get("stats", {})
            for side in ["sample_pro", "sample_anti"]:
                for sample in s.get(side, []):
                    txt = sample.get("text", sample) if isinstance(sample, dict) else sample
                    for word in str(txt).split():
                        clean_w = re.sub(r'[^a-zA-Z]', '', word).lower()
                        if len(clean_w) > 4 and clean_w not in stop_words:
                            keywords.append(clean_w)
        word_counts = Counter(keywords)

        return {
            "trending": trending,
            "date": date,
            "featured": featured,
            "word_counts": word_counts,
        }
    finally:
        conn.close()


def generate_pulse_donut(data: dict) -> bytes:
    """Donut chart showing share of engagement across trending topics."""
    trending = data["trending"]
    total_eng = sum(t.get("stats", {}).get("pro_engagement", 0) + t.get("stats", {}).get("anti_engagement", 0) for t in trending) or 1

    segments = []
    for t in trending:
        s = t.get("stats", {})
        eng = s.get("pro_engagement", 0) + s.get("anti_engagement", 0)
        pct = round(eng / total_eng * 100)
        if pct > 0:
            segments.append({"name": t["name"], "pct": pct})

    fig, ax = plt.subplots(figsize=(8, 8))
    fig.patch.set_facecolor(BRAND_BG)
    ax.set_facecolor(BRAND_BG)

    wedges, _ = ax.pie(
        [s["pct"] for s in segments],
        colors=COLORS[:len(segments)],
        startangle=90,
        pctdistance=0.78,
        wedgeprops=dict(width=0.35, edgecolor=BRAND_BG, linewidth=2),
    )
    for w in wedges:
        w.set_alpha(0.85)

    # Legend below the chart
    legend_labels = [f'{s["name"]} ({s["pct"]}%)' for s in segments]
    ax.legend(wedges, legend_labels, loc="upper center", bbox_to_anchor=(0.5, -0.05),
              fontsize=10, facecolor=BRAND_BG, edgecolor=BRAND_GRAY, labelcolor=BRAND_TEXT,
              ncol=2, columnspacing=1.5)

    fig.text(0.5, 0.96, "What X is debating today", fontsize=16,
             fontweight="bold", color=BRAND_TEXT, ha="center", va="top")
    fig.text(0.5, 0.92, f"Share of engagement — {data['date']}", fontsize=10,
             color=BRAND_MUTED, ha="center", va="top")
    fig.text(0.02, 0.02, BRAND_URL, fontsize=7, color=BRAND_MUTED, ha="left")

    return _save(fig)


def generate_pulse_wordcloud(data: dict) -> bytes:
    """Word cloud from trending tweet keywords."""
    word_counts = data["word_counts"]
    if not word_counts:
        return b""

    top_words = word_counts.most_common(30)
    max_count = top_words[0][1] if top_words else 1

    fig, ax = plt.subplots(figsize=(8, 5))
    fig.patch.set_facecolor(BRAND_BG)
    ax.set_facecolor(BRAND_BG)
    ax.axis("off")

    # Place words randomly
    np.random.seed(42)
    placed = []
    for i, (word, count) in enumerate(top_words):
        size = 12 + (count / max_count) * 28
        color = COLORS[i % len(COLORS)]
        # Try to place without overlap
        for _ in range(50):
            x = np.random.uniform(0.05, 0.95)
            y = np.random.uniform(0.08, 0.88)
            overlap = False
            for px, py, ps in placed:
                if abs(x - px) < 0.12 and abs(y - py) < 0.08:
                    overlap = True
                    break
            if not overlap:
                ax.text(x, y, word, fontsize=size, fontweight="bold", color=color,
                        alpha=0.85, ha="center", va="center", transform=ax.transAxes)
                placed.append((x, y, size))
                break

    fig.text(0.5, 0.97, "What people are talking about on X", fontsize=14,
             fontweight="bold", color=BRAND_TEXT, ha="center", va="top")
    fig.text(0.5, 0.93, data["date"], fontsize=9,
             color=BRAND_MUTED, ha="center", va="top")
    fig.text(0.02, 0.02, BRAND_URL, fontsize=7, color=BRAND_MUTED, ha="left")

    return _save(fig)


def generate_pulse_quotes(data: dict) -> bytes:
    """Side-by-side quote cards for the most contested trending topic."""
    trending = data["trending"]
    if not trending:
        return b""

    # Find most contested (closest to 50/50)
    most_contested = min(trending, key=lambda t: abs(
        t.get("stats", {}).get("pro_count", 0) - t.get("stats", {}).get("anti_count", 0)
    ))

    s = most_contested.get("stats", {})
    anti_sample = s.get("sample_anti", [None])[0] if s.get("sample_anti") else None
    pro_sample = s.get("sample_pro", [None])[0] if s.get("sample_pro") else None

    if not anti_sample and not pro_sample:
        return b""

    anti_text = (anti_sample.get("text", anti_sample) if isinstance(anti_sample, dict) else str(anti_sample))[:150] if anti_sample else ""
    pro_text = (pro_sample.get("text", pro_sample) if isinstance(pro_sample, dict) else str(pro_sample))[:150] if pro_sample else ""
    anti_author = anti_sample.get("author", "") if isinstance(anti_sample, dict) else ""
    pro_author = pro_sample.get("author", "") if isinstance(pro_sample, dict) else ""

    # Strip emojis
    anti_text = re.sub(r'[^\x00-\x7F\u00C0-\u024F\u2000-\u206F]+', '', anti_text).strip()
    pro_text = re.sub(r'[^\x00-\x7F\u00C0-\u024F\u2000-\u206F]+', '', pro_text).strip()

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(10, 5))
    fig.patch.set_facecolor(BRAND_BG)

    for ax, text, author, label, color, bg in [
        (ax1, anti_text, anti_author, most_contested.get("anti_label", "Side A"), "#3b82f6", "#1e3a5f"),
        (ax2, pro_text, pro_author, most_contested.get("pro_label", "Side B"), "#ef4444", "#5f1e1e"),
    ]:
        ax.set_facecolor(bg)
        ax.set_xlim(0, 1)
        ax.set_ylim(0, 1)
        ax.axis("off")

        # Side label
        ax.text(0.05, 0.92, label.upper(), fontsize=9, fontweight="bold", color=color, va="top")
        # Quote
        wrapped = "\n".join([text[i:i+40] for i in range(0, len(text), 40)])
        ax.text(0.05, 0.78, f'"{wrapped}"', fontsize=10, color=BRAND_TEXT,
                va="top", linespacing=1.4, fontstyle="italic")
        # Author
        if author:
            ax.text(0.05, 0.08, author, fontsize=9, color=BRAND_MUTED, va="bottom")

    fig.text(0.5, 0.98, f"Two sides of: {most_contested['name']}", fontsize=14,
             fontweight="bold", color=BRAND_TEXT, ha="center", va="top")
    fig.text(0.02, 0.01, BRAND_URL, fontsize=7, color=BRAND_MUTED, ha="left")
    fig.text(0.98, 0.01, data["date"], fontsize=7, color=BRAND_MUTED, ha="right")

    plt.tight_layout(rect=[0, 0.03, 1, 0.93])
    return _save(fig)


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Generate Pulse chart PNGs for X posts")
    parser.add_argument("--type", default="all", choices=["donut", "wordcloud", "quotes", "all"])
    parser.add_argument("--post", action="store_true", help="Post to X")
    parser.add_argument("--output", default="/tmp", help="Output directory")
    args = parser.parse_args()

    data = get_pulse_data()
    if not data:
        print("No pulse data available")
        sys.exit(1)

    charts = []
    if args.type in ("donut", "all"):
        img = generate_pulse_donut(data)
        if img:
            path = f"{args.output}/pulse_donut.png"
            with open(path, "wb") as f:
                f.write(img)
            print(f"Donut: {path} ({len(img)} bytes)")
            charts.append(("donut", img, "What X is debating today — share of engagement across trending topics."))

    if args.type in ("wordcloud", "all"):
        img = generate_pulse_wordcloud(data)
        if img:
            path = f"{args.output}/pulse_wordcloud.png"
            with open(path, "wb") as f:
                f.write(img)
            print(f"Word cloud: {path} ({len(img)} bytes)")
            charts.append(("wordcloud", img, "What people are talking about on X today."))

    if args.type in ("quotes", "all"):
        img = generate_pulse_quotes(data)
        if img:
            path = f"{args.output}/pulse_quotes.png"
            with open(path, "wb") as f:
                f.write(img)
            print(f"Quotes: {path} ({len(img)} bytes)")
            trending = data["trending"]
            contested = min(trending, key=lambda t: abs(t.get("stats", {}).get("pro_count", 0) - t.get("stats", {}).get("anti_count", 0)))
            charts.append(("quotes", img, f"Two sides of {contested['name']} — here's what each side is saying on X."))

    if args.post and charts:
        from promo.tweet_generator import post_tweet
        for chart_type, img, text in charts:
            print(f"\nPosting {chart_type}: {text[:60]}...")
            post_tweet(text, img, ".png")
