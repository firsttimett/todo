from __future__ import annotations

from typing import Annotated, Any

from fastapi import Depends
from shared.auth import get_current_user


async def get_current_user_id(
    payload: Annotated[dict[str, Any], Depends(get_current_user)],
) -> str:
    return str(payload["sub"])
