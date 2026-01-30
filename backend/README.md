# EasyRelocate Backend (FastAPI)

## Prereqs
- Python 3.11+

## Setup
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Run (dev)
```bash
uvicorn app.main:app --reload --port 8000
```

API docs:
- Swagger UI: `http://localhost:8000/docs`
- OpenAPI: `http://localhost:8000/openapi.json`

## Geocoding (Nominatim / OpenStreetMap)
The backend can:
- Geocode a target address → lat/lng (US-only by default)
- Reverse-geocode lat/lng → a rough location string (city/state)

Endpoints:
- `GET /api/geocode?query=...`
- `GET /api/reverse_geocode?lat=...&lng=...`

Env vars:
- `ENABLE_GEOCODING` (default `1`)
- `ENABLE_LISTING_GEOCODE_FALLBACK` (default `0`, if `1` will approximate coords from listing city/region)
- `GEOCODING_COUNTRY_CODES` (default `us`)
- `GEOCODING_PROVIDER` (optional: `google` or `nominatim`)
- `GOOGLE_MAPS_API_KEY` (optional; if set, geocoding defaults to Google)
- `GEOCODING_USER_AGENT` (default `EasyRelocate/0.1 (local dev)`)
- `NOMINATIM_BASE_URL` (default `https://nominatim.openstreetmap.org`)
- `GEOCODING_TIMEOUT_S` (default `6`)
