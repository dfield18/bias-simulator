"""Public demo endpoint — returns live analytics for featured topics (no auth required)."""

from datetime import datetime, timezone, timedelta
from collections import Counter
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from cache import get_cached, set_cache

from database import get_db
from models import Topic, Tweet, Classification

router = APIRouter()


@router.get("/demo/landing")
async def get_landing_data(
    db: AsyncSession = Depends(get_db),
):
    """Return live analytics for the landing page demo. No auth required. Cached for 10 min."""
    cache_key = "demo:landing"
    cached = get_cached(cache_key, ttl=600)
    if cached is not None:
        return cached

    # Use iran-conflict as the demo topic
    slug = "iran-conflict"
    result = await db.execute(select(Topic).where(Topic.slug == slug, Topic.featured == True))
    topic_obj = result.scalar_one_or_none()
    if not topic_obj or not topic_obj.anti_label or not topic_obj.pro_label:
        return {"echo_chamber": None, "frames": None}

    anti_bent = topic_obj.anti_label.lower().replace(" ", "-")
    pro_bent = topic_obj.pro_label.lower().replace(" ", "-")

    since = datetime.now(timezone.utc) - timedelta(hours=48)

    stmt = (
        select(Tweet, Classification)
        .join(Classification, Tweet.id_str == Classification.id_str)
        .where(
            Tweet.topic_slug == slug,
            Tweet.fetched_at >= since,
            Tweet.created_at >= since,
            Classification.about_subject == True,
        )
    )
    rows_result = await db.execute(stmt)
    rows = rows_result.all()

    if not rows:
        return {"echo_chamber": None, "frames": None}

    # --- Echo Chamber Score ---
    anti_tweets = [(t, c) for t, c in rows if c.effective_political_bent == anti_bent]
    pro_tweets = [(t, c) for t, c in rows if c.effective_political_bent == pro_bent]

    # Shared sources
    from urllib.parse import urlparse
    skip_domains = {"twitter.com", "x.com", "t.co", "bit.ly"}
    anti_domains: set[str] = set()
    pro_domains: set[str] = set()
    for t, c in anti_tweets:
        raw = t.raw_json or {}
        for u in (raw.get("entities") or {}).get("urls") or []:
            expanded = u.get("expanded_url", "")
            if expanded:
                try:
                    d = urlparse(expanded).netloc.lower().removeprefix("www.")
                    if d and d not in skip_domains:
                        anti_domains.add(d)
                except Exception:
                    pass
    for t, c in pro_tweets:
        raw = t.raw_json or {}
        for u in (raw.get("entities") or {}).get("urls") or []:
            expanded = u.get("expanded_url", "")
            if expanded:
                try:
                    d = urlparse(expanded).netloc.lower().removeprefix("www.")
                    if d and d not in skip_domains:
                        pro_domains.add(d)
                except Exception:
                    pass

    all_domains = anti_domains | pro_domains
    shared_domains = anti_domains & pro_domains
    source_overlap = round(len(shared_domains) / max(len(all_domains), 1) * 100)

    # Shared frames
    anti_frames: Counter = Counter()
    pro_frames: Counter = Counter()
    for t, c in anti_tweets:
        if c.narrative_frames:
            for f in c.narrative_frames:
                anti_frames[f] += 1
    for t, c in pro_tweets:
        if c.narrative_frames:
            for f in c.narrative_frames:
                pro_frames[f] += 1

    all_frame_keys = set(anti_frames.keys()) | set(pro_frames.keys())
    shared_frame_keys = set(anti_frames.keys()) & set(pro_frames.keys())
    frame_overlap = round(len(shared_frame_keys) / max(len(all_frame_keys), 1) * 100)

    echo_score = round((source_overlap + frame_overlap) / 2)

    # --- What Each Side Argues (top frames) ---
    from pipeline.framing import get_topic_labels_async
    frame_labels, _ = await get_topic_labels_async(db, slug)

    anti_total = sum(anti_frames.values()) or 1
    pro_total = sum(pro_frames.values()) or 1

    frames_data = []
    for key in sorted(all_frame_keys, key=lambda k: anti_frames.get(k, 0) + pro_frames.get(k, 0), reverse=True)[:8]:
        frames_data.append({
            "key": key,
            "label": frame_labels.get(key, key),
            "anti_pct": round(anti_frames.get(key, 0) / anti_total * 100),
            "pro_pct": round(pro_frames.get(key, 0) / pro_total * 100),
        })

    data = {
        "topic_name": topic_obj.name,
        "anti_label": topic_obj.anti_label,
        "pro_label": topic_obj.pro_label,
        "total_tweets": len(rows),
        "echo_chamber": {
            "score": echo_score,
            "shared_sources": f"{len(shared_domains)} of {len(all_domains)}",
            "shared_frames": f"{len(shared_frame_keys)} of {len(all_frame_keys)}",
            "source_overlap": source_overlap,
            "frame_overlap": frame_overlap,
        },
        "frames": frames_data,
    }

    set_cache(cache_key, data)
    return data
