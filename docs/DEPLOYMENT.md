# Deployment (Vercel + Cloud Run + Cloud SQL Postgres)

This doc describes a simple production setup for EasyRelocate:
- **Frontend**: Vercel (static hosting for the Vite app)
- **Backend**: Google Cloud Run (FastAPI)
- **Database**: Cloud SQL for PostgreSQL
- **Auth**: **admin-created workspace tokens** (no user accounts)

## 1) Create Cloud SQL Postgres

Create a Cloud SQL Postgres instance and a database (example: `easyrelocate`), plus a DB user.

You will need:
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`
- `INSTANCE_CONNECTION_NAME` (format: `project:region:instance`)

## 2) Deploy backend to Cloud Run

### Backend env vars (Cloud Run)

Set these as Cloud Run environment variables:
- `DATABASE_URL` (Postgres)
- `CORS_ALLOW_ORIGINS` (comma-separated list, usually your Vercel domain(s))
- `GOOGLE_MAPS_API_KEY` (optional, for server-side geocoding)
- `OPENROUTER_API_KEY` (optional, for “Add selected post” extraction)
- `OPENROUTER_MODEL` (optional; default `z-ai/glm-4.5-air:free`)

#### `DATABASE_URL` examples

If you connect Cloud Run to Cloud SQL using the Cloud SQL connector (recommended), you can use a Unix socket host:
```text
postgresql+psycopg://DB_USER:DB_PASSWORD@/DB_NAME?host=/cloudsql/INSTANCE_CONNECTION_NAME
```

If you use a private IP / direct host:
```text
postgresql+psycopg://DB_USER:DB_PASSWORD@DB_HOST:5432/DB_NAME
```

### CORS (`CORS_ALLOW_ORIGINS`)

Example:
```text
https://your-vercel-app.vercel.app,https://easyrelocate.yourdomain.com
```

Notes:
- If you change your Vercel preview URLs often, add the stable custom domain (recommended).
- Local dev still defaults to `http://127.0.0.1:5173` + `http://localhost:5173` when `CORS_ALLOW_ORIGINS` is not set.

## 3) Deploy frontend to Vercel

### Frontend env vars (Vercel)

Set these in Vercel project settings:
- `VITE_API_BASE_URL` (your Cloud Run URL, without trailing slash)
- `VITE_GOOGLE_MAPS_API_KEY` (browser key; HTTP referrer-restricted to your Vercel domain)

Example:
```text
VITE_API_BASE_URL=https://easyrelocate-api-xxxxx-uc.a.run.app
```

## 4) Create admin workspace tokens

EasyRelocate does not ship a user signup/login flow. Instead, you (admin) create “workspace tokens”
and distribute them to users. All reads/writes are scoped to a workspace.

### Create a token (recommended workflow)

Run the script against the same `DATABASE_URL` your backend uses:
```bash
cd backend
DATABASE_URL="postgresql+psycopg://..." python scripts/create_workspace.py
```

Output:
```text
workspace_id=...
workspace_token=er_ws_...
```

Treat `workspace_token` like a password.

### Where users paste the token

- **Web app**: Compare page → **Workspace** panel → paste token → Save.
- **Chrome extension**: Extension options → **Workspace token** → Save.

All API calls send `Authorization: Bearer <workspace_token>`.

## 5) Production notes

- Cloud Run instances are ephemeral; use Postgres in production (avoid relying on local SQLite files).
- You’ll eventually want migrations (e.g., Alembic) instead of `create_all`, but `create_all` is fine
  for early versions.
