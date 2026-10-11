"""INDRA climate-risk engine (flood, drought, heat) - pure standard library.

Shared by the FastAPI backend and the AWS Lambda functions so both score risk identically.
"""

from .atlas import Atlas, get_atlas
from .engine import (
    Alert,
    RiskReport,
    assess_risk,
    evaluate_alerts,
    water_balance,
)
from .forecast import Forecast, fetch_forecast

__all__ = [
    "Alert", "Atlas", "Forecast", "RiskReport",
    "assess_risk", "evaluate_alerts", "fetch_forecast", "get_atlas", "water_balance",
]
__version__ = "1.0.0"
