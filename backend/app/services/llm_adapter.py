"""
PR Sentinel Backend — LLM Adapter Implementations

Responsibility:
- Provide LLMAdapter implementations for local, api_key, and hosted providers
- Apply retry with exponential backoff and per-call timeout
- Stub circuit-breaker for production hardening

Exported:
- LocalLLMAdapter
- APIKeyLLMAdapter
- HostedLLMAdapter
- get_llm_adapter(): FastAPI dependency factory selecting priority order
"""

import asyncio
import json
from typing import Any, Dict, List, Optional

import httpx
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from app.core.config import get_settings
from app.core.logging import get_logger
from app.schemas.findings import Finding
from app.services.interfaces import LLMAdapter

logger = get_logger(__name__)
settings = get_settings()

DEFAULT_TIMEOUT = settings.AGENT_TIMEOUT_SECONDS

# JSON schema for structured findings output from coding LLMs
FINDINGS_SCHEMA = {
    "type": "array",
    "items": {
        "type": "object",
        "properties": {
            "file_path": {"type": "string"},
            "line_number": {"type": "integer"},
            "severity": {"type": "string", "enum": ["critical", "high", "medium", "low", "info"]},
            "agent": {"type": "string"},
            "message": {"type": "string"},
            "suggested_code": {"type": "string"},
            "confidence": {"type": "number", "minimum": 0, "maximum": 1}
        },
        "required": ["file_path", "line_number", "severity", "agent", "message", "confidence"]
    }
}

# Model-specific configurations for coding LLMs
# Optimized for HF Inference Providers (chat completions endpoint)
CODING_MODEL_CONFIGS = {
    "deepseek-ai/deepseek-coder-6.7b-instruct": {
        "max_new_tokens": 4096,
        "temperature": 0.05,
        "top_p": 0.9,
    },
    "deepseek-ai/deepseek-coder-33b-instruct": {
        "max_new_tokens": 4096,
        "temperature": 0.05,
        "top_p": 0.9,
    },
    "codellama/CodeLlama-13b-Instruct-hf": {
        "max_new_tokens": 2048,
        "temperature": 0.1,
        "top_p": 0.9,
    },
    "codellama/CodeLlama-34b-Instruct-hf": {
        "max_new_tokens": 2048,
        "temperature": 0.1,
        "top_p": 0.9,
    },
    "bigcode/starcoder2-7b": {
        "max_new_tokens": 2048,
        "temperature": 0.2,
        "top_p": 0.9,
    },
    "bigcode/starcoder2-15b": {
        "max_new_tokens": 2048,
        "temperature": 0.2,
        "top_p": 0.9,
    },
}


class LLMRequestError(Exception):
    """Raised when LLM request fails."""


def _retry_decorator():
    return retry(
        reraise=True,
        retry=retry_if_exception_type((httpx.HTTPError, LLMRequestError)),
        stop=stop_after_attempt(5),  # Increased from 3 to 5 attempts
        wait=wait_exponential(multiplier=2, min=2, max=60),  # Wait up to 60s for rate limits
    )


class BaseHTTPAdapter(LLMAdapter):
    """Common HTTP logic for LLM adapters."""

    def __init__(self, base_url: str, api_key: Optional[str] = None):
        self.base_url = base_url
        self.api_key = api_key
        self.client = httpx.AsyncClient(timeout=DEFAULT_TIMEOUT)

    @_retry_decorator()
    async def analyze(self, prompt: str, options: Dict[str, Any] | None = None) -> List[Finding]:
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        payload = {"prompt": prompt, "options": options or {}}
        resp = await self.client.post(f"{self.base_url}/analyze", json=payload, headers=headers)
        if resp.status_code >= 400:
            raise LLMRequestError(f"LLM call failed: {resp.status_code}")
        data = resp.json()
        # Expect data["findings"] as list of Finding-compatible dicts
        return [Finding(**item) for item in data.get("findings", [])]


class LocalLLMAdapter(BaseHTTPAdapter):
    """Adapter for user-provided local LLM endpoint."""


class APIKeyLLMAdapter(BaseHTTPAdapter):
    """Adapter for user-provided API key + model endpoint."""


class HostedLLMAdapter(BaseHTTPAdapter):
    """Adapter for hosted LLM provider (Pro/Admin)."""


class GroqAdapter(LLMAdapter):
    """Adapter for Groq API (OpenAI-compatible chat completions endpoint)."""

    def __init__(
        self,
        api_key: str,
        model: str = "llama-3.3-70b-versatile",
        max_tokens: int = 2048,
        temperature: float = 0.1,
        top_p: float = 0.9,
    ):
        self.api_key = api_key
        self.model = model
        self.max_tokens = max_tokens
        self.temperature = temperature
        self.top_p = top_p
        
        # Groq uses OpenAI-compatible chat completions endpoint
        self.endpoint = "https://api.groq.com/openai/v1/chat/completions"
        
        # Groq is very fast, standard timeout is sufficient
        self.client = httpx.AsyncClient(timeout=DEFAULT_TIMEOUT)

    @_retry_decorator()
    async def analyze(self, prompt: str, options: Dict[str, Any] | None = None) -> List[Finding]:
        # Build system message with JSON schema instructions
        system_message = (
            "You are a code review assistant. Analyze the provided code and return findings as a JSON array.\n\n"
            f"JSON Schema:\n{json.dumps(FINDINGS_SCHEMA, indent=2)}\n\n"
            "Each finding must include: file_path, line_number, severity (critical/high/medium/low/info), "
            "agent, message, confidence (0.0-1.0), and optionally suggested_code.\n"
            "Return ONLY a valid JSON array, no markdown formatting or extra text."
        )
        
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        
        # Use OpenAI-compatible chat completions format
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_message},
                {"role": "user", "content": prompt}
            ],
            "max_tokens": self.max_tokens,
            "temperature": self.temperature,
            "top_p": self.top_p,
        }
        
        # Add custom options if provided
        if options:
            payload.update(options)
        
        resp = await self.client.post(self.endpoint, json=payload, headers=headers)

        # Error handling
        if resp.status_code >= 500:
            raise LLMRequestError(f"Groq server error: {resp.status_code}")
        if resp.status_code == 429:
            raise LLMRequestError("Groq rate limited (429)")
        if resp.status_code >= 400:
            error_detail = resp.text[:200]
            raise LLMRequestError(f"Groq error: {resp.status_code} - {error_detail}")

        data = resp.json()

        # Parse OpenAI-compatible response format
        generated_text = ""
        try:
            if "choices" in data and len(data["choices"]) > 0:
                message = data["choices"][0].get("message", {})
                generated_text = message.get("content", "")
            else:
                logger.warning(
                    "Unexpected Groq response format",
                    extra={"model": self.model, "keys": list(data.keys())}
                )
                generated_text = str(data)
        except (KeyError, IndexError, TypeError) as e:
            logger.warning(
                "Failed to parse Groq response structure",
                extra={"model": self.model, "error": str(e)}
            )
            generated_text = str(data)

        # Clean markdown code blocks if present
        generated_text = generated_text.strip()
        if generated_text.startswith("```json"):
            generated_text = generated_text[7:]
        if generated_text.startswith("```"):
            generated_text = generated_text[3:]
        if generated_text.endswith("```"):
            generated_text = generated_text[:-3]
        generated_text = generated_text.strip()

        # Try to parse as JSON array
        try:
            findings_data = json.loads(generated_text)
            
            if not isinstance(findings_data, list):
                logger.warning(
                    "Groq model returned non-array JSON, wrapping in list",
                    extra={"model": self.model, "type": type(findings_data).__name__}
                )
                findings_data = [findings_data] if isinstance(findings_data, dict) else []
            
            # Validate and convert to Finding objects
            findings = []
            for item in findings_data:
                try:
                    finding = Finding.model_validate(item)
                    findings.append(finding)
                except Exception as val_err:
                    logger.warning(
                        "Failed to validate Groq finding",
                        extra={"model": self.model, "item": item, "error": str(val_err)}
                    )
                    continue
            
            if findings:
                logger.info(
                    "Groq analysis completed",
                    extra={"model": self.model, "findings_count": len(findings)}
                )
                return findings
            
            # If validation failed for all findings, fall through to fallback
            logger.warning(
                "All Groq findings failed validation",
                extra={"model": self.model, "raw_count": len(findings_data)}
            )
        
        except json.JSONDecodeError as e:
            logger.warning(
                "Failed to parse Groq response as JSON",
                extra={"model": self.model, "error": str(e), "text_preview": generated_text[:200]}
            )
        
        # Fallback: return a single finding with the raw response
        logger.info(
            "Groq returned non-structured response, creating fallback finding",
            extra={"model": self.model}
        )
        return [
            Finding(
                file_path="PR_SUMMARY.txt",
                line_number=1,
                severity="info",
                agent="code_review",
                message=f"LLM returned unstructured response: {generated_text[:500]}",
                confidence=0.3,
            )
        ]


class HuggingFaceInferenceAdapter(LLMAdapter):
    """Adapter for Hugging Face Inference Providers API (chat completions endpoint)."""

    def __init__(
        self,
        api_token: str,
        model: str,
        max_tokens: int = 2048,
        temperature: float = 0.1,
        top_p: float = 0.9,
    ):
        self.api_token = api_token
        self.model = model
        
        # Use model-specific config or provided params
        model_config = CODING_MODEL_CONFIGS.get(model, {})
        self.max_tokens = model_config.get("max_new_tokens", max_tokens)
        self.temperature = model_config.get("temperature", temperature)
        self.top_p = model_config.get("top_p", top_p)
        
        # HF Inference Providers uses OpenAI-compatible chat completions endpoint
        self.endpoint = "https://router.huggingface.co/v1/chat/completions"
        
        # Increase timeout for coding models (longer inference)
        self.client = httpx.AsyncClient(timeout=DEFAULT_TIMEOUT * 2)

    @_retry_decorator()
    async def analyze(self, prompt: str, options: Dict[str, Any] | None = None) -> List[Finding]:
        # Build system message with JSON schema instructions
        system_message = (
            "You are a code review assistant. Analyze the provided code and return findings as a JSON array.\n\n"
            f"JSON Schema:\n{json.dumps(FINDINGS_SCHEMA, indent=2)}\n\n"
            "Each finding must include: file_path, line_number, severity (critical/high/medium/low/info), "
            "agent, message, confidence (0.0-1.0), and optionally suggested_code.\n"
            "Return ONLY a valid JSON array, no markdown formatting or extra text."
        )
        
        headers = {
            "Authorization": f"Bearer {self.api_token}",
            "Content-Type": "application/json",
        }
        
        # Use OpenAI-compatible chat completions format
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_message},
                {"role": "user", "content": prompt}
            ],
            "max_tokens": self.max_tokens,
            "temperature": self.temperature,
            "top_p": self.top_p,
            "stream": False,
        }
        
        # Add custom options if provided
        if options:
            payload.update(options)
        
        resp = await self.client.post(self.endpoint, json=payload, headers=headers)

        # Enhanced error handling
        if resp.status_code == 504:
            raise LLMRequestError("Gateway timeout (504) - model inference took too long")
        if resp.status_code >= 500:
            raise LLMRequestError(f"HF inference server error: {resp.status_code}")
        if resp.status_code == 429:
            raise LLMRequestError("HF inference rate limited (429)")
        if resp.status_code >= 400:
            error_detail = resp.text[:200]
            raise LLMRequestError(f"HF inference error: {resp.status_code} - {error_detail}")

        data = resp.json()

        # Parse OpenAI-compatible response format
        # Response format: {"choices": [{"message": {"content": "..."}}]}
        generated_text = ""
        try:
            if "choices" in data and len(data["choices"]) > 0:
                message = data["choices"][0].get("message", {})
                generated_text = message.get("content", "")
            else:
                logger.warning(
                    "Unexpected HF response format",
                    extra={"model": self.model, "keys": list(data.keys())}
                )
                generated_text = str(data)
        except (KeyError, IndexError, TypeError) as e:
            logger.warning(
                "Failed to parse HF response structure",
                extra={"model": self.model, "error": str(e)}
            )
            generated_text = str(data)

        # Clean markdown code blocks if present
        generated_text = generated_text.strip()
        if generated_text.startswith("```json"):
            generated_text = generated_text[7:]
        if generated_text.startswith("```"):
            generated_text = generated_text[3:]
        if generated_text.endswith("```"):
            generated_text = generated_text[:-3]
        generated_text = generated_text.strip()

        # Try to parse as JSON array
        try:
            findings_data = json.loads(generated_text)
            
            if not isinstance(findings_data, list):
                logger.warning(
                    "HF model returned non-array JSON, wrapping in list",
                    extra={"model": self.model, "type": type(findings_data).__name__}
                )
                findings_data = [findings_data] if isinstance(findings_data, dict) else []
            
            # Validate and convert to Finding objects
            findings = []
            for item in findings_data:
                try:
                    finding = Finding.model_validate(item)
                    findings.append(finding)
                except Exception as e:
                    logger.warning(
                        "Failed to validate finding, skipping",
                        extra={"error": str(e), "item": item}
                    )
                    continue
            
            if findings:
                logger.info(
                    "HF inference returned structured findings",
                    extra={"model": self.model, "count": len(findings)}
                )
                return findings
            
        except json.JSONDecodeError as e:
            logger.warning(
                "HF model response not valid JSON, using fallback",
                extra={"model": self.model, "error": str(e), "response_preview": generated_text[:200]}
            )
        
        # Fallback: Best-effort single Finding with unstructured text
        logger.warning(
            "Using fallback Finding for unstructured HF response",
            extra={"model": self.model}
        )
        return [
            Finding(
                file_path="unknown",
                line_number=1,
                severity="info",
                agent="code_review",
                message=generated_text[:1000] if generated_text else "No findings generated",
                suggested_code=None,
                confidence=0.3,
            )
        ]


def get_llm_adapter(
    user_prefs: Optional[Dict[str, Any]] = None,
    user_tier: str = "free",
) -> LLMAdapter:
    """
    Select LLM adapter based on user preferences and priority order.

    Priority order (user-configurable):
    1. Local LLM URL (if user provides local_llm_url)
    2. API Key + Model (if user provides api_key and model)
    3. Hosted LLM (if user is Pro/Admin and backend has HOSTED_LLM_KEY)

    Args:
        user_prefs: User preferences dict with llm_priority, local_llm_url, api_key, model
        user_tier: User tier (free, pro, admin)

    Returns:
        LLMAdapter instance based on priority and availability

    TODO:
    - Extract user_prefs from JWT/session in production
    - Validate user-provided API keys before use
    - Add circuit breaker for production hardening
    """
    if not user_prefs:
        user_prefs = {}

    llm_priority = user_prefs.get("llm_priority", ["local", "api_key", "hosted"])
    local_llm_url = user_prefs.get("local_llm_url")
    api_key = user_prefs.get("api_key")
    model = user_prefs.get("model", "gpt-4")

    for provider in llm_priority:
        if provider == "local" and local_llm_url:
            logger.info("Using Local LLM adapter", extra={"url": local_llm_url})
            return LocalLLMAdapter(base_url=local_llm_url)

        elif provider == "api_key" and api_key:
            logger.info("Using API Key LLM adapter", extra={"model": model})
            # For OpenAI/Anthropic, use standard endpoints
            base_url = "https://api.openai.com/v1"  # Default; can be overridden
            if "claude" in model.lower():
                base_url = "https://api.anthropic.com/v1"
            return APIKeyLLMAdapter(base_url=base_url, api_key=api_key)

        elif provider == "hosted" and user_tier in ("pro", "admin"):
            # Groq API (OpenAI-compatible, free tier available)
            if settings.HOSTED_LLM_PROVIDER.lower() == "groq" and settings.GROQ_API_KEY:
                groq_model = user_prefs.get("groq_model") or settings.GROQ_MODEL
                logger.info(
                    "Using Groq API",
                    extra={"tier": user_tier, "model": groq_model},
                )
                return GroqAdapter(
                    api_key=settings.GROQ_API_KEY,
                    model=groq_model,
                    max_tokens=user_prefs.get("groq_max_tokens") or settings.GROQ_MAX_TOKENS,
                    temperature=user_prefs.get("groq_temperature") or settings.GROQ_TEMPERATURE,
                )
            
            # HF Inference Providers API (chat completions endpoint)
            if settings.HOSTED_LLM_PROVIDER.lower() == "huggingface" and settings.HF_API_TOKEN:
                # Allow user preference override for model
                hf_model = user_prefs.get("hf_model") or settings.HF_MODEL
                
                logger.info(
                    "Using Hugging Face Inference Providers API",
                    extra={"model": hf_model, "tier": user_tier},
                )
                
                return HuggingFaceInferenceAdapter(
                    api_token=settings.HF_API_TOKEN,
                    model=hf_model,
                    max_tokens=user_prefs.get("hf_max_new_tokens") or settings.HF_MAX_NEW_TOKENS,
                    temperature=user_prefs.get("hf_temperature") or settings.HF_TEMPERATURE,
                )

            if settings.HOSTED_LLM_KEY:
                logger.info(
                    "Using Hosted LLM adapter",
                    extra={"tier": user_tier, "provider": settings.HOSTED_LLM_PROVIDER},
                )
                return HostedLLMAdapter(
                    base_url="https://api.hosted-llm.example.com",
                    api_key=settings.HOSTED_LLM_KEY,
                )

    # Env-level fallback so we don't silently point to a non-existent local LLM
    if settings.GROQ_API_KEY:
        groq_model = user_prefs.get("groq_model") or settings.GROQ_MODEL
        logger.info(
            "Using Groq API (env fallback)",
            extra={"tier": user_tier, "model": groq_model},
        )
        return GroqAdapter(
            api_key=settings.GROQ_API_KEY,
            model=groq_model,
            max_tokens=user_prefs.get("groq_max_tokens") or settings.GROQ_MAX_TOKENS,
            temperature=user_prefs.get("groq_temperature") or settings.GROQ_TEMPERATURE,
        )

    if settings.HF_API_TOKEN:
        hf_model = user_prefs.get("hf_model") or settings.HF_MODEL
        logger.info(
            "Using Hugging Face Inference Providers API (env fallback)",
            extra={"model": hf_model, "tier": user_tier},
        )
        return HuggingFaceInferenceAdapter(
            api_token=settings.HF_API_TOKEN,
            model=hf_model,
            max_tokens=user_prefs.get("hf_max_new_tokens") or settings.HF_MAX_NEW_TOKENS,
            temperature=user_prefs.get("hf_temperature") or settings.HF_TEMPERATURE,
        )

    # Fallback: Local adapter with default URL
    logger.warning("No LLM provider configured; using default local adapter")
    return LocalLLMAdapter(base_url="http://localhost:11434")
