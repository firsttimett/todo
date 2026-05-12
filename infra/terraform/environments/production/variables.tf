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
  description = "Resend API key for sending OTP emails."
}

variable "resend_from_email" {
  type        = string
  description = "Sender address for OTP emails."
}

variable "firebase_hosting_sa_bootstrapped" {
  type        = bool
  default     = true
  description = "Whether the Firebase Hosting service agent SA already exists. Set to false on first deploy; CI detects this automatically."
}
