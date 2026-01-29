"""
PR Sentinel Backend — Job List Schemas

Responsibility:
- Define schemas for job list endpoints
- Provide summary view of jobs (without full results)

Exported Classes:
- JobSummary: Lightweight job summary for list endpoints
- JobListResponse: Paginated list of job summaries
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field

from app.schemas.jobs import JobStatus
from app.schemas.pagination import PaginatedResponse, PaginationMetadata


class JobSummary(BaseModel):
    """
    Lightweight job summary for list endpoints.

    Attributes:
        job_id: MongoDB ObjectId as string
        pr_url: GitHub PR URL
        status: Current job status
        created_at: Job creation timestamp
        last_updated: Last status update timestamp
        progress: Analysis progress (0.0 to 1.0)
        findings_count: Number of findings generated
        error: Error message if job failed
    """

    job_id: str = Field(..., description="Job ID (MongoDB ObjectId)")
    pr_url: str = Field(..., description="GitHub PR URL")
    status: JobStatus = Field(..., description="Job status")
    created_at: datetime = Field(..., description="Job creation timestamp")
    last_updated: datetime = Field(..., description="Last update timestamp")
    progress: float = Field(default=0.0, ge=0.0, le=1.0, description="Progress (0.0 to 1.0)")
    findings_count: int = Field(default=0, ge=0, description="Number of findings")
    error: Optional[str] = Field(default=None, description="Error message if failed")

    class Config:
        json_schema_extra = {
            "example": {
                "job_id": "507f1f77bcf86cd799439011",
                "pr_url": "https://github.com/facebook/react/pull/12345",
                "status": "completed",
                "created_at": "2026-01-20T12:00:00Z",
                "last_updated": "2026-01-20T12:05:30Z",
                "progress": 1.0,
                "findings_count": 12,
                "error": None,
            }
        }


class JobListResponse(PaginatedResponse[JobSummary]):
    """
    Paginated list of job summaries.

    Inherits from PaginatedResponse with JobSummary as the data type.
    """

    class Config:
        json_schema_extra = {
            "example": {
                "data": [
                    {
                        "job_id": "507f1f77bcf86cd799439011",
                        "pr_url": "https://github.com/facebook/react/pull/12345",
                        "status": "completed",
                        "created_at": "2026-01-20T12:00:00Z",
                        "last_updated": "2026-01-20T12:05:30Z",
                        "progress": 1.0,
                        "findings_count": 12,
                        "error": None,
                    },
                    {
                        "job_id": "507f1f77bcf86cd799439012",
                        "pr_url": "https://github.com/facebook/react/pull/12346",
                        "status": "running",
                        "created_at": "2026-01-20T12:10:00Z",
                        "last_updated": "2026-01-20T12:12:30Z",
                        "progress": 0.45,
                        "findings_count": 5,
                        "error": None,
                    },
                ],
                "pagination": {
                    "total": 42,
                    "page": 1,
                    "limit": 20,
                    "has_next": True,
                    "has_previous": False,
                },
            }
        }
