import os
import json
import re
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from auth import get_current_user, optional_user
from models import Topic, UserTopic, TopicResponse, TopicDetailResponse


async def _get_topic_or_404(slug: str, db: AsyncSession) -> Topic:
    """Fetch a topic by slug or raise 404."""
    result = await db.execute(select(Topic).where(Topic.slug == slug))
    topic = result.scalar_one_or_none()
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")
    return topic


async def _check_topic_access(slug: str, user: dict, db: AsyncSession) -> Topic:
    """READ access: topic exists and user can view it. Returns topic or raises 404."""
    topic = await _get_topic_or_404(slug, db)
    if topic.visibility != "private" or user.get("tier") == "admin":
        return topic
    if topic.created_by == user["id"]:
        return topic
    sub = await db.execute(
        select(UserTopic).where(UserTopic.user_id == user["id"], UserTopic.topic_slug == slug)
    )
    if sub.scalar_one_or_none():
        return topic
    raise HTTPException(status_code=404, detail="Topic not found")


async def _check_topic_pipeline_access(slug: str, user: dict, db: AsyncSession) -> Topic:
    """PIPELINE access: only creator or admin can manage pipeline runs."""
    topic = await _get_topic_or_404(slug, db)
    if user.get("tier") == "admin":
        return topic
    if topic.created_by == user["id"]:
        return topic
    if topic.visibility == "private":
        raise HTTPException(status_code=404, detail="Topic not found")
    raise HTTPException(
        status_code=403,
        detail="Only the topic creator can manage pipeline runs for this topic",
    )

router = APIRouter()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")


class SuggestRequest(BaseModel):
    topic_name: str


class FrameItem(BaseModel):
    key: str
    label: str


class TopicSuggestion(BaseModel):
    topic_name: str
    slug: str
    description: str
    pro_label: str
    anti_label: str
    pro_definition: str
    anti_definition: str
    search_query: str
    classification_prompt: str
    intensity_prompt: str
    custom_frames: list[FrameItem] = []
    custom_emotions: list[FrameItem] = []


class CreateTopicRequest(BaseModel):
    topic_name: str
    slug: str
    description: str
    pro_label: str
    anti_label: str
    pro_definition: str
    anti_definition: str
    search_query: str
    classification_prompt: str
    intensity_prompt: str
    custom_frames: list[FrameItem] = []
    custom_emotions: list[FrameItem] = []
    target_language: str = "en"
    target_country: str | None = None
    color_scheme: str = "political"
    visibility: str = "public"


@router.get("/topics", response_model=list[TopicResponse])
async def get_topics(
    db: AsyncSession = Depends(get_db),
    user: dict | None = Depends(optional_user),
):
    """Return public active topics + user's own private topics."""
    from sqlalchemy import or_
    stmt = select(Topic).where(Topic.is_active == True)
    if user:
        stmt = stmt.where(
            or_(
                Topic.visibility == "public",
                Topic.visibility.is_(None),  # legacy topics without visibility set
                Topic.created_by == user["id"],
            )
        )
    else:
        stmt = stmt.where(or_(Topic.visibility == "public", Topic.visibility.is_(None)))
    stmt = stmt.order_by(Topic.name)
    result = await db.execute(stmt)
    topics = result.scalars().all()
    return [TopicResponse.model_validate(t) for t in topics]


@router.post("/topics/suggest", response_model=TopicSuggestion)
async def suggest_topic(body: SuggestRequest, user: dict = Depends(get_current_user)):
    """Use LLM to suggest pro/anti definitions and prompts for a topic."""
    if user.get("tier") not in ("pro", "admin"):
        raise HTTPException(status_code=403, detail="Creating topics requires a Pro plan.")

    from google import genai

    client = genai.Client(api_key=GEMINI_API_KEY)

    prompt = f"""You are helping set up a political tweet classifier for the topic: "{body.topic_name}"

Generate a complete configuration for this topic. Think carefully about what the two opposing political sides would be.

IMPORTANT: The "anti" side (left side of the UI) should represent the more liberal/progressive/Democrat-aligned position. The "pro" side (right side of the UI) should represent the more conservative/right-leaning/Republican-aligned position. Use negative intensity scores for liberal positions and positive scores for conservative positions.

Return a JSON object with these exact fields:
- topic_name: a clean display name for the topic
- slug: a URL-friendly slug (lowercase, hyphens, e.g. "us-immigration")
- description: 1-2 sentence description of the topic and why it's politically divisive
- anti_label: short label for the liberal/left/progressive side (this appears on the LEFT of the UI)
- pro_label: short label for the conservative/right side (this appears on the RIGHT of the UI)
- anti_definition: 2-3 sentence definition of what the liberal/left side believes, advocates for, and how they frame the issue
- pro_definition: 2-3 sentence definition of what the conservative/right side believes, advocates for, and how they frame the issue
- search_query: a Twitter search query designed to MAXIMIZE relevant tweet capture. Follow these rules:
  1. Mix quoted exact phrases AND unquoted keyword combinations: e.g. "AI regulation" OR "regulate AI" OR AI oversight OR AI governance OR "AI bill" OR "AI safety law"
  2. Include VERB FORMS people actually use in tweets: "regulate AI" not just "AI regulation", "ban TikTok" not just "TikTok ban"
  3. Include SLANG, HASHTAGS, and informal terms people use on Twitter: e.g. #AIregulation, #RegulateAI, "big tech regulation"
  4. Include KEY PEOPLE and ORGANIZATIONS central to this debate (e.g. specific lawmakers, agencies, companies)
  5. Include both FORMAL and INFORMAL language: "artificial intelligence oversight" AND "AI rules" AND "regulate tech"
  6. Use 10-15 OR-separated terms to cast a wide net — it's better to capture too many tweets (we filter later) than too few
  7. Do NOT over-quote — use quotes only for multi-word phrases where word order matters. Single keywords like AI, regulation, oversight should NOT be quoted
  8. Example for immigration: immigration reform OR "border security" OR deportation OR DACA OR "illegal immigration" OR "asylum seekers" OR ICE raids OR "immigration policy" OR #immigration OR "border wall" OR undocumented OR "migrant crisis"
- classification_prompt: a complete prompt for classifying tweets on this topic. Include:
  - Clear description of what "pro" and "anti" mean for this specific topic
  - The exact category names to use (must match pro_label and anti_label in lowercase-hyphenated form)
  - Instructions to also classify as "neutral" or "unclear"
  - Guidance on handling sarcasm, news reporting vs opinion, edge cases
  - The output should classify each tweet's political_bent, about_subject, author_lean, classification_basis, confidence
- intensity_prompt: a complete prompt for scoring intensity (-10 to +10) on this topic. Include:
  - What mild vs extreme positions look like for each side
  - Specific examples of language/rhetoric at different intensity levels
  - Scoring guidelines from 1-10 and -1 to -10
- custom_frames: an array of 6-8 narrative frames specific to THIS topic. Each frame is an object with:
  - "key": a lowercase-hyphenated identifier (e.g. "deportation-policy", "security-threat")
  - "label": a human-readable display label (e.g. "Deportation Policy", "Security Threat")
  These frames should capture the main ARGUMENTS and ANGLES used in debate about this topic.
  Think about what specific rhetorical frames each side uses — not generic frames, but ones tailored to this exact issue.
  Examples for immigration: "border-security", "family-separation", "economic-burden", "labor-contribution", "rule-of-law", "humanitarian-crisis", "cultural-identity", "political-blame"
- custom_emotions: an array of 5-7 emotional tones specific to THIS topic. Each emotion is an object with:
  - "key": a lowercase-hyphenated identifier (e.g. "nationalist-anger", "humanitarian-grief")
  - "label": a human-readable display label (e.g. "Nationalist Anger", "Humanitarian Grief")
  These should capture the dominant EMOTIONAL MODES found in discourse about this topic.
  Go beyond generic emotions — capture the specific emotional registers that show up in this debate.
  Examples for immigration: "fear-invasion", "compassion-suffering", "outrage-injustice", "patriotic-anger", "pragmatic-concern", "moral-urgency"

Make the classification_prompt and intensity_prompt detailed and specific to this topic — not generic.
"""

    try:
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=prompt,
            config={
                "response_mime_type": "application/json",
                "temperature": 0.3,
            },
        )
    except Exception as e:
        print(f"Gemini API error: {e}")
        raise HTTPException(status_code=502, detail=f"AI service error: {str(e)[:200]}")

    text = response.text or ""
    try:
        if text.startswith("```"):
            text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
        data = json.loads(text)
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="Failed to parse LLM response")

    try:
        return TopicSuggestion(**data)
    except Exception as e:
        print(f"TopicSuggestion validation error: {e}")
        raise HTTPException(status_code=500, detail=f"Invalid suggestion format: {str(e)[:200]}")


@router.post("/topics/create", response_model=TopicResponse)
async def create_topic(
    body: CreateTopicRequest,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Create a new topic from user-adjusted definitions."""
    # Tier enforcement: free users can't create topics
    if user.get("tier") not in ("pro", "admin"):
        raise HTTPException(
            status_code=403,
            detail="Creating topics requires a Pro plan. Upgrade to create your own topics."
        )

    # Check if slug already exists
    existing = await db.execute(select(Topic).where(Topic.slug == body.slug))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"Topic '{body.slug}' already exists")

    topic = Topic(
        slug=body.slug,
        name=body.topic_name,
        description=body.description,
        pro_label=body.pro_label,
        anti_label=body.anti_label,
        search_query=body.search_query,
        classification_prompt=body.classification_prompt,
        intensity_prompt=body.intensity_prompt,
        custom_frames=[f.model_dump() for f in body.custom_frames] if body.custom_frames else None,
        custom_emotions=[e.model_dump() for e in body.custom_emotions] if body.custom_emotions else None,
        target_language=body.target_language,
        target_country=body.target_country,
        color_scheme=body.color_scheme,
        visibility=body.visibility,
        created_by=user["id"],
        is_active=True,
    )

    db.add(topic)
    await db.flush()  # ensure topic exists for FK constraint

    db.add(UserTopic(user_id=user["id"], topic_slug=body.slug, role="creator"))
    await db.commit()
    await db.refresh(topic)

    return TopicResponse.model_validate(topic)


@router.get("/topics/my")
async def get_my_topics(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Return topics the current user is subscribed to or created, with their role."""
    stmt = (
        select(UserTopic.topic_slug, UserTopic.role)
        .where(UserTopic.user_id == user["id"])
    )
    result = await db.execute(stmt)
    rows = result.all()
    return {row.topic_slug: row.role for row in rows}


@router.post("/topics/{slug}/run")
async def run_topic_pipeline(slug: str, hours: int = Query(default=48), max_pages: int = Query(default=25), user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Trigger the pipeline for a topic in a background thread."""
    await _check_topic_pipeline_access(slug, user, db)
    # Tier enforcement
    if user.get("tier") not in ("pro", "admin"):
        raise HTTPException(
            status_code=403,
            detail="Refreshing data requires a Pro plan. Free users can view preloaded topics."
        )
    if user.get("tier") == "pro":
        # Pro: 50 runs per month — count only topics this user created
        from datetime import datetime, timezone
        from models import FetchRun, UserTopic
        month_start = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        creator_topics_result = await db.execute(
            select(UserTopic.topic_slug).where(
                UserTopic.user_id == user["id"],
                UserTopic.role == "creator",
            )
        )
        creator_slugs = [r[0] for r in creator_topics_result.all()]
        if creator_slugs:
            run_count_result = await db.execute(
                select(func.count()).select_from(FetchRun)
                .where(FetchRun.ran_at >= month_start)
                .where(FetchRun.status == "success")
                .where(FetchRun.topic_slug.in_(creator_slugs))
            )
            runs_this_month = run_count_result.scalar() or 0
        else:
            runs_this_month = 0
        if runs_this_month >= 50:
            raise HTTPException(
                status_code=403,
                detail=f"You've used {runs_this_month} of 50 monthly data refreshes. Resets on the 1st."
            )

    import threading
    from pipeline.run import run_pipeline

    def _run():
        try:
            run_pipeline(slug, hours=hours, max_pages=max_pages)
        except Exception as e:
            print(f"Pipeline error for {slug}: {e}")
            # Log failure to fetch_runs
            try:
                from pipeline.run import get_sync_connection, log_fetch_run
                conn = get_sync_connection()
                log_fetch_run(conn, slug, 0, 0, 0, 0.0, "error", str(e))
                conn.close()
            except Exception:
                pass

    thread = threading.Thread(target=_run, daemon=True)
    thread.start()

    return {"status": "started", "topic": slug}


@router.get("/topics/{slug}/progress")
async def get_pipeline_progress(slug: str, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Get current pipeline progress for a topic."""
    await _check_topic_pipeline_access(slug, user, db)
    from pipeline.run import get_progress
    progress = get_progress(slug)
    if not progress:
        return {"running": False}
    return progress


class UpdateTopicRequest(BaseModel):
    topic_name: str | None = None
    description: str | None = None
    pro_label: str | None = None
    anti_label: str | None = None
    search_query: str | None = None
    classification_prompt: str | None = None
    intensity_prompt: str | None = None
    target_language: str | None = None
    target_country: str | None = None
    color_scheme: str | None = None
    is_active: bool | None = None


@router.get("/topics/{slug}", response_model=TopicDetailResponse)
async def get_topic_detail(slug: str, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    """Get full topic details including prompts."""
    topic = await _check_topic_access(slug, user, db)
    return TopicDetailResponse.model_validate(topic)


@router.put("/topics/{slug}", response_model=TopicDetailResponse)
async def update_topic(
    slug: str,
    body: UpdateTopicRequest,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Update a topic's settings. Only the creator or admin can edit."""
    topic = await _check_topic_pipeline_access(slug, user, db)

    if body.topic_name is not None:
        topic.name = body.topic_name
    if body.description is not None:
        topic.description = body.description
    if body.pro_label is not None:
        topic.pro_label = body.pro_label
    if body.anti_label is not None:
        topic.anti_label = body.anti_label
    if body.search_query is not None:
        topic.search_query = body.search_query
    if body.classification_prompt is not None:
        topic.classification_prompt = body.classification_prompt
    if body.intensity_prompt is not None:
        topic.intensity_prompt = body.intensity_prompt
    if body.target_language is not None:
        topic.target_language = body.target_language
    if body.color_scheme is not None:
        topic.color_scheme = body.color_scheme
    if body.target_country is not None:
        topic.target_country = body.target_country
    if body.is_active is not None:
        topic.is_active = body.is_active

    await db.commit()
    await db.refresh(topic)
    return TopicDetailResponse.model_validate(topic)


@router.delete("/topics/{slug}")
async def delete_topic(
    slug: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Deactivate a topic (soft delete). Only the creator or admin can delete."""
    topic = await _check_topic_pipeline_access(slug, user, db)
    topic.is_active = False
    await db.commit()
    return {"status": "deactivated", "topic": slug}


@router.post("/topics/{slug}/subscribe")
async def subscribe_to_topic(
    slug: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Subscribe the current user to a public topic."""
    result = await db.execute(select(Topic).where(Topic.slug == slug, Topic.is_active == True))
    topic = result.scalar_one_or_none()
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")
    if topic.visibility == "private" and topic.created_by != user["id"]:
        raise HTTPException(status_code=403, detail="This topic is private")

    # Check if already subscribed
    existing = await db.execute(
        select(UserTopic).where(UserTopic.user_id == user["id"], UserTopic.topic_slug == slug)
    )
    if existing.scalar_one_or_none():
        return {"status": "already_subscribed"}

    user_topic = UserTopic(user_id=user["id"], topic_slug=slug, role="subscriber")
    db.add(user_topic)
    await db.commit()
    return {"status": "subscribed"}


@router.delete("/topics/{slug}/subscribe")
async def unsubscribe_from_topic(
    slug: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Unsubscribe from a topic. Creators cannot unsubscribe."""
    result = await db.execute(
        select(UserTopic).where(UserTopic.user_id == user["id"], UserTopic.topic_slug == slug)
    )
    user_topic = result.scalar_one_or_none()
    if not user_topic:
        return {"status": "not_subscribed"}
    if user_topic.role == "creator":
        raise HTTPException(status_code=400, detail="Creators cannot unsubscribe from their own topic")

    await db.delete(user_topic)
    await db.commit()
    return {"status": "unsubscribed"}


@router.get("/topics/{slug}/runs")
async def get_topic_runs(slug: str, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    """Get recent pipeline runs for a topic."""
    await _check_topic_access(slug, user, db)
    from models import FetchRun
    stmt = (
        select(FetchRun)
        .where(FetchRun.topic_slug == slug)
        .order_by(FetchRun.ran_at.desc())
        .limit(10)
    )
    result = await db.execute(stmt)
    runs = result.scalars().all()
    return [
        {
            "id": r.id,
            "ran_at": r.ran_at.isoformat() if r.ran_at else None,
            "tweets_fetched": r.tweets_fetched,
            "tweets_new": r.tweets_new,
            "tweets_classified": r.tweets_classified,
            "total_cost_usd": r.total_cost_usd,
            "status": r.status,
            "error_message": r.error_message,
        }
        for r in runs
    ]
