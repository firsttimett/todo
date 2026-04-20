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
    create_access_token,
    create_otp,
    create_refresh_token,
    validate_refresh_token,
    verify_otp,
)

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
    settings: Annotated[Settings, Depends(get_settings)],
) -> JSONResponse:
    db = get_firestore_client(settings)
    code = await create_otp(db, body.email)
    with suppress(Exception):
        await send_otp_email(body.email, code)
    # Always return 202 regardless of whether the email exists (prevents enumeration)
    return JSONResponse({"detail": "Code sent"}, status_code=status.HTTP_202_ACCEPTED)


@router.post("/auth/otp/verify")
async def otp_verify(
    body: OtpVerifyBody,
    settings: Annotated[Settings, Depends(get_settings)],
) -> JSONResponse:
    db = get_firestore_client(settings)
    user = await verify_otp(db, body.email, body.code)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired code",
        )

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
