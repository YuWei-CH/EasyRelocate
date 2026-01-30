from __future__ import annotations

import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from httpx import HTTPError
from sqlalchemy import select
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
from .models import Listing, Target
from .schemas import (
    CompareResponse,
    GeocodeResultOut,
    ListingOut,
    ListingUpsert,
    ReverseGeocodeOut,
    TargetOut,
    TargetUpsert,
)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


ENABLE_LISTING_GEOCODE_FALLBACK = os.getenv(
    "ENABLE_LISTING_GEOCODE_FALLBACK", "0"
) not in {"0", "false", "False"}


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(title="EasyRelocate API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


DbDep = Annotated[Session, Depends(get_db)]


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/listings", response_model=ListingOut)
def upsert_listing(payload: ListingUpsert, db: DbDep) -> Listing:
    existing = db.scalar(select(Listing).where(Listing.source_url == payload.source_url))
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


@app.get("/api/listings", response_model=list[ListingOut])
def list_listings(db: DbDep) -> list[Listing]:
    return list(db.scalars(select(Listing).order_by(Listing.captured_at.desc())))


@app.delete("/api/listings/{listing_id}")
def delete_listing(listing_id: str, db: DbDep) -> dict[str, bool]:
    listing = db.scalar(select(Listing).where(Listing.id == listing_id))
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    db.delete(listing)
    db.commit()
    return {"deleted": True}


@app.post("/api/targets", response_model=TargetOut)
def upsert_target(payload: TargetUpsert, db: DbDep) -> Target:
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
        target = db.scalar(select(Target).where(Target.id == payload.id))
    if not target:
        target = db.scalar(select(Target).order_by(Target.updated_at.desc()))

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
def list_targets(db: DbDep) -> list[Target]:
    return list(db.scalars(select(Target).order_by(Target.updated_at.desc())))


@app.get("/api/compare", response_model=CompareResponse)
def compare(
    db: DbDep,
    target_id: str | None = Query(default=None),
) -> CompareResponse:
    target: Target | None = None
    if target_id:
        target = db.scalar(select(Target).where(Target.id == target_id))
        if not target:
            raise HTTPException(status_code=404, detail="Target not found")
    else:
        target = db.scalar(select(Target).order_by(Target.updated_at.desc()))
        if not target:
            raise HTTPException(
                status_code=404,
                detail="No target set yet. POST /api/targets first.",
            )

    listings = list(db.scalars(select(Listing).order_by(Listing.captured_at.desc())))
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
