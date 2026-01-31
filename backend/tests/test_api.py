import os
import sys
from pathlib import Path


def test_importable() -> None:
    os.environ["DATABASE_URL"] = "sqlite+pysqlite:///:memory:"
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from app.main import app  # noqa: F401


def test_create_and_delete_listing() -> None:
    os.environ["DATABASE_URL"] = "sqlite+pysqlite:///:memory:"
    os.environ["ENABLE_PUBLIC_WORKSPACE_ISSUE"] = "1"
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as client:
        token_res = client.post("/api/workspaces/issue")
        assert token_res.status_code == 200, token_res.text
        token = token_res.json()["workspace_token"]
        headers = {"Authorization": f"Bearer {token}"}
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
            headers=headers,
        )
        assert created.status_code == 200, created.text
        listing_id = created.json()["id"]

        deleted = client.delete(f"/api/listings/{listing_id}", headers=headers)
        assert deleted.status_code == 200, deleted.text
        assert deleted.json()["deleted"] is True

        after = client.get("/api/listings", headers=headers)
        assert after.status_code == 200, after.text
        assert after.json() == []
