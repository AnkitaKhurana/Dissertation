"""
PR Sentinel Backend — Pydantic Schemas for User

Responsibility:
- Define user-related data models
- User preferences schema

Exported Classes:
- UserPreferences: User settings and preferences
"""

from typing import List, Literal

from pydantic import BaseModel, Field


class UserPreferences(BaseModel):
    """
    User preferences and settings.

    Attributes:
        theme: UI theme (light or dark)
        llm_priority: Priority order for LLM selection
        agents_enabled: Enabled agents for analysis
        severity_display: Filter for severity levels to display
        job_retention_days: Job retention override (if tier allows)
    """

    theme: Literal["light", "dark"] = Field(
        default="dark",
        description="UI theme preference",
    )

    llm_priority: List[str] = Field(
        default=["local", "api_key", "hosted"],
        description="Priority order for LLM provider selection",
    )

    agents_enabled: List[str] = Field(
        default=["code_review", "security", "tests", "maintainability"],
        description="Enabled agents for PR analysis",
    )

    severity_display: Literal["all", "critical_high", "critical_high_medium"] = Field(
        default="all",
        description="Filter for severity levels to display in UI",
    )

    job_retention_days: int = Field(
        default=1,
        ge=1,
        le=30,
        description="Job retention period (may be limited by user tier)",
    )

    class Config:
        json_schema_extra = {
            "example": {
                "theme": "dark",
                "llm_priority": ["local", "api_key", "hosted"],
                "agents_enabled": ["code_review", "security"],
                "severity_display": "all",
                "job_retention_days": 5,
            }
        }
