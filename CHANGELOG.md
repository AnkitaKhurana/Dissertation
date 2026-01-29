# Changelog — PR Sentinel

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- Redis-backed distributed rate limiting for multi-instance deployments
- Azure Queue / Celery integration for background jobs (replace FastAPI BackgroundTasks)
- WebSocket support for real-time job updates (replace polling)
- User-initiated job deletion via extension UI
- Advanced agent configuration (custom prompts, model selection per agent)
- GitHub PR comment posting with findings
- Multi-repository support and organization-wide analysis
- Chrome Web Store publication

---

## [0.1.0] - 2026-01-20

### Added

#### Backend
- FastAPI application with async-first architecture
- API versioning under `/api/v1`
- Job-based PR analysis workflow:
  - `POST /api/v1/analyze-pr` - Create analysis job
  - `GET /api/v1/jobs/{job_id}` - Poll job status and results
  - `PATCH /api/v1/jobs/{job_id}/cancel` - Cancel running job
- LangGraph orchestrator integration with four agents:
  - `code_review` - Code quality and best practices
  - `security` - Security vulnerabilities
  - `tests` - Test coverage and quality
  - `maintainability` - Complexity and readability
- LLM adapter layer supporting:
  - Local LLM URLs (user-provided)
  - API keys + model selection (user-provided)
  - Hosted LLM keys (Pro tier)
- GitHub OAuth authentication for user identity
- GitHub App integration for server-side API calls
- MongoDB persistence with TTL retention:
  - Free tier: 1 day (86400s)
  - Pro/Admin tier: 5 days (432000s)
- Rate limiting with slowapi (5 req/min on analyze endpoints)
- Structured JSON logging with correlation IDs and secret redaction
- Health endpoints: `/health/live`, `/health/ready`
- Security features:
  - JWT sessions with secure cookies
  - CSRF protection
  - CORS restrictions
  - Input validation
- Docker support:
  - Multi-stage Dockerfile with health checks
  - docker-compose for local development
- Pydantic v2 schemas with validators
- YAML-based agent prompts
- Pytest test suite with mock adapters
- Database seed scripts for admin/pro users
- Index creation scripts (including TTL)

#### Frontend (Chrome Extension)
- Manifest V3 Chrome extension with strict CSP
- React + TypeScript + Vite build system
- MUI theming with light/dark mode support
- Severity color palette (critical, high, medium, low, info)
- Content script:
  - GitHub PR page detection
  - "Analyze" button injection with ShadowRoot isolation
  - Findings display with inline popups and severity icons
- Background service worker:
  - API calls with JWT management
  - Job polling with exponential backoff [1000, 2000, 5000, 10000]ms
  - Chrome message type safety
- Offscreen document support for long-running tasks
- Pages:
  - Popup: Recent jobs and quick settings
  - Options: Full preferences UI
- Session-only storage for API keys and tokens (opt-in persistence)
- Offline mode: Cache last 3 jobs
- Jest + React Testing Library test suite with MSW
- GitHub PR DOM fixtures for content script testing
- Extension build pipeline with ZIP packaging
- Size validation (< 20MB)
- ESLint rules banning `eval`, `new Function`, `document.write`

#### Documentation & Configuration
- Comprehensive README with:
  - Architecture overview
  - Local development setup
  - Azure deployment instructions
  - API documentation
  - Security and privacy notes
- CODING_GUIDELINES.md with backend and frontend conventions
- PRIVACY_POLICY.md compliant with GDPR and CCPA
- .env.example with all configuration options
- docker-compose.dev.yml for local development
- Makefile with common tasks
- Pre-commit hooks configuration:
  - Backend: Black, isort, flake8, mypy, safety
  - Frontend: Prettier, ESLint
  - Security: detect-secrets, unsafe API detection
- CODEOWNERS for module ownership
- PR_TEMPLATE.md for pull requests
- CHANGELOG.md (this file)

#### Infrastructure
- Azure deployment documentation for:
  - Azure Container Registry (ACR)
  - Azure App Service (Container)
  - Azure Container Instances (ACI)
  - Azure Key Vault integration (TODO)
- MongoDB Atlas free tier configuration
- Cosmos DB (Mongo API) production notes

### Security
- Session-only handling for user API keys and LLM URLs by default
- No logging of secrets, tokens, or source code
- Secure cookies: `secure=true`, `httpOnly=true`, `sameSite='strict'`
- Security headers: `X-Frame-Options: DENY`, strict CSP
- Input validation with Pydantic and regex patterns
- Rate limiting on analyze endpoints
- GitHub secondary rate limit handling (403 with backoff)
- Extension CSP compliance (no eval, no remote scripts)
- ShadowRoot isolation for injected UI

### Testing
- Backend: pytest with asyncio, httpx AsyncClient, mock adapters
- Frontend: Jest + React Testing Library + MSW
- Test coverage targets: >80%
- Offline testing with mocks (no LLM or GitHub API calls)
- GitHub PR DOM snapshots for extension tests

### Known Limitations & TODOs
- Background jobs use FastAPI BackgroundTasks (TODO: migrate to Celery/Azure Queue)
- Rate limiting uses in-memory storage (TODO: Redis for distributed deployments)
- Secrets in `.env` file (TODO: migrate to Azure Key Vault)
- No real-time updates (polling only; TODO: WebSocket support)
- TTL retention strategy basic (single collection; TODO: per-tier collections or scheduled cleanup)
- No user-initiated job deletion (TODO: add DELETE endpoint and UI)
- No Chrome Web Store publication (TODO: publish after testing)

---

## Semantic Versioning Guide

- **MAJOR** version (x.0.0): Incompatible API changes or breaking changes
- **MINOR** version (0.x.0): New features, backward-compatible
- **PATCH** version (0.0.x): Bug fixes, backward-compatible

### Examples
- Breaking change (e.g., change JWT format): 0.1.0 → 1.0.0
- New feature (e.g., add WebSocket support): 0.1.0 → 0.2.0
- Bug fix (e.g., fix rate limiting): 0.1.0 → 0.1.1

---

## Release Process

1. Update version in:
   - `backend/app/__init__.py`
   - `frontend-chromeExtension/package.json`
   - `frontend-chromeExtension/public/manifest.json`
2. Update CHANGELOG.md with release notes
3. Commit: `git commit -m "chore: bump version to x.y.z"`
4. Tag: `git tag -a vx.y.z -m "Release vx.y.z"`
5. Push: `git push && git push --tags`
6. Build and deploy:
   - Backend: `make deploy-acr && make deploy-app-service`
   - Extension: `make frontend-zip` and upload to Chrome Web Store

---

**For detailed commit guidelines, see CODING_GUIDELINES.md**
