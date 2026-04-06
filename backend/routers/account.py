"""Account management endpoints — deletion and data export."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from auth import get_current_user
from models import User, UserTopic, Topic, Tweet, Classification, FetchRun

router = APIRouter()


@router.delete("/account")
async def delete_account(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete the current user's account and all associated data."""
    user_id = user["id"]

    # Get topics this user created
    creator_topics = await db.execute(
        select(UserTopic.topic_slug).where(
            UserTopic.user_id == user_id,
            UserTopic.role == "creator",
        )
    )
    created_slugs = [r[0] for r in creator_topics.all()]

    # Delete user's created topics and their data
    for slug in created_slugs:
        # Delete classifications for tweets in this topic
        tweet_ids_result = await db.execute(
            select(Tweet.id_str).where(Tweet.topic_slug == slug)
        )
        tweet_ids = [r[0] for r in tweet_ids_result.all()]
        if tweet_ids:
            await db.execute(
                delete(Classification).where(Classification.id_str.in_(tweet_ids))
            )
        # Delete tweets
        await db.execute(delete(Tweet).where(Tweet.topic_slug == slug))
        # Delete fetch runs
        await db.execute(delete(FetchRun).where(FetchRun.topic_slug == slug))
        # Delete the topic
        await db.execute(delete(Topic).where(Topic.slug == slug))

    # Delete all user_topics entries
    await db.execute(delete(UserTopic).where(UserTopic.user_id == user_id))

    # Delete the user record
    await db.execute(delete(User).where(User.id == user_id))

    await db.commit()

    return {"status": "deleted"}


@router.get("/account/export")
async def export_account_data(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Export all data associated with the current user's account."""
    user_id = user["id"]

    # User profile
    user_result = await db.execute(select(User).where(User.id == user_id))
    db_user = user_result.scalar_one_or_none()

    profile = {
        "id": db_user.id if db_user else user_id,
        "email": db_user.email if db_user else None,
        "name": db_user.name if db_user else None,
        "tier": db_user.tier if db_user else "free",
        "created_at": db_user.created_at.isoformat() if db_user and db_user.created_at else None,
    }

    # Topics created
    creator_topics = await db.execute(
        select(UserTopic.topic_slug, UserTopic.role, UserTopic.joined_at)
        .where(UserTopic.user_id == user_id)
    )
    topics = [
        {"slug": r[0], "role": r[1], "joined_at": r[2].isoformat() if r[2] else None}
        for r in creator_topics.all()
    ]

    # Created topic details
    created_slugs = [t["slug"] for t in topics if t["role"] == "creator"]
    topic_details = []
    for slug in created_slugs:
        topic_result = await db.execute(select(Topic).where(Topic.slug == slug))
        topic = topic_result.scalar_one_or_none()
        if topic:
            topic_details.append({
                "slug": topic.slug,
                "name": topic.name,
                "description": topic.description,
                "pro_label": topic.pro_label,
                "anti_label": topic.anti_label,
                "search_query": topic.search_query,
                "created_at": topic.created_at.isoformat() if topic.created_at else None,
            })

    # Pipeline runs for created topics
    runs = []
    for slug in created_slugs:
        runs_result = await db.execute(
            select(FetchRun)
            .where(FetchRun.topic_slug == slug)
            .order_by(FetchRun.ran_at.desc())
            .limit(50)
        )
        for r in runs_result.scalars().all():
            runs.append({
                "topic_slug": r.topic_slug,
                "ran_at": r.ran_at.isoformat() if r.ran_at else None,
                "tweets_fetched": r.tweets_fetched,
                "tweets_classified": r.tweets_classified,
                "total_cost_usd": r.total_cost_usd,
                "status": r.status,
            })

    return {
        "profile": profile,
        "topics": topics,
        "topic_details": topic_details,
        "pipeline_runs": runs,
    }
