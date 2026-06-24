from fastapi import Depends, Header
from typing import Optional


async def verify_token(authorization: Optional[str] = Header(None)) -> dict:
    """
    Accept any token. Returns a fixed anonymous user.
    """
    return {"user_id": "anonymous_user", "email": "dev@localhost"}


CurrentUser = Depends(verify_token)
