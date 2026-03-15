import pytest
import jwt
from fastapi import status

from app.core.config import get_settings
from app.schemas.jobs import JobStatus


def _auth_headers(user_id: str = "1") -> dict:
    settings = get_settings()
    token = jwt.encode(
        {"sub": user_id, "github_username": "test-user"},
        settings.JWT_SECRET,
        algorithm=settings.JWT_ALGORITHM,
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_analyze_pr_creates_job(test_client):
    client, job_store = test_client
    payload = {"pr_url": "https://github.com/org/repo/pull/1", "agents_requested": ["code_review"]}

    resp = await client.post("/api/v1/analyze-pr", json=payload)
    assert resp.status_code == status.HTTP_201_CREATED
    data = resp.json()
    assert "job_id" in data
    assert data["status"] == JobStatus.PENDING
    # Background task stub moves to completed
    job = await job_store.get_job(data["job_id"])
    assert job["status"] in {JobStatus.PENDING, JobStatus.COMPLETED}


@pytest.mark.asyncio
async def test_analyze_pr_rejects_invalid_url(test_client):
    client, _ = test_client
    payload = {"pr_url": "https://github.com/org/repo/issues/1", "agents_requested": ["code_review"]}

    resp = await client.post("/api/v1/analyze-pr", json=payload)
    assert resp.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    body = resp.json()
    assert "Invalid GitHub PR URL" in str(body["detail"])


@pytest.mark.asyncio
async def test_analyze_pr_rejects_large_pr(test_client, mock_github):
    client, _ = test_client
    mock_github.metadata = {"changed_files": get_settings().MAX_PR_FILES + 1}
    payload = {"pr_url": "https://github.com/org/repo/pull/2", "agents_requested": ["code_review"]}

    resp = await client.post("/api/v1/analyze-pr", json=payload)
    assert resp.status_code == status.HTTP_413_REQUEST_ENTITY_TOO_LARGE
    body = resp.json()
    assert body["detail"]["error_code"] == "PR_TOO_LARGE"


@pytest.mark.asyncio
async def test_get_job_status_returns_job(test_client):
    client, job_store = test_client
    job_id = await job_store.create_job(
        user_id="u1",
        pr_url="https://github.com/org/repo/pull/3",
        agents_requested=["code_review"],
        user_tier="free",
    )

    resp = await client.get(f"/api/v1/jobs/{job_id}")
    assert resp.status_code == status.HTTP_200_OK
    data = resp.json()
    assert data["job_id"] == job_id
    assert "last_updated" in data


@pytest.mark.asyncio
async def test_cancel_job_marks_cancelled(test_client):
    client, job_store = test_client
    job_id = await job_store.create_job(
        user_id="u1",
        pr_url="https://github.com/org/repo/pull/4",
        agents_requested=["code_review"],
        user_tier="free",
    )

    resp = await client.patch(f"/api/v1/jobs/{job_id}/cancel")
    assert resp.status_code == status.HTTP_200_OK
    data = resp.json()
    assert data["status"] == JobStatus.CANCELLED


@pytest.mark.asyncio
async def test_user_prefs_roundtrip(test_client):
    client, _ = test_client
    headers = _auth_headers()

    get_resp = await client.get("/api/v1/user/prefs", headers=headers)
    assert get_resp.status_code == status.HTTP_200_OK
    prefs = get_resp.json()
    assert prefs["theme"] in {"light", "dark", "system"}

    prefs["theme"] = "light"
    put_resp = await client.put("/api/v1/user/prefs", json=prefs, headers=headers)
    assert put_resp.status_code == status.HTTP_200_OK
    assert put_resp.json()["theme"] == "light"


@pytest.mark.asyncio
async def test_auth_routes_stubbed(test_client):
    client, _ = test_client

    login = await client.get("/api/v1/auth/github")
    assert login.status_code == status.HTTP_307_TEMPORARY_REDIRECT
    assert "github.com/login/oauth/authorize" in login.headers.get("location", "")

    logout = await client.post("/api/v1/auth/logout")
    assert logout.status_code == status.HTTP_200_OK
    assert logout.json()["message"] == "Logged out successfully"
