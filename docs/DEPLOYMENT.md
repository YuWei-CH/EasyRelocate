# Deployment (Engineering Runbook)

This doc describes two production-minded deployment options for EasyRelocate:

**Option A (Managed GCP)**
- Frontend: **Vercel**
- Backend: **Cloud Run**
- Database: **Cloud SQL Postgres**

**Option B (Self-hosted server)**
- Frontend: **Vercel**
- Backend + Database: **your miniPC / server** (Docker Compose)
- Reverse proxy: **Caddy/Nginx** (HTTPS)
- Optional exposure: **FRP**

Both options use the same app code. The only differences are environment variables (mainly `DATABASE_URL` and CORS).

## Architecture / trust boundaries

- The **browser** (web app + extension) talks to your backend via HTTP(S).
- The backend is stateless (Cloud Run or container on a server).
- All state lives in the database (SQLite for local dev, Postgres for production).
- Auth is **workspace tokens**:
  - `Authorization: Bearer er_ws_...`
  - No user accounts.

## Configuration checklist

### Frontend (Vercel)
- `VITE_API_BASE_URL` = your backend public URL (no trailing slash)
- `VITE_GOOGLE_MAPS_API_KEY` = browser key (restrict by HTTP referrer to your domain)

### Backend (Cloud Run or server)
- `DATABASE_URL` (Postgres in production; SQLite only for local dev)
- `CORS_ALLOW_ORIGINS` = comma-separated list of allowed web origins (your Vercel domain(s))
- Optional keys:
  - `GOOGLE_MAPS_API_KEY` (server-side geocoding)
  - `OPENROUTER_API_KEY` and `OPENROUTER_MODEL`
- Optional self-serve onboarding:
  - `ENABLE_PUBLIC_WORKSPACE_ISSUE=1`
  - `PUBLIC_WORKSPACE_TTL_DAYS=30`

## Option A — Vercel + Cloud Run + Cloud SQL Postgres

### A1) Create Cloud SQL Postgres

Create:
- a Cloud SQL instance (Postgres),
- a database (e.g. `easyrelocate`),
- a DB user (e.g. `easyrelocate_user`).

Record:
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`
- `INSTANCE_CONNECTION_NAME` (format: `project:region:instance`)

### A2) Deploy backend to Cloud Run

1) Containerize the backend (Docker image).
2) Deploy the image to Cloud Run.
3) Attach the Cloud SQL instance to the Cloud Run service (Cloud SQL connector).

#### A2.1) Backend env vars (Cloud Run)

Set these as Cloud Run environment variables:
- `DATABASE_URL`
- `CORS_ALLOW_ORIGINS`
- optional feature keys (`GOOGLE_MAPS_API_KEY`, `OPENROUTER_API_KEY`, etc.)

#### A2.2) `DATABASE_URL` examples

Cloud SQL connector / Unix socket (recommended on Cloud Run):
```text
postgresql+psycopg://DB_USER:DB_PASSWORD@/DB_NAME?host=/cloudsql/INSTANCE_CONNECTION_NAME
```

Private IP / direct host:
```text
postgresql+psycopg://DB_USER:DB_PASSWORD@DB_HOST:5432/DB_NAME
```

#### A2.3) CORS allowlist (`CORS_ALLOW_ORIGINS`)

Example:
```text
https://your-vercel-app.vercel.app,https://easyrelocate.yourdomain.com
```

Operational note:
- Prefer a stable custom domain. Vercel preview URLs change frequently.

### A3) Deploy frontend to Vercel

Set Vercel env vars:
```text
VITE_API_BASE_URL=https://YOUR_CLOUD_RUN_URL
VITE_GOOGLE_MAPS_API_KEY=YOUR_BROWSER_KEY
```

### A4) Create workspace tokens

EasyRelocate does not ship a signup/login flow. You have two choices:

#### A4.1) Admin-created tokens (recommended)
Run the script against the same Postgres `DATABASE_URL` the backend uses:
```bash
cd backend
DATABASE_URL="postgresql+psycopg://..." python scripts/create_workspace.py --ttl-days 30
```

Output:
```text
workspace_id=...
workspace_token=er_ws_...
expires_at=...
```

Users paste the token into:
- Web app: Compare page → Workspace panel → Save
- Chrome extension: Options → Workspace token → Save (use the same token)

#### A4.2) Self-serve tokens (optional)
Enable:
```text
ENABLE_PUBLIC_WORKSPACE_ISSUE=1
PUBLIC_WORKSPACE_TTL_DAYS=30
```

Then the web UI can call `POST /api/workspaces/issue` to mint tokens.

Security note:
- This endpoint is public. In production, add protection (rate limiting / bot protection) before
  sharing widely.

## Option B — Vercel + Self-hosted server (miniPC) + Postgres

This is the lowest “monthly bill” option if you already have hardware, but you must handle:
patching, backups, and uptime.

### B1) Run Postgres + backend on the server

Recommended:
- Use Docker Compose.
- Keep Postgres private (not exposed to the internet).
- Expose only the reverse proxy (80/443).

Minimum you need:
- A public backend URL (e.g. `https://api.example.com`)
- `DATABASE_URL` pointing at the Postgres container

Example `DATABASE_URL` (Compose network):
```text
postgresql+psycopg://easyrelocate_user:DB_PASSWORD@postgres:5432/easyrelocate
```

### B2) Reverse proxy + HTTPS

Use Caddy or Nginx to terminate HTTPS and proxy to the backend container.

If you use FRP:
- Prefer mapping FRP to 443 with TLS termination at the server (Caddy/Nginx).
- If FRP terminates TLS upstream, ensure the backend sees correct headers and set a strict CORS allowlist.

### B3) Vercel config

Set:
```text
VITE_API_BASE_URL=https://api.example.com
```

And on the backend:
```text
CORS_ALLOW_ORIGINS=https://your-vercel-domain.vercel.app,https://your-custom-domain.com
```

### B4) Backups (required)

At minimum:
- daily `pg_dump`
- keep 7–30 days of backups
- periodically test restore

## Troubleshooting

### Frontend loads but API calls hang / abort
- Confirm `VITE_API_BASE_URL` is correct and reachable from the browser.
- Prefer `http://127.0.0.1:8000` for local dev (avoid IPv6-only `localhost` issues).

### 401 “Missing workspace token”
- Ensure the workspace token is saved in:
  - Web app Compare page → Workspace panel → Save
  - Extension Options → Workspace token → Save

### CORS errors in browser console
- Set backend `CORS_ALLOW_ORIGINS` to include your frontend origin(s).

## Local vs cloud DB (dev convenience)

If you want to keep both DB URLs in one `.env`, you can set:
- `DATABASE_URL_LOCAL=...`
- `DATABASE_URL_CLOUD=...`
- `EASYRELOCATE_DB=local|cloud`

For local dev, you can also use:
`./easyDeploy.sh --db local`.
