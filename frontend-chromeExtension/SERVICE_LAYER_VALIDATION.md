# Frontend Service Layer Validation Report

## Current Status: ⚠️ PARTIALLY WORKING - Missing JWT Integration

---

## 1. BACKEND API ENDPOINTS vs FRONTEND IMPLEMENTATION

### Backend APIs (from Postman Collection)

| Method | Endpoint | Frontend Status | Notes |
|--------|----------|-----------------|-------|
| `GET` | `/health` | ❌ NOT IMPLEMENTED | No health check |
| `GET` | `/api/v1/auth/github` | ✅ IMPLEMENTED | OAuth initiation |
| `GET` | `/api/v1/auth/me` | ✅ IMPLEMENTED | Get current user |
| `POST` | `/api/v1/auth/logout` | ✅ IMPLEMENTED | Logout endpoint |
| `POST` | `/api/v1/analyze-pr` | ✅ PARTIALLY | Missing auth headers, hardcoded PR URL |
| `GET` | `/api/v1/jobs/:job_id` | ✅ PARTIALLY | Missing job polling logic |
| `GET` | `/api/v1/jobs` | ❌ NOT IMPLEMENTED | List user jobs missing |
| `POST` | `/api/v1/jobs/:job_id/cancel` | ❌ NOT IMPLEMENTED | Cancel job missing |

---

## 2. CRITICAL ISSUES FOUND

### 🔴 Issue #1: No JWT Token Storage/Passing
**Location:** `src/services/api.ts`, `src/services/auth.ts`

**Problem:**
- Backend requires `Authorization: Bearer {{jwt_token}}` header (see Postman collection)
- Frontend auth service has `getToken()` method but it's never used
- API calls don't pass JWT token from auth service
- Auth is cookie-based but frontend doesn't handle cookies properly

**Current Code:**
```typescript
// api.ts - NO AUTH HEADERS SENT
async createJob(prUrl: string, apiHost?: string, token?: string): Promise<CreateJobResponse> {
  const base = apiHost || DEFAULT_API_BASE;
  const res = await fetch(`${base}/api/v1/analyze-pr`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),  // Token param exists but never passed!
    },
```

**Required Fix:**
- Store JWT token from auth callback
- Pass JWT token in all API calls automatically
- Or use credentials: "include" for cookie-based auth

---

### 🔴 Issue #2: Hardcoded PR URL in Analysis
**Location:** `src/App.tsx` line ~75

**Problem:**
```typescript
const result = await apiClient.createJob("https://github.com/org/repo/pull/1");
```
- PR URL is hardcoded to `/org/repo/pull/1`
- Should fetch from GitHub context when extension runs on PR page
- User has no way to specify which PR to analyze

**Required Fix:**
- Get PR URL from current GitHub page
- Extract from `window.location.href` or GitHub page DOM
- Allow manual PR URL input

---

### 🔴 Issue #3: Missing Job Polling
**Location:** `src/services/api.ts`

**Problem:**
- `getJobStatus()` exists but is never called
- App doesn't poll job status until completion
- Large PRs will timeout (user won't see progress)

**Current Code:**
```typescript
// Created but never used
async getJobStatus(jobId: string, apiHost?: string, token?: string): Promise<JobStatusResponse>
```

**Required Fix:**
- Implement polling mechanism
- Update UI with progress as job runs
- Handle timeout scenarios

---

### 🟡 Issue #4: Missing Agents Configuration
**Location:** `src/pages/Options.tsx` line ~47

**Problem:**
- UI allows selecting agents (code_review, security, tests, maintainability)
- But selected agents are NOT passed to backend
- Backend always analyzes with hardcoded agents

**Postman shows:**
```json
"agents_requested": ["code_review", "security", "tests", "maintainability"]
```

**Required Fix:**
- Pass `enabledAgents` from Options to `createJob()`
- Convert to array format expected by backend

---

### 🟡 Issue #5: Missing Error Details from Backend
**Location:** `src/services/api.ts`

**Problem:**
- Error responses don't include backend error message
- User sees "API error 400" instead of actual validation error
- Can't debug issues

**Required Fix:**
- Parse error response body
- Include `error` or `message` fields from backend

---

## 3. MISSING ENDPOINTS IMPLEMENTATION

### Missing #1: Health Check
```typescript
// Should add to apiClient:
async getHealth(apiHost?: string) {
  const res = await fetch(`${apiHost}/health`);
  return res.json();
}
```

### Missing #2: List User Jobs
```typescript
// Should add to apiClient:
async listJobs(apiHost?: string, token?: string, limit = 10, skip = 0) {
  const res = await fetch(
    `${apiHost}/api/v1/jobs?limit=${limit}&skip=${skip}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.json();
}
```

### Missing #3: Cancel Job
```typescript
// Should add to apiClient:
async cancelJob(jobId: string, apiHost?: string, token?: string) {
  const res = await fetch(
    `${apiHost}/api/v1/jobs/${jobId}/cancel`,
    { method: "POST", headers: { Authorization: `Bearer ${token}` } }
  );
  return res.json();
}
```

---

## 4. AUTHENTICATION FLOW VALIDATION

### Current Flow:
```
1. User clicks "Login with GitHub" ✅
2. Redirects to backend OAuth endpoint ✅
3. GitHub redirects back with cookie ✅
4. But... JWT token is never extracted/stored ❌
5. Subsequent API calls fail auth ❌
```

### Required Flow:
```
1. User clicks "Login with GitHub" ✅
2. Redirects to backend OAuth endpoint ✅
3. Backend returns JWT token (in URL, cookie, or response) ❌ (NOT CLEAR)
4. Frontend stores JWT token ❌ (NOT IMPLEMENTED)
5. All API calls include JWT token ❌ (NOT IMPLEMENTED)
```

**ACTION ITEM:** Clarify from backend whether JWT should be:
- In URL redirect? (e.g., `callback.html?token=xxx`)
- In Set-Cookie header?
- In response body?

---

## 5. API CLIENT CONFIGURATION

### Current Default:
```typescript
const DEFAULT_API_BASE = "https://api.example.com";
```
❌ Points to example, should use saved backend URL from Options

### Frontend saves backend URL:
```typescript
// Options.tsx line 37
const [backendUrl, setBackendUrl] = useState("http://localhost:8000/api/v1");
```
✅ Good - but api.ts never reads it

---

## 6. RECOMMENDATIONS (Priority Order)

### 🔴 CRITICAL (Blocking Functionality)
1. **Fix JWT token flow** - Implement proper token storage and passing
2. **Fix PR URL detection** - Get real PR URL from GitHub page
3. **Implement job polling** - Show progress, handle completion
4. **Pass agent selection** - Connect Options UI to backend

### 🟡 IMPORTANT (Better UX)
5. Implement job history (list/cancel endpoints)
6. Add health check before analysis
7. Better error messages from backend responses
8. Save auth state properly across extension reloads

### 🟢 NICE-TO-HAVE
9. Auto-detect when PR page loads
10. Background job monitoring
11. Retry failed jobs

---

## 7. TEST CASES

### To Validate Frontend Against Backend:

**Test 1: Login Flow**
- [ ] Click login → redirects to backend OAuth
- [ ] Returns to extension with auth
- [ ] Verify JWT token is stored
- [ ] Verify `GET /api/v1/auth/me` succeeds with JWT

**Test 2: PR Analysis**
- [ ] Extract real PR URL from GitHub page
- [ ] Submit with agent selection from Options
- [ ] Receive job_id
- [ ] Poll job status with JWT token
- [ ] Display findings when complete

**Test 3: Error Handling**
- [ ] No auth → 401 error handled gracefully
- [ ] Invalid PR URL → backend error shown to user
- [ ] Network timeout → retry or error message
- [ ] Job cancelled → status updates in UI

---

## Next Steps

1. **Immediate:** Fix JWT token integration (Issue #1)
2. **Then:** Add PR URL extraction (Issue #2)
3. **Then:** Implement job polling (Issue #3)
4. **Then:** Connect agents UI to API (Issue #4)

See implementation plan in `FRONTEND_TODO.md`
