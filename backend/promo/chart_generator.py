"""
Generate branded chart images for promotional tweets.

Chart types:
  1. side_by_side — bar chart showing relative volume + engagement per side
  2. disconnect — highlights when one side talks more but the other gets heard more
"""

import os
import io
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.ticker as mticker
from matplotlib.patches import FancyBboxPatch


BRAND_BG = "#0a0e17"
BRAND_GRAY = "#1a1f2e"
BRAND_TEXT = "#e5e7eb"
BRAND_MUTED = "#6b7280"
BRAND_BLUE = "#3b82f6"
BRAND_RED = "#ef4444"
BRAND_GREEN = "#22c55e"
BRAND_URL = "dividedview.com"


def _setup_figure(width=8, height=4.5):
    fig, ax = plt.subplots(figsize=(width, height))
    fig.patch.set_facecolor(BRAND_BG)
    ax.set_facecolor(BRAND_BG)
    ax.tick_params(colors=BRAND_MUTED, labelsize=10)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.spines["bottom"].set_color(BRAND_GRAY)
    ax.spines["left"].set_color(BRAND_GRAY)
    return fig, ax


def _add_branding(fig, subject: str):
    fig.text(0.02, 0.02, BRAND_URL, fontsize=8, color=BRAND_MUTED,
             fontstyle="italic", ha="left", va="bottom")
    fig.text(0.98, 0.02, f"Data from the last 48 hours", fontsize=7,
             color=BRAND_MUTED, ha="right", va="bottom")


def _save(fig) -> bytes:
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=150, bbox_inches="tight",
                facecolor=fig.get_facecolor(), edgecolor="none", pad_inches=0.3)
    plt.close(fig)
    buf.seek(0)
    return buf.read()


def generate_side_by_side(stats: dict) -> bytes:
    """Chart 1: relative volume + engagement bars per side."""
    pro = stats["pro"]
    anti = stats["anti"]
    pro_label = stats["pro_label"]
    anti_label = stats["anti_label"]
    subject = stats["subject"]

    total_posts = pro["posts"] + anti["posts"]
    total_eng = pro["total_eng"] + anti["total_eng"]

    if total_posts == 0:
        return b""

    pro_vol_pct = pro["posts"] / total_posts * 100
    anti_vol_pct = anti["posts"] / total_posts * 100
    pro_eng_pct = (pro["total_eng"] / total_eng * 100) if total_eng else 50
    anti_eng_pct = (anti["total_eng"] / total_eng * 100) if total_eng else 50

    fig, ax = _setup_figure(width=8, height=5)

    labels = [anti_label, pro_label]
    vol_pcts = [anti_vol_pct, pro_vol_pct]
    eng_pcts = [anti_eng_pct, pro_eng_pct]

    y_pos = [1.2, 0]
    bar_height = 0.45

    # Volume bars
    bars_vol = ax.barh(
        [y + bar_height / 2 + 0.05 for y in y_pos], vol_pcts, bar_height,
        color=[BRAND_BLUE, BRAND_RED], alpha=0.85, label="Share of posts",
        edgecolor="none", zorder=3,
    )
    # Engagement bars
    bars_eng = ax.barh(
        [y - bar_height / 2 - 0.05 for y in y_pos], eng_pcts, bar_height,
        color=[BRAND_BLUE, BRAND_RED], alpha=0.4, label="Share of engagement",
        edgecolor="none", zorder=3, hatch="//",
    )

    # Labels on bars
    for bar, pct in zip(bars_vol, vol_pcts):
        ax.text(bar.get_width() + 1.5, bar.get_y() + bar.get_height() / 2,
                f"{pct:.0f}% of posts", va="center", ha="left",
                fontsize=10, color=BRAND_TEXT, fontweight="medium")
    for bar, pct in zip(bars_eng, eng_pcts):
        ax.text(bar.get_width() + 1.5, bar.get_y() + bar.get_height() / 2,
                f"{pct:.0f}% of engagement", va="center", ha="left",
                fontsize=10, color=BRAND_MUTED)

    ax.set_yticks(y_pos)
    ax.set_yticklabels(labels, fontsize=13, fontweight="bold", color=BRAND_TEXT)
    ax.set_xlim(0, 110)
    ax.set_xlabel("")
    ax.xaxis.set_visible(False)
    ax.invert_yaxis()

    # Title
    fig.text(0.5, 0.95, f"How X talks about {subject}", fontsize=15,
             fontweight="bold", color=BRAND_TEXT, ha="center", va="top")
    fig.text(0.5, 0.90, "Post volume vs engagement share", fontsize=10,
             color=BRAND_MUTED, ha="center", va="top")

    # Legend
    from matplotlib.patches import Patch
    legend_elements = [
        Patch(facecolor=BRAND_TEXT, alpha=0.8, label="Share of posts"),
        Patch(facecolor=BRAND_TEXT, alpha=0.35, label="Share of engagement", hatch="//"),
    ]
    ax.legend(handles=legend_elements, loc="lower right", fontsize=8,
              facecolor=BRAND_BG, edgecolor=BRAND_GRAY, labelcolor=BRAND_MUTED)

    _add_branding(fig, subject)
    return _save(fig)


def generate_disconnect(stats: dict) -> bytes:
    """Chart 2: highlights when volume and engagement winners differ."""
    pro = stats["pro"]
    anti = stats["anti"]
    pro_label = stats["pro_label"]
    anti_label = stats["anti_label"]
    subject = stats["subject"]

    total_posts = pro["posts"] + anti["posts"]
    total_eng = pro["total_eng"] + anti["total_eng"]

    if total_posts == 0 or total_eng == 0:
        return b""

    pro_vol_pct = pro["posts"] / total_posts * 100
    anti_vol_pct = anti["posts"] / total_posts * 100
    pro_eng_pct = pro["total_eng"] / total_eng * 100
    anti_eng_pct = anti["total_eng"] / total_eng * 100

    fig, ax = _setup_figure(width=8, height=5)

    categories = ["Share of\nposts", "Share of\nengagement"]
    x = [0, 1]
    width = 0.35

    anti_vals = [anti_vol_pct, anti_eng_pct]
    pro_vals = [pro_vol_pct, pro_eng_pct]

    bars_anti = ax.bar([xi - width / 2 - 0.02 for xi in x], anti_vals, width,
                       color=BRAND_BLUE, alpha=0.85, zorder=3, edgecolor="none")
    bars_pro = ax.bar([xi + width / 2 + 0.02 for xi in x], pro_vals, width,
                      color=BRAND_RED, alpha=0.85, zorder=3, edgecolor="none")

    # Percentage labels on top of bars
    for bar, val in zip(bars_anti, anti_vals):
        ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 1.5,
                f"{val:.0f}%", ha="center", va="bottom", fontsize=12,
                fontweight="bold", color=BRAND_BLUE)
    for bar, val in zip(bars_pro, pro_vals):
        ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 1.5,
                f"{val:.0f}%", ha="center", va="bottom", fontsize=12,
                fontweight="bold", color=BRAND_RED)

    ax.set_xticks(x)
    ax.set_xticklabels(categories, fontsize=12, color=BRAND_TEXT, fontweight="medium")
    ax.set_ylim(0, max(max(anti_vals), max(pro_vals)) + 15)
    ax.yaxis.set_visible(False)
    ax.grid(axis="y", color=BRAND_GRAY, alpha=0.3, zorder=0)

    # Title
    vol_winner = anti_label if anti_vol_pct > pro_vol_pct else pro_label
    eng_winner = anti_label if anti_eng_pct > pro_eng_pct else pro_label
    if vol_winner != eng_winner:
        subtitle = f"{vol_winner} talks more, but {eng_winner} gets heard more"
    else:
        subtitle = f"{vol_winner} dominates both volume and engagement"

    fig.text(0.5, 0.96, f"{subject}", fontsize=15,
             fontweight="bold", color=BRAND_TEXT, ha="center", va="top")
    fig.text(0.5, 0.91, subtitle, fontsize=11,
             color=BRAND_MUTED, ha="center", va="top", fontstyle="italic")

    # Legend
    from matplotlib.patches import Patch
    legend_elements = [
        Patch(facecolor=BRAND_BLUE, alpha=0.85, label=anti_label),
        Patch(facecolor=BRAND_RED, alpha=0.85, label=pro_label),
    ]
    ax.legend(handles=legend_elements, loc="upper right", fontsize=10,
              facecolor=BRAND_BG, edgecolor=BRAND_GRAY, labelcolor=BRAND_TEXT)

    _add_branding(fig, subject)
    return _save(fig)


def generate_chart(stats: dict, chart_type: str = "auto") -> tuple[bytes, str]:
    """Generate a chart image. Returns (png_bytes, chart_type_used).

    chart_type: 'side_by_side', 'disconnect', or 'auto' (picks best).
    """
    pro = stats["pro"]
    anti = stats["anti"]
    total_posts = pro["posts"] + anti["posts"]
    total_eng = pro["total_eng"] + anti["total_eng"]

    if total_posts == 0:
        return b"", "none"

    if chart_type == "auto":
        # Use disconnect chart when volume and engagement winners differ
        vol_winner = "pro" if pro["posts"] > anti["posts"] else "anti"
        eng_winner = "pro" if pro["total_eng"] > anti["total_eng"] else "anti"
        if vol_winner != eng_winner:
            chart_type = "disconnect"
        else:
            chart_type = "side_by_side"

    if chart_type == "disconnect":
        return generate_disconnect(stats), "disconnect"
    else:
        return generate_side_by_side(stats), "side_by_side"


if __name__ == "__main__":
    """Preview charts locally."""
    import sys
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from promo.tweet_generator import get_topic_stats, get_featured_slugs

    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--topic", default=None)
    parser.add_argument("--type", default="auto", choices=["auto", "side_by_side", "disconnect"])
    args = parser.parse_args()

    slugs = [args.topic] if args.topic else get_featured_slugs()

    for slug in slugs:
        stats = get_topic_stats(slug)
        if not stats:
            print(f"[{slug}] No data")
            continue
        img, chart_type = generate_chart(stats, args.type)
        if img:
            path = f"/tmp/chart_{slug}_{chart_type}.png"
            with open(path, "wb") as f:
                f.write(img)
            print(f"[{slug}] Saved {chart_type} → {path}")
