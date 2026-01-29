"""
Quick test to verify config loads correctly with Key Vault disabled
"""
import os
import sys

# Set required environment variables for testing
os.environ["AZURE_KEY_VAULT_ENABLED"] = "false"
os.environ["JWT_SECRET"] = "9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c"
os.environ["CSRF_SECRET"] = "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"
os.environ["GITHUB_CLIENT_ID"] = "Ov23li4zpcEIBwBCpxcL"
os.environ["GITHUB_CLIENT_SECRET"] = "63cca7365b51542e4801269164f0f1833da13fe9"
os.environ["GITHUB_APP_TOKEN"] = "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"
os.environ["GROQ_API_KEY"] = "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"
os.environ["MONGO_URI"] = "mongodb://localhost:27017/test_db"

print("[TEST] Testing config loading with environment variables...")

try:
    from app.core.config import get_settings
    
    settings = get_settings()
    
    print("✅ Config loaded successfully!")
    print(f"  - JWT_SECRET: {'*' * len(settings.JWT_SECRET)} ({len(settings.JWT_SECRET)} chars)")
    print(f"  - CSRF_SECRET: {'*' * len(settings.CSRF_SECRET)} ({len(settings.CSRF_SECRET)} chars)")
    print(f"  - GITHUB_CLIENT_ID: {settings.GITHUB_CLIENT_ID}")
    print(f"  - Key Vault Enabled: {settings.AZURE_KEY_VAULT_ENABLED}")
    print(f"  - Mongo URI: {settings.MONGO_URI[:30]}...")
    
    print("\n[TEST] All validations passed! ✅")
    sys.exit(0)
    
except Exception as e:
    print(f"\n❌ Config loading failed: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
