from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Optional


@dataclass(slots=True)
class VehicleSpec:
    """Dimensões validadas do veículo em milímetros."""

    make: str
    model: str
    year: int
    length_mm: Optional[float] = None
    width_mm: Optional[float] = None
    height_mm: Optional[float] = None
    wheelbase_mm: Optional[float] = None

    @property
    def slug(self) -> str:
        raw = f"{self.make}-{self.model}-{self.year}".lower()
        return "-".join(part for part in raw.replace("/", " ").split() if part)

    def to_dict(self) -> dict:
        return asdict(self)
