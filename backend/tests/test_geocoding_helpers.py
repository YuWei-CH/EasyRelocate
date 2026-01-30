from app.geocoding import approx_street_from_address, rough_location_from_address


def test_rough_location_city_state() -> None:
    assert rough_location_from_address({"city": "Sunnyvale", "state": "CA"}) == "Sunnyvale, CA"


def test_rough_location_country_only() -> None:
    assert rough_location_from_address({"country": "US"}) == "US"


def test_approx_street_prefers_road() -> None:
    assert approx_street_from_address({"road": "E Middlefield Rd"}) == "E Middlefield Rd"

