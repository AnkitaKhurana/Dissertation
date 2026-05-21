"""
PR Sentinel Backend — Pydantic Schemas for Findings

Responsibility:
- Define Finding data model for LLM agent outputs
- Validate severity levels, confidence scores, file paths

Exported Classes:
- Finding: Individual finding from an agent
- SeverityLevel: Literal type for severity values
"""

from typing import Literal, Optional
from uuid import uuid4

from pydantic import BaseModel, Field, field_validator

from app.services.agent_registry import get_valid_agents

# Severity levels (critical → high → medium → low → info)
SeverityLevel = Literal["critical", "high", "medium", "low", "info"]


class Finding(BaseModel):
    """
    Individual finding from an LLM agent.

    Attributes:
        id: Unique identifier for this finding (UUID)
        file_path: Relative path to file in PR (e.g., "src/main.py")
        line_number: Line number where issue was found (1-indexed)
        severity: Issue severity level
        agent: Agent that generated the finding (e.g., "static_analyzer", "code_review")
        message: Human-readable description of the issue
        suggested_code: Optional code suggestion to fix the issue
        confidence: Confidence score (0.0 to 1.0)
    """

    id: str = Field(
        default_factory=lambda: str(uuid4()),
        description="Unique identifier for this finding",
        examples=["550e8400-e29b-41d4-a716-446655440000"],
    )

    file_path: str = Field(
        ...,
        description="Relative file path in the PR repository",
        examples=["src/main.py", "tests/test_auth.py"],
    )

    line_number: int = Field(
        ...,
        ge=0,
        description="Line number where the issue was found (0 = file-level, >= 1 = specific line)",
        examples=[0, 42, 123],
    )

    severity: SeverityLevel = Field(
        ...,
        description="Severity level of the finding",
        examples=["critical", "high", "medium", "low", "info"],
    )

    agent: str = Field(
        ...,
        description="Agent that generated this finding",
        examples=["static_analyzer", "semantic_analyzer", "security_checker", "testability_agent", "maintainability_agent"],
    )

    message: str = Field(
        ...,
        min_length=1,
        max_length=1000,
        description="Human-readable description of the issue",
        examples=["Potential SQL injection vulnerability", "Missing null check"],
    )

    suggested_code: Optional[str] = Field(
        default=None,
        max_length=5000,
        description="Suggested code to fix the issue",
        examples=["Use parameterized queries: cursor.execute(query, (user_input,))"],
    )

    confidence: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Confidence score for this finding (0.0 to 1.0)",
        examples=[0.92, 0.75, 0.50],
    )

    @field_validator("file_path")
    @classmethod
    def validate_file_path(cls, v: str) -> str:
        """
        Validate file path to prevent directory traversal.

        Args:
            v: File path

        Returns:
            Validated file path

        Raises:
            ValueError: If path contains directory traversal sequences
        """
        if ".." in v or v.startswith("/"):
            raise ValueError("File path must be relative and cannot contain '..'")
        return v

    @field_validator("agent")
    @classmethod
    def validate_agent(cls, v: str) -> str:
        """
        Validate agent name.

        Args:
            v: Agent name

        Returns:
            Validated agent name

        Raises:
            ValueError: If agent name is invalid
        """
        valid_agents = list(get_valid_agents())
        if v not in valid_agents:
            raise ValueError(f"Agent must be one of: {valid_agents}")
        return v

    class Config:
        json_schema_extra = {
            "example": {
                "file_path": "src/auth.py",
                "line_number": 42,
                "severity": "high",
                "agent": "security",
                "message": "Potential SQL injection vulnerability in user query",
                "suggested_code": "Use parameterized queries: cursor.execute('SELECT * FROM users WHERE id = ?', (user_id,))",
                "confidence": 0.92,
            }
        }
