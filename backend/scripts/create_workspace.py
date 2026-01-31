from __future__ import annotations

import argparse

from app.db import SessionLocal, init_db
from app.models import Workspace
from app.workspaces import generate_workspace_token, hash_workspace_token
from datetime import datetime, timedelta, timezone


def main() -> int:
    parser = argparse.ArgumentParser(description="Create an EasyRelocate workspace token.")
    parser.add_argument("--print-hash", action="store_true", help="Also print the token hash")
    parser.add_argument(
        "--ttl-days",
        type=int,
        default=None,
        help="Optional token TTL in days (e.g., 30). If omitted, token does not expire.",
    )
    args = parser.parse_args()

    init_db()

    token = generate_workspace_token()
    token_hash = hash_workspace_token(token)
    expires_at = None
    if args.ttl_days is not None:
        expires_at = datetime.now(timezone.utc) + timedelta(days=args.ttl_days)

    db = SessionLocal()
    try:
        ws = Workspace(token_hash=token_hash, expires_at=expires_at)
        db.add(ws)
        db.commit()
        db.refresh(ws)
    finally:
        db.close()

    print(f"workspace_id={ws.id}")
    print(f"workspace_token={token}")
    print(f"expires_at={ws.expires_at.isoformat() if ws.expires_at else 'never'}")
    if args.print_hash:
        print(f"workspace_token_hash={token_hash}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
