import asyncio
from pathlib import Path

import pytest
from httpx import AsyncClient

from app.main import app
from app.services.github_adapter import get_github_adapter
from app.services.langgraph_orchestrator import get_orchestrator
from app.services.llm_adapter import get_llm_adapter
from app.services.job_store import get_job_store
from app.schemas.jobs import JobStatus
from app.tests.mocks.stubs import StubGitHubAdapter, StubLLMAdapter, StubJobStore


def pytest_addoption(parser):
    parser.addoption("--integration", action="store_true", help="run integration tests")


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="session")
def fixtures_dir() -> Path:
    return Path(__file__).parent / "fixtures"


@pytest.fixture()
def sample_diff(fixtures_dir: Path) -> str:
    return (fixtures_dir / "sample_diff.txt").read_text(encoding="utf-8")


@pytest.fixture()
def mock_github(sample_diff: str) -> StubGitHubAdapter:
    return StubGitHubAdapter(diff_text=sample_diff)


@pytest.fixture()
def mock_llm() -> StubLLMAdapter:
    return StubLLMAdapter()


@pytest.fixture()
async def test_client(mock_github: StubGitHubAdapter, mock_llm: StubLLMAdapter):
    # Override dependencies to avoid network/LLM calls
    job_store = StubJobStore()

    class _StubOrchestrator:
        async def run_analysis(self, job_id: str, pr_url: str) -> None:
            # Simulate completion immediately
            await job_store.append_findings(job_id, [])
            await job_store.update_job_status(job_id, status_value=JobStatus.COMPLETED)

    app.dependency_overrides[get_github_adapter] = lambda: mock_github
    app.dependency_overrides[get_llm_adapter] = lambda: mock_llm
    app.dependency_overrides[get_orchestrator] = lambda: _StubOrchestrator()
    app.dependency_overrides[get_job_store] = lambda: job_store

    async with AsyncClient(app=app, base_url="http://test") as client:
        yield client, job_store

    app.dependency_overrides.clear()
