from __future__ import annotations

import hashlib
import hmac
import os
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING, Any

import jwt
from google.cloud.firestore import async_transactional

if TYPE_CHECKING:
    from google.cloud import firestore
    from shared.config import Settings

from shared.auth_models import OtpDocument, OtpLockoutDocument, RefreshTokenDocument, User
from shared.ratelimit import hash_email


class OtpNotFoundError(Exception):
    """Raised by verify_otp when no OTP document exists for the email."""


USER_PROFILE_FIELDS = ("email", "name", "picture")

OTP_EXPIRE_MINUTES = 10

OTP_LOCKOUT_MAX_FAILURES = 5
OTP_LOCKOUT_WINDOW_SECONDS = 600   # 10 min
OTP_LOCKOUT_DURATION_SECONDS = 900  # 15 min


def _user_profile(data: dict[str, Any]) -> dict[str, object]:
    return {field: data.get(field) for field in USER_PROFILE_FIELDS}


def _build_user(user_id: str, profile: dict[str, object], created_at: datetime) -> User:
    return User(id=user_id, created_at=created_at, **profile)


def _hash_otp(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


async def create_otp(db: firestore.AsyncClient, email: str) -> str:
    """Generate a 6-digit OTP, store the hash in Firestore, and return the plaintext code."""
    # Only use OTP bypass code for non-production environments
    env_name = os.environ.get("ENV_NAME", "local").strip().lower()
    bypass_code = os.environ.get("OTP_BYPASS_CODE", "").strip()
    code = f"{secrets.randbelow(1_000_000):06d}"
    if not env_name.startswith("prod") and bypass_code:
        code = bypass_code
    now = datetime.now(tz=UTC)
    otp = OtpDocument(
        code_hash=_hash_otp(code),
        expires_at=now + timedelta(minutes=OTP_EXPIRE_MINUTES),
        created_at=now,
    )

    # Using email as doc ID ensures only one active OTP per email at a time
    await (
        db.collection("login_otps")
        .document(email.lower())
        .set(otp.model_dump())
    )

    return code


async def verify_otp(db: firestore.AsyncClient, email: str, code: str) -> User | None:
    """Verify OTP. Deletes the OTP record regardless of outcome (single-use).
    Returns the User on success, None on invalid/expired code.
    Raises OtpNotFoundError when no OTP was ever requested for this email —
    callers must not record a failure in that case (prevents DoS lockout)."""
    doc_ref = db.collection("login_otps").document(email.lower())
    doc = await doc_ref.get()

    if not doc.exists:
        raise OtpNotFoundError()

    otp = OtpDocument.model_validate(doc.to_dict() or {})

    # Always delete — OTPs are single-use
    await doc_ref.delete()

    if datetime.now(tz=UTC) > otp.expires_at:
        return None

    if not hmac.compare_digest(otp.code_hash.encode(), _hash_otp(code).encode()):
        return None

    return await _get_or_create_user(db, email.lower())


async def _get_or_create_user(db: firestore.AsyncClient, email: str) -> User:
    """Fetch user by email, or create a new one if first login."""
    docs = await db.collection("users").where("email", "==", email).limit(1).get()
    if docs:
        doc = docs[0]
        user_data = doc.to_dict()
        if user_data is None:
            raise RuntimeError(f"User document {doc.id!r} exists but to_dict() returned None")
        profile = _user_profile(user_data)
        return _build_user(
            doc.id, profile, user_data.get("created_at", datetime.now(tz=UTC))
        )

    user_id = str(uuid.uuid4())
    now = datetime.now(tz=UTC)
    # Derive a display name from the email prefix
    name = email.split("@")[0]
    user = User(id=user_id, email=email, name=name, picture=None, created_at=now)
    await db.collection("users").document(user_id).set(user.model_dump())
    return user


def create_access_token(user: User, settings: Settings) -> str:
    now = datetime.now(tz=UTC)
    expire = now + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {
        "sub": user.id,
        "email": user.email,
        "name": user.name,
        "picture": user.picture,
        "iss": settings.jwt_issuer,
        "aud": settings.jwt_audience,
        "iat": now,
        "exp": expire,
    }
    return str(
        jwt.encode(
            payload,
            settings.jwt_private_key,
            algorithm=settings.jwt_algorithm,
        )
    )


async def create_refresh_token(
    db: firestore.AsyncClient,
    user_id: str,
    settings: Settings,
) -> str:
    token_id = str(uuid.uuid4())
    now = datetime.now(tz=UTC)
    token = RefreshTokenDocument(
        user_id=user_id,
        expires_at=now + timedelta(days=settings.refresh_token_expire_days),
        created_at=now,
    )
    await (
        db.collection("refresh_tokens")
        .document(token_id)
        .set(token.model_dump())
    )
    return token_id


async def is_otp_locked(db: firestore.AsyncClient, email: str) -> bool:
    doc = await db.collection("otp_lockouts").document(hash_email(email)).get()
    if not doc.exists:
        return False
    lockout = OtpLockoutDocument.model_validate(doc.to_dict() or {})
    if lockout.locked_until is None:
        return False
    return datetime.now(tz=UTC) < lockout.locked_until


def _compute_lockout(
    existing: dict[str, Any] | None,
    now: datetime,
) -> tuple[dict[str, Any], bool]:
    """Pure function: returns (new_doc_state, is_now_locked) for the lockout counter."""
    if existing:
        window_start: datetime = existing["window_start"]
        if window_start.tzinfo is None:
            window_start = window_start.replace(tzinfo=UTC)
        if (now - window_start).total_seconds() > OTP_LOCKOUT_WINDOW_SECONDS:
            data: dict[str, Any] = {"fail_count": 1, "window_start": now, "locked_until": None}
        else:
            data = dict(existing)
            data["fail_count"] = data.get("fail_count", 0) + 1
            if data["fail_count"] >= OTP_LOCKOUT_MAX_FAILURES:
                data["locked_until"] = now + timedelta(seconds=OTP_LOCKOUT_DURATION_SECONDS)
    else:
        data = {"fail_count": 1, "window_start": now, "locked_until": None}
    return data, data.get("locked_until") is not None


@async_transactional
async def _txn_record_failure(transaction: Any, doc_ref: Any) -> bool:
    doc = await doc_ref.get(transaction=transaction)
    now = datetime.now(tz=UTC)
    data, locked = _compute_lockout(doc.to_dict() if doc.exists else None, now)
    transaction.set(doc_ref, data)
    return locked


async def record_otp_failure(db: firestore.AsyncClient, email: str) -> bool:
    """Atomically increment the verify-failure counter. Returns True if the account is now locked."""
    doc_ref = db.collection("otp_lockouts").document(hash_email(email))
    return await _txn_record_failure(db.transaction(), doc_ref)


async def clear_otp_lockout(db: firestore.AsyncClient, email: str) -> None:
    await db.collection("otp_lockouts").document(hash_email(email)).delete()


async def validate_refresh_token(
    db: firestore.AsyncClient,
    token: str,
) -> User | None:
    token_ref = db.collection("refresh_tokens").document(token)
    token_doc = await token_ref.get()

    if not token_doc.exists:
        return None

    refresh = RefreshTokenDocument.model_validate(token_doc.to_dict() or {})

    if datetime.now(tz=UTC) > refresh.expires_at:
        await token_ref.delete()
        return None

    user_ref = db.collection("users").document(refresh.user_id)
    user_doc = await user_ref.get()

    if not user_doc.exists:
        return None

    user_data = user_doc.to_dict()
    if user_data is None:
        raise RuntimeError(f"User document {refresh.user_id!r} exists but to_dict() returned None")
    profile = _user_profile(user_data)
    return _build_user(
        refresh.user_id,
        profile,
        user_data.get("created_at", datetime.now(tz=UTC)),
    )
