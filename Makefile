.PHONY: setup dev dev-backend dev-frontend test test-backend test-frontend lint lint-fix format clean check-docker

COMPOSE = docker compose

setup:
	@mkdir -p secrets
	@if [ ! -f secrets/jwt_private_key.pem ]; then \
		openssl genpkey -algorithm Ed25519 -out secrets/jwt_private_key.pem; \
		echo "Generated Ed25519 private key at secrets/jwt_private_key.pem"; \
	else \
		echo "secrets/jwt_private_key.pem already exists, skipping."; \
	fi
	@if [ ! -f secrets/jwt_public_key.pem ]; then \
		openssl pkey -in secrets/jwt_private_key.pem -pubout -out secrets/jwt_public_key.pem; \
		echo "Generated Ed25519 public key at secrets/jwt_public_key.pem"; \
	else \
		echo "secrets/jwt_public_key.pem already exists, skipping."; \
	fi
	@if [ ! -f backend/.env ]; then \
		cp backend/.env.example backend/.env; \
		echo "Created backend/.env from backend/.env.example — fill in RESEND credentials if needed."; \
	else \
		echo "backend/.env already exists, skipping."; \
	fi
	uv tool install pre-commit
	pre-commit install

check-docker:
	@docker info >/dev/null 2>&1 || ( \
		echo "Docker daemon is not running. Start Docker Desktop, OrbStack, or Colima and rerun 'make dev'."; \
		exit 1; \
	)

dev: setup check-docker
	$(COMPOSE) up --build

dev-backend: setup
	cd backend && uv run --env-file .env uvicorn main:app --reload --reload-dir auth --reload-dir shared --reload-dir todo

dev-frontend:
	cd frontend && npm run dev

test: test-backend test-frontend

test-backend:
	cd backend && uv run pytest

test-frontend:
	cd frontend && npm test

lint:
	uvx ruff check .
	cd backend && uv run mypy .
	cd frontend && npm run lint

format:
	uvx ruff format .
	uvx ruff check --fix .
	cd frontend && npm run lint -- --fix

clean: check-docker
	$(COMPOSE) down --volumes
