from datetime import datetime
from typing import Any, Optional
from sqlalchemy import (
    Boolean, Column, Computed, DateTime, Float, Index, Integer, String, Text,
    ForeignKey, text
)
from sqlalchemy.dialects.postgresql import JSONB, ARRAY
from sqlalchemy.orm import relationship
from pydantic import BaseModel
from database import Base


# ─── SQLAlchemy ORM Models ───────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id = Column(Text, primary_key=True)  # auth provider ID (e.g. Clerk/Auth.js user ID)
    email = Column(Text, unique=True)
    name = Column(Text)
    tier = Column(Text, default="free")  # "free", "pro", "enterprise" — for Stripe tier gating
    stripe_customer_id = Column(Text)  # populated when they subscribe
    created_at = Column(DateTime(timezone=True), server_default=text("NOW()"))


class UserTopic(Base):
    __tablename__ = "user_topics"

    user_id = Column(Text, ForeignKey("users.id"), primary_key=True)
    topic_slug = Column(Text, ForeignKey("topics.slug"), primary_key=True)
    role = Column(Text, nullable=False, default="subscriber")  # "creator" or "subscriber"
    joined_at = Column(DateTime(timezone=True), server_default=text("NOW()"))


class Topic(Base):
    __tablename__ = "topics"

    id = Column(Integer, primary_key=True, autoincrement=True)
    slug = Column(Text, unique=True, nullable=False)
    name = Column(Text, nullable=False)
    description = Column(Text)
    classification_prompt = Column(Text, nullable=False)
    intensity_prompt = Column(Text, nullable=False)
    pro_label = Column(Text, nullable=False)
    anti_label = Column(Text, nullable=False)
    search_query = Column(Text)
    custom_frames = Column(JSONB)   # e.g. [{"key": "deportation-policy", "label": "Deportation Policy"}, ...]
    custom_emotions = Column(JSONB)  # e.g. [{"key": "nationalist-anger", "label": "Nationalist Anger"}, ...]
    target_language = Column(Text, default="en")  # ISO lang code for tweet fetching
    target_country = Column(Text)  # e.g. "United States", "United Kingdom" — for audience relevance filtering
    topic_type = Column(Text, default="political")  # "political" or "company"
    color_scheme = Column(Text, default="political")  # "political" (blue/red) or "neutral" (purple/green)
    account_rules = Column(JSONB)  # e.g. {"foxnews": "pro-bent", "maborosi": "anti-bent"} — override classification for specific accounts
    visibility = Column(Text, default="public")  # "public" or "private"
    featured = Column(Boolean, default=False)  # featured topics visible to free users
    created_by = Column(Text, ForeignKey("users.id"))  # user who created this topic
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=text("NOW()"))


class Tweet(Base):
    __tablename__ = "tweets"

    id_str = Column(Text, primary_key=True)
    topic_slug = Column(Text, ForeignKey("topics.slug"))
    fetched_at = Column(DateTime(timezone=True), server_default=text("NOW()"))
    created_at = Column(DateTime(timezone=True))
    screen_name = Column(Text)
    author_name = Column(Text)
    author_bio = Column(Text)
    author_followers = Column(Integer)
    full_text = Column(Text)
    likes = Column(Integer, default=0)
    retweets = Column(Integer, default=0)
    replies = Column(Integer, default=0)
    quotes = Column(Integer, default=0)
    views = Column(Integer, default=0)
    engagement = Column(
        Integer,
        Computed("likes + retweets + replies + quotes", persisted=True)
    )
    url = Column(Text)
    raw_json = Column(JSONB)

    __table_args__ = (
        Index("idx_tweets_topic_created", "topic_slug", created_at.desc()),
        Index("idx_tweets_views", views.desc()),
    )


class Classification(Base):
    __tablename__ = "classifications"

    id_str = Column(Text, ForeignKey("tweets.id_str"), primary_key=True)
    about_subject = Column(Boolean)
    political_bent = Column(Text)
    author_lean = Column(Text)
    classification_basis = Column(Text)
    confidence = Column(Float)
    agreement = Column(Text)
    classification_method = Column(Text)
    votes = Column(Text)
    intensity_score = Column(Integer)
    intensity_confidence = Column(Float)
    intensity_reasoning = Column(Text)
    intensity_flag = Column(Text)
    classification_cost_usd = Column(Float)
    intensity_cost_usd = Column(Float)
    # Narrative framing
    narrative_frames = Column(ARRAY(Text))  # e.g. ["security-crime", "political-blame"]
    emotion_mode = Column(Text)  # e.g. "fear-threat"
    frame_confidence = Column(Float)
    # Override fields
    override_flag = Column(Boolean, default=False)
    override_political_bent = Column(Text)
    override_intensity_score = Column(Integer)
    override_notes = Column(Text)
    override_at = Column(DateTime(timezone=True))
    # Computed effective columns
    effective_political_bent = Column(
        Text,
        Computed("COALESCE(override_political_bent, political_bent)", persisted=True)
    )
    effective_intensity_score = Column(
        Integer,
        Computed("COALESCE(override_intensity_score, intensity_score)", persisted=True)
    )

    __table_args__ = (
        Index(
            "idx_classifications_bent",
            "effective_political_bent",
            postgresql_where=text("about_subject = TRUE"),
        ),
    )


class AccountType(Base):
    __tablename__ = "account_types"

    screen_name = Column(Text, primary_key=True)  # lowercase
    author_type = Column(Text, nullable=False)  # politician, news, activist, general
    classified_at = Column(DateTime(timezone=True), server_default=text("NOW()"))


class FetchRun(Base):
    __tablename__ = "fetch_runs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    topic_slug = Column(Text, ForeignKey("topics.slug"))
    ran_at = Column(DateTime(timezone=True), server_default=text("NOW()"))
    tweets_fetched = Column(Integer)
    tweets_new = Column(Integer)
    tweets_classified = Column(Integer)
    total_cost_usd = Column(Float)
    status = Column(Text)
    error_message = Column(Text)
    step_timings = Column(JSONB)  # e.g. {"fetch": 3.2, "classify": 12.5, "intensity": 0, "framing": 8.1, "summaries": 5.0, "total": 28.8}


class TopicSummary(Base):
    __tablename__ = "topic_summaries"

    id = Column(Integer, primary_key=True, autoincrement=True)
    topic_slug = Column(Text, ForeignKey("topics.slug"))
    side = Column(Text, nullable=False)  # "overall", "anti", "pro"
    summary_text = Column(Text, nullable=False)
    tweet_count = Column(Integer)
    generated_at = Column(DateTime(timezone=True), server_default=text("NOW()"))


# ─── Pydantic Response Models ────────────────────────────────────────────────

class TopicResponse(BaseModel):
    slug: str
    name: str
    description: Optional[str] = None
    pro_label: str
    anti_label: str
    search_query: Optional[str] = None
    target_language: Optional[str] = "en"
    target_country: Optional[str] = None
    topic_type: Optional[str] = "political"
    color_scheme: Optional[str] = "political"
    account_rules: Optional[dict] = None
    visibility: Optional[str] = "public"
    created_by: Optional[str] = None
    featured: Optional[bool] = False

    model_config = {"from_attributes": True}


class TopicDetailResponse(BaseModel):
    slug: str
    name: str
    description: Optional[str] = None
    pro_label: str
    anti_label: str
    search_query: Optional[str] = None
    classification_prompt: Optional[str] = None
    intensity_prompt: Optional[str] = None
    target_language: Optional[str] = "en"
    target_country: Optional[str] = None
    topic_type: Optional[str] = "political"
    color_scheme: Optional[str] = "political"
    account_rules: Optional[dict] = None
    is_active: Optional[bool] = True
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class MediaItem(BaseModel):
    type: str  # "photo" or "video"
    url: str  # image URL or mp4 URL
    thumbnail: Optional[str] = None  # video thumbnail


class TweetResponse(BaseModel):
    id_str: str
    topic_slug: Optional[str] = None
    created_at: Optional[datetime] = None
    screen_name: Optional[str] = None
    author_name: Optional[str] = None
    author_bio: Optional[str] = None
    author_followers: Optional[int] = None
    full_text: Optional[str] = None
    likes: int = 0
    retweets: int = 0
    replies: int = 0
    quotes: int = 0
    views: int = 0
    engagement: Optional[int] = None
    url: Optional[str] = None
    media: list[MediaItem] = []

    model_config = {"from_attributes": True}


def extract_media(raw_json: dict | None) -> list[MediaItem]:
    """Extract deduplicated media items from raw tweet JSON."""
    if not raw_json:
        return []
    entities = raw_json.get("entities", {})
    media_list = entities.get("media", [])
    if not media_list:
        return []

    seen_urls: set[str] = set()
    items: list[MediaItem] = []

    for m in media_list:
        media_type = m.get("type", "photo")
        if media_type == "video":
            # Pick highest bitrate mp4
            variants = (m.get("video_info") or {}).get("variants", [])
            mp4s = [v for v in variants if v.get("content_type") == "video/mp4"]
            if mp4s:
                best = max(mp4s, key=lambda v: v.get("bitrate", 0))
                video_url = best["url"]
                if video_url not in seen_urls:
                    seen_urls.add(video_url)
                    items.append(MediaItem(
                        type="video",
                        url=video_url,
                        thumbnail=m.get("media_url_https"),
                    ))
        else:
            img_url = m.get("media_url_https", "")
            if img_url and img_url not in seen_urls:
                seen_urls.add(img_url)
                items.append(MediaItem(type="photo", url=img_url))

    return items


class ClassificationResponse(BaseModel):
    id_str: str
    about_subject: Optional[bool] = None
    political_bent: Optional[str] = None
    author_lean: Optional[str] = None
    classification_basis: Optional[str] = None
    confidence: Optional[float] = None
    agreement: Optional[str] = None
    classification_method: Optional[str] = None
    votes: Optional[str] = None
    intensity_score: Optional[int] = None
    intensity_confidence: Optional[float] = None
    intensity_reasoning: Optional[str] = None
    intensity_flag: Optional[str] = None
    override_flag: Optional[bool] = False
    override_political_bent: Optional[str] = None
    override_intensity_score: Optional[int] = None
    override_notes: Optional[str] = None
    override_at: Optional[datetime] = None
    effective_political_bent: Optional[str] = None
    effective_intensity_score: Optional[int] = None
    narrative_frames: Optional[list[str]] = None
    emotion_mode: Optional[str] = None
    frame_confidence: Optional[float] = None

    model_config = {"from_attributes": True}


class FeedItemResponse(BaseModel):
    tweet: TweetResponse
    classification: ClassificationResponse
    feed_score: float


class BreakdownCategory(BaseModel):
    count: int
    pct: float
    avg_engagement: float
    avg_views: float


class IntensityDistribution(BaseModel):
    pro_avg: Optional[float] = None
    anti_avg: Optional[float] = None
    pro_distribution: dict[int, int] = {}
    anti_distribution: dict[int, int] = {}


class BreakdownResponse(BaseModel):
    topic: str
    total_tweets: int
    on_topic: int
    breakdown: dict[str, BreakdownCategory]
    intensity: IntensityDistribution
    last_updated: Optional[datetime] = None


class OverrideRequest(BaseModel):
    id_str: str
    override_political_bent: Optional[str] = None
    override_intensity_score: Optional[int] = None
    override_notes: str = ""
    exclude: Optional[bool] = None  # set to True to hide from analytics

    def model_post_init(self, __context: Any) -> None:
        if self.override_intensity_score is not None:
            if not (-10 <= self.override_intensity_score <= 10):
                raise ValueError("Intensity score must be between -10 and 10")


class OverrideResponse(BaseModel):
    id_str: str
    override_flag: bool
    override_political_bent: Optional[str] = None
    override_intensity_score: Optional[int] = None
    override_notes: Optional[str] = None
    override_at: Optional[datetime] = None
    effective_political_bent: Optional[str] = None
    effective_intensity_score: Optional[int] = None

    model_config = {"from_attributes": True}
