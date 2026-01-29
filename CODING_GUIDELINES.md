# Coding Guidelines — PR Sentinel

**Enforced conventions for backend and frontend consistency.**

---

## General Principles

1. **Consistency**: Follow existing patterns in the codebase
2. **Readability**: Code is read more often than written
3. **Testability**: Write testable code; use dependency injection
4. **Security**: Never log secrets, sanitize inputs, validate all external data
5. **Documentation**: Add docstrings/JSDoc for exported functions and classes

---

## Backend (Python / FastAPI)

### Project Layout

```
backend/
├── app/
│   ├── api/
│   │   └── routes/          # API route handlers (analyze.py, jobs.py, auth.py, user.py)
│   ├── core/                # Core utilities (config.py, logging.py)
│   ├── services/            # Business logic and adapters
│   │   ├── interfaces.py    # Abstract base classes
│   │   ├── adapters/        # Concrete adapter implementations
│   │   ├── job_store.py
│   │   ├── llm_adapter.py
│   │   ├── github_adapter.py
│   │   └── langgraph_orchestrator.py
│   ├── schemas/             # Pydantic models (findings.py, jobs.py, auth.py, user.py)
│   ├── llm/
│   │   └── prompts/         # YAML prompt files for agents
│   ├── utils/               # Shared utilities (validators.py, retry.py, redaction.py)
│   └── tests/               # Pytest tests
│       ├── conftest.py      # Fixtures and DI overrides
│       ├── mocks/           # Mock adapters for testing
│       └── fixtures/        # Test data (sample_pr_diff.json, etc.)
├── scripts/                 # Seed scripts, migration scripts
├── requirements.txt
├── Dockerfile
└── pytest.ini
```

### Naming Conventions

- **Files**: `snake_case.py` (e.g., `job_store.py`, `llm_adapter.py`)
- **Classes**: `PascalCase` (e.g., `JobStore`, `LLMAdapter`, `FindingSchema`)
- **Functions/methods**: `snake_case` (e.g., `create_job`, `fetch_pr_diff`)
- **Constants**: `UPPER_SNAKE_CASE` (e.g., `MAX_FILE_COUNT`, `DEFAULT_TIMEOUT`)
- **Private methods**: `_leading_underscore` (e.g., `_validate_pr_url`)

### Code Style

- **Formatter**: Black (line length 88)
- **Import sorting**: isort (profile: black)
- **Linter**: flake8 with plugins:
  - `flake8-bugbear`
  - `flake8-comprehensions`
  - `flake8-simplify`
- **Type checker**: mypy with `--strict` for core modules (`app/core/`, `app/services/`)

Run formatters before commit:
```bash
black app/
isort app/
flake8 app/
mypy app/core/ app/services/
```

### Type Hints

- Add type hints to **all function signatures** (parameters and return types)
- Use `typing` module for complex types (`List`, `Dict`, `Optional`, `Union`, `Literal`)
- Use Pydantic models for structured data
- Example:
  ```python
  from typing import List, Optional
  from app.schemas.findings import FindingSchema

  async def analyze_pr(
      pr_url: str,
      agents: List[str],
      timeout: Optional[int] = None
  ) -> List[FindingSchema]:
      ...
  ```

### Async Best Practices

- Use `async`/`await` for I/O-bound operations (HTTP calls, database queries)
- Avoid blocking calls in async functions (use `asyncio.to_thread` if necessary)
- Use `asyncio.gather` for concurrent tasks
- Example:
  ```python
  async def fetch_multiple_prs(pr_urls: List[str]) -> List[Dict]:
      tasks = [github_adapter.fetch_pr_diff(url) for url in pr_urls]
      return await asyncio.gather(*tasks)
  ```

### Error Handling

- Raise custom exceptions with clear messages (e.g., `InvalidPRUrlError`, `RateLimitExceededError`)
- Use FastAPI's `HTTPException` for API errors with proper status codes
- Log errors with correlation IDs for traceability
- Example:
  ```python
  from fastapi import HTTPException, status

  if not is_valid_pr_url(pr_url):
      raise HTTPException(
          status_code=status.HTTP_400_BAD_REQUEST,
          detail={
              "error_code": "INVALID_PR_URL",
              "message": "PR URL must match pattern: https://github.com/owner/repo/pull/123"
          }
      )
  ```

### Dependency Injection

- Use FastAPI's `Depends` for dependency injection
- Override dependencies in tests via `app.dependency_overrides`
- Example:
  ```python
  from fastapi import Depends
  from app.services.llm_adapter import get_llm_adapter, LLMAdapter

  @router.post("/analyze-pr")
  async def analyze_pr(
      pr_url: str,
      llm: LLMAdapter = Depends(get_llm_adapter)
  ):
      findings = await llm.analyze(pr_url)
      return findings
  ```

### Testing

- **Framework**: pytest with pytest-asyncio
- **Structure**: Mirror `app/` structure in `tests/` (e.g., `tests/api/test_analyze.py`)
- **Fixtures**: Define reusable fixtures in `conftest.py`
- **Mocking**: Use mock adapters (e.g., `MockLLMAdapter`) for external services
- **Coverage**: Aim for >80% coverage; run `pytest --cov=app`
- **Naming**: Test functions start with `test_` (e.g., `test_analyze_pr_success`)
- Example:
  ```python
  import pytest
  from httpx import AsyncClient
  from app.main import create_app

  @pytest.mark.asyncio
  async def test_analyze_pr_invalid_url(async_client: AsyncClient):
      response = await async_client.post(
          "/api/v1/analyze-pr",
          json={"pr_url": "invalid-url"}
      )
      assert response.status_code == 400
      assert response.json()["error_code"] == "INVALID_PR_URL"
  ```

### Security

- **Never log secrets**: Use redaction utilities from `app/core/logging.py`
- **Validate all inputs**: Use Pydantic validators and regex patterns
- **Sanitize file paths**: Prevent directory traversal attacks
- **Use secure cookies**: `secure=True`, `httpOnly=True`, `sameSite='strict'`
- **Rate limiting**: Apply `slowapi` rate limiters to sensitive endpoints

### Database (MongoDB)

- Use atomic operators: `$set`, `$push`, `$inc` for concurrent writes
- Add indexes for frequently queried fields
- Use TTL indexes for auto-expiration (e.g., jobs collection)
- Example:
  ```python
  # Atomic update to append findings
  await jobs_collection.update_one(
      {"_id": job_id},
      {
          "$push": {"results": {"$each": new_findings}},
          "$set": {"last_updated": datetime.utcnow()}
      }
  )
  ```

### Documentation

- Add module-level docstrings describing responsibility
- Add function docstrings with parameters, return types, and examples
- Use Google-style docstrings:
  ```python
  def create_job(pr_url: str, user_id: str) -> str:
      """
      Create a new PR analysis job.

      Args:
          pr_url: GitHub PR URL (e.g., https://github.com/owner/repo/pull/123)
          user_id: User identifier from JWT

      Returns:
          Job ID (MongoDB ObjectId as string)

      Raises:
          InvalidPRUrlError: If PR URL is malformed
          RateLimitExceededError: If user has exceeded rate limit
      """
      ...
  ```

---

## Frontend (TypeScript / React)

### Project Layout

```
frontend-chromeExtension/
├── src/
│   ├── components/          # Reusable UI components (FindingsList, AnalyzeButton, etc.)
│   ├── pages/               # Extension pages (Popup.tsx, Options.tsx)
│   ├── extension/           # Extension-specific code
│   │   ├── background.ts    # Service worker
│   │   ├── content.ts       # Content script
│   │   ├── offscreen.ts     # Offscreen document
│   │   └── types.ts         # Chrome message types
│   ├── services/            # API client, storage utilities
│   ├── hooks/               # Custom React hooks
│   ├── utils/               # Helper functions
│   ├── constants/           # Selectors, constants
│   ├── theme.ts             # MUI theme configuration
│   ├── tests/               # Jest tests
│   │   ├── __mocks__/       # MSW handlers, chrome API mocks
│   │   └── fixtures/        # GitHub PR DOM snapshots
│   └── App.tsx
├── public/                  # Static assets (icons, manifest.json)
├── chrome-store-assets/     # Chrome Web Store assets
├── package.json
├── tsconfig.json
├── vite.config.ts
└── jest.config.js
```

### Naming Conventions

- **Files**:
  - Components: `PascalCase.tsx` (e.g., `FindingsList.tsx`, `AnalyzeButton.tsx`)
  - Utilities/services: `camelCase.ts` (e.g., `api.ts`, `storage.ts`)
  - Constants: `UPPER_SNAKE_CASE.ts` or `camelCase.ts` (e.g., `selectors.ts`)
- **Components**: `PascalCase` (e.g., `FindingsList`, `ThemeToggle`)
- **Functions/variables**: `camelCase` (e.g., `fetchJobStatus`, `jobId`)
- **Constants**: `UPPER_SNAKE_CASE` (e.g., `API_BASE_URL`, `POLL_INTERVALS`)
- **Interfaces/Types**: `PascalCase` with descriptive suffix (e.g., `FindingType`, `JobStatusResponse`)

### Code Style

- **Formatter**: Prettier (print width 100, single quotes, trailing commas)
- **Linter**: ESLint with:
  - `@typescript-eslint/eslint-plugin`
  - `eslint-plugin-react`
  - `eslint-plugin-react-hooks`
  - `eslint-plugin-jsx-a11y`
- **Security**: Ban `eval`, `new Function`, `document.write` via ESLint rules

Run formatters before commit:
```bash
npm run format  # prettier --write
npm run lint    # eslint --fix
```

### TypeScript

- **Strict mode**: Enable `strict: true` in `tsconfig.json`
- **Explicit types**: Add return types to exported functions
- **Avoid `any`**: Use `unknown` and type guards instead
- **Interfaces over types** for object shapes (prefer `interface` for extensibility)
- Example:
  ```typescript
  interface Finding {
    filePath: string;
    lineNumber: number;
    severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
    agent: string;
    message: string;
    suggestedCode?: string;
    confidence: number;
  }

  export async function fetchJobStatus(jobId: string): Promise<JobStatusResponse> {
    const response = await fetch(`${API_BASE_URL}/jobs/${jobId}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.json();
  }
  ```

### React Best Practices

- **Functional components** with hooks (no class components)
- **Custom hooks**: Extract reusable logic (e.g., `useJobPolling`, `useTheme`)
- **Memoization**: Use `useMemo` and `useCallback` for expensive computations
- **Keys**: Always provide stable `key` props in lists
- **Accessibility**: Use semantic HTML and ARIA attributes
- Example:
  ```typescript
  import React, { useState, useEffect } from 'react';

  interface Props {
    jobId: string;
  }

  export const JobStatus: React.FC<Props> = ({ jobId }) => {
    const [status, setStatus] = useState<string>('pending');

    useEffect(() => {
      const pollJob = async () => {
        const data = await fetchJobStatus(jobId);
        setStatus(data.status);
      };
      pollJob();
    }, [jobId]);

    return <div>Status: {status}</div>;
  };
  ```

### Chrome Extension Specifics

- **Manifest V3 only**: No Manifest V2 APIs
- **Service worker**: Use `chrome.runtime.sendMessage` for communication
- **Content script**: Inject UI in ShadowRoot to avoid CSS collisions
- **Typed messages**: Define TypeScript interfaces for all `chrome.runtime` messages
- Example:
  ```typescript
  // src/extension/types.ts
  export interface AnalyzeRequestMessage {
    type: 'ANALYZE_PR';
    payload: {
      prUrl: string;
      agents: string[];
    };
  }

  export interface JobStatusMessage {
    type: 'JOB_STATUS';
    payload: {
      jobId: string;
      status: string;
      findings: Finding[];
    };
  }

  export type RuntimeMessage = AnalyzeRequestMessage | JobStatusMessage;

  // background.ts
  chrome.runtime.onMessage.addListener((message: RuntimeMessage, sender, sendResponse) => {
    if (message.type === 'ANALYZE_PR') {
      handleAnalyzeRequest(message.payload);
    }
  });
  ```

### Testing

- **Framework**: Jest + React Testing Library
- **API mocking**: MSW (Mock Service Worker)
- **Chrome API mocking**: Mock `chrome.*` APIs in `__mocks__/chrome.ts`
- **DOM fixtures**: Use real GitHub PR HTML snapshots for content script tests
- **Coverage**: Aim for >80%; run `npm run test:coverage`
- **Naming**: Test files end with `.test.tsx` or `.test.ts`
- Example:
  ```typescript
  import { render, screen } from '@testing-library/react';
  import { FindingsList } from './FindingsList';

  describe('FindingsList', () => {
    it('renders findings with severity colors', () => {
      const findings = [
        { severity: 'high', message: 'Security issue', ... }
      ];
      render(<FindingsList findings={findings} />);
      expect(screen.getByText('Security issue')).toBeInTheDocument();
    });
  });
  ```

### Security

- **No eval**: Banned via ESLint rules; CI fails on violations
- **CSP compliance**: No inline scripts, no `unsafe-eval`
- **ShadowRoot**: Isolate injected UI to prevent XSS
- **Input sanitization**: Sanitize all user inputs before rendering

### Theming

- Use MUI's `ThemeProvider` with light/dark modes
- Define severity palette in `theme.ts`:
  ```typescript
  export const severityColors = {
    critical: '#D32F2F',
    high: '#F57C00',
    medium: '#FBC02D',
    low: '#1976D2',
    info: '#616161',
  };
  ```

### Documentation

- Add JSDoc comments for exported functions and components
- Include `@param`, `@returns`, and usage examples
- Example:
  ```typescript
  /**
   * Poll job status with exponential backoff.
   *
   * @param jobId - MongoDB ObjectId of the job
   * @param intervals - Array of polling intervals in ms (default: [1000, 2000, 5000, 10000])
   * @returns Promise resolving to final job status
   *
   * @example
   * const status = await pollJobStatus('507f1f77bcf86cd799439011');
   */
  export async function pollJobStatus(
    jobId: string,
    intervals: number[] = [1000, 2000, 5000, 10000]
  ): Promise<JobStatusResponse> {
    // Implementation...
  }
  ```

---

## Shared Conventions

### Git Workflow

- **Branches**: Feature branches from `main` (e.g., `feature/add-security-agent`)
- **Commits**: Use conventional commit format:
  ```
  <type>(<scope>): <subject>

  <body>

  <footer>
  ```
  - Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`
  - Example: `feat(backend): add job cancellation endpoint`
- **Pull requests**: Use `.github/PR_TEMPLATE.md`; require 1 approval

### Pre-commit Hooks

Configured in `.pre-commit-config.yaml` at repo root:
- **Backend**: Black, isort, flake8, safety (dependency vulnerability scan)
- **Frontend**: Prettier, ESLint --fix

Install hooks:
```bash
pip install pre-commit
pre-commit install
```

### Environment Variables

- **Development**: Use `.env` files (never commit to git)
- **Production**: Use Azure Key Vault (see `app/core/config.py` TODOs)
- **Validation**: Validate required env vars at startup; fail fast if missing
- **Naming**: `UPPER_SNAKE_CASE` (e.g., `GITHUB_CLIENT_ID`, `MONGO_URI`)

### Logging

- **Backend**: Structured JSON logs with correlation IDs
  ```python
  logger.info("Job created", extra={"job_id": job_id, "correlation_id": correlation_id})
  ```
- **Frontend**: Use `console.error` for errors; avoid verbose console logs in production
- **Redaction**: Never log secrets, API keys, tokens, or source code diffs

### Error Handling

- **Consistent error schemas**: Use standardized error responses (backend) and typed error objects (frontend)
- **User-friendly messages**: Provide actionable error messages
- **Correlation IDs**: Include in all error responses for debugging

---

## Code Review Checklist

Before submitting a PR, ensure:
- [ ] Code follows naming and style conventions
- [ ] Type hints (Python) / explicit types (TypeScript) added
- [ ] Tests added/updated for new functionality
- [ ] No hardcoded secrets or credentials
- [ ] No `eval`, `new Function`, or `document.write` (frontend)
- [ ] Error handling and logging added
- [ ] Documentation (docstrings/JSDoc) added for public APIs
- [ ] Pre-commit hooks pass
- [ ] `make validate` passes (lint, typecheck, tests)

---

## Tools and Commands

### Backend

```bash
# Format code
black app/
isort app/

# Lint
flake8 app/
mypy app/core/ app/services/

# Test
pytest --cov=app --cov-report=html

# Run app
uvicorn app.main:app --reload
```

### Frontend

```bash
# Format code
npm run format

# Lint
npm run lint

# Type check
npm run typecheck

# Test
npm test

# Build extension
npm run build:extension
```

### Combined (via Makefile)

```bash
make validate  # Run all linters, tests, and size checks
make dev       # Start docker-compose dev environment
make build     # Build Docker images
```

---

## References

- **FastAPI**: https://fastapi.tiangolo.com/
- **Pydantic**: https://docs.pydantic.dev/
- **LangGraph**: https://langchain-ai.github.io/langgraph/
- **React**: https://react.dev/
- **MUI**: https://mui.com/
- **Chrome Extensions**: https://developer.chrome.com/docs/extensions/
- **Manifest V3**: https://developer.chrome.com/docs/extensions/mv3/intro/

---

**End of CODING_GUIDELINES.md** — Enforce via pre-commit hooks and code review
