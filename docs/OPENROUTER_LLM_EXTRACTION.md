# OpenRouter LLM extraction (selected posts)

EasyRelocate can turn **user-selected text** (e.g., a Facebook group housing post) into a saved listing by
using an LLM via **OpenRouter**.

This feature is intentionally **user-driven**:
- We only analyze text the user explicitly selects.
- We do not scrape platforms server-side.

## Data flow
1. User highlights a post (any site), then:
   - Right click → **EasyRelocate: Add selected post**, or
   - On Facebook groups pages, click the floating **Add Selected Post** button.
2. The extension sends `{ text, page_url }` to the backend.
3. Backend calls OpenRouter Chat Completions and parses JSON output.
4. Backend optionally geocodes the extracted `location_text` to get `lat/lng`.
5. Backend stores only the minimal fields (title/price/location/coords), not the full post.

## Backend endpoint
`POST /api/listings/from_text`

Request body:
```json
{
  "text": "…selected text…",
  "page_url": "https://www.facebook.com/groups/…"
}
```

## Environment variables
Put these in the **repo-root** `.env`:
- `OPENROUTER_API_KEY` (required)
- `OPENROUTER_MODEL` (optional; default: `z-ai/glm-4.5-air:free`)
- `OPENROUTER_BASE_URL` (optional; default: `https://openrouter.ai/api/v1`)
- `OPENROUTER_TIMEOUT_S` (optional; default: `25`)
- `OPENROUTER_APP_URL` / `OPENROUTER_APP_NAME` (optional; attribution headers)

## Model choice
Default is `z-ai/glm-4.5-air:free` to keep costs low while we iterate on the MVP.

If extraction quality isn’t good enough, switch to a paid model by setting `OPENROUTER_MODEL`
in `.env` (restart backend after changes).

## Prompt engineering (what we optimize for)
The backend prompt is designed to:
- Extract **monthly rent** only (ignore deposits, background check fees, and other one-time fees).
- Convert weekly/daily pricing to monthly estimates when needed.
- Extract a **geocodable, privacy-preserving** `location_text`:
  - Prefer cross-street / intersection / “Near X & Y” when available.
  - Format as: `X & Y, City, State ZIP, Country` when possible.
  - Example: `US-101 & McLaughlin Ave, San Jose, CA 95121, USA`

Implementation reference: `backend/app/openrouter.py`.

