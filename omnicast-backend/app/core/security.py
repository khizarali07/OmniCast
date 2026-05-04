import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from app.core.config import get_settings
from app.core.logger import get_logger

logger = get_logger(__name__)
_bearer = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
) -> dict:
    """
    FastAPI dependency that validates the custom JWT from the frontend.
    Returns the decoded payload (e.g. {'user_id': '...', 'email': '...'})
    """
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    settings = get_settings()

    try:
        # Decode using the shared secret
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])

        # In our custom auth, 'user_id' is the primary identifier
        if "user_id" not in payload:
            raise ValueError("Invalid payload: missing user_id")

        # Mock email if not present in JWT (to avoid breaking existing loggers)
        if "email" not in payload:
            payload["email"] = f"user_{payload['user_id'][:8]}"

        logger.info(f"[AUTH] ✓ User authenticated: {payload['email']}")
        return payload

    except jwt.ExpiredSignatureError:
        logger.warning("[AUTH] Token expired")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except Exception as exc:
        logger.error(f"[AUTH] ✗ Authentication failed: {exc}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
