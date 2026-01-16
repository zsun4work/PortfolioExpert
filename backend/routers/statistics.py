"""
API router for statistical analysis endpoints.
"""
from datetime import date
from typing import List, Optional, Dict
from fastapi import APIRouter, HTTPException
import pandas as pd
import numpy as np

from modules.data_loader import data_loader

router = APIRouter(prefix="/statistics", tags=["statistics"])


def calculate_annualized_volatility(returns: pd.Series, trading_days: int = 252) -> float:
    """Calculate annualized volatility from daily returns."""
    if returns.empty or len(returns) < 2:
        return 0.0
    return float(returns.std() * np.sqrt(trading_days))


def calculate_annualized_return(returns: pd.Series, trading_days: int = 252) -> float:
    """Calculate annualized expected return from daily returns."""
    if returns.empty:
        return 0.0
    mean_daily = returns.mean()
    return float((1 + mean_daily) ** trading_days - 1)


def calculate_correlation_matrix(returns_dict: Dict[str, pd.Series]) -> Dict[str, Dict[str, float]]:
    """Calculate correlation matrix from multiple return series."""
    if not returns_dict:
        return {}
    
    # Create DataFrame with all returns aligned by date
    df = pd.DataFrame(returns_dict)
    corr_matrix = df.corr()
    
    # Convert to nested dict
    result = {}
    for ticker in corr_matrix.columns:
        result[ticker] = {}
        for other_ticker in corr_matrix.columns:
            result[ticker][other_ticker] = round(float(corr_matrix.loc[ticker, other_ticker]), 4)
    
    return result


def calculate_rolling_stats(
    prices_dict: Dict[str, pd.DataFrame],
    window: int,
    trading_days: int = 252
) -> Dict[str, List[Dict]]:
    """
    Calculate rolling statistics for multiple assets.
    
    Returns dict with:
    - rolling_volatility: [{date, ticker1, ticker2, ...}, ...]
    - rolling_return: [{date, ticker1, ticker2, ...}, ...]
    - rolling_correlation: [{date, pair, correlation}, ...]
    """
    if not prices_dict:
        return {"rolling_volatility": [], "rolling_return": [], "rolling_correlation": []}
    
    # Calculate daily returns for each ticker
    returns_dict = {}
    for ticker, prices_df in prices_dict.items():
        df = prices_df.copy()
        df = df.sort_values("date")
        df["return"] = df["adj_close"].pct_change()
        returns_dict[ticker] = df[["date", "return"]].dropna().set_index("date")
    
    # Merge all returns on date
    tickers = list(returns_dict.keys())
    if not tickers:
        return {"rolling_volatility": [], "rolling_return": [], "rolling_correlation": []}
    
    merged = returns_dict[tickers[0]].rename(columns={"return": tickers[0]})
    for ticker in tickers[1:]:
        merged = merged.join(returns_dict[ticker].rename(columns={"return": ticker}), how="inner")
    
    if merged.empty or len(merged) < window:
        return {"rolling_volatility": [], "rolling_return": [], "rolling_correlation": []}
    
    # Calculate rolling volatility (annualized)
    rolling_vol = merged.rolling(window=window).std() * np.sqrt(trading_days)
    rolling_vol = rolling_vol.dropna()
    
    vol_data = []
    for date_idx, row in rolling_vol.iterrows():
        point = {"date": str(date_idx)}
        for ticker in tickers:
            point[ticker] = round(float(row[ticker]), 4) if not np.isnan(row[ticker]) else None
        vol_data.append(point)
    
    # Calculate rolling expected return (annualized)
    rolling_ret = merged.rolling(window=window).mean()
    rolling_ret = ((1 + rolling_ret) ** trading_days - 1).dropna()
    
    ret_data = []
    for date_idx, row in rolling_ret.iterrows():
        point = {"date": str(date_idx)}
        for ticker in tickers:
            point[ticker] = round(float(row[ticker]), 4) if not np.isnan(row[ticker]) else None
        ret_data.append(point)
    
    # Calculate rolling correlation (for all pairs)
    corr_data = []
    if len(tickers) >= 2:
        # Generate all pairs
        pairs = []
        for i, t1 in enumerate(tickers):
            for t2 in tickers[i+1:]:
                pairs.append((t1, t2))
        
        # Calculate rolling correlation for each pair
        for t1, t2 in pairs:
            pair_name = f"{t1}/{t2}"
            rolling_corr = merged[t1].rolling(window=window).corr(merged[t2]).dropna()
            
            for date_idx, corr_val in rolling_corr.items():
                corr_data.append({
                    "date": str(date_idx),
                    "pair": pair_name,
                    "correlation": round(float(corr_val), 4) if not np.isnan(corr_val) else None
                })
    
    return {
        "rolling_volatility": vol_data,
        "rolling_return": ret_data,
        "rolling_correlation": corr_data,
    }


from pydantic import BaseModel, RootModel

class TickersRequest(RootModel[List[str]]):
    """Request body containing list of tickers."""
    pass

class MultiWindowRequest(BaseModel):
    """Request body for multi-window rolling stats."""
    tickers: List[str]
    windows: List[int]


@router.post("/summary")
async def get_summary_statistics(
    tickers: List[str],
    start: Optional[date] = None,
    end: Optional[date] = None,
):
    """
    Get summary statistics for selected assets.
    
    Returns:
    - Per-asset: volatility, expected return
    - Correlation matrix between all assets
    """
    if not tickers:
        raise HTTPException(status_code=400, detail="No tickers provided")
    
    tickers = [t.upper() for t in tickers]
    
    # Fetch price data for all tickers
    prices_dict = {}
    returns_dict = {}
    
    for ticker in tickers:
        data = data_loader.load_from_db(ticker, start, end, source="yfinance")
        if data.empty:
            continue
        
        prices_dict[ticker] = data
        
        # Calculate daily returns
        df = data.copy().sort_values("date")
        df["return"] = df["adj_close"].pct_change()
        returns = df["return"].dropna()
        returns_dict[ticker] = returns
    
    if not returns_dict:
        raise HTTPException(status_code=404, detail="No data found for any ticker")
    
    # Calculate per-asset statistics
    asset_stats = {}
    for ticker, returns in returns_dict.items():
        asset_stats[ticker] = {
            "volatility": round(calculate_annualized_volatility(returns), 4),
            "expected_return": round(calculate_annualized_return(returns), 4),
            "data_points": len(returns),
        }
    
    # Calculate correlation matrix
    # Align all returns by date first
    aligned_returns = {}
    for ticker, prices_df in prices_dict.items():
        df = prices_df.copy().sort_values("date")
        df["return"] = df["adj_close"].pct_change()
        aligned_returns[ticker] = df.set_index("date")["return"].dropna()
    
    correlation_matrix = calculate_correlation_matrix(aligned_returns)
    
    # Get date range info
    all_dates = []
    for ticker, prices_df in prices_dict.items():
        all_dates.extend(prices_df["date"].tolist())
    
    date_range = {
        "start": str(min(all_dates)) if all_dates else None,
        "end": str(max(all_dates)) if all_dates else None,
    }
    
    return {
        "asset_stats": asset_stats,
        "correlation_matrix": correlation_matrix,
        "date_range": date_range,
        "tickers": list(returns_dict.keys()),
    }


@router.post("/rolling")
async def get_rolling_statistics(
    tickers: List[str],
    window: int = 60,
    start: Optional[date] = None,
    end: Optional[date] = None,
):
    """
    Get rolling/dynamic statistics for selected assets.
    
    Args:
        tickers: List of ticker symbols
        window: Rolling window size in trading days
        start: Optional start date
        end: Optional end date
    
    Returns:
        Rolling volatility, return, and correlation data over time.
    """
    if not tickers:
        raise HTTPException(status_code=400, detail="No tickers provided")
    
    if window < 5:
        raise HTTPException(status_code=400, detail="Window must be at least 5 days")
    
    tickers = [t.upper() for t in tickers]
    
    # Fetch price data for all tickers
    prices_dict = {}
    
    for ticker in tickers:
        data = data_loader.load_from_db(ticker, start, end, source="yfinance")
        if data.empty:
            continue
        prices_dict[ticker] = data
    
    if not prices_dict:
        raise HTTPException(status_code=404, detail="No data found for any ticker")
    
    # Calculate rolling statistics
    rolling_stats = calculate_rolling_stats(prices_dict, window)
    
    return {
        "window": window,
        "tickers": list(prices_dict.keys()),
        **rolling_stats,
    }


@router.post("/multi-window-rolling")
async def get_multi_window_rolling_statistics(
    request: MultiWindowRequest,
    start: Optional[date] = None,
    end: Optional[date] = None,
):
    """
    Get rolling statistics for multiple window sizes.
    
    Useful for comparing different lookback periods.
    """
    tickers = request.tickers
    windows = request.windows
    
    if not tickers:
        raise HTTPException(status_code=400, detail="No tickers provided")
    
    if not windows:
        raise HTTPException(status_code=400, detail="No windows provided")
    
    for w in windows:
        if w < 5:
            raise HTTPException(status_code=400, detail=f"Window {w} must be at least 5 days")
    
    tickers = [t.upper() for t in tickers]
    
    # Fetch price data for all tickers
    prices_dict = {}
    
    for ticker in tickers:
        data = data_loader.load_from_db(ticker, start, end, source="yfinance")
        if data.empty:
            continue
        prices_dict[ticker] = data
    
    if not prices_dict:
        raise HTTPException(status_code=404, detail="No data found for any ticker")
    
    # Calculate rolling statistics for each window
    results = {}
    for window in windows:
        rolling_stats = calculate_rolling_stats(prices_dict, window)
        results[str(window)] = {
            "window": window,
            **rolling_stats,
        }
    
    return {
        "windows": windows,
        "tickers": list(prices_dict.keys()),
        "results": results,
    }

