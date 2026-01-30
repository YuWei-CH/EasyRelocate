import sys
from pathlib import Path

import pytest
from pydantic import ValidationError


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def test_target_upsert_rejects_neither_address_nor_coords() -> None:
    from app.schemas import TargetUpsert

    with pytest.raises(ValidationError):
        TargetUpsert(name="Workplace")


def test_target_upsert_rejects_both_address_and_coords() -> None:
    from app.schemas import TargetUpsert

    with pytest.raises(ValidationError):
        TargetUpsert(
            name="Workplace",
            address="690 E Middlefield Rd, Mountain View, CA 94043",
            lat=37.4,
            lng=-122.1,
        )


def test_target_upsert_accepts_address_only() -> None:
    from app.schemas import TargetUpsert

    TargetUpsert(name="Workplace", address="690 E Middlefield Rd, Mountain View, CA 94043")


def test_target_upsert_accepts_coords_only() -> None:
    from app.schemas import TargetUpsert

    TargetUpsert(name="Workplace", lat=37.4, lng=-122.1)

