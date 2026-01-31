from __future__ import annotations

import os
from pathlib import Path
from typing import Generator

from sqlalchemy import create_engine
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


DATABASE_URL = os.getenv("DATABASE_URL", _default_database_url())

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


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
