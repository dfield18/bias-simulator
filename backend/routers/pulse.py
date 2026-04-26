"""
Daily Pulse API — shows all curated + trending topics at a glance.

GET /api/pulse → returns curated topics (from DB) + trending topics
(persisted in trending_pulse table), each with volume/engagement/sentiment.
"""

import json
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from auth import optional_user
from models import Tweet, Classification, Topic

router = APIRouter()


def refresh_trending_cache():
    """Run discovery + quick classify, persist to DB. Called from scheduler."""
    from pipeline.trending import discover_trending_topics
    from pipeline.quick_classify import quick_analyze_topic
    from pipeline.run import get_sync_connection

    print("[Pulse] Starting trending topic discovery...")
    topics = discover_trending_topics(max_topics=5)
    if not topics:
        print("[Pulse] No trending topics found")
        return

    analyzed = []
    for topic in topics:
        try:
            result = quick_analyze_topic(topic)
            if result["stats"]["total"] > 0:
                analyzed.append(result)
        except Exception as e:
            print(f"[Pulse] Error analyzing {topic.get('name', '?')}: {e}")

    if not analyzed:
        print("[Pulse] No topics with data")
        return

    # Persist to DB
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    conn = get_sync_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO trending_pulse (date, data, updated_at)
            VALUES (%s, %s, NOW())
            ON CONFLICT (date) DO UPDATE SET
                data = EXCLUDED.data,
                updated_at = NOW()
            """,
            (today, json.dumps(analyzed)),
        )
        conn.commit()
        print(f"[Pulse] Persisted {len(analyzed)} trending topics to DB for {today}")
    except Exception as e:
        print(f"[Pulse] DB persist error: {e}")
    finally:
        conn.close()


@router.get("/pulse")
async def get_pulse(
    db: AsyncSession = Depends(get_db),
    user: dict | None = Depends(optional_user),
):
    """Return the daily pulse: curated topics + trending topics."""
    since = datetime.now(timezone.utc) - timedelta(hours=48)

    # Get curated (featured) topics with stats
    stmt = select(Topic).where(Topic.featured == True, Topic.is_active == True).order_by(Topic.name)
    result = await db.execute(stmt)
    featured_topics = result.scalars().all()

    curated = []
    for topic in featured_topics:
        pro_bent = topic.pro_label.lower().replace(" ", "-")
        anti_bent = topic.anti_label.lower().replace(" ", "-")

        stats_stmt = (
            select(
                Classification.effective_political_bent,
                func.count().label("count"),
                func.coalesce(func.sum(Tweet.engagement), 0).label("engagement"),
                func.coalesce(func.sum(Tweet.views), 0).label("views"),
            )
            .select_from(Tweet)
            .join(Classification, Tweet.id_str == Classification.id_str)
            .where(
                Tweet.topic_slug == topic.slug,
                Tweet.fetched_at >= since,
                Tweet.created_at >= since,
                Classification.about_subject == True,
                Classification.effective_political_bent.in_([pro_bent, anti_bent]),
            )
            .group_by(Classification.effective_political_bent)
        )
        stats_result = await db.execute(stats_stmt)
        rows = stats_result.all()

        pro_stats = {"count": 0, "engagement": 0, "views": 0}
        anti_stats = {"count": 0, "engagement": 0, "views": 0}

        for bent, count, eng, views in rows:
            if bent == pro_bent:
                pro_stats = {"count": count, "engagement": int(eng), "views": int(views)}
            elif bent == anti_bent:
                anti_stats = {"count": count, "engagement": int(eng), "views": int(views)}

        total = pro_stats["count"] + anti_stats["count"]
        if total == 0:
            continue

        total_eng = pro_stats["engagement"] + anti_stats["engagement"]

        # Top tweet per side
        sample_pro = []
        sample_anti = []
        for bent, label, samples in [(pro_bent, topic.pro_label, sample_pro), (anti_bent, topic.anti_label, sample_anti)]:
            sample_stmt = (
                select(Tweet.full_text)
                .join(Classification, Tweet.id_str == Classification.id_str)
                .where(
                    Tweet.topic_slug == topic.slug,
                    Tweet.fetched_at >= since,
                    Tweet.created_at >= since,
                    Classification.about_subject == True,
                    Classification.effective_political_bent == bent,
                )
                .order_by(Tweet.engagement.desc())
                .limit(1)
            )
            sample_result = await db.execute(sample_stmt)
            row = sample_result.scalar_one_or_none()
            if row:
                import re
                clean = re.sub(r'https?://\S+', '', row).strip()[:150]
                samples.append(clean)

        curated.append({
            "slug": topic.slug,
            "name": topic.name,
            "pro_label": topic.pro_label,
            "anti_label": topic.anti_label,
            "topic_type": topic.topic_type or "political",
            "total_posts": total,
            "pro_pct": round(pro_stats["count"] / total * 100),
            "anti_pct": round(anti_stats["count"] / total * 100),
            "pro_engagement": pro_stats["engagement"],
            "anti_engagement": anti_stats["engagement"],
            "total_engagement": total_eng,
            "sample_pro": sample_pro,
            "sample_anti": sample_anti,
            "total_views": pro_stats["views"] + anti_stats["views"],
            "has_page": True,
            "url": f"/analytics/{topic.slug}",
        })

    curated.sort(key=lambda x: x["total_engagement"], reverse=True)

    # Get trending topics from DB (today or most recent)
    trending_result = await db.execute(
        text("SELECT data, date, updated_at FROM trending_pulse ORDER BY date DESC LIMIT 1")
    )
    trending_row = trending_result.one_or_none()

    trending = []
    trending_updated_at = None
    if trending_row:
        trending_data = trending_row[0] if isinstance(trending_row[0], list) else json.loads(trending_row[0])
        trending_updated_at = trending_row[2].isoformat() if trending_row[2] else None

        for t in trending_data:
            s = t.get("stats", {})
            total = s.get("total", 0)
            if total == 0:
                continue
            trending.append({
                "slug": t["slug"],
                "name": t["name"],
                "pro_label": t["pro_label"],
                "anti_label": t["anti_label"],
                "description": t.get("description", ""),
                "heat": t.get("heat", 5),
                "total_posts": total,
                "pro_pct": round(s["pro_count"] / total * 100),
                "anti_pct": round(s["anti_count"] / total * 100),
                "pro_engagement": s.get("pro_engagement", 0),
                "anti_engagement": s.get("anti_engagement", 0),
                "total_engagement": s.get("pro_engagement", 0) + s.get("anti_engagement", 0),
                "total_views": s.get("pro_views", 0) + s.get("anti_views", 0),
                "sample_pro": s.get("sample_pro", []),
                "sample_anti": s.get("sample_anti", []),
                "has_page": False,
            })

    return {
        "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "curated": curated,
        "trending": trending,
        "trending_updated_at": trending_updated_at,
    }
