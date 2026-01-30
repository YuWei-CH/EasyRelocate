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

### Env vars (where to put them)
The backend reads configuration from process environment variables.

EasyRelocate auto-loads a repo-root `.env` file (recommended). Copy `.env.example` → `.env`
in the repo root and put backend env vars there.

You can still override via shell exports if needed.

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
 - `DATABASE_URL` (optional; defaults to `backend/easyrelocate.db`)

### Google setup requirements
If you use Google geocoding (`GEOCODING_PROVIDER=google` or `GOOGLE_MAPS_API_KEY` is set):
- Enable **billing** for your Google Cloud project (Google Maps Platform)
- Enable the **Geocoding API** in Google Cloud Console for that project

If you see:
`Google Geocoding failed with status REQUEST_DENIED: This API is not activated on your API project`
it means the Geocoding API is not enabled (or billing/key restrictions are blocking it).
