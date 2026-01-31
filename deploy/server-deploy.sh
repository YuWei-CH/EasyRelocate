#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.server}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  echo "Create it first, e.g.: cp .env.server.example .env.server" >&2
  exit 2
fi

cd "$ROOT_DIR"

docker compose -f docker-compose.server.yml --env-file "$ENV_FILE" up -d --build

echo "Up. Services:"
docker compose -f docker-compose.server.yml --env-file "$ENV_FILE" ps

