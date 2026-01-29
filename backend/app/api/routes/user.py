"""
PR Sentinel Backend — User Preferences Route

Responsibility:
- Handle GET /api/v1/user/prefs to retrieve user preferences
- Handle PUT /api/v1/user/prefs to update preferences
- Manage theme, LLM priority, agent settings, etc.

Exported:
- router: FastAPI APIRouter for /user endpoints
"""

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.logging import get_logger
from app.schemas.user import UserPreferences

logger = get_logger(__name__)
router = APIRouter()

# TODO: Implement user preferences storage in MongoDB
# For now, return defaults


@router.get(
    "/user/prefs",
    response_model=UserPreferences,
    summary="Get User Preferences",
    description="Retrieve user preferences (theme, LLM settings, agents enabled, etc.)",
)
async def get_user_prefs():
    """
    Get user preferences.

    TODO:
    - Extract user_id from JWT
    - Fetch preferences from database
    - Return user-specific settings

    Returns:
        UserPreferences with all user settings
    """
    logger.debug("Fetching user preferences")

    # Return defaults for now
    return UserPreferences(
        theme="dark",
        llm_priority=["local", "api_key", "hosted"],
        agents_enabled=["code_review", "security", "tests", "maintainability"],
        severity_display="all",
        job_retention_days=1,
    )


@router.put(
    "/user/prefs",
    response_model=UserPreferences,
    summary="Update User Preferences",
    description="Update user preferences",
)
async def update_user_prefs(prefs: UserPreferences):
    """
    Update user preferences.

    TODO:
    - Extract user_id from JWT
    - Validate preferences
    - Update in database
    - Return updated preferences

    Args:
        prefs: Updated preferences

    Returns:
        Updated UserPreferences
    """
    logger.info("Updating user preferences", extra={"theme": prefs.theme})

    # TODO: Persist to database

    return prefs
