module "env" {
  source                = "../../modules/environment"
  project_id            = "tfcd-prod"
  env_name              = "prod"
  service_account_email = "nnow-prod-sa@tfcd-prod.iam.gserviceaccount.com"
  # Budget constraint: Can set min_instances to 0 to avoid charges when idle.
  min_instances     = 1
  max_instances     = 2
  jwt_public_key    = var.jwt_public_key
  jwt_private_key   = var.jwt_private_key
  resend_api_key    = var.resend_api_key
  resend_from_email = var.resend_from_email
}

output "app_url" {
  value = module.env.app_url
}

output "firestore_database" {
  value = module.env.firestore_database
}
