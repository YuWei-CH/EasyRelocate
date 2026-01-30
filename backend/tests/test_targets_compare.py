from fastapi.testclient import TestClient

import app.main as main
from app.distance import haversine_km
from app.geocoding import GeocodeResult, ReverseGeocodeResult


def test_geocode_endpoint_uses_provider(monkeypatch) -> None:
    def fake_geocode_address(query: str, *, limit: int = 5) -> list[GeocodeResult]:
        assert query.strip() == "Waymo"
        assert limit == 1
        return [GeocodeResult(display_name="Waymo HQ", lat=37.416, lng=-122.077)]

    monkeypatch.setattr(main, "geocode_address", fake_geocode_address)

    with TestClient(main.app) as client:
        res = client.get("/api/geocode", params={"query": "Waymo", "limit": 1})
        assert res.status_code == 200, res.text
        data = res.json()
        assert data == [{"display_name": "Waymo HQ", "lat": 37.416, "lng": -122.077}]


def test_reverse_geocode_endpoint_returns_rough_and_street(monkeypatch) -> None:
    def fake_reverse_geocode(lat: float, lng: float, *, zoom: int = 10) -> ReverseGeocodeResult:
        assert zoom == 18
        assert lat == 37.416
        assert lng == -122.077
        return ReverseGeocodeResult(
            display_name="690 E Middlefield Rd, Mountain View, CA 94043, USA",
            address={"city": "Mountain View", "state": "CA", "road": "E Middlefield Rd"},
        )

    monkeypatch.setattr(main, "reverse_geocode", fake_reverse_geocode)

    with TestClient(main.app) as client:
        res = client.get(
            "/api/reverse_geocode", params={"lat": 37.416, "lng": -122.077, "zoom": 18}
        )
        assert res.status_code == 200, res.text
        data = res.json()
        assert data["rough_location"] == "Mountain View, CA"
        assert data["approx_street"] == "E Middlefield Rd"


def test_upsert_target_address_only_geocodes(monkeypatch) -> None:
    def fake_geocode_address(query: str, *, limit: int = 5) -> list[GeocodeResult]:
        assert "Middlefield" in query
        assert limit == 1
        return [GeocodeResult(display_name="Waymo HQ", lat=37.416, lng=-122.077)]

    monkeypatch.setattr(main, "geocode_address", fake_geocode_address)

    with TestClient(main.app) as client:
        res = client.post(
            "/api/targets",
            json={
                "name": "Workplace",
                "address": "690 E Middlefield Rd, Mountain View, CA 94043",
            },
        )
        assert res.status_code == 200, res.text
        data = res.json()
        assert data["name"] == "Workplace"
        assert data["address"] == "690 E Middlefield Rd, Mountain View, CA 94043"
        assert data["lat"] == 37.416
        assert data["lng"] == -122.077


def test_upsert_target_coords_only_reverse_geocodes(monkeypatch) -> None:
    def fake_reverse_geocode(lat: float, lng: float, *, zoom: int = 10) -> ReverseGeocodeResult:
        assert zoom == 14
        return ReverseGeocodeResult(
            display_name="Mountain View, CA 94043, USA",
            address={"city": "Mountain View", "state": "CA"},
        )

    monkeypatch.setattr(main, "reverse_geocode", fake_reverse_geocode)

    with TestClient(main.app) as client:
        res = client.post(
            "/api/targets",
            json={"name": "Workplace", "lat": 37.416, "lng": -122.077},
        )
        assert res.status_code == 200, res.text
        data = res.json()
        assert data["address"] == "Mountain View, CA"
        assert data["lat"] == 37.416
        assert data["lng"] == -122.077


def test_target_rejects_both_address_and_coords() -> None:
    with TestClient(main.app) as client:
        res = client.post(
            "/api/targets",
            json={
                "name": "Workplace",
                "address": "690 E Middlefield Rd, Mountain View, CA 94043",
                "lat": 37.416,
                "lng": -122.077,
            },
        )
        assert res.status_code == 422, res.text


def test_compare_computes_distance_and_preserves_listing_order(monkeypatch) -> None:
    def fake_reverse_geocode(lat: float, lng: float, *, zoom: int = 10) -> ReverseGeocodeResult:
        return ReverseGeocodeResult(display_name="Mountain View, CA", address={"city": "Mountain View"})

    monkeypatch.setattr(main, "reverse_geocode", fake_reverse_geocode)

    with TestClient(main.app) as client:
        t = client.post("/api/targets", json={"name": "Workplace", "lat": 37.416, "lng": -122.077})
        assert t.status_code == 200, t.text
        target_id = t.json()["id"]

        l1 = client.post(
            "/api/listings",
            json={
                "source": "airbnb",
                "source_url": "https://www.airbnb.com/rooms/1",
                "title": "Newer listing",
                "currency": "USD",
                "price_period": "unknown",
                "price_value": 3000,
                "lat": 37.426,
                "lng": -122.087,
                "location_text": "Mountain View, CA",
                "captured_at": "2026-01-30T12:00:00Z",
            },
        )
        assert l1.status_code == 200, l1.text

        l2 = client.post(
            "/api/listings",
            json={
                "source": "airbnb",
                "source_url": "https://www.airbnb.com/rooms/2",
                "title": "Older listing (no coords)",
                "currency": "USD",
                "price_period": "unknown",
                "price_value": 2500,
                "captured_at": "2026-01-30T10:00:00Z",
            },
        )
        assert l2.status_code == 200, l2.text

        res = client.get("/api/compare", params={"target_id": target_id})
        assert res.status_code == 200, res.text
        data = res.json()

        items = data["items"]
        assert len(items) == 2
        assert items[0]["listing"]["source_url"] == "https://www.airbnb.com/rooms/1"
        assert items[1]["listing"]["source_url"] == "https://www.airbnb.com/rooms/2"

        d = items[0]["metrics"]["distance_km"]
        assert d is not None
        expected = haversine_km(37.426, -122.087, 37.416, -122.077)
        assert abs(d - expected) < 1e-6

        assert items[1]["metrics"]["distance_km"] is None


def test_listings_summary_empty_then_one() -> None:
    with TestClient(main.app) as client:
        empty = client.get("/api/listings/summary")
        assert empty.status_code == 200, empty.text
        assert empty.json() == {"count": 0, "latest_id": None, "latest_captured_at": None}

        created = client.post(
            "/api/listings",
            json={
                "source": "airbnb",
                "source_url": "https://www.airbnb.com/rooms/summary-test",
                "title": "Summary test",
                "currency": "USD",
                "price_period": "unknown",
                "captured_at": "2026-01-30T10:00:00Z",
            },
        )
        assert created.status_code == 200, created.text
        listing_id = created.json()["id"]

        after = client.get("/api/listings/summary")
        assert after.status_code == 200, after.text
        data = after.json()
        assert data["count"] == 1
        assert data["latest_id"] == listing_id
        assert data["latest_captured_at"] == "2026-01-30T10:00:00Z"
