import os
import json
import re
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Topic, TopicResponse, TopicDetailResponse

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


@router.get("/topics", response_model=list[TopicResponse])
async def get_topics(db: AsyncSession = Depends(get_db)):
    """Return all active topics."""
    stmt = select(Topic).where(Topic.is_active == True).order_by(Topic.name)
    result = await db.execute(stmt)
    topics = result.scalars().all()
    return [TopicResponse.model_validate(t) for t in topics]


@router.post("/topics/suggest", response_model=TopicSuggestion)
async def suggest_topic(body: SuggestRequest):
    """Use LLM to suggest pro/anti definitions and prompts for a topic."""
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

    response = client.models.generate_content(
        model="gemini-2.0-flash",
        contents=prompt,
        config={
            "response_mime_type": "application/json",
            "temperature": 0.3,
        },
    )

    text = response.text or ""
    try:
        if text.startswith("```"):
            text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
        data = json.loads(text)
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="Failed to parse LLM response")

    return TopicSuggestion(**data)


@router.post("/topics/create", response_model=TopicResponse)
async def create_topic(
    body: CreateTopicRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create a new topic from user-adjusted definitions."""
    # Check if slug already exists
    existing = await db.execute(select(Topic).where(Topic.slug == body.slug))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"Topic '{body.slug}' already exists")

    # Rebuild classification prompt with user's definitions baked in
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
        is_active=True,
    )

    db.add(topic)
    await db.commit()
    await db.refresh(topic)

    return TopicResponse.model_validate(topic)


@router.post("/topics/{slug}/run")
async def run_topic_pipeline(slug: str, hours: int = Query(default=48), max_pages: int = Query(default=25)):
    """Trigger the pipeline for a topic in a background thread."""
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
async def get_pipeline_progress(slug: str):
    """Get current pipeline progress for a topic."""
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
    is_active: bool | None = None


@router.get("/topics/{slug}", response_model=TopicDetailResponse)
async def get_topic_detail(slug: str, db: AsyncSession = Depends(get_db)):
    """Get full topic details including prompts."""
    result = await db.execute(select(Topic).where(Topic.slug == slug))
    topic = result.scalar_one_or_none()
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")
    return TopicDetailResponse.model_validate(topic)


@router.put("/topics/{slug}", response_model=TopicDetailResponse)
async def update_topic(
    slug: str,
    body: UpdateTopicRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update a topic's settings."""
    result = await db.execute(select(Topic).where(Topic.slug == slug))
    topic = result.scalar_one_or_none()
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")

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
    if body.target_country is not None:
        topic.target_country = body.target_country
    if body.is_active is not None:
        topic.is_active = body.is_active

    await db.commit()
    await db.refresh(topic)
    return TopicDetailResponse.model_validate(topic)


@router.delete("/topics/{slug}")
async def delete_topic(slug: str, db: AsyncSession = Depends(get_db)):
    """Deactivate a topic (soft delete)."""
    result = await db.execute(select(Topic).where(Topic.slug == slug))
    topic = result.scalar_one_or_none()
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")

    topic.is_active = False
    await db.commit()
    return {"status": "deactivated", "topic": slug}


@router.get("/topics/{slug}/runs")
async def get_topic_runs(slug: str, db: AsyncSession = Depends(get_db)):
    """Get recent pipeline runs for a topic."""
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
