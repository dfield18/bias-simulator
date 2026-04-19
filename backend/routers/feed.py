import math
import asyncio
import time as _time
from contextvars import ContextVar
from datetime import datetime, timezone, timedelta
from collections import defaultdict, Counter
from fastapi import APIRouter, Depends, HTTPException, Query, Request

client_ip_var: ContextVar[str] = ContextVar("client_ip", default="unknown")
from sqlalchemy import select, func, and_, case, text
from cache import get_cached, set_cache, cache_ttl_for_topic
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from auth import get_current_user, optional_user
from pydantic import BaseModel
from models import (
    Tweet, Classification, FetchRun, Topic, TopicSummary, UserTopic,
    FeedItemResponse, TweetResponse, ClassificationResponse,
    BreakdownResponse, BreakdownCategory, IntensityDistribution,
    extract_media,
)


def tweet_response_with_media(tweet: Tweet) -> TweetResponse:
    resp = TweetResponse.model_validate(tweet)
    resp.media = extract_media(tweet.raw_json)
    return resp


_ANON_TOPIC_LIMIT = 5       # unique topics per window
_ANON_RATE_WINDOW = 3600    # 1 hour in seconds
# Tracks {ip: {topic_slug: first_access_time}} — only unique topics count
_anon_topics: dict[str, dict[str, float]] = {}


def _check_anon_rate_limit(ip: str, topic_slug: str) -> bool:
    """Return True if the anonymous IP is within the rate limit (5 unique topics/hour)."""
    now = _time.time()
    cutoff = now - _ANON_RATE_WINDOW
    topics = _anon_topics.get(ip, {})
    topics = {slug: t for slug, t in topics.items() if t > cutoff}
    if topic_slug in topics:
        _anon_topics[ip] = topics
        return True
    if len(topics) >= _ANON_TOPIC_LIMIT:
        _anon_topics[ip] = topics
        return False
    topics[topic_slug] = now
    _anon_topics[ip] = topics
    return True


async def _check_feed_topic_access(topic_slug: str, user: dict | None, db: AsyncSession):
    """Check user can access this topic. Raises 404 for private topics the user can't see.

    Allows unauthenticated access to demo topics (unlimited) and public
    topics (rate-limited to 5 unique topics per hour per IP).
    """
    if topic_slug in DEMO_TOPICS:
        return

    if not user:
        result = await db.execute(select(Topic).where(Topic.slug == topic_slug))
        topic_obj = result.scalar_one_or_none()
        if not topic_obj or topic_obj.visibility == "private":
            raise HTTPException(status_code=404, detail="Topic not found")
        ip = client_ip_var.get()
        if not _check_anon_rate_limit(ip, topic_slug):
            raise HTTPException(
                status_code=429,
                detail="You've reached the free limit of 5 topics per hour. Sign up for free to continue.",
            )
        return

    result = await db.execute(select(Topic).where(Topic.slug == topic_slug))
    topic_obj = result.scalar_one_or_none()
    if not topic_obj:
        return
    if topic_obj.visibility != "private" or user.get("tier") == "admin":
        return
    if topic_obj.created_by == user["id"]:
        return
    sub = await db.execute(
        select(UserTopic).where(UserTopic.user_id == user["id"], UserTopic.topic_slug == topic_slug)
    )
    if sub.scalar_one_or_none():
        return
    raise HTTPException(status_code=404, detail="Topic not found")


from config import DEMO_TOPICS

router = APIRouter()


async def _get_latest_run_since(topic: str, db: AsyncSession, fallback_hours: int = 720) -> datetime:
    """Rolling lower bound on tweet.fetched_at for analytics queries.

    Returns now - fallback_hours so consecutive pipeline runs accumulate into
    a moving window rather than replacing each other. Callers must filter on
    Tweet.fetched_at >= since (not created_at) — runs can pull old tweets
    whose created_at wouldn't fall inside a creation-time window.

    `topic` and `db` are kept in the signature for call-site stability; the
    window is currently topic-independent.
    """
    return datetime.now(timezone.utc) - timedelta(hours=fallback_hours)


@router.get("/feed", response_model=list[FeedItemResponse])
async def get_feed(
    topic: str,
    bias: float = Query(default=0.0, ge=-10, le=10),
    limit: int = Query(default=20, le=50),
    hours: int = Query(default=24),
    db: AsyncSession = Depends(get_db),
    user: dict | None = Depends(optional_user),
):
    """Get a simulated feed filtered by political bias (continuous -10 to +10)."""
    await _check_feed_topic_access(topic, user, db)
    since = await _get_latest_run_since(topic, db, fallback_hours=hours)

    # Query tweets with classifications
    stmt = (
        select(Tweet, Classification)
        .join(Classification, Tweet.id_str == Classification.id_str)
        .where(
            Tweet.topic_slug == topic,
            Tweet.fetched_at >= since,
            Classification.about_subject == True,
        )
    )
    result = await db.execute(stmt)
    rows = result.all()

    if not rows:
        return []

    # Get max views for normalization
    max_views = max((t.views or 1) for t, c in rows)

    # Track author tweet counts for diversity penalty
    author_counts: dict[str, int] = defaultdict(int)

    # Score and build feed items
    scored_items = []
    for tweet, classification in rows:
        # Bias weight based on proximity between user bias and tweet intensity
        bias_weight = _get_bias_weight_continuous(
            bias,
            classification.effective_intensity_score,
            classification.effective_political_bent,
        )

        # Normalize views
        base_score = (tweet.views or 0) / max(max_views, 1)

        # Author diversity penalty
        author = tweet.screen_name or ""
        author_counts[author] += 1
        count = author_counts[author]
        if count == 1:
            diversity_penalty = 1.0
        elif count == 2:
            diversity_penalty = 0.7
        else:
            diversity_penalty = 0.5

        feed_score = base_score * bias_weight * diversity_penalty

        scored_items.append(FeedItemResponse(
            tweet=tweet_response_with_media(tweet),
            classification=ClassificationResponse.model_validate(classification),
            feed_score=round(feed_score, 6),
        ))

    # Sort by feed_score descending, take top `limit`
    scored_items.sort(key=lambda x: x.feed_score, reverse=True)
    return scored_items[:limit]


class RawFeedItem(BaseModel):
    tweet: TweetResponse
    classification: ClassificationResponse

    model_config = {"from_attributes": True}


@router.get("/feed/all", response_model=list[RawFeedItem])
async def get_feed_all(
    topic: str,
    hours: int = Query(default=24),
    db: AsyncSession = Depends(get_db),
    user: dict | None = Depends(optional_user),
):
    """Return all on-topic tweets with classifications, unsorted. Client does scoring."""
    await _check_feed_topic_access(topic, user, db)
    since = await _get_latest_run_since(topic, db, fallback_hours=hours)

    stmt = (
        select(Tweet, Classification)
        .join(Classification, Tweet.id_str == Classification.id_str)
        .where(
            Tweet.topic_slug == topic,
            Tweet.fetched_at >= since,
            Classification.about_subject == True,
        )
    )
    result = await db.execute(stmt)
    rows = result.all()

    return [
        RawFeedItem(
            tweet=tweet_response_with_media(tweet),
            classification=ClassificationResponse.model_validate(classification),
        )
        for tweet, classification in rows
    ]


class SmartFeedItem(BaseModel):
    tweet: TweetResponse
    classification: ClassificationResponse
    feed_score: float
    score_breakdown: dict

    model_config = {"from_attributes": True}


# --- Bio keyword sets for account type detection (heuristic fallback) ---
import re as _re

# Words that need word-boundary matching (short/ambiguous terms)
_POLITICIAN_PHRASES = [
    "senator", "representative", "congressman", "congresswoman",
    "governor", "mayor", "legislature", "elected",
    "member of congress", "member of parliament",
    "secretary of", "official account", "government",
    "state representative", "state senator",
    "assemblymember", "alderman", "commissioner",
]
# Regex patterns for short terms that could match inside other words
_POLITICIAN_PATTERNS = [
    _re.compile(r"\brep\.\s"),    # "Rep. Smith" not "represent"
    _re.compile(r"\bsen\.\s"),    # "Sen. Smith" not "sense"
    _re.compile(r"\bm\.?p\.?\b"), # "MP" or "M.P." as whole word
    _re.compile(r"\bmep\b"),      # "MEP" as whole word
]

_ACTIVIST_KEYWORDS = {
    "activist", "organizer", "advocate", "solidarity",
    "grassroots", "abolish", "liberation", "campaigner", "nonprofit",
    "charity", "foundation", "think tank",
}
_MAINSTREAM_NEWS = {
    "reuters", "associated press", "ap news", "new york times",
    "washington post", "fox news", "wall street journal", "politico",
    "bloomberg", "the guardian", "usa today",
}
_PARTISAN_NEWS = {
    "daily wire", "breitbart", "oann", "newsmax", "jacobin",
    "mother jones", "the intercept", "infowars", "epoch times",
    "common dreams", "the blaze", "washington examiner",
    "washington free beacon", "young turks",
}
_NEWS_KEYWORDS = {
    "journalist", "reporter", "editor", "correspondent", "anchor",
    "columnist", "bureau", "newsroom", "investigat",
}
_NATIVE_SOURCES = {"twitter web app", "twitter for iphone", "twitter for android", "x"}


def _detect_account_type(bio: str, topic_type: str = "political") -> str:
    """Heuristic fallback for account type when AI classification is unavailable."""
    bio_lower = (bio or "").lower()

    if topic_type == "company":
        # Company-mode heuristics
        _ANALYST_KW = {"analyst", "research", "advisory", "consulting", "market intelligence", "industry expert", "tech reviewer"}
        _INFLUENCER_KW = {"influencer", "creator", "youtuber", "blogger", "content creator", "streamer", "podcaster"}
        _INVESTOR_KW = {"investor", "trader", "portfolio", "hedge fund", "venture capital", "vc", "fintech", "stock", "wall street", "$"}
        _EMPLOYEE_KW = {"@company", "employee", "engineer at", "work at", "former", "ex-", "insider"}
        _NEWS_KW = {"journalist", "reporter", "editor", "news", "correspondent", "columnist", "bureau", "newsroom"}

        if any(kw in bio_lower for kw in _NEWS_KW):
            return "news_media"
        if any(kw in bio_lower for kw in _ANALYST_KW):
            return "industry_analyst"
        if any(kw in bio_lower for kw in _INFLUENCER_KW):
            return "influencer_creator"
        if any(kw in bio_lower for kw in _INVESTOR_KW):
            return "investor_finance"
        if any(kw in bio_lower for kw in _EMPLOYEE_KW):
            return "employee_insider"
        return "consumer"

    # Political-mode heuristics
    # Check politician — phrases + regex patterns for short terms
    if any(kw in bio_lower for kw in _POLITICIAN_PHRASES):
        return "politician"
    if any(p.search(bio_lower) for p in _POLITICIAN_PATTERNS):
        return "politician"

    # Check known partisan outlets
    if any(kw in bio_lower for kw in _PARTISAN_NEWS):
        return "partisan_news"

    # Check known mainstream outlets
    if any(kw in bio_lower for kw in _MAINSTREAM_NEWS):
        return "mainstream_news"

    # Check general news keywords
    if any(kw in bio_lower for kw in _NEWS_KEYWORDS):
        return "independent_news"

    # Check activist
    if any(kw in bio_lower for kw in _ACTIVIST_KEYWORDS):
        return "activist"

    return "general"


def _detect_media_type(raw_json: dict) -> str:
    """Detect dominant media type from raw tweet JSON."""
    media_items = extract_media(raw_json or {})
    has_video = any(m.type == "video" for m in media_items)
    has_photo = any(m.type == "photo" for m in media_items)
    urls = (raw_json or {}).get("entities", {}).get("urls", [])
    has_ext_link = len(urls) > 0
    if has_video:
        return "video"
    if has_photo:
        return "photo"
    if has_ext_link:
        return "link"
    return "text"


@router.get("/feed/smart")
async def get_smart_feed(
    topic: str,
    bias: float = Query(default=0.0, ge=-10, le=10),
    hours: int = Query(default=720),
    limit: int = Query(default=100, le=500),
    db: AsyncSession = Depends(get_db),
    user: dict | None = Depends(optional_user),
):
    """Advanced feed algorithm with multi-signal scoring."""
    await _check_feed_topic_access(topic, user, db)
    # Round bias for cache key stability
    bias_key = round(bias, 1)
    cache_key = f"{topic}:smart:{bias_key}:{hours}:{limit}"
    cached = get_cached(cache_key, ttl=120)
    if cached is not None:
        return cached

    since = await _get_latest_run_since(topic, db, fallback_hours=hours)

    # Load topic
    topic_result = await db.execute(select(Topic).where(Topic.slug == topic))
    topic_obj = topic_result.scalar_one_or_none()
    if not topic_obj:
        return []

    anti_bent = topic_obj.anti_label.lower().replace(" ", "-")
    pro_bent = topic_obj.pro_label.lower().replace(" ", "-")

    # Fetch all on-topic tweets
    stmt = (
        select(Tweet, Classification)
        .join(Classification, Tweet.id_str == Classification.id_str)
        .where(
            Tweet.topic_slug == topic,
            Tweet.fetched_at >= since,
            Classification.about_subject == True,
        )
    )
    result = await db.execute(stmt)
    rows = result.all()

    if not rows:
        return []

    now = datetime.now(timezone.utc)

    # Load cached account types for fast lookup
    from models import AccountType
    _screen_names = list({(t.screen_name or "").lower() for t, c in rows if t.screen_name})
    _cached_types: dict[str, str] = {}
    if _screen_names:
        _type_result = await db.execute(
            select(AccountType.screen_name, AccountType.author_type)
            .where(AccountType.screen_name.in_(_screen_names))
        )
        _cached_types = {r[0]: r[1] for r in _type_result.all()}

    # Pre-compute normalization values
    max_views = max((t.views or 1) for t, c in rows)
    max_engagement = max((t.engagement or 1) for t, c in rows)
    max_followers = max((t.author_followers or 1) for t, c in rows)

    # Build in-network amplification index: who quoted/replied to what
    # Maps tweet id_str -> list of (political_bent, intensity) of accounts that quoted/replied
    in_network_map: dict[str, list[tuple[str, float]]] = defaultdict(list)
    for t, c in rows:
        raw = t.raw_json or {}
        # If this tweet quotes another tweet, register as in-network engagement
        quoted = raw.get("quoted_status")
        if quoted and quoted.get("id_str"):
            in_network_map[quoted["id_str"]].append((
                c.effective_political_bent or "",
                c.effective_intensity_score or 0,
            ))
        # If this tweet replies to another, register
        reply_to = raw.get("in_reply_to_status_id_str")
        if reply_to:
            in_network_map[reply_to].append((
                c.effective_political_bent or "",
                c.effective_intensity_score or 0,
            ))

    # Determine user's bias side
    bias_magnitude = abs(bias) / 10.0  # 0-1
    user_side = anti_bent if bias < 0 else pro_bent if bias > 0 else ""

    # Score each tweet
    scored = []
    for tweet, classification in rows:
        raw = tweet.raw_json or {}
        breakdown = {}

        # ====== 1. BASE RELEVANCE ======
        # about_subject is already filtered, so base = 1.0
        # Frame confidence as relevance proxy
        frame_conf = classification.frame_confidence or 0.5
        base_relevance = 0.5 + (frame_conf * 0.5)  # 0.5-1.0
        breakdown["base_relevance"] = round(base_relevance, 3)

        # ====== 2. BIAS ALIGNMENT ======
        tweet_bent = classification.effective_political_bent or ""
        tweet_intensity = classification.effective_intensity_score or 0

        if bias == 0:
            # Neutral: adaptively compensate for volume imbalance
            anti_count = sum(1 for _, c in rows if c.effective_political_bent == anti_bent)
            pro_count = sum(1 for _, c in rows if c.effective_political_bent == pro_bent)
            if tweet_bent == anti_bent and anti_count > 0 and pro_count > 0:
                ratio = pro_count / anti_count if pro_count > anti_count else 1.0
                # Adaptive exponent: higher imbalance = stronger compensation
                exp = 0.25 + min(ratio / 20.0, 0.25)  # 0.25-0.50 range
                bias_alignment = min(ratio ** exp, 2.5)
            elif tweet_bent == pro_bent and anti_count > 0 and pro_count > 0:
                ratio = anti_count / pro_count if anti_count > pro_count else 1.0
                exp = 0.25 + min(ratio / 20.0, 0.25)
                bias_alignment = min(ratio ** exp, 2.5)
            else:
                bias_alignment = 1.0
            # Slight moderate preference
            bias_alignment *= (1.0 - (abs(tweet_intensity) / 10.0) * 0.1)
        else:
            same_side = (bias < 0 and tweet_bent == anti_bent) or (bias > 0 and tweet_bent == pro_bent)
            if same_side:
                # Same side: exponential boost — at max bias, 4x multiplier
                bias_alignment = 1.0 + bias_magnitude ** 1.5 * 3.0
            else:
                # Opposite side: exponential suppression — at max bias, 0.03x
                bias_alignment = max(0.03, (1.0 - bias_magnitude) ** 3)

        # "Dunk" amplification: opposite-side content being quoted by same-side accounts
        dunk_boost = 1.0
        in_network_engagers = in_network_map.get(tweet.id_str, [])
        if in_network_engagers and not ((bias < 0 and tweet_bent == anti_bent) or (bias > 0 and tweet_bent == pro_bent)):
            # This is opposite-side content — check if same-side accounts are dunking on it
            same_side_quotes = sum(1 for bent, _ in in_network_engagers if bent == user_side)
            if same_side_quotes >= 2:
                dunk_boost = 1.4
            elif same_side_quotes >= 1:
                dunk_boost = 1.2

        bias_alignment *= dunk_boost
        breakdown["bias_alignment"] = round(bias_alignment, 3)
        breakdown["dunk_boost"] = round(dunk_boost, 3)

        # ====== 3. SOURCE AUTHORITY ======
        followers = tweet.author_followers or 0
        bio = tweet.author_bio or ""
        user_raw = raw.get("user", {})

        # Follower tier (log scale)
        follower_tier = (math.log10(max(followers, 1)) / 7.0)  # ~0.0-1.0

        # Follower/following ratio
        following = user_raw.get("friends_count", 1) or 1
        ff_ratio = min(followers / following, 10) / 10.0

        # Listed count signal
        listed = user_raw.get("listed_count", 0) or 0
        listed_signal = min(listed / 100.0, 1.0)

        # Account age
        user_created = user_raw.get("created_at", "")
        try:
            from dateutil.parser import parse as dt_parse
            account_age_days = max((now - dt_parse(user_created)).days, 1) if user_created else 365
        except Exception:
            account_age_days = 365
        age_signal = min(account_age_days / 365.0, 1.0)

        # Verified
        verified = user_raw.get("verified", False)
        verified_boost = 1.3 if verified else 1.0

        # Account type detection — use AI-classified cache, fall back to heuristic
        screen_lower = (tweet.screen_name or "").lower()
        account_type = _cached_types.get(screen_lower) or _detect_account_type(bio)
        # Migrate legacy "news" values to mainstream_news for heuristic consistency
        if account_type == "news":
            account_type = "mainstream_news"
        activist_boost = 1.4 if account_type == "activist" else 1.0
        news_boost = 1.15 if account_type in ("mainstream_news", "independent_news", "partisan_news") else 1.0

        # Bot detection
        statuses = user_raw.get("statuses_count", 0) or 0
        posts_per_day = statuses / max(account_age_days, 1)
        bot_penalty = 0.3 if posts_per_day > 100 else (0.7 if posts_per_day > 50 else 1.0)

        # Source client
        source_str = (raw.get("source") or "").lower()
        native_boost = 1.0 if any(s in source_str for s in _NATIVE_SOURCES) else 0.75

        source_authority = (
            (follower_tier + ff_ratio + listed_signal + age_signal) / 4.0
            * verified_boost * activist_boost * news_boost * bot_penalty * native_boost
        )
        source_authority = min(source_authority, 2.5)
        breakdown["source_authority"] = round(source_authority, 3)
        breakdown["account_type"] = account_type
        breakdown["bot_penalty"] = round(bot_penalty, 3)

        # ====== 4. FORMAT BOOST ======
        media_type = _detect_media_type(raw)
        format_boost = {
            "video": 2.0,
            "photo": 1.4,
            "link": 0.9,
            "text": 1.0,
        }.get(media_type, 1.0)

        # Quote tweet with commentary > plain text
        is_quote = raw.get("is_quote_status", False)
        if is_quote and tweet.full_text and len(tweet.full_text) > 30:
            format_boost *= 1.3

        # Thread head boost
        conv_id = raw.get("conversation_id_str", "")
        is_thread_head = conv_id == tweet.id_str and not raw.get("in_reply_to_status_id_str")
        if is_thread_head:
            format_boost *= 1.15

        # Deep reply penalty
        if raw.get("in_reply_to_status_id_str") and not is_quote:
            format_boost *= 0.6

        breakdown["format_boost"] = round(format_boost, 3)
        breakdown["media_type"] = media_type

        # ====== 5. ENGAGEMENT SIGNAL ======
        eng = tweet.engagement or 0
        views = tweet.views or 0
        likes = tweet.likes or 0
        retweets = tweet.retweets or 0
        quotes = tweet.quotes or 0
        replies = tweet.replies or 0
        bookmarks = raw.get("bookmark_count", 0) or 0

        # Engagement rate (punches above weight)
        eng_rate = eng / max(followers, 1)

        # Viral velocity
        hours_old = max((now - tweet.created_at).total_seconds() / 3600.0, 0.5) if tweet.created_at else 24
        viral_velocity = views / max(hours_old, 0.5)

        # Bookmark ratio (substantive content)
        bookmark_ratio = bookmarks / max(likes, 1)

        # In-network amplification from same-side accounts
        same_side_engagers = sum(1 for bent, _ in in_network_engagers if bent == user_side) if user_side else 0
        in_network_score = min(same_side_engagers * 0.3, 1.0)

        # Quote-tweet from high-authority same-bias accounts (extra weight)
        high_auth_quotes = sum(
            1 for bent, intensity in in_network_engagers
            if bent == user_side and abs(intensity or 0) >= 5
        ) if user_side else 0
        quote_authority_boost = min(1.0 + high_auth_quotes * 0.2, 1.6)

        engagement_signal = (
            math.log10(max(eng, 1)) / math.log10(max(max_engagement, 10)) * 0.3
            + min(eng_rate * 5, 1.0) * 0.25
            + min(viral_velocity / 5000, 1.0) * 0.2
            + min(bookmark_ratio * 5, 1.0) * 0.1
            + in_network_score * 0.15
        ) * quote_authority_boost

        breakdown["engagement_signal"] = round(engagement_signal, 3)
        breakdown["eng_rate"] = round(eng_rate, 4)
        breakdown["viral_velocity"] = round(viral_velocity, 1)
        breakdown["in_network_score"] = round(in_network_score, 3)

        # ====== 6. RECENCY DECAY ======
        recency = math.exp(-hours_old / 72.0)  # half-life ~72 hours
        breakdown["recency"] = round(recency, 3)
        breakdown["hours_old"] = round(hours_old, 1)

        # ====== 6b. AGE GATE ======
        # Hard exclude old tweets unless they meet viral/active thresholds
        is_flashpoint = len(in_network_engagers) >= 2
        if hours_old > 168:  # > 7 days: exclude entirely
            breakdown["age_gated"] = "excluded_7d"
            continue
        elif hours_old > 48:  # > 48 hours: only if viral or active
            is_viral = eng_rate > 0.05 or eng > 10000
            has_recent_activity = is_flashpoint
            if not is_viral and not has_recent_activity:
                breakdown["age_gated"] = "excluded_48h"
                continue
            breakdown["age_gated"] = "kept_viral" if is_viral else "kept_active"
        else:
            breakdown["age_gated"] = "fresh"

        # ====== 7. EMOTIONAL VALENCE / OUTRAGE ======
        emotion = classification.emotion_mode or ""
        intensity_abs = abs(tweet_intensity)
        # Outrage and conflict get modest boost (Twitter rewards engagement bait)
        outrage_boost = 1.0
        if emotion in ("outrage-anger", "fear-threat", "moral-condemnation"):
            outrage_boost = 1.0 + min(intensity_abs / 10.0, 0.3) * 0.5
        # But extreme toxicity gets penalized
        if intensity_abs >= 9 and emotion == "outrage-anger" and eng_rate < 0.01:
            outrage_boost = 0.4  # low-engagement extreme content = likely toxic
        breakdown["outrage_boost"] = round(outrage_boost, 3)

        # ====== FINAL SCORE ======
        final_score = (
            base_relevance
            * bias_alignment
            * source_authority
            * format_boost
            * engagement_signal
            * recency
            * outrage_boost
        )

        breakdown["final_raw"] = round(final_score, 6)

        scored.append({
            "tweet": tweet,
            "classification": classification,
            "score": final_score,
            "breakdown": breakdown,
            "screen_name": tweet.screen_name or "",
            "domain": "",  # for diversity tracking
            "frames": classification.narrative_frames or [],
        })

    # ====== 8. DIVERSITY PENALTY (applied during ranking) ======
    scored.sort(key=lambda x: -x["score"])

    author_seen: dict[str, int] = defaultdict(int)
    domain_seen: dict[str, int] = defaultdict(int)
    frame_seen: Counter = Counter()

    final_items = []
    for item in scored:
        author = item["screen_name"]
        author_seen[author] += 1
        author_pen = 1.0 / author_seen[author]

        # Domain diversity (from URLs)
        raw = item["tweet"].raw_json or {}
        urls = (raw.get("entities") or {}).get("urls") or []
        domain = ""
        for u in urls:
            exp = u.get("expanded_url", "")
            if exp:
                try:
                    from urllib.parse import urlparse
                    d = urlparse(exp).netloc.lower()
                    if d.startswith("www."):
                        d = d[4:]
                    domain = d
                    break
                except Exception:
                    pass
        domain_pen = 1.0
        if domain:
            domain_seen[domain] += 1
            domain_pen = 1.0 / domain_seen[domain]

        # Frame diversity
        frame_pen = 1.0
        for f in item["frames"]:
            frame_seen[f] += 1
        if item["frames"]:
            max_frame_count = max(frame_seen[f] for f in item["frames"])
            frame_pen = max(0.4, 1.0 - (max_frame_count - 1) * 0.1)

        diversity = author_pen * domain_pen * frame_pen

        final_score = item["score"] * diversity
        item["breakdown"]["author_penalty"] = round(author_pen, 3)
        item["breakdown"]["domain_penalty"] = round(domain_pen, 3)
        item["breakdown"]["frame_penalty"] = round(frame_pen, 3)
        item["breakdown"]["diversity"] = round(diversity, 3)
        item["breakdown"]["final_score"] = round(final_score, 6)

        final_items.append(SmartFeedItem(
            tweet=tweet_response_with_media(item["tweet"]),
            classification=ClassificationResponse.model_validate(item["classification"]),
            feed_score=round(final_score, 6),
            score_breakdown=item["breakdown"],
        ))

    final_items.sort(key=lambda x: x.feed_score, reverse=True)

    # At neutral bias: interleave sides for balanced representation
    if bias == 0:
        anti_items = [i for i in final_items if (i.classification.effective_political_bent or "") == anti_bent]
        pro_items = [i for i in final_items if (i.classification.effective_political_bent or "") == pro_bent]
        other_items = [i for i in final_items if (i.classification.effective_political_bent or "") not in (anti_bent, pro_bent)]

        interleaved = []
        ai, pi, oi = 0, 0, 0
        for slot in range(limit):
            # Pattern: anti, pro, anti, pro, other, repeat
            slot_type = slot % 5
            if slot_type in (0, 2) and ai < len(anti_items):
                interleaved.append(anti_items[ai]); ai += 1
            elif slot_type in (1, 3) and pi < len(pro_items):
                interleaved.append(pro_items[pi]); pi += 1
            elif slot_type == 4 and oi < len(other_items):
                interleaved.append(other_items[oi]); oi += 1
            else:
                # Fill from whichever side has items left
                if ai < len(anti_items):
                    interleaved.append(anti_items[ai]); ai += 1
                elif pi < len(pro_items):
                    interleaved.append(pro_items[pi]); pi += 1
                elif oi < len(other_items):
                    interleaved.append(other_items[oi]); oi += 1
        set_cache(cache_key, interleaved[:limit])
        return interleaved[:limit]

    result = final_items[:limit]
    set_cache(cache_key, result)
    return result


def _get_bias_weight_continuous(
    user_bias: float,
    tweet_intensity: int | None,
    tweet_bent: str | None,
) -> float:
    """
    Calculate bias weight using continuous proximity scoring.
    At bias=0, all tweets weighted equally (raw distribution).
    As bias moves to extremes, weighting gradually kicks in.
    """
    bent = (tweet_bent or "unclear").lower()
    bias_magnitude = abs(user_bias) / 10.0  # 0 to 1

    if tweet_intensity is None or bent in ("neutral", "unclear", "error"):
        return 1.0 - 0.9 * bias_magnitude

    same_side = (user_bias < 0 and tweet_intensity < 0) or (user_bias > 0 and tweet_intensity > 0)
    distance = abs(user_bias - tweet_intensity)
    decay_rate = 0.12 if same_side else 0.35
    polarized_weight = max(5.0 * math.exp(-decay_rate * distance), 0.02)
    return 1.0 + (polarized_weight - 1.0) * bias_magnitude


@router.get("/breakdown", response_model=BreakdownResponse)
async def get_breakdown(
    topic: str,
    hours: int = Query(default=24),
    db: AsyncSession = Depends(get_db),
    user: dict | None = Depends(optional_user),
):
    """Get breakdown stats for a topic."""
    await _check_feed_topic_access(topic, user, db)
    cache_key = f"{topic}:breakdown"
    cached = get_cached(cache_key, ttl=cache_ttl_for_topic(topic))
    if cached is not None:
        return cached
    since = await _get_latest_run_since(topic, db, fallback_hours=hours)

    # Total tweets
    total_stmt = select(func.count()).select_from(Tweet).where(
        Tweet.topic_slug == topic,
        Tweet.fetched_at >= since,
    )
    total_result = await db.execute(total_stmt)
    total_tweets = total_result.scalar() or 0

    # On-topic tweets with classifications
    stmt = (
        select(Tweet, Classification)
        .join(Classification, Tweet.id_str == Classification.id_str)
        .where(
            Tweet.topic_slug == topic,
            Tweet.fetched_at >= since,
            Classification.about_subject == True,
        )
    )
    result = await db.execute(stmt)
    rows = result.all()
    on_topic = len(rows)

    # Load valid bent values for this topic
    topic_result = await db.execute(select(Topic).where(Topic.slug == topic))
    topic_obj = topic_result.scalar_one_or_none()
    valid_bents = {"neutral", "unclear"}
    if topic_obj:
        valid_bents.add(topic_obj.anti_label.lower().replace(" ", "-"))
        valid_bents.add(topic_obj.pro_label.lower().replace(" ", "-"))

    # Build breakdown — bucket invalid values into "unclear"
    categories: dict[str, list] = defaultdict(list)
    for tweet, classification in rows:
        bent = (classification.effective_political_bent or "unclear").lower()
        if bent not in valid_bents:
            bent = "unclear"
        categories[bent].append((tweet, classification))

    breakdown = {}
    for cat_name, items in categories.items():
        count = len(items)
        avg_eng = sum((t.engagement or 0) for t, c in items) / max(count, 1)
        avg_views = sum((t.views or 0) for t, c in items) / max(count, 1)
        breakdown[cat_name] = BreakdownCategory(
            count=count,
            pct=round(count / max(on_topic, 1) * 100, 1),
            avg_engagement=round(avg_eng, 1),
            avg_views=round(avg_views, 1),
        )

    # Intensity distribution
    pro_scores = []
    anti_scores = []
    for tweet, classification in rows:
        score = classification.effective_intensity_score
        if score is not None:
            if score > 0:
                pro_scores.append(score)
            elif score < 0:
                anti_scores.append(score)

    pro_dist = defaultdict(int)
    for s in pro_scores:
        pro_dist[s] += 1

    anti_dist = defaultdict(int)
    for s in anti_scores:
        anti_dist[s] += 1

    intensity = IntensityDistribution(
        pro_avg=round(sum(pro_scores) / len(pro_scores), 2) if pro_scores else None,
        anti_avg=round(sum(anti_scores) / len(anti_scores), 2) if anti_scores else None,
        pro_distribution=dict(pro_dist),
        anti_distribution=dict(anti_dist),
    )

    # Last updated
    last_run_stmt = (
        select(FetchRun.ran_at)
        .where(FetchRun.topic_slug == topic, FetchRun.status == "success")
        .order_by(FetchRun.ran_at.desc())
        .limit(1)
    )
    last_run_result = await db.execute(last_run_stmt)
    last_updated = last_run_result.scalar()

    response = BreakdownResponse(
        topic=topic,
        total_tweets=total_tweets,
        on_topic=on_topic,
        breakdown=breakdown,
        intensity=intensity,
        last_updated=last_updated,
    )
    set_cache(cache_key, response)
    return response


@router.get("/summaries")
async def get_summaries(
    topic: str,
    db: AsyncSession = Depends(get_db),
    user: dict | None = Depends(optional_user),
):
    """Get AI-generated summaries for a topic."""
    await _check_feed_topic_access(topic, user, db)
    stmt = (
        select(TopicSummary)
        .where(TopicSummary.topic_slug == topic)
        .order_by(TopicSummary.side)
    )
    result = await db.execute(stmt)
    summaries = result.scalars().all()

    return {
        s.side: {
            "summary": s.summary_text,
            "tweet_count": s.tweet_count,
            "generated_at": s.generated_at.isoformat() if s.generated_at else None,
        }
        for s in summaries
    }


@router.get("/narrative")
async def get_narrative(
    topic: str,
    hours: int = Query(default=720),
    db: AsyncSession = Depends(get_db),
    user: dict | None = Depends(optional_user),
):
    """Get narrative frame and emotion distributions by side."""
    await _check_feed_topic_access(topic, user, db)
    cache_key = f"{topic}:narrative:{hours}"
    cached = get_cached(cache_key, ttl=cache_ttl_for_topic(topic))
    if cached is not None:
        return cached
    since = await _get_latest_run_since(topic, db, fallback_hours=hours)

    topic_result = await db.execute(select(Topic).where(Topic.slug == topic))
    topic_obj = topic_result.scalar_one_or_none()
    if not topic_obj:
        return {}

    anti_bent = topic_obj.anti_label.lower().replace(" ", "-")
    pro_bent = topic_obj.pro_label.lower().replace(" ", "-")

    # Get all framed tweets
    stmt = (
        select(Tweet, Classification)
        .join(Classification, Tweet.id_str == Classification.id_str)
        .where(
            Tweet.topic_slug == topic,
            Tweet.fetched_at >= since,
            Classification.about_subject == True,
            Classification.narrative_frames != None,
        )
    )
    result = await db.execute(stmt)
    rows = result.all()

    anti_tweets = [(t, c) for t, c in rows if c.effective_political_bent == anti_bent]
    pro_tweets = [(t, c) for t, c in rows if c.effective_political_bent == pro_bent]

    from pipeline.framing import get_topic_labels_async
    topic_frame_labels, topic_emotion_labels = await get_topic_labels_async(db, topic)

    def frame_distribution(tweets):
        counts = {k: 0 for k in topic_frame_labels}
        total = 0
        for t, c in tweets:
            if c.narrative_frames:
                for f in c.narrative_frames:
                    if f in counts:
                        counts[f] += 1
                        total += 1
        return {
            k: {"count": v, "pct": round(v / max(total, 1) * 100, 1)}
            for k, v in counts.items()
        }

    def emotion_distribution(tweets):
        counts = {k: 0 for k in topic_emotion_labels}
        for t, c in tweets:
            if c.emotion_mode and c.emotion_mode in counts:
                counts[c.emotion_mode] += 1
        total = sum(counts.values())
        return {
            k: {"count": v, "pct": round(v / max(total, 1) * 100, 1)}
            for k, v in counts.items()
        }

    anti_frames = frame_distribution(anti_tweets)
    pro_frames = frame_distribution(pro_tweets)
    anti_emotions = emotion_distribution(anti_tweets)
    pro_emotions = emotion_distribution(pro_tweets)

    # Compute frame gaps: biggest differences between sides
    frame_gaps = []
    for key in topic_frame_labels:
        anti_pct = anti_frames[key]["pct"]
        pro_pct = pro_frames[key]["pct"]
        delta = abs(anti_pct - pro_pct)
        if delta >= 3:
            frame_gaps.append({
                "frame": key,
                "label": topic_frame_labels[key],
                "anti_pct": anti_pct,
                "pro_pct": pro_pct,
                "delta": round(delta, 1),
                "dominant_side": "anti" if anti_pct > pro_pct else "pro",
            })
    frame_gaps.sort(key=lambda x: x["delta"], reverse=True)

    # Emotion gaps
    emotion_gaps = []
    for key in topic_emotion_labels:
        anti_pct = anti_emotions[key]["pct"]
        pro_pct = pro_emotions[key]["pct"]
        delta = abs(anti_pct - pro_pct)
        if delta >= 3:
            emotion_gaps.append({
                "emotion": key,
                "label": topic_emotion_labels[key],
                "anti_pct": anti_pct,
                "pro_pct": pro_pct,
                "delta": round(delta, 1),
                "dominant_side": "anti" if anti_pct > pro_pct else "pro",
            })
    emotion_gaps.sort(key=lambda x: x["delta"], reverse=True)

    result = {
        "frames": {
            "anti": anti_frames,
            "pro": pro_frames,
        },
        "emotions": {
            "anti": anti_emotions,
            "pro": pro_emotions,
        },
        "frame_gaps": frame_gaps,
        "emotion_gaps": emotion_gaps,
        "frame_labels": topic_frame_labels,
        "emotion_labels": topic_emotion_labels,
        "anti_label": topic_obj.anti_label,
        "pro_label": topic_obj.pro_label,
        "total_framed": {
            "anti": len(anti_tweets),
            "pro": len(pro_tweets),
        },
    }
    set_cache(cache_key, result)
    return result


def _ratio_label(ratio: float) -> str:
    if ratio < 1.15: return "roughly similar"
    if ratio < 1.5: return "modestly higher"
    if ratio < 2.0: return "clearly higher"
    return "much higher"

def _gap_label(gap: int) -> str:
    if gap < 5: return "minor"
    if gap < 15: return "moderate"
    if gap < 25: return "strong"
    return "very large"

def _overlap_label(pct: int) -> str:
    if pct > 50: return "meaningful shared ecosystem"
    if pct >= 25: return "partial overlap"
    return "largely separate ecosystems"


@router.get("/gap-analysis")
async def get_gap_analysis(
    topic: str,
    hours: int = Query(default=720),
    db: AsyncSession = Depends(get_db),
    user: dict | None = Depends(optional_user),
):
    """Compute comparative diagnostic metrics explaining why the narrative gap exists."""
    await _check_feed_topic_access(topic, user, db)
    cache_key = f"{topic}:gap_analysis"
    cached = get_cached(cache_key, ttl=cache_ttl_for_topic(topic))
    if cached is not None:
        return cached
    since = await _get_latest_run_since(topic, db, fallback_hours=hours)

    topic_result = await db.execute(select(Topic).where(Topic.slug == topic))
    topic_obj = topic_result.scalar_one_or_none()
    if not topic_obj:
        return {}

    anti_bent = topic_obj.anti_label.lower().replace(" ", "-")
    pro_bent = topic_obj.pro_label.lower().replace(" ", "-")
    aL = topic_obj.anti_label
    pL = topic_obj.pro_label

    stmt = (
        select(Tweet, Classification)
        .join(Classification, Tweet.id_str == Classification.id_str)
        .where(Tweet.topic_slug == topic, Tweet.fetched_at >= since, Classification.about_subject == True)
    )
    result = await db.execute(stmt)
    rows = result.all()
    anti_tw = [(t, c) for t, c in rows if c.effective_political_bent == anti_bent]
    pro_tw = [(t, c) for t, c in rows if c.effective_political_bent == pro_bent]

    from urllib.parse import urlparse
    from pipeline.framing import get_topic_labels_async
    from collections import Counter

    topic_frame_labels, topic_emotion_labels = await get_topic_labels_async(db, topic)

    skip_d = {"twitter.com", "x.com", "t.co", "bit.ly", "tinyurl.com", "ow.ly", "buff.ly", "dlvr.it", "ift.tt", "fb.me"}

    # --- A. Source Overlap ---
    def get_domains(tw):
        c: Counter = Counter()
        for t, _ in tw:
            for u in ((t.raw_json or {}).get("entities") or {}).get("urls") or []:
                exp = u.get("expanded_url", "")
                if not exp: continue
                try:
                    d = urlparse(exp).netloc.lower()
                    if d.startswith("www."): d = d[4:]
                    if d and d not in skip_d: c[d] += 1
                except: pass
        return c

    ad, pd = get_domains(anti_tw), get_domains(pro_tw)
    shared = set(ad.keys()) & set(pd.keys())
    if ad or pd:
        at, pt = sum(ad.values()) or 1, sum(pd.values()) or 1
        ov = sum(min(ad[d]/at, pd[d]/pt) for d in shared)
        src_overlap = round(ov * 100)
    else:
        src_overlap = 0

    # --- B. Voice Concentration ---
    def voice_conc(tw, n=5):
        eng: dict = {}
        tot = 0
        for t, _ in tw:
            e = t.engagement or 0; tot += e
            a = t.screen_name or "?"; eng[a] = eng.get(a, 0) + e
        if tot == 0: return 0
        return round(sum(sorted(eng.values(), reverse=True)[:n]) / tot * 100)

    a_vc, p_vc = voice_conc(anti_tw), voice_conc(pro_tw)
    vc_higher_side = aL if a_vc > p_vc else pL
    vc_lower_side = pL if a_vc > p_vc else aL
    vc_high, vc_low = max(a_vc, p_vc), min(a_vc, p_vc)
    vc_ratio = round(vc_high / max(vc_low, 1), 1)
    vc_gap = vc_high - vc_low

    # --- C. Narrative Concentration ---
    def narr_conc(tw, n=2):
        fc: Counter = Counter()
        tot = 0
        for _, c in tw:
            if c.narrative_frames:
                for f in c.narrative_frames: fc[f] += 1; tot += 1
        if tot == 0: return 0, ""
        top = fc.most_common(n)
        return round(sum(v for _, v in top) / tot * 100), topic_frame_labels.get(top[0][0], top[0][0])

    a_nc, a_tf = narr_conc(anti_tw)
    p_nc, p_tf = narr_conc(pro_tw)
    nc_higher_side = aL if a_nc > p_nc else pL
    nc_lower_side = pL if a_nc > p_nc else aL
    nc_high, nc_low = max(a_nc, p_nc), min(a_nc, p_nc)
    nc_gap = nc_high - nc_low
    nc_top_frame = a_tf if a_nc > p_nc else p_tf

    # --- D. Emotional Amplification ---
    def emo_amp(tw):
        eng_e: dict = {}; cnt_e: dict = {}; tot_e = 0; tot_c = 0
        for t, c in tw:
            e = t.engagement or 0; tot_e += e; tot_c += 1
            if c.emotion_mode:
                eng_e[c.emotion_mode] = eng_e.get(c.emotion_mode, 0) + e
                cnt_e[c.emotion_mode] = cnt_e.get(c.emotion_mode, 0) + 1
        avg = tot_e / max(tot_c, 1)
        amps = []
        for em, te in eng_e.items():
            m = round((te / cnt_e[em]) / max(avg, 1), 1)
            if m >= 1.2:
                amps.append({"emotion": em, "label": topic_emotion_labels.get(em, em), "multiplier": m})
        amps.sort(key=lambda x: -x["multiplier"])
        return amps[:3]

    a_amp, p_amp = emo_amp(anti_tw), emo_amp(pro_tw)

    # Find biggest amplification gap between sides for same emotion
    amp_gap_best = None
    all_emos = set(a.get("emotion") for a in a_amp) | set(a.get("emotion") for a in p_amp)
    a_amp_map = {a["emotion"]: a["multiplier"] for a in a_amp}
    p_amp_map = {a["emotion"]: a["multiplier"] for a in p_amp}
    for em in all_emos:
        am, pm = a_amp_map.get(em, 1.0), p_amp_map.get(em, 1.0)
        diff = abs(am - pm)
        if diff >= 0.5 and (not amp_gap_best or diff > amp_gap_best["diff"]):
            amp_gap_best = {"emotion": em, "label": topic_emotion_labels.get(em, em), "anti_mult": am, "pro_mult": pm, "diff": diff,
                           "higher_side": aL if am > pm else pL, "higher_val": max(am, pm), "lower_val": min(am, pm)}

    # --- Rank drivers by comparative strength ---
    drivers = []
    # Source separation strength = 100 - overlap
    drivers.append({"type": "source", "strength": 100 - src_overlap, "metric": src_overlap})
    # Voice concentration ratio
    drivers.append({"type": "voice", "strength": vc_gap + (vc_ratio - 1) * 20, "metric": vc_ratio})
    # Narrative concentration gap
    drivers.append({"type": "narrative", "strength": nc_gap, "metric": nc_gap})
    # Emotional amplification gap
    amp_str = amp_gap_best["diff"] * 20 if amp_gap_best else 0
    drivers.append({"type": "emotion", "strength": amp_str, "metric": amp_gap_best})
    drivers.sort(key=lambda x: x["strength"], reverse=True)

    # --- Generate comparative bullets ---
    bullets = []
    for d in drivers:
        if d["type"] == "source" and src_overlap < 50:
            if src_overlap == 0:
                bullets.append(f"The two sides draw from {_overlap_label(src_overlap)} — none of the publishers (news sites, blogs, etc.) they link to are shared. Each side is reading entirely different sources.")
            else:
                bullets.append(f"The two sides draw from {_overlap_label(src_overlap)} — only {src_overlap}% of the publishers (news sites, blogs, etc.) they link to are shared, meaning {100 - src_overlap}% of linked publishers are unique to one side")
        elif d["type"] == "voice" and vc_gap >= 10:
            bullets.append(f"{vc_higher_side}'s conversation is more concentrated — its top 5 most-engaged accounts generate {vc_high}% of all likes, retweets, and replies on that side, compared to {vc_low}% for {vc_lower_side}. This means {vc_higher_side} messaging is more reliant on a few key voices.")
        elif d["type"] == "narrative" and nc_gap >= 8:
            bullets.append(f"{nc_higher_side} is more narratively concentrated, with top 2 frames at {nc_high}% vs {nc_low}% — a {nc_gap}-point gap")
        elif d["type"] == "emotion" and amp_gap_best and amp_gap_best["diff"] >= 0.5:
            b = amp_gap_best
            bullets.append(f"{b['label']} content is {_ratio_label(b['higher_val'])} amplified on {b['higher_side']} ({b['higher_val']}x vs {b['lower_val']}x baseline engagement)")

    # --- Comparative causal paragraph ---
    parts = []
    if src_overlap < 30:
        parts.append(f"source separation ({100-src_overlap}% of sources are not shared)")
    if vc_ratio >= 1.5:
        parts.append(f"uneven voice concentration ({vc_higher_side} is {vc_ratio}x more top-account driven)")
    if nc_gap >= 10:
        parts.append(f"narrative concentration ({nc_higher_side} is {nc_gap} points more concentrated)")
    if amp_gap_best and amp_gap_best["diff"] >= 0.5:
        parts.append(f"emotional amplification ({amp_gap_best['label'].lower()} content is rewarded more on {amp_gap_best['higher_side']})")

    if parts:
        causal = f"The divergence between {aL} and {pL} is primarily driven by " + ", ".join(parts[:-1])
        if len(parts) > 1:
            causal += f", and {parts[-1]}"
        elif len(parts) == 1:
            causal = f"The divergence between {aL} and {pL} is primarily driven by {parts[0]}"
        causal += f". {nc_higher_side} content clusters more tightly around {nc_top_frame} framing, while {nc_lower_side} spreads across a broader mix of angles."
    else:
        causal = f"The divergence between {aL} and {pL} appears driven by a combination of source, framing, and emotional differences rather than any single dominant factor."

    response = {
        "metrics": {
            "source_overlap": {
                "anti_value": src_overlap, "pro_value": src_overlap,
                "value": src_overlap, "separated": 100 - src_overlap,
                "interpretation": _overlap_label(src_overlap),
                "takeaway": f"{100-src_overlap}% of source exposure is not shared between sides",
                "section_link": "sources",
            },
            "voice_concentration": {
                "anti": {"value": a_vc}, "pro": {"value": p_vc},
                "ratio": vc_ratio, "gap": vc_gap,
                "higher_side": vc_higher_side, "lower_side": vc_lower_side,
                "takeaway": f"{vc_higher_side} is {vc_ratio}x more top-account driven ({vc_high}% vs {vc_low}%)" if vc_gap >= 5 else "Roughly similar top-account concentration",
                "strength": _ratio_label(vc_ratio),
                "section_link": "voices",
            },
            "narrative_concentration": {
                "anti": {"value": a_nc}, "pro": {"value": p_nc},
                "gap": nc_gap, "higher_side": nc_higher_side,
                "takeaway": f"{nc_higher_side} is {nc_gap} points more concentrated ({nc_high}% vs {nc_low}%)" if nc_gap >= 5 else "Roughly similar narrative concentration",
                "strength": _gap_label(nc_gap),
                "section_link": "narrative",
            },
            "emotional_amplification": {
                "anti": [{"emotion": a["label"], "multiplier": a["multiplier"]} for a in a_amp],
                "pro": [{"emotion": a["label"], "multiplier": a["multiplier"]} for a in p_amp],
                "gap": {
                    "emotion": amp_gap_best["label"] if amp_gap_best else None,
                    "higher_side": amp_gap_best["higher_side"] if amp_gap_best else None,
                    "higher_val": amp_gap_best["higher_val"] if amp_gap_best else None,
                    "lower_val": amp_gap_best["lower_val"] if amp_gap_best else None,
                } if amp_gap_best else None,
                "takeaway": f"{amp_gap_best['label']} is {_ratio_label(amp_gap_best['higher_val'])} amplified on {amp_gap_best['higher_side']} ({amp_gap_best['higher_val']}x vs {amp_gap_best['lower_val']}x)" if amp_gap_best else "No significant amplification gap",
                "section_link": "narrative",
            },
        },
        "bullets": bullets,
        "causal_paragraph": causal,
        "anti_label": aL,
        "pro_label": pL,
    }
    set_cache(cache_key, response)
    return response


@router.get("/exposure-overlap")
async def get_exposure_overlap(
    topic: str,
    hours: int = Query(default=720),
    db: AsyncSession = Depends(get_db),
    user: dict | None = Depends(optional_user),
):
    """Compute Exposure Overlap: how much of the story universe is shared between sides."""
    await _check_feed_topic_access(topic, user, db)
    cache_key = f"{topic}:exposure_overlap"
    cached = get_cached(cache_key, ttl=cache_ttl_for_topic(topic))
    if cached is not None:
        return cached
    since = await _get_latest_run_since(topic, db, fallback_hours=hours)

    topic_result = await db.execute(select(Topic).where(Topic.slug == topic))
    topic_obj = topic_result.scalar_one_or_none()
    if not topic_obj:
        return {}

    anti_bent = topic_obj.anti_label.lower().replace(" ", "-")
    pro_bent = topic_obj.pro_label.lower().replace(" ", "-")

    stmt = (
        select(Tweet, Classification)
        .join(Classification, Tweet.id_str == Classification.id_str)
        .where(
            Tweet.topic_slug == topic,
            Tweet.fetched_at >= since,
            Classification.about_subject == True,
            Classification.effective_political_bent.in_([anti_bent, pro_bent]),
        )
    )
    result = await db.execute(stmt)
    rows = result.all()

    from urllib.parse import urlparse
    import re

    skip_domains = {"twitter.com", "x.com", "t.co", "bit.ly", "tinyurl.com", "ow.ly", "buff.ly"}

    # --- Story Clustering ---
    # Layer 1: Group by normalized URL (strongest signal)
    tweet_to_cluster: dict[str, str] = {}
    url_clusters: dict[str, set] = {}

    for t, c in rows:
        raw = t.raw_json or {}
        for u in (raw.get("entities") or {}).get("urls") or []:
            expanded = u.get("expanded_url", "")
            if not expanded:
                continue
            try:
                parsed = urlparse(expanded)
                domain = parsed.netloc.lower()
                if domain.startswith("www."):
                    domain = domain[4:]
                if domain in skip_domains:
                    continue
                path_parts = [p for p in parsed.path.split("/") if p]
                cluster_key = f"url:{domain}" + ("/" + path_parts[0] if path_parts else "")
                tweet_to_cluster[t.id_str] = cluster_key
                if cluster_key not in url_clusters:
                    url_clusters[cluster_key] = set()
                url_clusters[cluster_key].add(t.id_str)
            except Exception:
                pass

    # Layer 2: Keyword bigram clustering for tweets without URL clusters
    stop_words = {"the", "a", "an", "is", "are", "was", "were", "has", "have", "had", "this", "that", "and", "or", "but", "for", "with", "from", "its", "not", "will", "can", "all", "been", "more", "just", "about", "into", "over", "than", "our", "their", "they", "you", "who", "what", "when", "how", "would", "could", "should", "https", "http"}

    unclustered = [(t, c) for t, c in rows if t.id_str not in tweet_to_cluster]
    bigram_index: dict[str, list[str]] = {}

    for t, c in unclustered:
        text = re.sub(r"https?://\S+", "", (t.full_text or "").lower())
        text = re.sub(r"@\w+", "", text)
        text = re.sub(r"[^\w\s]", " ", text)
        words = [w for w in text.split() if len(w) > 3 and w not in stop_words]
        for i in range(len(words) - 1):
            bg = f"{words[i]} {words[i+1]}"
            if bg not in bigram_index:
                bigram_index[bg] = []
            bigram_index[bg].append(t.id_str)

    # Find bigrams with 3+ tweets as cluster anchors
    for bg, tweet_ids in bigram_index.items():
        if len(tweet_ids) >= 3:
            cluster_key = f"kw:{bg}"
            for tid in tweet_ids:
                if tid not in tweet_to_cluster:
                    tweet_to_cluster[tid] = cluster_key

    # Assign remaining unclustered tweets their own singleton cluster
    for t, c in rows:
        if t.id_str not in tweet_to_cluster:
            tweet_to_cluster[t.id_str] = f"solo:{t.id_str}"

    # --- Compute Exposure Overlap ---
    anti_stories: set[str] = set()
    pro_stories: set[str] = set()

    for t, c in rows:
        cluster = tweet_to_cluster.get(t.id_str, f"solo:{t.id_str}")
        if c.effective_political_bent == anti_bent:
            anti_stories.add(cluster)
        elif c.effective_political_bent == pro_bent:
            pro_stories.add(cluster)

    shared = anti_stories & pro_stories
    all_stories = anti_stories | pro_stories
    anti_only = anti_stories - pro_stories
    pro_only = pro_stories - anti_stories

    # Filter out singletons from counts for a more meaningful metric
    shared_meaningful = {s for s in shared if not s.startswith("solo:")}
    anti_only_meaningful = {s for s in anti_only if not s.startswith("solo:")}
    pro_only_meaningful = {s for s in pro_only if not s.startswith("solo:")}
    all_meaningful = shared_meaningful | anti_only_meaningful | pro_only_meaningful

    if all_meaningful:
        score = round(len(shared_meaningful) / len(all_meaningful) * 100)
    else:
        score = 0

    # Interpretation
    if score <= 15:
        label = "Mostly different realities"
        sentence = "Each side is seeing almost entirely different stories — very few events are shared between the two feeds."
    elif score <= 35:
        label = "Some shared stories"
        sentence = "The two sides share a few stories in common, but most of what each side sees is unique to their feed."
    elif score <= 60:
        label = "Partially shared"
        sentence = "The two sides pay attention to some of the same events, but each side also has many stories the other doesn't see."
    elif score <= 80:
        label = "Mostly shared"
        sentence = "Both sides are following many of the same stories, even though they may interpret them very differently."
    else:
        label = "Same stories"
        sentence = "Both sides are paying attention to the same events — the difference is in how they talk about them, not what they see."

    # Split by cluster type
    def split_by_type(cluster_set):
        urls = {s for s in cluster_set if s.startswith("url:")}
        keywords = {s for s in cluster_set if s.startswith("kw:")}
        return len(urls), len(keywords)

    shared_urls, shared_kw = split_by_type(shared_meaningful)
    anti_only_urls, anti_only_kw = split_by_type(anti_only_meaningful)
    pro_only_urls, pro_only_kw = split_by_type(pro_only_meaningful)

    # Compute scores per type
    all_url = {s for s in all_meaningful if s.startswith("url:")}
    all_kw = {s for s in all_meaningful if s.startswith("kw:")}
    url_score = round(shared_urls / len(all_url) * 100) if all_url else 0
    kw_score = round(shared_kw / len(all_kw) * 100) if all_kw else 0

    # Build detailed cluster lists with per-side tweet counts
    cluster_anti_count: dict[str, int] = {}
    cluster_pro_count: dict[str, int] = {}
    for t, c in rows:
        cluster = tweet_to_cluster.get(t.id_str)
        if not cluster or cluster.startswith("solo:"):
            continue
        if c.effective_political_bent == anti_bent:
            cluster_anti_count[cluster] = cluster_anti_count.get(cluster, 0) + 1
        elif c.effective_political_bent == pro_bent:
            cluster_pro_count[cluster] = cluster_pro_count.get(cluster, 0) + 1

    def build_cluster_list(clusters, prefix):
        items = []
        for c in clusters:
            if not c.startswith(prefix):
                continue
            name = c[len(prefix):]
            ac = cluster_anti_count.get(c, 0)
            pc = cluster_pro_count.get(c, 0)
            side = "shared" if ac > 0 and pc > 0 else ("anti" if ac > 0 else "pro")
            items.append({"name": name, "anti_count": ac, "pro_count": pc, "total": ac + pc, "side": side})
        items.sort(key=lambda x: -x["total"])
        return items

    all_themes = build_cluster_list(all_meaningful, "kw:")
    all_urls_list = build_cluster_list(all_meaningful, "url:")

    response = {
        "score": score,
        "label": label,
        "sentence": sentence,
        "shared_count": len(shared_meaningful),
        "anti_only_count": len(anti_only_meaningful),
        "pro_only_count": len(pro_only_meaningful),
        "total_stories": len(all_meaningful),
        "by_type": {
            "urls": {
                "score": url_score,
                "shared": len({s for s in shared_meaningful if s.startswith("url:")}),
                "anti_only": len({s for s in anti_only_meaningful if s.startswith("url:")}),
                "pro_only": len({s for s in pro_only_meaningful if s.startswith("url:")}),
            },
            "themes": {
                "score": kw_score,
                "shared": len({s for s in shared_meaningful if s.startswith("kw:")}),
                "anti_only": len({s for s in anti_only_meaningful if s.startswith("kw:")}),
                "pro_only": len({s for s in pro_only_meaningful if s.startswith("kw:")}),
            },
        },
        "themes_list": all_themes[:20],
        "urls_list": all_urls_list[:20],
        "anti_label": topic_obj.anti_label,
        "pro_label": topic_obj.pro_label,
    }
    set_cache(cache_key, response)
    return response


@router.get("/paired-stories")
async def get_paired_stories(
    topic: str,
    hours: int = Query(default=720),
    db: AsyncSession = Depends(get_db),
    user: dict | None = Depends(optional_user),
):
    """Find stories covered by both sides and show how each frames them differently."""
    await _check_feed_topic_access(topic, user, db)
    cache_key = f"{topic}:paired_stories"
    cached = get_cached(cache_key, ttl=cache_ttl_for_topic(topic))
    if cached is not None:
        return cached
    since = await _get_latest_run_since(topic, db, fallback_hours=hours)

    topic_result = await db.execute(select(Topic).where(Topic.slug == topic))
    topic_obj = topic_result.scalar_one_or_none()
    if not topic_obj:
        return {"stories": []}

    anti_bent = topic_obj.anti_label.lower().replace(" ", "-")
    pro_bent = topic_obj.pro_label.lower().replace(" ", "-")

    stmt = (
        select(Tweet, Classification)
        .join(Classification, Tweet.id_str == Classification.id_str)
        .where(
            Tweet.topic_slug == topic,
            Tweet.fetched_at >= since,
            Classification.about_subject == True,
            Classification.effective_political_bent.in_([anti_bent, pro_bent]),
        )
    )
    result = await db.execute(stmt)
    rows = result.all()

    from urllib.parse import urlparse
    from pipeline.framing import get_topic_labels_async
    import re

    topic_frame_labels, topic_emotion_labels = await get_topic_labels_async(db, topic)

    skip_domains = {"twitter.com", "x.com", "t.co", "bit.ly", "tinyurl.com", "ow.ly", "buff.ly"}

    # --- Method 1: Cluster by shared URL domain+path ---
    url_clusters: dict[str, list] = {}
    for t, c in rows:
        raw = t.raw_json or {}
        for u in (raw.get("entities") or {}).get("urls") or []:
            expanded = u.get("expanded_url", "")
            if not expanded:
                continue
            try:
                parsed = urlparse(expanded)
                domain = parsed.netloc.lower()
                if domain.startswith("www."):
                    domain = domain[4:]
                if domain in skip_domains:
                    continue
                # Use domain + first path segment as cluster key
                path_parts = [p for p in parsed.path.split("/") if p]
                cluster_key = domain + ("/" + path_parts[0] if path_parts else "")
                if cluster_key not in url_clusters:
                    url_clusters[cluster_key] = []
                url_clusters[cluster_key].append((t, c))
            except Exception:
                pass

    # --- Method 2: Cluster by keyword phrases ---
    # Extract key phrases from each tweet
    stop_words = {"the", "a", "an", "is", "are", "was", "were", "has", "have", "had", "this", "that", "and", "or", "but", "for", "with", "from", "its", "not", "will", "can", "all", "been", "more", "just", "about", "into", "over", "than", "our", "their", "they", "you", "who", "what", "when", "how", "would", "could", "should", "https", "http"}

    def extract_key_phrases(text: str) -> set[str]:
        text = re.sub(r"https?://\S+", "", text.lower())
        text = re.sub(r"@\w+", "", text)
        text = re.sub(r"[^\w\s]", " ", text)
        words = [w for w in text.split() if len(w) > 3 and w not in stop_words]
        # Generate bigrams
        bigrams = set()
        for i in range(len(words) - 1):
            bigrams.add(f"{words[i]} {words[i+1]}")
        return bigrams

    # Build bigram index
    bigram_tweets: dict[str, list] = {}
    for t, c in rows:
        phrases = extract_key_phrases(t.full_text or "")
        for phrase in phrases:
            if phrase not in bigram_tweets:
                bigram_tweets[phrase] = []
            bigram_tweets[phrase].append((t, c))

    # Find bigrams shared by both sides with enough tweets
    # Filter out vague/generic bigrams that don't represent specific stories
    vague_bigrams = {
        "united states", "people think", "this just", "make sure", "going happen",
        "want know", "right left", "left right", "good thing", "many people",
        "need know", "long time", "every time", "real problem", "right wrong",
        "last year", "next year", "years ago", "much more", "even more",
    }
    keyword_clusters: dict[str, list] = {}
    for phrase, tweet_list in bigram_tweets.items():
        if phrase in vague_bigrams:
            continue
        sides = set(c.effective_political_bent for _, c in tweet_list)
        if anti_bent in sides and pro_bent in sides and len(tweet_list) >= 4:
            keyword_clusters[phrase] = tweet_list

    # --- Merge clusters and find paired stories ---
    all_clusters: dict[str, list] = {}

    # URL clusters first (stronger signal)
    for key, tweet_list in url_clusters.items():
        sides = set(c.effective_political_bent for _, c in tweet_list)
        if anti_bent in sides and pro_bent in sides:
            all_clusters[f"url:{key}"] = tweet_list

    # Keyword clusters (only add if not already covered by URL)
    seen_tweet_ids: set[str] = set()
    for tweets in all_clusters.values():
        for t, c in tweets:
            seen_tweet_ids.add(t.id_str)

    for phrase, tweet_list in sorted(keyword_clusters.items(), key=lambda x: -len(x[1])):
        # Skip if most tweets already in a URL cluster
        new_tweets = [(t, c) for t, c in tweet_list if t.id_str not in seen_tweet_ids]
        if len(new_tweets) >= 2:
            all_clusters[f"kw:{phrase}"] = tweet_list
            for t, c in tweet_list:
                seen_tweet_ids.add(t.id_str)

    # --- Select representative tweets and build stories ---
    stories = []
    for cluster_key, tweet_list in all_clusters.items():
        anti_side = [(t, c) for t, c in tweet_list if c.effective_political_bent == anti_bent]
        pro_side = [(t, c) for t, c in tweet_list if c.effective_political_bent == pro_bent]

        if not anti_side or not pro_side:
            continue

        # Pick highest engagement tweet from each side
        anti_side.sort(key=lambda x: x[0].engagement or 0, reverse=True)
        pro_side.sort(key=lambda x: x[0].engagement or 0, reverse=True)

        anti_rep = anti_side[0]
        pro_rep = pro_side[0]

        # Derive story label
        if cluster_key.startswith("url:"):
            story_label = cluster_key[4:]
        else:
            story_label = cluster_key[3:].title()

        def build_side(t, c):
            # Get source domain
            source = ""
            raw = t.raw_json or {}
            for u in (raw.get("entities") or {}).get("urls") or []:
                expanded = u.get("expanded_url", "")
                if expanded:
                    try:
                        parsed = urlparse(expanded)
                        d = parsed.netloc.lower()
                        if d.startswith("www."):
                            d = d[4:]
                        if d not in skip_domains:
                            source = d
                            break
                    except Exception:
                        pass

            frames = c.narrative_frames or []
            return {
                "id_str": t.id_str,
                "screen_name": t.screen_name,
                "author_name": t.author_name,
                "full_text": t.full_text,
                "likes": t.likes or 0,
                "retweets": t.retweets or 0,
                "views": t.views or 0,
                "engagement": t.engagement or 0,
                "frame": topic_frame_labels.get(frames[0], frames[0]) if frames else "Unknown",
                "emotion": topic_emotion_labels.get(c.emotion_mode or "", c.emotion_mode or "Unknown"),
                "source": source,
                "url": t.url,
                "created_at": t.created_at.isoformat() if t.created_at else None,
            }

        anti_data = build_side(*anti_rep)
        pro_data = build_side(*pro_rep)

        frame_diff = 1 if anti_data["frame"] != pro_data["frame"] else 0
        emotion_diff = 1 if anti_data["emotion"] != pro_data["emotion"] else 0
        eng_score = (anti_data["engagement"] + pro_data["engagement"]) / 1000
        contrast_score = frame_diff * 40 + emotion_diff * 20 + eng_score

        if frame_diff and emotion_diff:
            contrast_label = "High contrast"
        elif frame_diff:
            contrast_label = "Different framing"
        elif emotion_diff:
            contrast_label = "Different tone"
        else:
            contrast_label = "Shared framing"

        stories.append({
            "story_label": story_label,
            "anti_tweet_count": len(anti_side),
            "pro_tweet_count": len(pro_side),
            "anti": anti_data,
            "pro": pro_data,
            "contrast_label": contrast_label,
            "contrast_score": contrast_score,
        })

    # Deduplicate stories that share representative tweets or overlap heavily
    stories.sort(key=lambda s: s["contrast_score"], reverse=True)
    deduped: list = []
    seen_tweet_ids_in_stories: set[str] = set()
    for s in stories:
        anti_id = s["anti"]["id_str"]
        pro_id = s["pro"]["id_str"]
        if anti_id in seen_tweet_ids_in_stories or pro_id in seen_tweet_ids_in_stories:
            continue
        seen_tweet_ids_in_stories.add(anti_id)
        seen_tweet_ids_in_stories.add(pro_id)
        deduped.append(s)
        if len(deduped) >= 8:  # send more candidates so we have extras after validation
            break
    stories = deduped

    # --- Generate framing headlines via LLM (single batch call) ---
    if stories:
        import os, json
        GEMINI_KEY = os.getenv("GEMINI_API_KEY", "")
        try:
            from google import genai
            client = genai.Client(api_key=GEMINI_KEY)

            prompt_parts = []
            for i, s in enumerate(stories):
                prompt_parts.append(f"""Story {i+1} (cluster: "{s['story_label']}")
Side A ({topic_obj.anti_label}): {s['anti']['full_text'][:300]}
Side A frame: {s['anti']['frame']}
Side B ({topic_obj.pro_label}): {s['pro']['full_text'][:300]}
Side B frame: {s['pro']['frame']}""")

            prompt = f"""For each story below, determine whether both tweets are actually about the SAME specific event or issue. Then generate metadata.

For each story, return:
1. same_story: boolean — are both tweets genuinely about the same specific event, policy, or development? Set to false if the tweets are about different topics that just happen to share a keyword.
2. story_title: a short, specific title (3-8 words) for the shared event. Must be a SPECIFIC event — e.g. "ICC Arrest Warrant Debate", not "Against Israel".
3. headline_a: framing headline for Side A (6-14 words)
4. headline_b: framing headline for Side B (6-14 words)
5. takeaway: one-line neutral comparison of how framing differs

Rules:
- same_story=false if the tweets discuss unrelated events that coincidentally share keywords
- same_story=false if one tweet is about a general stance and the other is about a specific event
- Headlines should sound like newspaper sub-headlines, not tweets
- No hashtags, @mentions, URLs, or emojis in headlines

{chr(10).join(prompt_parts)}

Return a JSON array with one object per story:
[{{"same_story": true/false, "story_title": "...", "headline_a": "...", "headline_b": "...", "takeaway": "..."}}]"""

            resp = client.models.generate_content(
                model="gemini-2.0-flash",
                contents=prompt,
                config={"response_mime_type": "application/json", "temperature": 0.3},
            )
            text = (resp.text or "").strip()
            if text.startswith("```"):
                text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
            headlines = json.loads(text)

            validated = []
            for i, s in enumerate(stories):
                if i < len(headlines):
                    h = headlines[i]
                    # Filter out pairs the LLM says aren't about the same story
                    if not h.get("same_story", True):
                        continue
                    if h.get("story_title"):
                        s["story_label"] = h["story_title"]
                    s["anti"]["headline"] = h.get("headline_a", s["anti"]["full_text"][:80])
                    s["pro"]["headline"] = h.get("headline_b", s["pro"]["full_text"][:80])
                    s["interpretation"] = h.get("takeaway", "")
                else:
                    s["anti"]["headline"] = s["anti"]["full_text"][:80]
                    s["pro"]["headline"] = s["pro"]["full_text"][:80]
                    s["interpretation"] = ""
                validated.append(s)
            stories = validated[:4]
        except Exception as e:
            # Fallback: simple first-sentence extraction
            import re as _re
            for s in stories:
                for side in ["anti", "pro"]:
                    txt = s[side]["full_text"]
                    txt = _re.sub(r"https?://\S+", "", txt)
                    txt = _re.sub(r"@\w+", "", txt)
                    txt = _re.sub(r"^[^a-zA-Z\"]+", "", txt)
                    for sep in [". ", ".\n", "\n"]:
                        if sep in txt:
                            txt = txt[:txt.index(sep)]
                            break
                    s[side]["headline"] = " ".join(txt.split()[:14]).strip()
                af, pf = s["anti"]["frame"], s["pro"]["frame"]
                s["interpretation"] = f"Same event, framed as {af.lower()} on one side and {pf.lower()} on the other."

    response = {
        "stories": stories,
        "anti_label": topic_obj.anti_label,
        "pro_label": topic_obj.pro_label,
    }
    set_cache(cache_key, response)
    return response


@router.get("/recommendations")
async def get_recommendations(
    topic: str,
    hours: int = Query(default=720),
    db: AsyncSession = Depends(get_db),
    user: dict | None = Depends(optional_user),
):
    """Generate strategic recommendations for each side based on analytics data."""
    await _check_feed_topic_access(topic, user, db)
    cache_key = f"{topic}:recommendations"
    cached = get_cached(cache_key, ttl=cache_ttl_for_topic(topic))
    if cached is not None:
        return cached
    since = await _get_latest_run_since(topic, db, fallback_hours=hours)

    topic_result = await db.execute(select(Topic).where(Topic.slug == topic))
    topic_obj = topic_result.scalar_one_or_none()
    if not topic_obj:
        return {}

    anti_bent = topic_obj.anti_label.lower().replace(" ", "-")
    pro_bent = topic_obj.pro_label.lower().replace(" ", "-")
    aL = topic_obj.anti_label
    pL = topic_obj.pro_label

    stmt = (
        select(Tweet, Classification)
        .join(Classification, Tweet.id_str == Classification.id_str)
        .where(Tweet.topic_slug == topic, Tweet.fetched_at >= since, Classification.about_subject == True)
    )
    result = await db.execute(stmt)
    rows = result.all()
    anti_tw = [(t, c) for t, c in rows if c.effective_political_bent == anti_bent]
    pro_tw = [(t, c) for t, c in rows if c.effective_political_bent == pro_bent]

    from pipeline.framing import get_topic_labels_async
    from collections import Counter

    topic_frame_labels, topic_emotion_labels = await get_topic_labels_async(db, topic)

    # Gather key stats for the prompt
    def side_stats(tw, label):
        frame_counts: Counter = Counter()
        emotion_counts: Counter = Counter()
        total_eng = 0
        for t, c in tw:
            total_eng += t.engagement or 0
            if c.narrative_frames:
                for f in c.narrative_frames:
                    frame_counts[f] += 1
            if c.emotion_mode:
                emotion_counts[c.emotion_mode] += 1
        top_frames = [(topic_frame_labels.get(f, f), n) for f, n in frame_counts.most_common(3)]
        top_emotions = [(topic_emotion_labels.get(e, e), n) for e, n in emotion_counts.most_common(3)]
        weak_frames = [topic_frame_labels.get(f, f) for f, n in frame_counts.most_common() if n <= 2][:3]
        return {
            "label": label,
            "tweet_count": len(tw),
            "avg_engagement": round(total_eng / max(len(tw), 1)),
            "top_frames": top_frames,
            "top_emotions": top_emotions,
            "weak_frames": weak_frames,
        }

    anti_stats = side_stats(anti_tw, aL)
    pro_stats = side_stats(pro_tw, pL)

    # Generate recommendations via Gemini
    import os, json
    GEMINI_KEY = os.getenv("GEMINI_API_KEY", "")

    try:
        from google import genai
        client = genai.Client(api_key=GEMINI_KEY)

        prompt = f"""You are a strategic communications advisor analyzing how two political sides discuss "{topic_obj.name}".

Based on the data below, generate 3-4 specific, actionable recommendations for EACH side on how they could improve their messaging to reach a broader audience, address their blind spots, and be more persuasive.

{aL} side ({anti_stats['tweet_count']} tweets, avg engagement: {anti_stats['avg_engagement']}):
- Top arguments used: {', '.join(f'{f} ({n} tweets)' for f, n in anti_stats['top_frames'])}
- Main emotional styles: {', '.join(f'{e} ({n})' for e, n in anti_stats['top_emotions'])}
- Arguments they rarely use: {', '.join(anti_stats['weak_frames']) if anti_stats['weak_frames'] else 'none identified'}

{pL} side ({pro_stats['tweet_count']} tweets, avg engagement: {pro_stats['avg_engagement']}):
- Top arguments used: {', '.join(f'{f} ({n} tweets)' for f, n in pro_stats['top_frames'])}
- Main emotional styles: {', '.join(f'{e} ({n})' for e, n in pro_stats['top_emotions'])}
- Arguments they rarely use: {', '.join(pro_stats['weak_frames']) if pro_stats['weak_frames'] else 'none identified'}

For each recommendation:
- Be specific and actionable (not generic advice like "be more balanced")
- Explain WHY this would help (what gap it fills, what audience it reaches)
- Reference the actual data (e.g. "Your side rarely uses economic arguments, which could appeal to moderates")
- Keep each recommendation to 2-3 sentences

Return JSON:
{{
  "anti_recommendations": [
    {{"title": "short title", "detail": "2-3 sentence recommendation", "type": "messaging|audience|tone|blind_spot"}}
  ],
  "pro_recommendations": [
    {{"title": "short title", "detail": "2-3 sentence recommendation", "type": "messaging|audience|tone|blind_spot"}}
  ]
}}"""

        resp = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=prompt,
            config={"response_mime_type": "application/json", "temperature": 0.4},
        )
        text = (resp.text or "").strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
        recs = json.loads(text)

    except Exception as e:
        recs = {
            "anti_recommendations": [{"title": "Analysis unavailable", "detail": f"Could not generate recommendations: {e}", "type": "messaging"}],
            "pro_recommendations": [{"title": "Analysis unavailable", "detail": f"Could not generate recommendations: {e}", "type": "messaging"}],
        }

    response = {
        "anti_recommendations": recs.get("anti_recommendations", []),
        "pro_recommendations": recs.get("pro_recommendations", []),
        "anti_label": aL,
        "pro_label": pL,
        "anti_stats": anti_stats,
        "pro_stats": pro_stats,
    }
    set_cache(cache_key, response)
    return response


@router.get("/analytics")
async def get_analytics(
    topic: str,
    hours: int = Query(default=720),
    db: AsyncSession = Depends(get_db),
    user: dict | None = Depends(optional_user),
):
    """Get analytics data: engagement comparison, top voices, trending phrases."""
    await _check_feed_topic_access(topic, user, db)
    cache_key = f"{topic}:analytics:{hours}"
    cached = get_cached(cache_key, ttl=cache_ttl_for_topic(topic))
    if cached is not None:
        return cached

    since = await _get_latest_run_since(topic, db, fallback_hours=hours)

    # Load topic to get labels
    topic_result = await db.execute(select(Topic).where(Topic.slug == topic))
    topic_obj = topic_result.scalar_one_or_none()
    if not topic_obj:
        return {}

    anti_bent = topic_obj.anti_label.lower().replace(" ", "-")
    pro_bent = topic_obj.pro_label.lower().replace(" ", "-")

    # Fetch all on-topic tweets with classifications
    stmt = (
        select(Tweet, Classification)
        .join(Classification, Tweet.id_str == Classification.id_str)
        .where(
            Tweet.topic_slug == topic,
            Tweet.fetched_at >= since,
            Classification.about_subject == True,
        )
    )
    result = await db.execute(stmt)
    rows = result.all()

    # Split by side
    anti_tweets = [(t, c) for t, c in rows if c.effective_political_bent == anti_bent]
    pro_tweets = [(t, c) for t, c in rows if c.effective_political_bent == pro_bent]
    neutral_tweets = [(t, c) for t, c in rows if c.effective_political_bent == "neutral"]

    # --- 1. Engagement Comparison ---
    def avg_metrics(tweets):
        if not tweets:
            return {"count": 0, "avg_likes": 0, "avg_retweets": 0, "avg_replies": 0, "avg_views": 0, "avg_engagement": 0}
        n = len(tweets)
        return {
            "count": n,
            "avg_likes": round(sum(t.likes or 0 for t, c in tweets) / n, 1),
            "avg_retweets": round(sum(t.retweets or 0 for t, c in tweets) / n, 1),
            "avg_replies": round(sum(t.replies or 0 for t, c in tweets) / n, 1),
            "avg_views": round(sum(t.views or 0 for t, c in tweets) / n, 1),
            "avg_engagement": round(sum(t.engagement or 0 for t, c in tweets) / n, 1),
        }

    engagement = {
        "anti": avg_metrics(anti_tweets),
        "pro": avg_metrics(pro_tweets),
        "neutral": avg_metrics(neutral_tweets),
    }

    # --- 2. Top Voices ---
    def top_voices(tweets, limit=5):
        authors: dict = {}
        for t, c in tweets:
            name = t.screen_name or "unknown"
            if name not in authors:
                authors[name] = {
                    "screen_name": name,
                    "author_name": t.author_name or name,
                    "followers": t.author_followers or 0,
                    "tweet_count": 0,
                    "total_engagement": 0,
                    "total_views": 0,
                }
            authors[name]["tweet_count"] += 1
            authors[name]["total_engagement"] += (t.engagement or 0)
            authors[name]["total_views"] += (t.views or 0)
        sorted_authors = sorted(authors.values(), key=lambda a: a["total_engagement"], reverse=True)
        return sorted_authors[:limit]

    voices = {
        "anti": top_voices(anti_tweets),
        "pro": top_voices(pro_tweets),
    }

    # --- 3. Trending Phrases ---
    import re
    from collections import Counter

    stop_words = {
        "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
        "have", "has", "had", "do", "does", "did", "will", "would", "could",
        "should", "may", "might", "shall", "can", "need", "dare", "ought",
        "used", "to", "of", "in", "for", "on", "with", "at", "by", "from",
        "as", "into", "through", "during", "before", "after", "above", "below",
        "between", "out", "off", "over", "under", "again", "further", "then",
        "once", "here", "there", "when", "where", "why", "how", "all", "both",
        "each", "few", "more", "most", "other", "some", "such", "no", "nor",
        "not", "only", "own", "same", "so", "than", "too", "very", "just",
        "don", "now", "and", "but", "or", "if", "while", "about", "up",
        "that", "this", "these", "those", "it", "its", "i", "me", "my",
        "we", "our", "you", "your", "he", "she", "they", "them", "their",
        "what", "which", "who", "whom", "his", "her", "him", "us",
        "https", "http", "co", "rt", "amp", "get", "got", "like", "going",
        "one", "also", "much", "even", "back", "still", "new", "say", "says",
        "said", "see", "know", "think", "want", "make", "go", "take",
    }

    def extract_phrases(tweets, top_n=10):
        word_counts: Counter = Counter()
        bigram_counts: Counter = Counter()
        for t, c in tweets:
            text = (t.full_text or "").lower()
            text = re.sub(r"https?://\S+", "", text)
            text = re.sub(r"@\w+", "", text)
            text = re.sub(r"[^\w\s]", " ", text)
            words = [w for w in text.split() if len(w) > 2 and w not in stop_words]
            word_counts.update(words)
            for i in range(len(words) - 1):
                bigram_counts[f"{words[i]} {words[i+1]}"] += 1

        # Combine: prefer bigrams, fill with single words
        phrases = []
        seen = set()
        for phrase, count in bigram_counts.most_common(top_n * 2):
            if count >= 3 and len(phrases) < top_n:
                phrases.append({"phrase": phrase, "count": count})
                seen.update(phrase.split())
        for word, count in word_counts.most_common(top_n * 2):
            if word not in seen and count >= 3 and len(phrases) < top_n:
                phrases.append({"phrase": word, "count": count})
        return phrases[:top_n]

    phrases = {
        "anti": extract_phrases(anti_tweets),
        "pro": extract_phrases(pro_tweets),
    }

    # --- 4. Top Sources / Domains ---
    from urllib.parse import urlparse

    # Domains to skip (social media self-links, link shorteners)
    skip_domains = {
        "twitter.com", "x.com", "t.co", "bit.ly", "tinyurl.com",
        "ow.ly", "buff.ly", "dlvr.it", "ift.tt", "fb.me",
    }

    def extract_sources(tweets, top_n=10):
        domain_counts: Counter = Counter()
        url_counts: Counter = Counter()
        url_titles: dict[str, str] = {}
        for t, c in tweets:
            raw = t.raw_json or {}
            urls = (raw.get("entities") or {}).get("urls") or []
            for u in urls:
                expanded = u.get("expanded_url", "")
                if not expanded:
                    continue
                try:
                    parsed = urlparse(expanded)
                    domain = parsed.netloc.lower()
                    if domain.startswith("www."):
                        domain = domain[4:]
                    if not domain or domain in skip_domains:
                        continue
                    domain_counts[domain] += 1
                    # Track individual URLs with display text
                    display = u.get("display_url", expanded)
                    url_counts[expanded] += 1
                    if expanded not in url_titles:
                        url_titles[expanded] = display
                except Exception:
                    continue
        domains = [
            {"domain": domain, "count": count}
            for domain, count in domain_counts.most_common(top_n)
            if count >= 1
        ]
        top_urls = [
            {"url": url, "display": url_titles.get(url, url), "count": count}
            for url, count in url_counts.most_common(top_n)
            if count >= 1
        ]
        return {"domains": domains, "urls": top_urls}

    sources = {
        "anti": extract_sources(anti_tweets),
        "pro": extract_sources(pro_tweets),
        "overall": extract_sources(list(rows)),
    }

    # --- 5. Blind Spots: Exclusive Stories ---
    def get_url_set(tweets):
        urls = set()
        for t, c in tweets:
            raw = t.raw_json or {}
            for u in (raw.get("entities") or {}).get("urls") or []:
                expanded = u.get("expanded_url", "")
                if expanded:
                    try:
                        parsed = urlparse(expanded)
                        domain = parsed.netloc.lower()
                        if domain.startswith("www."):
                            domain = domain[4:]
                        if domain and domain not in skip_domains:
                            urls.add(expanded)
                    except Exception:
                        pass
        return urls

    anti_urls = get_url_set(anti_tweets)
    pro_urls = get_url_set(pro_tweets)

    # URLs exclusive to one side (shared 2+ times)
    def exclusive_urls(side_tweets, other_url_set, top_n=5):
        url_counts: Counter = Counter()
        url_display: dict[str, str] = {}
        for t, c in side_tweets:
            raw = t.raw_json or {}
            for u in (raw.get("entities") or {}).get("urls") or []:
                expanded = u.get("expanded_url", "")
                if expanded and expanded not in other_url_set:
                    try:
                        parsed = urlparse(expanded)
                        domain = parsed.netloc.lower()
                        if domain.startswith("www."):
                            domain = domain[4:]
                        if domain and domain not in skip_domains:
                            url_counts[expanded] += 1
                            url_display[expanded] = u.get("display_url", expanded)
                    except Exception:
                        pass
        return [
            {"url": url, "display": url_display.get(url, url), "count": count}
            for url, count in url_counts.most_common(top_n)
            if count >= 1
        ]

    exclusive_stories = {
        "anti_only": exclusive_urls(anti_tweets, pro_urls),
        "pro_only": exclusive_urls(pro_tweets, anti_urls),
    }

    # --- 6. Blind Spots: Keyword Differences ---
    def get_word_counts(tweets):
        counts: Counter = Counter()
        for t, c in tweets:
            txt = (t.full_text or "").lower()
            txt = re.sub(r"https?://\S+", "", txt)
            txt = re.sub(r"@\w+", "", txt)
            txt = re.sub(r"[^\w\s]", " ", txt)
            words = [w for w in txt.split() if len(w) > 2 and w not in stop_words]
            counts.update(words)
        return counts

    anti_words = get_word_counts(anti_tweets)
    pro_words = get_word_counts(pro_tweets)

    # Topic-level stopwords: words that appear frequently on BOTH sides (shared vocabulary)
    anti_total = sum(anti_words.values()) or 1
    pro_total = sum(pro_words.values()) or 1
    topic_stopwords = set()
    for word in set(anti_words.keys()) | set(pro_words.keys()):
        anti_rate = anti_words.get(word, 0) / anti_total
        pro_rate = pro_words.get(word, 0) / pro_total
        if anti_rate > 0.005 and pro_rate > 0.005:
            # Both sides use this word at >0.5% rate — it's shared topic vocabulary
            ratio = max(anti_rate, pro_rate) / max(min(anti_rate, pro_rate), 0.0001)
            if ratio < 5:
                topic_stopwords.add(word)

    def keyword_blind_spots(side_words, other_words, side_total, other_total, top_n=8):
        """Find words disproportionately used by one side, normalized by volume."""
        spots = []
        candidates = []
        for word, count in side_words.items():
            if count < 3 or word in topic_stopwords:
                continue
            other_count = other_words.get(word, 0)
            # Normalize to rate per 1000 words
            side_rate = (count / side_total) * 1000
            other_rate = (other_count / other_total) * 1000 if other_total > 0 else 0
            if other_rate == 0:
                score = side_rate * 10  # heavily weight words absent from other side
            else:
                score = side_rate * (side_rate / other_rate)  # rate * ratio
            if side_rate > other_rate * 2:  # at least 2x more frequent proportionally
                candidates.append({
                    "word": word,
                    "side_count": count,
                    "other_count": other_count,
                    "ratio": round(count / max(other_count, 1), 1) if other_count > 0 else None,
                    "score": score,
                })
        candidates.sort(key=lambda x: -x["score"])
        for c in candidates[:top_n]:
            spots.append({k: v for k, v in c.items() if k != "score"})
        return spots

    keyword_gaps = {
        "anti_misses": keyword_blind_spots(pro_words, anti_words, pro_total, anti_total),
        "pro_misses": keyword_blind_spots(anti_words, pro_words, anti_total, pro_total),
    }

    # --- 7. Overlap: Shared sources, narratives, URLs ---
    # Shared domains
    anti_domain_set = set(d.domain for d in [type('', (), x)() for x in []] ) if False else set()
    anti_domain_counts = {}
    pro_domain_counts = {}
    for t, c in anti_tweets:
        raw = t.raw_json or {}
        for u in (raw.get("entities") or {}).get("urls") or []:
            expanded = u.get("expanded_url", "")
            if not expanded:
                continue
            try:
                parsed = urlparse(expanded)
                domain = parsed.netloc.lower()
                if domain.startswith("www."):
                    domain = domain[4:]
                if domain and domain not in skip_domains:
                    anti_domain_counts[domain] = anti_domain_counts.get(domain, 0) + 1
            except Exception:
                pass
    for t, c in pro_tweets:
        raw = t.raw_json or {}
        for u in (raw.get("entities") or {}).get("urls") or []:
            expanded = u.get("expanded_url", "")
            if not expanded:
                continue
            try:
                parsed = urlparse(expanded)
                domain = parsed.netloc.lower()
                if domain.startswith("www."):
                    domain = domain[4:]
                if domain and domain not in skip_domains:
                    pro_domain_counts[domain] = pro_domain_counts.get(domain, 0) + 1
            except Exception:
                pass

    shared_domain_names = set(anti_domain_counts.keys()) & set(pro_domain_counts.keys())
    shared_sources = sorted(
        [
            {"domain": d, "anti_count": anti_domain_counts[d], "pro_count": pro_domain_counts[d], "total": anti_domain_counts[d] + pro_domain_counts[d]}
            for d in shared_domain_names
        ],
        key=lambda x: x["total"],
        reverse=True,
    )[:10]

    # Shared URLs
    anti_url_counts_map: dict[str, int] = {}
    anti_url_display_map: dict[str, str] = {}
    pro_url_counts_map: dict[str, int] = {}
    pro_url_display_map: dict[str, str] = {}
    for t, c in anti_tweets:
        raw = t.raw_json or {}
        for u in (raw.get("entities") or {}).get("urls") or []:
            expanded = u.get("expanded_url", "")
            if expanded:
                anti_url_counts_map[expanded] = anti_url_counts_map.get(expanded, 0) + 1
                anti_url_display_map[expanded] = u.get("display_url", expanded)
    for t, c in pro_tweets:
        raw = t.raw_json or {}
        for u in (raw.get("entities") or {}).get("urls") or []:
            expanded = u.get("expanded_url", "")
            if expanded:
                pro_url_counts_map[expanded] = pro_url_counts_map.get(expanded, 0) + 1
                pro_url_display_map[expanded] = u.get("display_url", expanded)

    shared_url_keys = set(anti_url_counts_map.keys()) & set(pro_url_counts_map.keys())
    shared_urls = sorted(
        [
            {"url": u, "display": anti_url_display_map.get(u, u), "anti_count": anti_url_counts_map[u], "pro_count": pro_url_counts_map[u], "total": anti_url_counts_map[u] + pro_url_counts_map[u]}
            for u in shared_url_keys
        ],
        key=lambda x: x["total"],
        reverse=True,
    )[:10]

    # Shared narratives (frames used by both sides)
    from pipeline.framing import get_topic_labels_async
    topic_frame_labels, topic_emotion_labels = await get_topic_labels_async(db, topic)
    anti_frame_counts: Counter = Counter()
    pro_frame_counts: Counter = Counter()
    for t, c in anti_tweets:
        if c.narrative_frames:
            for f in c.narrative_frames:
                anti_frame_counts[f] += 1
    for t, c in pro_tweets:
        if c.narrative_frames:
            for f in c.narrative_frames:
                pro_frame_counts[f] += 1

    shared_frames = []
    for frame in set(anti_frame_counts.keys()) & set(pro_frame_counts.keys()):
        anti_c = anti_frame_counts[frame]
        pro_c = pro_frame_counts[frame]
        shared_frames.append({
            "frame": frame,
            "label": topic_frame_labels.get(frame, frame),
            "anti_count": anti_c,
            "pro_count": pro_c,
            "total": anti_c + pro_c,
        })
    shared_frames.sort(key=lambda x: x["total"], reverse=True)

    overlap = {
        "shared_sources": shared_sources,
        "shared_urls": shared_urls,
        "shared_narratives": shared_frames[:8],
    }

    result = {
        "engagement": engagement,
        "voices": voices,
        "phrases": phrases,
        "sources": sources,
        "exclusive_stories": exclusive_stories,
        "keyword_gaps": keyword_gaps,
        "overlap": overlap,
        "anti_label": topic_obj.anti_label,
        "pro_label": topic_obj.pro_label,
    }
    set_cache(cache_key, result)
    return result


@router.get("/pulse-extras")
async def get_pulse_extras(
    topic: str,
    hours: int = Query(default=720),
    db: AsyncSession = Depends(get_db),
    user: dict | None = Depends(optional_user),
):
    """Return viral posts and alert flags for the executive pulse tab."""
    await _check_feed_topic_access(topic, user, db)
    cache_key = f"{topic}:pulse_extras"
    cached = get_cached(cache_key, ttl=cache_ttl_for_topic(topic))
    if cached is not None:
        return cached
    since = await _get_latest_run_since(topic, db, fallback_hours=hours)

    topic_result = await db.execute(select(Topic).where(Topic.slug == topic))
    topic_obj = topic_result.scalar_one_or_none()
    if not topic_obj:
        return {}

    anti_bent = topic_obj.anti_label.lower().replace(" ", "-")
    pro_bent = topic_obj.pro_label.lower().replace(" ", "-")
    aL = topic_obj.anti_label
    pL = topic_obj.pro_label

    stmt = (
        select(Tweet, Classification)
        .join(Classification, Tweet.id_str == Classification.id_str)
        .where(
            Tweet.topic_slug == topic,
            Tweet.fetched_at >= since,
            Classification.about_subject == True,
        )
    )
    result = await db.execute(stmt)
    rows = result.all()

    anti_tw = [(t, c) for t, c in rows if c.effective_political_bent == anti_bent]
    pro_tw = [(t, c) for t, c in rows if c.effective_political_bent == pro_bent]

    # --- Viral Posts: top 3 per side by engagement ---
    def top_tweets(tweets, n=3):
        if not tweets:
            return []
        tweets_sorted = sorted(tweets, key=lambda x: x[0].engagement or 0, reverse=True)
        results = []
        for t, c in tweets_sorted[:n]:
            results.append({
                "id_str": t.id_str,
                "screen_name": t.screen_name,
                "author_name": t.author_name,
                "full_text": t.full_text,
                "likes": t.likes or 0,
                "retweets": t.retweets or 0,
                "views": t.views or 0,
                "engagement": t.engagement or 0,
                "url": t.url,
                "created_at": t.created_at.isoformat() if t.created_at else None,
            })
        return results

    viral = {
        "anti": top_tweets(anti_tw),
        "pro": top_tweets(pro_tw),
    }

    # --- Alert Flags ---
    alerts = []

    # 1. Volume imbalance
    if anti_tw and pro_tw:
        ratio = max(len(anti_tw), len(pro_tw)) / max(min(len(anti_tw), len(pro_tw)), 1)
        if ratio >= 3:
            dominant = aL if len(anti_tw) > len(pro_tw) else pL
            alerts.append({
                "type": "volume_imbalance",
                "severity": "high" if ratio >= 5 else "medium",
                "message": f"{dominant} side has {ratio:.0f}x more posts — the other side is significantly underrepresented.",
            })

    # 2. Single post dominating attention
    all_sorted = sorted(rows, key=lambda x: x[0].engagement or 0, reverse=True)
    if len(all_sorted) >= 5:
        top_eng = all_sorted[0][0].engagement or 0
        second_eng = all_sorted[1][0].engagement or 0
        avg_eng = sum(t.engagement or 0 for t, c in all_sorted[:20]) / 20
        if top_eng > avg_eng * 10 and top_eng > second_eng * 3:
            t, c = all_sorted[0]
            side = aL if c.effective_political_bent == anti_bent else pL
            alerts.append({
                "type": "viral_outlier",
                "severity": "medium",
                "message": f"One {side} post by @{t.screen_name} has {top_eng:,} engagements — {round(top_eng / max(avg_eng, 1))}x the average.",
                "tweet_url": t.url,
                "screen_name": t.screen_name,
            })

    # 3. High-intensity rhetoric spike
    intense_anti = [c for t, c in anti_tw if c.effective_intensity_score and abs(c.effective_intensity_score) >= 8]
    intense_pro = [c for t, c in pro_tw if c.effective_intensity_score and abs(c.effective_intensity_score) >= 8]
    for side_label, intense, total in [(aL, intense_anti, len(anti_tw)), (pL, intense_pro, len(pro_tw))]:
        if total >= 10 and len(intense) / total >= 0.25:
            pct = round(len(intense) / total * 100)
            alerts.append({
                "type": "extreme_rhetoric",
                "severity": "high",
                "message": f"{pct}% of {side_label} posts use extreme rhetoric (intensity 8+).",
            })

    # 4. Engagement-to-volume mismatch
    if anti_tw and pro_tw:
        anti_vol_share = len(anti_tw) / (len(anti_tw) + len(pro_tw))
        anti_eng_total = sum(t.engagement or 0 for t, c in anti_tw)
        pro_eng_total = sum(t.engagement or 0 for t, c in pro_tw)
        total_eng = anti_eng_total + pro_eng_total
        if total_eng > 0:
            anti_eng_share = anti_eng_total / total_eng
            for side_label, vol, eng in [(aL, anti_vol_share, anti_eng_share), (pL, 1 - anti_vol_share, 1 - anti_eng_share)]:
                if vol < 0.30 and eng > 0.60:
                    alerts.append({
                        "type": "engagement_mismatch",
                        "severity": "medium",
                        "message": f"{side_label} has only {round(vol * 100)}% of posts but captures {round(eng * 100)}% of engagement.",
                    })

    response = {
        "viral": viral,
        "alerts": alerts,
        "anti_label": aL,
        "pro_label": pL,
    }
    set_cache(cache_key, response)
    return response


@router.get("/narrative-strategy")
async def get_narrative_strategy(
    topic: str,
    hours: int = Query(default=720),
    db: AsyncSession = Depends(get_db),
    user: dict | None = Depends(optional_user),
):
    """Return frame engagement, playbook structure, and narrative gaps."""
    await _check_feed_topic_access(topic, user, db)
    ck = f"{topic}:narr_strategy:{hours}"
    cv = get_cached(ck)
    if cv is not None: return cv
    since = await _get_latest_run_since(topic, db, fallback_hours=hours)

    topic_result = await db.execute(select(Topic).where(Topic.slug == topic))
    topic_obj = topic_result.scalar_one_or_none()
    if not topic_obj:
        return {}

    anti_bent = topic_obj.anti_label.lower().replace(" ", "-")
    pro_bent = topic_obj.pro_label.lower().replace(" ", "-")
    aL = topic_obj.anti_label
    pL = topic_obj.pro_label

    from pipeline.framing import get_topic_labels_async
    frame_labels, emotion_labels = await get_topic_labels_async(db, topic)

    stmt = (
        select(Tweet, Classification)
        .join(Classification, Tweet.id_str == Classification.id_str)
        .where(
            Tweet.topic_slug == topic,
            Tweet.fetched_at >= since,
            Classification.about_subject == True,
            Classification.narrative_frames != None,
        )
    )
    result = await db.execute(stmt)
    rows = result.all()

    anti_tw = [(t, c) for t, c in rows if c.effective_political_bent == anti_bent]
    pro_tw = [(t, c) for t, c in rows if c.effective_political_bent == pro_bent]

    # --- Frame engagement ---
    from collections import Counter
    frame_eng: dict[str, list[int]] = {}
    for t, c in rows:
        if c.narrative_frames:
            for f in c.narrative_frames:
                if f not in frame_eng:
                    frame_eng[f] = []
                frame_eng[f].append(t.engagement or 0)

    frame_performance = []
    for frame, engs in frame_eng.items():
        if len(engs) >= 3:
            frame_performance.append({
                "frame": frame,
                "label": frame_labels.get(frame, frame),
                "avg_engagement": round(sum(engs) / len(engs)),
                "tweet_count": len(engs),
            })
    frame_performance.sort(key=lambda x: -x["avg_engagement"])

    # --- Frame shares per side (for playbook + gaps) ---
    def frame_shares(tweets):
        counts: Counter = Counter()
        for t, c in tweets:
            if c.narrative_frames:
                for f in c.narrative_frames:
                    counts[f] += 1
        total = sum(counts.values()) or 1
        return {f: round(c / total * 100, 1) for f, c in counts.most_common()}

    anti_shares = frame_shares(anti_tw)
    pro_shares = frame_shares(pro_tw)

    # --- Playbook: top 3 frames per side ---
    def build_playbook(shares):
        ranked = sorted(shares.items(), key=lambda x: -x[1])[:3]
        return [{"frame": f, "label": frame_labels.get(f, f), "share": s} for f, s in ranked]

    # --- Gaps: where each side under-indexes ---
    all_frames = set(anti_shares.keys()) | set(pro_shares.keys())

    def build_gaps(my_shares, other_shares, n=3):
        gaps = []
        for f in all_frames:
            my = my_shares.get(f, 0)
            other = other_shares.get(f, 0)
            gap = other - my
            if gap >= 3:
                gaps.append({
                    "frame": f,
                    "label": frame_labels.get(f, f),
                    "my_share": my,
                    "other_share": other,
                    "gap": round(gap, 1),
                })
        gaps.sort(key=lambda x: -x["gap"])
        return gaps[:n]

    r = {
        "frame_performance": frame_performance[:8],
        "playbook": {
            "anti": build_playbook(anti_shares),
            "pro": build_playbook(pro_shares),
        },
        "gaps": {
            "anti": build_gaps(anti_shares, pro_shares),
            "pro": build_gaps(pro_shares, anti_shares),
        },
        "anti_label": aL,
        "pro_label": pL,
    }
    set_cache(ck, r)
    return r


@router.get("/narrative-depth")
async def get_narrative_depth(
    topic: str,
    hours: int = Query(default=720),
    db: AsyncSession = Depends(get_db),
    user: dict | None = Depends(optional_user),
):
    """Return rhetoric intensity, example tweets per frame, and amplification signals."""
    await _check_feed_topic_access(topic, user, db)
    ck = f"{topic}:narr_depth:{hours}"
    cv = get_cached(ck)
    if cv is not None: return cv
    since = await _get_latest_run_since(topic, db, fallback_hours=hours)

    topic_result = await db.execute(select(Topic).where(Topic.slug == topic))
    topic_obj = topic_result.scalar_one_or_none()
    if not topic_obj:
        return {}

    anti_bent = topic_obj.anti_label.lower().replace(" ", "-")
    pro_bent = topic_obj.pro_label.lower().replace(" ", "-")
    aL = topic_obj.anti_label
    pL = topic_obj.pro_label

    from pipeline.framing import get_topic_labels_async
    frame_labels, emotion_labels = await get_topic_labels_async(db, topic)

    stmt = (
        select(Tweet, Classification)
        .join(Classification, Tweet.id_str == Classification.id_str)
        .where(
            Tweet.topic_slug == topic,
            Tweet.fetched_at >= since,
            Classification.about_subject == True,
        )
    )
    result = await db.execute(stmt)
    rows = result.all()

    anti_tw = [(t, c) for t, c in rows if c.effective_political_bent == anti_bent]
    pro_tw = [(t, c) for t, c in rows if c.effective_political_bent == pro_bent]

    # --- 1. Rhetoric Intensity ---
    def intensity_bucket(score):
        if score is None:
            return None
        a = abs(score)
        if a <= 3:
            return "mild"
        elif a <= 6:
            return "moderate"
        elif a <= 8:
            return "aggressive"
        else:
            return "extreme"

    def intensity_profile(tweets):
        buckets = {"mild": 0, "moderate": 0, "aggressive": 0, "extreme": 0}
        scores = []
        for t, c in tweets:
            s = c.effective_intensity_score
            if s is not None:
                scores.append(abs(s))
                b = intensity_bucket(s)
                if b:
                    buckets[b] += 1
        total = sum(buckets.values()) or 1
        return {
            "distribution": {k: round(v / total * 100, 1) for k, v in buckets.items()},
            "avg_intensity": round(sum(scores) / len(scores), 1) if scores else 0,
            "total_scored": len(scores),
        }

    rhetoric = {
        "anti": intensity_profile(anti_tw),
        "pro": intensity_profile(pro_tw),
    }

    # --- 2. Example Tweets per Frame ---
    # For each of the top frames, pick the highest-engagement tweet per side
    framed_rows = [(t, c) for t, c in rows if c.narrative_frames]
    from collections import Counter
    frame_counts = Counter()
    for t, c in framed_rows:
        for f in c.narrative_frames:
            frame_counts[f] += 1
    top_frame_keys = [f for f, _ in frame_counts.most_common(6)]

    example_tweets = []
    for frame_key in top_frame_keys:
        frame_tweets = [(t, c) for t, c in framed_rows if frame_key in c.narrative_frames]
        anti_frame = [(t, c) for t, c in frame_tweets if c.effective_political_bent == anti_bent]
        pro_frame = [(t, c) for t, c in frame_tweets if c.effective_political_bent == pro_bent]
        anti_frame.sort(key=lambda x: x[0].engagement or 0, reverse=True)
        pro_frame.sort(key=lambda x: x[0].engagement or 0, reverse=True)

        def tweet_obj(t, c):
            return {
                "id_str": t.id_str,
                "screen_name": t.screen_name,
                "author_name": t.author_name,
                "full_text": t.full_text[:280],
                "likes": t.likes or 0,
                "retweets": t.retweets or 0,
                "replies": t.replies or 0,
                "views": t.views or 0,
                "engagement": t.engagement or 0,
                "author_followers": t.author_followers or 0,
                "url": t.url,
                "intensity_score": c.effective_intensity_score,
                "emotion": emotion_labels.get(c.emotion_mode, c.emotion_mode) if c.emotion_mode else None,
            }

        example_tweets.append({
            "frame": frame_key,
            "label": frame_labels.get(frame_key, frame_key),
            "anti": tweet_obj(*anti_frame[0]) if anti_frame else None,
            "pro": tweet_obj(*pro_frame[0]) if pro_frame else None,
            "anti_tweets": [tweet_obj(*x) for x in anti_frame[:5]],
            "pro_tweets": [tweet_obj(*x) for x in pro_frame[:5]],
        })

    # --- 3. Amplification Signals ---
    # Compare engagement from high-follower vs low-follower accounts
    follower_threshold = 50000  # 50K followers = "high reach"

    def amplification_stats(tweets):
        high_reach = [(t, c) for t, c in tweets if (t.author_followers or 0) >= follower_threshold]
        organic = [(t, c) for t, c in tweets if (t.author_followers or 0) < follower_threshold]

        def avg_eng(lst):
            if not lst:
                return 0
            return round(sum(t.engagement or 0 for t, c in lst) / len(lst))

        def total_eng(lst):
            return sum(t.engagement or 0 for t, c in lst)

        high_total_eng = total_eng(high_reach)
        organic_total_eng = total_eng(organic)
        all_total_eng = high_total_eng + organic_total_eng or 1

        return {
            "high_reach_count": len(high_reach),
            "organic_count": len(organic),
            "high_reach_avg_eng": avg_eng(high_reach),
            "organic_avg_eng": avg_eng(organic),
            "high_reach_eng_share": round(high_total_eng / all_total_eng * 100, 1),
            "top_amplifiers": [
                {
                    "screen_name": t.screen_name,
                    "author_name": t.author_name,
                    "full_text": (t.full_text or "")[:200],
                    "followers": t.author_followers or 0,
                    "engagement": t.engagement or 0,
                    "url": t.url,
                }
                for t, c in sorted(high_reach, key=lambda x: x[0].engagement or 0, reverse=True)[:3]
            ],
        }

    amplification = {
        "anti": amplification_stats(anti_tw),
        "pro": amplification_stats(pro_tw),
        "follower_threshold": follower_threshold,
    }

    # Most amplified frames: which frames get disproportionate engagement from high-reach accounts
    frame_amplified = {}
    for t, c in framed_rows:
        if (t.author_followers or 0) >= follower_threshold and c.narrative_frames:
            for f in c.narrative_frames:
                if f not in frame_amplified:
                    frame_amplified[f] = []
                frame_amplified[f].append(t.engagement or 0)

    amplified_frames = []
    for f, engs in frame_amplified.items():
        if len(engs) >= 2:
            amplified_frames.append({
                "frame": f,
                "label": frame_labels.get(f, f),
                "high_reach_tweets": len(engs),
                "avg_engagement": round(sum(engs) / len(engs)),
            })
    amplified_frames.sort(key=lambda x: -x["avg_engagement"])
    amplification["amplified_frames"] = amplified_frames[:5]

    r = {
        "rhetoric": rhetoric,
        "example_tweets": example_tweets,
        "amplification": amplification,
        "anti_label": aL,
        "pro_label": pL,
    }
    set_cache(ck, r)
    return r


@router.get("/media-breakdown")
async def get_media_breakdown(
    topic: str,
    hours: int = Query(default=720),
    db: AsyncSession = Depends(get_db),
    user: dict | None = Depends(optional_user),
):
    """Return media type distribution per side."""
    await _check_feed_topic_access(topic, user, db)
    cache_key = f"{topic}:media_breakdown"
    cached = get_cached(cache_key, ttl=cache_ttl_for_topic(topic))
    if cached is not None:
        return cached
    since = await _get_latest_run_since(topic, db, fallback_hours=hours)

    topic_result = await db.execute(select(Topic).where(Topic.slug == topic))
    topic_obj = topic_result.scalar_one_or_none()
    if not topic_obj:
        return {}

    anti_bent = topic_obj.anti_label.lower().replace(" ", "-")
    pro_bent = topic_obj.pro_label.lower().replace(" ", "-")

    stmt = (
        select(Tweet, Classification)
        .join(Classification, Tweet.id_str == Classification.id_str)
        .where(
            Tweet.topic_slug == topic,
            Tweet.fetched_at >= since,
            Classification.about_subject == True,
        )
    )
    result = await db.execute(stmt)
    rows = result.all()

    def media_stats(tweets):
        text_only = 0
        with_photo = 0
        with_video = 0
        with_link = 0
        for t, c in tweets:
            media_items = extract_media(t.raw_json)
            has_photo = any(m.type == "photo" for m in media_items)
            has_video = any(m.type == "video" for m in media_items)
            # Check for links in raw_json entities.urls
            urls = []
            if t.raw_json and isinstance(t.raw_json, dict):
                urls = t.raw_json.get("entities", {}).get("urls", [])
            has_link = len(urls) > 0

            if has_video:
                with_video += 1
            elif has_photo:
                with_photo += 1
            elif has_link:
                with_link += 1
            else:
                text_only += 1
        total = text_only + with_photo + with_video + with_link or 1
        return {
            "text_only": text_only,
            "photo": with_photo,
            "video": with_video,
            "link": with_link,
            "total": total,
            "pct": {
                "text_only": round(text_only / total * 100, 1),
                "photo": round(with_photo / total * 100, 1),
                "video": round(with_video / total * 100, 1),
                "link": round(with_link / total * 100, 1),
            },
        }

    anti_tw = [(t, c) for t, c in rows if c.effective_political_bent == anti_bent]
    pro_tw = [(t, c) for t, c in rows if c.effective_political_bent == pro_bent]

    response = {
        "anti": media_stats(anti_tw),
        "pro": media_stats(pro_tw),
        "overall": media_stats(rows),
        "anti_label": topic_obj.anti_label,
        "pro_label": topic_obj.pro_label,
    }
    set_cache(cache_key, response)
    return response


@router.get("/side-by-side-feed")
async def get_side_by_side_feed(
    topic: str,
    hours: int = Query(default=720),
    n: int = Query(default=5, le=10),
    db: AsyncSession = Depends(get_db),
    user: dict | None = Depends(optional_user),
):
    """Return top N tweets per side for a side-by-side feed preview."""
    await _check_feed_topic_access(topic, user, db)
    since = await _get_latest_run_since(topic, db, fallback_hours=hours)

    topic_result = await db.execute(select(Topic).where(Topic.slug == topic))
    topic_obj = topic_result.scalar_one_or_none()
    if not topic_obj:
        return {}

    anti_bent = topic_obj.anti_label.lower().replace(" ", "-")
    pro_bent = topic_obj.pro_label.lower().replace(" ", "-")

    stmt = (
        select(Tweet, Classification)
        .join(Classification, Tweet.id_str == Classification.id_str)
        .where(
            Tweet.topic_slug == topic,
            Tweet.fetched_at >= since,
            Classification.about_subject == True,
        )
    )
    result = await db.execute(stmt)
    rows = result.all()

    anti_tw = sorted(
        [(t, c) for t, c in rows if c.effective_political_bent == anti_bent],
        key=lambda x: x[0].engagement or 0, reverse=True
    )[:n]
    pro_tw = sorted(
        [(t, c) for t, c in rows if c.effective_political_bent == pro_bent],
        key=lambda x: x[0].engagement or 0, reverse=True
    )[:n]

    def build_item(t, c):
        media_items = extract_media(t.raw_json)
        return {
            "id_str": t.id_str,
            "screen_name": t.screen_name,
            "author_name": t.author_name,
            "author_followers": t.author_followers or 0,
            "full_text": t.full_text,
            "likes": t.likes or 0,
            "retweets": t.retweets or 0,
            "quotes": t.quotes or 0,
            "replies": t.replies or 0,
            "views": t.views or 0,
            "engagement": t.engagement or 0,
            "url": t.url,
            "created_at": t.created_at.isoformat() if t.created_at else None,
            "media": [{"type": m.type, "url": m.url, "thumbnail": m.thumbnail} for m in media_items],
        }

    return {
        "anti": [build_item(t, c) for t, c in anti_tw],
        "pro": [build_item(t, c) for t, c in pro_tw],
        "anti_label": topic_obj.anti_label,
        "pro_label": topic_obj.pro_label,
    }


@router.get("/hashtags")
async def get_hashtags(
    topic: str,
    hours: int = Query(default=720),
    db: AsyncSession = Depends(get_db),
    user: dict | None = Depends(optional_user),
):
    """Return hashtag frequency per side."""
    await _check_feed_topic_access(topic, user, db)
    cache_key = f"{topic}:hashtags"
    cached = get_cached(cache_key, ttl=cache_ttl_for_topic(topic))
    if cached is not None:
        return cached
    since = await _get_latest_run_since(topic, db, fallback_hours=hours)

    topic_result = await db.execute(select(Topic).where(Topic.slug == topic))
    topic_obj = topic_result.scalar_one_or_none()
    if not topic_obj:
        return {}

    anti_bent = topic_obj.anti_label.lower().replace(" ", "-")
    pro_bent = topic_obj.pro_label.lower().replace(" ", "-")

    stmt = (
        select(Tweet, Classification)
        .join(Classification, Tweet.id_str == Classification.id_str)
        .where(
            Tweet.topic_slug == topic,
            Tweet.fetched_at >= since,
            Classification.about_subject == True,
        )
    )
    result = await db.execute(stmt)
    rows = result.all()

    from collections import Counter

    def extract_hashtags(tweets):
        counts: Counter = Counter()
        for t, c in tweets:
            raw = t.raw_json or {}
            hashtags = (raw.get("entities") or {}).get("hashtags") or []
            for h in hashtags:
                tag = h.get("text", "").strip()
                if tag:
                    counts[tag.lower()] += 1
        return [{"tag": tag, "count": count} for tag, count in counts.most_common(20)]

    anti_tw = [(t, c) for t, c in rows if c.effective_political_bent == anti_bent]
    pro_tw = [(t, c) for t, c in rows if c.effective_political_bent == pro_bent]

    # Find hashtags unique to each side or shared
    anti_tags = {h.get("text", "").strip().lower() for t, c in anti_tw for h in ((t.raw_json or {}).get("entities") or {}).get("hashtags") or [] if h.get("text")}
    pro_tags = {h.get("text", "").strip().lower() for t, c in pro_tw for h in ((t.raw_json or {}).get("entities") or {}).get("hashtags") or [] if h.get("text")}
    shared_tags = anti_tags & pro_tags

    response = {
        "anti": extract_hashtags(anti_tw),
        "pro": extract_hashtags(pro_tw),
        "overall": extract_hashtags(rows),
        "shared_count": len(shared_tags),
        "anti_only_count": len(anti_tags - pro_tags),
        "pro_only_count": len(pro_tags - anti_tags),
        "anti_label": topic_obj.anti_label,
        "pro_label": topic_obj.pro_label,
    }
    set_cache(cache_key, response)
    return response


@router.get("/last-run")
async def get_last_run(
    topic: str,
    db: AsyncSession = Depends(get_db),
    user: dict | None = Depends(optional_user),
):
    """Return the most recent pipeline run metadata."""
    await _check_feed_topic_access(topic, user, db)
    stmt = (
        select(FetchRun)
        .where(FetchRun.topic_slug == topic)
        .order_by(FetchRun.ran_at.desc())
        .limit(1)
    )
    result = await db.execute(stmt)
    run = result.scalar_one_or_none()
    if not run:
        return {}

    # Count total tweets in dataset
    tweet_count = await db.execute(
        select(func.count(Tweet.id_str)).where(Tweet.topic_slug == topic)
    )
    total_tweets = tweet_count.scalar() or 0

    # Date range of tweets
    date_range = await db.execute(
        select(func.min(Tweet.created_at), func.max(Tweet.created_at)).where(Tweet.topic_slug == topic)
    )
    row = date_range.one()
    earliest = row[0].isoformat() if row[0] else None
    latest = row[1].isoformat() if row[1] else None

    return {
        "ran_at": run.ran_at.isoformat() if run.ran_at else None,
        "tweets_fetched": run.tweets_fetched,
        "tweets_new": run.tweets_new,
        "tweets_classified": run.tweets_classified,
        "total_cost_usd": float(run.total_cost_usd) if run.total_cost_usd else 0,
        "status": run.status,
        "total_tweets_in_dataset": total_tweets,
        "date_range": {"earliest": earliest, "latest": latest},
    }


@router.get("/dunks")
async def get_dunks(
    topic: str,
    hours: int = Query(default=720),
    db: AsyncSession = Depends(get_db),
    user: dict | None = Depends(optional_user),
):
    """Find tweets being 'dunked on' — cross-side engagement, ratio'd tweets, quote-dunks."""
    await _check_feed_topic_access(topic, user, db)
    cache_key = f"{topic}:dunks"
    cached = get_cached(cache_key, ttl=cache_ttl_for_topic(topic))
    if cached is not None:
        return cached
    since = await _get_latest_run_since(topic, db, fallback_hours=hours)

    topic_result = await db.execute(select(Topic).where(Topic.slug == topic))
    topic_obj = topic_result.scalar_one_or_none()
    if not topic_obj:
        return {}

    anti_bent = topic_obj.anti_label.lower().replace(" ", "-")
    pro_bent = topic_obj.pro_label.lower().replace(" ", "-")
    aL = topic_obj.anti_label
    pL = topic_obj.pro_label

    stmt = (
        select(Tweet, Classification)
        .join(Classification, Tweet.id_str == Classification.id_str)
        .where(
            Tweet.topic_slug == topic,
            Tweet.fetched_at >= since,
            Classification.about_subject == True,
        )
    )
    result = await db.execute(stmt)
    rows = result.all()

    # Build index: tweet_id -> list of (bent, intensity) of accounts that quoted/replied
    cross_engagement: dict[str, list[str]] = defaultdict(list)
    for t, c in rows:
        raw = t.raw_json or {}
        bent = c.effective_political_bent or ""
        # Quote tweets
        quoted = raw.get("quoted_status")
        if quoted and quoted.get("id_str"):
            cross_engagement[quoted["id_str"]].append(bent)
        # Replies
        reply_to = raw.get("in_reply_to_status_id_str")
        if reply_to:
            cross_engagement[reply_to].append(bent)

    # Build tweet lookup for quick access
    tweet_map = {t.id_str: (t, c) for t, c in rows}

    # Score each tweet for "dunk" potential
    dunks = []
    for t, c in rows:
        bent = c.effective_political_bent or ""
        if bent not in (anti_bent, pro_bent):
            continue

        likes = t.likes or 0
        replies = t.replies or 0
        retweets = t.retweets or 0
        quotes = t.quotes or 0
        views = t.views or 0
        engagement = t.engagement or 0

        # Signal 1: Reply ratio + absolute volume
        reply_ratio = replies / max(likes, 1)
        ratio_score = min(reply_ratio / 1.0, 2.0)
        # Volume multiplier: 10+ replies = 1.0, 50+ = 1.5, 200+ = 2.0
        reply_volume = min(math.log10(max(replies, 1)) / 2.3, 2.0)  # log10(200) ≈ 2.3
        ratio_score *= max(reply_volume, 0.1)  # near-zero replies = near-zero score

        # Signal 2: Cross-side quote/reply engagement from classified accounts
        engagers = cross_engagement.get(t.id_str, [])
        opposite_side = pro_bent if bent == anti_bent else anti_bent
        opposite_engagers = sum(1 for b in engagers if b == opposite_side)
        same_engagers = sum(1 for b in engagers if b == bent)
        cross_score = opposite_engagers * 2.0

        # Signal 3: Quote ratio + absolute volume
        quote_ratio = quotes / max(retweets, 1)
        quote_score = min(quote_ratio * 2.0, 2.0)
        # Volume multiplier: 5+ quotes = 1.0, 20+ = 1.5, 100+ = 2.0
        quote_volume = min(math.log10(max(quotes, 1)) / 2.0, 2.0)
        quote_score *= max(quote_volume, 0.1)

        # Signal 4: Raw engagement (needs to be visible enough to matter)
        visibility = math.log10(max(views, 1)) / 6.0

        # Signal 5: Absolute reply + quote volume (prioritize high-volume controversy)
        reply_quote_total = replies + quotes
        reaction_volume = min(math.log10(max(reply_quote_total, 1)) / 2.5, 2.0)  # log10(300) ≈ 2.5

        # Combined dunk score — reaction volume weighted heavily
        dunk_score = (ratio_score * 0.20 + cross_score * 0.25 + quote_score * 0.10 + visibility * 0.15 + reaction_volume * 0.30)

        if dunk_score < 0.1:
            continue

        # Determine dunk type
        dunk_type = "ratio'd"
        if cross_score > ratio_score and cross_score > quote_score:
            dunk_type = "cross-side engagement"
        elif quote_score > ratio_score:
            dunk_type = "quote-dunked"

        # Get example dunkers (opposite-side accounts that quoted/replied)
        dunker_examples = []
        for t2, c2 in rows:
            raw2 = t2.raw_json or {}
            c2_bent = c2.effective_political_bent or ""
            if c2_bent != opposite_side:
                continue
            quoted2 = raw2.get("quoted_status")
            reply_to2 = raw2.get("in_reply_to_status_id_str")
            if (quoted2 and quoted2.get("id_str") == t.id_str) or reply_to2 == t.id_str:
                dunker_examples.append({
                    "screen_name": t2.screen_name,
                    "full_text": t2.full_text or "",
                    "engagement": t2.engagement or 0,
                    "url": t2.url,
                    "is_quote": bool(quoted2 and quoted2.get("id_str") == t.id_str),
                })
            if len(dunker_examples) >= 3:
                break

        dunks.append({
            "tweet": {
                "id_str": t.id_str,
                "screen_name": t.screen_name,
                "author_name": t.author_name,
                "full_text": t.full_text or "",
                "likes": likes,
                "retweets": retweets,
                "quotes": quotes,
                "replies": replies,
                "views": views,
                "engagement": engagement,
                "author_followers": t.author_followers or 0,
                "url": t.url,
                "created_at": t.created_at.isoformat() if t.created_at else None,
            },
            "side": aL if bent == anti_bent else pL,
            "dunked_by": pL if bent == anti_bent else aL,
            "dunk_score": round(dunk_score, 3),
            "dunk_type": dunk_type,
            "reply_ratio": round(reply_ratio, 2),
            "opposite_engagers": opposite_engagers,
            "quote_ratio": round(quote_ratio, 2),
            "dunker_examples": dunker_examples,
        })

    dunks.sort(key=lambda x: -x["dunk_score"])

    response = {
        "dunks": dunks[:20],
        "anti_label": aL,
        "pro_label": pL,
        "total_analyzed": len(rows),
    }
    set_cache(cache_key, response)
    return response


@router.get("/geography")
async def get_geography(
    topic: str,
    hours: int = Query(default=720),
    db: AsyncSession = Depends(get_db),
    user: dict | None = Depends(optional_user),
):
    """Geographic distribution of tweet authors by location."""
    await _check_feed_topic_access(topic, user, db)

    cache_key = f"{topic}:geography:{hours}"
    cached = get_cached(cache_key, ttl=cache_ttl_for_topic(topic))
    if cached is not None:
        return cached

    since = await _get_latest_run_since(topic, db, fallback_hours=hours)

    # Load topic labels
    topic_result = await db.execute(select(Topic).where(Topic.slug == topic))
    t = topic_result.scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="Topic not found")
    aL = t.anti_label
    pL = t.pro_label
    anti_bent = aL.lower().replace(" ", "-")
    pro_bent = pL.lower().replace(" ", "-")

    # Query tweets with location from raw_json using raw SQL for JSONB access
    raw_stmt = text("""
        SELECT t.raw_json->'user'->>'location' AS location,
               c.effective_political_bent,
               COALESCE(t.views, 0) AS views,
               COALESCE(t.engagement, 0) AS eng
        FROM tweets t
        JOIN classifications c ON t.id_str = c.id_str
        WHERE t.topic_slug = :topic
          AND t.fetched_at >= :since
          AND c.about_subject = TRUE
          AND t.raw_json IS NOT NULL
          AND t.raw_json->'user'->>'location' IS NOT NULL
          AND TRIM(t.raw_json->'user'->>'location') != ''
    """)

    result = await db.execute(raw_stmt, {"topic": topic, "since": since})
    rows = result.all()

    import re as _re
    import unicodedata as _ud

    def _is_valid_location(s: str) -> bool:
        """Filter out non-location strings from Twitter profile location field."""
        if len(s) < 2 or len(s) > 80:
            return False
        # Strip emojis and special chars — if nothing meaningful remains, skip
        stripped = _re.sub(r'[^\w\s,.\-/&\'()]', '', s, flags=_re.UNICODE).strip()
        if len(stripped) < 2:
            return False
        # Must contain at least one letter
        if not any(c.isalpha() for c in stripped):
            return False
        # Reject common non-location patterns
        lower = s.lower()
        reject_phrases = [
            "turn on", "notifications", "subscribe", "follow me", "link in bio",
            "dm for", "booking", "check out", "http", "www.", ".com", "@",
            "god", "heaven", "earth", "worldwide", "everywhere", "internet",
            "your mom", "your heart", "the moon", "mars", "hogwarts",
            "maga", "trump", "biden", "resist", "wake up",
            " to ", " in ", " from ", " and ", " for ", " with ",
            " since ", " born ", " living ", " moved ",
            "hopefully", "traveling", "somewhere", "nowhere", "home",
            "retired", "proud", "lover", "fan of", "just a",
            "the world", "planet", "galaxy", "universe", "global",
        ]
        if any(phrase in lower for phrase in reject_phrases):
            return False
        # Positive validation: must contain at least one recognized place name
        parts = [p.strip().lower() for p in _re.split(r'[,/|·•]', lower) if p.strip()]
        has_known_place = False
        for part in parts:
            if part in _LOCATION_MARKERS:
                has_known_place = True
                break
            # Check if any known place is a substring (e.g., "south florida" contains no exact match but "florida" does)
            for marker in _LOCATION_MARKERS:
                if len(marker) >= 3 and marker in part:
                    has_known_place = True
                    break
            if has_known_place:
                break
        return has_known_place

    # US state abbreviation → full name
    _US_STATES = {
        "al": "Alabama", "ak": "Alaska", "az": "Arizona", "ar": "Arkansas", "ca": "California",
        "co": "Colorado", "ct": "Connecticut", "de": "Delaware", "fl": "Florida", "ga": "Georgia",
        "hi": "Hawaii", "id": "Idaho", "il": "Illinois", "in": "Indiana", "ia": "Iowa",
        "ks": "Kansas", "ky": "Kentucky", "la": "Louisiana", "me": "Maine", "md": "Maryland",
        "ma": "Massachusetts", "mi": "Michigan", "mn": "Minnesota", "ms": "Mississippi", "mo": "Missouri",
        "mt": "Montana", "ne": "Nebraska", "nv": "Nevada", "nh": "New Hampshire", "nj": "New Jersey",
        "nm": "New Mexico", "ny": "New York", "nc": "North Carolina", "nd": "North Dakota", "oh": "Ohio",
        "ok": "Oklahoma", "or": "Oregon", "pa": "Pennsylvania", "ri": "Rhode Island", "sc": "South Carolina",
        "sd": "South Dakota", "tn": "Tennessee", "tx": "Texas", "ut": "Utah", "vt": "Vermont",
        "va": "Virginia", "wa": "Washington", "wv": "West Virginia", "wi": "Wisconsin", "wy": "Wyoming",
        "dc": "Washington, D.C.",
    }
    _US_STATE_NAMES = {v.lower(): v for v in _US_STATES.values()}
    _CA_PROVINCES = {
        "on": "Ontario", "qc": "Quebec", "bc": "British Columbia", "ab": "Alberta",
        "mb": "Manitoba", "sk": "Saskatchewan", "ns": "Nova Scotia", "nb": "New Brunswick",
    }
    _COUNTRIES = {
        "us": "USA", "usa": "USA", "united states": "USA", "united states of america": "USA", "america": "USA",
        "uk": "UK", "united kingdom": "UK", "england": "UK", "britain": "UK", "great britain": "UK",
        "canada": "Canada", "australia": "Australia", "india": "India", "germany": "Germany",
        "france": "France", "brazil": "Brazil", "japan": "Japan", "mexico": "Mexico",
        "spain": "Spain", "italy": "Italy", "nigeria": "Nigeria", "south africa": "South Africa",
        "israel": "Israel", "ireland": "Ireland", "netherlands": "Netherlands", "sweden": "Sweden",
        "norway": "Norway", "switzerland": "Switzerland", "new zealand": "New Zealand",
        "philippines": "Philippines", "pakistan": "Pakistan", "indonesia": "Indonesia",
        "kenya": "Kenya", "ghana": "Ghana", "colombia": "Colombia", "argentina": "Argentina",
    }

    # Well-known cities → country mapping
    _KNOWN_CITIES = {
        "london": "UK", "manchester": "UK", "birmingham": "UK", "edinburgh": "UK", "glasgow": "UK",
        "liverpool": "UK", "leeds": "UK", "bristol": "UK", "cardiff": "UK", "belfast": "UK",
        "toronto": "Canada", "vancouver": "Canada", "montreal": "Canada", "calgary": "Canada", "ottawa": "Canada",
        "sydney": "Australia", "melbourne": "Australia", "brisbane": "Australia", "perth": "Australia",
        "paris": "France", "berlin": "Germany", "munich": "Germany", "tokyo": "Japan", "osaka": "Japan",
        "mumbai": "India", "delhi": "India", "bangalore": "India", "hyderabad": "India", "chennai": "India",
        "lagos": "Nigeria", "nairobi": "Kenya", "accra": "Ghana", "johannesburg": "South Africa", "cape town": "South Africa",
        "dublin": "Ireland", "amsterdam": "Netherlands", "stockholm": "Sweden", "oslo": "Norway",
        "zurich": "Switzerland", "geneva": "Switzerland", "madrid": "Spain", "barcelona": "Spain",
        "rome": "Italy", "milan": "Italy", "lisbon": "Portugal", "brussels": "Belgium",
        "tel aviv": "Israel", "jerusalem": "Israel", "istanbul": "Turkey", "dubai": "UAE", "abu dhabi": "UAE",
        "singapore": "Singapore", "hong kong": "Hong Kong", "seoul": "South Korea", "taipei": "Taiwan",
        "beijing": "China", "shanghai": "China", "bangkok": "Thailand", "jakarta": "Indonesia",
        "mexico city": "Mexico", "bogota": "Colombia", "buenos aires": "Argentina", "sao paulo": "Brazil",
        "rio de janeiro": "Brazil", "lima": "Peru", "santiago": "Chile",
        "auckland": "New Zealand", "wellington": "New Zealand",
    }

    # Known location words for positive validation (must be after _US_STATES, _COUNTRIES, _KNOWN_CITIES)
    _LOCATION_MARKERS = set()
    _LOCATION_MARKERS.update(v.lower() for v in _US_STATES.values())
    _LOCATION_MARKERS.update(k for k in _US_STATES.keys())
    _LOCATION_MARKERS.update(v.lower() for v in _CA_PROVINCES.values())
    _LOCATION_MARKERS.update(k for k in _CA_PROVINCES.keys())
    _LOCATION_MARKERS.update(k for k in _COUNTRIES.keys())
    _LOCATION_MARKERS.update(v.lower() for v in _COUNTRIES.values())
    _LOCATION_MARKERS.update(k for k in _KNOWN_CITIES.keys())
    _LOCATION_MARKERS.update([
        "new york", "los angeles", "chicago", "houston", "phoenix", "philadelphia",
        "san antonio", "san diego", "dallas", "san jose", "austin", "jacksonville",
        "fort worth", "columbus", "charlotte", "indianapolis", "san francisco",
        "seattle", "denver", "nashville", "oklahoma city", "el paso", "washington",
        "boston", "portland", "las vegas", "memphis", "louisville", "baltimore",
        "milwaukee", "albuquerque", "tucson", "fresno", "sacramento", "mesa",
        "kansas city", "atlanta", "omaha", "raleigh", "miami", "tampa", "minneapolis",
        "new orleans", "cleveland", "orlando", "pittsburgh", "st. louis", "detroit",
        "brooklyn", "queens", "manhattan", "bronx", "staten island", "long island",
    ])

    # US cities → state mapping
    _US_CITIES = {
        "new york": "New York", "los angeles": "California", "chicago": "Illinois",
        "houston": "Texas", "phoenix": "Arizona", "philadelphia": "Pennsylvania",
        "san antonio": "Texas", "san diego": "California", "dallas": "Texas",
        "san jose": "California", "austin": "Texas", "jacksonville": "Florida",
        "fort worth": "Texas", "columbus": "Ohio", "charlotte": "North Carolina",
        "indianapolis": "Indiana", "san francisco": "California", "seattle": "Washington",
        "denver": "Colorado", "nashville": "Tennessee", "oklahoma city": "Oklahoma",
        "el paso": "Texas", "boston": "Massachusetts", "portland": "Oregon",
        "las vegas": "Nevada", "memphis": "Tennessee", "louisville": "Kentucky",
        "baltimore": "Maryland", "milwaukee": "Wisconsin", "albuquerque": "New Mexico",
        "tucson": "Arizona", "fresno": "California", "sacramento": "California",
        "mesa": "Arizona", "kansas city": "Missouri", "atlanta": "Georgia",
        "omaha": "Nebraska", "raleigh": "North Carolina", "miami": "Florida",
        "tampa": "Florida", "minneapolis": "Minnesota", "new orleans": "Louisiana",
        "cleveland": "Ohio", "orlando": "Florida", "pittsburgh": "Pennsylvania",
        "st. louis": "Missouri", "detroit": "Michigan", "brooklyn": "New York",
        "queens": "New York", "manhattan": "New York", "bronx": "New York",
        "staten island": "New York", "long island": "New York",
        "washington dc": "Washington, D.C.", "washington d.c.": "Washington, D.C.",
        "scottsdale": "Arizona", "plano": "Texas", "irvine": "California",
        "st. petersburg": "Florida", "richmond": "Virginia", "boise": "Idaho",
        "des moines": "Iowa", "salt lake city": "Utah", "honolulu": "Hawaii",
        "anchorage": "Alaska", "birmingham": "Alabama", "charleston": "South Carolina",
        "savannah": "Georgia", "jersey city": "New Jersey", "newark": "New Jersey",
        "buffalo": "New York", "rochester": "New York", "hartford": "Connecticut",
        "providence": "Rhode Island", "cincinnati": "Ohio", "dayton": "Ohio",
    }

    def _normalize_location(raw: str) -> str:
        """Normalize Twitter location to 'City, State, Country' format."""
        # Clean up
        loc = raw.strip().rstrip(".")
        # Split by comma or common separators
        parts = [p.strip() for p in _re.split(r'[,/|·•]', loc) if p.strip()]

        if not parts:
            return loc

        # Single part — check if it's a state, country, or city
        if len(parts) == 1:
            lower = parts[0].lower()
            # Check if it's a US state abbreviation
            if lower in _US_STATES:
                return f"{_US_STATES[lower]}, USA"
            # Check if it's a full US state name
            if lower in _US_STATE_NAMES:
                return f"{_US_STATE_NAMES[lower]}, USA"
            # Check if it's a country
            if lower in _COUNTRIES:
                return _COUNTRIES[lower]
            # Check Canadian provinces
            if lower in _CA_PROVINCES:
                return f"{_CA_PROVINCES[lower]}, Canada"
            # Check US cities
            if lower in _US_CITIES:
                city_display = parts[0].title() if parts[0].islower() else parts[0]
                state = _US_CITIES[lower]
                if state == "Washington, D.C.":
                    return "Washington, D.C., USA"
                return f"{city_display}, {state}, USA"
            # Check well-known international cities
            if lower in _KNOWN_CITIES:
                city_display = parts[0].title() if parts[0].islower() else parts[0]
                return f"{city_display}, {_KNOWN_CITIES[lower]}"
            # Return as-is with title case
            return parts[0].title() if parts[0].islower() else parts[0]

        # Two parts — likely "City, State" or "City, Country"
        if len(parts) == 2:
            city = parts[0]
            second = parts[1].strip()
            second_lower = second.lower()

            # Second part is US state abbreviation
            if second_lower in _US_STATES:
                return f"{city}, {_US_STATES[second_lower]}, USA"
            # Second part is full US state name
            if second_lower in _US_STATE_NAMES:
                return f"{city}, {_US_STATE_NAMES[second_lower]}, USA"
            # Second part is a country
            if second_lower in _COUNTRIES:
                return f"{city}, {_COUNTRIES[second_lower]}"
            # Second part is Canadian province
            if second_lower in _CA_PROVINCES:
                return f"{city}, {_CA_PROVINCES[second_lower]}, Canada"
            # Check if first part is a known city (e.g. "London, Ontario")
            city_lower = city.lower().strip()
            if city_lower in _KNOWN_CITIES and second_lower not in _COUNTRIES:
                return f"{city}, {second}, {_KNOWN_CITIES[city_lower]}"
            # Return as-is
            return f"{city}, {second}"

        # Three+ parts — likely "City, State, Country" already
        return ", ".join(parts[:3])

    # Aggregate locations
    location_data = defaultdict(lambda: {"anti": 0, "pro": 0, "neutral": 0, "total": 0, "views": 0, "engagement": 0})
    for loc, bent, views, eng in rows:
        clean_loc = loc.strip()
        if not _is_valid_location(clean_loc):
            continue
        clean_loc = _normalize_location(clean_loc)
        bent_lower = (bent or "").lower()
        side = "anti" if bent_lower == anti_bent or "anti" in bent_lower or bent_lower == "negative" else \
               "pro" if bent_lower == pro_bent or "pro" in bent_lower or bent_lower == "positive" else "neutral"
        location_data[clean_loc][side] += 1
        location_data[clean_loc]["total"] += 1
        location_data[clean_loc]["views"] += views or 0
        location_data[clean_loc]["engagement"] += eng or 0

    # Sort by total count, take top locations
    sorted_locs = sorted(location_data.items(), key=lambda x: -x[1]["total"])

    # Build top locations list
    top_locations = []
    for loc, counts in sorted_locs[:50]:
        top_locations.append({
            "location": loc,
            "anti_count": counts["anti"],
            "pro_count": counts["pro"],
            "neutral_count": counts["neutral"],
            "total": counts["total"],
            "views": counts["views"],
            "engagement": counts["engagement"],
        })

    # Summary stats
    total_with_location = sum(d["total"] for d in location_data.values())
    total_anti = sum(d["anti"] for d in location_data.values())
    total_pro = sum(d["pro"] for d in location_data.values())
    unique_locations = len(location_data)

    # Count tweets without location for coverage stat
    no_loc_stmt = (
        select(func.count())
        .select_from(Tweet)
        .join(Classification, Tweet.id_str == Classification.id_str)
        .where(
            Tweet.topic_slug == topic,
            Tweet.fetched_at >= since,
            Classification.about_subject == True,
        )
    )
    total_result = await db.execute(no_loc_stmt)
    total_tweets = total_result.scalar() or 0
    coverage_pct = round(total_with_location / max(total_tweets, 1) * 100)

    # Aggregate by US state for map visualization
    _STATE_NAMES_TO_ABBR = {v.lower(): k.upper() for k, v in _US_STATES.items()}
    _STATE_NAMES_TO_ABBR["washington, d.c."] = "DC"
    state_data = defaultdict(lambda: {"anti": 0, "pro": 0, "neutral": 0, "total": 0})
    for loc_str, counts in location_data.items():
        # Extract US state from normalized location
        parts = [p.strip() for p in loc_str.split(",")]
        state_found = None
        for part in parts:
            part_lower = part.strip().lower()
            if part_lower in _STATE_NAMES_TO_ABBR:
                state_found = _STATE_NAMES_TO_ABBR[part_lower]
                break
            # Check if it's already an abbreviation
            if part_lower in _US_STATES:
                state_found = part_lower.upper()
                break
        if state_found:
            state_data[state_found]["anti"] += counts["anti"]
            state_data[state_found]["pro"] += counts["pro"]
            state_data[state_found]["neutral"] += counts["neutral"]
            state_data[state_found]["total"] += counts["total"]

    us_states_map = []
    for abbr, counts in state_data.items():
        us_states_map.append({
            "state": abbr,
            "anti_count": counts["anti"],
            "pro_count": counts["pro"],
            "neutral_count": counts["neutral"],
            "total": counts["total"],
            "ratio": round(counts["pro"] / max(counts["anti"] + counts["pro"], 1), 2),
        })
    us_states_map.sort(key=lambda x: -x["total"])

    # Aggregate by country for international map
    _ALL_COUNTRIES = set(_COUNTRIES.values())
    _ALL_COUNTRIES.add("USA")
    country_data = defaultdict(lambda: {"anti": 0, "pro": 0, "neutral": 0, "total": 0})
    for loc_str, counts in location_data.items():
        parts = [p.strip() for p in loc_str.split(",")]
        country_found = None
        # Check last part first (most likely country position)
        for part in reversed(parts):
            part_lower = part.strip().lower()
            if part_lower in _COUNTRIES:
                country_found = _COUNTRIES[part_lower]
                break
        # If location contains a US state, it's USA
        if not country_found:
            for part in parts:
                part_lower = part.strip().lower()
                if part_lower in _STATE_NAMES_TO_ABBR or part_lower in _US_STATES:
                    country_found = "USA"
                    break
        if country_found:
            country_data[country_found]["anti"] += counts["anti"]
            country_data[country_found]["pro"] += counts["pro"]
            country_data[country_found]["neutral"] += counts["neutral"]
            country_data[country_found]["total"] += counts["total"]

    countries_map = []
    for country, counts in country_data.items():
        countries_map.append({
            "country": country,
            "anti_count": counts["anti"],
            "pro_count": counts["pro"],
            "neutral_count": counts["neutral"],
            "total": counts["total"],
            "ratio": round(counts["pro"] / max(counts["anti"] + counts["pro"], 1), 2),
        })
    countries_map.sort(key=lambda x: -x["total"])

    response = {
        "locations": top_locations,
        "us_states": us_states_map,
        "countries": countries_map,
        "summary": {
            "total_with_location": total_with_location,
            "total_tweets": total_tweets,
            "coverage_pct": coverage_pct,
            "unique_locations": unique_locations,
            "anti_total": total_anti,
            "pro_total": total_pro,
        },
        "anti_label": aL,
        "pro_label": pL,
    }

    set_cache(cache_key, response)
    return response
