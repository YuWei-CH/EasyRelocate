# Google Maps “Approx Street” (Airbnb) — How it works

## Important note (Airbnb privacy)
Airbnb usually does **not** expose the exact street address. The map pin shown on Airbnb listing pages is typically an **approximate location** (often intentionally offset).

So any street-level result we show is:
- derived from that **approximate pin**, and
- should be treated as **approximate** (“near <street>”), not a ground-truth address.

## Data flow
1. **Extension** extracts a minimal listing snapshot from the Airbnb page:
   - `lat/lng` (preferred; if available), and/or
   - a rough `location_text` (city/region).
2. **Backend** stores the snapshot.
3. **Frontend** (when a listing is selected) calls reverse geocoding to display:
   - `Approx street: <road>` (clearly labeled approximate).

## How we extract the map pin coordinates
File: `extension/platforms/airbnb/content.js`

We try multiple strategies (best → fallback):
1. JSON‑LD (`application/ld+json`) `geo.latitude/longitude`
2. Meta tags (`place:location:*`, `airbnb:location:*`, `og:*`, `geo.position`, `ICBM`)
3. Google Maps links/static map URLs that embed coordinates (`@lat,lng` or `q=lat,lng`)
4. Inline script blobs (regex for `"lat": ... "lng": ...`)

## Reverse geocoding (street name)
The backend exposes:
- `GET /api/reverse_geocode?lat=...&lng=...&zoom=18`

Response includes:
- `rough_location` (city/state when available)
- `approx_street` (street/route name when available)

The UI requests this **on demand** (we don’t persist “street” in the database).

## Using Google Geocoding API (recommended for Google-maps Airbnb pages)
### Requirements
In Google Cloud Console, you must:
1. **Enable billing** for the project (Google Maps Platform).
2. **Enable the “Geocoding API”** on the same project as your API key.

If you see an error like:
`Google Geocoding failed with status REQUEST_DENIED: This API is not activated on your API project`
it means the **Geocoding API is not enabled** (or billing/key restrictions are blocking it).

Set these env vars before starting the backend:
```bash
export GOOGLE_MAPS_API_KEY="YOUR_KEY"
export GEOCODING_PROVIDER="google"
```

Optional:
```bash
export GEOCODING_COUNTRY_CODES="us"
```

Then run:
```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

### Common Google key setup notes
- This project calls Google from the **backend** (server-to-server). If you restrict the key, prefer:
  - Restrict by **API**: allow only **Geocoding API**
  - Optionally restrict by **IP address** (for local dev, this can be inconvenient)

## Local dev env vars
Backend env vars:
- `GOOGLE_MAPS_API_KEY` (enables Google geocoding)
- `GEOCODING_PROVIDER` (`google` or `nominatim`)
- `GEOCODING_COUNTRY_CODES` (default `us`)
- `ENABLE_GEOCODING` (default `1`)
- `ENABLE_LISTING_GEOCODE_FALLBACK` (default `0`, if `1` will approximate coords from city/region text)
