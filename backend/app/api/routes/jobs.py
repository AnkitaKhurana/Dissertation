"""
PR Sentinel Backend — Jobs Route

Responsibility:
- Handle GET /api/v1/jobs to list user's jobs with pagination
- Handle GET /api/v1/jobs/{job_id} to poll job status and results
- Handle PATCH /api/v1/jobs/{job_id}/cancel to request job cancellation
- Return partial results and last_updated timestamp

Exported:
- router: FastAPI APIRouter for /jobs endpoints
"""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.config import get_settings
from app.core.logging import get_logger
from app.core.middleware import get_current_user_id
from app.schemas.jobs import JobDetailResponse, JobStatus
from app.schemas.job_list import JobListResponse, JobSummary
from app.schemas.pagination import PaginationMetadata
from app.services.job_store import JobStore, get_job_store

logger = get_logger(__name__)
router = APIRouter()
settings = get_settings()


@router.get(
    "/jobs",
    response_model=JobListResponse,
    summary="List User Jobs",
    description="List all jobs for the authenticated user with pagination support.",
)
async def list_user_jobs(
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    limit: int = Query(20, ge=1, le=100, description="Results per page (max 100)"),
    status: Optional[JobStatus] = Query(None, description="Filter by job status"),
    user_id: str = Depends(get_current_user_id),
    job_store: JobStore = Depends(get_job_store),
):
    """
    List jobs for the authenticated user with pagination.

    Args:
        page: Page number (1-indexed)
        limit: Number of results per page (max 100)
        status: Optional status filter
        user_id: Authenticated user ID (from JWT)
        job_store: Job persistence layer

    Returns:
        JobListResponse with paginated job summaries and metadata
    """
    skip = (page - 1) * limit

    logger.debug(
        "Listing user jobs",
        extra={
            "user_id": user_id,
            "page": page,
            "limit": limit,
            "status": status,
        },
    )

    jobs, total = await job_store.list_user_jobs(
        user_id=user_id,
        skip=skip,
        limit=limit,
        status_filter=status,
    )

    # Convert MongoDB documents to JobSummary
    job_summaries = [
        JobSummary(
            job_id=str(job["_id"]),
            pr_url=job["pr_url"],
            status=job["status"],
            created_at=job["created_at"],
            last_updated=job.get("last_updated", job["created_at"]),
            progress=job.get("progress", 0.0),
            findings_count=len(job.get("results", [])),
            error=job.get("error"),
        )
        for job in jobs
    ]

    pagination = PaginationMetadata(
        total=total,
        page=page,
        limit=limit,
        has_next=(skip + limit) < total,
        has_previous=page > 1,
    )

    return JobListResponse(data=job_summaries, pagination=pagination)


@router.get(
    "/jobs/{job_id}",
    response_model=JobDetailResponse,
    summary="Get Job Status",
    description="Poll job status and retrieve partial results. Use last_updated to skip redundant re-renders.",
)
async def get_job_status(
    job_id: str,
    job_store: JobStore = Depends(get_job_store),
):
    """
    Get job status and partial results.

    Args:
        job_id: MongoDB ObjectId as string
        job_store: Job persistence layer

    Returns:
        JobDetailResponse with status, progress, results_so_far, last_updated

    Raises:
        HTTPException 404: Job not found
    """
    logger.debug("Fetching job status", extra={"job_id": job_id})

    job = await job_store.get_job(job_id)
    if not job:
        logger.warning("Job not found", extra={"job_id": job_id})
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error_code": "JOB_NOT_FOUND",
                "message": f"Job {job_id} not found",
            },
        )

    return JobDetailResponse(
        job_id=job_id,
        status=job["status"],
        progress=job.get("progress", 0.0),
        last_updated=job.get("last_updated"),
        results_so_far=job.get("results", []),
        error=job.get("error"),
    )


@router.patch(
    "/jobs/{job_id}/cancel",
    response_model=JobDetailResponse,
    summary="Cancel Job",
    description="Request best-effort cancellation of a running job.",
)
async def cancel_job(
    job_id: str,
    job_store: JobStore = Depends(get_job_store),
):
    """
    Request job cancellation.

    Note: Cancellation is best-effort. Jobs may still complete if cancellation request
    arrives after agents have started processing.

    Args:
        job_id: MongoDB ObjectId as string
        job_store: Job persistence layer

    Returns:
        JobDetailResponse with updated status

    Raises:
        HTTPException 404: Job not found
        HTTPException 409: Job already completed or failed
    """
    logger.info("Cancellation requested", extra={"job_id": job_id})

    job = await job_store.get_job(job_id)
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error_code": "JOB_NOT_FOUND",
                "message": f"Job {job_id} not found",
            },
        )

    # Check if job can be cancelled
    if job["status"] in [JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED]:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error_code": "JOB_NOT_CANCELLABLE",
                "message": f"Job already in terminal state: {job['status']}",
            },
        )

    # Update status to cancelled
    await job_store.update_job_status(job_id, JobStatus.CANCELLED)

    logger.info("Job cancelled", extra={"job_id": job_id})

    # Return updated job
    job = await job_store.get_job(job_id)
    return JobDetailResponse(
        job_id=job_id,
        status=job["status"],
        progress=job.get("progress", 0.0),
        last_updated=job.get("last_updated"),
        results_so_far=job.get("results", []),
        error=job.get("error"),
    )
