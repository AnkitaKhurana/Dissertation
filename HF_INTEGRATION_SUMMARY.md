# Hugging Face Inference Providers Integration

## Summary
Updated PR Sentinel to use **Hugging Face Inference Providers API** (OpenAI-compatible chat completions endpoint) instead of the legacy Inference API. This provides better reliability, structured outputs, and access to multiple coding models.

## Changes Made

### 1. LLM Adapter (`backend/app/services/llm_adapter.py`)

**Key Updates:**
- ✅ Uses HF Inference Providers endpoint: `https://router.huggingface.co/v1/chat/completions`
- ✅ OpenAI-compatible chat completions format with `messages` array
- ✅ System message with JSON schema for structured outputs
- ✅ Response parsing: `data["choices"][0]["message"]["content"]`
- ✅ Removed `repetition_penalty` (not supported in chat completions API)
- ✅ Changed `max_new_tokens` to `max_tokens` for API compatibility
- ✅ Simplified constructor (no longer needs `base_url` parameter)

**Model Configs:**
```python
CODING_MODEL_CONFIGS = {
    "deepseek-ai/deepseek-coder-6.7b-instruct": {
        "max_new_tokens": 4096,
        "temperature": 0.05,
        "top_p": 0.9,
    },
    "codellama/CodeLlama-13b-Instruct-hf": {
        "max_new_tokens": 2048,
        "temperature": 0.1,
        "top_p": 0.9,
    },
    "bigcode/starcoder2-7b": {
        "max_new_tokens": 2048,
        "temperature": 0.2,
        "top_p": 0.9,
    },
}
```

### 2. Configuration (`backend/app/core/config.py`)

**Removed:**
- ❌ `HF_API_URL` (no longer needed - using fixed router endpoint)

**Updated Defaults:**
- `HF_MODEL`: `deepseek-ai/deepseek-coder-6.7b-instruct` (better for code review)
- `HF_MAX_NEW_TOKENS`: `2048` (increased from 512 for longer PR contexts)
- `HF_TEMPERATURE`: `0.1` (decreased from 0.2 for more deterministic outputs)

### 3. Environment Template (`backend/.env.example`)

**Updated:**
```env
# Hugging Face Inference Providers API (recommended for coding models)
# Uses OpenAI-compatible chat completions: https://router.huggingface.co/v1/chat/completions
# Get token from: https://huggingface.co/settings/tokens/new
HF_API_TOKEN=hf_your_token_here
# Recommended models: deepseek-ai/deepseek-coder-6.7b-instruct (best quality), 
#                     codellama/CodeLlama-13b-Instruct-hf (balanced), 
#                     bigcode/starcoder2-7b (fastest)
HF_MODEL=deepseek-ai/deepseek-coder-6.7b-instruct
HF_MAX_NEW_TOKENS=2048
HF_TEMPERATURE=0.1
HF_USE_STREAMING=false
```

## How to Get HF Token

1. Go to https://huggingface.co/settings/tokens/new
2. Create a **fine-grained** token with **"Make calls to Inference Providers"** permissions
3. Copy the token (starts with `hf_...`)
4. Add to `backend/.env`: `HF_API_TOKEN=hf_your_token_here`

## Recommended Models

| Model | Context | Speed | Quality | Use Case |
|-------|---------|-------|---------|----------|
| `deepseek-ai/deepseek-coder-6.7b-instruct` | 4096 | Medium | ⭐⭐⭐⭐⭐ | **Best for PR reviews** |
| `deepseek-ai/deepseek-coder-33b-instruct` | 4096 | Slow | ⭐⭐⭐⭐⭐ | Large PRs, detailed analysis |
| `codellama/CodeLlama-13b-Instruct-hf` | 2048 | Fast | ⭐⭐⭐⭐ | **Balanced speed/quality** |
| `codellama/CodeLlama-34b-Instruct-hf` | 2048 | Medium | ⭐⭐⭐⭐⭐ | Complex code patterns |
| `bigcode/starcoder2-7b` | 2048 | ⚡ Fast | ⭐⭐⭐ | **Quick feedback loops** |
| `bigcode/starcoder2-15b` | 2048 | Fast | ⭐⭐⭐⭐ | Multi-language support |

## API Format Comparison

### ❌ Old API (Legacy Inference API)
```python
POST https://api-inference.huggingface.co/models/{model}
{
    "inputs": "prompt",
    "parameters": {
        "max_new_tokens": 512,
        "temperature": 0.2,
        "repetition_penalty": 1.1
    }
}
```

### ✅ New API (Inference Providers)
```python
POST https://router.huggingface.co/v1/chat/completions
{
    "model": "deepseek-ai/deepseek-coder-6.7b-instruct",
    "messages": [
        {"role": "system", "content": "You are a code review assistant..."},
        {"role": "user", "content": "Review this PR..."}
    ],
    "max_tokens": 2048,
    "temperature": 0.1,
    "top_p": 0.9
}
```

## Response Format

### OpenAI-Compatible Response
```json
{
    "choices": [
        {
            "message": {
                "content": "[{\"file_path\": \"src/main.py\", ...}]"
            }
        }
    ]
}
```

## Testing

1. **Set environment variables:**
   ```bash
   cp backend/.env.example backend/.env
   # Edit backend/.env and set HF_API_TOKEN
   ```

2. **Start backend:**
   ```bash
   docker-compose -f docker-compose.dev.yml up --build
   ```

3. **Test health endpoint:**
   ```bash
   curl http://localhost:8000/health
   ```

4. **Authenticate:**
   ```bash
   curl http://localhost:8000/api/v1/auth/github
   # Follow OAuth flow
   ```

5. **Analyze PR:**
   ```bash
   curl -X POST http://localhost:8000/api/v1/analyze-pr \
     -H "Authorization: Bearer <jwt_token>" \
     -H "Content-Type: application/json" \
     -d '{"pr_url": "https://github.com/user/repo/pull/123"}'
   ```

6. **Check logs for:**
   - ✅ "Using Hugging Face Inference Providers API"
   - ✅ "HF inference returned structured findings"
   - ❌ "Using fallback Finding for unstructured HF response" (should NOT appear if JSON works)

## Cost Considerations

**Hugging Face Inference Providers Pricing:**
- Free tier: Generous rate limits
- PRO subscribers: Higher rate limits + priority access
- Pay-as-you-go: Available for enterprise usage

**Recommended for:**
- ✅ Students (GitHub Student Developer Pack often includes HF credits)
- ✅ Open source projects (free tier sufficient)
- ✅ Small teams (PRO tier: $9/month)

## Troubleshooting

### Issue: 429 Rate Limited
**Solution:** 
- Wait 1 hour for rate limit reset
- Upgrade to HF PRO for higher limits
- Switch to smaller model (starcoder2-7b is faster)

### Issue: 504 Gateway Timeout
**Solution:**
- Model inference took too long (>120s)
- Try smaller model (CodeLlama-13b vs 34b)
- Reduce `HF_MAX_NEW_TOKENS`
- Check HF Inference API status page

### Issue: JSON Parse Failure
**Solution:**
- Check logs for "response_preview" to see raw output
- Some models may not follow JSON schema strictly
- Try DeepSeek-Coder (best at structured outputs)
- Fallback finding will be created with confidence=0.3

### Issue: "Import httpx could not be resolved"
**Solution:**
- Install dependencies: `pip install httpx tenacity`
- These errors are expected in IDE before dependencies installed
- Docker build will install from requirements.txt

## Next Steps

1. ✅ Integration complete - ready for testing
2. 🔄 Test with small PR to verify JSON output format
3. 🔄 Tune `HF_MAX_NEW_TOKENS` based on average PR size
4. 🔄 Monitor rate limits and upgrade to PRO if needed
5. 🔄 Create deployment guide (Task 18)
6. 🔄 Document troubleshooting steps (Task 19)

## References

- [HF Inference Providers Docs](https://huggingface.co/docs/inference-providers/index)
- [Chat Completions API](https://huggingface.co/docs/inference-providers/tasks/chat-completion)
- [Get HF Token](https://huggingface.co/settings/tokens/new)
- [Model Explorer](https://huggingface.co/models?pipeline_tag=text-generation&sort=trending)
