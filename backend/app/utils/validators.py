"""
PR Sentinel Backend — Validation Utilities

Responsibility:
- Validate PR URLs
- Sanitize file paths
- Common helpers for input validation

Exported Functions:
- is_valid_pr_url(pr_url: str) -> bool
- sanitize_path(path: str) -> str
"""

import re

PR_URL_PATTERN = re.compile(r"^https://github\.com/[^/]+/[^/]+/pull/\d+$")


def is_valid_pr_url(pr_url: str) -> bool:
    """Return True if PR URL matches required pattern."""
    return bool(PR_URL_PATTERN.match(pr_url))


def sanitize_path(path: str) -> str:
    """Ensure path is relative and does not include traversal."""
    if ".." in path or path.startswith("/"):
        raise ValueError("Path must be relative and cannot contain '..'")
    return path
