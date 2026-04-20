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
        name  = "JWT_PRIVATE_KEY"
        value = var.jwt_private_key
      }
      env {
        name  = "JWT_PUBLIC_KEY"
        value = var.jwt_public_key
      }
      env {
        name  = "RESEND_API_KEY"
        value = var.resend_api_key
      }
      env {
        name  = "RESEND_FROM_EMAIL"
        value = var.resend_from_email
      }
      env {
        name  = "OTP_BYPASS_CODE"
        value = var.otp_bypass_code
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

  depends_on = [google_firestore_database.main]

  lifecycle {
    ignore_changes = [
      client,
      client_version,
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
