from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from shared.config import Settings, get_settings
from shared.firestore import get_firestore_client
from shared.todo_models import TodoItem

from todo.dependencies import get_current_user_id
from todo.schemas import (
    CreateTodoRequest,
    UpdateTodoRequest,
)

router = APIRouter()


def _get_db(settings: Annotated[Settings, Depends(get_settings)]) -> Any:
    return get_firestore_client(settings)


_UserIdDep = Annotated[str, Depends(get_current_user_id)]
_DbDep = Annotated[Any, Depends(_get_db)]


@router.get("/todos", response_model=list[TodoItem])
async def list_todos(
    user_id: _UserIdDep,
    db: _DbDep,
) -> list[TodoItem]:
    from todo.service import list_todos as svc_list_todos

    return await svc_list_todos(db, user_id)


@router.post("/todos", response_model=TodoItem, status_code=status.HTTP_201_CREATED)
async def create_todo(
    data: CreateTodoRequest,
    user_id: _UserIdDep,
    db: _DbDep,
) -> TodoItem:
    from todo.service import create_todo as svc_create_todo

    return await svc_create_todo(db, user_id, data)


@router.get("/todos/{todo_id}", response_model=TodoItem)
async def get_todo(
    todo_id: str,
    user_id: _UserIdDep,
    db: _DbDep,
) -> TodoItem:
    from todo.service import get_todo as svc_get_todo

    item = await svc_get_todo(db, user_id, todo_id)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Todo not found")
    return item


@router.put("/todos/{todo_id}", response_model=TodoItem)
@router.patch("/todos/{todo_id}", response_model=TodoItem)
async def update_todo(
    todo_id: str,
    data: UpdateTodoRequest,
    user_id: _UserIdDep,
    db: _DbDep,
) -> TodoItem:
    from todo.service import update_todo as svc_update_todo

    item = await svc_update_todo(db, user_id, todo_id, data)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Todo not found")
    return item


@router.delete("/todos/{todo_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_todo(
    todo_id: str,
    user_id: _UserIdDep,
    db: _DbDep,
) -> None:
    from todo.service import delete_todo as svc_delete_todo

    deleted = await svc_delete_todo(db, user_id, todo_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Todo not found")
