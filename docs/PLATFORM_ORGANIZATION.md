# Platform organization (Airbnb, Blueground, Facebook, …)

## Recommendation
Split **platform-specific extraction** in the browser extension, and keep the backend mostly **platform-agnostic** (storage + compare + metrics).

Why:
- Platform pages change frequently; keeping that logic isolated reduces blast radius.
- The backend should stay stable: it stores a minimal schema and computes metrics.

## Proposed structure

### Extension
One content script per platform:
```
extension/
  platforms/
    airbnb/
      content.js
    blueground/
      content.js
  background.js
  options.html
  options.js
  manifest.json
```

Each platform content script should:
- Match only its own URLs in `manifest.json`
- Extract the same minimal listing schema (`source`, `source_url`, `title`, `price`, `lat/lng`, …)
- POST to the same backend endpoint (`POST /api/listings`)

For “Facebook group / any site” posts, prefer a selection-based flow (no site-specific content script):
- User highlights text → right click → **EasyRelocate: Add selected post**
- Extension calls `POST /api/listings/from_text` (backend uses OpenRouter to extract location + monthly rent)

Shared code (later) can live in `extension/shared/` (e.g., overlay UI, storage helpers).

### Backend
Keep “core” code stable:
```
backend/app/
  db.py
  models.py
  schemas.py
  main.py
```

If/when needed, add a thin `backend/app/platforms/` layer for:
- URL normalization per platform
- Lightweight validation / normalization
- Optional “source metadata” (still minimal; avoid storing full descriptions/images)

## Current status
- Shared overlay UI lives at `extension/shared/overlay.js`.
- Platform extraction scripts:
  - Airbnb: `extension/platforms/airbnb/content.js`
  - Blueground: `extension/platforms/blueground/content.js`
- Facebook groups: `extension/platforms/facebook/content.js`
- Selected-post extraction:
  - Extension context menu: `extension/background.js`
  - Backend LLM endpoint: `POST /api/listings/from_text`

## Multi-user (workspaces)
EasyRelocate supports multiple users via **separate workspaces**, identified by an **admin-created token**.
All backend endpoints (except `GET /api/health`) require:
`Authorization: Bearer <workspace_token>`.

Deployment guidance (Vercel + Cloud Run + Cloud SQL Postgres):
`docs/DEPLOYMENT.md`.
