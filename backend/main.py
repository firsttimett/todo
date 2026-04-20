from __future__ import annotations

from contextlib import asynccontextmanager
from typing import TYPE_CHECKING

from auth.routes import router as auth_router
from fastapi import FastAPI
from todo.routes import router as todo_router

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    yield


app = FastAPI(title="Not Now", lifespan=lifespan)

# No CORS middleware — Firebase Hosting rewrites make /api/** same-origin.
# In local dev, Vite's proxy handles /api/* → http://localhost:8080.

# Auth routes: /auth/otp/request, /auth/me, /auth/refresh, /auth/logout
app.include_router(auth_router, prefix="/api")

# Todo routes: /todos, /todos/{todo_id}
app.include_router(todo_router, prefix="/api/todo")


@app.get("/health")
@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
