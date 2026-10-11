"""IMD-sourced rainfall overrides (mm/year) for districts where the survey data is unreliable.

Applied once at build time by ``scripts/build_climate_data.py``; the baked result lives in
``data/districts.json``. Keys are upper-case district names.
"""

_DELHI = {"monsoon": 550, "annual": 700, "post_monsoon": 35, "summer": 60, "winter": 55}
_BENGALURU = {"monsoon": 600, "annual": 970, "post_monsoon": 200, "summer": 100, "winter": 70}
_MUMBAI = {"monsoon": 2200, "annual": 2400, "post_monsoon": 100, "summer": 50, "winter": 50}

RAINFALL_OVERRIDES = {
    "MUMBAI": _MUMBAI,
    "MUMBAI SUBURBAN": _MUMBAI,
    "THANE": {"monsoon": 2500, "annual": 2700, "post_monsoon": 120, "summer": 50, "winter": 30},
    **{name: _DELHI for name in (
        "NEW DELHI", "DELHI", "SOUTH DELHI", "NORTH DELHI", "EAST DELHI", "WEST DELHI",
        "CENTRAL DELHI", "NORTH EAST DELHI", "NORTH WEST DELHI", "SOUTH EAST DELHI",
        "SOUTH WEST DELHI", "SHAHDARA")},
    **{name: _BENGALURU for name in (
        "BENGALURU URBAN", "BENGALURU RURAL", "BANGALORE", "BANGALORE URBAN", "BANGALORE RURAL")},
    "GURGAON": {"monsoon": 500, "annual": 650, "post_monsoon": 40, "summer": 50, "winter": 60},
    "GURUGRAM": {"monsoon": 500, "annual": 650, "post_monsoon": 40, "summer": 50, "winter": 60},
    "NOIDA": {"monsoon": 550, "annual": 700, "post_monsoon": 40, "summer": 55, "winter": 55},
    "GHAZIABAD": {"monsoon": 550, "annual": 700, "post_monsoon": 40, "summer": 55, "winter": 55},
    "FARIDABAD": {"monsoon": 500, "annual": 650, "post_monsoon": 40, "summer": 55, "winter": 55},
    "CHENNAI": {"monsoon": 350, "annual": 1300, "post_monsoon": 700, "summer": 150, "winter": 100},
    "HYDERABAD": {"monsoon": 600, "annual": 800, "post_monsoon": 100, "summer": 50, "winter": 50},
    "RANGAREDDY": {"monsoon": 600, "annual": 800, "post_monsoon": 100, "summer": 50, "winter": 50},
    "PUNE": {"monsoon": 700, "annual": 900, "post_monsoon": 100, "summer": 60, "winter": 40},
    "KOLKATA": {"monsoon": 1200, "annual": 1600, "post_monsoon": 200, "summer": 150, "winter": 50},
    "HOWRAH": {"monsoon": 1200, "annual": 1600, "post_monsoon": 200, "summer": 150, "winter": 50},
    "AHMEDABAD": {"monsoon": 700, "annual": 800, "post_monsoon": 30, "summer": 40, "winter": 30},
    "JAIPUR": {"monsoon": 500, "annual": 600, "post_monsoon": 30, "summer": 30, "winter": 40},
    "LUCKNOW": {"monsoon": 750, "annual": 900, "post_monsoon": 50, "summer": 40, "winter": 60},
    "PATNA": {"monsoon": 900, "annual": 1100, "post_monsoon": 100, "summer": 50, "winter": 50},
    "EAST KHASI HILLS": {"monsoon": 10000, "annual": 11500, "post_monsoon": 800, "summer": 500, "winter": 200},
    "WEST KHASI HILLS": {"monsoon": 5000, "annual": 6000, "post_monsoon": 600, "summer": 300, "winter": 100},
    "EAST GARO HILLS": {"monsoon": 3500, "annual": 4000, "post_monsoon": 300, "summer": 150, "winter": 50},
    "SINDHUDURG": {"monsoon": 3200, "annual": 3500, "post_monsoon": 200, "summer": 50, "winter": 50},
    "RATNAGIRI": {"monsoon": 3500, "annual": 3800, "post_monsoon": 200, "summer": 50, "winter": 50},
    "UDUPI": {"monsoon": 3500, "annual": 4000, "post_monsoon": 300, "summer": 100, "winter": 100},
    "DAKSHINA KANNADA": {"monsoon": 3500, "annual": 4000, "post_monsoon": 300, "summer": 100, "winter": 100},
    "JAISALMER": {"monsoon": 150, "annual": 200, "post_monsoon": 20, "summer": 15, "winter": 15},
    "BIKANER": {"monsoon": 200, "annual": 280, "post_monsoon": 30, "summer": 25, "winter": 25},
    "KUTCH": {"monsoon": 350, "annual": 400, "post_monsoon": 25, "summer": 15, "winter": 10},
}


# Regions with no observed rainfall and no usable neighbours in the survey. Approximate IMD
# climatology plus a representative coordinate (enables live forecasts); flagged "regional_estimate".
REGIONAL_ESTIMATES = {
    "Jammu and Kashmir": {"monsoon": 190, "post_monsoon": 55, "summer": 280, "winter": 185,
                          "annual": 710, "latitude": 34.08, "longitude": 74.80},
    "Ladakh": {"monsoon": 40, "post_monsoon": 12, "summer": 40, "winter": 50,
               "annual": 142, "latitude": 34.16, "longitude": 77.58},
    "Andaman and Nicobar Islands": {"monsoon": 1800, "post_monsoon": 800, "summer": 350, "winter": 150,
                                    "annual": 3100, "latitude": 11.62, "longitude": 92.73},
}
