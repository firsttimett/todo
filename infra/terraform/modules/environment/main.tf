locals {
  firestore_db     = "nnow-${var.env_name}"
  app_service_name = "nnow-${var.env_name}"
}

# Service account, project-level IAM, and other ToS-governed resources are
# provisioned out-of-band by infra/terraform/bootstrap/<env>/. CI receives
# the pre-created SA's email via var.service_account_email.

# ---------------------------------------------------------------------------
# Firestore database
# ---------------------------------------------------------------------------

resource "google_firestore_database" "main" {
  project         = var.project_id
  name            = local.firestore_db
  location_id     = var.region
  type            = "FIRESTORE_NATIVE"
  deletion_policy = "DELETE"
}

# ---------------------------------------------------------------------------
# Secret Manager — sensitive config stored here instead of Cloud Run env vars
# so values are not visible in revision metadata. Note: secret data still
# passes through Terraform state (GCS); rotate via new secret versions.
# ---------------------------------------------------------------------------

resource "google_secret_manager_secret" "jwt_private_key" {
  project   = var.project_id
  secret_id = "${local.app_service_name}-jwt-private-key"
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "jwt_private_key" {
  secret      = google_secret_manager_secret.jwt_private_key.id
  secret_data = var.jwt_private_key
}

resource "google_secret_manager_secret" "jwt_public_key" {
  project   = var.project_id
  secret_id = "${local.app_service_name}-jwt-public-key"
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "jwt_public_key" {
  secret      = google_secret_manager_secret.jwt_public_key.id
  secret_data = var.jwt_public_key
}

resource "google_secret_manager_secret" "resend_api_key" {
  project   = var.project_id
  secret_id = "${local.app_service_name}-resend-api-key"
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "resend_api_key" {
  secret      = google_secret_manager_secret.resend_api_key.id
  secret_data = var.resend_api_key
}

# Grant the Cloud Run SA read access to each secret
resource "google_secret_manager_secret_iam_member" "jwt_private_key" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.jwt_private_key.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${var.service_account_email}"
}

resource "google_secret_manager_secret_iam_member" "jwt_public_key" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.jwt_public_key.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${var.service_account_email}"
}

resource "google_secret_manager_secret_iam_member" "resend_api_key" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.resend_api_key.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${var.service_account_email}"
}

# ---------------------------------------------------------------------------
# Cloud Run — unified app service (auth + todo)
#
# Ingress is set to INGRESS_TRAFFIC_ALL so Firebase Hosting rewrites can
# reach the service directly. There is no load balancer in front of this
# service; Firebase handles SSL, CDN, and routing for the frontend.
# ---------------------------------------------------------------------------

resource "google_cloud_run_v2_service" "app" {
  project             = var.project_id
  name                = local.app_service_name
  location            = var.region
  deletion_protection = var.deletion_protection
  ingress             = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = var.service_account_email

    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    containers {
      # Placeholder on first apply; the deploy job replaces this with the real
      # image via `gcloud run deploy`. terraform ignores subsequent image drift
      # (see lifecycle.ignore_changes below) so the two don't fight.
      image = var.app_image

      env {
        name  = "ENV_NAME"
        value = var.env_name
      }
      env {
        name  = "GCP_PROJECT"
        value = var.project_id
      }
      env {
        name  = "FIRESTORE_DATABASE"
        value = local.firestore_db
      }
      env {
        name  = "RESEND_FROM_EMAIL"
        value = var.resend_from_email
      }

      env {
        name = "JWT_PRIVATE_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.jwt_private_key.secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "JWT_PUBLIC_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.jwt_public_key.secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "RESEND_API_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.resend_api_key.secret_id
            version = "latest"
          }
        }
      }

      dynamic "env" {
        for_each = var.otp_bypass_code != "" ? { otp = var.otp_bypass_code } : {}
        content {
          name  = "OTP_BYPASS_CODE"
          value = env.value
        }
      }

      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }
    }
  }

  depends_on = [
    google_firestore_database.main,
    google_secret_manager_secret_version.jwt_private_key,
    google_secret_manager_secret_version.jwt_public_key,
    google_secret_manager_secret_version.resend_api_key,
    google_secret_manager_secret_iam_member.jwt_private_key,
    google_secret_manager_secret_iam_member.jwt_public_key,
    google_secret_manager_secret_iam_member.resend_api_key,
  ]

  lifecycle {
    ignore_changes = [
      client,
      client_version,
      template[0].revision,
      template[0].containers[0].image,
    ]
  }
}

resource "google_cloud_run_v2_service_iam_member" "app_invoker" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.app.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
