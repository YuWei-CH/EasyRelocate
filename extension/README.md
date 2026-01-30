# EasyRelocate Extension (Chrome MV3)

## Load unpacked (local dev)
1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `extension/` folder

## Configure API base URL
1. In the extension card, click **Details**
2. Click **Extension options**
3. Set the API base URL (default: `http://localhost:8000`)

Note: the extension does **not** read `.env` files. Its API base URL is stored in Chrome sync storage
and can differ from the frontend’s `VITE_API_BASE_URL` if needed.

## Notes on Airbnb location
Airbnb typically does **not** show precise street addresses. The extension tries to capture:
- Lat/lng (when available in structured data / meta tags)
- A rough location string (city/region)

If only lat/lng is available, the backend may reverse-geocode it to a rough location (city/state).

## UI
- The “Add to Compare” button is draggable; drop it where you like and it will remember the position.
