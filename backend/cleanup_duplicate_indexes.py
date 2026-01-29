#!/usr/bin/env python
"""
Cleanup script to remove documents with null idempotency_key from MongoDB.
These documents violate the unique sparse index constraint.
"""

import os
from pymongo import MongoClient

def cleanup():
    mongo_uri = os.getenv("MONGO_CONNECTION_STRING")
    db_name = os.getenv("MONGO_DB_NAME", "pr_sentinel")
    
    if not mongo_uri:
        print("ERROR: MONGO_CONNECTION_STRING not set in .env")
        return
    
    client = MongoClient(mongo_uri)
    db = client[db_name]
    jobs_collection = db["jobs"]
    
    print(f"Connecting to {db_name}...")
    
    try:
        # Count documents with null idempotency_key
        null_count = jobs_collection.count_documents({"idempotency_key": None})
        print(f"Found {null_count} documents with idempotency_key: null")
        
        # Also check for documents missing the field
        missing_count = jobs_collection.count_documents({"idempotency_key": {"$exists": False}})
        print(f"Found {missing_count} documents missing idempotency_key field")
        
        if null_count > 0:
            # Remove null idempotency_key documents
            result = jobs_collection.delete_many({"idempotency_key": None})
            print(f"Deleted {result.deleted_count} documents with null idempotency_key")
        
        # List indexes
        indexes = jobs_collection.list_indexes()
        print("\nCurrent indexes:")
        for idx in indexes:
            print(f"  - {idx['name']}: {idx.get('key', [])}")
            if idx.get('unique'):
                print(f"    (unique: {idx['unique']}, sparse: {idx.get('sparse', False)})")
        
        print("\nCleanup complete!")
        
    finally:
        client.close()

if __name__ == "__main__":
    cleanup()
