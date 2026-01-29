"""
PR Sentinel Backend — Pydantic Schemas for Authentication

Responsibility:
- Define authentication-related data models
- OAuth tokens, user info

Exported Classes:
- GitHubUser: GitHub user information from OAuth
- AuthToken: JWT authentication token response
"""

from pydantic import BaseModel, Field


class GitHubUser(BaseModel):
    """
    GitHub user information from OAuth.

    Attributes:
        id: GitHub user ID
        login: GitHub username
        name: User's display name
        email: User's email (may be null if not public)
        avatar_url: User's avatar URL
    """

    id: int = Field(..., description="GitHub user ID")
    login: str = Field(..., description="GitHub username")
    name: str | None = Field(default=None, description="User's display name")
    email: str | None = Field(default=None, description="User's email")
    avatar_url: str = Field(..., description="Avatar URL")


class AuthToken(BaseModel):
    """
    JWT authentication token response.

    Attributes:
        access_token: JWT token
        token_type: Token type (always "bearer")
        expires_in: Token expiration time in seconds
    """

    access_token: str = Field(..., description="JWT access token")
    token_type: str = Field(default="bearer", description="Token type")
    expires_in: int = Field(..., description="Token expiration in seconds")
