"""
PR Sentinel Backend — Job Store (MongoDB Wrapper)

Responsibility:
- Persist jobs and findings in MongoDB
- Enforce TTL retention based on user tier (expires_at per doc: 1d free, 5d pro/admin)
- Provide atomic updates for concurrent agent writes

Exported:
- JobStore: MongoDB-backed job persistence
- get_job_store(): Dependency provider
"""

from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorCollection

from app.core.config import get_settings
from app.core.logging import get_logger
from app.schemas.jobs import JobStatus

logger = get_logger(__name__)
settings = get_settings()


class JobStore:
    """Job persistence layer backed by MongoDB (Motor)."""

    def __init__(self, client: AsyncIOMotorClient, db_name: str):
        self.client = client
        self.db = client[db_name]
        self.collection: AsyncIOMotorCollection = self.db["jobs"]

    async def initialize(self) -> None:
        """Create indexes (including TTL) on startup and migrate data."""
        # MIGRATION: Remove documents with null idempotency_key
        # This handles documents created before the conditional fix was applied
        deleted_count = await self.collection.delete_many({"idempotency_key": None})
        if deleted_count.deleted_count > 0:
            logger.warning(
                "Migration: Removed documents with null idempotency_key",
                extra={"count": deleted_count.deleted_count}
            )
        
        # MIGRATION: Drop any idempotency_key index (unique indexes on optional fields
        # cause issues with Cosmos DB - documents without the field are treated as duplicates)
        try:
            await self.collection.drop_index("idempotency_key_1")
            logger.info("Migration: Dropped problematic idempotency_key index")
        except Exception as e:
            # Index doesn't exist or already dropped, that's fine
            logger.debug(f"No existing idempotency_key index to drop: {e}")
        
        await self.collection.create_index("created_at")
        # TTL via expires_at allows per-tier retention (1d free, 5d pro/admin)
        await self.collection.create_index(
            "expires_at",
            expireAfterSeconds=0,
            name="ttl_expires_at",
            background=True,
        )
        # NOTE: idempotency_key is optional and NOT indexed
        # Uniqueness is optional and handled at application level via find_job_by_idempotency_key()
        # Unique indexes on optional fields cause Cosmos DB duplicate key issues
        await self.collection.create_index("user_id")
        # Compound index for efficient user-specific job queries with time sorting
        await self.collection.create_index([("user_id", 1), ("created_at", -1)])
        await self.collection.create_index([("status", 1), ("last_updated", -1)])
        await self.collection.create_index("agent_states.agent")
        logger.info("JobStore indexes ensured (idempotency_key deduplication handled at app level)")

    async def close(self) -> None:
        self.client.close()

    async def health_check(self) -> None:
        await self.client.admin.command("ping")

    async def create_job(
        self,
        user_id: str,
        pr_url: str,
        agents_requested: List[str],
        user_tier: str,
        idempotency_key: Optional[str] = None,
    ) -> str:
        created_at = datetime.utcnow()
        retention_seconds = settings.get_retention_seconds(user_tier)
        expires_at = created_at + timedelta(seconds=retention_seconds)

        doc = {
            "user_id": user_id,
            "pr_url": pr_url,
            "agents_requested": agents_requested,
            "status": JobStatus.PENDING,
            "progress": 0.0,
            "results": [],
            "error": None,
            "created_at": created_at,
            "last_updated": created_at,
            "retention_seconds": retention_seconds,
            "expires_at": expires_at,
            "agent_states": [],
        }
        # Only include idempotency_key if provided (avoid None in unique sparse index)
        if idempotency_key:
            doc["idempotency_key"] = idempotency_key
            
        result = await self.collection.insert_one(doc)
        logger.info("Job inserted", extra={"job_id": str(result.inserted_id)})
        return str(result.inserted_id)

    async def find_job_by_idempotency_key(self, key: str) -> Optional[Dict[str, Any]]:
        return await self.collection.find_one({"idempotency_key": key})

    async def get_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        return await self.collection.find_one({"_id": ObjectId(job_id)})

    async def append_findings(self, job_id: str, findings: List[Dict[str, Any]]) -> None:
        await self.collection.update_one(
            {"_id": ObjectId(job_id)},
            {
                "$push": {"results": {"$each": findings}},
                "$set": {"last_updated": datetime.utcnow(), "status": JobStatus.RUNNING},
            },
        )

    async def persist_agent_state(self, job_id: str, state: Dict[str, Any]) -> None:
        await self.collection.update_one(
            {"_id": ObjectId(job_id)},
            {
                "$push": {"agent_states": state},
                "$set": {"last_updated": datetime.utcnow()},
            },
        )

    async def update_job_status(
        self, job_id: str, status_value: JobStatus, error: Optional[str] = None
    ) -> None:
        await self.collection.update_one(
            {"_id": ObjectId(job_id)},
            {
                "$set": {
                    "status": status_value,
                    "error": error,
                    "last_updated": datetime.utcnow(),
                    "progress": 1.0 if status_value == JobStatus.COMPLETED else 0.0,
                }
            },
        )

    async def cancel_job(self, job_id: str) -> None:
        await self.update_job_status(job_id, JobStatus.CANCELLED)


    async def list_user_jobs(
        self,
        user_id: str,
        skip: int = 0,
        limit: int = 20,
        status_filter: Optional[JobStatus] = None,
    ) -> tuple[List[Dict[str, Any]], int]:
        """
        List jobs for a user with pagination.

        Args:
            user_id: User ID to filter by
            skip: Number of records to skip (for pagination)
            limit: Maximum number of records to return
            status_filter: Optional status to filter by

        Returns:
            Tuple of (jobs list, total count)
        """
        query = {"user_id": user_id}
        if status_filter:
            query["status"] = status_filter

        # Get total count
        total = await self.collection.count_documents(query)

        # Get paginated results, sorted by created_at descending
        cursor = self.collection.find(query).sort("created_at", -1).skip(skip).limit(limit)
        jobs = await cursor.to_list(length=limit)

        return jobs, total
    async def delete_job(self, job_id: str) -> None:
        await self.collection.delete_one({"_id": ObjectId(job_id)})


_job_store: Optional[JobStore] = None


async def get_job_store() -> JobStore:
    """Dependency provider for JobStore singleton."""
    global _job_store
    if _job_store:
        return _job_store

    client = AsyncIOMotorClient(
        settings.MONGO_URI,
        maxPoolSize=settings.MONGO_MAX_POOL_SIZE,
        minPoolSize=settings.MONGO_MIN_POOL_SIZE,
        uuidRepresentation="standard",
    )
    _job_store = JobStore(client, settings.MONGO_DB_NAME)
    return _job_store
