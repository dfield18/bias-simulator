from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from auth import admin_required
from pydantic import BaseModel as PydanticBaseModel
from models import (
    Classification, Tweet, Topic,
    OverrideRequest, OverrideResponse, ClassificationResponse,
    TweetResponse, extract_media,
)


def tweet_response_with_media(tweet: Tweet) -> TweetResponse:
    resp = TweetResponse.model_validate(tweet)
    resp.media = extract_media(tweet.raw_json)
    return resp

router = APIRouter()


@router.post("/override", response_model=OverrideResponse)
async def create_override(
    body: OverrideRequest,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(admin_required),
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
    _: dict = Depends(admin_required),
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
    _: dict = Depends(admin_required),
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
    _: dict = Depends(admin_required),
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


class AccountRuleRequest(PydanticBaseModel):
    screen_name: str
    political_bent: str  # the bent value to always assign, or "" to remove


@router.get("/admin/account-rules")
async def get_account_rules(
    topic: str,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(admin_required),
):
    """Get account bias rules for a topic."""
    result = await db.execute(select(Topic).where(Topic.slug == topic))
    topic_obj = result.scalar_one_or_none()
    if not topic_obj:
        return {}
    return topic_obj.account_rules or {}


@router.post("/admin/account-rules")
async def set_account_rule(
    topic: str,
    body: AccountRuleRequest,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(admin_required),
):
    """Set or remove an account bias rule. Also applies overrides to all existing tweets from this account."""
    result = await db.execute(select(Topic).where(Topic.slug == topic))
    topic_obj = result.scalar_one_or_none()
    if not topic_obj:
        raise HTTPException(status_code=404, detail="Topic not found")

    rules = topic_obj.account_rules or {}
    screen_name = body.screen_name.lower().strip().lstrip("@")

    if body.political_bent:
        rules[screen_name] = body.political_bent
    else:
        rules.pop(screen_name, None)

    topic_obj.account_rules = rules
    await db.commit()

    # Apply override to all existing tweets from this account
    if body.political_bent:
        tweet_result = await db.execute(
            select(Tweet.id_str).where(
                Tweet.topic_slug == topic,
                Tweet.screen_name.ilike(screen_name),
            )
        )
        tweet_ids = [row[0] for row in tweet_result.all()]
        if tweet_ids:
            await db.execute(
                update(Classification)
                .where(Classification.id_str.in_(tweet_ids))
                .values(
                    override_political_bent=body.political_bent,
                    override_flag=True,
                    override_notes=f"Account rule: always {body.political_bent}",
                    override_at=datetime.now(timezone.utc),
                )
            )
            await db.commit()

    return {"status": "ok", "rules": rules, "affected_tweets": len(tweet_ids) if body.political_bent else 0}
