from datetime import datetime
from typing import Any, Dict, List

from bson import ObjectId

from app.schemas.findings import Finding
from app.schemas.jobs import JobStatus


class StubLLMAdapter:
    def __init__(self, agent_name: str = "code_review") -> None:
        self.agent_name = agent_name
        self.calls: List[str] = []

    async def analyze(self, prompt: str) -> List[Finding]:
        self.calls.append(prompt)
        return [
            Finding(
                file_path="src/main.py",
                line_number=1,
                severity="medium",
                agent=self.agent_name,
                message="Example finding",
                suggested_code=None,
                confidence=0.8,
            )
        ]


class StubGitHubAdapter:
    def __init__(self, diff_text: str = "", metadata: Dict[str, Any] | None = None) -> None:
        self.diff_text = diff_text or "diff --git a/example b/example"
        self.metadata = metadata or {"changed_files": 1}
        self.fetch_diff_calls = 0
        self.fetch_metadata_calls = 0

    async def fetch_pr_diff(self, pr_url: str) -> str:
        self.fetch_diff_calls += 1
        return self.diff_text

    async def fetch_pr_metadata(self, pr_url: str) -> Dict[str, Any]:
        self.fetch_metadata_calls += 1
        return self.metadata


class _CollectionStub:
    def __init__(self, job: Dict[str, Any]) -> None:
        self.job = job
        self.update_calls = 0

    async def update_one(self, query: Dict[str, Any], update: Dict[str, Any]):
        self.update_calls += 1
        set_values = update.get("$set", {})
        self.job.update(set_values)


class StubJobStore:
    def __init__(self) -> None:
        now = datetime.utcnow()
        self.job = {
            "_id": ObjectId(),
            "status": JobStatus.PENDING,
            "results": [],
            "progress": 0.0,
            "created_at": now,
            "last_updated": now,
            "error": None,
        }
        self.collection = _CollectionStub(self.job)

    async def create_job(
        self,
        user_id: str,
        pr_url: str,
        agents_requested: List[str],
        user_tier: str,
        idempotency_key: str | None = None,
    ) -> str:
        now = datetime.utcnow()
        self.job = {
            "_id": ObjectId(),
            "user_id": user_id,
            "pr_url": pr_url,
            "agents_requested": agents_requested,
            "status": JobStatus.PENDING,
            "progress": 0.0,
            "results": [],
            "error": None,
            "created_at": now,
            "last_updated": now,
            "idempotency_key": idempotency_key,
        }
        self.collection = _CollectionStub(self.job)
        return str(self.job["_id"])

    async def append_findings(self, job_id: str, findings: List[Dict[str, Any]]) -> None:
        self.job.setdefault("results", []).extend(findings)
        self.job["status"] = JobStatus.RUNNING
        self.job["last_updated"] = datetime.utcnow()

    async def update_job_status(self, job_id: str, status_value: JobStatus, error: str | None = None) -> None:
        self.job["status"] = status_value
        self.job["error"] = error
        self.job["last_updated"] = datetime.utcnow()
        self.job["progress"] = 1.0 if status_value == JobStatus.COMPLETED else self.job.get("progress", 0.0)

    async def get_job(self, job_id: str) -> Dict[str, Any]:
        return self.job

    async def find_job_by_idempotency_key(self, key: str) -> Dict[str, Any] | None:
        return None

    async def cancel_job(self, job_id: str) -> None:
        await self.update_job_status(job_id, JobStatus.CANCELLED)

    async def health_check(self) -> None:
        return None
