variable "project_id" {
  type        = string
  description = "GCP project ID where resources are deployed."
}

variable "env_name" {
  type        = string
  description = "Short environment name, e.g. prod, staging, my-feature."
}

variable "region" {
  type        = string
  default     = "asia-southeast1"
  description = "GCP region for Cloud Run services and other regional resources."
}

variable "app_image" {
  type        = string
  default     = "us-docker.pkg.dev/cloudrun/container/hello"
  description = <<-EOT
    Placeholder image used only on the first terraform apply so the Cloud Run
    service can be created before CI has built a real image. The deploy job
    replaces this via `gcloud run deploy`, and terraform ignores subsequent
    image drift (see lifecycle.ignore_changes on google_cloud_run_v2_service).
  EOT
}

variable "min_instances" {
  type        = number
  default     = 0
  description = "Minimum number of Cloud Run instances."
}

variable "max_instances" {
  type        = number
  default     = 10
  description = "Maximum number of Cloud Run instances."
}

variable "jwt_public_key" {
  type        = string
  sensitive   = true
  description = "PEM-encoded Ed25519 public key used to verify JWTs."
}

variable "jwt_private_key" {
  type        = string
  sensitive   = true
  description = "PEM-encoded Ed25519 private key used to sign JWTs."
}

variable "resend_api_key" {
  type        = string
  sensitive   = true
  default     = ""
  description = "Resend API key for sending OTP emails. Leave empty to skip sending (logs code instead)."
}

variable "resend_from_email" {
  type        = string
  default     = ""
  description = "Sender address for OTP emails, e.g. noreply@yourdomain.com."
}

variable "otp_bypass_code" {
  type        = string
  sensitive   = true
  default     = ""
  description = "Fixed OTP code for automated testing (staging only). Leave empty for random codes."
}

variable "service_account_email" {
  type        = string
  description = <<-EOT
    Email of a pre-existing service account to run Cloud Run as. For staging
    and prod this is produced by infra/terraform/bootstrap/<env>/. For
    ephemeral envs a shared SA is passed in to stay under the 100 SA/project
    quota.
  EOT
}

variable "deletion_protection" {
  type        = bool
  default     = true
  description = "Whether to enable deletion protection on the Cloud Run service."
}
