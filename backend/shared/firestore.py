from google.cloud import firestore

from shared.config import Settings


def get_firestore_client(settings: Settings) -> firestore.AsyncClient:
    return firestore.AsyncClient(
        project=settings.gcp_project,
        database=settings.firestore_database,
    )
