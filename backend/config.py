"""
Configuration settings for the PortfolioExpert backend.

To set up FRED API:
1. Get your API key at: https://fred.stlouisfed.org/docs/api/api_key.html
2. Set environment variable: export FRED_API_KEY="your_key_here"
   Or create a .env file in the backend directory with: FRED_API_KEY=your_key_here
"""
import os
from pathlib import Path

# Try to load .env file if python-dotenv is available
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# Base directory
BASE_DIR = Path(__file__).resolve().parent

# Database configuration
DATABASE_PATH = BASE_DIR / "data" / "portfolio.db"
DATABASE_URL = f"sqlite:///{DATABASE_PATH}"

# Ensure data directory exists
DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)

# API Settings
API_HOST = "0.0.0.0"
API_PORT = 8000

# ============================================================================
# FRED API Key
# Get your free API key at: https://fred.stlouisfed.org/docs/api/api_key.html
# Set via environment variable or .env file
# ============================================================================
FRED_API_KEY = os.getenv("FRED_API_KEY", None)

# Fed Funds Rate series ID (for risk-free rate)
FED_FUNDS_RATE_SERIES = "DFF"  # Daily Federal Funds Effective Rate

# Data settings
DEFAULT_START_DATE = "2010-01-01"
CACHE_EXPIRY_DAYS = 1  # Re-fetch data if older than this

