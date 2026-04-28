from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field
from shared.todo_models import RecurrenceFrequency, TodoStatus


class TodoSubtaskPayload(BaseModel):
    id: str
    title: str
    completed: bool = False
    sort_order: int = 0
    completed_at: datetime | None = None


class TodoReminderPayload(BaseModel):
    id: str
    remind_at: datetime
    acknowledged_at: datetime | None = None


class TodoRecurrencePayload(BaseModel):
    frequency: RecurrenceFrequency
    interval: int = Field(default=1, ge=1)
    weekdays: list[int] = Field(default_factory=list)
    day_of_month: int | None = Field(default=None, ge=1, le=31)


class CreateTodoRequest(BaseModel):
    title: str
    description: str = ""
    completed: bool = False
    priority: Literal["low", "medium", "high"] = "low"
    start_date: datetime | None = None
    deadline: datetime | None = None
    labels: list[str] = Field(default_factory=list)
    status: TodoStatus = "inbox"
    sort_order: int = 0
    completed_at: datetime | None = None
    subtasks: list[TodoSubtaskPayload] = Field(default_factory=list)
    reminders: list[TodoReminderPayload] = Field(default_factory=list)
    recurrence: TodoRecurrencePayload | None = None


class UpdateTodoRequest(BaseModel):
    title: str | None = None
    description: str | None = None
    completed: bool | None = None
    priority: Literal["low", "medium", "high"] | None = None
    start_date: datetime | None = None
    deadline: datetime | None = None
    labels: list[str] | None = None
    status: TodoStatus | None = None
    sort_order: int | None = None
    completed_at: datetime | None = None
    subtasks: list[TodoSubtaskPayload] | None = None
    reminders: list[TodoReminderPayload] | None = None
    recurrence: TodoRecurrencePayload | None = None
