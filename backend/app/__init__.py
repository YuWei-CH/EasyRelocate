from __future__ import annotations

from pathlib import Path

from dotenv import load_dotenv


def _load_repo_root_dotenv() -> None:
    # backend/app/__init__.py -> backend/app -> backend -> repo root
    repo_root = Path(__file__).resolve().parents[2]
    env_path = repo_root / ".env"
    if env_path.exists():
        load_dotenv(env_path, override=False)


_load_repo_root_dotenv()

