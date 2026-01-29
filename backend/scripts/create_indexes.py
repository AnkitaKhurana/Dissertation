"""
Create MongoDB indexes required by PR Sentinel.

Usage:
    python scripts/create_indexes.py
"""

from motor.motor_asyncio import AsyncIOMotorClient

from app.core.config import get_settings

settings = get_settings()


async def create_indexes():
    client = AsyncIOMotorClient(settings.MONGO_URI)
    db = client[settings.MONGO_DB_NAME]

    # Jobs collection indexes
    await db.jobs.create_index("status")
    await db.jobs.create_index("created_at")
    await db.jobs.create_index("expires_at", expireAfterSeconds=0, name="ttl_expires_at")
    await db.jobs.create_index([("status", 1), ("last_updated", 1)])

    # Findings collection indexes
    await db.findings.create_index("job_id")
    await db.findings.create_index("file_path")

    client.close()


if __name__ == "__main__":
    import asyncio

    asyncio.run(create_indexes())
