"""
Portfolio management module for saving and loading portfolio configurations.
"""
from datetime import datetime
from typing import Dict, List, Optional, Any
import json

from database.connection import get_raw_connection


class PortfolioManager:
    """Manages portfolio configurations in the database."""
    
    def validate_weights(self, weights: Dict[str, float], tolerance: float = 0.001) -> bool:
        """
        Ensure weights sum to 1.0 within tolerance.
        
        Args:
            weights: Dict of ticker -> weight
            tolerance: Acceptable deviation from 1.0
            
        Returns:
            True if weights are valid.
        """
        total = sum(weights.values())
        return abs(total - 1.0) <= tolerance
    
    def normalize_weights(self, weights: Dict[str, float]) -> Dict[str, float]:
        """
        Normalize weights to sum to 1.0.
        
        Args:
            weights: Dict of ticker -> weight
            
        Returns:
            Normalized weights dict.
        """
        total = sum(weights.values())
        if total == 0:
            # Equal weight if all zeros
            n = len(weights)
            return {k: 1.0 / n for k in weights}
        return {k: v / total for k, v in weights.items()}
    
    def save_portfolio_config(
        self,
        name: str,
        config: Dict[str, Any]
    ) -> Dict:
        """
        Persist portfolio configuration to database.
        
        Args:
            name: Portfolio name (unique identifier)
            config: Portfolio configuration dict
            
        Returns:
            Status dict.
        """
        config_json = json.dumps(config, default=str)
        now = datetime.now().isoformat()
        
        with get_raw_connection() as conn:
            conn.execute(
                """
                INSERT INTO portfolios (name, config, created_at, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(name) DO UPDATE SET
                    config = excluded.config,
                    updated_at = excluded.updated_at
                """,
                (name, config_json, now, now)
            )
            conn.commit()
        
        return {"status": "saved", "name": name}
    
    def load_portfolio_config(self, name: str) -> Optional[Dict]:
        """
        Load saved portfolio configuration.
        
        Args:
            name: Portfolio name
            
        Returns:
            Portfolio config dict or None if not found.
        """
        import pandas as pd
        
        with get_raw_connection() as conn:
            result = pd.read_sql(
                "SELECT config FROM portfolios WHERE name = ?",
                conn,
                params=[name]
            )
        
        if result.empty:
            return None
        
        return json.loads(result.iloc[0]["config"])
    
    def list_portfolios(self) -> List[Dict]:
        """
        List all saved portfolios.
        
        Returns:
            List of portfolio summary dicts.
        """
        import pandas as pd
        
        with get_raw_connection() as conn:
            result = pd.read_sql(
                """
                SELECT name, created_at, updated_at 
                FROM portfolios 
                ORDER BY updated_at DESC
                """,
                conn
            )
        
        return result.to_dict(orient="records")
    
    def delete_portfolio(self, name: str) -> Dict:
        """
        Delete a saved portfolio.
        
        Args:
            name: Portfolio name
            
        Returns:
            Status dict.
        """
        with get_raw_connection() as conn:
            cursor = conn.execute(
                "DELETE FROM portfolios WHERE name = ?",
                (name,)
            )
            conn.commit()
            
            if cursor.rowcount > 0:
                return {"status": "deleted", "name": name}
            else:
                return {"status": "not_found", "name": name}
    
    def create_equal_weight_portfolio(
        self,
        tickers: List[str]
    ) -> Dict[str, float]:
        """
        Create equal-weight allocation for given tickers.
        
        Args:
            tickers: List of ticker symbols
            
        Returns:
            Dict of ticker -> equal weight.
        """
        n = len(tickers)
        if n == 0:
            return {}
        weight = 1.0 / n
        return {ticker: weight for ticker in tickers}
    
    def create_custom_portfolio(
        self,
        tickers: List[str],
        weights: List[float],
        normalize: bool = True
    ) -> Dict[str, float]:
        """
        Create custom-weight allocation.
        
        Args:
            tickers: List of ticker symbols
            weights: List of weights (same order as tickers)
            normalize: Whether to normalize weights to sum to 1.0
            
        Returns:
            Dict of ticker -> weight.
        """
        if len(tickers) != len(weights):
            raise ValueError("Tickers and weights must have same length")
        
        portfolio = dict(zip(tickers, weights))
        
        if normalize:
            portfolio = self.normalize_weights(portfolio)
        
        return portfolio


# Singleton instance
portfolio_manager = PortfolioManager()

