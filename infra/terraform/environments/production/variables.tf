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
