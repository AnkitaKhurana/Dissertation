"""
Seed admin/pro users for PR Sentinel.

Usage:
    python scripts/seed_users.py

Notes:
- Do NOT hardcode emails in code; use environment variables or CLI args.
- This script is safe for dev environments; adjust for production approvals.
"""

import os
from datetime import datetime

from motor.motor_asyncio import AsyncIOMotorClient

from app.core.config import get_settings

settings = get_settings()

ADMIN_EMAILS = os.getenv("ADMIN_EMAILS", "admin@example.com").split(",")
PRO_EMAILS = os.getenv("PRO_EMAILS", "pro@example.com").split(",")


async def seed():
    client = AsyncIOMotorClient(settings.MONGO_URI)
    db = client[settings.MONGO_DB_NAME]
    users = db["users"]

    docs = []
    for email in ADMIN_EMAILS:
        docs.append({"email": email.strip(), "tier": "admin", "created_at": datetime.utcnow()})
    for email in PRO_EMAILS:
        docs.append({"email": email.strip(), "tier": "pro", "created_at": datetime.utcnow()})

    for doc in docs:
        await users.update_one({"email": doc["email"]}, {"$setOnInsert": doc}, upsert=True)

    print(f"Seeded {len(docs)} users (admin/pro)")
    client.close()


if __name__ == "__main__":
    import asyncio

    asyncio.run(seed())
