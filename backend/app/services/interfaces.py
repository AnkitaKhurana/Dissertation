"""
PR Sentinel Backend — Adapter Interfaces

Responsibility:
- Define abstract interfaces for LLM and GitHub adapters
- Provide type contracts for concrete implementations and mocks

Exported Classes:
- LLMAdapter (ABC)
- GitHubAdapter (ABC)
"""

from abc import ABC, abstractmethod
from typing import Any, Dict, List

from app.schemas.findings import Finding


class LLMAdapter(ABC):
    """Abstract base class for LLM adapters."""

    @abstractmethod
    async def analyze(self, prompt: str, options: Dict[str, Any] | None = None) -> List[Finding]:
        """
        Run analysis against the LLM.

        Args:
            prompt: Prompt text
            options: Additional options (model, temperature, timeout, etc.)

        Returns:
            List of Finding objects
        """


class GitHubAdapter(ABC):
    """Abstract base class for GitHub API adapter."""

    @abstractmethod
    async def fetch_pr_diff(self, pr_url: str) -> str:
        """Fetch PR diff text."""

    @abstractmethod
    async def fetch_pr_metadata(self, pr_url: str) -> Dict[str, Any]:
        """Fetch PR metadata (changed_files, title, etc.)."""

    @abstractmethod
    async def fetch_pr_files(self, pr_url: str) -> List[Dict[str, Any]]:
        """Fetch list of files in the PR."""

    @abstractmethod
    async def post_comment(self, pr_url: str, body: str) -> None:
        """Post a comment to the PR (server-side GitHub App token)."""
