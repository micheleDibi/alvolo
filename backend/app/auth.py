"""Single-user authentication and rate limiting.

Auth is a shared bearer token (also accepted via the X-API-Key header so the iOS
Shortcut can attach it easily). If CAPTURE_TOKEN is empty (local dev) auth is disabled.
"""

from __future__ import annotations

import secrets

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from slowapi import Limiter
from slowapi.util import get_remote_address

from .config import settings

limiter = Limiter(key_func=get_remote_address)

_bearer = HTTPBearer(auto_error=False)


def _extract_token(
    credentials: HTTPAuthorizationCredentials | None,
    x_api_key: str | None,
) -> str | None:
    if credentials and credentials.scheme.lower() == "bearer":
        return credentials.credentials
    if x_api_key:
        return x_api_key
    return None


async def require_auth(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
) -> None:
    """Reject the request unless a valid token is supplied (no-op when auth disabled)."""
    if not settings.auth_enabled:
        return

    token = _extract_token(credentials, x_api_key)
    if not token or not secrets.compare_digest(token, settings.capture_token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing token.",
            headers={"WWW-Authenticate": "Bearer"},
        )
