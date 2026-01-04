"""
Backtesting engine for portfolio performance calculations.
"""
from datetime import date
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple
import pandas as pd
import numpy as np

from .data_loader import data_loader
from .utils import merge_time_series, handle_missing_data


@dataclass
class SubPeriod:
    """Sub-period with custom allocation weights and margin."""
    start: date
    end: date
    weights: Dict[str, float]
    margin: float = 1.0  # Margin/leverage ratio


@dataclass
class PerformanceMetrics:
    """Portfolio performance metrics."""
    total_return: float
    cagr: float
    volatility: float
    sharpe_ratio: float
    max_drawdown: float
    start_date: date
    end_date: date
    risk_free_rate: float = 0.02  # The actual risk-free rate used
    
    def to_dict(self) -> Dict:
        return {
            "total_return": round(self.total_return, 4),
            "cagr": round(self.cagr, 4),
            "volatility": round(self.volatility, 4),
            "sharpe_ratio": round(self.sharpe_ratio, 4),
            "max_drawdown": round(self.max_drawdown, 4),
            "start_date": self.start_date.isoformat(),
            "end_date": self.end_date.isoformat(),
            "risk_free_rate": round(self.risk_free_rate, 4),
        }


@dataclass
class BacktestResult:
    """Complete backtest result."""
    equity_curve: pd.DataFrame
    metrics: PerformanceMetrics
    period_breakdown: Optional[List[Dict]] = None
    
    def to_dict(self) -> Dict:
        return {
            "equity_curve": [
                {"date": row["date"].isoformat(), "value": round(row["value"], 4)}
                for _, row in self.equity_curve.iterrows()
            ],
            "metrics": self.metrics.to_dict(),
            "period_breakdown": self.period_breakdown or [],
        }


class BacktestEngine:
    """Engine for running portfolio backtests."""
    
    TRADING_DAYS_PER_YEAR = 252
    DEFAULT_RISK_FREE_RATE = 0.02  # 2% fallback if Fed rate unavailable
    MARGIN_FEE = 0.01  # 1% annual fee on top of risk-free rate for borrowed funds
    
    # =========================================================================
    # Fed Rate Methods
    # =========================================================================
    
    def get_fed_rate_for_period(
        self,
        start: date,
        end: date
    ) -> Optional[float]:
        """
        Get average Federal Funds Rate for a given period.
        
        Args:
            start: Period start date
            end: Period end date
            
        Returns:
            Average annualized Fed rate as decimal (e.g., 0.05 for 5%),
            or None if data unavailable.
        """
        from config import FED_FUNDS_RATE_SERIES
        
        try:
            fed_data = data_loader.load_from_db(
                FED_FUNDS_RATE_SERIES, 
                start, 
                end, 
                source="fred"
            )
            
            if fed_data.empty:
                return None
            
            # Fed rate is already in percentage, convert to decimal
            avg_rate = fed_data["value"].mean() / 100.0
            return avg_rate
            
        except Exception as e:
            print(f"Could not load Fed rate: {e}")
            return None
    
    # =========================================================================
    # Core Calculation Methods
    # =========================================================================
    
    def calculate_returns(
        self,
        prices: pd.DataFrame,
        price_col: str = "adj_close"
    ) -> pd.DataFrame:
        """
        Compute daily returns from price data.
        
        Args:
            prices: DataFrame with date and price columns
            price_col: Name of the price column
            
        Returns:
            DataFrame with date and return columns.
        """
        df = prices.copy()
        df = df.sort_values("date")
        df["return"] = df[price_col].pct_change()
        return df[["date", "return"]].dropna()
    
    def apply_weights(
        self,
        returns_dict: Dict[str, pd.DataFrame],
        weights: Dict[str, float]
    ) -> pd.DataFrame:
        """
        Apply allocation weights to individual asset returns.
        
        Args:
            returns_dict: Dict of ticker -> DataFrame with returns
            weights: Dict of ticker -> weight (should sum to 1.0)
            
        Returns:
            DataFrame with weighted portfolio returns.
        """
        # Normalize weights
        weight_sum = sum(weights.values())
        if weight_sum != 1.0:
            weights = {k: v / weight_sum for k, v in weights.items()}
        
        # Merge all returns on date
        dfs = []
        for ticker, df in returns_dict.items():
            df = df.copy()
            df = df.rename(columns={"return": f"return_{ticker}"})
            dfs.append(df)
        
        if not dfs:
            return pd.DataFrame(columns=["date", "return"])
        
        merged = dfs[0]
        for df in dfs[1:]:
            merged = pd.merge(merged, df, on="date", how="inner")
        
        # Calculate weighted return
        merged["return"] = sum(
            merged[f"return_{ticker}"] * weight
            for ticker, weight in weights.items()
            if f"return_{ticker}" in merged.columns
        )
        
        return merged[["date", "return"]]
    
    def apply_margin(
        self,
        returns: pd.DataFrame,
        margin: float,
        start: date,
        end: date
    ) -> pd.DataFrame:
        """
        Apply margin/leverage to portfolio returns.
        
        If margin > 1, the borrowed amount incurs interest at (Fed rate + margin fee).
        Leveraged return = margin * portfolio_return - daily_interest_cost
        
        Args:
            returns: DataFrame with date and return columns
            margin: Margin ratio (1.0 = no leverage, 2.0 = 2x leverage)
            start: Period start date (for Fed rate lookup)
            end: Period end date (for Fed rate lookup)
            
        Returns:
            DataFrame with margin-adjusted returns.
        """
        if margin == 1.0:
            return returns
        
        df = returns.copy()
        
        # Get the risk-free rate for interest calculation
        fed_rate = self.get_fed_rate_for_period(start, end)
        if fed_rate is None:
            fed_rate = self.DEFAULT_RISK_FREE_RATE
        
        # Daily interest rate for borrowed funds
        # Interest is charged on (margin - 1) portion at (Fed rate + margin fee)
        annual_borrow_rate = fed_rate + self.MARGIN_FEE
        daily_borrow_rate = annual_borrow_rate / self.TRADING_DAYS_PER_YEAR
        
        # Daily interest cost as a fraction of portfolio value
        # If margin = 2, we borrow 100% of portfolio, so interest cost = 1 * daily_rate
        daily_interest_cost = (margin - 1) * daily_borrow_rate
        
        # Leveraged return = margin * base_return - interest_cost
        df["return"] = margin * df["return"] - daily_interest_cost
        
        return df
    
    def compute_equity_curve(
        self,
        returns: pd.DataFrame,
        initial_value: float = 100.0
    ) -> pd.DataFrame:
        """
        Generate cumulative equity curve from returns.
        
        Args:
            returns: DataFrame with date and return columns
            initial_value: Starting portfolio value
            
        Returns:
            DataFrame with date and value columns.
        """
        df = returns.copy()
        df = df.sort_values("date")
        df["value"] = initial_value * (1 + df["return"]).cumprod()
        return df[["date", "value"]]
    
    def calculate_metrics(
        self,
        equity_curve: pd.DataFrame,
        risk_free_rate: Optional[float] = None
    ) -> PerformanceMetrics:
        """
        Compute comprehensive performance metrics.
        
        Args:
            equity_curve: DataFrame with date and value columns
            risk_free_rate: Optional risk-free rate (defaults to Fed rate or fallback)
            
        Returns:
            PerformanceMetrics object.
        """
        df = equity_curve.copy()
        df = df.sort_values("date")
        
        start_value = df["value"].iloc[0]
        end_value = df["value"].iloc[-1]
        start_date = df["date"].iloc[0]
        end_date = df["date"].iloc[-1]
        
        # Total return
        total_return = (end_value / start_value) - 1
        
        # CAGR
        if isinstance(start_date, str):
            start_date = pd.to_datetime(start_date).date()
        if isinstance(end_date, str):
            end_date = pd.to_datetime(end_date).date()
            
        days = (end_date - start_date).days
        years = days / 365.25
        
        if years > 0:
            cagr = (end_value / start_value) ** (1 / years) - 1
        else:
            cagr = 0.0
        
        # Daily returns for volatility calculation
        df["daily_return"] = df["value"].pct_change()
        daily_returns = df["daily_return"].dropna()
        
        # Annualized volatility
        volatility = daily_returns.std() * np.sqrt(self.TRADING_DAYS_PER_YEAR)
        
        # Get risk-free rate (try Fed rate if not provided)
        if risk_free_rate is None:
            risk_free_rate = self.get_fed_rate_for_period(start_date, end_date)
        if risk_free_rate is None:
            risk_free_rate = self.DEFAULT_RISK_FREE_RATE
        
        # Sharpe ratio
        excess_return = cagr - risk_free_rate
        sharpe_ratio = excess_return / volatility if volatility > 0 else 0.0
        
        # Maximum drawdown
        df["cummax"] = df["value"].cummax()
        df["drawdown"] = (df["value"] - df["cummax"]) / df["cummax"]
        max_drawdown = df["drawdown"].min()
        
        return PerformanceMetrics(
            total_return=total_return,
            cagr=cagr,
            volatility=volatility,
            sharpe_ratio=sharpe_ratio,
            max_drawdown=max_drawdown,
            start_date=start_date,
            end_date=end_date,
            risk_free_rate=risk_free_rate,
        )
    
    # =========================================================================
    # High-Level Backtest Methods
    # =========================================================================
    
    async def run_backtest(
        self,
        tickers: List[str],
        weights: Dict[str, float],
        start: date,
        end: date,
        margin: float = 1.0
    ) -> BacktestResult:
        """
        Run a full backtest pipeline.
        
        Args:
            tickers: List of ticker symbols
            weights: Allocation weights for each ticker
            start: Start date
            end: End date
            margin: Leverage ratio (1.0 = no leverage)
            
        Returns:
            BacktestResult with equity curve and metrics.
        """
        # Fetch data for all tickers
        returns_dict = {}
        for ticker in tickers:
            data = await data_loader.get_asset_data(ticker, start, end)
            if data.empty:
                continue
            returns = self.calculate_returns(data)
            returns_dict[ticker] = returns
        
        if not returns_dict:
            raise ValueError("No data available for any of the specified tickers")
        
        # Apply weights and compute portfolio returns
        portfolio_returns = self.apply_weights(returns_dict, weights)
        
        # Apply margin/leverage if specified
        if margin != 1.0:
            portfolio_returns = self.apply_margin(portfolio_returns, margin, start, end)
        
        # Generate equity curve
        equity_curve = self.compute_equity_curve(portfolio_returns)
        
        # Calculate metrics
        metrics = self.calculate_metrics(equity_curve)
        
        return BacktestResult(
            equity_curve=equity_curve,
            metrics=metrics,
        )
    
    async def run_subperiod_backtest(
        self,
        tickers: List[str],
        periods: List[SubPeriod]
    ) -> BacktestResult:
        """
        Run backtest with different weights for different time periods.
        
        Args:
            tickers: List of ticker symbols
            periods: List of SubPeriod objects with dates and weights
            
        Returns:
            BacktestResult with stitched equity curve.
        """
        # Sort periods by start date
        periods = sorted(periods, key=lambda p: p.start)
        
        curves = []
        period_breakdown = []
        last_value = 100.0
        
        for period in periods:
            # Run backtest for this period
            result = await self.run_backtest(
                tickers,
                period.weights,
                period.start,
                period.end
            )
            
            # Scale equity curve to continue from last value
            curve = result.equity_curve.copy()
            if curves:
                scale_factor = last_value / curve["value"].iloc[0]
                curve["value"] = curve["value"] * scale_factor
            
            last_value = curve["value"].iloc[-1]
            curves.append(curve)
            
            period_breakdown.append({
                "start": period.start.isoformat(),
                "end": period.end.isoformat(),
                "weights": period.weights,
                "return": result.metrics.total_return,
            })
        
        # Stitch curves together
        full_curve = pd.concat(curves, ignore_index=True)
        full_curve = full_curve.drop_duplicates(subset=["date"], keep="last")
        full_curve = full_curve.sort_values("date").reset_index(drop=True)
        
        # Calculate overall metrics
        overall_metrics = self.calculate_metrics(full_curve)
        
        return BacktestResult(
            equity_curve=full_curve,
            metrics=overall_metrics,
            period_breakdown=period_breakdown,
        )
    
    async def run_subperiod_backtest_v2(
        self,
        tickers: List[str],
        global_weights: Dict[str, float],
        global_margin: float,
        start: date,
        end: date,
        sub_periods: List[SubPeriod]
    ) -> BacktestResult:
        """
        Run backtest with sub-period weight and margin overrides.
        
        The full date range uses global_weights and global_margin, except for 
        specified sub-periods which can override both weights and margin.
        
        Args:
            tickers: List of ticker symbols
            global_weights: Default weights for periods not covered by sub-periods
            global_margin: Default margin for periods not covered by sub-periods
            start: Full backtest start date
            end: Full backtest end date  
            sub_periods: List of SubPeriod objects with custom weights and margin
            
        Returns:
            BacktestResult with equity curve spanning full date range.
        """
        from datetime import timedelta
        
        # Sort sub-periods by start date
        sub_periods = sorted(sub_periods, key=lambda p: p.start)
        
        # Build complete period list, filling gaps with global weights and margin
        all_periods = []
        current_date = start
        
        for sp in sub_periods:
            # If there's a gap before this sub-period, fill with global weights/margin
            if sp.start > current_date:
                all_periods.append(SubPeriod(
                    start=current_date,
                    end=sp.start - timedelta(days=1),
                    weights=global_weights,
                    margin=global_margin,
                ))
            
            # Add the sub-period with its custom weights and margin
            # Use sub-period margin if specified, otherwise use global margin
            period_margin = sp.margin if sp.margin is not None else global_margin
            all_periods.append(SubPeriod(
                start=sp.start,
                end=sp.end,
                weights=sp.weights,
                margin=period_margin,
            ))
            current_date = sp.end + timedelta(days=1)
        
        # Fill any remaining time after the last sub-period
        if current_date <= end:
            all_periods.append(SubPeriod(
                start=current_date,
                end=end,
                weights=global_weights,
                margin=global_margin,
            ))
        
        # Run backtest for each period and stitch together
        curves = []
        period_breakdown = []
        last_value = 100.0
        
        for period in all_periods:
            # Skip periods with invalid date ranges
            if period.start > period.end:
                continue
                
            result = await self.run_backtest(
                tickers,
                period.weights,
                period.start,
                period.end,
                margin=period.margin,
            )
            
            if result.equity_curve.empty:
                continue
            
            # Scale equity curve to continue from last value
            curve = result.equity_curve.copy()
            if curves:
                scale_factor = last_value / curve["value"].iloc[0]
                curve["value"] = curve["value"] * scale_factor
            
            last_value = curve["value"].iloc[-1]
            curves.append(curve)
            
            # Track if this is a sub-period override or global weights
            is_override = any(
                sp.start == period.start and sp.end == period.end 
                for sp in sub_periods
            )
            
            period_breakdown.append({
                "start": period.start.isoformat(),
                "end": period.end.isoformat(),
                "weights": period.weights,
                "margin": period.margin,
                "return": result.metrics.total_return,
                "is_override": is_override,
            })
        
        if not curves:
            raise ValueError("No data available for the specified period")
        
        # Stitch curves together
        full_curve = pd.concat(curves, ignore_index=True)
        full_curve = full_curve.drop_duplicates(subset=["date"], keep="last")
        full_curve = full_curve.sort_values("date").reset_index(drop=True)
        
        # Calculate overall metrics
        overall_metrics = self.calculate_metrics(full_curve)
        
        return BacktestResult(
            equity_curve=full_curve,
            metrics=overall_metrics,
            period_breakdown=period_breakdown,
        )
    
    def get_period_analysis(
        self,
        equity_curve: pd.DataFrame,
        period_start: date,
        period_end: date
    ) -> Dict:
        """
        Get metrics for a specific sub-period of an existing backtest.
        
        Args:
            equity_curve: Full equity curve DataFrame
            period_start: Start of analysis period
            period_end: End of analysis period
            
        Returns:
            Dict with period metrics.
        """
        df = equity_curve.copy()
        df["date"] = pd.to_datetime(df["date"]).dt.date
        
        mask = (df["date"] >= period_start) & (df["date"] <= period_end)
        period_curve = df[mask].copy()
        
        if period_curve.empty:
            return {"error": "No data in specified period"}
        
        # Normalize to start at 100
        start_val = period_curve["value"].iloc[0]
        period_curve["value"] = period_curve["value"] / start_val * 100
        
        metrics = self.calculate_metrics(period_curve)
        return metrics.to_dict()


# Singleton instance
backtest_engine = BacktestEngine()

