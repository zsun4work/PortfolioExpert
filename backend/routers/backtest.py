"""
API router for backtesting endpoints.
"""
from datetime import date
from typing import List
from fastapi import APIRouter, HTTPException

from modules.backtest_engine import backtest_engine, SubPeriod
from modules.portfolio import portfolio_manager
from database.models import (
    BacktestRequest,
    BacktestResponse,
    SubPeriodBacktestRequest,
    SubPeriodBacktestResponse,
    EquityCurvePoint,
    PerformanceMetrics,
    WeightTimelinePoint,
)

router = APIRouter(prefix="/backtest", tags=["backtest"])


@router.post("", response_model=BacktestResponse)
async def run_backtest(request: BacktestRequest):
    """
    Run a portfolio backtest.
    
    Args:
        request: Backtest configuration with tickers, weights, and date range
        
    Returns:
        Equity curve and performance metrics
    """
    # Validate weights
    if not portfolio_manager.validate_weights(request.weights, tolerance=0.01):
        # Auto-normalize if not valid
        request.weights = portfolio_manager.normalize_weights(request.weights)
    
    # Validate date range
    if request.start >= request.end:
        raise HTTPException(
            status_code=400,
            detail="Start date must be before end date"
        )
    
    # Validate all tickers have weights
    for ticker in request.tickers:
        if ticker not in request.weights:
            raise HTTPException(
                status_code=400,
                detail=f"Missing weight for ticker: {ticker}"
            )
    
    try:
        result = await backtest_engine.run_backtest(
            tickers=request.tickers,
            weights=request.weights,
            start=request.start,
            end=request.end,
            margin=request.margin,
        )
        
        return BacktestResponse(
            equity_curve=[
                EquityCurvePoint(
                    date=row["date"],
                    value=round(row["value"], 4),
                )
                for _, row in result.equity_curve.iterrows()
            ],
            metrics=PerformanceMetrics(
                total_return=result.metrics.total_return,
                cagr=result.metrics.cagr,
                volatility=result.metrics.volatility,
                sharpe_ratio=result.metrics.sharpe_ratio,
                max_drawdown=result.metrics.max_drawdown,
                start_date=result.metrics.start_date,
                end_date=result.metrics.end_date,
            ),
        )
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Backtest error: {str(e)}"
        )


@router.post("/subperiod", response_model=SubPeriodBacktestResponse)
async def run_subperiod_backtest(request: SubPeriodBacktestRequest):
    """
    Run a backtest with different weights for different time periods.
    
    The full date range uses global_weights, except for specified sub-periods
    which use their own weights.
    
    Args:
        request: Configuration with tickers, global weights, date range, and sub-periods
        
    Returns:
        Combined equity curve, overall metrics, period breakdown, and weight timeline
    """
    # Validate date range
    if request.start >= request.end:
        raise HTTPException(
            status_code=400,
            detail="Start date must be before end date"
        )
    
    # Normalize global weights
    global_weights = request.global_weights
    if not portfolio_manager.validate_weights(global_weights, tolerance=0.01):
        global_weights = portfolio_manager.normalize_weights(global_weights)
    
    # Validate periods
    for i, period in enumerate(request.periods):
        if period.start >= period.end:
            raise HTTPException(
                status_code=400,
                detail=f"Period {i+1}: start date must be before end date"
            )
        
        # Normalize weights if needed
        if not portfolio_manager.validate_weights(period.weights, tolerance=0.01):
            period.weights = portfolio_manager.normalize_weights(period.weights)
    
    # Convert to SubPeriod objects with margin
    sub_periods = [
        SubPeriod(
            start=p.start,
            end=p.end,
            weights=p.weights,
            margin=p.margin if p.margin is not None else request.global_margin,
        )
        for p in request.periods
    ]
    
    try:
        result = await backtest_engine.run_subperiod_backtest_v2(
            tickers=request.tickers,
            global_weights=global_weights,
            global_margin=request.global_margin,
            start=request.start,
            end=request.end,
            sub_periods=sub_periods,
        )
        
        # Build weight timeline for visualization
        weight_timeline = []
        for period_info in result.period_breakdown or []:
            weight_timeline.append(
                WeightTimelinePoint(
                    date=date.fromisoformat(period_info["start"]) if isinstance(period_info["start"], str) else period_info["start"],
                    weights=period_info["weights"],
                )
            )
        
        return SubPeriodBacktestResponse(
            equity_curve=[
                EquityCurvePoint(
                    date=row["date"],
                    value=round(row["value"], 4),
                )
                for _, row in result.equity_curve.iterrows()
            ],
            metrics=PerformanceMetrics(
                total_return=result.metrics.total_return,
                cagr=result.metrics.cagr,
                volatility=result.metrics.volatility,
                sharpe_ratio=result.metrics.sharpe_ratio,
                max_drawdown=result.metrics.max_drawdown,
                start_date=result.metrics.start_date,
                end_date=result.metrics.end_date,
            ),
            period_breakdown=result.period_breakdown or [],
            weight_timeline=weight_timeline,
        )
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Backtest error: {str(e)}"
        )


@router.post("/analyze-period")
async def analyze_period(
    tickers: List[str],
    weights: dict,
    full_start: date,
    full_end: date,
    period_start: date,
    period_end: date,
):
    """
    Run a full backtest then analyze a specific sub-period.
    
    Useful for seeing how a specific time period performed
    within the context of a larger backtest.
    """
    # Normalize weights
    weights = portfolio_manager.normalize_weights(weights)
    
    try:
        # Run full backtest
        full_result = await backtest_engine.run_backtest(
            tickers=tickers,
            weights=weights,
            start=full_start,
            end=full_end,
        )
        
        # Analyze the sub-period
        period_metrics = backtest_engine.get_period_analysis(
            full_result.equity_curve,
            period_start,
            period_end,
        )
        
        return {
            "full_backtest": full_result.metrics.to_dict(),
            "period_analysis": period_metrics,
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Analysis error: {str(e)}"
        )

