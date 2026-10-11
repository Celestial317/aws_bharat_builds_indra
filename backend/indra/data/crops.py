"""Indicative crop economics used by the deterministic ranking engine.

Figures are rounded, national-average planning values (crop water need per cycle, yield per acre,
recent MSP / typical mandi price, cultivation cost per acre). They are *not* a forecast: farmers
should confirm prices with the local mandi and agronomy with their Krishi Vigyan Kendra.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Tuple

ACRE_MM_TO_LITRES = 4046.86  # 1 mm of water over 1 acre


@dataclass(frozen=True)
class Crop:
    name: str
    seasons: Tuple[str, ...]        # Kharif | Rabi | Zaid
    water_mm: int                   # crop water requirement per cycle
    yield_kg_acre: int
    price_kg: float                 # INR/kg
    cost_acre: int                  # INR/acre cultivation cost
    soils: Tuple[str, ...]
    env_score: int                  # 1-10, 10 = gentlest on water/soil/biodiversity
    soil_health: str                # Positive | Neutral | Negative
    ease: int                       # 1-10, 10 = easiest for a small farmer
    drought_hardy: bool = False
    flood_tolerant: bool = False
    msp_backed: bool = True         # grains/pulses/oilseeds/cotton/cane have an assured support price

    @property
    def water_litres_acre(self) -> int:
        return int(self.water_mm * ACRE_MM_TO_LITRES)


ALL_SOILS = ("Loamy", "Clay", "Sandy", "Silty", "Black", "Red", "Alluvial")

CROPS = (
    Crop("Rice (Paddy)", ("Kharif",), 1200, 2000, 23.0, 28000, ("Clay", "Loamy", "Alluvial", "Silty"), 3, "Negative", 7, flood_tolerant=True),
    Crop("Wheat", ("Rabi",), 450, 1800, 24.0, 18000, ("Loamy", "Clay", "Alluvial", "Silty"), 7, "Neutral", 9),
    Crop("Maize", ("Kharif", "Rabi", "Zaid"), 500, 2000, 22.0, 15000, ("Loamy", "Sandy", "Red", "Alluvial"), 7, "Neutral", 8),
    Crop("Bajra (Pearl Millet)", ("Kharif",), 300, 800, 26.0, 9000, ("Sandy", "Loamy", "Red"), 10, "Positive", 8, drought_hardy=True),
    Crop("Jowar (Sorghum)", ("Kharif", "Rabi"), 350, 800, 33.0, 9000, ("Black", "Loamy", "Red"), 9, "Positive", 8, drought_hardy=True),
    Crop("Ragi (Finger Millet)", ("Kharif",), 400, 700, 42.0, 12000, ("Red", "Loamy", "Sandy"), 9, "Positive", 7, drought_hardy=True),
    Crop("Chickpea (Chana)", ("Rabi",), 250, 450, 56.0, 14000, ("Black", "Loamy", "Sandy"), 9, "Positive", 7, drought_hardy=True),
    Crop("Lentil (Masoor)", ("Rabi",), 250, 400, 64.0, 12000, ("Loamy", "Alluvial", "Silty"), 9, "Positive", 7),
    Crop("Mustard", ("Rabi",), 250, 450, 56.0, 12000, ("Loamy", "Sandy", "Alluvial"), 8, "Neutral", 8, drought_hardy=True),
    Crop("Groundnut", ("Kharif", "Zaid"), 500, 600, 62.0, 20000, ("Sandy", "Red", "Loamy"), 7, "Positive", 6),
    Crop("Soybean", ("Kharif",), 450, 450, 46.0, 14000, ("Black", "Loamy"), 8, "Positive", 7),
    Crop("Cotton", ("Kharif",), 800, 400, 70.0, 32000, ("Black", "Loamy"), 4, "Negative", 5),
    Crop("Sugarcane", ("Kharif", "Zaid"), 1800, 14000, 3.4, 60000, ("Loamy", "Clay", "Alluvial"), 2, "Negative", 6),
    Crop("Tur (Arhar)", ("Kharif",), 400, 350, 72.0, 14000, ("Loamy", "Black", "Red"), 9, "Positive", 6, drought_hardy=True),
    Crop("Moong (Green Gram)", ("Kharif", "Zaid"), 250, 300, 85.0, 9000, ("Loamy", "Sandy", "Alluvial"), 9, "Positive", 8, drought_hardy=True),
    Crop("Urad (Black Gram)", ("Kharif", "Zaid"), 250, 300, 74.0, 9000, ("Loamy", "Black", "Alluvial"), 9, "Positive", 8),
    Crop("Potato", ("Rabi",), 400, 8000, 15.0, 60000, ("Sandy", "Loamy", "Alluvial"), 5, "Neutral", 6, msp_backed=False),
    Crop("Onion", ("Rabi", "Kharif"), 450, 4000, 20.0, 55000, ("Loamy", "Alluvial"), 5, "Neutral", 6, msp_backed=False),
    Crop("Tomato", ("Rabi", "Zaid"), 600, 8000, 18.0, 70000, ("Loamy", "Sandy", "Red"), 5, "Neutral", 5, msp_backed=False),
    Crop("Watermelon", ("Zaid",), 400, 6000, 12.0, 35000, ("Sandy", "Loamy", "Alluvial"), 6, "Neutral", 7, drought_hardy=True, msp_backed=False),
    Crop("Sunflower", ("Rabi", "Kharif", "Zaid"), 500, 500, 65.0, 14000, ("Loamy", "Black", "Sandy"), 7, "Neutral", 7),
    Crop("Barley", ("Rabi",), 300, 1500, 20.0, 12000, ("Sandy", "Loamy"), 9, "Neutral", 9, drought_hardy=True),
    Crop("Cucumber / Gourds", ("Zaid",), 350, 4000, 14.0, 25000, ("Sandy", "Loamy", "Alluvial"), 6, "Neutral", 7, msp_backed=False),
    Crop("Sesame (Til)", ("Kharif", "Zaid"), 300, 250, 90.0, 8000, ("Sandy", "Red", "Loamy"), 8, "Neutral", 7, drought_hardy=True),
)

WATER_BUDGET_MM = {"low": 350, "medium": 650, "high": 1300}  # rainfall + irrigation a farmer can count on
