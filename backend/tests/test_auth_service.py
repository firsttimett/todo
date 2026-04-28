from __future__ import annotations

import secrets
from typing import TYPE_CHECKING, Any, cast

from auth import service

if TYPE_CHECKING:
    from google.cloud import firestore


class FakeDocumentRef:
    def __init__(self, collection: FakeCollection, doc_id: str) -> None:
        self._collection = collection
        self.id = doc_id

    async def set(self, data: dict[str, Any]) -> None:
        self._collection.storage[self.id] = dict(data)


class FakeCollection:
    def __init__(self) -> None:
        self.storage: dict[str, dict[str, Any]] = {}

    def document(self, doc_id: str) -> FakeDocumentRef:
        return FakeDocumentRef(self, doc_id)


class FakeDb:
    def __init__(self) -> None:
        self._collections: dict[str, FakeCollection] = {}

    def collection(self, name: str) -> FakeCollection:
        return self._collections.setdefault(name, FakeCollection())

    def transaction(self) -> None:
        return None


def _as_client(db: FakeDb) -> firestore.AsyncClient:
    return cast("firestore.AsyncClient", db)


async def test_create_otp_uses_bypass_for_local(monkeypatch: Any) -> None:
    monkeypatch.setenv("ENV_NAME", "local")
    monkeypatch.setenv("OTP_BYPASS_CODE", "652093")
    db = FakeDb()

    code = await service.create_otp(_as_client(db), "User@Example.com")

    assert code == "652093"
    otp_doc = db.collection("login_otps").storage["user@example.com"]
    assert otp_doc["code_hash"] == service._hash_otp("652093")


async def test_create_otp_uses_bypass_for_nonprod(monkeypatch: Any) -> None:
    monkeypatch.setenv("ENV_NAME", "nonprod")
    monkeypatch.setenv("OTP_BYPASS_CODE", "123456")
    db = FakeDb()

    code = await service.create_otp(_as_client(db), "user@example.com")

    assert code == "123456"


async def test_create_otp_ignores_bypass_for_prod(monkeypatch: Any) -> None:
    monkeypatch.setenv("ENV_NAME", "prod")
    monkeypatch.setenv("OTP_BYPASS_CODE", "652093")
    monkeypatch.setattr(secrets, "randbelow", lambda _: 7)
    db = FakeDb()

    code = await service.create_otp(_as_client(db), "user@example.com")

    assert code == "000007"


async def test_create_otp_uses_random_when_bypass_unset(monkeypatch: Any) -> None:
    monkeypatch.setenv("ENV_NAME", "local")
    monkeypatch.delenv("OTP_BYPASS_CODE", raising=False)
    monkeypatch.setattr(secrets, "randbelow", lambda _: 42)
    db = FakeDb()

    code = await service.create_otp(_as_client(db), "user@example.com")

    assert code == "000042"


async def test_create_otp_normalizes_env_name(monkeypatch: Any) -> None:
    monkeypatch.setenv("ENV_NAME", " NonProd ")
    monkeypatch.setenv("OTP_BYPASS_CODE", "234567")
    db = FakeDb()

    code = await service.create_otp(_as_client(db), "user@example.com")

    assert code == "234567"


async def test_create_otp_uses_bypass_for_non_blocked_env(monkeypatch: Any) -> None:
    monkeypatch.setenv("ENV_NAME", "staging")
    monkeypatch.setenv("OTP_BYPASS_CODE", "777777")
    db = FakeDb()

    code = await service.create_otp(_as_client(db), "user@example.com")

    assert code == "777777"
