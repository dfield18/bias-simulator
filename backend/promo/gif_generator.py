"""
Generate animated GIF of the bias slider sweeping across the distribution,
with real tweet cards that reshuffle based on bias level.
"""

import os
import sys
import io
import re
import math
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch
import imageio.v3 as iio

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

BRAND_BG = "#0a0e17"
BRAND_GRAY = "#1a1f2e"
BRAND_TEXT = "#e5e7eb"
BRAND_MUTED = "#6b7280"
BRAND_BLUE = "#3b82f6"
BRAND_RED = "#ef4444"
BRAND_URL = "dividedview.com"


def _hex_to_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i+2], 16) / 255 for i in (0, 2, 4))


def _truncate(text, max_len=120):
    text = re.sub(r'https?://\S+', '', text).strip()
    # Strip emojis that matplotlib can't render
    text = re.sub(r'[^\x00-\x7F\u00C0-\u024F\u2000-\u206F\u2190-\u21FF]+', '', text).strip()
    if len(text) <= max_len:
        return text
    return text[:max_len - 1].rsplit(" ", 1)[0] + "..."


def _fmt_eng(n):
    if n >= 1_000_000:
        return f"{n / 1_000_000:.1f}M"
    if n >= 1_000:
        return f"{n / 1_000:.0f}K"
    return str(n)


def get_distribution_data(topic_slug: str) -> dict | None:
    """Pull intensity distribution data from the DB."""
    from pipeline.run import get_sync_connection

    conn = get_sync_connection()
    cur = conn.cursor()

    cur.execute(
        "SELECT name, pro_label, anti_label, tweet_hook FROM topics WHERE slug = %s",
        (topic_slug,),
    )
    row = cur.fetchone()
    if not row:
        conn.close()
        return None
    name, pro_label, anti_label, tweet_hook = row

    pro_bent = pro_label.lower().replace(" ", "-")
    anti_bent = anti_label.lower().replace(" ", "-")

    cur.execute(
        """
        SELECT c.effective_intensity_score, COALESCE(t.views, 1),
               t.full_text, t.screen_name, t.engagement,
               c.effective_political_bent
        FROM tweets t JOIN classifications c ON c.id_str = t.id_str
        WHERE t.topic_slug = %s
          AND t.fetched_at >= NOW() - INTERVAL '48 hours'
          AND t.created_at >= NOW() - INTERVAL '48 hours'
          AND c.about_subject = TRUE
          AND c.effective_political_bent IN (%s, %s)
          AND c.effective_intensity_score IS NOT NULL
        """,
        (topic_slug, pro_bent, anti_bent),
    )
    tweets = []
    for r in cur.fetchall():
        tweets.append({
            "score": r[0],
            "views": r[1],
            "text": (r[2] or "")[:200].replace("\n", " ").strip(),
            "author": r[3] or "unknown",
            "engagement": r[4] or 0,
            "bent": r[5],
        })
    conn.close()

    if len(tweets) < 5:
        return None

    return {
        "name": name,
        "subject": tweet_hook or name,
        "pro_label": pro_label,
        "anti_label": anti_label,
        "pro_bent": pro_bent,
        "anti_bent": anti_bent,
        "tweets": tweets,
    }


def _score_tweet(tweet, bias):
    score = tweet["score"]
    eng = tweet["engagement"]
    views = tweet["views"]
    base = math.log10(max(eng, 1)) * 10 + math.log10(max(views, 1)) * 5
    if bias != 0:
        if score < 0:
            if bias < 0:
                base *= 1 + abs(bias) * 0.4
            else:
                base *= max(0.03, 1 - bias * 0.15)
        elif score > 0:
            if bias > 0:
                base *= 1 + bias * 0.4
            else:
                base *= max(0.03, 1 - abs(bias) * 0.15)
    return base


def _build_distribution(tweets, bias, mode="reach"):
    raw = np.zeros(21)
    for t in tweets:
        score = t["score"]
        views = t["views"]
        weight = max(views, 1) if mode == "reach" else 1
        if bias != 0:
            if score < 0:
                if bias < 0:
                    weight *= 1 + abs(bias) * 0.3
                else:
                    weight *= max(0.1, 1 - bias * 0.15)
            elif score > 0:
                if bias > 0:
                    weight *= 1 + bias * 0.3
                else:
                    weight *= max(0.1, 1 - abs(bias) * 0.15)
        idx = max(0, min(20, int(round(score + 10))))
        raw[idx] += weight

    sigma = 1.2
    smoothed = np.zeros(21)
    for i in range(21):
        total = wsum = 0
        for j in range(21):
            w = math.exp(-((i - j) ** 2) / (2 * sigma ** 2))
            total += raw[j] * w
            wsum += w
        smoothed[i] = total / wsum
    return smoothed


def _render_frame(tweets, bias, pro_label, anti_label, pro_bent, anti_bent, subject, max_global):
    """Render distribution chart + top 3 real tweet cards."""
    fig = plt.figure(figsize=(8, 8))
    fig.patch.set_facecolor(BRAND_BG)

    # Distribution chart in upper portion
    ax = fig.add_axes([0.08, 0.50, 0.86, 0.34])
    ax.set_facecolor(BRAND_BG)

    dist = _build_distribution(tweets, bias)
    x = np.arange(21)
    if max_global > 0:
        dist = dist / max_global

    colors = []
    for i in range(21):
        if i < 9:
            t = i / 9
            r = _hex_to_rgb(BRAND_BLUE)
            colors.append((*r, 0.5 + 0.4 * (1 - t)))
        elif i > 11:
            t = (i - 11) / 9
            r = _hex_to_rgb(BRAND_RED)
            colors.append((*r, 0.5 + 0.4 * t))
        else:
            colors.append((*_hex_to_rgb(BRAND_GRAY), 0.6))

    ax.bar(x, dist, width=0.85, color=colors, edgecolor="none", zorder=3)

    slider_x = 10 + bias
    ax.axvline(slider_x, color=BRAND_TEXT, linewidth=2, alpha=0.8, zorder=5, linestyle="--")
    ax.plot(slider_x, -0.03, marker="o", color=BRAND_TEXT, markersize=10, zorder=6, clip_on=False)

    ax.set_xlim(-0.5, 20.5)
    ax.set_ylim(0, 1.1)
    ax.set_xticks([0, 10, 20])
    ax.set_xticklabels([anti_label, "Neutral", pro_label], fontsize=10, color=BRAND_MUTED)
    ax.yaxis.set_visible(False)
    for s in ["top", "right", "left"]:
        ax.spines[s].set_visible(False)
    ax.spines["bottom"].set_color(BRAND_GRAY)

    # Bias label
    abs_bias = abs(bias)
    if abs_bias <= 1:
        bias_text, bias_color = "Neutral", BRAND_MUTED
    elif bias < 0:
        intensity = "Slightly" if abs_bias <= 3 else "Moderately" if abs_bias <= 5 else "Strongly" if abs_bias <= 7.5 else "Extremely"
        bias_text, bias_color = f"{intensity} {anti_label}", BRAND_BLUE
    else:
        intensity = "Slightly" if abs_bias <= 3 else "Moderately" if abs_bias <= 5 else "Strongly" if abs_bias <= 7.5 else "Extremely"
        bias_text, bias_color = f"{intensity} {pro_label}", BRAND_RED

    fig.text(0.5, 0.97, f"Simulated X Feed: {subject}", fontsize=14,
             fontweight="bold", color=BRAND_TEXT, ha="center", va="top")
    fig.text(0.5, 0.93, "How bias reshapes what you see", fontsize=9,
             color=BRAND_MUTED, ha="center", va="top")
    fig.text(0.5, 0.88, bias_text, fontsize=13, fontweight="bold",
             color=bias_color, ha="center", va="top")

    # Top 3 tweet cards
    scored = sorted(tweets, key=lambda t: _score_tweet(t, bias), reverse=True)
    top3 = scored[:3]

    fig.text(0.08, 0.46, "Top posts in this feed:", fontsize=9,
             color=BRAND_MUTED, va="top", fontweight="medium")

    card_top = 0.43
    card_h = 0.125
    card_gap = 0.012
    mx = 0.06  # horizontal margin

    for i, tweet in enumerate(top3):
        y = card_top - i * (card_h + card_gap)
        is_anti = tweet["bent"] == anti_bent
        border_color = BRAND_BLUE if is_anti else BRAND_RED
        side_label = anti_label if is_anti else pro_label

        card = FancyBboxPatch(
            (mx, y - card_h), 1 - 2 * mx, card_h,
            boxstyle="round,pad=0.008", facecolor="#111827",
            edgecolor=border_color, linewidth=1.5,
            transform=fig.transFigure, zorder=3,
        )
        fig.patches.append(card)

        # Author
        fig.text(mx + 0.015, y - 0.012, f"@{tweet['author']}",
                 fontsize=8, fontweight="bold", color=BRAND_TEXT, va="top")
        # Side label
        fig.text(1 - mx - 0.015, y - 0.012, side_label,
                 fontsize=7, color=border_color, ha="right", va="top", fontweight="medium")
        # Tweet text
        fig.text(mx + 0.015, y - 0.035, _truncate(tweet["text"], 110),
                 fontsize=7.5, color="#d1d5db", va="top")
        # Engagement
        fig.text(mx + 0.015, y - card_h + 0.012,
                 f"{_fmt_eng(tweet['engagement'])} engagements  ·  {_fmt_eng(tweet['views'])} views",
                 fontsize=6.5, color=BRAND_MUTED, va="bottom")

    fig.text(0.02, 0.01, BRAND_URL, fontsize=7, color=BRAND_MUTED, ha="left")

    fig.canvas.draw()
    buf = fig.canvas.buffer_rgba()
    img = np.asarray(buf)
    plt.close(fig)
    return img


def generate_slider_gif(topic_slug: str) -> bytes | None:
    """Generate the full bias slider animation GIF with tweet cards."""
    data = get_distribution_data(topic_slug)
    if not data:
        print(f"[{topic_slug}] No distribution data")
        return None

    tweets = data["tweets"]
    pro_label = data["pro_label"]
    anti_label = data["anti_label"]
    pro_bent = data["pro_bent"]
    anti_bent = data["anti_bent"]
    subject = data["subject"]

    # Find global max for consistent y-axis
    max_global = 0
    bias_values = []
    steps = 40
    for i in range(steps):
        t = i / steps
        if t < 0.25:
            bias = -10 * (t / 0.25)
        elif t < 0.5:
            bias = -10 * (1 - (t - 0.25) / 0.25)
        elif t < 0.75:
            bias = 10 * ((t - 0.5) / 0.25)
        else:
            bias = 10 * (1 - (t - 0.75) / 0.25)
        bias_values.append(round(bias, 1))
        dist = _build_distribution(tweets, bias)
        max_global = max(max_global, dist.max())

    print(f"[{topic_slug}] Rendering {len(bias_values)} frames...")
    frames = []
    for bias in bias_values:
        frame = _render_frame(tweets, bias, pro_label, anti_label,
                              pro_bent, anti_bent, subject, max_global)
        frames.append(frame)

    buf = io.BytesIO()
    iio.imwrite(buf, frames, extension=".gif", duration=120, loop=0)
    buf.seek(0)
    gif_bytes = buf.read()
    print(f"[{topic_slug}] GIF: {len(gif_bytes)} bytes, {len(frames)} frames")
    return gif_bytes


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Generate bias slider GIF")
    parser.add_argument("--topic", required=True)
    parser.add_argument("--output", default=None)
    args = parser.parse_args()

    gif = generate_slider_gif(args.topic)
    if gif:
        path = args.output or f"/tmp/slider_{args.topic}.gif"
        with open(path, "wb") as f:
            f.write(gif)
        print(f"Saved → {path}")
