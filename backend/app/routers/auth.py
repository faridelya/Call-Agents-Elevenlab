from datetime import datetime, timezone

from fastapi import APIRouter, Body, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, UnauthorizedError
from app.core.security import (
    create_access_token,
    create_refresh_token,
    hash_password,
    hash_token,
    verify_password,
)
from app.db.session import get_db
from app.dependencies import get_current_user
from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.models.base import new_uuid
from app.schemas.auth import (
    AccessTokenResponse,
    ForgotPasswordRequest,
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
    UpdateProfileRequest,
    UserResponse,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _parse_utc_iso_datetime(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """Register a new user account and return a fresh access + refresh token pair.

    Raises 409 if the email is already in use. Password must be at least 8 characters.
    """
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise ConflictError("Email already registered")

    user = User(
        id=new_uuid(),
        email=body.email,
        hashed_password=hash_password(body.password),
        full_name=body.full_name,
        company_name=body.company_name,
    )
    db.add(user)
    await db.flush()

    access_token = create_access_token(user.id)
    raw_refresh, hashed_refresh, expires_at = create_refresh_token()

    rt = RefreshToken(
        id=new_uuid(),
        user_id=user.id,
        token_hash=hashed_refresh,
        expires_at=expires_at.isoformat(),
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    db.add(rt)
    await db.commit()

    return TokenResponse(access_token=access_token, refresh_token=raw_refresh, user=UserResponse.model_validate(user))


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Authenticate with email + password and return a new access + refresh token pair.

    Updates last_login_at on success. Returns 401 on invalid credentials.
    """
    result = await db.execute(select(User).where(User.email == body.email, User.is_active == True))
    user = result.scalar_one_or_none()
    if not user or not verify_password(body.password, user.hashed_password):
        raise UnauthorizedError("Invalid email or password")

    user.last_login_at = datetime.now(timezone.utc).isoformat()

    access_token = create_access_token(user.id)
    raw_refresh, hashed_refresh, expires_at = create_refresh_token()

    rt = RefreshToken(
        id=new_uuid(),
        user_id=user.id,
        token_hash=hashed_refresh,
        expires_at=expires_at.isoformat(),
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    db.add(rt)
    await db.commit()

    return TokenResponse(access_token=access_token, refresh_token=raw_refresh, user=UserResponse.model_validate(user))


@router.post("/refresh", response_model=AccessTokenResponse)
async def refresh_token(body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    """Exchange a valid refresh token for a new access token (token rotation).

    The old refresh token is revoked and a new one is issued. Returns 401 if the
    token is expired, revoked, or not found.
    """
    token_hash = hash_token(body.refresh_token)
    now = datetime.now(timezone.utc)

    result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.token_hash == token_hash,
            RefreshToken.revoked == False,
        )
    )
    rt = result.scalar_one_or_none()

    if not rt or _parse_utc_iso_datetime(rt.expires_at) <= now:
        raise UnauthorizedError("Invalid or expired refresh token")

    # Rotate: revoke old, issue new
    rt.revoked = True

    new_raw, new_hashed, new_expires = create_refresh_token()
    new_rt = RefreshToken(
        id=new_uuid(),
        user_id=rt.user_id,
        token_hash=new_hashed,
        expires_at=new_expires.isoformat(),
        created_at=now.isoformat(),
    )
    db.add(new_rt)

    access_token = create_access_token(rt.user_id)
    await db.commit()

    return AccessTokenResponse(access_token=access_token, refresh_token=new_raw)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    body: RefreshRequest | None = Body(default=None),
    db: AsyncSession = Depends(get_db),
):
    """Revoke the supplied refresh token if present.

    The frontend may also call logout without a body during a local-only sign-out,
    so this endpoint remains intentionally tolerant and always returns 204.
    """
    if body and body.refresh_token:
        token_hash = hash_token(body.refresh_token)
        result = await db.execute(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
        rt = result.scalar_one_or_none()
        if rt:
            rt.revoked = True
            await db.commit()


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """Return the authenticated user's profile."""
    return current_user


@router.patch("/me", response_model=UserResponse)
async def update_me(
    body: UpdateProfileRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update the authenticated user's display name, company, or timezone."""
    if body.full_name is not None:
        current_user.full_name = body.full_name
    if body.company_name is not None:
        current_user.company_name = body.company_name
    if body.timezone is not None:
        current_user.timezone = body.timezone
    await db.commit()
    await db.refresh(current_user)
    return current_user


@router.post("/forgot-password", status_code=status.HTTP_204_NO_CONTENT)
async def forgot_password(body: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    """Trigger a password-reset email (stub — not implemented in dev). Always returns 204."""
    pass


@router.post("/reset-password", status_code=status.HTTP_204_NO_CONTENT)
async def reset_password(body: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    """Apply a password reset using a one-time token (stub — not implemented in dev). Always returns 204."""
    pass
