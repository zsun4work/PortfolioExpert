"""
API router for data management endpoints.
"""
from datetime import date
from typing import Optional
from fastapi import APIRouter, HTTPException

from modules.data_loader import data_loader
from database.models import (
    TickerListResponse,
    TickerInfo,
    DateRangeResponse,
    LoadDataRequest,
    LoadDataResponse,
)

router = APIRouter(prefix="/data", tags=["data"])


@router.get("/tickers", response_model=TickerListResponse)
async def list_tickers():
    """
    List all cached tickers with their date ranges.
    """
    tickers = data_loader.list_available_tickers()
    return TickerListResponse(
        tickers=[
            TickerInfo(
                ticker=t["ticker"],
                source=t["source"],
                first_date=t.get("first_date"),
                last_date=t.get("last_date"),
            )
            for t in tickers
        ]
    )


@router.get("/range/{ticker}", response_model=DateRangeResponse)
async def get_ticker_range(ticker: str):
    """
    Get the available date range for a specific ticker.
    """
    range_info = data_loader.get_data_range(ticker)
    
    if range_info is None:
        raise HTTPException(
            status_code=404,
            detail=f"Ticker '{ticker}' not found in cache"
        )
    
    return DateRangeResponse(
        ticker=ticker,
        first_date=range_info.get("first_date"),
        last_date=range_info.get("last_date"),
    )


@router.post("/load", response_model=LoadDataResponse)
async def load_ticker_data(request: LoadDataRequest):
    """
    Load/cache data for a ticker.
    
    If data already exists, it will fetch any missing dates.
    """
    ticker = request.ticker.upper()
    source = request.source.lower()
    
    if source not in ["yfinance", "fred"]:
        raise HTTPException(
            status_code=400,
            detail="Source must be 'yfinance' or 'fred'"
        )
    
    try:
        if source == "yfinance":
            data = data_loader.fetch_asset_data(
                ticker,
                request.start,
                request.end
            )
            table = "asset_prices"
        else:
            data = data_loader.fetch_macro_data(
                ticker,
                request.start,
                request.end
            )
            table = "macro_data"
        
        if data.empty:
            return LoadDataResponse(
                status="no_data",
                ticker=ticker,
                rows_added=0,
                date_range=None,
            )
        
        rows_added = data_loader.cache_to_db(data, table)
        
        # Update metadata
        data_loader.update_metadata(
            ticker,
            source,
            data["date"].min(),
            data["date"].max(),
        )
        
        return LoadDataResponse(
            status="success",
            ticker=ticker,
            rows_added=rows_added,
            date_range={
                "start": str(data["date"].min()),
                "end": str(data["date"].max()),
            },
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error loading data: {str(e)}"
        )


@router.post("/update")
async def update_ticker_data(ticker: str, force: bool = False):
    """
    Update ticker data to latest available.
    
    Args:
        ticker: Ticker symbol to update
        force: Force full refresh instead of incremental update
    """
    ticker = ticker.upper()
    
    try:
        result = data_loader.update_data(ticker, source="yfinance", force=force)
        return {
            "status": result["status"],
            "ticker": ticker,
            "rows_added": result["rows_added"],
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error updating data: {str(e)}"
        )


@router.get("/freshness/{ticker}")
async def check_freshness(ticker: str, source: str = "yfinance"):
    """
    Check if cached data for a ticker needs updating.
    """
    ticker = ticker.upper()
    freshness = data_loader.check_data_freshness(ticker, source)
    return {
        "ticker": ticker,
        "source": source,
        **freshness,
    }


@router.get("/prices/{ticker}")
async def get_prices(
    ticker: str,
    start: Optional[date] = None,
    end: Optional[date] = None,
):
    """
    Get cached price data for a ticker.
    """
    ticker = ticker.upper()
    
    data = data_loader.load_from_db(ticker, start, end, source="yfinance")
    
    if data.empty:
        raise HTTPException(
            status_code=404,
            detail=f"No data found for ticker '{ticker}'"
        )
    
    return {
        "ticker": ticker,
        "count": len(data),
        "data": data.to_dict(orient="records"),
    }


@router.get("/fed-rate")
async def get_fed_rate(
    start: Optional[date] = None,
    end: Optional[date] = None,
    update: bool = True,
):
    """
    Get Federal Funds Rate data.
    
    This is used for:
    - Risk-free rate in Sharpe ratio calculation
    - Display as overlay on performance chart
    
    Args:
        start: Start date filter
        end: End date filter
        update: If True, fetch latest data from FRED first
    """
    from config import FED_FUNDS_RATE_SERIES, FRED_API_KEY
    
    series_id = FED_FUNDS_RATE_SERIES
    
    # Check if FRED API is configured
    if not FRED_API_KEY:
        return {
            "status": "no_api_key",
            "message": "FRED API key not configured. Set FRED_API_KEY environment variable.",
            "series_id": series_id,
            "data": [],
        }
    
    # Try to update with latest data if requested
    if update:
        try:
            new_data = data_loader.fetch_macro_data(series_id, start, end)
            if not new_data.empty:
                data_loader.cache_to_db(new_data, "macro_data")
                data_loader.update_metadata(
                    series_id,
                    "fred",
                    new_data["date"].min(),
                    new_data["date"].max(),
                )
        except Exception as e:
            print(f"Warning: Could not update Fed rate: {e}")
    
    # Load from cache
    data = data_loader.load_from_db(series_id, start, end, source="fred")
    
    if data.empty:
        return {
            "status": "no_data",
            "series_id": series_id,
            "data": [],
        }
    
    # Convert to percentage (FRED gives it as percentage already)
    records = []
    for _, row in data.iterrows():
        records.append({
            "date": str(row["date"]),
            "rate": float(row["value"]) if row["value"] is not None else None,
        })
    
    return {
        "status": "success",
        "series_id": series_id,
        "count": len(records),
        "data": records,
    }

