"""
PR Sentinel Backend — Health Check Routes

Responsibility:
- Provide health check endpoints for liveness and readiness
- Check database connectivity
- Check LLM adapter status
- Return detailed health information

Exported:
- router: FastAPI APIRouter for /health endpoints
"""

from datetime import datetime, timezone
from typing import Dict, Any

from fastapi import APIRouter, Depends, status
from fastapi.responses import JSONResponse

from app.core.config import get_settings
from app.core.logging import get_logger
from app.services.job_store import get_job_store
from app.services.llm_adapter import get_llm_adapter

logger = get_logger(__name__)
router = APIRouter()
settings = get_settings()


@router.get(
    "/health/live",
    status_code=status.HTTP_200_OK,
    summary="Liveness Check",
    description="Returns 200 if application is running",
    tags=["health"],
)
async def liveness_check() -> dict:
    """
    Liveness probe.

    Used by Kubernetes/Docker to determine if container is alive.

    Returns:
        Status with timestamp
    """
    return {
        "status": "alive",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get(
    "/health/ready",
    summary="Readiness Check",
    description="Returns 200 if application is ready to serve traffic",
    tags=["health"],
)
async def readiness_check(
    job_store=Depends(get_job_store),
) -> JSONResponse:
    """
    Readiness probe.

    Checks:
    - Database connectivity
    - Application dependencies

    Returns:
        200 if ready, 503 if not ready
    """
    checks: Dict[str, Any] = {
        "status": "ready",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "checks": {},
    }

    all_passed = True

    # Check database
    try:
        # Simple ping to check connectivity
        await job_store.db.command("ping")
        checks["checks"]["database"] = {
            "status": "healthy",
            "message": "Connected to MongoDB",
        }
    except Exception as e:
        logger.error("Database health check failed", extra={"error": str(e)})
        checks["checks"]["database"] = {
            "status": "unhealthy",
            "message": f"Database connection failed: {str(e)}",
        }
        all_passed = False

    if all_passed:
        return JSONResponse(content=checks, status_code=status.HTTP_200_OK)
    else:
        checks["status"] = "not_ready"
        return JSONResponse(content=checks, status_code=status.HTTP_503_SERVICE_UNAVAILABLE)


@router.get(
    "/health",
    summary="Detailed Health Check",
    description="Returns detailed health information about all components",
    tags=["health"],
)
async def health_check(
    job_store=Depends(get_job_store),
) -> dict:
    """
    Detailed health check.

    Returns comprehensive health information:
    - Application status
    - Database connectivity and stats
    - LLM adapter status
    - Configuration

    Returns:
        Detailed health information
    """
    health_info = {
        "status": "healthy",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "environment": settings.ENVIRONMENT,
        "version": settings.API_VERSION,
        "components": {},
    }

    # Database health
    try:
        await job_store.db.command("ping")
        
        # Get database stats
        db_stats = await job_store.db.command("dbStats")
        
        health_info["components"]["database"] = {
            "status": "healthy",
            "type": "MongoDB",
            "database": settings.MONGO_DB_NAME,
            "collections": db_stats.get("collections", 0),
            "dataSize": db_stats.get("dataSize", 0),
            "message": "Connected",
        }
    except Exception as e:
        logger.error("Database health check failed", extra={"error": str(e)})
        health_info["status"] = "degraded"
        health_info["components"]["database"] = {
            "status": "unhealthy",
            "message": str(e),
        }

    # LLM adapter health
    try:
        # Check if hosted LLM key is configured
        if settings.HOSTED_LLM_KEY and settings.HOSTED_LLM_KEY != "your-hosted-llm-key-here":
            llm_status = "configured"
        else:
            llm_status = "not_configured"
        
        health_info["components"]["llm"] = {
            "status": "healthy" if llm_status == "configured" else "warning",
            "hosted_llm_configured": llm_status == "configured",
            "message": "Hosted LLM configured" if llm_status == "configured" else "No hosted LLM key set",
        }
    except Exception as e:
        logger.error("LLM health check failed", extra={"error": str(e)})
        health_info["components"]["llm"] = {
            "status": "unknown",
            "message": str(e),
        }

    # Rate limiting health
    health_info["components"]["rate_limiting"] = {
        "status": "healthy" if settings.RATE_LIMIT_ENABLED else "disabled",
        "enabled": settings.RATE_LIMIT_ENABLED,
        "storage": settings.RATE_LIMIT_STORAGE,
    }

    # Authentication health
    health_info["components"]["authentication"] = {
        "status": "healthy",
        "jwt_algorithm": settings.JWT_ALGORITHM,
        "jwt_expiration_minutes": settings.JWT_EXPIRATION_MINUTES,
        "github_oauth_configured": bool(settings.GITHUB_CLIENT_ID and settings.GITHUB_CLIENT_SECRET),
    }

    return health_info


@router.get(
    "/health/db",
    summary="Database Health Check",
    description="Returns database-specific health information",
    tags=["health"],
)
async def database_health(
    job_store=Depends(get_job_store),
) -> JSONResponse:
    """
    Database-specific health check.

    Returns:
        Database connection status, stats, and indexes
    """
    try:
        # Ping database
        await job_store.db.command("ping")
        
        # Get server status
        server_status = await job_store.db.command("serverStatus")
        
        # Get database stats
        db_stats = await job_store.db.command("dbStats")
        
        # Get collection info
        collections = await job_store.db.list_collection_names()
        
        health_data = {
            "status": "healthy",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "database": settings.MONGO_DB_NAME,
            "server": {
                "version": server_status.get("version"),
                "uptime_seconds": server_status.get("uptime"),
                "connections": server_status.get("connections", {}).get("current", 0),
            },
            "stats": {
                "collections": db_stats.get("collections", 0),
                "data_size_bytes": db_stats.get("dataSize", 0),
                "storage_size_bytes": db_stats.get("storageSize", 0),
                "indexes": db_stats.get("indexes", 0),
            },
            "collections": collections,
        }
        
        return JSONResponse(content=health_data, status_code=status.HTTP_200_OK)
        
    except Exception as e:
        logger.error("Database health check failed", extra={"error": str(e)})
        return JSONResponse(
            content={
                "status": "unhealthy",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "error": str(e),
            },
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
