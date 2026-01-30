from __future__ import annotations

import os
from dataclasses import dataclass

import httpx


DEFAULT_NOMINATIM_BASE_URL = os.getenv(
    "NOMINATIM_BASE_URL", "https://nominatim.openstreetmap.org"
).rstrip("/")
DEFAULT_COUNTRY_CODES = os.getenv("GEOCODING_COUNTRY_CODES", "us")
DEFAULT_USER_AGENT = os.getenv(
    "GEOCODING_USER_AGENT", "EasyRelocate/0.1 (local dev)"
)
DEFAULT_TIMEOUT_S = float(os.getenv("GEOCODING_TIMEOUT_S", "6"))
ENABLE_GEOCODING = os.getenv("ENABLE_GEOCODING", "1") not in {"0", "false", "False"}
GEOCODING_PROVIDER = os.getenv("GEOCODING_PROVIDER", "").strip().lower()
GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY")


@dataclass(frozen=True)
class GeocodeResult:
    display_name: str
    lat: float
    lng: float


@dataclass(frozen=True)
class ReverseGeocodeResult:
    display_name: str | None
    address: dict[str, object] | None


def _client() -> httpx.Client:
    return httpx.Client(
        base_url=DEFAULT_NOMINATIM_BASE_URL,
        timeout=DEFAULT_TIMEOUT_S,
        headers={"User-Agent": DEFAULT_USER_AGENT},
    )


def _provider() -> str:
    if GEOCODING_PROVIDER in {"google", "nominatim"}:
        return GEOCODING_PROVIDER
    if GOOGLE_MAPS_API_KEY:
        return "google"
    return "nominatim"


def _google_country_component() -> str | None:
    if not DEFAULT_COUNTRY_CODES:
        return None
    codes = [c.strip().lower() for c in DEFAULT_COUNTRY_CODES.split(",") if c.strip()]
    if not codes:
        return None
    return f"country:{codes[0]}"


def _google_geocode_address(query: str, *, limit: int) -> list[GeocodeResult]:
    if not GOOGLE_MAPS_API_KEY:
        return []
    q = query.strip()
    if not q:
        return []

    params: dict[str, str] = {"address": q, "key": GOOGLE_MAPS_API_KEY}
    comp = _google_country_component()
    if comp:
        params["components"] = comp

    res = httpx.get(
        "https://maps.googleapis.com/maps/api/geocode/json",
        params=params,
        timeout=DEFAULT_TIMEOUT_S,
    )
    res.raise_for_status()
    data = res.json()

    if not isinstance(data, dict):
        return []
    if data.get("status") != "OK":
        return []
    results = data.get("results")
    if not isinstance(results, list):
        return []

    out: list[GeocodeResult] = []
    for item in results:
        if not isinstance(item, dict):
            continue
        formatted = item.get("formatted_address")
        if not isinstance(formatted, str):
            formatted = q
        geometry = item.get("geometry")
        if not isinstance(geometry, dict):
            continue
        location = geometry.get("location")
        if not isinstance(location, dict):
            continue
        lat = _as_float(location.get("lat"))
        lng = _as_float(location.get("lng"))
        if lat is None or lng is None:
            continue
        out.append(GeocodeResult(display_name=formatted, lat=lat, lng=lng))
        if len(out) >= max(1, min(limit, 10)):
            break
    return out


def _google_reverse_geocode(lat: float, lng: float) -> ReverseGeocodeResult:
    if not GOOGLE_MAPS_API_KEY:
        return ReverseGeocodeResult(display_name=None, address=None)

    params: dict[str, str] = {"latlng": f"{lat},{lng}", "key": GOOGLE_MAPS_API_KEY}
    res = httpx.get(
        "https://maps.googleapis.com/maps/api/geocode/json",
        params=params,
        timeout=DEFAULT_TIMEOUT_S,
    )
    res.raise_for_status()
    data = res.json()

    if not isinstance(data, dict):
        return ReverseGeocodeResult(display_name=None, address=None)
    if data.get("status") != "OK":
        return ReverseGeocodeResult(display_name=None, address=None)
    results = data.get("results")
    if not isinstance(results, list) or not results:
        return ReverseGeocodeResult(display_name=None, address=None)

    first = results[0]
    if not isinstance(first, dict):
        return ReverseGeocodeResult(display_name=None, address=None)

    display_name = first.get("formatted_address")
    if not isinstance(display_name, str):
        display_name = None

    address_components = first.get("address_components")
    address: dict[str, object] = {}
    if isinstance(address_components, list):
        for comp in address_components:
            if not isinstance(comp, dict):
                continue
            types = comp.get("types")
            if not isinstance(types, list):
                continue

            long_name = comp.get("long_name")
            short_name = comp.get("short_name")
            if not isinstance(long_name, str):
                long_name = None
            if not isinstance(short_name, str):
                short_name = None

            if "route" in types and long_name:
                address["road"] = long_name
            if ("locality" in types or "postal_town" in types) and long_name:
                address["city"] = long_name
            if "administrative_area_level_1" in types:
                if short_name:
                    address["state"] = short_name
                elif long_name:
                    address["state"] = long_name
            if "country" in types:
                if short_name:
                    address["country"] = short_name
                elif long_name:
                    address["country"] = long_name

    return ReverseGeocodeResult(display_name=display_name, address=address or None)


def _as_float(v: object) -> float | None:
    try:
        f = float(str(v))
    except (TypeError, ValueError):
        return None
    if not (f == f and abs(f) != float("inf")):
        return None
    return f


def rough_location_from_address(address: dict[str, object] | None) -> str | None:
    if not address:
        return None

    def _get(*keys: str) -> str | None:
        for k in keys:
            v = address.get(k)
            if isinstance(v, str) and v.strip():
                return v.strip()
        return None

    city = _get("city", "town", "village", "municipality", "hamlet", "locality")
    state = _get("state", "region")
    country = _get("country")

    parts: list[str] = []
    if city:
        parts.append(city)
    if state:
        parts.append(state)
    if not parts and country:
        parts.append(country)

    return ", ".join(parts) if parts else None


def approx_street_from_address(address: dict[str, object] | None) -> str | None:
    if not address:
        return None

    def _get(*keys: str) -> str | None:
        for k in keys:
            v = address.get(k)
            if isinstance(v, str) and v.strip():
                return v.strip()
        return None

    return _get("road", "pedestrian", "footway", "cycleway", "path")


def geocode_address(query: str, *, limit: int = 5) -> list[GeocodeResult]:
    if not ENABLE_GEOCODING:
        return []
    if _provider() == "google":
        return _google_geocode_address(query, limit=limit)
    q = query.strip()
    if not q:
        return []

    params = {
        "q": q,
        "format": "jsonv2",
        "limit": str(max(1, min(limit, 10))),
        "addressdetails": "1",
    }
    if DEFAULT_COUNTRY_CODES:
        params["countrycodes"] = DEFAULT_COUNTRY_CODES

    with _client() as client:
        res = client.get("/search", params=params)
        res.raise_for_status()
        data = res.json()

    if not isinstance(data, list):
        return []

    out: list[GeocodeResult] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        lat = _as_float(item.get("lat"))
        lng = _as_float(item.get("lon"))
        display_name = item.get("display_name")
        if lat is None or lng is None or not isinstance(display_name, str):
            continue
        out.append(GeocodeResult(display_name=display_name, lat=lat, lng=lng))
    return out


def reverse_geocode(lat: float, lng: float, *, zoom: int = 10) -> ReverseGeocodeResult:
    if not ENABLE_GEOCODING:
        return ReverseGeocodeResult(display_name=None, address=None)
    if _provider() == "google":
        # Google Geocoding doesn't support the same zoom semantics.
        return _google_reverse_geocode(lat, lng)

    params = {
        "lat": str(lat),
        "lon": str(lng),
        "format": "jsonv2",
        "addressdetails": "1",
        "zoom": str(max(0, min(zoom, 18))),
    }

    with _client() as client:
        res = client.get("/reverse", params=params)
        res.raise_for_status()
        data = res.json()

    if not isinstance(data, dict):
        return ReverseGeocodeResult(display_name=None, address=None)

    display_name = data.get("display_name")
    if not isinstance(display_name, str):
        display_name = None

    address = data.get("address")
    if not isinstance(address, dict):
        address = None

    return ReverseGeocodeResult(display_name=display_name, address=address)
