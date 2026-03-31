"""
Clerk JWT authentication for FastAPI.

Verifies JWTs issued by Clerk using their JWKS endpoint.
Creates or updates the user record in our database on first request.
"""

import os
import jwt
import requests
from functools import lru_cache
from fastapi import Depends, Header, HTTPException
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db

CLERK_ISSUER = os.getenv("CLERK_ISSUER", "")  # e.g. https://your-app.clerk.accounts.dev
_jwks_cache: dict | None = None


def _get_jwks() -> dict:
    """Fetch and cache Clerk's JWKS (JSON Web Key Set)."""
    global _jwks_cache
    if _jwks_cache:
        return _jwks_cache
    if not CLERK_ISSUER:
        raise HTTPException(status_code=500, detail="CLERK_ISSUER not configured")
    url = f"{CLERK_ISSUER}/.well-known/jwks.json"
    resp = requests.get(url, timeout=10)
    resp.raise_for_status()
    _jwks_cache = resp.json()
    return _jwks_cache


def _decode_token(token: str) -> dict:
    """Decode and verify a Clerk JWT."""
    jwks = _get_jwks()
    # Get the signing key from JWKS
    unverified_header = jwt.get_unverified_header(token)
    kid = unverified_header.get("kid")

    key_data = None
    for key in jwks.get("keys", []):
        if key.get("kid") == kid:
            key_data = key
            break

    if not key_data:
        raise HTTPException(status_code=401, detail="Token signing key not found")

    public_key = jwt.algorithms.RSAAlgorithm.from_jwk(key_data)

    try:
        payload = jwt.decode(
            token,
            public_key,
            algorithms=["RS256"],
            issuer=CLERK_ISSUER,
            options={"verify_aud": False},  # Clerk doesn't always set aud
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")


async def get_current_user(
    authorization: str = Header(default=""),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Extract and verify the Clerk JWT, then upsert user in DB.

    Returns a dict with user info: {id, email, name, tier}.
    """
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing authorization header")

    token = authorization[7:]  # Strip "Bearer "
    payload = _decode_token(token)

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="No user ID in token")

    # Upsert user record (handle race condition from concurrent requests)
    from models import User
    from sqlalchemy.dialects.postgresql import insert as pg_insert

    email = payload.get("email", "")
    if not email and isinstance(payload.get("email_addresses"), list) and payload["email_addresses"]:
        email = payload["email_addresses"][0].get("email_address", "")
    if not email:
        email = payload.get("primary_email_address", "")

    stmt = pg_insert(User).values(
        id=user_id,
        email=email or None,
        name=payload.get("name", payload.get("first_name", "")),
        tier="free",
    ).on_conflict_do_nothing(index_elements=["id"])
    await db.execute(stmt)
    await db.commit()

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one()

    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "tier": user.tier,
    }


async def admin_required(
    user: dict = Depends(get_current_user),
) -> dict:
    """Require the authenticated user to have admin tier."""
    if user.get("tier") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


async def optional_user(
    authorization: str = Header(default=""),
    db: AsyncSession = Depends(get_db),
) -> dict | None:
    """Like get_current_user but returns None instead of 401 if no token.

    Useful for endpoints that work for both authenticated and anonymous users.
    """
    if not authorization or not authorization.startswith("Bearer "):
        return None
    try:
        return await get_current_user(authorization=authorization, db=db)
    except HTTPException:
        return None
