"""
PR Sentinel Backend — Middleware Module

Responsibility:
- JWT token validation middleware
- Extract user_id from JWT and inject into request state
- Handle token expiry and refresh logic
- Provide dependency for extracting user_id in route handlers

Exported:
- add_auth_middleware(): Setup middleware on FastAPI app
- get_current_user_id(): Dependency to extract user_id from request
"""

from datetime import datetime, timezone
from typing import Optional

import jwt
from fastapi import HTTPException, Request, status

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)
settings = get_settings()


class JWTError(Exception):
    """JWT validation error."""

    pass


def validate_jwt_token(token: str) -> dict:
    """
    Validate JWT token and extract payload.

    Args:
        token: JWT token string

    Returns:
        Decoded JWT payload

    Raises:
        JWTError: Token is invalid, expired, or malformed
    """
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
        )
        return payload
    except jwt.ExpiredSignatureError:
        logger.warning("JWT token expired")
        raise JWTError("Token expired")
    except jwt.InvalidTokenError as e:
        logger.warning("JWT validation failed", extra={"error": str(e)})
        raise JWTError("Invalid token")


def extract_token_from_request(request: Request) -> Optional[str]:
    """
    Extract JWT token from request.

    Tries:
    1. Bearer token in Authorization header
    2. access_token cookie
    3. access_token query parameter (for extension iframe fallback)

    Args:
        request: FastAPI Request object

    Returns:
        JWT token string or None if not found
    """
    # Try Authorization header
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header[7:]

    # Try cookie
    token = request.cookies.get("access_token")
    if token:
        return token

    # Try query parameter (for iframe fallback)
    token = request.query_params.get("access_token")
    if token:
        return token

    return None


async def jwt_middleware(request: Request, call_next):
    """
    JWT token validation middleware.

    For protected routes (/api/v1/* excluding /auth/*):
    1. Extract token from request
    2. Validate token signature and expiry
    3. Extract user_id from payload
    4. Inject user_id into request state

    Args:
        request: FastAPI Request object
        call_next: Next middleware/route handler

    Returns:
        Response from next handler
    """
    # Skip CORS preflight OPTIONS requests
    if request.method == "OPTIONS":
        return await call_next(request)
    
    # Skip middleware for OAuth routes and health checks
    public_auth_paths = ["/api/v1/auth/github", "/api/v1/auth/github/callback", "/api/v1/auth/logout"]
    if request.url.path in public_auth_paths or request.url.path.startswith("/health"):
        return await call_next(request)

    # Skip for public routes
    if request.url.path in ["/docs", "/redoc", "/openapi.json"]:
        return await call_next(request)

    # For protected routes, require token
    token = extract_token_from_request(request)
    if not token:
        logger.warning("No JWT token provided", extra={"path": request.url.path})
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = validate_jwt_token(token)
        user_id = payload.get("sub")
        if not user_id:
            raise JWTError("No user_id in token")

        # Inject user_id into request state for dependency injection
        request.state.user_id = user_id
        request.state.github_username = payload.get("github_username")
        
        # Fetch and cache user tier for rate limiting
        try:
            from app.services.job_store import get_job_store
            job_store = await get_job_store()
            users_collection = job_store.db["users"]
            user = await users_collection.find_one({"gh_id": int(user_id)})
            if user:
                request.state.user_tier = user.get("tier_level", "free")
            else:
                request.state.user_tier = "free"
        except Exception as e:
            logger.warning("Failed to fetch user tier, defaulting to free", extra={"error": str(e)})
            request.state.user_tier = "free"
        
        logger.debug("JWT validated", extra={"user_id": user_id, "tier": request.state.user_tier})

    except JWTError as e:
        logger.warning("JWT validation failed", extra={"error": str(e)})
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
            headers={"WWW-Authenticate": "Bearer"},
        ) from e

    return await call_next(request)


def get_current_user_id(request: Request) -> str:
    """
    Dependency to extract current user_id from request.

    Must be used after jwt_middleware runs.

    Args:
        request: FastAPI Request object

    Returns:
        Current user_id

    Raises:
        HTTPException 401: No user_id in request state
    """
    user_id = getattr(request.state, "user_id", None)
    if not user_id:
        logger.warning("User ID not found in request state")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User ID not found. Authentication required.",
        )
    return user_id


def get_current_github_username(request: Request) -> str:
    """
    Dependency to extract current GitHub username from request.

    Must be used after jwt_middleware runs.

    Args:
        request: FastAPI Request object

    Returns:
        Current GitHub username

    Raises:
        HTTPException 401: No username in request state
    """
    username = getattr(request.state, "github_username", None)
    if not username:
        logger.warning("GitHub username not found in request state")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="GitHub username not found. Authentication required.",
        )
    return username
