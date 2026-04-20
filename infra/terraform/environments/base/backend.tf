terraform {
  required_version = "~> 1.7"
  backend "gcs" {
    bucket = "tfcd-tfstate-bootstrap"
    prefix = "tfstate/base"
  }
  required_providers {
    google      = { source = "hashicorp/google", version = "~> 7.0" }
    google-beta = { source = "hashicorp/google-beta", version = "~> 7.0" }
    time        = { source = "hashicorp/time", version = "~> 0.11" }
  }
}

provider "google" {
  billing_project       = "tfcd-infra"
  user_project_override = true
}

provider "google-beta" {
  billing_project       = "tfcd-infra"
  user_project_override = true
}
