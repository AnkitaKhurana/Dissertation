"""
PR Sentinel Backend — Configuration Module

Responsibility:
- Load and validate environment variables
- Provide centralized configuration access via Pydantic Settings
- Integrate with Azure Key Vault for secrets
- Enforce session-only defaults for user secrets

Exported Classes:
- Settings: Pydantic settings model
- get_settings() -> Settings: Singleton settings accessor
"""

import os
from functools import lru_cache
from typing import List, Literal, Optional

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

try:
    from azure.identity import DefaultAzureCredential
    from azure.keyvault.secrets import SecretClient
    AZURE_KEYVAULT_AVAILABLE = True
except ImportError:
    AZURE_KEYVAULT_AVAILABLE = False


def _get_vault_secret(vault_url: str, secret_name: str) -> Optional[str]:
    """
    Fetch a secret from Azure Key Vault.
    
    Args:
        vault_url: Vault URL (e.g., https://my-vault.vault.azure.net/)
        secret_name: Secret name in the vault
        
    Returns:
        Secret value or None if not found/unavailable
    """
    if not AZURE_KEYVAULT_AVAILABLE or not vault_url:
        return None
    
    try:
        credential = DefaultAzureCredential()
        client = SecretClient(vault_url=vault_url, credential=credential)
        secret = client.get_secret(secret_name)
        return secret.value
    except Exception as e:
        print(f"Failed to fetch secret '{secret_name}' from vault: {e}")
        return None


class Settings(BaseSettings):
    """
    Application settings loaded from environment variables.

    All settings have defaults where sensible. Required settings without defaults
    will raise an error if not provided.

    TODO (Production):
    - Integrate Azure Key Vault for secrets (GITHUB_APP_TOKEN, JWT_SECRET, HOSTED_LLM_KEY, etc.)
    - Use azure-identity and azure-keyvault-secrets
    - Remove .env file and use Key Vault references in Azure App Service settings
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # ============================================================================
    # Application
    # ============================================================================

    ENVIRONMENT: Literal["development", "staging", "production"] = Field(
        default="development",
        description="Deployment environment",
    )

    DEBUG: bool = Field(
        default=False,
        description="Enable debug mode (verbose logging, auto-reload)",
    )

    API_VERSION: str = Field(
        default="v1",
        description="API version for URL routing",
    )

    # ============================================================================
    # Server
    # ============================================================================

    HOST: str = Field(
        default="0.0.0.0",
        description="Server host (0.0.0.0 for Docker)",
    )

    PORT: int = Field(
        default=8000,
        description="Server port",
    )

    ALLOWED_ORIGINS: List[str] = Field(
        default=[
            "http://localhost:5173",
            "http://localhost:3000",
            "chrome-extension://ikcddkikdefmhflhdbiigcamjdkgcpel",
            "chrome-extension://*",  # Allow all chrome extensions (restrict in production)
        ],
        description="CORS allowed origins",
    )

    # ============================================================================
    # Security
    # ============================================================================

    JWT_SECRET: str = Field(
        default="",
        description="Secret key for JWT signing (min 32 chars). Generate with: openssl rand -hex 32",
    )

    JWT_ALGORITHM: str = Field(
        default="HS256",
        description="JWT signing algorithm",
    )

    JWT_EXPIRATION_MINUTES: int = Field(
        default=1440,  # 24 hours
        description="JWT expiration time in minutes",
    )

    CSRF_SECRET: str = Field(
        default="",
        description="Secret key for CSRF token generation",
    )

    # ============================================================================
    # GitHub OAuth App (User Authentication)
    # ============================================================================

    GITHUB_CLIENT_ID: str = Field(
        default="",
        description="GitHub OAuth App client ID",
    )

    GITHUB_CLIENT_SECRET: str = Field(
        default="",
        description="GitHub OAuth App client secret",
    )

    GITHUB_OAUTH_REDIRECT_URI: str = Field(
        default="http://localhost:8000/api/v1/auth/github/callback",
        description="GitHub OAuth redirect URI (must match OAuth App settings)",
    )

    FRONTEND_CALLBACK_URL: str = Field(
        default="http://localhost:5173/src/options.html",
        description="Frontend URL to redirect to after OAuth (with ?token= appended). For extensions, use chrome-extension://extension-id/src/options.html",
    )

    # ============================================================================
    # GitHub App (Server-Side API Calls)
    # ============================================================================

    GITHUB_APP_TOKEN: str = Field(
        default="",
        description="GitHub App installation token for server-side GitHub API calls",
    )

    # ============================================================================
    # Database (MongoDB)
    # ============================================================================

    MONGO_URI: str = Field(
        default="mongodb://localhost:27017/pr_sentinel_dev",
        description="MongoDB connection URI",
    )

    MONGO_DB_NAME: str = Field(
        default="pr_sentinel",
        description="MongoDB database name",
    )

    MONGO_MAX_POOL_SIZE: int = Field(
        default=10,
        description="MongoDB connection pool max size",
    )

    MONGO_MIN_POOL_SIZE: int = Field(
        default=1,
        description="MongoDB connection pool min size",
    )

    # TODO: Azure Cosmos DB (MongoDB API) for production
    # COSMOS_DB_CONNECTION_STRING: Optional[str] = None

    # ============================================================================
    # LLM Configuration
    # ============================================================================

    HOSTED_LLM_PROVIDER: str = Field(
        default="openai",
        description="Hosted LLM provider (openai, anthropic, huggingface, etc.) for Pro/Admin users",
    )

    HOSTED_LLM_KEY: str = Field(
        default="",
        description="Hosted LLM API key for Pro/Admin users (empty = disabled)",
    )

    HOSTED_LLM_MODEL: str = Field(
        default="gpt-4",
        description="Hosted LLM model name (e.g., gpt-4, claude-3-opus)",
    )

    # Hugging Face Inference Providers API (OpenAI-compatible chat completions)
    # Endpoint: https://router.huggingface.co/v1/chat/completions
    HF_API_TOKEN: str = Field(
        default="",
        description="Hugging Face Inference API token (required for hosted HF models). Get from: https://huggingface.co/settings/tokens/new",
    )

    HF_MODEL: str = Field(
        default="deepseek-ai/deepseek-coder-6.7b-instruct",
        description="Hugging Face model slug. Recommended: deepseek-ai/deepseek-coder-6.7b-instruct, codellama/CodeLlama-13b-Instruct-hf, bigcode/starcoder2-7b",
    )

    HF_MAX_NEW_TOKENS: int = Field(
        default=2048,
        description="Max new tokens to generate for HF inference (recommended 2048+ for PR reviews)",
    )

    HF_TEMPERATURE: float = Field(
        default=0.1,
        ge=0.0,
        le=1.0,
        description="Sampling temperature for HF inference (0.05-0.2 for deterministic code suggestions)",
    )

    HF_USE_STREAMING: bool = Field(
        default=False,
        description="Enable streaming responses if supported (not wired by default)",
    )

    # Groq API (OpenAI-compatible chat completions, free tier available)
    # Endpoint: https://api.groq.com/openai/v1/chat/completions
    GROQ_API_KEY: str = Field(
        default="",
        description="Groq API key (required for Groq models). Get from: https://console.groq.com/keys",
    )

    GROQ_MODEL: str = Field(
        default="llama-3.3-70b-versatile",
        description="Groq model name. Recommended: llama-3.3-70b-versatile (best for code review), mixtral-8x7b-32768",
    )

    GROQ_MAX_TOKENS: int = Field(
        default=2048,
        description="Max tokens to generate for Groq inference (recommended 2048+ for PR reviews)",
    )

    GROQ_TEMPERATURE: float = Field(
        default=0.1,
        ge=0.0,
        le=1.0,
        description="Sampling temperature for Groq inference (0.1-0.2 for deterministic code suggestions)",
    )

    # ============================================================================
    # Rate Limiting
    # ============================================================================

    RATE_LIMIT_ENABLED: bool = Field(
        default=True,
        description="Enable rate limiting",
    )

    RATE_LIMIT_PER_MINUTE: int = Field(
        default=5,
        description="Requests per minute for /api/v1/analyze-pr",
    )

    RATE_LIMIT_STORAGE: Literal["memory", "redis"] = Field(
        default="memory",
        description="Rate limit storage backend (memory for dev, redis for prod)",
    )

    # TODO: Redis for distributed rate limiting in production
    REDIS_URI: str = Field(
        default="redis://localhost:6379",
        description="Redis connection URI for distributed rate limiting",
    )

    @property
    def RATE_LIMIT_STORAGE_URI(self) -> str:
        """
        Get rate limit storage URI based on RATE_LIMIT_STORAGE setting.

        Returns:
            Storage URI for slowapi Limiter
        """
        if self.RATE_LIMIT_STORAGE == "redis":
            return self.REDIS_URI
        return "memory://"

    # ============================================================================
    # Job Configuration
    # ============================================================================

    MAX_PR_FILES: int = Field(
        default=500,
        description="Reject PRs with more files (HTTP 413)",
    )

    JOB_TIMEOUT_SECONDS: int = Field(
        default=300,  # 5 minutes
        description="Maximum job execution time",
    )

    AGENT_TIMEOUT_SECONDS: int = Field(
        default=30,
        description="Per-agent timeout",
    )

    BACKGROUND_TASK_MAX_RETRIES: int = Field(
        default=3,
        description="Max retries for background tasks (LLM/GitHub API calls)",
    )

    # ============================================================================
    # TTL Retention (in seconds)
    # ============================================================================

    JOB_RETENTION_FREE_TIER: int = Field(
        default=604800,  # 7 days
        description="Job retention for free tier users (seconds)",
    )

    JOB_RETENTION_PRO_TIER: int = Field(
        default=432000,  # 5 days
        description="Job retention for Pro tier users (seconds)",
    )

    JOB_RETENTION_ADMIN_TIER: int = Field(
        default=432000,  # 5 days
        description="Job retention for Admin tier users (seconds)",
    )

    # ============================================================================
    # Logging
    # ============================================================================

    LOG_LEVEL: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = Field(
        default="INFO",
        description="Logging level",
    )

    LOG_FORMAT: Literal["json", "text"] = Field(
        default="json",
        description="Log output format (json for production, text for dev)",
    )

    LOG_REDACT_SECRETS: bool = Field(
        default=True,
        description="Redact secrets from logs (API keys, tokens, diffs)",
    )

    # ============================================================================
    # Azure Key Vault (Production)
    # ============================================================================

    AZURE_KEY_VAULT_ENABLED: bool = Field(
        default=False,
        description="Enable Azure Key Vault for secrets",
    )

    AZURE_KEY_VAULT_NAME: str = Field(
        default="",
        description="Azure Key Vault name (used to construct vault URL)",
    )

    # Derived: https://{AZURE_KEY_VAULT_NAME}.vault.azure.net/
    @property
    def AZURE_KEY_VAULT_URL(self) -> Optional[str]:
        """Construct vault URL from vault name."""
        if self.AZURE_KEY_VAULT_NAME:
            return f"https://{self.AZURE_KEY_VAULT_NAME}.vault.azure.net/"
        return None

    AZURE_TENANT_ID: str = Field(
        default="",
        description="Azure tenant ID for Key Vault authentication",
    )

    AZURE_CLIENT_ID: str = Field(
        default="",
        description="Azure client ID for managed identity",
    )

    AZURE_CLIENT_SECRET: str = Field(
        default="",
        description="Azure client secret (for service principal auth)",
    )

    # ============================================================================
    # Helper Methods
    # ============================================================================

    def __init__(self, **data):
        """Initialize settings and fetch secrets from Key Vault if enabled."""
        super().__init__(**data)
        self._load_vault_secrets()

    def _load_vault_secrets(self) -> None:
        """Load secrets from Azure Key Vault if enabled."""
        if not self.AZURE_KEY_VAULT_ENABLED or not self.AZURE_KEY_VAULT_URL:
            return

        print(f"[Vault] Attempting to load secrets from {self.AZURE_KEY_VAULT_URL}")

        # Map of secret names in vault to Settings attribute names
        vault_secrets_map = {
            "groq-api-key": "GROQ_API_KEY",
            "hf-api-token": "HF_API_TOKEN",
            "github-app-token": "GITHUB_APP_TOKEN",
            "github-client-id": "GITHUB_CLIENT_ID",
            "github-client-secret": "GITHUB_CLIENT_SECRET",
            "jwt-secret": "JWT_SECRET",
            "csrf-secret": "CSRF_SECRET",
            "mongo-uri": "MONGO_URI",
            "frontend-callback-url": "FRONTEND_CALLBACK_URL",
        }

        for vault_secret_name, attr_name in vault_secrets_map.items():
            # Fetch from vault
            secret_value = _get_vault_secret(self.AZURE_KEY_VAULT_URL, vault_secret_name)
            if secret_value:
                # Vault takes precedence - overwrite env var if exists
                setattr(self, attr_name, secret_value)
                print(f"[Vault] Loaded {vault_secret_name} from vault")
            else:
                # Only skip if vault doesn't have the secret and env var is set
                if getattr(self, attr_name, ""):
                    print(f"[Vault] Using env var for {vault_secret_name} (not found in vault)")
                else:
                    print(f"[Vault] Failed to load {vault_secret_name} from vault")

    def get_retention_seconds(self, user_tier: Literal["free", "pro", "admin"]) -> int:
        """
        Get job retention seconds for a given user tier.

        Args:
            user_tier: User tier (free, pro, admin)

        Returns:
            Retention period in seconds
        """
        tier_map = {
            "free": self.JOB_RETENTION_FREE_TIER,
            "pro": self.JOB_RETENTION_PRO_TIER,
            "admin": self.JOB_RETENTION_ADMIN_TIER,
        }
        return tier_map.get(user_tier, self.JOB_RETENTION_FREE_TIER)

    def is_production(self) -> bool:
        """Check if running in production environment."""
        return self.ENVIRONMENT == "production"

    # ============================================================================
    # TODO: Azure Key Vault Integration
    # ============================================================================

    def load_from_key_vault(self):
        """
        Load secrets from Azure Key Vault.

        Uses DefaultAzureCredential for authentication (supports managed identity, 
        Azure CLI, environment variables, etc.)
        """
        from azure.identity import DefaultAzureCredential
        from azure.keyvault.secrets import SecretClient

        if not self.AZURE_KEY_VAULT_ENABLED:
            return

        try:
            credential = DefaultAzureCredential()
            vault_url = f"https://{self.AZURE_KEY_VAULT_NAME}.vault.azure.net"
            client = SecretClient(vault_url=vault_url, credential=credential)

            # Load secrets from Key Vault
            self.JWT_SECRET = client.get_secret("jwt-secret").value
            self.CSRF_SECRET = client.get_secret("csrf-secret").value
            self.GITHUB_CLIENT_ID = client.get_secret("github-client-id").value
            self.GITHUB_CLIENT_SECRET = client.get_secret("github-client-secret").value
            self.GITHUB_APP_TOKEN = client.get_secret("github-app-token").value
            self.GROQ_API_KEY = client.get_secret("groq-api-key").value
            self.MONGO_URI = client.get_secret("mongo-uri").value

            print(f"[INFO] Successfully loaded secrets from Key Vault: {self.AZURE_KEY_VAULT_NAME}")
        except Exception as e:
            print(f"[ERROR] Failed to load secrets from Key Vault: {e}")
            raise


@lru_cache()
def get_settings() -> Settings:
    """
    Get cached settings instance (singleton).

    Returns:
        Settings instance loaded from environment variables and/or Key Vault

    Raises:
        ValidationError: If required environment variables are missing or invalid
    """
    settings = Settings()
    return settings
    raise
