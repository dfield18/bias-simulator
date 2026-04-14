"""
Simple in-memory response cache for expensive API endpoints.
Invalidated when a pipeline run completes.
"""
import time
from typing import Any

_store: dict[str, tuple[Any, float]] = {}
DEFAULT_TTL = 300  # 5 minutes
DEMO_TTL = 3600  # 1 hour for demo/public topics

# Demo topics get much longer cache
from config import DEMO_TOPICS


def cache_ttl_for_topic(topic: str) -> int:
    """Return cache TTL based on whether a topic is a demo topic."""
    return DEMO_TTL if topic in DEMO_TOPICS else DEFAULT_TTL


def get_cached(key: str, ttl: int = DEFAULT_TTL) -> Any | None:
    entry = _store.get(key)
    if not entry:
        return None
    data, ts = entry
    if time.time() - ts > ttl:
        del _store[key]
        return None
    return data


def set_cache(key: str, data: Any) -> None:
    _store[key] = (data, time.time())


def invalidate(prefix: str = "") -> None:
    """Invalidate all entries with matching prefix, or all if empty."""
    if not prefix:
        _store.clear()
        return
    keys_to_delete = [k for k in _store if k.startswith(prefix)]
    for k in keys_to_delete:
        del _store[k]
