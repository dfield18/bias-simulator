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
    topic_type: str = "political"  # "political" or "company"


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
    topic_type: str = "political"
    color_scheme: str = "political"
    visibility: str = "private"


@router.get("/topics", response_model=list[TopicResponse])
async def get_topics(
    db: AsyncSession = Depends(get_db),
    user: dict | None = Depends(optional_user),
):
    """Return public active topics + user's own private topics + demo topics."""
    from sqlalchemy import or_
    # Demo topics that are always visible (even for unauthenticated users)
    DEMO_SLUGS = {"iran-conflict", "anthropic", "peter-magyar"}
    stmt = select(Topic).where(Topic.is_active == True)
    if user:
        stmt = stmt.where(
            or_(
                Topic.visibility == "public",
                Topic.visibility.is_(None),  # legacy topics without visibility set
                Topic.created_by == user["id"],
                Topic.slug.in_(DEMO_SLUGS),
            )
        )
    else:
        stmt = stmt.where(or_(Topic.visibility == "public", Topic.visibility.is_(None), Topic.slug.in_(DEMO_SLUGS)))
    stmt = stmt.order_by(Topic.name)
    result = await db.execute(stmt)
    topics = result.scalars().all()
    return [TopicResponse.model_validate(t) for t in topics]


@router.post("/topics/suggest", response_model=TopicSuggestion)
async def suggest_topic(body: SuggestRequest, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Use LLM to suggest pro/anti definitions and prompts for a topic."""
    # Free users can suggest (they get 1 topic)
    if user.get("tier") not in ("pro", "admin", "free"):
        raise HTTPException(status_code=403, detail="Please sign up to create topics.")

    from google import genai

    client = genai.Client(api_key=GEMINI_API_KEY)

    if body.topic_type == "company":
        prompt = f"""You are helping set up a CONSUMER SENTIMENT classifier for: "{body.topic_name}"

Generate a complete configuration for analyzing general public and consumer sentiment about this company or brand on X (formerly Twitter).

IMPORTANT: This is NOT about politics or public policy. This is about CONSUMER SENTIMENT — what everyday people, customers, and the public think and feel about this company. Focus on:
- Product/service quality and experiences
- Customer service and support
- Brand perception and reputation
- Value and pricing
- Company culture and leadership
- Innovation and competition
- Consumer complaints and praise

The "anti" side (left side of the UI) represents NEGATIVE consumer sentiment. The "pro" side (right side of the UI) represents POSITIVE consumer sentiment. Use negative intensity scores for negative sentiment and positive scores for positive sentiment.

Return a JSON object with these exact fields:
- topic_name: a clean display name (the company/brand name)
- slug: a URL-friendly slug (lowercase, hyphens, e.g. "tesla", "nike", "meta-platforms")
- description: 1-2 sentence description of the company and why public sentiment about it is notable or divided
- anti_label: "Negative" (this appears on the LEFT of the UI — represents critical/negative consumer sentiment)
- pro_label: "Positive" (this appears on the RIGHT of the UI — represents supportive/positive consumer sentiment)
- anti_definition: 2-3 sentence definition of what negative consumer sentiment about this company looks like — common complaints, frustrations, criticisms from customers and the public. IMPORTANT: Always end the definition with the sentence: "This also includes any other consumer criticisms, complaints, or negative experiences not specifically listed above."
- pro_definition: 2-3 sentence definition of what positive consumer sentiment about this company looks like — praise, satisfaction, brand loyalty, advocacy from customers and the public. IMPORTANT: Always end the definition with the sentence: "This also includes any other consumer praise, positive experiences, or brand advocacy not specifically listed above."
- search_query: an X search query designed to MAXIMIZE relevant tweet capture about this company. Follow these rules:
  1. Include the company name, common abbreviations, ticker symbols, product names
  2. Include the CEO/founder name if they are a well-known public figure
  3. Include hashtags people use about the company
  4. Include key product or service names
  5. Use 10-15 OR-separated terms to cast a wide net
  6. Do NOT over-quote — use quotes only for multi-word phrases
  7. Example for Nike: Nike OR @Nike OR #Nike OR #JustDoIt OR "Air Jordan" OR "Nike shoes" OR "Nike app" OR #NikeRunning OR "Nike stock" OR $NKE OR "Nike quality" OR "Nike sale"
- classification_prompt: a complete prompt for classifying tweets about this company by CONSUMER SENTIMENT (NOT politics). Include:
  - Clear description: "positive" = the person expresses approval, satisfaction, praise, excitement, or support for the company/products. "negative" = the person expresses criticism, complaints, disappointment, frustration, or opposition to the company/products.
  - The exact category names: "positive" and "negative" (lowercase)
  - Instructions to also classify as "neutral" (factual news, objective statements) or "unclear"
  - CRITICAL about_subject guidance: The about_subject field must be FALSE if the tweet merely MENTIONS the company/platform name incidentally but is not actually ABOUT the company. Examples of about_subject=false: "I saw on Facebook that..." (using the platform, not discussing it), "posted on Instagram" (just the medium), "shared a TikTok video" (referencing the platform as a tool). Examples of about_subject=true: "Facebook's algorithm is terrible" (criticizing the company), "I love Nike shoes" (opinion about the product), "Meta stock crashed" (about the company's business). The tweet must be expressing an opinion, news, or commentary ABOUT the company itself, its products, services, leadership, or business — not just using the platform or mentioning the brand name in passing.
  - Guidance on: sarcasm detection, distinguishing personal opinion from news reporting, competitor comparisons (mentioning competitor favorably = negative for this company), separating product reviews from stock/investor commentary
  - The output should classify each tweet's political_bent (use "positive"/"negative" — this field name is reused for sentiment), about_subject, author_lean, classification_basis, confidence
- intensity_prompt: a complete prompt for scoring consumer sentiment intensity (-10 to +10). Include:
  - What mild negative sentiment looks like: minor complaint, slight disappointment (-1 to -3)
  - What moderate negative sentiment looks like: frustrated review, public complaint (-4 to -6)
  - What extreme negative sentiment looks like: boycott calls, viral outrage, legal threats (-7 to -10)
  - What mild positive sentiment looks like: casual mention, general approval (+1 to +3)
  - What moderate positive sentiment looks like: product recommendation, brand praise (+4 to +6)
  - What extreme positive sentiment looks like: brand evangelism, viral praise, emotional loyalty (+7 to +10)
  - Scoring: -10 to -1 for negative intensity, 1 to 10 for positive intensity
- custom_frames: an array of 6-8 narrative frames specific to consumer discourse about THIS company. Each frame is an object with:
  - "key": a lowercase-hyphenated identifier (e.g. "product-quality", "customer-service")
  - "label": a human-readable display label (e.g. "Product Quality", "Customer Service")
  Think about what specific topics consumers discuss about this company: product quality, pricing, customer service, innovation, brand image, leadership, sustainability, competition, etc.
  Examples for Nike: "product-quality", "pricing-value", "athlete-endorsements", "brand-image", "sustainability", "customer-service", "design-innovation", "competitor-comparison"
- custom_emotions: an array of 5-7 emotional tones specific to consumer discourse about THIS company. Each emotion is an object with:
  - "key": a lowercase-hyphenated identifier (e.g. "brand-loyalty", "consumer-frustration")
  - "label": a human-readable display label (e.g. "Brand Loyalty", "Consumer Frustration")
  Capture the dominant consumer emotional registers: loyalty, frustration, excitement, disappointment, nostalgia, outrage, satisfaction, etc.
  Examples for Nike: "brand-loyalty", "consumer-frustration", "hype-excitement", "price-outrage", "nostalgic-attachment", "quality-disappointment"

Make the classification_prompt and intensity_prompt detailed and specific to this company — not generic. Focus entirely on CONSUMER SENTIMENT, not political analysis.
"""
    else:
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
- search_query: an X search query designed to MAXIMIZE relevant tweet capture. Follow these rules:
  1. Mix quoted exact phrases AND unquoted keyword combinations: e.g. "AI regulation" OR "regulate AI" OR AI oversight OR AI governance OR "AI bill" OR "AI safety law"
  2. Include VERB FORMS people actually use in tweets: "regulate AI" not just "AI regulation", "ban TikTok" not just "TikTok ban"
  3. Include SLANG, HASHTAGS, and informal terms people use on X: e.g. #AIregulation, #RegulateAI, "big tech regulation"
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
                "max_output_tokens": 32768,
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
        print(f"Failed to parse Gemini response: {text[:500]}")
        raise HTTPException(status_code=500, detail=f"Failed to parse LLM response: {text[:200]}")

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
    # Tier enforcement: free users get 1 topic, pro gets unlimited
    from models import UserTopic
    if user.get("tier") == "free":
        count_result = await db.execute(
            select(func.count()).select_from(UserTopic)
            .where(UserTopic.user_id == user["id"], UserTopic.role == "creator")
        )
        topic_count = count_result.scalar() or 0
        if topic_count >= 1:
            raise HTTPException(
                status_code=403,
                detail="Free plan allows 1 custom topic. Upgrade to Pro for unlimited topics."
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
        topic_type=body.topic_type,
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
async def run_topic_pipeline(slug: str, hours: int = Query(default=48), max_pages: int = Query(default=25), model: str = Query(default="fast"), user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Trigger the pipeline for a topic in a background thread."""
    if model not in ("fast", "balanced", "accurate"):
        raise HTTPException(status_code=400, detail="Invalid model. Must be: fast, balanced, or accurate")
    await _check_topic_pipeline_access(slug, user, db)
    # Tier enforcement
    # Tier-based refresh limits
    if user.get("tier") not in ("pro", "admin", "free"):
        raise HTTPException(status_code=403, detail="Please sign up to refresh data.")
    if user.get("tier") in ("pro", "free"):
        from datetime import datetime, timezone
        from models import FetchRun, UserTopic
        month_start = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        max_runs = 100 if user.get("tier") == "pro" else 3
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
        if runs_this_month >= max_runs:
            raise HTTPException(
                status_code=403,
                detail=f"You've used {runs_this_month} of {max_runs} monthly data refreshes. Upgrade to Pro for more." if user.get("tier") == "free" else f"You've used {runs_this_month} of {max_runs} monthly data refreshes. Resets on the 1st."
            )

    import threading
    from pipeline.run import run_pipeline

    def _run():
        try:
            run_pipeline(slug, hours=hours, max_pages=max_pages, classification_model=model)
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
