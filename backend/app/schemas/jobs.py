"""
PR Sentinel Backend — Pydantic Schemas for Jobs

Responsibility:
- Define job-related data models for API requests/responses
- Validate job creation parameters, status updates

Exported Classes:
- JobStatus: Literal type for job states
- JobCreate: Request schema for POST /api/v1/analyze-pr
- JobResponse: Response schema with job_id and status_url
- JobDetailResponse: Detailed job status with results and progress
"""

from datetime import datetime
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator

from app.schemas.findings import Finding
from app.utils.validators import is_valid_pr_url

class JobStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class JobCreate(BaseModel):
    """
    Request schema for creating a new PR analysis job.

    Attributes:
        pr_url: GitHub PR URL
        agents_requested: List of agents to run (default: all)
        sync: Run analysis synchronously and return results immediately
        idempotency_key: Optional client-provided key for idempotent requests
    """

    pr_url: str = Field(
        ...,
        description="GitHub PR URL (e.g., https://github.com/owner/repo/pull/123)",
        examples=["https://github.com/facebook/react/pull/12345"],
    )

    agents_requested: List[str] = Field(
        default=["code_review", "security", "tests", "maintainability"],
        description="Agents to run for this analysis",
        examples=[["security", "code_review"], ["code_review"]],
    )

    sync: bool = Field(
        default=False,
        description="Run analysis synchronously (recommended for PRs < 50 files)",
    )

    idempotency_key: Optional[str] = Field(
        default=None,
        max_length=256,
        description="Optional client-provided key to prevent duplicate jobs",
        examples=["pr-12345-20260120-001"],
    )

    @field_validator("pr_url")
    @classmethod
    def validate_pr_url(cls, v: str) -> str:
        """Validate PR URL format."""
        if not is_valid_pr_url(v):
            raise ValueError(
                "Invalid GitHub PR URL. Must match: https://github.com/owner/repo/pull/123"
            )
        return v

    @field_validator("agents_requested")
    @classmethod
    def validate_agents(cls, v: List[str]) -> List[str]:
        """Validate requested agents."""
        valid_agents = {"code_review", "security", "tests", "maintainability"}
        invalid = set(v) - valid_agents
        if invalid:
            raise ValueError(f"Invalid agents: {invalid}. Valid: {valid_agents}")
        if not v:
            raise ValueError("At least one agent must be requested")
        return list(set(v))  # Remove duplicates

    class Config:
        json_schema_extra = {
            "example": {
                "pr_url": "https://github.com/facebook/react/pull/12345",
                "agents_requested": ["security", "code_review"],
                "sync": False,
                "idempotency_key": "pr-12345-20260120-001",
            }
        }


class JobResponse(BaseModel):
    """
    Response schema for job creation.

    Attributes:
        job_id: MongoDB ObjectId as string
        status: Current job status
        status_url: URL to poll for job updates
        created_at: Job creation timestamp
        results_so_far: Partial results (only for sync mode)
        progress: Job progress (0.0 to 1.0, only for sync mode)
    """

    job_id: str = Field(..., description="Job ID (MongoDB ObjectId)")
    status: JobStatus = Field(..., description="Job status")
    status_url: str = Field(..., description="URL to poll for job updates")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    results_so_far: List[Finding] = Field(default=[], description="Partial results (sync mode only)")
    progress: float = Field(default=0.0, ge=0.0, le=1.0, description="Progress (sync mode only)")

    class Config:
        json_schema_extra = {
            "example": {
                "job_id": "507f1f77bcf86cd799439011",
                "status": "pending",
                "status_url": "/api/v1/jobs/507f1f77bcf86cd799439011",
                "created_at": "2026-01-20T12:00:00Z",
            }
        }


class JobDetailResponse(BaseModel):
    """
    Detailed job status response with partial results.

    Attributes:
        job_id: MongoDB ObjectId as string
        status: Current job status
        progress: Analysis progress (0.0 to 1.0)
        last_updated: Last status update timestamp
        results_so_far: Findings generated so far
        error: Error message if job failed
    """

    job_id: str = Field(..., description="Job ID")
    status: JobStatus = Field(..., description="Job status")
    progress: float = Field(default=0.0, ge=0.0, le=1.0, description="Progress (0.0 to 1.0)")
    last_updated: datetime = Field(default_factory=datetime.utcnow)
    results_so_far: List[Finding] = Field(default=[], description="Findings generated so far")
    error: Optional[str] = Field(default=None, description="Error message if failed")

    class Config:
        json_schema_extra = {
            "example": {
                "job_id": "507f1f77bcf86cd799439011",
                "status": "running",
                "progress": 0.75,
                "last_updated": "2026-01-20T12:05:30Z",
                "results_so_far": [
                    {
                        "file_path": "src/auth.py",
                        "line_number": 42,
                        "severity": "high",
                        "agent": "security",
                        "message": "Potential SQL injection",
                        "suggested_code": "Use parameterized queries",
                        "confidence": 0.92,
                    }
                ],
                "error": None,
            }
        }
