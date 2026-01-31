from __future__ import annotations

import argparse

from app.db import SessionLocal, init_db
from app.models import Workspace
from app.workspaces import generate_workspace_token, hash_workspace_token


def main() -> int:
    parser = argparse.ArgumentParser(description="Create an EasyRelocate workspace token.")
    parser.add_argument("--print-hash", action="store_true", help="Also print the token hash")
    args = parser.parse_args()

    init_db()

    token = generate_workspace_token()
    token_hash = hash_workspace_token(token)

    db = SessionLocal()
    try:
        ws = Workspace(token_hash=token_hash)
        db.add(ws)
        db.commit()
        db.refresh(ws)
    finally:
        db.close()

    print(f"workspace_id={ws.id}")
    print(f"workspace_token={token}")
    if args.print_hash:
        print(f"workspace_token_hash={token_hash}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

