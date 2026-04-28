# Repository Guidelines

## Project Structure & Module Organization
This repository is a monorepo. Application code lives under `services/`: `auth` and `todo` are FastAPI services with source in `src/auth` and `src/todo`, while `frontend` is a React + Vite app in `src/`. Shared Python code lives in `packages/shared/src/shared`. Deployment infrastructure is in `infra/terraform`, with reusable modules in `infra/terraform/modules` and environment stacks in `infra/terraform/environments`. Local orchestration is defined in `docker-compose.yml`.

## Build, Test, and Development Commands
- Use `make setup` once to create `secrets/` keys and copy `.env.local.example` to `.env.local`. Use `make dev` to start the full stack with Docker, including the Firestore emulator. For service-only work, use `make dev-auth`, `make dev-todo`, or `make dev-frontend`. Run `make test` for the full test suite, or `make test-auth`, `make test-todo`, and `make test-frontend` for targeted runs. Run `make lint` before opening a PR.
- When changing `docker-compose.yml`, run `npx dclint docker-compose.yml`. Frontend production output is built with `cd services/frontend && npm run build`.
- ALWAYS use Playwright MCP --isolated to verify changes that have impact on the UI/UX.

## Coding Style & Naming Conventions
Linting is enforced with Ruff for Python and ESLint for frontend code.

After any change to a `.py` file under `backend/`, run both of these from the `backend/` directory before committing:
```
uv run ruff check --fix
uv run mypy
```

### Python imports
Place all imports at the top of the module. Do **not** put `import` or `from … import` statements inside functions or methods unless one of these conditions is explicitly true:
- The import would create a **circular dependency** that cannot be resolved by restructuring.
- The import has a **significant runtime cost** (e.g. a heavy C extension) and the function is called rarely enough that deferring it is a meaningful optimisation.

In all other cases a deferred import is a code smell: it hides the module's real dependencies, breaks static analysis and linters, and adds a `sys.modules` dict lookup on every call for no benefit.

## Commit Guidelines
Follows Conventional Commits 1.0.0.

## Security & Configuration Tips
Prefer `.env.local.example` for documenting new configuration. Local auth and todo services depend on generated JWT keys in `secrets/`.
