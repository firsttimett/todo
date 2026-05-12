terraform {
  required_version = "~> 1.7"
  backend "gcs" {
    bucket = "tfcd-tfstate"
    prefix = "tfstate/staging"
  }
  required_providers {
    google = { source = "hashicorp/google", version = "~> 7.0" }
    time   = { source = "hashicorp/time", version = "~> 0.11" }
  }
}

provider "google" {
  project = "tfcd-nonprod"
}
