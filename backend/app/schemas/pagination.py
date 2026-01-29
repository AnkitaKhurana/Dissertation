"""
PR Sentinel Backend — Pagination Schemas

Responsibility:
- Define reusable pagination models for API responses
- Provide metadata for paginated results (total, has_next, etc.)

Exported Classes:
- PaginationMetadata: Metadata for paginated responses
- PaginatedResponse: Generic paginated response wrapper
"""

from typing import Generic, List, TypeVar
from pydantic import BaseModel, Field

T = TypeVar("T")


class PaginationMetadata(BaseModel):
    """
    Pagination metadata for list endpoints.

    Attributes:
        total: Total number of records matching the query
        page: Current page number (1-indexed)
        limit: Maximum number of records per page
        has_next: Whether there are more pages available
        has_previous: Whether there are previous pages available
    """

    total: int = Field(..., description="Total number of records", ge=0)
    page: int = Field(..., description="Current page number (1-indexed)", ge=1)
    limit: int = Field(..., description="Records per page", ge=1, le=100)
    has_next: bool = Field(..., description="Whether more pages are available")
    has_previous: bool = Field(..., description="Whether previous pages are available")

    class Config:
        json_schema_extra = {
            "example": {
                "total": 42,
                "page": 2,
                "limit": 20,
                "has_next": True,
                "has_previous": True,
            }
        }


class PaginatedResponse(BaseModel, Generic[T]):
    """
    Generic paginated response wrapper.

    Attributes:
        data: List of records for the current page
        pagination: Pagination metadata
    """

    data: List[T] = Field(..., description="List of records for the current page")
    pagination: PaginationMetadata = Field(..., description="Pagination metadata")

    class Config:
        json_schema_extra = {
            "example": {
                "data": [
                    {"job_id": "507f1f77bcf86cd799439011", "status": "completed"},
                    {"job_id": "507f1f77bcf86cd799439012", "status": "running"},
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
