"""
In-memory content-addressed cache for simulation results.

Cache key: (twin_hash, agent_id, seed, n)

Results are immutable Pydantic models — safe to cache without copying.
Cache is bounded to MAX_ENTRIES to prevent unbounded memory growth during
multi-scenario demo sessions.
"""
from __future__ import annotations

from collections import OrderedDict
from typing import Optional, Tuple

from backend.core.walk import Result

# Cache bounded to 256 entries — sufficient for demo (4 agents × 4 controls × 16 seeds)
_MAX_ENTRIES = 256

# OrderedDict used as LRU — oldest entry evicted when full
_cache: OrderedDict[Tuple[str, str, int, int], Result] = OrderedDict()


def _make_key(twin_hash: str, agent_id: str, seed: int, n: int) -> Tuple[str, str, int, int]:
    return (twin_hash, agent_id, seed, n)


def get(twin_hash: str, agent_id: str, seed: int, n: int) -> Optional[Result]:
    """Return cached Result if present, else None. Moves hit to end (LRU)."""
    key = _make_key(twin_hash, agent_id, seed, n)
    if key in _cache:
        _cache.move_to_end(key)
        return _cache[key]
    return None


def put(twin_hash: str, agent_id: str, seed: int, n: int, result: Result) -> None:
    """Store result. Evicts the oldest entry if the cache is full."""
    key = _make_key(twin_hash, agent_id, seed, n)
    _cache[key] = result
    _cache.move_to_end(key)
    while len(_cache) > _MAX_ENTRIES:
        _cache.popitem(last=False)


def clear() -> None:
    """Clear all cached results (used in tests)."""
    _cache.clear()


def size() -> int:
    """Return current number of cached entries."""
    return len(_cache)
