"""
PR Sentinel Backend — Structured Logging Module

Responsibility:
- Configure structured JSON logging for production
- Provide correlation ID support for request tracing
- Redact sensitive data (secrets, API keys, tokens, source code)
- Export logger factory for consistent logging across modules

Exported Functions:
- setup_logging() -> None: Configure logging system
- get_logger(name: str) -> logging.Logger: Get logger instance
- redact_sensitive_data(text: str) -> str: Redact secrets from text
- add_correlation_id_to_logs(correlation_id: str): Context manager for correlation IDs
"""

import logging
import re
import sys
import uuid
from contextvars import ContextVar
from typing import Any, Dict, Optional

import structlog
from pythonjsonlogger import jsonlogger

from app.core.config import get_settings

# Context variable for correlation ID (thread-safe)
correlation_id_ctx: ContextVar[Optional[str]] = ContextVar("correlation_id", default=None)


# ============================================================================
# Log Redaction Utilities
# ============================================================================

# Patterns to redact from logs (case-insensitive)
REDACT_PATTERNS = [
    # API keys and tokens
    (re.compile(r"(api[_-]?key['\"]?\s*[:=]\s*['\"]?)([a-zA-Z0-9_\-]{20,})", re.IGNORECASE), r"\1[REDACTED]"),
    (re.compile(r"(token['\"]?\s*[:=]\s*['\"]?)([a-zA-Z0-9_\-\.]{20,})", re.IGNORECASE), r"\1[REDACTED]"),
    (re.compile(r"(bearer\s+)([a-zA-Z0-9_\-\.]{20,})", re.IGNORECASE), r"\1[REDACTED]"),
    # GitHub tokens (ghp_, gho_, ghs_, etc.)
    (re.compile(r"gh[pousr]_[a-zA-Z0-9]{36,}"), "[REDACTED_GITHUB_TOKEN]"),
    # JWT tokens (three base64 segments separated by dots)
    (re.compile(r"eyJ[a-zA-Z0-9_\-]+\.eyJ[a-zA-Z0-9_\-]+\.[a-zA-Z0-9_\-]+"), "[REDACTED_JWT]"),
    # Generic secrets
    (re.compile(r"(secret['\"]?\s*[:=]\s*['\"]?)([^\s'\"]{10,})", re.IGNORECASE), r"\1[REDACTED]"),
    (re.compile(r"(password['\"]?\s*[:=]\s*['\"]?)([^\s'\"]{6,})", re.IGNORECASE), r"\1[REDACTED]"),
    # Connection strings with embedded credentials
    (re.compile(r"(mongodb(?:\+srv)?://[^:]+:)([^@]+)(@)", re.IGNORECASE), r"\1[REDACTED]\3"),
    # Diffs and source code markers (to avoid logging PR content)
    (re.compile(r"(diff --git|@@.*@@|\+\+\+|---)\s.*", re.MULTILINE), "[REDACTED_DIFF_CONTENT]"),
]


def redact_sensitive_data(text: str) -> str:
    """
    Redact sensitive information from log messages.

    Redacts:
    - API keys
    - Tokens (GitHub, JWT, Bearer)
    - Secrets and passwords
    - MongoDB connection strings with credentials
    - Git diffs and source code snippets

    Args:
        text: Original log message or data

    Returns:
        Redacted text with sensitive data replaced
    """
    if not isinstance(text, str):
        return text

    redacted = text
    for pattern, replacement in REDACT_PATTERNS:
        redacted = pattern.sub(replacement, redacted)
    return redacted


# ============================================================================
# Correlation ID Management
# ============================================================================


def get_correlation_id() -> str:
    """
    Get or generate correlation ID for current request context.

    Returns:
        Correlation ID (UUID4 hex string)
    """
    correlation_id = correlation_id_ctx.get()
    if correlation_id is None:
        correlation_id = uuid.uuid4().hex
        correlation_id_ctx.set(correlation_id)
    return correlation_id


def set_correlation_id(correlation_id: str):
    """
    Set correlation ID for current request context.

    Args:
        correlation_id: Correlation ID to set
    """
    correlation_id_ctx.set(correlation_id)


class CorrelationIdProcessor:
    """Structlog processor to add correlation ID to log records."""

    def __call__(self, logger, method_name, event_dict):
        event_dict["correlation_id"] = get_correlation_id()
        return event_dict


class RedactionProcessor:
    """Structlog processor to redact sensitive data from logs."""

    def __call__(self, logger, method_name, event_dict):
        settings = get_settings()
        if settings.LOG_REDACT_SECRETS:
            # Redact event message
            if "event" in event_dict:
                event_dict["event"] = redact_sensitive_data(event_dict["event"])
            # Redact extra fields
            for key, value in event_dict.items():
                if isinstance(value, str):
                    event_dict[key] = redact_sensitive_data(value)
        return event_dict


# ============================================================================
# Logging Setup
# ============================================================================


def setup_logging():
    """
    Configure logging system for the application.

    Uses:
    - Structlog for structured logging with processors
    - Python-json-logger for JSON output (production)
    - Console output with colors (development)
    - Log redaction for sensitive data
    - Correlation ID injection
    """
    settings = get_settings()

    # Determine log level
    log_level = getattr(logging, settings.LOG_LEVEL, logging.INFO)

    # Configure structlog processors
    processors = [
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        CorrelationIdProcessor(),
        RedactionProcessor(),
    ]

    if settings.LOG_FORMAT == "json":
        # JSON output for production
        processors.append(structlog.processors.JSONRenderer())
    else:
        # Console output for development
        processors.append(
            structlog.dev.ConsoleRenderer(
                colors=True,
                exception_formatter=structlog.dev.RichTraceback(),
            )
        )

    # Configure structlog
    structlog.configure(
        processors=processors,
        wrapper_class=structlog.stdlib.BoundLogger,
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )

    # Configure standard library logging
    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(log_level)

    if settings.LOG_FORMAT == "json":
        # JSON formatter
        formatter = jsonlogger.JsonFormatter(
            "%(timestamp)s %(level)s %(name)s %(message)s %(correlation_id)s"
        )
        handler.setFormatter(formatter)
    else:
        # Console formatter (handled by structlog)
        pass

    # Configure root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)
    root_logger.handlers.clear()
    root_logger.addHandler(handler)

    # Suppress noisy third-party loggers
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("motor").setLevel(logging.WARNING)
    logging.getLogger("asyncio").setLevel(logging.WARNING)


def get_logger(name: str) -> structlog.BoundLogger:
    """
    Get a configured logger instance.

    Args:
        name: Logger name (typically __name__ of the module)

    Returns:
        Structlog bound logger with configured processors
    """
    return structlog.get_logger(name)


# ============================================================================
# Request Middleware Helper (for FastAPI)
# ============================================================================


class CorrelationIdMiddleware:
    """
    FastAPI middleware to generate and inject correlation IDs.

    Usage in FastAPI app:
        app.add_middleware(CorrelationIdMiddleware)
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            # Generate or extract correlation ID from headers
            headers = dict(scope.get("headers", []))
            correlation_id = headers.get(b"x-correlation-id", uuid.uuid4().hex.encode()).decode()
            set_correlation_id(correlation_id)

            # Add to request state for access in routes
            if "state" not in scope:
                scope["state"] = {}
            scope["state"]["correlation_id"] = correlation_id

        await self.app(scope, receive, send)


# ============================================================================
# Example Usage
# ============================================================================

if __name__ == "__main__":
    # Example: Test logging setup
    setup_logging()
    logger = get_logger(__name__)

    logger.info("Application started", extra={"version": "0.1.0"})
    logger.debug("Debug message with correlation_id")
    logger.warning("Warning message", extra={"user_id": "12345"})

    # Test redaction
    sensitive = "API key: sk-1234567890abcdef Secret: mysecret123"
    logger.info(sensitive)  # Should be redacted

    try:
        raise ValueError("Test error")
    except Exception:
        logger.exception("Exception occurred")
