# Todo System Backlog

## Overview

This backlog refines the original plan against the current TFCD repo structure:

- Frontend code lives in `services/frontend`
- Todo API code lives in `services/todo`
- Shared Python models live in `packages/shared`

The biggest refinement is adding a short `Phase 0` before feature work. Without it, the highest-risk files will become merge hotspots:

- `services/frontend/src/components/TodoPage.tsx`
- `services/frontend/src/stores/todos.ts`
- `services/frontend/src/types/index.ts`
- `packages/shared/src/shared/models.py`
- `services/todo/src/todo/schemas.py`

## Delivery Principles

- Ship the planning foundation before power features.
- Keep anonymous/local mode working in every phase.
- Freeze the task contract before parallel implementation starts.
- Prefer deterministic ordering on both backend and frontend.
- Keep migrations backward-compatible for existing todo data.
- Treat collaboration as optional until the solo-product UX is strong.

## Key Refinements From The Original Plan

- Add `Phase 0` for contract freeze, file splitting, and test scaffolding.
- Use the actual repo paths under `services/frontend`, `services/todo`, and `packages/shared`.
- In `Phase 1`, make `labels[]` the real replacement for `category`.
- Define `Inbox`, `Today`, `Upcoming`, `Anytime`, `Someday`, and `Completed` as explicit view semantics, not just UI tabs.
- Use Playwright as the standard tool for end-to-end browser coverage in `services/frontend/tests/e2e/`.

## Branching Model

Recommended umbrella branch:

- `feat/todo-planning-foundation`

Recommended specialist branches:

- `feat/todo-contract-v2`
- `feat/todo-backend-foundation`
- `feat/todo-frontend-shell`
- `feat/todo-detail-pane`
- `feat/todo-quick-add`
- `feat/todo-subtasks`
- `feat/todo-search-views`
- `feat/todo-recurrence-reminders`

## Phase 0: Contract Freeze And Scaffolding

Goal: create a stable foundation so the later phases can run in parallel without constant merge conflicts.

Scope:

- Freeze the v2 task contract across:
  - `packages/shared/src/shared/models.py`
  - `services/todo/src/todo/schemas.py`
  - `services/frontend/src/types/index.ts`
- Define view semantics for:
  - `Inbox`
  - `Today`
  - `Upcoming`
  - `Anytime`
  - `Someday`
  - `Completed`
- Decide which fields are stored versus derived.
- Split frontend hotspots so later work lands in smaller files:
  - extract view derivation from `services/frontend/src/stores/todos.ts`
  - break page shell concerns out of `services/frontend/src/components/TodoPage.tsx`
  - create a dedicated detail-pane entry point to replace modal ownership over time
- Stand up test scaffolding:
  - add `services/todo/tests/`
  - keep extending Playwright E2E coverage in `services/frontend/tests/e2e/`
  - add frontend unit/store tests where needed

Suggested contract additions:

- `start_date`
- `deadline`
- `labels[]`
- `status`
- `sort_order`
- `completed_at`

Acceptance:

- Shared model, API schemas, and frontend types match.
- Current CRUD still works for existing todos.
- View derivation rules are documented and agreed before feature branches fan out.

## Phase 1: Core Planning Model

Goal: move from a flat list to a real personal planning system.

Scope:

- Add first-class views:
  - `Inbox`
  - `Today`
  - `Upcoming`
  - `Anytime`
  - `Someday`
  - `Completed`
- Split `due_date` into:
  - `start_date`
  - `deadline`
- Replace `category` with `labels[]` and preserve migration from old data.
- Add stable sort fields:
  - `status`
  - `sort_order`
  - `completed_at`
- Add deterministic ordering in list queries and client rendering.

Backend:

- Extend `packages/shared/src/shared/models.py`
- Extend `services/todo/src/todo/schemas.py`
- Update CRUD behavior in `services/todo/src/todo/service.py`
- Update API behavior in `services/todo/src/todo/routes.py`

Frontend:

- Extend `services/frontend/src/types/index.ts`
- Update migration and normalization in `services/frontend/src/stores/todos.ts`
- Replace the filter-first shell in `services/frontend/src/components/TodoPage.tsx` with view-first navigation

Acceptance:

- User can place a task into Inbox without scheduling it.
- User can schedule a task for a day without implying a hard deadline.
- Existing local todos migrate cleanly.
- Signed-in and anonymous flows still behave consistently.
- Lists render in predictable order across refreshes and devices.

## Phase 2: Better Capture

Goal: make task entry fast enough that the system feels trustworthy.

Scope:

- Rework quick add in `services/frontend/src/components/TodoInput.tsx`
- Add inline metadata controls for:
  - date
  - labels
- Add simple natural-language parsing for:
  - `tomorrow`
  - `friday`
  - `next week`
  - `p1`
  - `high`
  - `#label`
- Keep advanced controls available without forcing a modal flow

Implementation note:

- Put parsing logic in its own module rather than embedding it in `TodoInput.tsx`

Acceptance:

- Creating a task with a date and priority can be done from one entry line.
- Most tasks can be captured without opening secondary controls.
- Parser behavior is covered by unit tests.

## Phase 3: Selection And Detail Pane

Goal: adopt a focused, non-blocking editing model.

Scope:

- Replace modal-first editing in `services/frontend/src/components/TodoModal.tsx` with a persistent detail pane
- Make selection state in `services/frontend/src/components/TodoPage.tsx` meaningful
- Make keyboard actions work for the selected task:
  - `e` edit
  - `d` complete
  - arrow-key navigation
- Add richer task metadata editing in-pane
- Show timestamps and long-form notes without blocking the list

Acceptance:

- Clicking a task opens a side pane while preserving list context.
- Keyboard-only navigation and editing are usable.
- `TodoModal` is removed or reduced to a transitional wrapper.

## Phase 4: Subtasks And Progress

Goal: support multi-step work instead of only single-action tasks.

Scope:

- Add a nested checklist or subtask model
- Show progress on parent tasks
- Allow quick add of subtasks from the detail pane
- Support collapsing and expanding subtasks in list or pane

Backend decision:

- Choose between embedded ordered subtasks and a separate subtask collection based on query needs before implementation starts

Acceptance:

- A parent task can represent a deliverable with multiple steps.
- Progress is visible without opening every task.
- Subtask ordering is stable.

## Phase 5: Search, Saved Filters, And Smart Views

Goal: add fast retrieval once the planning model is stable.

Scope:

- Full-text search over title and description
- Saved filters such as:
  - `Overdue`
  - `High priority`
  - `No date`
  - `Work this week`
- Group and sort controls:
  - by date
  - by priority
  - by label

Acceptance:

- User can retrieve tasks by context instead of browsing manually.
- Common saved views are shareable across refreshes and sessions.

## Phase 6: Recurring Tasks And Reminders

Goal: automate repeated planning work.

Scope:

- Add recurrence rules:
  - daily
  - weekly
  - monthly
  - custom interval
- Add reminder timestamps
- Define completion behavior for recurring tasks
- Define overdue handling rules for repeating items

Acceptance:

- Recurring tasks regenerate correctly after completion.
- Reminders are stored consistently even before notification delivery is built.
- Repeating tasks do not break `Today`, `Upcoming`, or overdue views.

## Suggested Delivery Sequence

- Phase 0
- Phase 1
- Phase 2 and Phase 3
- Phase 4
- Phase 5
- Phase 6

## Parallel Execution Plan

### Wave 0

Serial work only:

- Contract freeze
- Hotspot file split
- Test scaffolding

### Wave 1

Can run in parallel after Phase 0:

- Backend foundation
- Frontend shell and smart views
- Detail pane and keyboard interactions
- QA and contract verification

Integration gate:

- Core views work end to end
- Ordering is deterministic
- Existing todos still migrate

### Wave 2

Can run in parallel after Phase 1:

- Better capture
- Search and saved views

Integration gate:

- Quick add, retrieval, and core planning model all agree on the same task contract

### Wave 3

Can run in parallel after Phase 3:

- Subtasks
- Recurrence and reminders

Integration gate:

- Detail pane supports nested work and recurring metadata without UX regressions

## Phase 1 First Slice

If only one slice should start now, do this first:

1. Add the new task fields in shared models, API schemas, and frontend types.
2. Introduce `Inbox`, `Today`, and `Upcoming` in `services/frontend/src/components/TodoPage.tsx`.
3. Add deterministic sorting and view derivation in `services/frontend/src/stores/todos.ts`.
4. Replace `category` with `labels[]` and keep a migration path.
5. Replace modal-first editing with a selected-task detail pane.

## Testing Strategy

- Use Playwright for end-to-end browser tests in `services/frontend/tests/e2e/`
- Add todo-service tests under `services/todo/tests/`
- Add unit tests around:
  - view derivation
  - migration logic
  - quick add parsing
  - recurrence logic
- Keep anonymous/local mode as a required regression path in every major phase
