# EasyRelocate
EasyRelocate is an open-source, non-commercial decision-support tool for housing relocation.

When relocating for an internship, research visit, or new job, housing information is often fragmented across multiple platforms, making comparison slow and error-prone. EasyRelocate helps users organize and compare housing options by focusing on what matters most: where to live, not where to book.

Users collect listings while browsing platforms such as Airbnb, BlueGround, facebook group using a lightweight browser extension. EasyRelocate then aggregates the minimal, user-authorized information needed to visualize listings on a single map and compare them by price, location, and commute time to a chosen workplace.

EasyRelocate does not scrape platforms server-side, host listings, process payments, or replace original marketplaces. It exists solely to help users make better relocation decisions, while respecting platform boundaries and directing all final actions back to the original sources.

## Repo structure
- `backend/`: FastAPI + SQLite API
- `frontend/`: React (Vite) web app (MapLibre + OpenStreetMap map, US-only for now)
- `extension/`: Chrome extension (Manifest V3) for user-side extraction

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

## Docs
- Platform organization: `docs/PLATFORM_ORGANIZATION.md`
- Google maps “approx street”: `docs/GOOGLE_MAPS_APPROX_LOCATION.md`
