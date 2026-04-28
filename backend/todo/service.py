from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any, cast

if TYPE_CHECKING:
    from google.cloud import firestore

    from todo.schemas import CreateTodoRequest, UpdateTodoRequest

from shared.todo_models import TodoItem

MAX_FAR_FUTURE = datetime.max.replace(tzinfo=UTC)


def _todos_collection(
    db: firestore.AsyncClient, user_id: str
) -> firestore.AsyncCollectionReference:
    collection = db.collection("users").document(user_id).collection("todos")
    return cast("firestore.AsyncCollectionReference", collection)


def _todo_from_doc(doc: firestore.DocumentSnapshot) -> TodoItem:
    data = doc.to_dict() or {}
    data["id"] = doc.id
    return TodoItem.model_validate(data)


def _sorted_todos(todos: list[TodoItem]) -> list[TodoItem]:
    return sorted(
        todos,
        key=lambda todo: (
            todo.sort_order,
            todo.completed,
            todo.deadline or MAX_FAR_FUTURE,
            todo.created_at,
            todo.id,
        ),
    )


def _todo_payload(
    data: CreateTodoRequest | UpdateTodoRequest,
    *,
    for_create: bool,
) -> dict[str, Any]:
    if for_create:
        return data.model_dump(exclude_defaults=True)
    return data.model_dump(exclude_unset=True)


def _merge_todo_payload(
    existing: TodoItem | None,
    payload: dict[str, Any],
    *,
    user_id: str,
    todo_id: str | None = None,
) -> TodoItem:
    base: dict[str, Any] = {} if existing is None else existing.model_dump()
    base.update(payload)
    base["user_id"] = user_id
    if todo_id is not None:
        base["id"] = todo_id
    return TodoItem.model_validate(base)


async def list_todos(db: firestore.AsyncClient, user_id: str) -> list[TodoItem]:
    docs = _todos_collection(db, user_id).stream()
    todos = [_todo_from_doc(doc) async for doc in docs]
    return _sorted_todos(todos)


async def create_todo(
    db: firestore.AsyncClient,
    user_id: str,
    data: CreateTodoRequest,
) -> TodoItem:
    now = datetime.now(tz=UTC)
    todo_id = str(uuid.uuid4())
    payload = _todo_payload(data, for_create=True)
    payload["created_at"] = now
    payload["updated_at"] = now
    todo = _merge_todo_payload(
        None,
        payload,
        user_id=user_id,
        todo_id=todo_id,
    )
    collection = _todos_collection(db, user_id)
    await collection.document(todo_id).set(todo.model_dump())
    return todo


async def get_todo(
    db: firestore.AsyncClient,
    user_id: str,
    todo_id: str,
) -> TodoItem | None:
    doc = await _todos_collection(db, user_id).document(todo_id).get()
    if not doc.exists:
        return None
    return _todo_from_doc(doc)


async def update_todo(
    db: firestore.AsyncClient,
    user_id: str,
    todo_id: str,
    data: UpdateTodoRequest,
) -> TodoItem | None:
    ref = _todos_collection(db, user_id).document(todo_id)
    doc = await ref.get()
    if not doc.exists:
        return None

    current = _todo_from_doc(doc)
    payload = _todo_payload(data, for_create=False)
    payload["updated_at"] = datetime.now(tz=UTC)
    updated = _merge_todo_payload(
        current,
        payload,
        user_id=user_id,
        todo_id=todo_id,
    )
    await ref.set(updated.model_dump())
    return updated


async def delete_todo(
    db: firestore.AsyncClient,
    user_id: str,
    todo_id: str,
) -> bool:
    ref = _todos_collection(db, user_id).document(todo_id)
    doc = await ref.get()
    if not doc.exists:
        return False
    await ref.delete()
    return True
