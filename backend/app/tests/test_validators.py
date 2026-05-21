import pytest

from app.schemas.findings import Finding
from app.schemas.jobs import JobCreate
from app.utils.validators import is_valid_pr_url, sanitize_path


@pytest.mark.parametrize(
    "url,expected",
    [
        ("https://github.com/org/repo/pull/123", True),
        ("https://github.com/org/repo/issues/1", False),
        ("http://github.com/org/repo/pull/1", False),
    ],
)
def test_is_valid_pr_url(url: str, expected: bool):
    assert is_valid_pr_url(url) is expected


def test_sanitize_path_rejects_traversal():
    with pytest.raises(ValueError):
        sanitize_path("../secret.txt")


def test_sanitize_path_allows_relative():
    assert sanitize_path("src/main.py") == "src/main.py"


def test_finding_accepts_js_ts_agents():
    finding = Finding(
        file_path="src/app.ts",
        line_number=1,
        severity="high",
        agent="static_analyzer",
        message="Type mismatch",
        suggested_code=None,
        confidence=0.9,
    )

    assert finding.agent == "static_analyzer"


def test_job_create_accepts_js_ts_agents():
    job = JobCreate(
        pr_url="https://github.com/org/repo/pull/1",
        agents_requested=["static_analyzer", "security_checker"],
    )

    assert job.agents_requested == ["static_analyzer", "security_checker"]
