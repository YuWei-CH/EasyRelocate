from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)


ListingSource = Literal["airbnb", "blueground", "post"]
PricePeriod = Literal["night", "month", "total", "unknown"]


class ListingUpsert(BaseModel):
    source: ListingSource
    source_url: str = Field(min_length=1, max_length=2048)
    title: str | None = None
    price_value: float | None = None
    currency: str = "USD"
    price_period: PricePeriod = "unknown"
    lat: float | None = None
    lng: float | None = None
    location_text: str | None = None
    captured_at: datetime | None = None

    @field_validator("source_url")
    @classmethod
    def _validate_url(cls, v: str) -> str:
        if not (v.startswith("http://") or v.startswith("https://")):
            raise ValueError("source_url must start with http:// or https://")
        return v


class ListingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    source: str
    source_url: str
    title: str | None
    price_value: float | None
    currency: str
    price_period: str
    lat: float | None
    lng: float | None
    location_text: str | None
    captured_at: datetime


class ListingSummaryOut(BaseModel):
    count: int
    latest_id: str | None = None
    latest_captured_at: datetime | None = None


class ListingFromTextIn(BaseModel):
    text: str = Field(min_length=1, max_length=20000)
    page_url: str = Field(min_length=1, max_length=2048)


class TargetUpsert(BaseModel):
    id: str | None = None
    name: str = Field(min_length=1, max_length=256)
    address: str | None = Field(default=None, max_length=512)
    lat: float | None = None
    lng: float | None = None

    @model_validator(mode="after")
    def _validate_location(self) -> "TargetUpsert":
        has_lat = self.lat is not None
        has_lng = self.lng is not None
        has_address = self.address is not None and self.address.strip() != ""
        has_coords = has_lat and has_lng

        if has_lat != has_lng:
            raise ValueError("lat and lng must be provided together")
        if has_address and has_coords:
            raise ValueError("Provide either address, or both lat and lng (not both)")
        if not (has_address or has_coords):
            raise ValueError("Provide either address, or both lat and lng")
        return self


class GeocodeResultOut(BaseModel):
    display_name: str
    lat: float
    lng: float


class ReverseGeocodeOut(BaseModel):
    display_name: str | None = None
    rough_location: str | None = None
    approx_street: str | None = None


class TargetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    address: str | None
    lat: float
    lng: float
    updated_at: datetime


class InterestingTargetUpsert(BaseModel):
    id: str | None = None
    name: str = Field(min_length=1, max_length=256)
    address: str | None = Field(default=None, max_length=512)
    lat: float | None = None
    lng: float | None = None

    @model_validator(mode="after")
    def _validate_location(self) -> "InterestingTargetUpsert":
        has_lat = self.lat is not None
        has_lng = self.lng is not None
        has_address = self.address is not None and self.address.strip() != ""
        has_coords = has_lat and has_lng

        if has_lat != has_lng:
            raise ValueError("lat and lng must be provided together")
        if has_address and has_coords:
            raise ValueError("Provide either address, or both lat and lng (not both)")
        if not (has_address or has_coords):
            raise ValueError("Provide either address, or both lat and lng")
        return self


class InterestingTargetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    address: str | None
    lat: float
    lng: float
    updated_at: datetime


class Metrics(BaseModel):
    distance_km: float | None = None


class CompareItem(BaseModel):
    listing: ListingOut
    metrics: Metrics


class CompareResponse(BaseModel):
    target: TargetOut
    items: list[CompareItem]


class WorkspaceIssueOut(BaseModel):
    workspace_id: str
    workspace_token: str
    expires_at: datetime


class StatsOut(BaseModel):
    workspaces: int
    listings: int
    targets: int
