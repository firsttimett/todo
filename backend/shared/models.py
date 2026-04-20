from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class User(BaseModel):
    id: str
    email: str
    name: str
    picture: str | None = None
    created_at: datetime


TodoStatus = Literal[
    "inbox",
    "today",
    "upcoming",
    "anytime",
    "someday",
    "completed",
]


class TodoSubtask(BaseModel):
    id: str
    title: str
    completed: bool = False
    sort_order: int = 0
    completed_at: datetime | None = None

    @model_validator(mode="after")
    def normalize_completion_state(self) -> TodoSubtask:
        if self.completed_at is not None or self.completed:
            self.completed = True
            return self

        self.completed_at = None
        return self


class TodoReminder(BaseModel):
    id: str
    remind_at: datetime
    acknowledged_at: datetime | None = None


RecurrenceFrequency = Literal["daily", "weekly", "monthly", "custom"]


class TodoRecurrence(BaseModel):
    frequency: RecurrenceFrequency
    interval: int = Field(default=1, ge=1)
    weekdays: list[int] = Field(default_factory=list)
    day_of_month: int | None = Field(default=None, ge=1, le=31)

    @model_validator(mode="after")
    def normalize_frequency_shape(self) -> TodoRecurrence:
        unique_weekdays = sorted({day for day in self.weekdays if 0 <= day <= 6})
        self.weekdays = unique_weekdays

        if self.frequency != "weekly":
            self.weekdays = []

        if self.frequency != "monthly":
            self.day_of_month = None

        return self


class TodoItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    user_id: str
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
    subtasks: list[TodoSubtask] = Field(default_factory=list)
    reminders: list[TodoReminder] = Field(default_factory=list)
    recurrence: TodoRecurrence | None = None
    created_at: datetime
    updated_at: datetime

    @model_validator(mode="after")
    def normalize_completion_state(self) -> TodoItem:
        if self.completed_at is not None or self.status == "completed" or self.completed:
            self.completed = True
            self.status = "completed"
        else:
            self.completed_at = None

        self.subtasks = sorted(
            self.subtasks,
            key=lambda subtask: (subtask.sort_order, subtask.id),
        )
        self.reminders = sorted(
            self.reminders,
            key=lambda reminder: (reminder.remind_at, reminder.id),
        )
        return self
