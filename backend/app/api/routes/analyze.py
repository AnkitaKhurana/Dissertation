"""
PR Sentinel Backend — PR Analysis Route

Responsibility:
- Handle POST /api/v1/analyze-pr to create PR analysis jobs
- Validate PR URLs with regex
- Reject PRs with >500 files (HTTP 413)
- Support sync mode for small PRs
- Support optional idempotency keys
- Trigger background analysis via LangGraph orchestrator

Exported:
- router: FastAPI APIRouter for /analyze-pr endpoint
"""

import re
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import get_settings
from app.core.logging import get_logger
from app.core.middleware import get_current_user_id
from app.core.rate_limiting import get_user_tier, limiter
from app.schemas.findings import Finding
from app.schemas.jobs import JobCreate, JobResponse, JobStatus
from app.services.github_adapter import GitHubAdapter, get_github_adapter
from app.services.job_store import JobStore, get_job_store
from app.services.langgraph_orchestrator import LangGraphOrchestrator, get_orchestrator

logger = get_logger(__name__)
router = APIRouter()
settings = get_settings()

# PR URL validation regex
PR_URL_PATTERN = re.compile(r"^https://github\.com/[^/]+/[^/]+/pull/\d+$")


@router.post(
    "/analyze-pr",
    response_model=JobResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create PR Analysis Job",
    description="Submit a GitHub PR for multi-agent analysis. Returns job_id for polling.",
)
@limiter.limit("10/hour;100/hour;1000/hour")  # free;pro;admin
async def analyze_pr(
    request: Request,
    job_create: JobCreate,
    background_tasks: BackgroundTasks,
    user_id: str = Depends(get_current_user_id),
    job_store: JobStore = Depends(get_job_store),
    github_adapter: GitHubAdapter = Depends(get_github_adapter),
):
    """
    Create a new PR analysis job.

    Args:
        job_create: Job creation request with pr_url, agents_requested, sync, idempotency_key
        background_tasks: FastAPI background tasks
        job_store: Job persistence layer
        github_adapter: GitHub API adapter
        request: FastAPI Request object

    Returns:
        JobResponse with job_id, status, status_url

    Raises:
        HTTPException 400: Invalid PR URL
        HTTPException 413: PR has >500 files
        HTTPException 429: Rate limit exceeded (handled by slowapi)
    """
    # Get user tier and create orchestrator with it
    user_tier = getattr(request.state, "user_tier", "free")
    orchestrator = await get_orchestrator(user_tier=user_tier)
    
    logger.info(
        "Received analyze-pr request",
        extra={
            "pr_url": job_create.pr_url,
            "agents": job_create.agents_requested,
            "user_id": user_id,
            "user_tier": user_tier,
            "correlation_id": getattr(request.state, "correlation_id", "unknown"),
        },
    )

    # ============================================================================
    # Validation
    # ============================================================================

    # Validate PR URL format
    if not PR_URL_PATTERN.match(job_create.pr_url):
        logger.warning("Invalid PR URL format", extra={"pr_url": job_create.pr_url})
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error_code": "INVALID_PR_URL",
                "message": "PR URL must match pattern: https://github.com/owner/repo/pull/123",
                "correlation_id": getattr(request.state, "correlation_id", "unknown"),
            },
        )

    # Check PR file count
    try:
        pr_metadata = await github_adapter.fetch_pr_metadata(job_create.pr_url)
        file_count = pr_metadata.get("changed_files", 0)

        if file_count > settings.MAX_PR_FILES:
            logger.warning(
                "PR exceeds max file count",
                extra={"pr_url": job_create.pr_url, "file_count": file_count},
            )
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail={
                    "error_code": "PR_TOO_LARGE",
                    "message": f"PR has {file_count} files (max: {settings.MAX_PR_FILES})",
                    "correlation_id": getattr(request.state, "correlation_id", "unknown"),
                },
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to fetch PR metadata: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={
                "error_code": "GITHUB_API_ERROR",
                "message": "Failed to fetch PR metadata from GitHub",
                "correlation_id": getattr(request.state, "correlation_id", "unknown"),
            },
        )

    # ============================================================================
    # Check for Duplicate Jobs (Idempotency)
    # ============================================================================

    if job_create.idempotency_key:
        existing_job = await job_store.find_job_by_idempotency_key(
            job_create.idempotency_key
        )
        if existing_job:
            logger.info(
                "Returning existing job for idempotency key",
                extra={"job_id": existing_job["_id"], "idempotency_key": job_create.idempotency_key},
            )
            return JobResponse(
                job_id=str(existing_job["_id"]),
                status=existing_job["status"],
                status_url=f"/api/{settings.API_VERSION}/jobs/{existing_job['_id']}",
                created_at=existing_job["created_at"],
            )

    # ============================================================================
    # Create Job
    # ============================================================================

    # Get user tier from request state (set by JWT middleware)
    user_tier = getattr(request.state, "user_tier", "free")

    job_id = await job_store.create_job(
        user_id=user_id,
        pr_url=job_create.pr_url,
        agents_requested=job_create.agents_requested,
        user_tier=user_tier,
        idempotency_key=job_create.idempotency_key,
    )

    logger.info(
        "Job created",
        extra={
            "job_id": job_id,
            "pr_url": job_create.pr_url,
            "user_id": user_id,
            "user_tier": user_tier,
            "correlation_id": getattr(request.state, "correlation_id", "unknown"),
        },
    )

    # ============================================================================
    # Trigger Analysis
    # ============================================================================

    if job_create.sync:
        # Sync mode: run analysis immediately and return results
        logger.info(
            "Running job in sync mode",
            extra={
                "job_id": job_id,
                "user_id": user_id,
                "correlation_id": getattr(request.state, "correlation_id", "unknown"),
            },
        )
        try:
            await orchestrator.run_analysis(job_id=job_id, pr_url=job_create.pr_url)
            job = await job_store.get_job(job_id)
            return JobResponse(
                job_id=job_id,
                status=job["status"],
                status_url=f"/api/{settings.API_VERSION}/jobs/{job_id}",
                created_at=job["created_at"],
                results_so_far=job.get("results", []),
                progress=1.0 if job["status"] == JobStatus.COMPLETED else 0.0,
            )
        except Exception as e:
            logger.error(f"Sync analysis failed: {e}", exc_info=True)
            await job_store.update_job_status(job_id, JobStatus.FAILED, error=str(e))
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail={
                    "error_code": "ANALYSIS_FAILED",
                    "message": "Analysis failed",
                    "correlation_id": getattr(request.state, "correlation_id", "unknown"),
                },
            )
    else:
        # Async mode: trigger background task
        logger.info(
            "Triggering background analysis",
            extra={
                "job_id": job_id,
                "user_id": user_id,
                "correlation_id": getattr(request.state, "correlation_id", "unknown"),
            },
        )
        background_tasks.add_task(
            orchestrator.run_analysis,
            job_id=job_id,
            pr_url=job_create.pr_url,
        )

        return JobResponse(
            job_id=job_id,
            status=JobStatus.PENDING,
            status_url=f"/api/{settings.API_VERSION}/jobs/{job_id}",
            created_at=pr_metadata.get("created_at"),
        )
