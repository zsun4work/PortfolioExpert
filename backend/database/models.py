"""
SQLAlchemy models and Pydantic schemas for the Portfolio Viewer.
"""
from datetime import date, datetime
from typing import Optional, Dict, List, Any
from pydantic import BaseModel, Field
from sqlalchemy import Column, Integer, String, Float, Date, DateTime, Text, JSON
from sqlalchemy.orm import declarative_base

Base = declarative_base()


# ============================================================================
# SQLAlchemy ORM Models
# ============================================================================

class AssetPrice(Base):
    """Asset price data from yfinance."""
    __tablename__ = "asset_prices"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    ticker = Column(String, nullable=False, index=True)
    date = Column(Date, nullable=False)
    open = Column(Float)
    high = Column(Float)
    low = Column(Float)
    close = Column(Float)
    adj_close = Column(Float)
    volume = Column(Integer)
    created_at = Column(DateTime, default=datetime.utcnow)


class MacroData(Base):
    """Macroeconomic data from FRED."""
    __tablename__ = "macro_data"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    series_id = Column(String, nullable=False, index=True)
    date = Column(Date, nullable=False)
    value = Column(Float)
    created_at = Column(DateTime, default=datetime.utcnow)


class DataMetadata(Base):
    """Metadata for tracking data freshness."""
    __tablename__ = "data_metadata"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    ticker = Column(String, unique=True, nullable=False)
    source = Column(String, nullable=False)  # 'yfinance' or 'fred'
    first_date = Column(Date)
    last_date = Column(Date)
    last_updated = Column(DateTime)
    update_frequency = Column(String)  # 'daily', 'weekly', 'monthly'


class Portfolio(Base):
    """Saved portfolio configurations."""
    __tablename__ = "portfolios"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, unique=True, nullable=False)
    config = Column(JSON, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ============================================================================
# Pydantic Schemas for API
# ============================================================================

class TickerInfo(BaseModel):
    """Ticker information response."""
    ticker: str
    source: str
    first_date: Optional[date] = None
    last_date: Optional[date] = None


class TickerListResponse(BaseModel):
    """Response for listing tickers."""
    tickers: List[TickerInfo]


class DateRangeResponse(BaseModel):
    """Response for date range query."""
    ticker: str
    first_date: Optional[date] = None
    last_date: Optional[date] = None


class LoadDataRequest(BaseModel):
    """Request to load ticker data."""
    ticker: str
    start: Optional[date] = None
    end: Optional[date] = None
    source: str = "yfinance"  # 'yfinance' or 'fred'


class LoadDataResponse(BaseModel):
    """Response after loading data."""
    status: str
    ticker: str
    rows_added: int
    date_range: Optional[Dict[str, str]] = None


class BacktestRequest(BaseModel):
    """Request to run a backtest."""
    tickers: List[str]
    weights: Dict[str, float]
    start: date
    end: date
    margin: float = 1.0  # Margin/leverage ratio (1.0 = no leverage)


class SubPeriod(BaseModel):
    """Sub-period with custom weights and optional margin."""
    start: date
    end: date
    weights: Dict[str, float]
    margin: Optional[float] = None  # If None, uses global margin


class SubPeriodBacktestRequest(BaseModel):
    """Request for backtest with sub-periods."""
    tickers: List[str]
    global_weights: Dict[str, float]  # Default weights for periods not in sub-periods
    global_margin: float = 1.0  # Default margin for periods not in sub-periods
    start: date  # Full backtest start date
    end: date  # Full backtest end date
    periods: List[SubPeriod]  # Sub-period weight and margin overrides


class PerformanceMetrics(BaseModel):
    """Portfolio performance metrics."""
    total_return: float
    cagr: float
    volatility: float
    sharpe_ratio: float
    max_drawdown: float
    start_date: date
    end_date: date


class EquityCurvePoint(BaseModel):
    """Single point in equity curve."""
    date: date
    value: float


class BacktestResponse(BaseModel):
    """Response from backtest."""
    equity_curve: List[EquityCurvePoint]
    metrics: PerformanceMetrics


class WeightTimelinePoint(BaseModel):
    """Weight allocation at a point in time."""
    date: date
    weights: Dict[str, float]


class SubPeriodBacktestResponse(BaseModel):
    """Response from sub-period backtest."""
    equity_curve: List[EquityCurvePoint]
    metrics: PerformanceMetrics
    period_breakdown: List[Dict[str, Any]]
    weight_timeline: Optional[List[WeightTimelinePoint]] = None


class PortfolioConfig(BaseModel):
    """Portfolio configuration."""
    tickers: List[str]
    weights: Dict[str, float]
    date_range: Dict[str, date]
    sub_periods: Optional[List[SubPeriod]] = None


class SavePortfolioRequest(BaseModel):
    """Request to save a portfolio."""
    name: str
    config: PortfolioConfig


class PortfolioListItem(BaseModel):
    """Portfolio list item."""
    name: str
    created_at: datetime


class PortfolioListResponse(BaseModel):
    """Response for listing portfolios."""
    portfolios: List[PortfolioListItem]

