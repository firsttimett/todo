from __future__ import annotations

from datetime import datetime

from pydantic import AwareDatetime, BaseModel


class User(BaseModel):
    id: str
    email: str
    name: str
    picture: str | None = None
    created_at: datetime


class OtpDocument(BaseModel):
    code_hash: str
    expires_at: AwareDatetime
    created_at: AwareDatetime


class RefreshTokenDocument(BaseModel):
    user_id: str
    expires_at: AwareDatetime
    created_at: AwareDatetime


class OtpLockoutDocument(BaseModel):
    fail_count: int
    window_start: AwareDatetime
    locked_until: AwareDatetime | None = None
