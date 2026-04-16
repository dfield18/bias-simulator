"""Shared configuration constants."""

# Topics accessible without authentication (demo/public showcase)
# Also get 1-hour cache TTL instead of 5-minute default
DEMO_TOPICS = {"iran-conflict", "anthropic", "peter-magyar", "pope-leo-xiii"}


# Per-tier quotas. Admin tier intentionally has no limits (None).
TIER_LIMITS = {
    "free":  {"max_topics": 1,    "max_runs": 3},
    "pro":   {"max_topics": 100,  "max_runs": 100},
    "admin": {"max_topics": None, "max_runs": None},
}


def tier_limits(tier: str) -> dict:
    """Return {max_topics, max_runs} for a tier, defaulting to free."""
    return TIER_LIMITS.get(tier, TIER_LIMITS["free"])
