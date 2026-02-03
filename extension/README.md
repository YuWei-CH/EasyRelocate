# EasyRelocate Extension (Chrome MV3)

## Load unpacked (local dev)
1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `extension/` folder

## Configure API base URL
1. In the extension card, click **Details**
2. Click **Extension options**
3. Set the API base URL (default: `http://127.0.0.1:8000`)
4. Set your **Workspace token** (use the same token as the web app)

## Auto-pairing (recommended)
On the web app’s token page (`/#/onboarding/token`), click **Pair extension** to send the
workspace token to the extension automatically.

Note: the extension does **not** read `.env` files. Its API base URL is stored in Chrome sync storage
and can differ from the frontend’s `VITE_API_BASE_URL` if needed.

All extension API calls require `Authorization: Bearer <workspace_token>` (created by the admin).

## Notes on supported platforms
### Airbnb
Airbnb typically does **not** show precise street addresses. The extension tries to capture:
- Lat/lng (when available in structured data / meta tags)
- A rough location string (city/region)

If only lat/lng is available, the backend may reverse-geocode it to a rough location (city/state).

### Blueground
Blueground property pages include a map location. The extension typically captures:
- Lat/lng (from the page’s embedded data)
- A location string (often including street/building + city)

## UI
- The “Add to Compare” button is draggable; drop it where you like and it will remember the position.

## Selected posts (Facebook group / any site)
You can also save a housing post from any website:
1. Highlight/select the post text
2. Right click → **EasyRelocate: Add selected post**

Or on Facebook groups pages, use the floating button:
- Open a group page like `https://www.facebook.com/groups/...`
- Select text in a post
- Click **Add Selected Post**

This uses the backend endpoint `POST /api/listings/from_text`, which requires `OPENROUTER_API_KEY`
to be set in the repo-root `.env`.
