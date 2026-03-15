import pytest
from bson import ObjectId

from app.schemas.jobs import JobStatus
from app.services.langgraph_orchestrator import LangGraphOrchestrator
from app.tests.mocks.stubs import StubGitHubAdapter, StubJobStore, StubLLMAdapter


def test_build_prompt_includes_policy(sample_diff: str):
    orchestrator = LangGraphOrchestrator(
        llm_adapter=StubLLMAdapter(),
        github_adapter=StubGitHubAdapter(diff_text=sample_diff),
        job_store=StubJobStore(),
    )

    prompt = orchestrator._build_prompt("code_review", "https://github.com/org/repo/pull/1", sample_diff)

    assert "PR: https://github.com/org/repo/pull/1" in prompt
    assert "Diff:" in prompt
    assert "code_review" in prompt
    assert "Do not expose secrets" in prompt


@pytest.mark.asyncio
async def test_run_analysis_updates_progress(sample_diff: str):
    job_store = StubJobStore()
    orchestrator = LangGraphOrchestrator(
        llm_adapter=StubLLMAdapter(),
        github_adapter=StubGitHubAdapter(diff_text=sample_diff),
        job_store=job_store,
    )

    job_id = str(ObjectId())
    await orchestrator.run_analysis(job_id, "https://github.com/org/repo/pull/1")

    job = await job_store.get_job(job_id)
    assert job["status"] == JobStatus.COMPLETED
    assert job["progress"] == 1.0
    # The orchestrator deduplicates identical findings across agents.
    assert len(job["results"]) == 1
    assert job_store.collection.update_calls >= 1
