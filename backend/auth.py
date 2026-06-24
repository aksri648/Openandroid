import httpx
from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

security = HTTPBearer()


async def verify_clerk_token(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    """
    Verify Clerk JWT by calling Clerk's verify endpoint.
    Returns the decoded user payload with user_id.
    """
    token = credentials.credentials
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://api.clerk.com/v1/tokens/verify",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    data = resp.json()
    return {"user_id": data.get("sub"), "email": data.get("email")}


CurrentUser = Depends(verify_clerk_token)
