"""
Rate Limiting — atomic sliding-window implementation using Redis.

Replaces the old audit_log-based non-atomic check that had a race condition.
Uses Redis sorted sets for atomic check-and-increment in a single pipeline.
"""

import time
import redis.asyncio as aioredis
from fastapi import HTTPException
from app.config import settings

_redis = None


async def _get_redis():
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(settings.redis_url)
    return _redis


async def check_rate_limit(key: str, limit: int, window_seconds: int) -> bool:
    """
    Atomic sliding-window rate limit using Redis sorted sets.
    Returns True if within limit, False if exceeded.
    """
    r = await _get_redis()
    now = time.time()
    pipe = r.pipeline()
    pipe.zremrangebyscore(key, 0, now - window_seconds)  # remove expired entries
    pipe.zadd(key, {f"{now}:{id(pipe)}": now})            # add current request
    pipe.zcard(key)                                        # count in window
    pipe.expire(key, window_seconds)                       # TTL cleanup
    results = await pipe.execute()
    count = results[2]
    return count <= limit


async def enforce_rate_limit(key: str, limit: int, window_seconds: int):
    """Raise HTTP 429 if rate limit is exceeded."""
    if not await check_rate_limit(key, limit, window_seconds):
        raise HTTPException(
            status_code=429,
            detail="Too many requests. Please try again later.",
        )


# Legacy compatibility — used by the permission system's audit_log-based check
MAX_SENDS_PER_HOUR = 30


async def check_send_rate_limit(user_id: str) -> bool:
    """Check if the user has exceeded their hourly email sending quota.
    
    Now uses Redis atomic sliding window instead of the old audit_log query.
    """
    return await check_rate_limit(f"rl:send:{user_id}", MAX_SENDS_PER_HOUR, 3600)
