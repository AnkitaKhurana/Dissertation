"""
PR Sentinel Backend — Rate Limiting Module

Responsibility:
- Provide tier-based rate limiting
- Configure SlowAPI limiter with custom key function
- Define rate limits per user tier (free, pro, admin)

Exported:
- get_rate_limit_key(): Key function that uses user_id from request state
- limiter: Configured SlowAPI Limiter instance
- rate_limit_by_tier(): Decorator for tier-based rate limiting
"""

from functools import wraps
from typing import Callable

from fastapi import HTTPException, Request, status
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)
settings = get_settings()


# ============================================================================
# Rate Limit Tiers
# ============================================================================

RATE_LIMITS_PER_TIER = {
    "free": {
        "analyze": "10/hour",  # 10 PR analyses per hour
        "jobs": "100/hour",  # 100 job status checks per hour
        "auth": "20/hour",  # 20 auth requests per hour
    },
    "pro": {
        "analyze": "100/hour",
        "jobs": "1000/hour",
        "auth": "50/hour",
    },
    "admin": {
        "analyze": "1000/hour",
        "jobs": "10000/hour",
        "auth": "100/hour",
    },
}


def get_rate_limit_key(request: Request) -> str:
    """
    Get rate limit key from request.

    Uses user_id from request state if authenticated, otherwise uses IP address.

    Args:
        request: FastAPI Request object

    Returns:
        Rate limit key (user_id or IP address)
    """
    # Try to get user_id from request state (set by JWT middleware)
    user_id = getattr(request.state, "user_id", None)
    if user_id:
        return f"user:{user_id}"

    # Fall back to IP address for unauthenticated requests
    return f"ip:{get_remote_address(request)}"


# ============================================================================
# Limiter Instance
# ============================================================================

limiter = Limiter(
    key_func=get_rate_limit_key,
    storage_uri=settings.RATE_LIMIT_STORAGE_URI,
    enabled=settings.RATE_LIMIT_ENABLED,
)


# ============================================================================
# Tier-Based Rate Limiting Decorator
# ============================================================================


def rate_limit_by_tier(endpoint_type: str):
    """
    Decorator for tier-based rate limiting.

    Args:
        endpoint_type: Type of endpoint ("analyze", "jobs", "auth")

    Returns:
        Decorator function
    """

    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(request: Request, *args, **kwargs):
            # Get user tier from request state (set by auth middleware or default to free)
            user_tier = getattr(request.state, "user_tier", "free")

            # Get rate limit for this tier
            rate_limit = RATE_LIMITS_PER_TIER.get(user_tier, RATE_LIMITS_PER_TIER["free"]).get(
                endpoint_type, "100/hour"
            )

            # Apply rate limit using limiter.limit()
            try:
                # Get the limiter from app state
                app_limiter = getattr(request.app.state, "limiter", limiter)
                await app_limiter.limit(rate_limit)(request)
            except Exception as e:
                logger.warning(
                    "Rate limit exceeded",
                    extra={"user_tier": user_tier, "endpoint": endpoint_type, "limit": rate_limit},
                )
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"Rate limit exceeded. Tier: {user_tier}, Limit: {rate_limit}",
                ) from e

            return await func(request, *args, **kwargs)

        return wrapper

    return decorator


# ============================================================================
# Helper Functions
# ============================================================================


async def get_user_tier(request: Request) -> str:
    """
    Get user tier from request state or database.

    Args:
        request: FastAPI Request object

    Returns:
        User tier ("free", "pro", "admin")
    """
    # First check if tier is already in request state
    if hasattr(request.state, "user_tier"):
        return request.state.user_tier

    # If user is authenticated, fetch tier from database
    if hasattr(request.state, "user_id"):
        from app.services.job_store import get_job_store

        try:
            job_store = await get_job_store()
            users_collection = job_store.db["users"]
            user = await users_collection.find_one({"gh_id": int(request.state.user_id)})
            if user:
                tier = user.get("tier_level", "free")
                request.state.user_tier = tier  # Cache in request state
                return tier
        except Exception as e:
            logger.error("Failed to fetch user tier", extra={"error": str(e)})

    # Default to free tier
    return "free"
