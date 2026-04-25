from __future__ import annotations

import hashlib
import inspect
from datetime import datetime, timedelta, timezone
from typing import Any

from auth import service
from shared.ratelimit import _compute_limit


# ── P0.2 — timing-safe comparison ────────────────────────────────────────────

def test_verify_otp_uses_hmac_compare_digest() -> None:
    assert "hmac.compare_digest" in inspect.getsource(service.verify_otp)


# ── _compute_limit (pure sliding-window logic) ────────────────────────────────

def test_compute_limit_first_request_allowed() -> None:
    now = datetime(2024, 1, 1, tzinfo=timezone.utc)
    allowed, state = _compute_limit(None, now, limit=5, window_seconds=3600)
    assert allowed is True
    assert state["count"] == 1
    assert state["window_start"] == now


def test_compute_limit_within_limit_allowed() -> None:
    now = datetime(2024, 1, 1, tzinfo=timezone.utc)
    existing = {"window_start": now, "count": 4}
    allowed, state = _compute_limit(existing, now + timedelta(seconds=10), 5, 3600)
    assert allowed is True
    assert state["count"] == 5


def test_compute_limit_at_limit_blocked() -> None:
    now = datetime(2024, 1, 1, tzinfo=timezone.utc)
    existing = {"window_start": now, "count": 5}
    allowed, _ = _compute_limit(existing, now + timedelta(seconds=10), 5, 3600)
    assert allowed is False


def test_compute_limit_window_resets_after_expiry() -> None:
    now = datetime(2024, 1, 1, tzinfo=timezone.utc)
    existing = {"window_start": now, "count": 5}
    after_window = now + timedelta(seconds=3601)
    allowed, state = _compute_limit(existing, after_window, 5, 3600)
    assert allowed is True
    assert state["count"] == 1
    assert state["window_start"] == after_window


# ── Fake Firestore helpers ────────────────────────────────────────────────────

class _FakeSnapshot:
    def __init__(self, doc_id: str, data: dict[str, Any] | None) -> None:
        self.id = doc_id
        self._data = data
        self.exists = data is not None

    def to_dict(self) -> dict[str, Any]:
        return dict(self._data or {})


class _FakeDocRef:
    def __init__(self, col: _FakeCol, doc_id: str) -> None:
        self._col = col
        self.id = doc_id

    async def get(self) -> _FakeSnapshot:
        return _FakeSnapshot(self.id, self._col.storage.get(self.id))

    async def set(self, data: dict[str, Any]) -> None:
        self._col.storage[self.id] = dict(data)

    async def delete(self) -> None:
        self._col.storage.pop(self.id, None)


class _FakeCol:
    def __init__(self) -> None:
        self.storage: dict[str, dict[str, Any]] = {}

    def document(self, doc_id: str) -> _FakeDocRef:
        return _FakeDocRef(self, doc_id)


class _FakeDb:
    def __init__(self) -> None:
        self._cols: dict[str, _FakeCol] = {}

    def collection(self, name: str) -> _FakeCol:
        return self._cols.setdefault(name, _FakeCol())


# ── Lockout service tests ─────────────────────────────────────────────────────

async def test_not_locked_initially() -> None:
    db: Any = _FakeDb()
    assert not await service.is_otp_locked(db, "user@example.com")


async def test_record_failure_does_not_lock_before_threshold() -> None:
    db: Any = _FakeDb()
    for _ in range(service.OTP_LOCKOUT_MAX_FAILURES - 1):
        locked = await service.record_otp_failure(db, "user@example.com")
        assert locked is False
    assert not await service.is_otp_locked(db, "user@example.com")


async def test_locks_after_max_failures() -> None:
    db: Any = _FakeDb()
    for _ in range(service.OTP_LOCKOUT_MAX_FAILURES - 1):
        await service.record_otp_failure(db, "user@example.com")
    locked = await service.record_otp_failure(db, "user@example.com")
    assert locked is True
    assert await service.is_otp_locked(db, "user@example.com")


async def test_clear_otp_lockout_unlocks() -> None:
    db: Any = _FakeDb()
    for _ in range(service.OTP_LOCKOUT_MAX_FAILURES):
        await service.record_otp_failure(db, "user@example.com")
    await service.clear_otp_lockout(db, "user@example.com")
    assert not await service.is_otp_locked(db, "user@example.com")


async def test_lockout_window_resets_old_failures() -> None:
    db: Any = _FakeDb()
    past = datetime.now(tz=timezone.utc) - timedelta(seconds=601)
    key = hashlib.sha256(b"user@example.com").hexdigest()
    # Pre-populate with near-threshold failures from outside the current window
    db.collection("otp_lockouts").storage[key] = {
        "fail_count": service.OTP_LOCKOUT_MAX_FAILURES - 1,
        "window_start": past,
        "locked_until": None,
    }
    # One more failure starts a fresh window — should not trigger lockout
    locked = await service.record_otp_failure(db, "user@example.com")
    assert locked is False
    assert not await service.is_otp_locked(db, "user@example.com")
