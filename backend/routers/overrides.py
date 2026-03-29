import os
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import (
    Classification, Tweet,
    OverrideRequest, OverrideResponse, ClassificationResponse,
    TweetResponse, extract_media,
)


def tweet_response_with_media(tweet: Tweet) -> TweetResponse:
    resp = TweetResponse.model_validate(tweet)
    resp.media = extract_media(tweet.raw_json)
    return resp

router = APIRouter()

ADMIN_SECRET = os.getenv("ADMIN_SECRET", "")


def _check_admin(x_admin_secret: str = Header(...)):
    if not ADMIN_SECRET or x_admin_secret != ADMIN_SECRET:
        raise HTTPException(status_code=403, detail="Invalid admin secret")


@router.post("/override", response_model=OverrideResponse)
async def create_override(
    body: OverrideRequest,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(_check_admin),
):
    """Manually override a classification."""
    # Check classification exists
    stmt = select(Classification).where(Classification.id_str == body.id_str)
    result = await db.execute(stmt)
    classification = result.scalar_one_or_none()

    if not classification:
        raise HTTPException(status_code=404, detail="Classification not found")

    # Update override fields
    classification.override_flag = True
    classification.override_political_bent = body.override_political_bent
    classification.override_intensity_score = body.override_intensity_score
    classification.override_notes = body.override_notes
    classification.override_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(classification)

    return OverrideResponse.model_validate(classification)


@router.get("/overrides")
async def get_overrides(
    topic: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _: str = Depends(_check_admin),
):
    """Get all overridden classifications."""
    stmt = (
        select(Tweet, Classification)
        .join(Classification, Tweet.id_str == Classification.id_str)
        .where(Classification.override_flag == True)
    )
    if topic:
        stmt = stmt.where(Tweet.topic_slug == topic)

    stmt = stmt.order_by(Classification.override_at.desc())
    result = await db.execute(stmt)
    rows = result.all()

    return [
        {
            "tweet": tweet_response_with_media(tweet).model_dump(),
            "classification": ClassificationResponse.model_validate(classification).model_dump(),
        }
        for tweet, classification in rows
    ]


@router.get("/admin/tweets")
async def get_admin_tweets(
    topic: str,
    political_bent: str | None = Query(default=None),
    override_only: bool = Query(default=False),
    low_confidence: bool = Query(default=False),
    search: str | None = Query(default=None),
    sort_by: str = Query(default="views"),
    limit: int = Query(default=200, le=5000),
    db: AsyncSession = Depends(get_db),
    _: str = Depends(_check_admin),
):
    """Get all on-topic tweets for admin review."""
    stmt = (
        select(Tweet, Classification)
        .join(Classification, Tweet.id_str == Classification.id_str)
        .where(
            Tweet.topic_slug == topic,
            Classification.about_subject == True,
        )
    )

    if political_bent:
        stmt = stmt.where(Classification.effective_political_bent == political_bent)
    if override_only:
        stmt = stmt.where(Classification.override_flag == True)
    if low_confidence:
        stmt = stmt.where(Classification.confidence < 0.7)
    if search:
        # Escape LIKE wildcards in user input
        safe_search = search.replace("%", r"\%").replace("_", r"\_")
        stmt = stmt.where(
            Tweet.full_text.ilike(f"%{safe_search}%")
            | Tweet.screen_name.ilike(f"%{safe_search}%")
        )

    if sort_by == "confidence":
        stmt = stmt.order_by(Classification.confidence.asc())
    elif sort_by == "recent":
        stmt = stmt.order_by(Tweet.created_at.desc())
    elif sort_by == "engagement":
        stmt = stmt.order_by(Tweet.engagement.desc())
    else:
        stmt = stmt.order_by(Tweet.views.desc())

    stmt = stmt.limit(limit)
    result = await db.execute(stmt)
    rows = result.all()

    return [
        {
            "tweet": tweet_response_with_media(tweet).model_dump(),
            "classification": ClassificationResponse.model_validate(classification).model_dump(),
        }
        for tweet, classification in rows
    ]


@router.get("/admin/stats")
async def get_admin_stats(
    topic: str,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(_check_admin),
):
    """Get classification stats for admin dashboard."""
    from sqlalchemy import func

    base = (
        select(
            Classification.effective_political_bent,
            func.count().label("count"),
            func.avg(Classification.confidence).label("avg_confidence"),
        )
        .join(Tweet, Tweet.id_str == Classification.id_str)
        .where(
            Tweet.topic_slug == topic,
            Classification.about_subject == True,
        )
        .group_by(Classification.effective_political_bent)
    )
    result = await db.execute(base)
    rows = result.all()

    total = sum(r.count for r in rows)
    override_count_result = await db.execute(
        select(func.count())
        .select_from(Classification)
        .join(Tweet, Tweet.id_str == Classification.id_str)
        .where(
            Tweet.topic_slug == topic,
            Classification.about_subject == True,
            Classification.override_flag == True,
        )
    )
    override_count = override_count_result.scalar() or 0

    low_conf_result = await db.execute(
        select(func.count())
        .select_from(Classification)
        .join(Tweet, Tweet.id_str == Classification.id_str)
        .where(
            Tweet.topic_slug == topic,
            Classification.about_subject == True,
            Classification.confidence < 0.7,
        )
    )
    low_conf_count = low_conf_result.scalar() or 0

    return {
        "total": total,
        "overrides": override_count,
        "low_confidence": low_conf_count,
        "by_bent": {
            r.effective_political_bent: {
                "count": r.count,
                "avg_confidence": round(float(r.avg_confidence or 0), 3),
            }
            for r in rows
        },
    }
