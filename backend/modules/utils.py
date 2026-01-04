"""
Utility functions for the Portfolio Viewer backend.
"""
from datetime import date, datetime
from typing import List, Dict, Any, Optional, Tuple
import pandas as pd
import numpy as np


def date_range_overlap(
    range1: Tuple[date, date], 
    range2: Tuple[date, date]
) -> bool:
    """
    Check if two date ranges overlap.
    
    Args:
        range1: Tuple of (start_date, end_date)
        range2: Tuple of (start_date, end_date)
        
    Returns:
        True if ranges overlap, False otherwise.
    """
    start1, end1 = range1
    start2, end2 = range2
    return start1 <= end2 and start2 <= end1


def find_missing_ranges(
    existing_data: pd.DataFrame,
    start: date,
    end: date,
    date_column: str = "date"
) -> List[Tuple[date, date]]:
    """
    Find date ranges that are missing from existing data.
    
    Args:
        existing_data: DataFrame with existing data
        start: Requested start date
        end: Requested end date
        date_column: Name of the date column
        
    Returns:
        List of (start, end) tuples for missing ranges.
    """
    if existing_data.empty:
        return [(start, end)]
    
    existing_dates = pd.to_datetime(existing_data[date_column]).dt.date
    min_existing = existing_dates.min()
    max_existing = existing_dates.max()
    
    missing_ranges = []
    
    # Check if we need data before existing range
    if start < min_existing:
        missing_ranges.append((start, min_existing))
    
    # Check if we need data after existing range
    if end > max_existing:
        missing_ranges.append((max_existing, end))
    
    return missing_ranges


def merge_time_series(series_list: List[pd.DataFrame], on: str = "date") -> pd.DataFrame:
    """
    Align and merge multiple time series DataFrames.
    
    Args:
        series_list: List of DataFrames to merge
        on: Column name to merge on
        
    Returns:
        Merged DataFrame with aligned dates.
    """
    if not series_list:
        return pd.DataFrame()
    
    if len(series_list) == 1:
        return series_list[0]
    
    result = series_list[0]
    for df in series_list[1:]:
        result = pd.merge(result, df, on=on, how="inner")
    
    return result.sort_values(on).reset_index(drop=True)


def resample_to_frequency(
    data: pd.DataFrame,
    freq: str = "M",
    date_column: str = "date",
    value_column: str = "adj_close",
    method: str = "last"
) -> pd.DataFrame:
    """
    Resample time series data to a different frequency.
    
    Args:
        data: DataFrame with time series data
        freq: Target frequency ('D', 'W', 'M', 'Q', 'Y')
        date_column: Name of the date column
        value_column: Name of the value column
        method: Aggregation method ('last', 'first', 'mean', 'sum')
        
    Returns:
        Resampled DataFrame.
    """
    df = data.copy()
    df[date_column] = pd.to_datetime(df[date_column])
    df = df.set_index(date_column)
    
    agg_funcs = {
        "last": "last",
        "first": "first", 
        "mean": "mean",
        "sum": "sum",
    }
    
    resampled = df.resample(freq).agg(agg_funcs.get(method, "last"))
    return resampled.reset_index()


def handle_missing_data(
    data: pd.DataFrame,
    method: str = "ffill",
    columns: Optional[List[str]] = None
) -> pd.DataFrame:
    """
    Handle missing values in DataFrame.
    
    Args:
        data: DataFrame with potential missing values
        method: Fill method ('ffill', 'bfill', 'drop', 'zero', 'mean')
        columns: Specific columns to apply to (None = all)
        
    Returns:
        DataFrame with missing values handled.
    """
    df = data.copy()
    target_cols = columns or df.select_dtypes(include=[np.number]).columns.tolist()
    
    if method == "ffill":
        df[target_cols] = df[target_cols].ffill()
    elif method == "bfill":
        df[target_cols] = df[target_cols].bfill()
    elif method == "drop":
        df = df.dropna(subset=target_cols)
    elif method == "zero":
        df[target_cols] = df[target_cols].fillna(0)
    elif method == "mean":
        for col in target_cols:
            df[col] = df[col].fillna(df[col].mean())
    
    return df


def format_response(
    data: Any,
    status: str = "success",
    message: Optional[str] = None
) -> Dict[str, Any]:
    """
    Standardize API response format.
    
    Args:
        data: Response data
        status: Status string ('success', 'error')
        message: Optional message
        
    Returns:
        Formatted response dictionary.
    """
    response = {
        "status": status,
        "data": data,
    }
    if message:
        response["message"] = message
    return response


def calculate_business_days(start: date, end: date) -> int:
    """Calculate number of business days between two dates."""
    return len(pd.bdate_range(start, end))


def date_to_string(d: date) -> str:
    """Convert date to ISO format string."""
    if isinstance(d, datetime):
        return d.date().isoformat()
    return d.isoformat()


def string_to_date(s: str) -> date:
    """Convert ISO format string to date."""
    return datetime.strptime(s, "%Y-%m-%d").date()


def validate_date_range(start: date, end: date) -> bool:
    """Validate that start date is before end date."""
    return start <= end


def annualization_factor(periods_per_year: int = 252) -> float:
    """Return annualization factor for given trading periods."""
    return np.sqrt(periods_per_year)

