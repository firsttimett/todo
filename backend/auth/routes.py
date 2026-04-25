from __future__ import annotations

import os
from contextlib import suppress
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from shared.auth import get_current_user
from shared.config import Settings, get_settings
from shared.firestore import get_firestore_client

from auth.email import send_otp_email
from auth.service import (
    clear_otp_lockout,
    create_access_token,
    create_otp,
    create_refresh_token,
    is_otp_locked,
    record_otp_failure,
    validate_refresh_token,
    verify_otp,
)
from shared.ratelimit import FirestoreRateLimiter, client_ip, get_limiter, hash_email

COOKIE_SECURE = os.environ.get("ENV_NAME", "local") != "local"

router = APIRouter()


class OtpRequestBody(BaseModel):
    email: str


class OtpVerifyBody(BaseModel):
    email: str
    code: str


@router.post("/auth/otp/request", status_code=status.HTTP_202_ACCEPTED)
async def otp_request(
    body: OtpRequestBody,
    request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
    limiter: Annotated[FirestoreRateLimiter, Depends(get_limiter)],
) -> JSONResponse:
    if not await limiter.check(f"otp_req:email:{hash_email(body.email)}", 5, 3600):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many OTP requests for this address")
    if not await limiter.check(f"otp_req:ip:{client_ip(request)}", 20, 3600):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many OTP requests from this IP")

    db = get_firestore_client(settings)
    code = await create_otp(db, body.email)
    with suppress(Exception):
        await send_otp_email(body.email, code)
    # Always return 202 regardless of whether the email exists (prevents enumeration)
    return JSONResponse({"detail": "Code sent"}, status_code=status.HTTP_202_ACCEPTED)


@router.post("/auth/otp/verify")
async def otp_verify(
    body: OtpVerifyBody,
    request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
    limiter: Annotated[FirestoreRateLimiter, Depends(get_limiter)],
) -> JSONResponse:
    if not await limiter.check(f"otp_verify:email:{hash_email(body.email)}", 10, 600):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many verification attempts")

    db = get_firestore_client(settings)

    if await is_otp_locked(db, body.email):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Account temporarily locked")

    user = await verify_otp(db, body.email, body.code)

    if not user:
        await record_otp_failure(db, body.email)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired code",
        )

    await clear_otp_lockout(db, body.email)

    refresh_token = await create_refresh_token(db, user.id, settings)
    access_token = create_access_token(user, settings)

    response = JSONResponse({"access_token": access_token, "user": user.model_dump(mode="json")})
    response.set_cookie(
        "refresh_token",
        refresh_token,
        httponly=True,
        samesite="lax",
        secure=COOKIE_SECURE,
        max_age=settings.refresh_token_expire_days * 86400,
    )
    return response


@router.get("/auth/me")
async def me(payload: Annotated[dict[str, Any], Depends(get_current_user)]) -> dict[str, Any]:
    return payload


@router.post("/auth/refresh")
async def refresh(
    request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
) -> JSONResponse:
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing refresh token",
        )

    db = get_firestore_client(settings)
    user = await validate_refresh_token(db, token, settings)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    new_refresh_token = await create_refresh_token(db, user.id, settings)
    await db.collection("refresh_tokens").document(token).delete()

    access_token = create_access_token(user, settings)

    response = JSONResponse(
        {
            "access_token": access_token,
            "user": user.model_dump(mode="json"),
        }
    )
    response.set_cookie(
        "refresh_token",
        new_refresh_token,
        httponly=True,
        samesite="lax",
        secure=COOKIE_SECURE,
        max_age=settings.refresh_token_expire_days * 86400,
    )
    return response


@router.post("/auth/logout")
async def logout() -> JSONResponse:
    response = JSONResponse({"message": "Logged out"})
    response.delete_cookie("refresh_token")
    return response
