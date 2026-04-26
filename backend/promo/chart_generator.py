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
    ax.set_ylim(0, max(max(anti_vals), max(pro_vals)) + 20)
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

    # Legend — placed below the subtitle, above the chart
    from matplotlib.patches import Patch
    legend_elements = [
        Patch(facecolor=BRAND_BLUE, alpha=0.85, label=anti_label),
        Patch(facecolor=BRAND_RED, alpha=0.85, label=pro_label),
    ]
    fig.legend(handles=legend_elements, loc="upper center", fontsize=9,
               ncol=2, bbox_to_anchor=(0.5, 0.88),
               facecolor=BRAND_BG, edgecolor=BRAND_GRAY, labelcolor=BRAND_TEXT)

    _add_branding(fig, subject)
    return _save(fig)


def generate_echo_gauge(stats: dict) -> bytes:
    """Chart 3: semicircular gauge showing echo chamber overlap score."""
    import numpy as np

    score = stats.get("echo_score")
    subject = stats["subject"]
    if score is None:
        return b""

    fig, ax = _setup_figure(width=7, height=5)
    ax.set_xlim(-1.3, 1.3)
    ax.set_ylim(-0.3, 1.4)
    ax.set_aspect("equal")
    ax.axis("off")

    # Draw gauge arc segments
    theta = np.linspace(np.pi, 0, 200)
    # Background arc
    for i in range(len(theta) - 1):
        pct = i / len(theta)
        if pct < 0.25:
            c = "#ef4444"
        elif pct < 0.5:
            c = "#f97316"
        elif pct < 0.75:
            c = "#eab308"
        else:
            c = "#22c55e"
        ax.plot(
            [np.cos(theta[i]), np.cos(theta[i + 1])],
            [np.sin(theta[i]), np.sin(theta[i + 1])],
            color=c, linewidth=18, solid_capstyle="butt", alpha=0.2, zorder=1,
        )

    # Active arc up to the score
    score_theta = np.pi - (score / 100) * np.pi
    active_theta = np.linspace(np.pi, score_theta, max(int(score * 2), 2))
    for i in range(len(active_theta) - 1):
        pct = (np.pi - active_theta[i]) / np.pi
        if pct < 0.25:
            c = "#ef4444"
        elif pct < 0.5:
            c = "#f97316"
        elif pct < 0.75:
            c = "#eab308"
        else:
            c = "#22c55e"
        ax.plot(
            [np.cos(active_theta[i]), np.cos(active_theta[i + 1])],
            [np.sin(active_theta[i]), np.sin(active_theta[i + 1])],
            color=c, linewidth=18, solid_capstyle="butt", alpha=0.85, zorder=2,
        )

    # Needle
    needle_angle = np.pi - (score / 100) * np.pi
    ax.plot([0, 0.7 * np.cos(needle_angle)], [0, 0.7 * np.sin(needle_angle)],
            color=BRAND_TEXT, linewidth=2.5, zorder=3)
    ax.plot(0, 0, "o", color=BRAND_TEXT, markersize=8, zorder=4)

    # Score text
    if score <= 20:
        level = "Strong Echo Chamber"
        level_color = "#ef4444"
    elif score <= 40:
        level = "Moderate Echo Chamber"
        level_color = "#f97316"
    elif score <= 60:
        level = "Some Overlap"
        level_color = "#eab308"
    else:
        level = "Shared Conversation"
        level_color = "#22c55e"

    ax.text(0, -0.15, f"{score}%", fontsize=36, fontweight="bold",
            color=level_color, ha="center", va="top", zorder=5)
    ax.text(0, -0.4, level, fontsize=14, fontweight="medium",
            color=BRAND_TEXT, ha="center", va="top")

    # Scale labels
    ax.text(-1.15, -0.1, "Echo\nchamber", fontsize=8, color=BRAND_MUTED, ha="center", va="top")
    ax.text(1.15, -0.1, "Shared\nconversation", fontsize=8, color=BRAND_MUTED, ha="center", va="top")

    # Title
    fig.text(0.5, 0.97, f"Echo Chamber Score: {subject}", fontsize=15,
             fontweight="bold", color=BRAND_TEXT, ha="center", va="top")
    fig.text(0.5, 0.92, "How much narrative overlap exists between the two sides",
             fontsize=10, color=BRAND_MUTED, ha="center", va="top")

    _add_branding(fig, subject)
    return _save(fig)


def generate_butterfly(stats: dict) -> bytes:
    """Chart 4: butterfly chart showing narrative frames per side."""
    frame_counts = stats.get("frame_counts", {})
    frame_labels = stats.get("frame_labels", {})
    pro_label = stats["pro_label"]
    anti_label = stats["anti_label"]
    subject = stats["subject"]

    pro_frames = frame_counts.get("pro", {})
    anti_frames = frame_counts.get("anti", {})
    all_frames = set(list(pro_frames.keys()) + list(anti_frames.keys()))

    if len(all_frames) < 2:
        return b""

    # Get top frames by combined count
    frame_totals = {f: pro_frames.get(f, 0) + anti_frames.get(f, 0) for f in all_frames}
    top_frames = sorted(frame_totals.keys(), key=lambda f: frame_totals[f], reverse=True)[:7]

    # Convert to percentages of each side's total
    pro_total = sum(pro_frames.values()) or 1
    anti_total = sum(anti_frames.values()) or 1

    labels = [frame_labels.get(f, f.replace("-", " ").title()) for f in top_frames]
    pro_pcts = [pro_frames.get(f, 0) / pro_total * 100 for f in top_frames]
    anti_pcts = [anti_frames.get(f, 0) / anti_total * 100 for f in top_frames]

    fig, ax = _setup_figure(width=9, height=6)

    y = list(range(len(top_frames)))
    bar_height = 0.55

    # Anti bars extend left (negative), Pro bars extend right
    ax.barh(y, [-p for p in anti_pcts], bar_height, color=BRAND_BLUE, alpha=0.85,
            edgecolor="none", zorder=3, label=anti_label)
    ax.barh(y, pro_pcts, bar_height, color=BRAND_RED, alpha=0.85,
            edgecolor="none", zorder=3, label=pro_label)

    # Percentage labels
    for i, (ap, pp) in enumerate(zip(anti_pcts, pro_pcts)):
        if ap > 0:
            ax.text(-ap - 1.5, i, f"{ap:.0f}%", va="center", ha="right",
                    fontsize=9, color=BRAND_BLUE, fontweight="medium")
        if pp > 0:
            ax.text(pp + 1.5, i, f"{pp:.0f}%", va="center", ha="left",
                    fontsize=9, color=BRAND_RED, fontweight="medium")

    ax.set_yticks(y)
    ax.set_yticklabels(labels, fontsize=11, color=BRAND_TEXT)
    ax.invert_yaxis()

    # Center line
    ax.axvline(0, color=BRAND_GRAY, linewidth=1, zorder=2)

    # Clean up axes
    max_val = max(max(anti_pcts, default=0), max(pro_pcts, default=0))
    ax.set_xlim(-max_val - 15, max_val + 15)
    ax.xaxis.set_visible(False)
    ax.spines["bottom"].set_visible(False)
    ax.spines["left"].set_visible(False)

    # Title + subtitle with enough spacing
    fig.text(0.5, 0.97, f"What each side argues about {subject}", fontsize=15,
             fontweight="bold", color=BRAND_TEXT, ha="center", va="top")

    # Side labels below title, above chart
    fig.text(0.35, 0.91, anti_label, fontsize=12, fontweight="bold",
             color=BRAND_BLUE, ha="center", va="top")
    fig.text(0.65, 0.91, pro_label, fontsize=12, fontweight="bold",
             color=BRAND_RED, ha="center", va="top")

    _add_branding(fig, subject)
    return _save(fig)


def generate_chart(stats: dict, chart_type: str = "auto") -> tuple[bytes, str]:
    """Generate a chart image. Returns (png_bytes, chart_type_used).

    chart_type: 'side_by_side', 'disconnect', 'echo_gauge', 'butterfly', or 'auto'.
    """
    pro = stats["pro"]
    anti = stats["anti"]
    total_posts = pro["posts"] + anti["posts"]
    total_eng = pro["total_eng"] + anti["total_eng"]

    if total_posts == 0:
        return b"", "none"

    if chart_type == "auto":
        import random
        # Pick from available chart types based on data
        options = []
        vol_winner = "pro" if pro["posts"] > anti["posts"] else "anti"
        eng_winner = "pro" if pro["total_eng"] > anti["total_eng"] else "anti"
        if vol_winner != eng_winner:
            options.append("disconnect")
        else:
            options.append("side_by_side")
        if stats.get("echo_score") is not None:
            options.append("echo_gauge")
        if sum(len(v) for v in stats.get("frame_counts", {}).values()) >= 4:
            options.append("butterfly")
        chart_type = random.choice(options)

    if chart_type == "disconnect":
        return generate_disconnect(stats), "disconnect"
    elif chart_type == "echo_gauge":
        return generate_echo_gauge(stats), "echo_gauge"
    elif chart_type == "butterfly":
        return generate_butterfly(stats), "butterfly"
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
    parser.add_argument("--type", default="auto", choices=["auto", "side_by_side", "disconnect", "echo_gauge", "butterfly"])
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
