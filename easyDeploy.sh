#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

DB_MODE="local"
BACKEND_PORT="8000"
FRONTEND_PORT="5173"
NO_FRONTEND="0"
NO_BACKEND="0"
NO_INSTALL="0"

usage() {
  cat <<'EOF'
Usage:
  ./easyDeploy.sh [--db local|cloud] [--backend-port 8000] [--frontend-port 5173] [--no-frontend] [--no-backend] [--no-install]

DB selection:
  - local: uses DATABASE_URL_LOCAL if set, otherwise backend defaults to SQLite.
  - cloud: uses DATABASE_URL_CLOUD (or DATABASE_URL) and is meant for Cloud SQL Postgres.

Notes:
  - By default this script auto-installs dependencies if missing (venv / node_modules). Use --no-install to skip.
  - Frontend reads repo-root .env via Vite config (envDir=..).
  - Backend reads repo-root .env via python-dotenv, but this script can also set DB mode.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --db)
      DB_MODE="${2:-}"; shift 2;;
    --backend-port)
      BACKEND_PORT="${2:-}"; shift 2;;
    --frontend-port)
      FRONTEND_PORT="${2:-}"; shift 2;;
    --no-frontend)
      NO_FRONTEND="1"; shift;;
    --no-backend)
      NO_BACKEND="1"; shift;;
    --no-install)
      NO_INSTALL="1"; shift;;
    -h|--help)
      usage; exit 0;;
    *)
      echo "Unknown arg: $1" >&2
      usage
      exit 2;;
  esac
done

if [[ "$DB_MODE" != "local" && "$DB_MODE" != "cloud" ]]; then
  echo "--db must be 'local' or 'cloud' (got: $DB_MODE)" >&2
  exit 2
fi

export EASYRELOCATE_DB="$DB_MODE"
if [[ "$DB_MODE" == "local" ]]; then
  if [[ -n "${DATABASE_URL_LOCAL:-}" && -z "${DATABASE_URL:-}" ]]; then
    export DATABASE_URL="$DATABASE_URL_LOCAL"
  fi
else
  if [[ -n "${DATABASE_URL_CLOUD:-}" && -z "${DATABASE_URL:-}" ]]; then
    export DATABASE_URL="$DATABASE_URL_CLOUD"
  fi
  if [[ -z "${DATABASE_URL:-}" ]]; then
    echo "Cloud DB selected but DATABASE_URL_CLOUD or DATABASE_URL is not set." >&2
    exit 2
  fi
fi

hash_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
    return 0
  fi
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
    return 0
  fi
  echo "Missing sha256sum/shasum; cannot compute file hash." >&2
  return 1
}

ensure_backend_deps() {
  local backend_dir="$ROOT_DIR/backend"
  local venv_py="$backend_dir/.venv/bin/python"
  local req="$backend_dir/requirements.txt"
  local stamp="$backend_dir/.venv/.easyrelocate_requirements_sha256"

  if [[ "$NO_INSTALL" == "1" ]]; then
    return 0
  fi

  if [[ ! -x "$venv_py" ]]; then
    echo "[easyDeploy] Creating backend venv"
    (cd "$backend_dir" && python -m venv .venv)
  fi

  if [[ ! -f "$req" ]]; then
    echo "[easyDeploy] Missing backend/requirements.txt" >&2
    exit 2
  fi

  local want
  want="$(hash_file "$req")"
  local have=""
  if [[ -f "$stamp" ]]; then
    have="$(cat "$stamp" 2>/dev/null || true)"
  fi

  if [[ "$want" != "$have" ]]; then
    echo "[easyDeploy] Installing backend deps"
    (cd "$backend_dir" && "$venv_py" -m pip install -r requirements.txt)
    mkdir -p "$(dirname "$stamp")"
    echo "$want" >"$stamp"
  fi
}

ensure_frontend_deps() {
  local frontend_dir="$ROOT_DIR/frontend"
  local lock="$frontend_dir/package-lock.json"
  local stamp="$frontend_dir/node_modules/.easyrelocate_package_lock_sha256"

  if [[ "$NO_INSTALL" == "1" ]]; then
    return 0
  fi

  if [[ ! -d "$frontend_dir/node_modules" ]]; then
    echo "[easyDeploy] Installing frontend deps"
    (cd "$frontend_dir" && npm install)
    if [[ -f "$lock" ]]; then
      mkdir -p "$(dirname "$stamp")"
      hash_file "$lock" >"$stamp" || true
    fi
    return 0
  fi

  if [[ -f "$lock" ]]; then
    local want
    want="$(hash_file "$lock")"
    local have=""
    if [[ -f "$stamp" ]]; then
      have="$(cat "$stamp" 2>/dev/null || true)"
    fi
    if [[ "$want" != "$have" ]]; then
      echo "[easyDeploy] package-lock changed; re-installing frontend deps"
      (cd "$frontend_dir" && npm install)
      hash_file "$lock" >"$stamp" || true
    fi
  fi
}

PIDS=()
cleanup() {
  for pid in "${PIDS[@]:-}"; do
    kill "$pid" >/dev/null 2>&1 || true
  done
}
trap cleanup EXIT INT TERM

if [[ "$NO_BACKEND" == "0" ]]; then
  ensure_backend_deps
fi
if [[ "$NO_FRONTEND" == "0" ]]; then
  ensure_frontend_deps
fi

if [[ "$NO_BACKEND" == "0" ]]; then
  echo "[easyDeploy] Starting backend on :$BACKEND_PORT (db=$DB_MODE)"
  (
    cd "$ROOT_DIR/backend"
    if [[ -x ".venv/bin/python" ]]; then
      exec .venv/bin/python -m uvicorn app.main:app --reload --port "$BACKEND_PORT"
    else
      exec python -m uvicorn app.main:app --reload --port "$BACKEND_PORT"
    fi
  ) &
  PIDS+=("$!")
fi

if [[ "$NO_FRONTEND" == "0" ]]; then
  echo "[easyDeploy] Starting frontend on :$FRONTEND_PORT"
  (
    cd "$ROOT_DIR/frontend"
    exec npm run dev -- --port "$FRONTEND_PORT"
  ) &
  PIDS+=("$!")
fi

echo "[easyDeploy] Running. Press Ctrl+C to stop."
wait
