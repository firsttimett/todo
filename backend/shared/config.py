from functools import lru_cache
from pathlib import Path

from pydantic import model_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    env_name: str
    gcp_project: str
    firestore_database: str = "(default)"
    jwt_public_key: str = ""
    jwt_public_key_file: str = ""
    jwt_private_key: str = ""
    jwt_private_key_file: str = ""
    jwt_algorithm: str = "EdDSA"
    jwt_issuer: str = "nnow-auth"
    jwt_audience: str = "nnow-api"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7

    @model_validator(mode="after")
    def load_key_files(self) -> "Settings":
        if not self.jwt_public_key and self.jwt_public_key_file:
            self.jwt_public_key = Path(self.jwt_public_key_file).read_text().strip()

        if not self.jwt_private_key and self.jwt_private_key_file:
            self.jwt_private_key = Path(self.jwt_private_key_file).read_text().strip()

        if not self.jwt_public_key:
            raise ValueError("jwt_public_key or jwt_public_key_file must be configured")

        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
