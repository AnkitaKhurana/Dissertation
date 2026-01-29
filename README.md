# PR Sentinel — Multi-Agent LLM Framework for Automated GitHub Pull Request Analysis

**Production-ready prototype scaffold** for a GitHub PR multi-agent code review assistant.

## Overview

PR Sentinel provides automated, multi-agent analysis of GitHub pull requests using configurable LLM backends. The system includes:

- **Backend**: FastAPI (Python 3.11+) with async-first architecture, MongoDB persistence, LangGraph agent orchestration
- **Frontend**: Chrome Extension (Manifest V3) built with React + TypeScript + Vite + MUI
- **Agents**: Code review, security, tests, maintainability analysis
- **LLM Adapters**: Support for local LLM URLs, API keys, and hosted LLM keys (Pro tier)
- **Deployment**: Dockerized for Azure App Service / Container Instances

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Local Development Setup](#local-development-setup)
- [Running Tests](#running-tests)
- [Building for Production](#building-for-production)
- [Azure Deployment](#azure-deployment)
- [Chrome Extension Installation](#chrome-extension-installation)
- [API Documentation](#api-documentation)
- [Security & Privacy](#security--privacy)
- [Contributing](#contributing)
- [License](#license)

---

## Features

### Backend
- **API versioning**: All endpoints under `/api/v1`
- **Job-based async analysis**: Create jobs, poll for results, cancel in-flight jobs
- **LLM provider flexibility**: Local LLM, API keys (OpenAI/Anthropic), or hosted keys for Pro users
- **GitHub OAuth**: User identity via standard OAuth App
- **MongoDB/Cosmos DB**: Atlas for dev (free tier), Cosmos DB (Mongo API) for prod
- **Rate limiting**: Configurable slowapi rate limits (default 5 req/min on analyze endpoints)
- **TTL retention**: 1 day for free users, 5 days for pro/admin users
- **Health endpoints**: `/health/live` and `/health/ready` for orchestrators
- **Structured logging**: JSON logs with correlation IDs and redaction of secrets/PII
- **Security**: JWT sessions, CORS restrictions, CSRF protection, secure cookies, no secrets in logs

### Frontend (Chrome Extension)
- **Manifest V3**: Strict CSP, minimal permissions
- **Content script**: Inject "Analyze" button on GitHub PR pages with DOM fallback strategies
- **Background service worker**: Handles API calls, JWT management, job polling with exponential backoff
- **Offscreen document**: For long-running tasks (fallback to background worker if unavailable)
- **Theme support**: MUI light/dark mode with severity color palette
- **Offline mode**: Cache last 3 jobs, detect network reconnects
- **Session-only storage**: API keys and JWTs in `chrome.storage.session` by default; opt-in persistence
- **Testing**: Jest + React Testing Library + MSW with GitHub PR DOM fixtures

### Agents
- **code_review**: General code quality and best practices
- **security**: Security vulnerabilities, injection risks
- **tests**: Test coverage and quality
- **maintainability**: Complexity, readability, documentation

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                 Chrome Extension (MV3)                  │
│  Content Script → Background Worker → Backend API      │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│                   FastAPI Backend                       │
│  /api/v1/analyze-pr → Job Store (Mongo) → Orchestrator │
│  ↓                                          ↓           │
│  LangGraph Agents ← LLM Adapter ← GitHub Adapter        │
└─────────────────────────────────────────────────────────┘
                           ↓
           ┌───────────────┴───────────────┐
           │                               │
     MongoDB Atlas                   GitHub API
```

**LLM Priority Order** (user-configurable):
1. Local LLM URL (user-provided)
2. API key + model (user-provided)
3. Hosted LLM keys (Pro tier only, admin/pro users seeded via seed script)

**Job Lifecycle**:
1. Extension sends PR URL to `POST /api/v1/analyze-pr`
2. Backend creates job with `status: pending`, returns `{ job_id, status_url }`
3. Background task runs LangGraph orchestrator (agents write partial results to job store)
4. Extension polls `GET /api/v1/jobs/{job_id}` with exponential backoff `[1000, 2000, 5000, 10000]ms`
5. Results displayed inline on GitHub PR page with severity icons and suggested fixes

**TTL Retention Strategy**:
- **Free users**: Jobs expire after 1 day (86400s)
- **Pro/Admin users**: Jobs expire after 5 days (432000s)
- Implementation: MongoDB TTL index on `createdAt` field with `expireAfterSeconds`
- **TODO**: Implement per-tier TTL via separate collections or background cleanup job (see `scripts/create_indexes.py`)

---

## Prerequisites

- **Backend**:
  - Python 3.11+
  - Docker & Docker Compose
  - MongoDB Atlas free tier account (or local MongoDB)
  - GitHub OAuth App credentials
  - GitHub App token for server-side API calls
  - (Optional) Azure account for deployment

- **Frontend**:
  - Node.js 18+ and npm
  - Chrome browser (for extension development)

- **Development Tools**:
  - Make (optional but recommended)
  - Git

---

## Local Development Setup

### 1. Clone Repository

```bash
git clone <repository-url>
cd pr-sentinel
```

### 2. Backend Setup

```bash
cd backend

# Create virtual environment
python3.11 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Copy environment template
cp .env.example .env

# Edit .env with your credentials:
# - GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET (OAuth App)
# - GITHUB_APP_TOKEN (GitHub App installation token)
# - MONGO_URI (MongoDB Atlas connection string)
# - JWT_SECRET (generate with: openssl rand -hex 32)
# - HOSTED_LLM_KEY (optional, for Pro users)
```

### 3. Frontend Setup

```bash
cd ../frontend-chromeExtension

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with backend URL (default: http://localhost:8000)
```

### 4. Run with Docker Compose (Recommended)

```bash
# From project root
docker-compose -f docker-compose.dev.yml up --build

# Services:
# - Backend: http://localhost:8000
# - Mongo: localhost:27017
# - Frontend dev server: http://localhost:5173
```

### 5. Seed Admin/Pro Users

```bash
cd backend
python scripts/seed_users.py

# Seeds example admin and pro users (edit script to customize)
```

### 6. Create Database Indexes

```bash
cd backend
python scripts/create_indexes.py

# Creates TTL index on jobs collection
```

### 7. Load Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select `frontend-chromeExtension/dist` directory
5. Pin the extension icon for easy access

---

## Running Tests

### Backend Tests

```bash
cd backend

# Run all tests with coverage
pytest --cov=app --cov-report=html

# Run specific test file
pytest app/tests/test_analyze.py -v

# Run with verbose logging
pytest -v -s
```

Tests use mock adapters (`MockLLMAdapter`, `MockGitHubAdapter`) for 100% offline execution.

### Frontend Tests

```bash
cd frontend-chromeExtension

# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test
npm test -- FindingsList.test.tsx
```

Tests use MSW (Mock Service Worker) for API mocking and GitHub PR DOM fixtures.

---

## Building for Production

### Backend

```bash
cd backend

# Build Docker image
docker build -t pr-sentinel-backend:latest .

# Run container
docker run -p 8000:8000 --env-file .env pr-sentinel-backend:latest
```

### Frontend (Chrome Extension)

```bash
cd frontend-chromeExtension

# Build extension
npm run build:extension

# Create ZIP for Chrome Web Store
npm run zip:extension

# Output: dist/pr-sentinel-extension.zip (< 20MB)
```

### Validate Build

```bash
# From project root
make validate

# Runs:
# - Backend: black, isort, flake8, mypy, pytest
# - Frontend: prettier, eslint, tsc, jest
# - Extension size check (< 20MB)
```

---

## Azure Deployment

### Prerequisites

- Azure CLI installed and authenticated: `az login`
- Azure Container Registry (ACR) created
- Azure for Students credits or pay-as-you-go subscription

### 1. Build and Push to ACR

```bash
# Set variables
ACR_NAME="prsentinelacr"
RESOURCE_GROUP="pr-sentinel-rg"
IMAGE_NAME="pr-sentinel-backend"
TAG="latest"

# Build and push (single command)
az acr build \
  --registry $ACR_NAME \
  --resource-group $RESOURCE_GROUP \
  --image $IMAGE_NAME:$TAG \
  --file backend/Dockerfile \
  backend/
```

### 2. Deploy to Azure App Service (Container)

```bash
# Create App Service Plan (Linux, B1 tier)
az appservice plan create \
  --name pr-sentinel-plan \
  --resource-group $RESOURCE_GROUP \
  --is-linux \
  --sku B1

# Create Web App from ACR image
az webapp create \
  --name pr-sentinel-api \
  --resource-group $RESOURCE_GROUP \
  --plan pr-sentinel-plan \
  --deployment-container-image-name $ACR_NAME.azurecr.io/$IMAGE_NAME:$TAG

# Configure environment variables
az webapp config appsettings set \
  --name pr-sentinel-api \
  --resource-group $RESOURCE_GROUP \
  --settings \
    GITHUB_CLIENT_ID="<your-client-id>" \
    GITHUB_CLIENT_SECRET="@Microsoft.KeyVault(SecretUri=https://<vault>.vault.azure.net/secrets/github-client-secret/)" \
    MONGO_URI="@Microsoft.KeyVault(SecretUri=https://<vault>.vault.azure.net/secrets/mongo-uri/)" \
    JWT_SECRET="@Microsoft.KeyVault(SecretUri=https://<vault>.vault.azure.net/secrets/jwt-secret/)"

# Enable continuous deployment from ACR
az webapp deployment container config \
  --name pr-sentinel-api \
  --resource-group $RESOURCE_GROUP \
  --enable-cd true
```

### 3. Alternative: Deploy to Azure Container Instances (ACI)

```bash
# For simpler workloads without auto-scaling
az container create \
  --name pr-sentinel-backend \
  --resource-group $RESOURCE_GROUP \
  --image $ACR_NAME.azurecr.io/$IMAGE_NAME:$TAG \
  --cpu 2 \
  --memory 4 \
  --registry-login-server $ACR_NAME.azurecr.io \
  --registry-username <username> \
  --registry-password <password> \
  --ports 8000 \
  --dns-name-label pr-sentinel-api \
  --environment-variables \
    GITHUB_CLIENT_ID="<your-client-id>"
```

### 4. Azure Key Vault Setup (Production)

**TODO**: Replace `.env` file with Azure Key Vault for production secrets.

```bash
# Create Key Vault
az keyvault create \
  --name pr-sentinel-kv \
  --resource-group $RESOURCE_GROUP \
  --location eastus

# Add secrets
az keyvault secret set --vault-name pr-sentinel-kv --name github-client-secret --value "<secret>"
az keyvault secret set --vault-name pr-sentinel-kv --name mongo-uri --value "<connection-string>"
az keyvault secret set --vault-name pr-sentinel-kv --name jwt-secret --value "<jwt-secret>"

# Grant App Service access to Key Vault
# (Enable managed identity on App Service, then grant Key Vault access)
```

**Code changes required**:
- Update `app/core/config.py` to use `azure-identity` and `azure-keyvault-secrets`
- Replace `os.getenv()` calls with Key Vault SDK calls
- See `app/core/config.py` TODOs for implementation guidance

### 5. Scale and Zero-Downtime Deployments

```bash
# Scale out (add instances)
az appservice plan update \
  --name pr-sentinel-plan \
  --resource-group $RESOURCE_GROUP \
  --number-of-workers 3

# Create staging slot for zero-downtime deployments
az webapp deployment slot create \
  --name pr-sentinel-api \
  --resource-group $RESOURCE_GROUP \
  --slot staging

# Deploy to staging, test, then swap
az webapp deployment slot swap \
  --name pr-sentinel-api \
  --resource-group $RESOURCE_GROUP \
  --slot staging
```

### 6. Monitoring and Logs

```bash
# Stream logs
az webapp log tail \
  --name pr-sentinel-api \
  --resource-group $RESOURCE_GROUP

# Enable Application Insights (TODO)
# Add azure-monitor-opentelemetry to backend and configure
```

### Resource Limits and Recommendations

- **App Service B1**: 1 core, 1.75GB RAM (minimum for prototype)
- **App Service P1V2**: 1 core, 3.5GB RAM (recommended for production)
- **ACI**: 2 CPU, 4GB RAM (cost-effective for low-traffic scenarios)
- **Cosmos DB**: Serverless mode for dev/staging, provisioned throughput for prod
- **Azure for Students**: $100 credit (suitable for 3-6 months of prototype hosting on B1)

---

## Chrome Extension Installation

### Development Mode (Load Unpacked)

1. Build extension: `cd frontend-chromeExtension && npm run build:extension`
2. Open Chrome: `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select `frontend-chromeExtension/dist` directory
6. Navigate to any GitHub PR page to see "Analyze" button

### Chrome Web Store Submission (Production)

See `chrome-store-assets/SUBMISSION_CHECKLIST.md` for detailed steps.

**Required assets** (in `chrome-store-assets/`):
- Icon: 128x128, 48x48, 16x16 PNG
- Screenshots: 1280x800 or 640x400 PNG (min 1, max 5)
- Promotional tile: 440x280 PNG (optional)
- Privacy policy: Link to hosted `PRIVACY_POLICY.md`

**Permission Justifications** (required by Chrome Web Store):

| Permission | Justification |
|------------|---------------|
| `activeTab` | Required to inject content script and Analyze button on GitHub PR pages. Minimal scope: only when user clicks extension icon. |
| `storage` | Required to cache job results (last 3 jobs) for offline mode and store user preferences (theme, LLM settings). Uses `chrome.storage.local` and `chrome.storage.session`. |
| `identity` | Required for GitHub OAuth login flow. Uses `chrome.identity.launchWebAuthFlow` for secure token exchange. |
| Host permission: `https://github.com/*` | Required to detect GitHub PR pages and inject content script. Does not access other domains. |
| Host permission: `https://<backend-url>/*` | Required for API calls to backend. User-configurable in Options page. |

**CSP Rationale**:
```
"content_security_policy": {
  "extension_pages": "script-src 'self'; object-src 'self'; connect-src https://github.com https://<backend-url>"
}
```
- `script-src 'self'`: No inline scripts, no eval, no remote code loading
- `connect-src`: Restrict network calls to GitHub and backend only

---

## API Documentation

### Base URL

- **Local**: `http://localhost:8000/api/v1`
- **Production**: `https://<your-app-service>.azurewebsites.net/api/v1`

### OpenAPI Spec

Available at `/docs` (Swagger UI) and `/redoc` (ReDoc).

### Authentication

All endpoints (except `/health/*`) require JWT in `Authorization: Bearer <token>` header.

Obtain JWT via GitHub OAuth flow:
1. Extension redirects user to `GET /api/v1/auth/github`
2. User authorizes GitHub OAuth App
3. Backend exchanges code for GitHub token, creates user session, returns JWT
4. Extension stores JWT in `chrome.storage.session`

### Endpoints

#### `POST /api/v1/analyze-pr`

Create a new PR analysis job.

**Request**:
```json
{
  "pr_url": "https://github.com/owner/repo/pull/123",
  "agents_requested": ["code_review", "security"],
  "sync": false,
  "idempotency_key": "optional-client-key"
}
```

**Validation**:
- `pr_url`: Must match regex `^https://github\.com/[^/]+/[^/]+/pull/\d+$`
- PRs with >500 files rejected with HTTP 413

**Response** (201):
```json
{
  "job_id": "507f1f77bcf86cd799439011",
  "status": "pending",
  "status_url": "/api/v1/jobs/507f1f77bcf86cd799439011",
  "created_at": "2026-01-20T12:00:00Z"
}
```

**Sync mode** (`sync=true`): Returns completed results immediately (recommended for PRs < 50 files).

#### `GET /api/v1/jobs/{job_id}`

Poll job status and retrieve partial results.

**Response**:
```json
{
  "job_id": "507f1f77bcf86cd799439011",
  "status": "running",
  "progress": 0.75,
  "last_updated": "2026-01-20T12:05:30Z",
  "results_so_far": [
    {
      "file_path": "src/main.py",
      "line_number": 42,
      "severity": "high",
      "agent": "security",
      "message": "Potential SQL injection vulnerability",
      "suggested_code": "Use parameterized queries",
      "confidence": 0.92
    }
  ],
  "error": null
}
```

**Status values**: `pending`, `running`, `completed`, `failed`, `cancelled`

**Polling strategy**: Exponential backoff `[1000, 2000, 5000, 10000]ms`. Use `last_updated` to skip re-renders if unchanged.

#### `PATCH /api/v1/jobs/{job_id}/cancel`

Request best-effort cancellation of a running job.

**Response** (200):
```json
{
  "job_id": "507f1f77bcf86cd799439011",
  "status": "cancelled"
}
```

#### `GET /api/v1/user/prefs`

Retrieve user preferences.

**Response**:
```json
{
  "theme": "dark",
  "llm_priority": ["local", "api_key", "hosted"],
  "agents_enabled": ["code_review", "security", "tests", "maintainability"],
  "severity_display": "all",
  "job_retention_days": 5
}
```

#### `PUT /api/v1/user/prefs`

Update user preferences.

**Request**: Same schema as GET response.

#### Health Endpoints

- `GET /health/live`: Liveness check (returns 200 if app is running)
- `GET /health/ready`: Readiness check (returns 200 if app can serve traffic; checks MongoDB connection)

### Error Response Schema

All errors return:
```json
{
  "error_code": "INVALID_PR_URL",
  "message": "PR URL must match pattern: https://github.com/owner/repo/pull/123",
  "correlation_id": "a1b2c3d4-e5f6-7890"
}
```

### Rate Limiting

- **Default**: 5 requests/minute per user on `/api/v1/analyze-pr`
- **Response** (429):
  ```json
  {
    "error_code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded",
    "retry_after": 42
  }
  ```

**TODO**: Replace in-memory rate limiter with Redis-backed distributed limiter for multi-instance deployments.

---

## Security & Privacy

### Data Handling

- **Session-only by default**: User-supplied LLM URLs and API keys stored in `chrome.storage.session` (cleared on browser restart)
- **Opt-in persistence**: User must explicitly enable "Remember my API keys" in Options page
- **No telemetry**: No analytics or tracking by default
- **No source code logging**: PR diffs and source code never logged to backend (see `app/core/logging.py` redaction utilities)

### Secrets Management

**Development**:
- `.env` file (DO NOT commit to git)
- `.env.example` provided as template

**Production**:
- **TODO**: Migrate to Azure Key Vault (see `app/core/config.py`)
- Use managed identities for App Service
- Reference secrets in App Service settings via `@Microsoft.KeyVault(SecretUri=...)`

### Security Headers

Backend applies:
- `X-Frame-Options: DENY`
- `Content-Security-Policy: default-src 'self'`
- Secure cookies: `secure=true`, `httpOnly=true`, `sameSite='strict'`

### Extension Security

- **Manifest V3**: No eval, no remote code loading, strict CSP
- **ESLint rules**: Ban `eval`, `new Function`, `document.write` (enforced in CI)
- **ShadowRoot**: All injected UI isolated to prevent CSS collisions and XSS

### CSRF Protection

State-changing endpoints (`POST`, `PUT`, `PATCH`, `DELETE`) require CSRF token in `X-CSRF-Token` header.

### Input Validation

- PR URLs validated with regex
- Pydantic models enforce schema validation
- File path sanitization to prevent directory traversal

---

## Contributing

See `CODING_GUIDELINES.md` for conventions and pre-commit hook setup.

### Pre-commit Hooks

```bash
# Install pre-commit
pip install pre-commit

# Install hooks
pre-commit install

# Run manually
pre-commit run --all-files
```

Hooks enforce:
- **Backend**: Black, isort, flake8, safety
- **Frontend**: Prettier, ESLint --fix

### Pull Request Process

1. Create feature branch from `main`
2. Make changes following coding guidelines
3. Run `make validate` to ensure tests/lints pass
4. Submit PR using `.github/PR_TEMPLATE.md`
5. Address code review feedback
6. Merge after 1 approval

See `CODEOWNERS` for module ownership.

---

## Non-goals (This Scaffold)

Explicit non-goals for this prototype scaffold:
- Real billing/payments (use tier flags only)
- Production-grade queue (use FastAPI BackgroundTasks; migrate to Celery/Azure Queue in prod)
- Multi-region HA (single-region deployment only)
- Real-time WebSocket updates (use polling with exponential backoff)

---

## License

MIT License (see LICENSE file)

---

## Troubleshooting

### Backend: MongoDB Connection Failed

- Verify `MONGO_URI` in `.env`
- Check MongoDB Atlas IP whitelist (add `0.0.0.0/0` for dev)
- Ensure network connectivity

### Extension: Analyze Button Not Appearing

- Check browser console for errors
- Verify content script loaded: `chrome://extensions/` → PR Sentinel → "Inspect views: content script"
- Ensure GitHub PR page fully loaded before injecting button

### Extension: API Calls Failing

- Verify backend URL in extension Options page
- Check backend CORS settings (`ALLOWED_ORIGINS` in `.env`)
- Ensure JWT not expired (check `chrome.storage.session`)

### Tests: `ModuleNotFoundError`

```bash
# Backend
cd backend
pip install -e .

# Frontend
cd frontend-chromeExtension
npm install
```

---

## Changelog

See `CHANGELOG.md` for version history and semantic versioning notes.

---

## Support

For issues, questions, or contributions, please open a GitHub issue or submit a PR.

**Maintainers**: See `CODEOWNERS`

---

**End of README** — Generated by PR Sentinel scaffold generator
