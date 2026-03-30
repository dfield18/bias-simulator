"""
Simple in-memory response cache for expensive API endpoints.
Invalidated when a pipeline run completes.
"""
import time
from typing import Any

_store: dict[str, tuple[Any, float]] = {}
DEFAULT_TTL = 300  # 5 minutes


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
