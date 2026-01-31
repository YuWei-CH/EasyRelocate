from __future__ import annotations

import os
from pathlib import Path
from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool


try:
    from sqlalchemy.orm import DeclarativeBase  # type: ignore[attr-defined]

    class Base(DeclarativeBase):
        pass

except ImportError:  # pragma: no cover
    # SQLAlchemy <2.0 compatibility (some dev/test environments still ship 1.4).
    from sqlalchemy.orm import declarative_base

    Base = declarative_base()


def _default_database_url() -> str:
    db_path = Path(__file__).resolve().parents[1] / "easyrelocate.db"
    return f"sqlite:///{db_path}"


def _resolve_database_url() -> str:
    explicit = os.getenv("DATABASE_URL")
    if explicit:
        return explicit

    mode = os.getenv("EASYRELOCATE_DB", "local").strip().lower()
    if mode in {"cloud", "prod", "production", "postgres", "postgresql"}:
        cloud = os.getenv("DATABASE_URL_CLOUD")
        if cloud:
            return cloud
    if mode in {"local", "dev", "development", "sqlite"}:
        local = os.getenv("DATABASE_URL_LOCAL")
        if local:
            return local

    return _default_database_url()


DATABASE_URL = _resolve_database_url()

engine_kwargs: dict[str, object] = {}
if DATABASE_URL.startswith("sqlite"):
    engine_kwargs["connect_args"] = {"check_same_thread": False}
    if ":memory:" in DATABASE_URL:
        engine_kwargs["poolclass"] = StaticPool

engine = create_engine(DATABASE_URL, **engine_kwargs)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def init_db() -> None:
    from . import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    _migrate_schema_if_needed()


def _migrate_schema_if_needed() -> None:
    """
    Very small, safe migrations to keep local dev running without a full migration tool.

    For production, prefer proper migrations (e.g. Alembic).
    """
    def _has_column(conn, table: str, column: str) -> bool:
        cols = {c["name"] for c in inspect(conn).get_columns(table)}
        return column in cols

    def _add_column(conn, table: str, column: str, ddl: str) -> None:
        if _has_column(conn, table, column):
            return
        conn.execute(text(ddl))

    dialect = engine.dialect.name

    with engine.begin() as conn:
        insp = inspect(conn)
        tables = set(insp.get_table_names())

        # 1) workspaces.expires_at
        if "workspaces" in tables:
            if not _has_column(conn, "workspaces", "expires_at"):
                if dialect == "sqlite":
                    _add_column(
                        conn,
                        "workspaces",
                        "expires_at",
                        "ALTER TABLE workspaces ADD COLUMN expires_at DATETIME",
                    )
                elif dialect in {"postgresql", "postgres"}:
                    _add_column(
                        conn,
                        "workspaces",
                        "expires_at",
                        "ALTER TABLE workspaces ADD COLUMN expires_at TIMESTAMPTZ",
                    )

        # 2) listings/targets.workspace_id (for older local SQLite DBs)
        if dialect == "sqlite":
            if "listings" in tables and not _has_column(conn, "listings", "workspace_id"):
                _add_column(
                    conn,
                    "listings",
                    "workspace_id",
                    "ALTER TABLE listings ADD COLUMN workspace_id TEXT",
                )
                conn.execute(
                    text(
                        "CREATE INDEX IF NOT EXISTS idx_listings_workspace_id "
                        "ON listings(workspace_id)"
                    )
                )
            if "targets" in tables and not _has_column(conn, "targets", "workspace_id"):
                _add_column(
                    conn,
                    "targets",
                    "workspace_id",
                    "ALTER TABLE targets ADD COLUMN workspace_id TEXT",
                )
                conn.execute(
                    text(
                        "CREATE INDEX IF NOT EXISTS idx_targets_workspace_id "
                        "ON targets(workspace_id)"
                    )
                )

            needs_backfill = False
            if "listings" in tables and _has_column(conn, "listings", "workspace_id"):
                r = conn.execute(
                    text(
                        "SELECT 1 FROM listings WHERE workspace_id IS NULL OR workspace_id = '' LIMIT 1"
                    )
                ).fetchone()
                needs_backfill = needs_backfill or (r is not None)
            if "targets" in tables and _has_column(conn, "targets", "workspace_id"):
                r = conn.execute(
                    text(
                        "SELECT 1 FROM targets WHERE workspace_id IS NULL OR workspace_id = '' LIMIT 1"
                    )
                ).fetchone()
                needs_backfill = needs_backfill or (r is not None)

            if needs_backfill and "workspaces" in tables:
                # Create a new workspace token for legacy local rows so existing data remains accessible.
                from datetime import datetime, timezone
                import uuid

                from .workspaces import generate_workspace_token, hash_workspace_token

                token = generate_workspace_token()
                token_hash = hash_workspace_token(token)
                ws_id = str(uuid.uuid4())
                created_at = datetime.now(timezone.utc).isoformat()

                conn.execute(
                    text(
                        "INSERT INTO workspaces (id, token_hash, created_at, expires_at) "
                        "VALUES (:id, :token_hash, :created_at, NULL)"
                    ),
                    {"id": ws_id, "token_hash": token_hash, "created_at": created_at},
                )

                try:
                    token_path = (
                        Path(__file__).resolve().parents[1]
                        / ".easyrelocate_local_workspace_token"
                    )
                    token_path.write_text(token + "\n", encoding="utf-8")
                except Exception:
                    pass

                print(
                    "[EasyRelocate] Migrated existing local rows into a new workspace. "
                    "Token saved to backend/.easyrelocate_local_workspace_token"
                )

                if "listings" in tables:
                    conn.execute(
                        text(
                            "UPDATE listings SET workspace_id = :ws_id "
                            "WHERE workspace_id IS NULL OR workspace_id = ''"
                        ),
                        {"ws_id": ws_id},
                    )
                if "targets" in tables:
                    conn.execute(
                        text(
                            "UPDATE targets SET workspace_id = :ws_id "
                            "WHERE workspace_id IS NULL OR workspace_id = ''"
                        ),
                        {"ws_id": ws_id},
                    )


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
