# EasyRelocate
EasyRelocate is an open-source, non-commercial decision-support tool for housing relocation.

When relocating for an internship, research visit, or new job, housing information is often fragmented across multiple platforms, making comparison slow and error-prone. EasyRelocate helps users organize and compare housing options by focusing on what matters most: where to live, not where to book.

Users collect listings while browsing platforms such as Airbnb, BlueGround, facebook group using a lightweight browser extension. EasyRelocate then aggregates the minimal, user-authorized information needed to visualize listings on a single map and compare them by price, location, and commute time to a chosen workplace.

EasyRelocate does not scrape platforms server-side, host listings, process payments, or replace original marketplaces. It exists solely to help users make better relocation decisions, while respecting platform boundaries and directing all final actions back to the original sources.

## Repo structure
- `backend/`: FastAPI + SQLite API
- `frontend/`: React (Vite) web app (Google Maps JS map + routing, US-only for now)
- `extension/`: Chrome extension (Manifest V3) for user-side extraction

## Configuration (API keys & env vars)
EasyRelocate uses a single repo-root `.env` file for both frontend + backend.

1. Copy the example:
```bash
cp .env.example .env
```

2. Edit `.env` and set your keys.

### Frontend (Vite / browser)
Frontend variables must start with `VITE_`:
```bash
# Required (browser key)
VITE_GOOGLE_MAPS_API_KEY="YOUR_BROWSER_KEY"

# Optional (defaults to http://localhost:8000)
VITE_API_BASE_URL="http://localhost:8000"

# Optional (useful for CI / keyless dev)
# VITE_DISABLE_GOOGLE_MAPS="1"
```

### Backend (FastAPI / server)
Backend reads standard env vars (auto-loads repo-root `.env` on startup):
```bash
# Optional (server key; used for /api/geocode and /api/reverse_geocode)
GOOGLE_MAPS_API_KEY="YOUR_SERVER_KEY"
GEOCODING_PROVIDER="google"

# Optional
ENABLE_GEOCODING="1"
DATABASE_URL="sqlite:///easyrelocate.db"
```

### Extension (Chrome)
The extension does not read `.env` files. Configure its API base URL in Chrome:
Extension → **Details** → **Extension options** → “API base URL” (default: `http://localhost:8000`).

## Local dev (MVP)

### 1) Backend API
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

API docs: `http://localhost:8000/docs`

### 2) Frontend
```bash
cd frontend
npm install
npm run dev
```

Open: `http://localhost:5173` (landing page)

Compare app: `http://localhost:5173/#/compare`

Set your workplace target by:
- Typing an address (US) and clicking **Save**, or
- Clicking **Pick on map** and then clicking the map, then **Save**

### 3) Browser extension (Chrome)
1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `extension/` folder
5. In the extension **Options**, set API base URL to `http://localhost:8000` (default)

Then open an Airbnb listing detail page (`/rooms/...`) and click “Add to Compare”.

## Google Maps setup (required)
EasyRelocate uses Google Maps Platform for:
- **Maps JavaScript API** (frontend map)
- **Directions API** (routing: Drive/Bus/Walk/Bike)
- **Geocoding API** (backend address lookup; optional but recommended)

See: `docs/GOOGLE_MAPS_APPROX_LOCATION.md`

## Docs
- Platform organization: `docs/PLATFORM_ORGANIZATION.md`
- Google maps “approx street”: `docs/GOOGLE_MAPS_APPROX_LOCATION.md`
