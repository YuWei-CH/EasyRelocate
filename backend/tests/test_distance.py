from app.distance import haversine_km


def test_haversine_zero_distance() -> None:
    assert haversine_km(0.0, 0.0, 0.0, 0.0) == 0.0


def test_haversine_small_delta_lat_reasonable() -> None:
    # 0.001 degrees latitude is ~111 meters.
    d = haversine_km(37.0, -122.0, 37.001, -122.0)
    assert 0.09 < d < 0.14

