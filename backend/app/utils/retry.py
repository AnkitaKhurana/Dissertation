"""
PR Sentinel Backend — Retry Helpers

Responsibility:
- Provide retry decorators with exponential backoff
- Used by adapters for resilience

Exported:
- async_retry: decorator factory for async functions
"""

from typing import Callable, Type

from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from app.core.config import get_settings

settings = get_settings()


def async_retry(exc: Type[BaseException], max_attempts: int | None = None):
    """Create a tenacity retry decorator for async functions."""
    return retry(
        reraise=True,
        retry=retry_if_exception_type(exc),
        stop=stop_after_attempt(max_attempts or settings.BACKGROUND_TASK_MAX_RETRIES),
        wait=wait_exponential(multiplier=1, min=1, max=8),
    )
