from __future__ import annotations

import hashlib
import os
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Annotated, Any

from fastapi import Depends, Request
from google.cloud.firestore import async_transactional

from shared.config import Settings, get_settings
from shared.firestore import get_firestore_client

if TYPE_CHECKING:
    from google.cloud import firestore


def hash_email(email: str) -> str:
    return hashlib.sha256(email.lower().encode()).hexdigest()


def client_ip(request: Request) -> str:
    if os.environ.get("ENV_NAME", "local") != "local":
        xff = request.headers.get("X-Forwarded-For", "")
        if xff:
            return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _compute_limit(
    existing: dict[str, Any] | None,
    now: datetime,
    limit: int,
    window_seconds: int,
) -> tuple[bool, dict[str, Any]]:
    """Pure function: return (allowed, new_doc_state) for a sliding-window counter."""
    if existing:
        window_start: datetime = existing["window_start"]
        if window_start.tzinfo is None:
            window_start = window_start.replace(tzinfo=timezone.utc)
        if (now - window_start).total_seconds() > window_seconds:
            return True, {"window_start": now, "count": 1}
        if existing["count"] >= limit:
            return False, existing
        return True, {"window_start": window_start, "count": existing["count"] + 1}
    return True, {"window_start": now, "count": 1}


@async_transactional
async def _txn_check(
    transaction: Any,
    doc_ref: Any,
    limit: int,
    window_seconds: int,
) -> bool:
    doc = await doc_ref.get(transaction=transaction)
    now = datetime.now(tz=timezone.utc)
    allowed, new_state = _compute_limit(
        doc.to_dict() if doc.exists else None, now, limit, window_seconds
    )
    if allowed:
        transaction.set(doc_ref, new_state)
    return allowed


class FirestoreRateLimiter:
    def __init__(self, db: firestore.AsyncClient) -> None:
        self._db = db

    async def check(self, key: str, limit: int, window_seconds: int) -> bool:
        doc_ref = self._db.collection("rate_limits").document(key)
        return await _txn_check(self._db.transaction(), doc_ref, limit, window_seconds)


def get_limiter(settings: Annotated[Settings, Depends(get_settings)]) -> FirestoreRateLimiter:
    return FirestoreRateLimiter(get_firestore_client(settings))
