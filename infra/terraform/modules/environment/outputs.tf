output "app_url" {
  description = "Cloud Run URL for the unified app service."
  value       = google_cloud_run_v2_service.app.uri
}

output "firestore_database" {
  description = "Name of the Firestore database created for this environment."
  value       = google_firestore_database.main.name
}

output "app_service_account_email" {
  description = "Email of the Cloud Run service account. Used in CI to grant per-PR Firestore database access."
  value       = var.service_account_email
  sensitive   = true
}
