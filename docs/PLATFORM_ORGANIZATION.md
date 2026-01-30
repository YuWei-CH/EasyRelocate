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
    facebook/
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
- The extension uses a platform folder for Airbnb at `extension/platforms/airbnb/content.js`.

