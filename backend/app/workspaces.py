from __future__ import annotations

import hashlib
import secrets


def hash_workspace_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def generate_workspace_token() -> str:
    # Keep it copy/paste friendly.
    return f"er_ws_{secrets.token_urlsafe(32)}"

