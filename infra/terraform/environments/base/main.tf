locals {
  # Single source of truth for project IDs. Defined as literals (not
  # google_project.*.project_id references) so they're usable in for_each keys,
  # which must be known at plan time before the project resources are applied.
  infra_project_id   = "tfcd-infra"
  nonprod_project_id = "tfcd-nonprod"
  prod_project_id    = "tfcd-prod"
  env_project_ids    = [local.nonprod_project_id, local.prod_project_id]

  # APIs for env projects (nonprod + prod) only — app workloads.
  env_apis = toset([
    "run.googleapis.com",
    "firestore.googleapis.com",
    "artifactregistry.googleapis.com",
    "iam.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "firebase.googleapis.com",
    "firebasehosting.googleapis.com",
    "secretmanager.googleapis.com",
  ])

  # APIs for tfcd-infra only — shared infrastructure, no app workloads.
  infra_apis = toset([
    "artifactregistry.googleapis.com",
    "storage.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "dns.googleapis.com",
    "billingbudgets.googleapis.com",
    "serviceusage.googleapis.com", # required when user_project_override = true routes quota through tfcd-infra
    "domains.googleapis.com",
  ])

  # ---------------------------------------------------------------------------
  # CI/CD IAM — GitHub Actions WIF principal
  #
  # Scoped by project and branch:
  #   tfcd-infra:   AR push (repo-scoped) + tfstate access (bucket-scoped)
  #   tfcd-nonprod: deploy (branch-scoped — only refs/heads/main)
  #   tfcd-prod:    deploy (branch-scoped — only refs/heads/main)
  # ---------------------------------------------------------------------------

  wif_pool = google_iam_workload_identity_pool.github.name

  # repo-scoped: any workflow in this repo (AR push + PR preview builds)
  wif_repo = "principalSet://iam.googleapis.com/${local.wif_pool}/attribute.repository/${var.github_repo}"
  # branch-scoped: staging + prod both deploy from main; environment-level GitHub
  # approval gates (production-gate) provide the staging↔prod separation.
  wif_main = "principalSet://iam.googleapis.com/${local.wif_pool}/attribute.ref/refs/heads/main"

  # tfcd-infra: AR push only — tfstate access is granted at bucket level below.
  cicd_infra_roles = toset(["roles/artifactregistry.writer"])

  # env projects: deploy workloads.
  cicd_env_roles = toset([
    "roles/run.admin",
    "roles/datastore.owner",
    "roles/iam.serviceAccountAdmin",
    "roles/resourcemanager.projectIamAdmin",
    "roles/iam.serviceAccountUser",
    "roles/secretmanager.admin",
  ])

  # ---------------------------------------------------------------------------
  # Team access controls
  #
  # Access matrix:
  #   tfcd-infra:   no human access — CI/CD pipeline only
  #   tfcd-nonprod: developers (readwrite) — iterate without CI/CD
  #   tfcd-prod:    on-call (readwrite) — roll back/shift traffic during incidents;
  #                 no developer access, CI/CD is the only deploy path
  # ---------------------------------------------------------------------------

  # Shared role set — used for both dev (staging) and on-call (prod)
  roles_readwrite = toset(["roles/run.developer", "roles/logging.viewer", "roles/datastore.viewer"])

  # Each binding map is a cartesian product of members × roles, keyed by
  # "member/role" to guarantee a unique, stable key for for_each.
  dev_nonprod_bindings = {
    for pair in flatten([
      for m in var.developer_members : [for r in local.roles_readwrite : { member = m, role = r }]
    ]) : "${pair.member}/${pair.role}" => pair
  }

  oncall_prod_bindings = {
    for pair in flatten([
      for m in var.oncall_members : [for r in local.roles_readwrite : { member = m, role = r }]
    ]) : "${pair.member}/${pair.role}" => pair
  }
}

# ---------------------------------------------------------------------------
# GCP Projects
# ---------------------------------------------------------------------------

resource "google_project" "infra" {
  name            = local.infra_project_id
  project_id      = local.infra_project_id
  billing_account = var.billing_account
}

resource "google_project" "prod" {
  name            = local.prod_project_id
  project_id      = local.prod_project_id
  billing_account = var.billing_account
}

resource "google_project" "nonprod" {
  name            = local.nonprod_project_id
  project_id      = local.nonprod_project_id
  billing_account = var.billing_account
}

# ---------------------------------------------------------------------------
# Activate Firebase on env projects
#
# google_firebase_project links an existing GCP project to Firebase, enabling
# the Firebase console, Hosting, and other Firebase services. Requires the
# google-beta provider. tfcd-infra does not need Firebase.
# ---------------------------------------------------------------------------

resource "google_firebase_project" "nonprod" {
  provider = google-beta
  project  = google_project.nonprod.project_id

  depends_on = [google_project_service.env_apis]
}

resource "google_firebase_project" "prod" {
  provider = google-beta
  project  = google_project.prod.project_id

  depends_on = [google_project_service.env_apis]
}

# ---------------------------------------------------------------------------
# Enable required APIs
# ---------------------------------------------------------------------------

resource "google_project_service" "infra_apis" {
  for_each           = local.infra_apis
  project            = google_project.infra.project_id
  service            = each.value
  disable_on_destroy = false
}

# Single resource covers all three env projects.
# for_each key "project/api" is the cartesian product of projects × APIs,
# giving each API enablement a unique, stable address in state.
#
# Example:
#   "tfcd-nonprod/run.googleapis.com" => { project = "tfcd-nonprod",  api = "run.googleapis.com" }
resource "google_project_service" "env_apis" {
  for_each = {
    for pair in flatten([
      for project in local.env_project_ids : [
        for api in local.env_apis : { project = project, api = api }
      ]
    ]) : "${pair.project}/${pair.api}" => pair
  }
  project            = each.value.project
  service            = each.value.api
  disable_on_destroy = false

  depends_on = [google_project.nonprod, google_project.prod]
}

# ---------------------------------------------------------------------------
# Shared Artifact Registry (in tfcd-infra)
# ---------------------------------------------------------------------------

resource "google_artifact_registry_repository" "tfcd" {
  project       = google_project.infra.project_id
  location      = "asia-southeast1"
  repository_id = "nnow"
  format        = "DOCKER"
  description   = "Shared Docker registry for all Not Now environments."

  # Keep only the 5 most recent versions per image to stay within the
  # 0.5 GB free tier and avoid unbounded storage growth.
  cleanup_policies {
    id     = "keep-minimum-versions"
    action = "KEEP"
    most_recent_versions {
      keep_count = 5
    }
  }
  cleanup_policy_dry_run = false

  depends_on = [google_project_service.infra_apis]
}

# ---------------------------------------------------------------------------
# Terraform state bucket (in tfcd-infra)
# ---------------------------------------------------------------------------

resource "google_storage_bucket" "tfstate" {
  project                     = google_project.infra.project_id
  name                        = "tfcd-tfstate"
  location                    = "asia-southeast1"
  uniform_bucket_level_access = true
  force_destroy               = false

  versioning {
    enabled = true
  }

  # Delete non-current (superseded) state versions after 30 days to prevent
  # unbounded storage growth while retaining enough history for recovery.
  lifecycle_rule {
    condition {
      days_since_noncurrent_time = 30
    }
    action {
      type = "Delete"
    }
  }

  depends_on = [google_project_service.infra_apis]
}

# ---------------------------------------------------------------------------
# Workload Identity Federation for GitHub Actions (in tfcd-infra)
# ---------------------------------------------------------------------------

resource "google_iam_workload_identity_pool" "github" {
  project                   = google_project.infra.project_id
  workload_identity_pool_id = "github-actions-pool"
  display_name              = "GitHub Actions Pool"
  description               = "WIF pool for keyless GitHub Actions authentication."

  depends_on = [google_project_service.infra_apis]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  project                            = google_project.infra.project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-provider"
  display_name                       = "GitHub OIDC provider"

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }

  attribute_mapping = {
    "google.subject"             = "assertion.sub"
    "attribute.repository"       = "assertion.repository"
    "attribute.repository_owner" = "assertion.repository_owner"
    "attribute.ref"              = "assertion.ref"
  }

  attribute_condition = "assertion.repository == '${var.github_repo}'"
}

# ---------------------------------------------------------------------------
# CI/CD IAM
# ---------------------------------------------------------------------------

resource "google_project_iam_member" "cicd_infra" {
  for_each = local.cicd_infra_roles
  project  = google_project.infra.project_id
  role     = each.value
  member   = local.wif_repo
}

# tfcd-nonprod: only the main branch can deploy
resource "google_project_iam_member" "cicd_nonprod" {
  for_each = local.cicd_env_roles
  project  = google_project.nonprod.project_id
  role     = each.value
  member   = local.wif_main
}

# tfcd-prod: only the main branch can deploy
resource "google_project_iam_member" "cicd_prod" {
  for_each = local.cicd_env_roles
  project  = google_project.prod.project_id
  role     = each.value
  member   = local.wif_main
}

# Minimal custom role for PR preview CI: allows creating and deleting
# per-PR Firestore databases without any data-plane (read/write) access.
# datastore.databases.* permissions have a blank CUSTOM_ROLES_SUPPORT_LEVEL which
# means SUPPORTED (NOT_SUPPORTED would be explicit).
resource "google_project_iam_custom_role" "firestore_db_manager" {
  project     = google_project.nonprod.project_id
  role_id     = "firestoreDbManager"
  title       = "Firestore DB Manager"
  description = "Allows CI to create and delete per-PR Firestore databases. No data-plane access."
  permissions = [
    "datastore.databases.create",
    "datastore.databases.delete",
  ]
}

# tfcd-nonprod: repo-scoped grants for PR preview deployments.
# wif_main only matches refs/heads/main; PR previews run on feature branches, so wif_repo is used.
# The custom firestoreDbManager role is used instead of roles/datastore.owner to
# avoid granting data-plane read/write access to all databases in the project.
resource "google_project_iam_member" "cicd_preview_run" {
  for_each = toset([
    "roles/run.developer",
    "roles/iam.serviceAccountUser",
    "projects/${local.nonprod_project_id}/roles/firestoreDbManager",
  ])
  project = google_project.nonprod.project_id
  role    = each.value
  member  = local.wif_repo

  depends_on = [google_project_iam_custom_role.firestore_db_manager]
}

# tfstate bucket: scoped to bucket rather than project-level storage.admin
resource "google_storage_bucket_iam_member" "cicd_tfstate" {
  bucket = google_storage_bucket.tfstate.name
  role   = "roles/storage.admin"
  member = local.wif_repo
}

# ---------------------------------------------------------------------------
# Firebase Hosting CI/CD service account
#
# Intentionally a key-based SA rather than WIF: FirebaseExtended/action-hosting-deploy
# requires a service account JSON key and does not support ambient ADC credentials.
# Blast radius is limited to Firebase Hosting (deploy/delete releases only) on
# nonprod (staging + PR previews) and prod. Rotate annually or after any team
# member departure.
# ---------------------------------------------------------------------------

resource "google_service_account" "firebase_cicd_nonprod" {
  project      = google_project.infra.project_id
  account_id   = "firebase-cicd-nonprod"
  display_name = "Firebase Hosting CI/CD (nonprod)"
  description  = "Used by FirebaseExtended/action-hosting-deploy in PR preview and staging deploy workflows."
}

resource "google_service_account" "firebase_cicd_prod" {
  project      = google_project.infra.project_id
  account_id   = "firebase-cicd-prod"
  display_name = "Firebase Hosting CI/CD (production)"
  description  = "Used by FirebaseExtended/action-hosting-deploy in the production deploy workflow only."
}

resource "google_project_iam_member" "firebase_cicd_nonprod" {
  for_each = toset([
    "roles/firebasehosting.admin",
    # run.viewer is required so Firebase Hosting can validate the Cloud Run
    # service exists when deploying versions with Cloud Run rewrites.
    "roles/run.viewer",
  ])
  project    = google_project.nonprod.project_id
  role       = each.value
  member     = "serviceAccount:${google_service_account.firebase_cicd_nonprod.email}"
  depends_on = [google_firebase_project.nonprod]
}

resource "google_project_iam_member" "firebase_cicd_prod" {
  project    = google_project.prod.project_id
  role       = "roles/firebasehosting.admin"
  member     = "serviceAccount:${google_service_account.firebase_cicd_prod.email}"
  depends_on = [google_firebase_project.prod]
}

resource "google_service_account_key" "firebase_cicd_nonprod" {
  service_account_id = google_service_account.firebase_cicd_nonprod.name
}

resource "google_service_account_key" "firebase_cicd_prod" {
  service_account_id = google_service_account.firebase_cicd_prod.name
}

# ---------------------------------------------------------------------------
# Per-env app service accounts + Firestore access
#
# The SAs Cloud Run runs as in each env. Managed here (not in
# environments/<env>/) because project-level setIamPolicy on Firebase-linked
# projects requires first-party auth — CI (WIF) cannot accept the Firebase
# ToS, so any setIamPolicy call from CI is rejected. Keeping these in base/
# means the same human who runs `terraform apply` in base/ provisions them.
#
# environments/<env>/main.tf consumes the SA by email as a string literal, so
# it does not need to reference these resources directly.
# ---------------------------------------------------------------------------

resource "google_service_account" "app_nonprod" {
  project      = google_project.nonprod.project_id
  account_id   = "nnow-nonprod-sa"
  display_name = "Not Now nonprod app service account"
  depends_on   = [google_project_service.env_apis]
}

resource "google_service_account" "app_prod" {
  project      = google_project.prod.project_id
  account_id   = "nnow-prod-sa"
  display_name = "Not Now prod app service account"
  depends_on   = [google_project_service.env_apis]
}

# Give the SA propagation time before IAM bindings try to resolve it; without
# this, IAM apply occasionally races and fails with a "does not exist" error.
resource "time_sleep" "wait_for_app_sas" {
  depends_on      = [google_service_account.app_nonprod, google_service_account.app_prod]
  create_duration = "15s"
}

resource "google_project_iam_member" "firestore_user_nonprod" {
  project    = google_project.nonprod.project_id
  role       = "roles/datastore.user"
  member     = "serviceAccount:${google_service_account.app_nonprod.email}"
  depends_on = [time_sleep.wait_for_app_sas]
}

resource "google_project_iam_member" "firestore_user_prod" {
  project    = google_project.prod.project_id
  role       = "roles/datastore.user"
  member     = "serviceAccount:${google_service_account.app_prod.email}"
  depends_on = [time_sleep.wait_for_app_sas]
}

# ---------------------------------------------------------------------------
# Team access controls
# ---------------------------------------------------------------------------

resource "google_project_iam_member" "dev_nonprod" {
  for_each = local.dev_nonprod_bindings
  project  = google_project.nonprod.project_id
  role     = each.value.role
  member   = each.value.member
}

resource "google_project_iam_member" "oncall_prod" {
  for_each = local.oncall_prod_bindings
  project  = google_project.prod.project_id
  role     = each.value.role
  member   = each.value.member
}

# ---------------------------------------------------------------------------
# Budget alert
#
# Sends email notifications to billing account admins at 50%, 90%, and 100%
# of the monthly budget threshold.
# ---------------------------------------------------------------------------

resource "google_billing_budget" "alert" {
  billing_account = var.billing_account
  display_name    = "Not Now Monthly Budget"

  budget_filter {
    projects = [
      "projects/${google_project.infra.number}",
      "projects/${google_project.nonprod.number}",
      "projects/${google_project.prod.number}",
    ]
  }

  amount {
    specified_amount {
      units = tostring(var.budget_alert_usd)
    }
  }

  threshold_rules { threshold_percent = 0.5 }
  threshold_rules { threshold_percent = 0.9 }
  threshold_rules { threshold_percent = 1.0 }

  depends_on = [google_project_service.infra_apis]
}

# ---------------------------------------------------------------------------
# Artifact Registry read access for Cloud Run Service Agents
#
# Cloud Run in each env project pulls images from tfcd-infra's AR. The Cloud
# Run Service Agent (service-{PROJECT_NUMBER}@serverless-robot-prod.iam.gserviceaccount.com)
# must have artifactregistry.reader on the repo in tfcd-infra.
# Scoped to the repository rather than the project for least privilege.
# ---------------------------------------------------------------------------

resource "google_artifact_registry_repository_iam_member" "cloud_run_ar_reader" {
  for_each = {
    nonprod = google_project.nonprod.number
    prod    = google_project.prod.number
  }

  project    = google_project.infra.project_id
  location   = google_artifact_registry_repository.tfcd.location
  repository = google_artifact_registry_repository.tfcd.repository_id
  role       = "roles/artifactregistry.reader"
  member     = "serviceAccount:service-${each.value}@serverless-robot-prod.iam.gserviceaccount.com"

  depends_on = [google_project_service.env_apis]
}

# ---------------------------------------------------------------------------
# Domain registration + parent DNS zone (in tfcd-infra)
#
# Registers tfcd.app via Cloud Domains and creates a Cloud DNS zone in
# tfcd-infra to host top-level records. Subdomain zones (e.g. preview.tfcd.app)
# in other projects are delegated via NS records in this parent zone.
# ---------------------------------------------------------------------------

locals {
  domain_contact = {
    email        = var.domain_contact_email
    phone_number = var.domain_contact_phone
    postal_address = {
      region_code   = var.domain_contact_address.region_code
      postal_code   = var.domain_contact_address.postal_code
      locality      = var.domain_contact_address.locality
      address_lines = var.domain_contact_address.address_lines
      recipients    = ["${var.domain_contact_name.given_name} ${var.domain_contact_name.family_name}"]
    }
  }
}

resource "google_clouddomains_registration" "tfcd_app" {
  project        = google_project.infra.project_id
  location       = "global"
  domain_name    = "tfcd.app"
  domain_notices = ["HSTS_PRELOADED"]

  yearly_price {
    currency_code = "USD"
    units         = 14
  }

  dns_settings {
    custom_dns {
      name_servers = google_dns_managed_zone.tfcd_app.name_servers
    }
  }

  contact_settings {
    privacy = "REDACTED_CONTACT_DATA"

    registrant_contact {
      email        = local.domain_contact.email
      phone_number = local.domain_contact.phone_number

      postal_address {
        region_code   = local.domain_contact.postal_address.region_code
        postal_code   = local.domain_contact.postal_address.postal_code
        locality      = local.domain_contact.postal_address.locality
        address_lines = local.domain_contact.postal_address.address_lines
        recipients    = local.domain_contact.postal_address.recipients
      }
    }

    admin_contact {
      email        = local.domain_contact.email
      phone_number = local.domain_contact.phone_number

      postal_address {
        region_code   = local.domain_contact.postal_address.region_code
        postal_code   = local.domain_contact.postal_address.postal_code
        locality      = local.domain_contact.postal_address.locality
        address_lines = local.domain_contact.postal_address.address_lines
        recipients    = local.domain_contact.postal_address.recipients
      }
    }

    technical_contact {
      email        = local.domain_contact.email
      phone_number = local.domain_contact.phone_number

      postal_address {
        region_code   = local.domain_contact.postal_address.region_code
        postal_code   = local.domain_contact.postal_address.postal_code
        locality      = local.domain_contact.postal_address.locality
        address_lines = local.domain_contact.postal_address.address_lines
        recipients    = local.domain_contact.postal_address.recipients
      }
    }
  }

  depends_on = [google_project_service.infra_apis]

  lifecycle {
    prevent_destroy = true
    ignore_changes = [
      domain_notices,
      yearly_price,
      contact_settings,
      # dns_settings: name_servers has ForceNew in the provider, and the Cloud DNS
      # zone API returns nameservers in a different order/format than Cloud Domains
      # stores them, causing a perpetual diff that would destroy+recreate the
      # registration — blocked by prevent_destroy. Nameservers and DS records are
      # managed out-of-band via:
      #   gcloud domains registrations configure dns tfcd.app \
      #     --cloud-dns-zone=projects/tfcd-infra/managedZones/tfcd-app \
      #     --project=tfcd-infra
      dns_settings,
    ]
  }
}

resource "google_dns_managed_zone" "tfcd_app" {
  project     = google_project.infra.project_id
  name        = "tfcd-app"
  dns_name    = "tfcd.app."
  description = "Parent DNS zone for tfcd.app"

  dnssec_config {
    state = "on"
  }

  depends_on = [google_project_service.infra_apis]
}

data "google_dns_keys" "tfcd_app" {
  managed_zone = google_dns_managed_zone.tfcd_app.id
  project      = google_project.infra.project_id
}

# ---------------------------------------------------------------------------
# Firebase Hosting DNS records
#
# Firebase Hosting serves:
#   todo.tfcd.app         → production Firebase project (tfcd-prod)
#   staging.todo.tfcd.app → nonprod Firebase project (tfcd-nonprod)
#
# Each subdomain gets a CNAME pointing at its Firebase project's default
# Hosting domain (<project-id>.web.app). The CNAME delegates control so
# Firebase issues managed Let's Encrypt certs over HTTP-01 without a
# separate DNS-01 challenge.
# ---------------------------------------------------------------------------

resource "google_dns_record_set" "firebase_production_cname" {
  project      = google_project.infra.project_id
  managed_zone = google_dns_managed_zone.tfcd_app.name
  name         = "todo.tfcd.app."
  type         = "CNAME"
  ttl          = 3600
  rrdatas      = ["${google_project.prod.project_id}.web.app."]

  depends_on = [google_project_service.infra_apis]
}

resource "google_dns_record_set" "firebase_staging_cname" {
  project      = google_project.infra.project_id
  managed_zone = google_dns_managed_zone.tfcd_app.name
  name         = "staging.todo.tfcd.app."
  type         = "CNAME"
  ttl          = 3600
  rrdatas      = ["${google_project.nonprod.project_id}.web.app."]

  depends_on = [google_project_service.infra_apis]
}

# Firebase Hosting custom domain registration for staging.todo.tfcd.app.
# Terraform-managed so the CNAME rdata below can be read as a computed
# attribute instead of hand-copied from the Firebase console.
resource "google_firebase_hosting_custom_domain" "staging" {
  provider              = google-beta
  project               = google_project.nonprod.project_id
  site_id               = google_project.nonprod.project_id # default site id matches project id
  custom_domain         = "staging.todo.tfcd.app"
  wait_dns_verification = false

  depends_on = [google_firebase_project.nonprod]

  lifecycle {
    # cert issuance can churn these fields; don't fight the API on subsequent plans
    ignore_changes = [cert_preference, redirect_target]
  }
}

# Firebase Hosting custom domain registration for todo.tfcd.app (production).
resource "google_firebase_hosting_custom_domain" "prod" {
  provider              = google-beta
  project               = google_project.prod.project_id
  site_id               = google_project.prod.project_id
  custom_domain         = "todo.tfcd.app"
  wait_dns_verification = false

  depends_on = [google_firebase_project.prod]

  lifecycle {
    ignore_changes = [cert_preference, redirect_target]
  }
}

# ---------------------------------------------------------------------------
# Resend email DNS records (in tfcd-infra)
#
# Enables transactional email via Resend on the mail.tfcd.app subdomain.
#   resend._domainkey.mail  — DKIM domain verification (TXT)
#   send.mail               — Bounce handling MX (MX, priority 10)
#   send.mail               — SPF sender policy (TXT)
# ---------------------------------------------------------------------------

resource "google_dns_record_set" "resend_dkim" {
  project      = google_project.infra.project_id
  managed_zone = google_dns_managed_zone.tfcd_app.name
  name         = "resend._domainkey.mail.tfcd.app."
  type         = "TXT"
  ttl          = 3600
  rrdatas      = ["\"p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCZwqlsT2TeFg2wVUPxYvnqfAEsm7hynSvD3+X2U7nsMcpklboq3HKrOf2wgYPsS2SbVpz8RjRil84dEcWCpM5KCBu8IvERG2VGcSE8nwUxC/2Qy/+p8strMQ054AORejOpMlkdQp9mzW9eG3Pgt0o9u2BK6I9TwFYgJWUj6EEWOwIDAQAB\""]

  depends_on = [google_project_service.infra_apis]
}

resource "google_dns_record_set" "resend_mx" {
  project      = google_project.infra.project_id
  managed_zone = google_dns_managed_zone.tfcd_app.name
  name         = "send.mail.tfcd.app."
  type         = "MX"
  ttl          = 3600
  rrdatas      = ["10 feedback-smtp.ap-northeast-1.amazonses.com."]

  depends_on = [google_project_service.infra_apis]
}

resource "google_dns_record_set" "resend_spf" {
  project      = google_project.infra.project_id
  managed_zone = google_dns_managed_zone.tfcd_app.name
  name         = "send.mail.tfcd.app."
  type         = "TXT"
  ttl          = 3600
  rrdatas      = ["\"v=spf1 include:amazonses.com ~all\""]

  depends_on = [google_project_service.infra_apis]
}

resource "google_dns_record_set" "resend_dmarc" {
  project      = google_project.infra.project_id
  managed_zone = google_dns_managed_zone.tfcd_app.name
  name         = "_dmarc.tfcd.app."
  type         = "TXT"
  ttl          = 3600
  rrdatas      = ["\"v=DMARC1; p=none;\""]

  depends_on = [google_project_service.infra_apis]
}

# ---------------------------------------------------------------------------
# Outputs
# ---------------------------------------------------------------------------

output "workload_identity_provider" {
  description = "Full WIF provider resource name — use as workload_identity_provider in google-github-actions/auth."
  value       = google_iam_workload_identity_pool_provider.github.name
  sensitive   = true
}

output "artifact_registry_repository" {
  description = "Artifact Registry repository URL."
  value       = "${google_artifact_registry_repository.tfcd.location}-docker.pkg.dev/${google_project.infra.project_id}/${google_artifact_registry_repository.tfcd.repository_id}"
}

output "tfstate_bucket" {
  description = "Name of the GCS bucket storing Terraform state."
  value       = google_storage_bucket.tfstate.name
}

output "domain_nameservers" {
  description = "Nameservers for the tfcd.app parent DNS zone."
  value       = google_dns_managed_zone.tfcd_app.name_servers
}

output "firebase_service_account_key_staging" {
  description = "Base64-encoded JSON key for the nonprod Firebase CI SA — store as FIREBASE_SERVICE_ACCOUNT in the 'staging' GitHub environment (also used by PR preview channel deploys)."
  value       = google_service_account_key.firebase_cicd_nonprod.private_key
  sensitive   = true
}

output "firebase_service_account_key_prod" {
  description = "Base64-encoded JSON key for production — store as FIREBASE_SERVICE_ACCOUNT in the 'production' GitHub environment."
  value       = google_service_account_key.firebase_cicd_prod.private_key
  sensitive   = true
}

output "dnssec_ds_record" {
  description = "DS record for tfcd.app — publish to the registrar after DNSSEC is enabled on the zone: gcloud domains registrations configure dns tfcd.app --cloud-dns-zone=projects/tfcd-infra/managedZones/tfcd-app --project=tfcd-infra"
  value       = try(data.google_dns_keys.tfcd_app.key_signing_keys[0].ds_record, "DNSSEC not yet active — run terraform apply again after the zone update.")
}
