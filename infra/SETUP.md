# Infrastructure overview

```
infra/terraform/
├── environments/
│   ├── base/          # Human-run: projects, DNS, WIF, AR, tfstate, SAs, Firebase custom domains
│   ├── staging/       # CI-run: Cloud Run, Firestore, invoker IAM — GCS state at tfcd-tfstate/tfstate/staging
│   └── production/    # CI-run: same as staging — GCS state at tfcd-tfstate/tfstate/prod
└── modules/
    └── environment/   # Shared module: Cloud Run, Firestore, Cloud Run invoker
```

**GCP projects:**

| Project | Purpose | Developers | On-call | CI/CD |
|---------|---------|------------|---------|-------|
| `tfcd-infra` | WIF, Artifact Registry, tfstate | — | — | AR push + tfstate |
| `tfcd-nonprod` | Staging + PR preview environments | Full | Full | Deploy |
| `tfcd-prod` | Production environment | — | Read-only | Deploy |

**Secrets/envs flow**

GitHub secrets/vars → TF_VAR_* env vars → Terraform apply → Secret Manager → Cloud Run (via `secret_key_ref`)

# Infrastructure Setup

One-time guide to bootstrap the TFCD infrastructure from scratch.

## Prerequisites

### 1. Generate JWT keys (Ed25519)

```bash
make setup
```

This generates a local development key pair at `secrets/jwt_private_key.pem` and `secrets/jwt_public_key.pem` using `openssl genpkey -algorithm Ed25519` (skipped if they already exist). Each CI environment (staging, preview, production) should use a separately generated pair — see [Step 2](#step-2--configure-github-repository).

### 2. Create the bootstrap state bucket

The `base` Terraform uses a separate bucket for its own state, independent of `tfcd-tfstate` which `base` itself creates. This avoids committing state to git and the chicken-and-egg problem.

This requires `tfcd-infra` to exist first — create it manually:

```bash
gcloud projects create tfcd-infra --name="tfcd-infra"
gcloud billing projects link tfcd-infra --billing-account=<BILLING_ACCOUNT_ID>

# Why do we need to enable these APIs via CLI instead of terraform?
# serviceusage: required for Terraform to enable APIs on other projects
# storage:      required to create the bootstrap bucket
# cloudbilling: required because ADC routes all Terraform calls through
#               tfcd-infra (quota project), and setting/reading billing
#               accounts on any project calls the Cloud Billing API
gcloud services enable \
  serviceusage.googleapis.com \
  storage.googleapis.com \
  cloudbilling.googleapis.com \
  --project=tfcd-infra

gcloud storage buckets create gs://tfcd-tfstate-bootstrap \
  --project=tfcd-infra \
  --location=asia-southeast1 \
  --uniform-bucket-level-access
```

> `tfcd-infra` will subsequently be managed by Terraform — import it in Step 1.

---

## Step 1 — Apply base infrastructure

The `base` layer creates all three GCP projects, Artifact Registry, `tfcd-tfstate` bucket, Workload Identity Federation, IAM bindings for GitHub Actions and team members, per-env app service accounts (`nnow-{staging,prod}-sa`) with `roles/datastore.user`, and Firebase Hosting custom domains with ACME DNS records.

This is the only human-run terraform root. It requires first-party auth because `setIamPolicy` on Firebase-linked projects rejects WIF callers (Firebase ToS gate).

Authenticate and set the quota project before running Terraform:

```bash
gcloud auth application-default login
gcloud auth application-default set-quota-project tfcd-infra
```

```bash
cd infra/terraform/environments/base
terraform init
```

Import the manually created `tfcd-infra` project so Terraform manages it:

```bash
terraform import \
  -var="billing_account=<BILLING_ACCOUNT_ID>" \
  -var="github_repo=<owner>/<repo>" \
  google_project.infra tfcd-infra
```

Replace `<BILLING_ACCOUNT_ID>` with your billing account ID (`gcloud billing accounts list`) and `<owner>/<repo>` with your GitHub repository (e.g. `username_or_org_name/tfcd`).

Apply APIs first to avoid propagation delays on subsequent resources (e.g. billing budget):

```bash
terraform apply \
  -target=google_project_service.infra_apis \
  -var="billing_account=<BILLING_ACCOUNT_ID>" \
  -var="github_repo=<owner>/<repo>"
```

Then apply everything:

```bash
terraform apply \
  -var="billing_account=<BILLING_ACCOUNT_ID>" \
  -var="github_repo=<owner>/<repo>"
```

The Firebase Hosting CNAME records (`staging.todo.tfcd.app` → `tfcd-nonprod.web.app`, `todo.tfcd.app` → `tfcd-prod.web.app`) are created unconditionally. Once both CNAMEs are live, Firebase issues managed Let's Encrypt certs over HTTP-01 — no further DNS changes required.

### Enable DNSSEC

DNSSEC is enabled on the Cloud DNS zone by default. After the first `terraform apply`, publish the DS record to the registrar in one step:

```bash
gcloud domains registrations configure dns tfcd.app \
  --cloud-dns-zone=projects/tfcd-infra/managedZones/tfcd-app \
  --project=tfcd-infra
```

This updates both the nameservers and DS record at the registrar atomically. If using external registrar (not Cloud Domains), can read the DS record value from the Terraform output, and enter the DS record manually.

### Capture outputs for next step

```bash
terraform output -raw workload_identity_provider
# → projects/<NUMBER>/locations/global/workloadIdentityPools/github-actions-pool/providers/github-provider
```

---

## Step 2 — Configure GitHub repository

Go to your GitHub repository → **Settings → Secrets and variables → Actions**.

Create four environments under **Settings → Environments**:

| Environment | Required reviewer? | Bound by |
|---|---|---|
| `staging` | **No** | `deploy-staging.yml` |
| `preview` | **No** | `preview.yml`, `cleanup-preview.yml` — isolates PR previews in their own deployments history and concurrency lane |
| `production` | **No** (all prod jobs run through it; a reviewer here would prompt on every deploy step) | `deploy-production.yml` |
| `production-gate` | **Yes** — gates Terraform apply and production rollback | `deploy-production.yml`, `rollback.yml` |

### Repository-level (Settings → Secrets and variables → Actions)

Values that are the same everywhere, or only used in nonprod:

| Name | Type | Value |
|---|---|---|
| `OTP_BYPASS_CODE` | secret | Fixed OTP for nonprod E2E tests (e.g. `000000`); production ignores it |
| `WIF_RESOURCE_NAME` | secret | Output from `terraform output -raw workload_identity_provider` |
| `GOOGLE_CLOUD_PROJECT` | variable | `tfcd-nonprod` |

### Why Firebase uses service account impersonation (not direct WIF)

Most GCP deploy steps use direct Workload Identity Federation because `gcloud`, Terraform, and Cloud Run deploy flows handle `external_account` credentials reliably.

Firebase deploy and rollback steps intentionally use WIF plus service account impersonation. `firebase-tools` and parts of the Firebase Admin SDK have historically been less reliable with direct `external_account` credentials,
while impersonated service account ADC behaves like normal Google service account credentials without requiring a long-lived JSON key.

This is still keyless: GitHub receives only short-lived WIF credentials and may impersonate the narrowly scoped Firebase CI service accounts.

### Environment-level (Settings → Environments → `staging` \| `preview` \| `production`)

Every row below differs between staging and production — use distinct values per environment so a leak or rotation on one side never affects the other. No need to set for empty cells because the value is the same as the repository-level value.

| Name | Type | `staging` & `preview` | `production` |
|---|---|---|---|
| `JWT_PRIVATE_KEY` | secret | Signing key | Production signing key |
| `JWT_PUBLIC_KEY` | secret | Matching public key | Matching production public key |
| `RESEND_API_KEY` | secret | Resend API key | Resend API key for production |
| `RESEND_FROM_EMAIL` | secret | e.g. <ul><li>`noreply-staging@yourdomain.com`</li><li>`noreply-preview@yourdomain.com`</li></ul> | e.g. `noreply@yourdomain.com` |
| `GOOGLE_CLOUD_PROJECT` | variable |  | `tfcd-prod` |

To generate a JWT key pair (signing and public key) for each environment:

```bash
# Generates signing key
openssl genpkey -algorithm Ed25519 -out jwt_private_key.pem
# Generates public key
openssl pkey -in jwt_private_key.pem -pubout -out jwt_public_key.pem
```

Use the PEM file contents as the secret values. Generate a separate pair per environment — never reuse the local development keys from `secrets/`.

`production-gate` needs no secrets or variables — it exists solely for the required-reviewer protection rule.

---

## Step 3 — Configure Resend

Sign up at [resend.com](https://resend.com), verify your sending domain, and create an API key.
Add `RESEND_API_KEY` and `RESEND_FROM_EMAIL` to the GitHub environment secrets as described in Step 2.

A single verified domain covers every environment — Resend only checks the domain, so you can pick any local-part per environment (e.g. `noreply-staging@` for staging, `noreply@` for production) without touching DNS again.

For local development, leave `RESEND_API_KEY` unset — the auth service will log OTP codes to
the console instead of sending emails.

---

## Step 4 — Deploy staging

Push to `main` to trigger `deploy-staging.yml`:

```bash
git push origin main
```

The staging deploy provisions staging infrastructure, deploys a no-traffic Cloud Run revision, validates it through the staging Firebase preview gate, then releases Firebase Hosting live pinned to that revision.

On first push, Terraform creates the Firestore database, Cloud Run service, and `allUsers` invoker binding. This can take a few minutes.

> **Path-filtered triggers:** the workflow only runs when files under `backend/`, `frontend/`, `infra/terraform/environments/staging/`, `infra/terraform/modules/`, or the staging/shared workflow files change. If the first push doesn't trigger, make a small commit touching one of those paths.

---

## Step 5 — Deploy production

The production custom domain (`todo.tfcd.app`), its hosting A record, and its ACME TXT record are already provisioned by the double-apply in Step 1.

`deploy-production.yml` auto-triggers on successful completion of `deploy-staging.yml` (via `workflow_run`). It can also be invoked manually from the Actions UI via `workflow_dispatch`, optionally with a specific short or full git SHA from `main`. If omitted, the manual run promotes the selected Actions ref SHA after image validation:

```bash
gh workflow run deploy-production.yml -f git_sha=<sha>
```

Production promotes the same `:<git-sha>` image that passed staging — no rebuild. The run validates the image, pauses at `production-gate` for Terraform approval, applies production infrastructure, then releases the same backend/frontend pair through the production deploy pipeline.

For the detailed deploy order and rollback behavior, see [`README.md#how-code-gets-to-production`](../README.md#how-code-gets-to-production).

---

## Step 6 — PR previews

Opening a PR against `main` triggers `preview.yml`, which deploys a tagged Cloud Run revision (`pr-<N>`) on the staging service with a per-PR Firestore database, and a Firebase Hosting preview channel. E2E tests run against the preview URL.

No manual setup needed — PR previews reuse the staging infrastructure provisioned in Step 4.

---

**Environments:**

| Environment | GCP Project | Trigger | Frontend URL |
|-------------|-------------|---------|--------------|
| Production | `tfcd-prod` | Auto on staging success (or manual `workflow_dispatch`) | `https://todo.tfcd.app` |
| Staging | `tfcd-nonprod` | Push to `main` | `https://staging.todo.tfcd.app` |
| PR Preview | `tfcd-nonprod` | PR to `main` | Firebase preview channel URL |
