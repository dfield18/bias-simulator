"""Account management endpoints — deletion, data export, and usage stats."""

import os
import httpx
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from auth import get_current_user
from models import User, UserTopic, Topic, Tweet, Classification, FetchRun
from config import tier_limits

CLERK_SECRET_KEY = os.getenv("CLERK_SECRET_KEY", "")

router = APIRouter()


@router.get("/account/usage")
async def get_account_usage(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return usage stats: topics created and runs this month."""
    user_id = user["id"]
    tier = user.get("tier", "free")

    # Count topics created
    topic_count_result = await db.execute(
        select(func.count()).select_from(UserTopic)
        .where(UserTopic.user_id == user_id, UserTopic.role == "creator")
    )
    topics_created = topic_count_result.scalar() or 0

    # Count successful runs this month for user's created topics
    month_start = datetime.now(timezone.utc).replace(
        day=1, hour=0, minute=0, second=0, microsecond=0
    )
    creator_topics_result = await db.execute(
        select(UserTopic.topic_slug).where(
            UserTopic.user_id == user_id, UserTopic.role == "creator"
        )
    )
    creator_slugs = [r[0] for r in creator_topics_result.all()]

    runs_this_month = 0
    if creator_slugs:
        run_count_result = await db.execute(
            select(func.count()).select_from(FetchRun)
            .where(FetchRun.ran_at >= month_start)
            .where(FetchRun.status == "success")
            .where(FetchRun.topic_slug.in_(creator_slugs))
        )
        runs_this_month = run_count_result.scalar() or 0

    limits = tier_limits(tier)
    return {
        "topics_created": topics_created,
        "max_topics": limits["max_topics"],
        "runs_this_month": runs_this_month,
        "max_runs": limits["max_runs"],
    }


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

    # Delete the user from Clerk so they can't sign back in
    if CLERK_SECRET_KEY:
        try:
            async with httpx.AsyncClient() as client:
                await client.delete(
                    f"https://api.clerk.com/v1/users/{user_id}",
                    headers={"Authorization": f"Bearer {CLERK_SECRET_KEY}"},
                    timeout=10,
                )
        except Exception as e:
            print(f"[Account] Warning: Failed to delete Clerk user {user_id}: {e}")

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
