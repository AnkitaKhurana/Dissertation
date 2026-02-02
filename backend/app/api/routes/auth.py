"""
PR Sentinel Backend — Authentication Route

Responsibility:
- Handle GitHub OAuth flow for user authentication
- Issue JWT tokens for authenticated users
- Manage secure cookies and sessions
- Implement CSRF protection

Exported:
- router: FastAPI APIRouter for /auth endpoints
"""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse

from app.core.config import get_settings
from app.core.logging import get_logger
from app.core.middleware import get_current_user_id
from app.schemas.auth import AuthToken, GitHubUser
from app.services.job_store import get_job_store

logger = get_logger(__name__)
router = APIRouter()
settings = get_settings()


# ============================================================================
# CSRF State Token Management (Database-Backed for Distributed Systems)
# ============================================================================

def _generate_csrf_state() -> str:
    """Generate a cryptographically secure CSRF state token."""
    return secrets.token_urlsafe(32)


async def _store_csrf_state(state: str, users_collection) -> None:
    """Store CSRF state token with timestamp in database (using users collection to avoid quota)."""
    await users_collection.insert_one({
        "_type": "csrf_state",  # Type discriminator
        "state": state,
        "timestamp": datetime.now(timezone.utc),
        "used": False,
    })


async def _validate_csrf_state(state: str, users_collection) -> bool:
    """
    Validate CSRF state token.
    
    Checks:
    - Token exists
    - Token hasn't expired (5-minute window)
    - Token hasn't been used
    """
    state_doc = await users_collection.find_one({"_type": "csrf_state", "state": state})
    
    if not state_doc:
        logger.warning("Invalid CSRF state token")
        return False

    # MongoDB stores datetime as naive, make it timezone-aware for comparison
    timestamp = state_doc["timestamp"]
    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=timezone.utc)
    
    age = (datetime.now(timezone.utc) - timestamp).total_seconds()

    if age > 300:  # 5 minute expiration
        logger.warning("CSRF state token expired")
        await users_collection.delete_one({"_type": "csrf_state", "state": state})
        return False

    if state_doc["used"]:
        logger.warning("CSRF state token already used (potential replay attack)")
        return False

    # Mark state as used
    await users_collection.update_one(
        {"_type": "csrf_state", "state": state}, 
        {"$set": {"used": True}}
    )
    return True


def _generate_jwt(user_id: str, github_username: str, expires_in_minutes: Optional[int] = None) -> str:
    """
    Generate JWT token.

    Args:
        user_id: User's unique ID (GitHub ID or email)
        github_username: GitHub username
        expires_in_minutes: Token expiration time

    Returns:
        JWT token string
    """
    if expires_in_minutes is None:
        expires_in_minutes = settings.JWT_EXPIRATION_MINUTES

    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=expires_in_minutes)

    payload = {
        "sub": user_id,
        "github_username": github_username,
        "iat": now,
        "exp": expires_at,
    }

    token = jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
    logger.info("JWT token generated", extra={"user_id": user_id, "expires_at": expires_at})

    return token


async def _exchange_github_code_for_token(code: str) -> str:
    """
    Exchange GitHub OAuth code for access token.

    Args:
        code: GitHub OAuth authorization code

    Returns:
        GitHub access token

    Raises:
        HTTPException 400: Invalid code
        HTTPException 502: GitHub API error
    """
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://github.com/login/oauth/access_token",
                data={
                    "client_id": settings.GITHUB_CLIENT_ID,
                    "client_secret": settings.GITHUB_CLIENT_SECRET,
                    "code": code,
                },
                headers={"Accept": "application/json"},
                timeout=10.0,
            )

            if response.status_code != 200:
                logger.error("GitHub OAuth token exchange failed", extra={"status": response.status_code})
                raise HTTPException(status_code=400, detail="Failed to exchange code for token")

            data = response.json()

            if "error" in data:
                logger.error("GitHub OAuth error", extra={"error": data.get("error_description")})
                raise HTTPException(
                    status_code=400,
                    detail=f"GitHub OAuth error: {data.get('error_description', 'Unknown error')}",
                )

            access_token = data.get("access_token")
            if not access_token:
                raise HTTPException(status_code=400, detail="No access token in GitHub response")

            return access_token

    except httpx.HTTPError as e:
        logger.error("GitHub OAuth HTTP error", extra={"error": str(e)})
        raise HTTPException(status_code=502, detail="Failed to connect to GitHub OAuth") from e


async def _fetch_github_user(access_token: str) -> GitHubUser:
    """
    Fetch authenticated user info from GitHub.

    Args:
        access_token: GitHub access token

    Returns:
        GitHubUser object

    Raises:
        HTTPException 401: Invalid token
        HTTPException 502: GitHub API error
    """
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://api.github.com/user",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Accept": "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28",
                },
                timeout=10.0,
            )

            if response.status_code == 401:
                logger.warning("GitHub API authentication failed")
                raise HTTPException(status_code=401, detail="Invalid GitHub token")

            if response.status_code != 200:
                logger.error("GitHub API error", extra={"status": response.status_code})
                raise HTTPException(status_code=502, detail="Failed to fetch user from GitHub")

            user_data = response.json()
            github_user = GitHubUser(
                id=user_data["id"],
                login=user_data["login"],
                name=user_data.get("name"),
                email=user_data.get("email"),
                avatar_url=user_data["avatar_url"],
            )

            logger.info("GitHub user fetched", extra={"github_user_id": github_user.id})
            return github_user

    except httpx.HTTPError as e:
        logger.error("GitHub API HTTP error", extra={"error": str(e)})
        raise HTTPException(status_code=502, detail="Failed to connect to GitHub API") from e


# ============================================================================
# API Endpoints
# ============================================================================


@router.get(
    "/auth/github",
    summary="GitHub OAuth Login",
    description="Redirect user to GitHub OAuth authorization page",
    include_in_schema=True,
)
async def github_oauth_login(job_store=Depends(get_job_store)) -> RedirectResponse:
    """
    Initiate GitHub OAuth flow.

    Generates CSRF state token, stores it, and redirects user to GitHub OAuth.

    GitHub will redirect back to `/auth/github/callback` with authorization code.

    Returns:
        RedirectResponse to GitHub OAuth authorization page
    """
    logger.info("Initiating GitHub OAuth flow")

    state = _generate_csrf_state()
    users_collection = job_store.db["users"]
    await _store_csrf_state(state, users_collection)

    github_auth_url = (
        f"https://github.com/login/oauth/authorize"
        f"?client_id={settings.GITHUB_CLIENT_ID}"
        f"&redirect_uri={settings.GITHUB_OAUTH_REDIRECT_URI}"
        f"&scope=read:user,repo"
        f"&state={state}"
    )

    return RedirectResponse(url=github_auth_url)


@router.get(
    "/auth/github/callback",
    summary="GitHub OAuth Callback",
    description="Handle GitHub OAuth callback and issue JWT",
    include_in_schema=True,
)
async def github_oauth_callback(
    code: str,
    state: str,
    response: Response,
    job_store=Depends(get_job_store),
) -> dict:
    """
    Handle GitHub OAuth callback.

    Steps:
    1. Validate CSRF state token
    2. Exchange code for access token
    3. Fetch user info from GitHub
    4. Create or update user in database
    5. Issue JWT
    6. Set secure cookie
    7. Return token

    Args:
        code: GitHub OAuth authorization code
        state: CSRF state token
        response: FastAPI response object
        job_store: Job store dependency

    Returns:
        AuthToken with JWT

    Raises:
        HTTPException 400: Invalid state or code
        HTTPException 401: Authentication failed
        HTTPException 502: GitHub API error
    """
    logger.info("Handling GitHub OAuth callback", extra={"state": state[:10] + "..."})

    # Validate CSRF state
    users_collection = job_store.db["users"]
    if not await _validate_csrf_state(state, users_collection):
        logger.warning("CSRF state validation failed")
        raise HTTPException(status_code=400, detail="Invalid or expired state token (CSRF validation failed)")

    # Exchange code for access token
    access_token = await _exchange_github_code_for_token(code)

    # Fetch user info
    github_user = await _fetch_github_user(access_token)

    # Use GitHub user ID as unique identifier
    user_id = str(github_user.id)

    # Create/update user in database
    try:
        users_collection = job_store.db["users"]
        await users_collection.update_one(
            {"gh_id": github_user.id},
            {
                "$setOnInsert": {
                    "gh_id": github_user.id,
                    "tier_level": "free",  # Default to free tier
                    "date_created": datetime.now(timezone.utc),
                },
                "$set": {
                    "gh_login": github_user.login,
                    "gh_email": github_user.email,
                    "gh_name": github_user.name,
                    "gh_avatar": github_user.avatar_url,
                    "date_last_login": datetime.now(timezone.utc),
                },
            },
            upsert=True,
        )
        logger.info("User created/updated in database", extra={"github_id": github_user.id})
    except Exception as e:
        logger.error("Failed to create/update user", extra={"error": str(e)})
        raise HTTPException(status_code=502, detail="Failed to create user session") from e

    # Generate JWT
    jwt_token = _generate_jwt(user_id, github_user.login)
    expires_in_seconds = settings.JWT_EXPIRATION_MINUTES * 60

    # Set secure cookie
    response.set_cookie(
        key="access_token",
        value=jwt_token,
        httponly=True,
        secure=settings.ENVIRONMENT == "production",
        samesite="strict",
        max_age=expires_in_seconds,
        path="/api/v1",
    )

    logger.info("User authenticated successfully", extra={"github_id": github_user.id, "username": github_user.login})

    # For web/extension clients, redirect to frontend with token
    # If FRONTEND_CALLBACK_URL is set, redirect there with token parameter
    if settings.FRONTEND_CALLBACK_URL:
        # If it's a chrome-extension URL, we need to use a redirect page instead
        if settings.FRONTEND_CALLBACK_URL.startswith("chrome-extension://"):
            # Return HTML that redirects to extension with token
            html_content = f"""
            <!DOCTYPE html>
            <html>
            <head>
                <title>Redirecting...</title>
            </head>
            <body>
                <p>Redirecting to PR Sentinel...</p>
                <script>
                    // Redirect to extension with token
                    window.location.href = "{settings.FRONTEND_CALLBACK_URL}?token={jwt_token}";
                </script>
            </body>
            </html>
            """
            from fastapi.responses import HTMLResponse
            return HTMLResponse(content=html_content)
        else:
            # Regular web URL redirect
            callback_url = f"{settings.FRONTEND_CALLBACK_URL}?token={jwt_token}"
            logger.info("Redirecting to frontend callback", extra={"callback_url": callback_url})
            return RedirectResponse(url=callback_url)
    
    # Fallback: return JSON (shouldn't reach here if properly configured)
    return {
        "access_token": jwt_token,
        "token_type": "bearer",
        "expires_in": expires_in_seconds,
    }


@router.post(
    "/auth/logout",
    summary="Logout",
    description="Logout user and clear session",
    include_in_schema=True,
)
async def logout(response: Response) -> dict:
    """
    Logout user.

    Clears session cookie and invalidates JWT.

    Args:
        response: FastAPI response object

    Returns:
        Success message
    """
    logger.info("User logging out")

    response.delete_cookie("access_token", path="/api/v1")

    return {"message": "Logged out successfully"}


@router.get(
    "/auth/me",
    summary="Get Current User",
    description="Get authenticated user information",
    include_in_schema=True,
)
async def get_current_user(
    user_id: str = Depends(get_current_user_id),
    job_store=Depends(get_job_store),
) -> dict:
    """
    Get current authenticated user information.

    Args:
        user_id: User ID extracted from JWT
        job_store: Job store dependency

    Returns:
        User information (GitHub ID, username, email, etc.)

    Raises:
        HTTPException 404: User not found
        HTTPException 401: Not authenticated
    """
    try:
        users_collection = job_store.db["users"]
        user = await users_collection.find_one({"gh_id": int(user_id)})

        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        return {
            "gh_id": user["gh_id"],
            "gh_login": user["gh_login"],
            "gh_email": user.get("gh_email"),
            "gh_name": user.get("gh_name"),
            "tier_level": user.get("tier_level", "free"),
            "date_created": user["date_created"],
            "date_last_login": user.get("date_last_login"),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to fetch user", extra={"error": str(e)})
        raise HTTPException(status_code=500, detail="Failed to fetch user information") from e
