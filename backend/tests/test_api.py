import os
import sys
from pathlib import Path


def test_importable() -> None:
    os.environ["DATABASE_URL"] = "sqlite+pysqlite:///:memory:"
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from app.main import app  # noqa: F401


def test_create_and_delete_listing() -> None:
    os.environ["DATABASE_URL"] = "sqlite+pysqlite:///:memory:"
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as client:
        created = client.post(
            "/api/listings",
            json={
                "source": "airbnb",
                "source_url": "https://www.airbnb.com/rooms/123",
                "title": "Test",
                "currency": "USD",
                "price_period": "unknown",
                "captured_at": "2026-01-30T10:00:00Z",
            },
        )
        assert created.status_code == 200, created.text
        listing_id = created.json()["id"]

        deleted = client.delete(f"/api/listings/{listing_id}")
        assert deleted.status_code == 200, deleted.text
        assert deleted.json()["deleted"] is True

        after = client.get("/api/listings")
        assert after.status_code == 200, after.text
        assert after.json() == []
