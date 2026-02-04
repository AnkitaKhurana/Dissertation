"""
PR Sentinel Backend — LangGraph Orchestrator Wrapper

Responsibility:
- Orchestrate multi-agent analysis (code_review, security, tests, maintainability)
- Manage agent state (TypedDict) and persist transitions to job_store
- Write partial results to job_store during execution
- TODO: Replace BackgroundTasks with queue (Celery/Azure Queue) for production

Exported:
- LangGraphOrchestrator
- get_orchestrator(): Dependency provider
"""

from datetime import datetime
from pathlib import Path
from typing import Dict, List, TypedDict
from bson import ObjectId

from app.core.config import get_settings
from app.core.logging import get_logger
from app.schemas.findings import Finding
from app.schemas.jobs import JobStatus
from app.services.github_adapter import GitHubAdapter, get_github_adapter
from app.services.job_store import JobStore, get_job_store
from app.services.llm_adapter import LLMAdapter, get_llm_adapter

logger = get_logger(__name__)
settings = get_settings()


class AgentState(TypedDict):
    pr_url: str
    agent: str
    status: str
    findings: List[Finding]
    timestamp: str


class LangGraphOrchestrator:
    """Simple orchestrator stub (sequential for scaffold)."""

    def __init__(
        self,
        llm_adapter: LLMAdapter,
        github_adapter: GitHubAdapter,
        job_store: JobStore,
    ) -> None:
        self.llm = llm_adapter
        self.github = github_adapter
        self.jobs = job_store
        self.prompt_dir = Path(__file__).resolve().parent.parent / "LLM" / "prompts"

    async def run_analysis(self, job_id: str, pr_url: str) -> None:
        """Run all agents sequentially (scaffold)."""
        agents = ["code_review", "security", "tests", "maintainability"]
        try:
            diff_text = await self.github.fetch_pr_diff(pr_url)
        except Exception as exc:  # pragma: no cover - network stub
            logger.error("Failed to fetch PR diff", extra={"job_id": job_id}, exc_info=True)
            await self.jobs.update_job_status(job_id, JobStatus.FAILED, error=str(exc))
            return

        all_findings = []  # Collect findings from all agents
        for idx, agent in enumerate(agents, start=1):
            prompt = self._build_prompt(agent, pr_url, diff_text)
            await self._persist_agent_state(job_id, pr_url, agent, status="running")
            try:
                findings = await self.llm.analyze(prompt)
                all_findings.extend(findings)  # Collect findings
            except Exception as exc:  # pragma: no cover
                logger.error("Agent failed", extra={"agent": agent, "job_id": job_id}, exc_info=True)
                await self.jobs.update_job_status(job_id, JobStatus.FAILED, error=str(exc))
                return

            await self._persist_agent_state(job_id, pr_url, agent, status="completed", findings=findings)

            # Update progress for long-running jobs
            progress = idx / len(agents)
            await self.jobs.collection.update_one(
                {"_id": ObjectId(job_id)},
                {"$set": {"progress": progress, "last_updated": datetime.utcnow()}},
            )

        # Deduplicate findings before storing
        deduplicated = self._deduplicate_findings(all_findings)
        logger.info(
            "Deduplicated findings",
            extra={"job_id": job_id, "before": len(all_findings), "after": len(deduplicated)}
        )
        await self.jobs.append_findings(job_id, [f.model_dump() for f in deduplicated])
        await self.jobs.update_job_status(job_id, JobStatus.COMPLETED)

    def _build_prompt(self, agent: str, pr_url: str, diff_text: str) -> str:
        system = self._load_prompt("system.yaml")
        policy = self._load_prompt("policy.yaml")
        agent_prompt = self._load_prompt("reviewer.yaml")
        return "\n".join(
            [
                system,
                policy,
                f"Agent: {agent}",
                f"PR: {pr_url}",
                agent_prompt,
                "Diff:",
                diff_text,
            ]
        )

    def _load_prompt(self, filename: str) -> str:
        import yaml

        path = self.prompt_dir / filename
        try:
            data = yaml.safe_load(path.read_text(encoding="utf-8"))
            if isinstance(data, dict) and "content" in data:
                return str(data.get("content", ""))
            if isinstance(data, str):
                return data
            return ""
        except FileNotFoundError:  # pragma: no cover - defensive
            logger.warning("Prompt file missing", extra={"file": str(path)})
            return ""

    def _deduplicate_findings(self, findings: List[Finding]) -> List[Finding]:
        """
        Deduplicate findings based on file_path, line_number, and message.
        Keeps the first occurrence of each unique finding.
        """
        seen = set()
        deduplicated = []
        for finding in findings:
            # Create a unique key for this finding (file + line + message)
            key = (finding.file_path, finding.line_number, finding.message)
            if key not in seen:
                seen.add(key)
                deduplicated.append(finding)
        return deduplicated

    async def _persist_agent_state(
        self, job_id: str, pr_url: str, agent: str, status: str, findings: List[Finding] | None = None
    ) -> None:
        state: AgentState = {
            "pr_url": pr_url,
            "agent": agent,
            "status": status,
            "findings": [f.model_dump() for f in findings] if findings else [],
            "timestamp": datetime.utcnow().isoformat(),
        }
        await self.jobs.persist_agent_state(job_id, state)


_orchestrator: LangGraphOrchestrator | None = None


async def get_orchestrator(user_tier: str = "free") -> LangGraphOrchestrator:
    """Async dependency to get orchestrator instance with user tier support."""
    global _orchestrator
    # For now, we cache a single instance with default tier
    # TODO: In production, create separate instances per user tier if needed
    if _orchestrator:
        return _orchestrator
    _orchestrator = LangGraphOrchestrator(
        llm_adapter=get_llm_adapter(user_tier=user_tier),
        github_adapter=get_github_adapter(),
        job_store=await get_job_store(),
    )
    return _orchestrator
