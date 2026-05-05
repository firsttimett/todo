# TFCD Todo

A todo application built on Google Cloud Platform, with passwordless auth, infrastructure-as-code, blue-green deployments, and a full CI/CD pipeline from PR preview to production promotion.

## Architecture Overview

```
                ┌─────────────────────────────────────────────┐
                │            Firebase Hosting                 │
                │        (CDN + Hosting + Rewrites)           │
                └──────────────┬──────────────────────────────┘
                               │
                  /api/**      │      /**
                      ┌────────┴─────────┐
                      │                  │
                ┌─────▼───────┐    ┌─────▼──────────┐
                │   Backend   │    │ Static Files   │
                │ (Cloud Run) │    │ (index.html,   │
                │   :8080     │    │  assets, etc.) │
                └─────┬───────┘    └────────────────┘
                      │
                ┌─────▼───────────────┐
                │      Firestore      │
                │ users │ login_otps  │
                │       │ todos       │
                └─────────────────────┘
```

Firebase Hosting serves the frontend and rewrites `/api/**` to a single Cloud Run service that handles both auth and todo routes. The frontend and API share the same domain, so no CORS configuration is needed.

> **No load balancer:** Cloud Run uses `INGRESS_TRAFFIC_ALL`, so Firebase Hosting rewrites reach it directly. The trade-off: the `*.run.app` URL remains publicly reachable, bypassing Firebase's edge entirely. The more secure setup — GCP HTTPS LB + Serverless NEG (`INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER`) — would close that bypass and add Cloud Armor (WAF/DDoS), but a forwarding rule costs ~$18.25/month regardless of traffic.

## Services

### Backend (`backend/`)

A single FastAPI app wiring both the auth and todo routers, deployed as one Cloud Run service. Auth logic lives in `backend/auth/`, todo logic in `backend/todo/`, shared models and JWT helpers in `backend/shared/`.

**Auth flow:**

<details>
<summary>6-step passwordless auth</summary>

1. User submits their email
2. Auth service generates a 6-digit code, hashes it, stores it in Firestore with a 10-minute TTL
3. Code is sent via [Resend](https://resend.com) email API
4. User submits the code
5. Auth service verifies the hash, creates a user record if new, issues a JWT access token (15 min) and a refresh token (7 days, HTTP-only cookie)
6. On token expiry, the frontend silently calls `/auth/refresh` — the cookie is sent automatically

</details>

**Todo:**

CRUD for todo items. Validates JWTs using the shared public key — no service-to-service calls needed.

<details>
<summary>Data model highlights</summary>

- Todos live in per-user Firestore subcollections: `users/{user_id}/todos/{todo_id}`
- Schema fields: subtasks, reminders, recurrence, priority, labels, multiple status states (`inbox`, `today`, `upcoming`, `anytime`, `someday`, `completed`)
- Sorting is deterministic: `sort_order` → `completed` → `deadline` → `created_at` → `id`

Firestore subcollections per user give structural tenant isolation, though only at the data layer — a query on `users/alice/todos` can never accidentally return Bob's data, not just a WHERE clause away from leaking. The trade-off: cross-user queries for analytics (like "all todos due today across all users") are inefficient without a collection group index, but a personal todo app doesn't need that.

</details>

### Frontend (`frontend/`)

React 19 + TypeScript + Vite SPA. Deployed to Firebase Hosting.

**Key choices:**
- **localStorage**: for offline persistence — the app works without a backend connection
- **SPA**: no SEO requirements, so SSR or pre-rendering tools are not needed.

Also experimenting with **Preact Signals** for state and the **Vite PWA plugin**.

## Tech Stack

| Layer | Technology | Why this one |
|-------|-----------|--------------|
| **Frontend** | React 19 + TypeScript + Vite | Industry standard; Vite for fast builds; React is one of the most popular frontend frameworks |
| **Database** | Google Firestore | Serverless, scales to zero, document model fits the domain |
| **Backend hosting** | Google Cloud Run | Container-based, scale-to-zero, managed TLS |
| **CDN / Hosting** | Firebase Hosting | Static frontend served at the edge; rewrites `/api/**` to Cloud Run |
| **IaC** | Terraform ~1.7 | Declarative infra; reusable modules for env parity |
| **CI/CD** | GitHub Actions | Native to the repo; reusable workflow pattern |
| **Email** | Resend API | Simple transactional email; good DX |
| **Auth** | Ed25519 JWT + OTP | Passwordless; modern signing algorithm |
| **Linting** | Ruff + MyPy + ESLint | Ruff is fast; MyPy for type safety; ESLint for TS |
| **Testing** | pytest + Vitest + Playwright | Unit + integration + E2E across the stack |

## Project Structure

<details>
<summary>Directory tree</summary>

```
.
├── .github/workflows/          # CI/CD pipelines
│   ├── ci.yml                  # PR checks (test, lint, Docker build)
│   ├── _deploy.yml             # Reusable deploy workflow (provision → build → validate → release)
│   ├── deploy-staging.yml      # Push to main → auto-deploy staging (builds image, runs E2E preview gate)
│   ├── deploy-production.yml   # Staging success → production promotion; manual dispatch can promote a SHA
│   ├── preview.yml             # PR opened/updated → preview environment
│   ├── cleanup-preview.yml     # PR closed → destroy preview environment
│   ├── rollback.yml            # Manual trigger → roll back Cloud Run + Firebase Hosting
│   └── terraform-drift-check.yml  # Scheduled (weekdays 9 AM UTC) → detect infra drift
│
├── backend/
│   ├── auth/                   # Auth routes + service logic
│   ├── todo/                   # Todo routes + service logic
│   ├── shared/                 # Shared Python library (models, config, JWT auth)
│   ├── tests/                  # pytest tests
│   ├── main.py                 # FastAPI app wiring auth + todo routers
│   └── Dockerfile
│
├── frontend/                   # React SPA
│   ├── src/                    # Application code
│   ├── e2e/                    # Playwright E2E tests (full backend)
│   ├── e2e-stub/               # Playwright E2E tests (stub server)
│   └── playwright.*.config.ts
│
├── infra/terraform/
│   ├── environments/
│   │   ├── base/               # Bootstrap: GCP projects, WIF, Artifact Registry
│   │   ├── staging/            # Staging env config
│   │   └── production/         # Production env config
│   └── modules/environment/    # Reusable: Firestore, Cloud Run, IAM
│
├── secrets/                    # JWT keys (gitignored, generated by make setup)
├── docker-compose.yml          # Local development orchestration
├── Makefile                    # Developer commands
└── pyproject.toml              # Root Python config (Ruff, MyPy)
```

</details>

## Getting Started

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or OrbStack/Colima)
- [uv](https://docs.astral.sh/uv/) (Python package manager)
- [Node.js 24+](https://nodejs.org/)
- OpenSSL (comes with macOS/Linux)

### Setup

```bash
# 1. Generate JWT keys, create backend/.env, install pre-commit hooks
make setup

# 2. (Optional) Fill in backend/.env with your Resend API key for real emails
#    Without it, OTP codes are logged to the console instead

# 3. Start everything (auth, todo, frontend, Firestore emulator)
make dev
```

### Local Services

| Service | URL | What it does |
|---------|-----|-------------|
| Frontend | http://127.0.0.1:5173 | React app |
| Backend API | http://127.0.0.1:8080 | Auth + Todo endpoints |
| Firestore Emulator | http://127.0.0.1:8090 | Local database (no GCP needed) |

**Verify it works:** Open http://127.0.0.1:5173, enter any email address, and use bypass code `652093` instead of a real OTP — you should land on the todo list. No email delivery needed locally (bypass is set in `docker-compose.yml`).

### Running Services Individually

```bash
make dev-backend    # Backend only (run `docker compose up firestore-emulator` first)
make dev-frontend   # Frontend dev server only
```

### Common Commands

```bash
make test           # Run all tests (backend + frontend)
make lint           # Check code style (Ruff + MyPy + ESLint)
make format         # Auto-fix formatting
make clean          # Tear down Docker Compose + volumes
```

## Testing

### 1. Unit Tests
```bash
make test-backend
make test-frontend
```

### 2. Stub E2E Tests

Playwright tests that run against a stub server (mock backend). Fast because there's no real backend. Runs automatically in CI on [every PR targetting `main`](.github/workflows/ci.yml#L3-L9).

```bash
cd frontend && npm run test:e2e:stub
```

### 3. Full E2E Tests

Playwright tests against a real deployed environment. Run automatically for PR previews and as the staging pre-release gate.
- Tests the full auth flow, todo CRUD, and multi-todo scenarios against real Cloud Run services and Firestore.

```bash
cd frontend && npm run test:e2e
```

## CI/CD Pipeline

### How Code Gets to Production

```
Feature branch ──► PR to main ──► CI checks ──► Merge to main
                       │                               │
                       │                               ▼
                  ┌─────────┐           ┌────────────────────────────┐
                  │ CI Jobs │           │    Auto-deploy staging     │
                  │ • test  │           │  1. Terraform apply        │
                  │ • lint  │           │  2. Build + push image     │
                  │ • build │           │     tagged :<git-sha>      │
                  └─────────┘           │  3. Deploy Cloud Run       │
                       │                │     revision, no traffic   │
                       ▼                │  4. Build frontend artifact│
               PR preview env           │  5. E2E Firebase preview   │
                                        │     pinned to new revision │
                                        │  6. Deploy Firebase live   │
                                        │     pinned to new revision │
                                        └─────────────┬──────────────┘
                                                      │
                                       Auto-triggered on staging success
                                    (or manual workflow_dispatch with git_sha)
                                                      │
                                                      ▼
                                        ┌────────────────────────────┐
                                        │   Promote to production    │
                                        │  1. Validate image SHA     │
                                        │  2. Terraform plan         │
         reviewer approval required --> │  3. [infra gate]           │
                                        │  4. Terraform apply        │
                                        │  5. Redeploy SAME image    │
                                        │     :<git-sha>, no rebuild │
                                        │  6. Build frontend artifact│
                                        │  7. Smoke test new revision│
                                        │  8. Deploy Firebase live   │
                                        │     pinned to new revision │
                                        │  9. Watch live health      │
                                        │     and roll back Hosting  │
                                        │     on failure             │
                                        │ 10. Promote Cloud Run      │
                                        │     direct traffic         │
                                        └────────────────────────────┘
```

### Path-Based CI

Not every change needs every check. The CI pipeline uses [dorny/paths-filter](https://github.com/dorny/paths-filter) to detect which paths changed and only runs the relevant jobs. Change a frontend file? Backend tests don't run.

### PR Preview Environments

<details>
<summary>How preview environments work</summary>

Open a pull request and get a temporary environment automatically:

- A per-PR Firestore database (`nnow-pr-{number}`) is created
- A tagged Cloud Run revision (`pr-{number}`) is deployed on the staging service
- Firebase Hosting deploys a preview channel with a unique URL (30-day expiration)
- E2E tests run against the preview URL

On PR close, `cleanup-preview.yml` removes the revision tag, the per-PR Firestore database, and the hosting channel.

</details>

### Infrastructure Drift Detection

<details>
<summary>How drift detection works</summary>

`terraform-drift-check.yml` runs `terraform plan` against both staging and production every weekday at 09:00 UTC. If the plan shows changes (exit code 2), the workflow fails and posts the diff to the job summary. This catches out-of-band manual changes before they cause a surprise during the next deploy. Can also be triggered manually via `workflow_dispatch`.

</details>

### Deployment Strategy

Deployments follow a pinned-release blue-green pattern. New Cloud Run revisions are deployed with `--no-traffic` and tagged `new`; Firebase Hosting releases are deployed with `pinTag`, so the live frontend and `/api/**` rewrites point at the same tested revision. Staging normally gates the live release with E2E tests against a temporary Firebase preview channel; first-time pinTag bootstrap can skip that gate once because Firebase cannot deploy a pinned preview while live is still unpinned. Production smoke-tests the no-traffic revision, deploys Firebase Hosting live pinned to that revision, watches the live URL, rolls back Hosting on failure, and only then moves Cloud Run direct traffic to the new revision.

The promotion model is trunk-based and same-SHA: every image is built from a main commit on the way to staging, and production redeploys the exact `:<git-sha>` backend image that passed staging — never a rebuild. Terraform plan/apply and the frontend build also run from that same git SHA, so manual promotion of an older SHA does not mix an old backend with current frontend or infrastructure code.

<details>
<summary>Staging steps (auto, on every merge to `main`)</summary>

1. **Provision** — Terraform applies any infrastructure changes
2. **Build** — Docker image built, pushed to Artifact Registry tagged `:<git-sha>`
3. **Deploy** — New Cloud Run revision deployed with `--no-traffic` and tagged `new`
4. **Frontend artifact** — Frontend is built, audited, packaged, and reused by E2E and release
5. **E2E** — Playwright tests run against a temporary Firebase preview channel pinned to the new revision; skipped once during first-time pinTag bootstrap
6. **Release** — Firebase Hosting live channel is deployed from the tested artifact, pinned to the same new revision

</details>

<details>
<summary>Production steps (auto-triggered on staging success, or manually via `workflow_dispatch`)</summary>

1. **Validate** — SHA is resolved (short or full accepted) and confirmed to exist in Artifact Registry
2. **Plan** — Terraform plan runs and output is posted to the job summary for review
3. **Approve infra** — A reviewer inspects the plan in the `production-gate` GitHub environment and approves
4. **Apply** — Terraform apply runs against `tfcd-prod`
5. **Redeploy** — The exact `:<git-sha>` image that passed staging is redeployed to the prod Cloud Run service — no rebuild
6. **Frontend artifact** — Frontend is built, audited, packaged, and reused by release
7. **Smoke test** — Health check and auth guard against the no-traffic revision
8. **Release** — Firebase Hosting live channel is deployed from the artifact, pinned to the new revision
9. **Health watch** — Live frontend is polled every 30s for 5 minutes; Firebase Hosting rolls back automatically if any poll fails
10. **Promote direct traffic** — Cloud Run direct traffic moves to the new revision only after the live Firebase path stays healthy

To promote a specific SHA (e.g., to skip a bad commit), trigger `deploy-production.yml` manually via `workflow_dispatch` and provide a short or full SHA from `main`, copied from the staging deploy run name. If `git_sha` is omitted, the workflow promotes the selected Actions ref SHA after confirming its image exists.

</details>

**GitHub environments and secrets** are configured once per repo — four environments (`staging`, `preview`, `production`, `production-gate`), a handful of repo-level secrets, and per-environment JWT/Resend/Firebase values. See [`infra/SETUP.md#step-2--configure-github-repository`](infra/SETUP.md#step-2--configure-github-repository) for the full list and reviewer rules.

### Rollback

**Prefer a git revert.** Revert the bad commit on `main` and let the normal pipeline redeploy — this keeps git history as the source of truth, avoids drift between `main` and what's actually running, and means the next deploy won't silently re-ship the broken revision.

**Use `rollback.yml` only when speed matters more than history** (e.g., production is actively broken and a revert + full pipeline would take too long). Trigger it from the Actions UI, select the environment, and optionally pick a specific Cloud Run revision (defaults to the previous one). The workflow moves Cloud Run traffic back and rolls Firebase Hosting back in the same run. Follow up with a revert PR once the fire is out, so `main` matches production.

Production rollback requires approval via the `production-gate` GitHub environment — the same reviewer gate used for Terraform apply during deploys.

### Authentication to GCP from CI

GitHub Actions authenticates to GCP via **Workload Identity Federation** (WIF) — no service account keys stored as secrets. GitHub's OIDC provider proves the workflow's identity, and GCP grants short-lived tokens. Firebase deploy and rollback steps use WIF-backed service account impersonation so `firebase-tools` gets normal ADC credentials without a long-lived JSON key.

## Infrastructure

For one-time bootstrap instructions, see [infra/SETUP.md](infra/SETUP.md).

### Naming Conventions

Two prefixes show up throughout the repo:

- `tfcd-*` — **infra layer**: GCP projects, Terraform state bucket, Artifact Registry host, custom domain (`*.tfcd.app`)
- `nnow-*` — **app layer**: Cloud Run service (`nnow-nonprod`, `nnow-prod`), Firestore database (`nnow-{env}`, `nnow-pr-{N}`), AR repo (`nnow/backend`), Python package

They intentionally differ so the app could be renamed without touching infra identifiers, and vice versa.

### GCP Project Topology

```
tfcd-infra          # Shared: Artifact Registry, Workload Identity Federation, Terraform state
tfcd-nonprod        # Staging and PR preview environments share this project
tfcd-prod           # Production environment
```

### Terraform Module Design

The `modules/environment/` module is reusable across staging and production. One module creates:

- Firestore database
- Cloud Run service (unified backend) with scaling config
- IAM bindings

Firebase Hosting custom domain registration, DNS A records, and ACME challenge TXT records are Terraform-managed in the `base` layer; only content deploys run outside Terraform through `firebase-tools`. PR preview environments don't need a separate Terraform module — they reuse the staging Cloud Run service with a tagged revision and a per-PR Firestore database.

### Token Lifecycle

<details>
<summary>Token flow reference</summary>

```
Login:    email → OTP code → access_token (15 min) + refresh_token (7 days, cookie)
Use:      Authorization: Bearer <access_token>
Refresh:  POST /auth/refresh (cookie sent automatically) → new access_token
Logout:   POST /auth/logout → cookie cleared
```

</details>

### Security Model

<details>
<summary>Security decisions and rationale</summary>

- **JWT signing:** Ed25519 (EdDSA) — the todo service only needs the public key to verify tokens, never sees the private key
- **Access token lifetime:** 15 minutes — short-lived tokens limit the damage window if one is stolen; the refresh token handles silent renewal
- **Refresh tokens:** HTTP-only, Secure, SameSite=Lax cookies — JavaScript can't read them, they're not sent cross-site
- **OTP codes:** Stored as hashes with 10-minute TTL — even if Firestore is compromised, the codes are hashed
- **User isolation:** Firestore subcollection structure (`users/{uid}/todos`) makes cross-user data access structurally impossible
- **GCP auth:** Workload Identity Federation — no long-lived service account keys
- **Ingress:** Cloud Run service is `INGRESS_TRAFFIC_ALL` — Firebase Hosting rewrites routes to it directly; no load balancer needed

</details>
