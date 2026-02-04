"""
PR Sentinel Backend — FastAPI Application Factory

Responsibility:
- Create and configure FastAPI application
- Register API routers
- Configure middleware (CORS, CSRF, rate limiting)
- Setup startup/shutdown event handlers
- Configure dependency injection
- Expose health endpoints

Exported Functions:
- create_app() -> FastAPI: Application factory
"""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.api.routes import analyze, auth, health, jobs, user
from app.core.config import get_settings
from app.core.logging import (
    CorrelationIdMiddleware,
    get_logger,
    set_correlation_id,
    setup_logging,
)
from app.core.middleware import jwt_middleware
from app.core.rate_limiting import get_rate_limit_key, limiter
from app.services.job_store import get_job_store

# Initialize logger
logger = get_logger(__name__)


def get_request_identifier(request: Request) -> str:
    """
    Get identifier for rate limiting (user_id if authenticated, else IP).

    Args:
        request: FastAPI request object

    Returns:
        User ID from JWT or IP address
    """
    # TODO: Extract user_id from JWT if present
    # For now, use IP address
    return get_remote_address(request)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator:
    """
    Application lifespan context manager for startup and shutdown tasks.

    Startup:
    - Initialize database connection
    - Create indexes (including TTL)
    - Log application startup

    Shutdown:
    - Close database connections
    - Cleanup resources

    Args:
        app: FastAPI application instance

    Yields:
        None (context manager)
    """
    settings = get_settings()

    # Startup
    logger.info(
        "Starting PR Sentinel Backend",
        extra={
            "environment": settings.ENVIRONMENT,
            "version": settings.API_VERSION,
            "debug": settings.DEBUG,
        },
    )

    # Initialize database connection
    try:
        job_store = await get_job_store()
        await job_store.initialize()
        logger.info("Database connection established")
    except Exception as e:
        logger.error(f"Failed to connect to database: {e}")
        raise

    yield

    # Shutdown
    logger.info("Shutting down PR Sentinel Backend")
    try:
        job_store = await get_job_store()
        await job_store.close()
        logger.info("Database connection closed")
    except Exception as e:
        logger.error(f"Error during shutdown: {e}")


def create_app() -> FastAPI:
    """
    Application factory for FastAPI.

    Returns:
        Configured FastAPI application instance
    """
    settings = get_settings()

    # Setup logging
    setup_logging()

    # Create FastAPI app with lifespan context manager
    app = FastAPI(
        title="PR Sentinel API",
        description="Multi-Agent LLM Framework for Automated GitHub Pull Request Analysis",
        version=settings.API_VERSION,
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url=f"/api/{settings.API_VERSION}/openapi.json",
        lifespan=lifespan,
    )

    # ============================================================================
    # Middleware
    # ============================================================================

    # CORS middleware - need to handle chrome extensions specially
    @app.middleware("http")
    async def cors_middleware(request: Request, call_next):
        origin = request.headers.get("origin", "")
        
        # Check if origin is allowed (including wildcard support)
        is_allowed = False
        for allowed_origin in settings.ALLOWED_ORIGINS:
            if allowed_origin == "*":
                is_allowed = True
                break
            elif allowed_origin.endswith("*"):
                # Handle wildcards like "chrome-extension://*"
                pattern = allowed_origin.replace("*", "")
                if origin.startswith(pattern):
                    is_allowed = True
                    break
            elif origin == allowed_origin:
                is_allowed = True
                break
        
        # Handle preflight requests
        if request.method == "OPTIONS":
            if is_allowed:
                return JSONResponse(
                    status_code=200,
                    content={},
                    headers={
                        "Access-Control-Allow-Origin": origin or "*",
                        "Access-Control-Allow-Credentials": "true",
                        "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
                        "Access-Control-Allow-Headers": request.headers.get("access-control-request-headers", "*"),
                        "Access-Control-Max-Age": "3600",
                    },
                )
            return JSONResponse(status_code=403, content={"detail": "CORS policy violation"})
        
        # Process the request
        response = await call_next(request)
        
        # Add CORS headers to response
        if is_allowed:
            response.headers["Access-Control-Allow-Origin"] = origin or "*"
            response.headers["Access-Control-Allow-Credentials"] = "true"
            response.headers["Access-Control-Expose-Headers"] = "X-Correlation-ID, Content-Type"
        
        return response

    # Default CORS middleware (kept as fallback for any routes not covered above)
    # app.add_middleware(
    #     CORSMiddleware,
    #     allow_origins=settings.ALLOWED_ORIGINS,
    #     allow_credentials=True,
    #     allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    #     allow_headers=["*", "Authorization"],
    #     expose_headers=["X-Correlation-ID"],
    # )

    # JWT authentication middleware
    app.middleware("http")(jwt_middleware)

    # Rate limiting
    if settings.RATE_LIMIT_ENABLED:
        app.state.limiter = limiter
        app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    # Security headers middleware
    @app.middleware("http")
    async def add_security_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers[
            "Content-Security-Policy"
        ] = "default-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'self'"
        response.headers[
            "Permissions-Policy"
        ] = "geolocation=(), microphone=(), camera=()"
        return response

    # ============================================================================
    # Routers
    # ============================================================================

    # Health endpoints (no prefix, public access)
    app.include_router(health.router, tags=["health"])

    # Include API routers under /api/v1
    api_prefix = f"/api/{settings.API_VERSION}"
    app.include_router(analyze.router, prefix=api_prefix, tags=["analyze"])
    app.include_router(jobs.router, prefix=api_prefix, tags=["jobs"])
    app.include_router(auth.router, prefix=api_prefix, tags=["auth"])
    app.include_router(user.router, prefix=api_prefix, tags=["user"])

    # ============================================================================
    # Health Endpoints
    # ============================================================================

    @app.get("/health/live", status_code=status.HTTP_200_OK, tags=["health"])
    async def liveness_check():
        """
        Liveness probe — returns 200 if application is running.

        Used by Kubernetes/Docker health checks.
        """
        return {"status": "alive"}

    @app.get("/health/ready", status_code=status.HTTP_200_OK, tags=["health"])
    async def readiness_check():
        """
        Readiness probe — returns 200 if application can serve traffic.

        Checks:
        - Database connection is healthy
        """
        try:
            job_store = await get_job_store()
            await job_store.health_check()
            return {"status": "ready", "database": "connected"}
        except Exception as e:
            logger.error(f"Readiness check failed: {e}")
            return JSONResponse(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                content={"status": "not_ready", "database": "disconnected", "error": str(e)},
            )

    # ============================================================================
    # Exception Handlers
    # ============================================================================

    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        """
        Global exception handler for unhandled exceptions.

        Logs error with correlation ID and returns standardized error response.
        """
        correlation_id = request.state.correlation_id if hasattr(request.state, "correlation_id") else "unknown"
        logger.error(
            f"Unhandled exception: {exc}",
            extra={"correlation_id": correlation_id, "path": request.url.path},
            exc_info=True,
        )
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "error_code": "INTERNAL_SERVER_ERROR",
                "message": "An unexpected error occurred. Please try again later.",
                "correlation_id": correlation_id,
            },
        )

    return app


# Create app instance
app = create_app()


if __name__ == "__main__":
    import uvicorn

    settings = get_settings()
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        log_config=None,  # Use our custom logging configuration
    )
