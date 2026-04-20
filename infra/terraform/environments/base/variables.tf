variable "billing_account" {
  type        = string
  description = "GCP billing account ID to associate with all created projects."
}

variable "github_repo" {
  type        = string
  description = "GitHub repository in owner/repo format, used to scope Workload Identity Federation."
}

variable "developer_members" {
  type        = list(string)
  default     = []
  description = "IAM members granted developer access (e.g. [\"user:dev@example.com\"]). Gets full nonprod access and read-only staging access. No prod or infra access."
}

variable "oncall_members" {
  type        = list(string)
  default     = []
  description = "IAM members granted on-call access (e.g. [\"user:oncall@example.com\"]). Gets full staging access and read-only prod access for incident debugging. No infra access."
}

variable "budget_alert_usd" {
  type        = number
  default     = 10
  description = "Monthly budget threshold in the billing account's currency. Email alerts are sent to billing account admins at 50%, 90%, and 100% of this amount."
}

variable "resolve_hosting_dns" {
  type        = bool
  default     = true
  description = <<-EOT
    Whether to create the Firebase Hosting A records and ACME DNS-01 TXT records.
    Their rdata derives from google_firebase_hosting_custom_domain.<env>.required_dns_updates,
    which is unknown at plan time before the custom domain registrations exist.
    Terraform rejects count/for_each values that depend on unknowns, so during
    bootstrap (terraform import and the first apply) this must be set to false.
    After the custom domains are created, subsequent plans know required_dns_updates
    and the default (true) resolves the four DNS records.
  EOT
}

# ---------------------------------------------------------------------------
# Domain registration contact details
# ---------------------------------------------------------------------------

variable "domain_contact_email" {
  type        = string
  description = "Email address for the domain registrant contact."
}

variable "domain_contact_phone" {
  type        = string
  description = "Phone number in E.164 format (e.g. +6512345678) for the domain registrant contact."
}

variable "domain_contact_name" {
  type = object({
    given_name  = string
    family_name = string
  })
  description = "Full name of the domain registrant contact (eg: { given_name = \"Harry\", family_name = \"Potter\" })"
}

variable "domain_contact_address" {
  type = object({
    region_code   = string
    postal_code   = string
    locality      = string
    address_lines = list(string)
  })
  description = "Postal address for the domain registrant contact (e.g. { region_code = \"SG\", postal_code = \"123456\", locality = \"Singapore\", address_lines = [\"123 Main St\"] })."
}
