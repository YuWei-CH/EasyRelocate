# EasyRelocate Backend (FastAPI)

## Prereqs
- Python 3.11+

## Auth (workspaces, no user accounts)
EasyRelocate uses **admin-created workspace tokens** instead of a user login system.

All API calls (except `GET /api/health`) require:
`Authorization: Bearer <workspace_token>`.

Create a token:
```bash
cd backend
python scripts/create_workspace.py
```

Optional (self-serve onboarding): set `ENABLE_PUBLIC_WORKSPACE_ISSUE=1` and the web UI can call
`POST /api/workspaces/issue` to create a 6-month token (protect this endpoint in production).

Admin stats (optional): set `ADMIN_STATS_TOKEN` to enable `GET /api/stats`.
Send `Authorization: Bearer <ADMIN_STATS_TOKEN>` to retrieve total counts for workspaces,
listings, and targets.

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
- Swagger UI: `http://127.0.0.1:8000/docs`
- OpenAPI: `http://127.0.0.1:8000/openapi.json`

## Geocoding (Nominatim / OpenStreetMap)
The backend can:
- Geocode a target address → lat/lng
- Reverse-geocode lat/lng → a rough location string (city/state)

Endpoints:
- `GET /api/geocode?query=...`
- `GET /api/reverse_geocode?lat=...&lng=...`

Env vars:
- `ENABLE_GEOCODING` (default `1`)
- `ENABLE_LISTING_GEOCODE_FALLBACK` (default `0`, if `1` will approximate coords from listing city/region)
- `GEOCODING_COUNTRY_CODES` (optional; defaults are provider-specific)
- `GEOCODING_PROVIDER` (optional: `google` or `nominatim`)
- `GOOGLE_MAPS_API_KEY` (optional; if set, geocoding defaults to Google)
- `GEOCODING_USER_AGENT` (default `EasyRelocate/0.1 (local dev)`)
- `NOMINATIM_BASE_URL` (default `https://nominatim.openstreetmap.org`)
- `GEOCODING_TIMEOUT_S` (default `6`)
- `DATABASE_URL` (optional; defaults to `backend/easyrelocate.db`)
- `CORS_ALLOW_ORIGINS` (optional; comma-separated allowlist for browsers)

### Google setup requirements
If you use Google geocoding (`GEOCODING_PROVIDER=google` or `GOOGLE_MAPS_API_KEY` is set):
- Enable **billing** for your Google Cloud project (Google Maps Platform)
- Enable the **Geocoding API** in Google Cloud Console for that project

If you see:
`Google Geocoding failed with status REQUEST_DENIED: This API is not activated on your API project`
it means the Geocoding API is not enabled (or billing/key restrictions are blocking it).

## LLM extraction (OpenRouter)
The backend can extract monthly rent + location from user-selected text (for Facebook groups, etc.).

Endpoint:
- `POST /api/listings/from_text` (requires `OPENROUTER_API_KEY`)

Env vars:
- `OPENROUTER_API_KEY` (required)
- `OPENROUTER_MODEL` (optional; default `z-ai/glm-4.5-air:free`)
- `OPENROUTER_BASE_URL` (optional)
- `OPENROUTER_TIMEOUT_S` (optional)

Details: `docs/OPENROUTER_LLM_EXTRACTION.md`

## Production database (Cloud SQL Postgres)
Cloud Run instances are ephemeral. For production, set `DATABASE_URL` to Postgres (Cloud SQL).
See: `docs/DEPLOYMENT.md`.
