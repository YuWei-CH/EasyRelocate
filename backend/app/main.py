from __future__ import annotations

import os
import re
import hashlib
from urllib.parse import urlsplit, urlunsplit
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Query, Header
from fastapi.middleware.cors import CORSMiddleware
from httpx import HTTPError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .db import get_db, init_db
from .distance import haversine_km
from .geocoding import (
    approx_street_from_address,
    geocode_address,
    GeocodingConfigError,
    GeocodingProviderError,
    reverse_geocode,
    rough_location_from_address,
)
from .models import Listing, Target, Workspace
from .openrouter import (
    extract_housing_post,
    OpenRouterConfigError,
    OpenRouterProviderError,
)
from .workspaces import hash_workspace_token
from .schemas import (
    CompareResponse,
    GeocodeResultOut,
    ListingOut,
    ListingFromTextIn,
    ListingSummaryOut,
    ListingUpsert,
    ReverseGeocodeOut,
    TargetOut,
    TargetUpsert,
    WorkspaceIssueOut,
)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)

def _as_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        # SQLite commonly returns naive datetimes even if the column is declared timezone=True.
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


ENABLE_LISTING_GEOCODE_FALLBACK = os.getenv(
    "ENABLE_LISTING_GEOCODE_FALLBACK", "0"
) not in {"0", "false", "False"}


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(title="EasyRelocate API", version="0.1.0", lifespan=lifespan)

_default_allowed_origins = [
    "http://127.0.0.1:5173",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
    "http://localhost:3000",
]
_cors_from_env = [o.strip() for o in os.getenv("CORS_ALLOW_ORIGINS", "").split(",") if o.strip()]
_allowed_origins = _cors_from_env or _default_allowed_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


DbDep = Annotated[Session, Depends(get_db)]
AuthHeader = Annotated[str | None, Header(alias="Authorization")]

_RE_HTTP_URL = re.compile(r"^https?://", re.IGNORECASE)


def _build_post_source_url(page_url: str, text: str) -> str:
    parts = urlsplit(page_url)
    base = urlunsplit((parts.scheme, parts.netloc, parts.path, parts.query, ""))
    normalized = " ".join(text.split()).strip().lower()
    h = hashlib.sha1(normalized.encode("utf-8")).hexdigest()[:12]
    return f"{base}#easyrelocate_post={h}"


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


def _extract_bearer_token(auth: str | None) -> str | None:
    if not auth:
        return None
    a = auth.strip()
    if not a:
        return None
    if a.lower().startswith("bearer "):
        token = a[7:].strip()
        return token or None
    return None


def get_workspace(db: DbDep, authorization: AuthHeader = None) -> Workspace:
    token = _extract_bearer_token(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="Missing workspace token")

    token_hash = hash_workspace_token(token)
    ws = db.scalar(select(Workspace).where(Workspace.token_hash == token_hash))
    if ws:
        if ws.expires_at is not None:
            exp = _as_utc(ws.expires_at)
            if exp <= _utcnow():
                raise HTTPException(status_code=401, detail="Workspace token expired")
            ws.expires_at = exp
        return ws
    raise HTTPException(status_code=401, detail="Invalid workspace token")


WorkspaceDep = Annotated[Workspace, Depends(get_workspace)]


ENABLE_PUBLIC_WORKSPACE_ISSUE = os.getenv("ENABLE_PUBLIC_WORKSPACE_ISSUE", "0") not in {
    "0",
    "false",
    "False",
}
PUBLIC_WORKSPACE_TTL_DAYS = int(os.getenv("PUBLIC_WORKSPACE_TTL_DAYS", "180"))



@app.post("/api/workspaces/issue", response_model=WorkspaceIssueOut)
def issue_public_workspace(db: DbDep) -> WorkspaceIssueOut:
    """
    Create a new workspace token for anonymous users (no login).

    Production note:
    - Keep this endpoint disabled by default and protect it (e.g., Cloud Armor / rate limiting).
    """
    if not ENABLE_PUBLIC_WORKSPACE_ISSUE:
        raise HTTPException(status_code=404, detail="Public workspace issuance is disabled")

    from .workspaces import generate_workspace_token  # local import to avoid cycles

    token = generate_workspace_token()
    token_hash = hash_workspace_token(token)
    expires_at = _utcnow() + timedelta(days=PUBLIC_WORKSPACE_TTL_DAYS)

    ws = Workspace(token_hash=token_hash, expires_at=expires_at)
    db.add(ws)
    db.commit()
    db.refresh(ws)

    assert ws.expires_at is not None
    return WorkspaceIssueOut(workspace_id=ws.id, workspace_token=token, expires_at=ws.expires_at)


def _upsert_listing_for_workspace(db: Session, ws: Workspace, payload: ListingUpsert) -> Listing:
    existing = db.scalar(
        select(Listing).where(
            Listing.workspace_id == ws.id, Listing.source_url == payload.source_url
        )
    )
    data = payload.model_dump(exclude_unset=True)
    captured_at = data.get("captured_at") or _utcnow()

    if existing:
        existing.captured_at = captured_at
        for field in [
            "title",
            "price_value",
            "currency",
            "price_period",
            "lat",
            "lng",
            "location_text",
        ]:
            if field in data and data[field] is not None:
                setattr(existing, field, data[field])

        if ENABLE_LISTING_GEOCODE_FALLBACK:
            if (
                (existing.lat is None or existing.lng is None)
                and existing.location_text is not None
                and existing.location_text.strip() != ""
            ):
                try:
                    candidates = geocode_address(existing.location_text, limit=1)
                    if candidates:
                        existing.lat = existing.lat or candidates[0].lat
                        existing.lng = existing.lng or candidates[0].lng
                except (HTTPError, GeocodingConfigError, GeocodingProviderError):
                    pass

        if (
            existing.location_text is None
            and existing.lat is not None
            and existing.lng is not None
        ):
            try:
                rev = reverse_geocode(existing.lat, existing.lng, zoom=10)
                rough = rough_location_from_address(rev.address)
                if rough:
                    existing.location_text = rough
            except (HTTPError, GeocodingConfigError, GeocodingProviderError):
                pass

        db.add(existing)
        db.commit()
        db.refresh(existing)
        return existing

    listing = Listing(
        workspace_id=ws.id,
        source=payload.source,
        source_url=payload.source_url,
        title=payload.title,
        price_value=payload.price_value,
        currency=payload.currency,
        price_period=payload.price_period,
        lat=payload.lat,
        lng=payload.lng,
        location_text=payload.location_text,
        captured_at=captured_at,
    )
    if ENABLE_LISTING_GEOCODE_FALLBACK:
        if (
            (listing.lat is None or listing.lng is None)
            and listing.location_text is not None
            and listing.location_text.strip() != ""
        ):
            try:
                candidates = geocode_address(listing.location_text, limit=1)
                if candidates:
                    listing.lat = listing.lat or candidates[0].lat
                    listing.lng = listing.lng or candidates[0].lng
            except (HTTPError, GeocodingConfigError, GeocodingProviderError):
                pass
    if listing.location_text is None and listing.lat is not None and listing.lng is not None:
        try:
            rev = reverse_geocode(listing.lat, listing.lng, zoom=10)
            rough = rough_location_from_address(rev.address)
            if rough:
                listing.location_text = rough
        except (HTTPError, GeocodingConfigError, GeocodingProviderError):
            pass
    db.add(listing)
    db.commit()
    db.refresh(listing)
    return listing


@app.post("/api/listings", response_model=ListingOut)
def upsert_listing(payload: ListingUpsert, db: DbDep, ws: WorkspaceDep) -> Listing:
    return _upsert_listing_for_workspace(db, ws, payload)


@app.post("/api/listings/from_text", response_model=ListingOut)
def create_listing_from_text(payload: ListingFromTextIn, db: DbDep, ws: WorkspaceDep) -> Listing:
    if not _RE_HTTP_URL.match(payload.page_url):
        raise HTTPException(status_code=400, detail="page_url must start with http:// or https://")

    try:
        extracted = extract_housing_post(payload.text, page_url=payload.page_url)
    except OpenRouterConfigError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    except OpenRouterProviderError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    except HTTPError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e

    source_url = _build_post_source_url(payload.page_url, payload.text)
    title = extracted.title
    if title is None:
        first = " ".join(payload.text.split())[:80].strip()
        title = first or None

    lat = None
    lng = None
    if extracted.location_text:
        try:
            candidates = geocode_address(extracted.location_text, limit=1)
            if candidates:
                lat = candidates[0].lat
                lng = candidates[0].lng
        except (HTTPError, GeocodingConfigError, GeocodingProviderError):
            pass

    listing_payload = ListingUpsert(
        source="post",
        source_url=source_url,
        title=title,
        price_value=extracted.price_value,
        currency=extracted.currency or "USD",
        price_period="month" if extracted.price_value is not None else "unknown",
        lat=lat,
        lng=lng,
        location_text=extracted.location_text,
        captured_at=_utcnow(),
    )

    return _upsert_listing_for_workspace(db, ws, listing_payload)


@app.get("/api/listings", response_model=list[ListingOut])
def list_listings(db: DbDep, ws: WorkspaceDep) -> list[Listing]:
    return list(
        db.scalars(
            select(Listing)
            .where(Listing.workspace_id == ws.id)
            .order_by(Listing.captured_at.desc())
        )
    )


@app.get("/api/listings/summary", response_model=ListingSummaryOut)
def listing_summary(db: DbDep, ws: WorkspaceDep) -> ListingSummaryOut:
    total = int(
        db.scalar(select(func.count(Listing.id)).where(Listing.workspace_id == ws.id)) or 0
    )
    row = db.execute(
        select(Listing.id, Listing.captured_at)
        .where(Listing.workspace_id == ws.id)
        .order_by(Listing.captured_at.desc())
        .limit(1)
    ).first()
    latest_id: str | None = None
    latest_captured_at: datetime | None = None
    if row:
        latest_id = row[0]
        latest_captured_at = row[1]
        if isinstance(latest_captured_at, datetime) and latest_captured_at.tzinfo is None:
            latest_captured_at = latest_captured_at.replace(tzinfo=timezone.utc)
    return ListingSummaryOut(
        count=total, latest_id=latest_id, latest_captured_at=latest_captured_at
    )


@app.delete("/api/listings/{listing_id}")
def delete_listing(listing_id: str, db: DbDep, ws: WorkspaceDep) -> dict[str, bool]:
    listing = db.scalar(
        select(Listing).where(Listing.workspace_id == ws.id, Listing.id == listing_id)
    )
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    db.delete(listing)
    db.commit()
    return {"deleted": True}


@app.post("/api/targets", response_model=TargetOut)
def upsert_target(payload: TargetUpsert, db: DbDep, ws: WorkspaceDep) -> Target:
    now = _utcnow()
    data = payload.model_dump(exclude_unset=True)

    lat = payload.lat
    lng = payload.lng
    address = payload.address.strip() if isinstance(payload.address, str) else None
    if address == "":
        address = None

    if lat is None or lng is None:
        try:
            candidates = geocode_address(address or "", limit=1)
        except HTTPError as e:
            raise HTTPException(status_code=502, detail=str(e)) from e
        except GeocodingConfigError as e:
            raise HTTPException(status_code=500, detail=str(e)) from e
        except GeocodingProviderError as e:
            raise HTTPException(status_code=502, detail=str(e)) from e
        if not candidates:
            raise HTTPException(status_code=404, detail="Address not found")
        lat = candidates[0].lat
        lng = candidates[0].lng
    elif address is None:
        try:
            rev = reverse_geocode(lat, lng, zoom=14)
            address = rough_location_from_address(rev.address) or rev.display_name
        except HTTPError:
            address = None

    target: Target | None = None
    if payload.id:
        target = db.scalar(select(Target).where(Target.workspace_id == ws.id, Target.id == payload.id))
    if not target:
        target = db.scalar(
            select(Target).where(Target.workspace_id == ws.id).order_by(Target.updated_at.desc())
        )

    if target:
        if "name" in data:
            target.name = payload.name
        target.address = address
        target.lat = lat
        target.lng = lng
        target.updated_at = now
        db.add(target)
        db.commit()
        db.refresh(target)
        return target

    create_kwargs = {
        "workspace_id": ws.id,
        "name": payload.name,
        "address": address,
        "lat": lat,
        "lng": lng,
        "updated_at": now,
    }
    if payload.id:
        create_kwargs["id"] = payload.id
    target = Target(**create_kwargs)
    db.add(target)
    db.commit()
    db.refresh(target)
    return target


@app.get("/api/geocode", response_model=list[GeocodeResultOut])
def api_geocode(
    ws: WorkspaceDep,
    query: str = Query(min_length=1, max_length=512),
    limit: int = Query(default=5, ge=1, le=10),
) -> list[GeocodeResultOut]:
    try:
        results = geocode_address(query, limit=limit)
    except HTTPError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    except GeocodingConfigError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    except GeocodingProviderError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    return [GeocodeResultOut(display_name=r.display_name, lat=r.lat, lng=r.lng) for r in results]


@app.get("/api/reverse_geocode", response_model=ReverseGeocodeOut)
def api_reverse_geocode(
    ws: WorkspaceDep,
    lat: float = Query(),
    lng: float = Query(),
    zoom: int = Query(default=14, ge=0, le=18),
) -> ReverseGeocodeOut:
    try:
        rev = reverse_geocode(lat, lng, zoom=zoom)
    except HTTPError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    except GeocodingConfigError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    except GeocodingProviderError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    return ReverseGeocodeOut(
        display_name=rev.display_name,
        rough_location=rough_location_from_address(rev.address),
        approx_street=approx_street_from_address(rev.address),
    )


@app.get("/api/targets", response_model=list[TargetOut])
def list_targets(db: DbDep, ws: WorkspaceDep) -> list[Target]:
    return list(
        db.scalars(select(Target).where(Target.workspace_id == ws.id).order_by(Target.updated_at.desc()))
    )


@app.get("/api/compare", response_model=CompareResponse)
def compare(
    db: DbDep,
    ws: WorkspaceDep,
    target_id: str | None = Query(default=None),
) -> CompareResponse:
    target: Target | None = None
    if target_id:
        target = db.scalar(select(Target).where(Target.workspace_id == ws.id, Target.id == target_id))
        if not target:
            raise HTTPException(status_code=404, detail="Target not found")
    else:
        target = db.scalar(
            select(Target).where(Target.workspace_id == ws.id).order_by(Target.updated_at.desc())
        )
        if not target:
            raise HTTPException(
                status_code=404,
                detail="No target set yet. POST /api/targets first.",
            )

    listings = list(
        db.scalars(
            select(Listing).where(Listing.workspace_id == ws.id).order_by(Listing.captured_at.desc())
        )
    )
    items = []
    for listing in listings:
        distance_km: float | None = None
        if listing.lat is not None and listing.lng is not None:
            distance_km = haversine_km(listing.lat, listing.lng, target.lat, target.lng)
        items.append(
            {
                "listing": ListingOut.model_validate(listing),
                "metrics": {"distance_km": distance_km},
            }
        )

    return {"target": TargetOut.model_validate(target), "items": items}
