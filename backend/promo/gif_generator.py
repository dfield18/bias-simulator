"""
Generate animated GIF of the bias slider sweeping across the distribution.

Shows how the simulated feed reprioritizes posts as political bias shifts
from one extreme to the other and back.
"""

import os
import sys
import io
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

    # Get tweets with intensity scores and views
    cur.execute(
        """
        SELECT c.effective_intensity_score, COALESCE(t.views, 1)
        FROM tweets t JOIN classifications c ON c.id_str = t.id_str
        WHERE t.topic_slug = %s
          AND t.fetched_at >= NOW() - INTERVAL '48 hours'
          AND c.about_subject = TRUE
          AND c.effective_political_bent IN (%s, %s)
          AND c.effective_intensity_score IS NOT NULL
        """,
        (topic_slug, pro_bent, anti_bent),
    )
    tweets = [(r[0], r[1]) for r in cur.fetchall()]
    conn.close()

    if len(tweets) < 5:
        return None

    return {
        "name": name,
        "subject": tweet_hook or name,
        "pro_label": pro_label,
        "anti_label": anti_label,
        "tweets": tweets,  # list of (intensity_score, views)
    }


def _build_distribution(tweets, bias, mode="reach"):
    """Replicate the SentimentDistribution logic from the frontend."""
    raw = np.zeros(21)

    for score, views in tweets:
        weight = max(views, 1) if mode == "reach" else 1

        # Apply bias boost/suppression (simplified version of frontend scoring)
        if bias != 0:
            if score < 0:  # anti side
                if bias < 0:  # bias toward anti
                    weight *= 1 + abs(bias) * 0.3
                else:
                    weight *= max(0.1, 1 - bias * 0.15)
            elif score > 0:  # pro side
                if bias > 0:  # bias toward pro
                    weight *= 1 + bias * 0.3
                else:
                    weight *= max(0.1, 1 - abs(bias) * 0.15)

        idx = int(round(score + 10))
        idx = max(0, min(20, idx))
        raw[idx] += weight

    # Gaussian smoothing
    sigma = 1.2
    smoothed = np.zeros(21)
    for i in range(21):
        total = 0
        weight_sum = 0
        for j in range(21):
            w = math.exp(-((i - j) ** 2) / (2 * sigma ** 2))
            total += raw[j] * w
            weight_sum += w
        smoothed[i] = total / weight_sum

    return smoothed


def _render_frame(tweets, bias, pro_label, anti_label, subject, max_global):
    """Render a single frame of the distribution at a given bias level."""
    fig, ax = plt.subplots(figsize=(8, 5))
    fig.subplots_adjust(top=0.78, bottom=0.1)
    fig.patch.set_facecolor(BRAND_BG)
    ax.set_facecolor(BRAND_BG)

    dist = _build_distribution(tweets, bias)
    x = np.arange(21)

    # Normalize to global max for consistent y-axis across frames
    if max_global > 0:
        dist = dist / max_global

    # Color each bar based on position (anti=blue, neutral=gray, pro=red)
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

    # Slider position indicator
    slider_x = 10 + bias
    ax.axvline(slider_x, color=BRAND_TEXT, linewidth=2, alpha=0.8, zorder=5, linestyle="--")
    ax.plot(slider_x, -0.03, marker="o", color=BRAND_TEXT, markersize=10, zorder=6,
            clip_on=False)

    # Bias label
    abs_bias = abs(bias)
    if abs_bias <= 1:
        bias_text = "Neutral"
        bias_color = BRAND_MUTED
    elif bias < 0:
        intensity = "Slightly" if abs_bias <= 3 else "Moderately" if abs_bias <= 5 else "Strongly" if abs_bias <= 7.5 else "Extremely"
        bias_text = f"{intensity} {anti_label}"
        bias_color = BRAND_BLUE
    else:
        intensity = "Slightly" if abs_bias <= 3 else "Moderately" if abs_bias <= 5 else "Strongly" if abs_bias <= 7.5 else "Extremely"
        bias_text = f"{intensity} {pro_label}"
        bias_color = BRAND_RED

    # Bias label - positioned above the chart area
    fig.text(0.5, 0.85, bias_text, fontsize=13, fontweight="bold",
             color=bias_color, ha="center", va="top", zorder=7)

    # Axes
    ax.set_xlim(-0.5, 20.5)
    ax.set_ylim(0, 1.1)
    ax.set_xticks([0, 10, 20])
    ax.set_xticklabels([anti_label, "Neutral", pro_label],
                       fontsize=10, color=BRAND_MUTED)
    ax.yaxis.set_visible(False)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.spines["left"].set_visible(False)
    ax.spines["bottom"].set_color(BRAND_GRAY)

    # Title
    fig.text(0.5, 0.97, f"Simulated X Feed: {subject}", fontsize=14,
             fontweight="bold", color=BRAND_TEXT, ha="center", va="top")
    fig.text(0.5, 0.92, "Drag the slider to see how bias reshapes what you see",
             fontsize=9, color=BRAND_MUTED, ha="center", va="top")

    # Branding
    fig.text(0.02, 0.02, BRAND_URL, fontsize=7, color=BRAND_MUTED, ha="left")

    # Convert to image array
    fig.canvas.draw()
    buf = fig.canvas.buffer_rgba()
    img = np.asarray(buf)
    plt.close(fig)
    return img


def generate_slider_gif(topic_slug: str) -> bytes | None:
    """Generate the full bias slider animation GIF."""
    data = get_distribution_data(topic_slug)
    if not data:
        print(f"[{topic_slug}] No distribution data")
        return None

    tweets = data["tweets"]
    pro_label = data["pro_label"]
    anti_label = data["anti_label"]
    subject = data["subject"]

    # Find global max across all bias levels for consistent y-axis
    max_global = 0
    bias_values = []
    # Sweep: 0 → -10 → 0 → +10 → 0 (smooth loop)
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

    # Render frames
    print(f"[{topic_slug}] Rendering {len(bias_values)} frames...")
    frames = []
    for bias in bias_values:
        frame = _render_frame(tweets, bias, pro_label, anti_label, subject, max_global)
        frames.append(frame)

    # Stitch into GIF
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
    parser.add_argument("--output", default=None, help="Output file (default: /tmp/slider_{topic}.gif)")
    args = parser.parse_args()

    gif = generate_slider_gif(args.topic)
    if gif:
        path = args.output or f"/tmp/slider_{args.topic}.gif"
        with open(path, "wb") as f:
            f.write(gif)
        print(f"Saved → {path}")
