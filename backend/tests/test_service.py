from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from todo.schemas import CreateTodoRequest, UpdateTodoRequest
from todo.service import create_todo, list_todos, update_todo

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator


class FakeSnapshot:
    def __init__(self, doc_id: str, data: dict[str, Any] | None) -> None:
        self.id = doc_id
        self._data = data
        self.exists = data is not None

    def to_dict(self) -> dict[str, Any]:
        return dict(self._data or {})


class FakeDocumentRef:
    def __init__(self, collection: FakeCollection, doc_id: str) -> None:
        self._collection = collection
        self.id = doc_id

    async def set(self, data: dict[str, Any]) -> None:
        self._collection.storage[self.id] = dict(data)

    async def get(self) -> FakeSnapshot:
        return FakeSnapshot(self.id, self._collection.storage.get(self.id))

    async def delete(self) -> None:
        self._collection.storage.pop(self.id, None)


class FakeCollection:
    def __init__(self) -> None:
        self.storage: dict[str, dict[str, Any]] = {}
        self.stream_docs: list[FakeSnapshot] = []

    def document(self, doc_id: str) -> FakeDocumentRef:
        return FakeDocumentRef(self, doc_id)

    async def stream(self) -> AsyncGenerator[FakeSnapshot, None]:
        docs = self.stream_docs or [
            FakeSnapshot(doc_id, data) for doc_id, data in self.storage.items()
        ]
        for doc in docs:
            yield doc


class FakeDb:
    def __init__(self) -> None:
        self._store: dict[str, dict[str, FakeCollection]] = {}

    def collection(self, name: str) -> _FakeUserLevel:
        assert name == "users"
        return _FakeUserLevel(self._store)

    def get_collection(self, user_id: str, name: str) -> FakeCollection:
        return self._store.setdefault(user_id, {}).setdefault(name, FakeCollection())


class _FakeUserLevel:
    def __init__(self, store: dict[str, dict[str, FakeCollection]]) -> None:
        self._store = store

    def document(self, user_id: str) -> _FakeDocLevel:
        return _FakeDocLevel(self._store, user_id)


class _FakeDocLevel:
    def __init__(self, store: dict[str, dict[str, FakeCollection]], user_id: str) -> None:
        self._store = store
        self._user_id = user_id

    def collection(self, name: str) -> FakeCollection:
        return self._store.setdefault(self._user_id, {}).setdefault(name, FakeCollection())


def build_todo_record(
    *,
    todo_id: str = "todo-1",
    user_id: str = "user-1",
    title: str = "Shared title",
    completed: bool = False,
) -> dict[str, Any]:
    created_at = datetime(2026, 4, 1, 8, 0, tzinfo=UTC)
    completed_at = created_at if completed else None
    status = "completed" if completed else "inbox"
    return {
        "id": todo_id,
        "user_id": user_id,
        "title": title,
        "description": "",
        "completed": completed,
        "priority": "low",
        "start_date": None,
        "deadline": None,
        "labels": [],
        "status": status,
        "sort_order": 0,
        "completed_at": completed_at,
        "subtasks": [],
        "reminders": [],
        "recurrence": None,
        "created_at": created_at,
        "updated_at": created_at,
    }


async def test_read_normalizes_completed_state() -> None:
    db: Any = FakeDb()
    created_at = datetime(2026, 4, 1, 8, 0, tzinfo=UTC)
    updated_at = datetime(2026, 4, 1, 9, 30, tzinfo=UTC)
    db.get_collection("user-1", "todos").storage["todo-current"] = {
        "id": "todo-current",
        "user_id": "user-1",
        "title": "Current task",
        "description": "Stored with the expanded schema",
        "priority": "high",
        "start_date": None,
        "deadline": datetime(2026, 4, 3, 0, 0, tzinfo=UTC),
        "labels": ["Work"],
        "status": "today",
        "sort_order": 0,
        "completed_at": updated_at,
        "subtasks": [],
        "reminders": [],
        "recurrence": None,
        "created_at": created_at,
        "updated_at": updated_at,
    }

    todos = await list_todos(db, "user-1")
    todo = todos[0]

    assert todo.labels == ["Work"]
    assert todo.status == "completed"
    assert todo.completed is True
    assert todo.completed_at == updated_at


async def test_create_todo_accepts_new_fields() -> None:
    db: Any = FakeDb()
    start_date = datetime(2026, 4, 10, 0, 0, tzinfo=UTC)
    deadline = datetime(2026, 4, 12, 0, 0, tzinfo=UTC)
    completed_at = datetime(2026, 4, 11, 15, 45, tzinfo=UTC)
    reminder_at = datetime(2026, 4, 9, 9, 0, tzinfo=UTC)

    todo = await create_todo(
        db,
        "user-1",
        CreateTodoRequest(
            title="Plan quarterly review",
            description="Draft agenda and circulate notes",
            priority="high",
            start_date=start_date,
            deadline=deadline,
            labels=["Work", "Planning"],
            status="completed",
            sort_order=7,
            completed_at=completed_at,
            subtasks=[
                {
                    "id": "subtask-2",
                    "title": "Send agenda",
                    "sort_order": 2,
                },
                {
                    "id": "subtask-1",
                    "title": "Draft agenda",
                    "sort_order": 1,
                },
            ],
            reminders=[
                {
                    "id": "reminder-1",
                    "remind_at": reminder_at,
                },
            ],
            recurrence={
                "frequency": "weekly",
                "interval": 2,
                "weekdays": [5, 1, 1],
            },
        ),
    )

    stored = db.get_collection("user-1", "todos").storage[todo.id]

    assert todo.start_date == start_date
    assert todo.deadline == deadline
    assert todo.labels == ["Work", "Planning"]
    assert todo.status == "completed"
    assert todo.sort_order == 7
    assert todo.completed is True
    assert todo.completed_at == completed_at
    assert [subtask.id for subtask in todo.subtasks] == ["subtask-1", "subtask-2"]
    assert todo.reminders[0].remind_at == reminder_at
    assert todo.recurrence is not None
    assert todo.recurrence.weekdays == [1, 5]
    assert stored == todo.model_dump()


async def test_update_todo_accepts_new_fields() -> None:
    db: Any = FakeDb()
    todo_id = "todo-1"
    created_at = datetime(2026, 4, 1, 8, 0, tzinfo=UTC)
    updated_at = datetime(2026, 4, 1, 9, 0, tzinfo=UTC)
    db.get_collection("user-1", "todos").storage[todo_id] = {
        "id": todo_id,
        "user_id": "user-1",
        "title": "Legacy task",
        "description": "Current storage format",
        "completed": False,
        "priority": "medium",
        "start_date": None,
        "deadline": datetime(2026, 4, 2, 0, 0, tzinfo=UTC),
        "labels": ["Legacy"],
        "status": "inbox",
        "sort_order": 0,
        "completed_at": None,
        "subtasks": [],
        "reminders": [],
        "recurrence": None,
        "created_at": created_at,
        "updated_at": updated_at,
    }

    new_completed_at = datetime(2026, 4, 4, 17, 0, tzinfo=UTC)
    updated = await update_todo(
        db,
        "user-1",
        todo_id,
        UpdateTodoRequest(
            title="Updated task",
            start_date=datetime(2026, 4, 5, 0, 0, tzinfo=UTC),
            deadline=datetime(2026, 4, 6, 0, 0, tzinfo=UTC),
            labels=["Personal"],
            status="completed",
            sort_order=2,
            completed_at=new_completed_at,
            subtasks=[
                {
                    "id": "subtask-1",
                    "title": "Follow up",
                    "completed": True,
                    "completed_at": new_completed_at,
                },
            ],
            reminders=[
                {
                    "id": "reminder-1",
                    "remind_at": datetime(2026, 4, 5, 9, 0, tzinfo=UTC),
                },
            ],
            recurrence={
                "frequency": "monthly",
                "interval": 1,
                "day_of_month": 5,
            },
        ),
    )

    stored = db.get_collection("user-1", "todos").storage[todo_id]

    assert updated is not None
    assert updated.title == "Updated task"
    assert updated.start_date == datetime(2026, 4, 5, 0, 0, tzinfo=UTC)
    assert updated.deadline == datetime(2026, 4, 6, 0, 0, tzinfo=UTC)
    assert updated.labels == ["Personal"]
    assert updated.status == "completed"
    assert updated.completed is True
    assert updated.completed_at == new_completed_at
    assert updated.sort_order == 2
    assert updated.subtasks[0].completed is True
    assert updated.recurrence is not None
    assert updated.recurrence.day_of_month == 5
    assert stored == updated.model_dump()


async def test_list_todos_is_deterministic() -> None:
    db: Any = FakeDb()
    collection = db.get_collection("user-1", "todos")
    shared = build_todo_record()
    collection.stream_docs = [
        FakeSnapshot("todo-b", {"id": "todo-b", **shared, "sort_order": 1}),
        FakeSnapshot("todo-c", {"id": "todo-c", **shared, "sort_order": 0}),
        FakeSnapshot("todo-a", {"id": "todo-a", **shared, "sort_order": 1}),
    ]

    todos = await list_todos(db, "user-1")

    assert [todo.id for todo in todos] == ["todo-c", "todo-a", "todo-b"]
