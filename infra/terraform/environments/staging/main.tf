module "env" {
  source                = "../../modules/environment"
  project_id            = "tfcd-nonprod"
  env_name              = "nonprod"
  service_account_email = "nnow-nonprod-sa@tfcd-nonprod.iam.gserviceaccount.com"
  min_instances         = 0
  max_instances         = 10
  jwt_public_key        = var.jwt_public_key
  jwt_private_key       = var.jwt_private_key
  resend_api_key        = var.resend_api_key
  resend_from_email     = var.resend_from_email
  otp_bypass_code       = var.otp_bypass_code
}

output "app_url" {
  value = module.env.app_url
}

output "firestore_database" {
  value = module.env.firestore_database
}
