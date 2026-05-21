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


def test_build_prompt_uses_agent_specific_template(sample_diff: str):
    orchestrator = LangGraphOrchestrator(
        llm_adapter=StubLLMAdapter(agent_name="static_analyzer"),
        github_adapter=StubGitHubAdapter(diff_text=sample_diff),
        job_store=StubJobStore(),
    )

    prompt = orchestrator._build_prompt(
        "static_analyzer",
        "https://github.com/org/repo/pull/1",
        sample_diff,
        profile="js_ts",
    )

    assert "Static Analyzer for JavaScript and TypeScript pull requests" in prompt
    assert "Profile: js_ts" in prompt
    assert "review the diff in a fixed order" in prompt.lower() or "review in this fixed order" in prompt.lower()


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


@pytest.mark.asyncio
async def test_run_analysis_selects_js_ts_profile_for_js_diff():
    diff_text = """diff --git a/src/app.ts b/src/app.ts
index 1111111..2222222 100644
--- a/src/app.ts
+++ b/src/app.ts
@@
-const value: string = 1;
+const value: string = "1";
"""
    job_store = StubJobStore()
    llm = StubLLMAdapter(agent_name="static_analyzer")
    orchestrator = LangGraphOrchestrator(
        llm_adapter=llm,
        github_adapter=StubGitHubAdapter(diff_text=diff_text),
        job_store=job_store,
    )

    job_id = str(ObjectId())
    await orchestrator.run_analysis(job_id, "https://github.com/org/repo/pull/2")

    job = await job_store.get_job(job_id)
    assert job["status"] == JobStatus.COMPLETED
    assert len(llm.calls) == 5
    assert "Static Analyzer for JavaScript and TypeScript pull requests" in llm.calls[0]
    assert "Profile: js_ts" in llm.calls[0]


@pytest.mark.asyncio
async def test_run_analysis_keeps_generic_profile_for_python_diff():
    diff_text = """diff --git a/src/app.py b/src/app.py
index 1111111..2222222 100644
--- a/src/app.py
+++ b/src/app.py
@@
-value = 1
+value = 2
"""
    job_store = StubJobStore()
    llm = StubLLMAdapter(agent_name="code_review")
    orchestrator = LangGraphOrchestrator(
        llm_adapter=llm,
        github_adapter=StubGitHubAdapter(diff_text=diff_text),
        job_store=job_store,
    )

    job_id = str(ObjectId())
    await orchestrator.run_analysis(job_id, "https://github.com/org/repo/pull/3")

    job = await job_store.get_job(job_id)
    assert job["status"] == JobStatus.COMPLETED
    assert len(llm.calls) == 4
    assert "code_review" in llm.calls[0]
    assert "Profile: generic" in llm.calls[0]
