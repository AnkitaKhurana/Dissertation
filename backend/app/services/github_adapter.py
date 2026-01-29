"""
PR Sentinel Backend — GitHub Adapter

Responsibility:
- Server-side GitHub API calls using GitHub App token
- Handle secondary rate limits with backoff
- Expose PR diff, metadata, files, and comment posting

Exported:
- GitHubAppAdapter
- get_github_adapter(): FastAPI dependency provider
"""

from typing import Any, Dict, List

import httpx
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from app.core.config import get_settings
from app.core.logging import get_logger
from app.services.interfaces import GitHubAdapter

logger = get_logger(__name__)
settings = get_settings()

GITHUB_API_BASE = "https://api.github.com"


class GitHubRateLimitError(Exception):
    """Raised when GitHub API rate limits are hit."""


def _retry_decorator():
    return retry(
        reraise=True,
        retry=retry_if_exception_type((httpx.HTTPError, GitHubRateLimitError)),
        stop=stop_after_attempt(settings.BACKGROUND_TASK_MAX_RETRIES),
        wait=wait_exponential(multiplier=1, min=1, max=16),
    )


class GitHubAppAdapter(GitHubAdapter):
    """GitHub adapter using GitHub App installation token."""

    def __init__(self, token: str):
        self.token = token
        self.client = httpx.AsyncClient(timeout=settings.AGENT_TIMEOUT_SECONDS)

    def _headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.token}",
            "Accept": "application/vnd.github+json",
            "User-Agent": "pr-sentinel-bot",
        }

    @_retry_decorator()
    async def fetch_pr_diff(self, pr_url: str) -> str:
        api_url = pr_url.replace("https://github.com/", f"{GITHUB_API_BASE}/repos/").replace("/pull/", "/pulls/")
        resp = await self.client.get(api_url, headers={**self._headers(), "Accept": "application/vnd.github.v3.diff"})
        self._handle_rate_limit(resp)
        resp.raise_for_status()
        return resp.text

    @_retry_decorator()
    async def fetch_pr_metadata(self, pr_url: str) -> Dict[str, Any]:
        api_url = pr_url.replace("https://github.com/", f"{GITHUB_API_BASE}/repos/").replace("/pull/", "/pulls/")
        resp = await self.client.get(api_url, headers=self._headers())
        self._handle_rate_limit(resp)
        resp.raise_for_status()
        data = resp.json()
        return {
            "title": data.get("title"),
            "changed_files": data.get("changed_files", 0),
            "additions": data.get("additions", 0),
            "deletions": data.get("deletions", 0),
            "user": data.get("user", {}),
            "created_at": data.get("created_at"),
        }

    @_retry_decorator()
    async def fetch_pr_files(self, pr_url: str) -> List[Dict[str, Any]]:
        api_url = pr_url.replace("https://github.com/", f"{GITHUB_API_BASE}/repos/").replace("/pull/", "/pulls/")
        resp = await self.client.get(f"{api_url}/files", headers=self._headers())
        self._handle_rate_limit(resp)
        resp.raise_for_status()
        return resp.json()

    @_retry_decorator()
    async def post_comment(self, pr_url: str, body: str) -> None:
        api_url = pr_url.replace("https://github.com/", f"{GITHUB_API_BASE}/repos/").replace("/pull/", "/issues/")
        resp = await self.client.post(f"{api_url}/comments", headers=self._headers(), json={"body": body})
        self._handle_rate_limit(resp)
        resp.raise_for_status()

    def _handle_rate_limit(self, resp: httpx.Response) -> None:
        if resp.status_code == 403 and resp.headers.get("X-RateLimit-Remaining") == "0":
            retry_after = int(resp.headers.get("Retry-After", "1"))
            logger.warning("GitHub rate limit hit", extra={"retry_after": retry_after})
            raise GitHubRateLimitError(f"Rate limited. Retry after {retry_after}s")


_github_adapter: GitHubAppAdapter | None = None


def get_github_adapter() -> GitHubAdapter:
    global _github_adapter
    if _github_adapter:
        return _github_adapter
    _github_adapter = GitHubAppAdapter(token=settings.GITHUB_APP_TOKEN)
    return _github_adapter
