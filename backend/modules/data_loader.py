"""
Data loading and caching module for fetching asset and macro data.
Uses direct Yahoo Finance API (no yfinance library).
"""
from datetime import date, datetime, timedelta
from typing import Optional, List, Dict
import time
import pandas as pd
import requests

from database.connection import get_raw_connection
from config import FRED_API_KEY, DEFAULT_START_DATE, CACHE_EXPIRY_DAYS


class DataLoader:
    """Handles data fetching from external sources and caching to SQLite."""
    
    def __init__(self):
        self._fred = None
        # Create a custom session with browser headers
        self._session = requests.Session()
        self._session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        })
    
    @property
    def fred(self):
        """Lazy load FRED API client."""
        if self._fred is None and FRED_API_KEY:
            from fredapi import Fred
            self._fred = Fred(api_key=FRED_API_KEY)
        return self._fred
    
    # =========================================================================
    # Public API Methods
    # =========================================================================
    
    def fetch_asset_data(
        self,
        ticker: str,
        start: Optional[date] = None,
        end: Optional[date] = None
    ) -> pd.DataFrame:
        """
        Fetch price data directly from Yahoo Finance API.
        
        Args:
            ticker: Stock/ETF ticker symbol
            start: Start date (default: 2010-01-01)
            end: End date (default: today)
            
        Returns:
            DataFrame with OHLCV data.
        """
        start = start or datetime.strptime(DEFAULT_START_DATE, "%Y-%m-%d").date()
        end = end or date.today()
        
        print(f"Fetching {ticker} from Yahoo Finance ({start} to {end})")
        
        try:
            # Convert dates to Unix timestamps
            start_dt = datetime.combine(start, datetime.min.time())
            end_dt = datetime.combine(end, datetime.max.time())
            start_ts = int(start_dt.timestamp())
            end_ts = int(end_dt.timestamp())
            
            url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}"
            params = {
                "period1": start_ts,
                "period2": end_ts,
                "interval": "1d",
                "events": "history",
            }
            
            response = self._session.get(url, params=params, timeout=30)
            response.raise_for_status()
            
            data = response.json()
            
            # Check for errors in response
            if "chart" not in data or "result" not in data["chart"] or not data["chart"]["result"]:
                print(f"No data in Yahoo Finance response for {ticker}")
                return pd.DataFrame()
            
            result = data["chart"]["result"][0]
            
            # Extract timestamps and quotes
            timestamps = result.get("timestamp", [])
            if not timestamps:
                print(f"No timestamps in Yahoo Finance response for {ticker}")
                return pd.DataFrame()
            
            quotes = result.get("indicators", {}).get("quote", [{}])[0]
            adjclose = result.get("indicators", {}).get("adjclose", [{}])
            adjclose_values = adjclose[0].get("adjclose", []) if adjclose else []
            
            # Build DataFrame
            df = pd.DataFrame({
                "date": pd.to_datetime(timestamps, unit="s"),
                "open": quotes.get("open", []),
                "high": quotes.get("high", []),
                "low": quotes.get("low", []),
                "close": quotes.get("close", []),
                "adj_close": adjclose_values if adjclose_values else quotes.get("close", []),
                "volume": quotes.get("volume", []),
                "ticker": ticker,
            })
            
            # Clean up
            df = df.dropna(how="all", subset=["open", "high", "low", "close"])
            df["date"] = df["date"].dt.date
            
            if df.empty:
                print(f"No valid data for {ticker}")
                return pd.DataFrame()
            
            print(f"Successfully fetched {len(df)} rows for {ticker}")
            return df
            
        except requests.exceptions.HTTPError as e:
            print(f"HTTP error fetching {ticker}: {e}")
            return pd.DataFrame()
        except Exception as e:
            print(f"Error fetching {ticker}: {e}")
            import traceback
            traceback.print_exc()
            return pd.DataFrame()
    
    def fetch_macro_data(
        self,
        series_id: str,
        start: Optional[date] = None,
        end: Optional[date] = None
    ) -> pd.DataFrame:
        """
        Fetch economic data from FRED.
        
        Args:
            series_id: FRED series ID (e.g., 'DGS10', 'CPIAUCSL')
            start: Start date
            end: End date
            
        Returns:
            DataFrame with date and value columns.
        """
        if self.fred is None:
            print("FRED API key not configured. Set FRED_API_KEY environment variable.")
            return pd.DataFrame()
        
        start = start or datetime.strptime(DEFAULT_START_DATE, "%Y-%m-%d").date()
        end = end or date.today()
        
        try:
            data = self.fred.get_series(
                series_id,
                observation_start=start,
                observation_end=end
            )
            
            if data.empty:
                return pd.DataFrame()
            
            df = data.reset_index()
            df.columns = ["date", "value"]
            df["series_id"] = series_id
            df["date"] = pd.to_datetime(df["date"]).dt.date
            df = df.dropna()
            
            return df
            
        except Exception as e:
            print(f"Error fetching FRED series {series_id}: {e}")
            return pd.DataFrame()
    
    def cache_to_db(self, data: pd.DataFrame, table_name: str) -> int:
        """
        Store fetched data in SQLite.
        
        Args:
            data: DataFrame to store
            table_name: Target table ('asset_prices' or 'macro_data')
            
        Returns:
            Number of rows added.
        """
        if data.empty:
            return 0
        
        with get_raw_connection() as conn:
            existing_count = pd.read_sql(
                f"SELECT COUNT(*) as cnt FROM {table_name}",
                conn
            )["cnt"].iloc[0]
            
            # Use INSERT OR IGNORE to skip duplicates
            if table_name == "asset_prices":
                cols = ["ticker", "date", "open", "high", "low", "close", "adj_close", "volume"]
                placeholders = ", ".join(["?"] * len(cols))
                sql = f"INSERT OR IGNORE INTO {table_name} ({', '.join(cols)}) VALUES ({placeholders})"
                
                rows = data[cols].values.tolist()
                conn.executemany(sql, rows)
            elif table_name == "macro_data":
                cols = ["series_id", "date", "value"]
                placeholders = ", ".join(["?"] * len(cols))
                sql = f"INSERT OR IGNORE INTO {table_name} ({', '.join(cols)}) VALUES ({placeholders})"
                
                rows = data[cols].values.tolist()
                conn.executemany(sql, rows)
            else:
                # Fallback for other tables
                data.to_sql(
                    table_name,
                    conn,
                    if_exists="append",
                    index=False,
                    method="multi"
                )
            
            conn.commit()
            
            new_count = pd.read_sql(
                f"SELECT COUNT(*) as cnt FROM {table_name}",
                conn
            )["cnt"].iloc[0]
            
            return new_count - existing_count
    
    def load_from_db(
        self,
        ticker: str,
        start: Optional[date] = None,
        end: Optional[date] = None,
        source: str = "yfinance"
    ) -> pd.DataFrame:
        """
        Load cached data from SQLite.
        
        Args:
            ticker: Ticker symbol or FRED series ID
            start: Start date filter
            end: End date filter
            source: Data source ('yfinance' or 'fred')
            
        Returns:
            DataFrame with cached data.
        """
        if source == "yfinance":
            table = "asset_prices"
            id_col = "ticker"
        else:
            table = "macro_data"
            id_col = "series_id"
        
        query = f"SELECT * FROM {table} WHERE {id_col} = ?"
        params = [ticker]
        
        if start:
            query += " AND date >= ?"
            params.append(start.isoformat())
        
        if end:
            query += " AND date <= ?"
            params.append(end.isoformat())
        
        query += " ORDER BY date"
        
        with get_raw_connection() as conn:
            df = pd.read_sql(query, conn, params=params)
        
        if not df.empty:
            df["date"] = pd.to_datetime(df["date"]).dt.date
        
        return df
    
    def check_data_freshness(self, ticker: str, source: str = "yfinance") -> Dict:
        """
        Check if cached data needs update.
        
        Args:
            ticker: Ticker to check
            source: Data source
            
        Returns:
            Dict with freshness info.
        """
        with get_raw_connection() as conn:
            result = pd.read_sql(
                """
                SELECT * FROM data_metadata 
                WHERE ticker = ? AND source = ?
                """,
                conn,
                params=[ticker, source]
            )
        
        if result.empty:
            return {"needs_update": True, "reason": "not_cached"}
        
        row = result.iloc[0]
        last_updated = datetime.fromisoformat(row["last_updated"])
        days_old = (datetime.now() - last_updated).days
        
        if days_old >= CACHE_EXPIRY_DAYS:
            return {
                "needs_update": True,
                "reason": "stale",
                "last_updated": last_updated,
                "days_old": days_old
            }
        
        return {
            "needs_update": False,
            "last_updated": last_updated,
            "first_date": row["first_date"],
            "last_date": row["last_date"]
        }
    
    def update_metadata(
        self,
        ticker: str,
        source: str,
        first_date: date,
        last_date: date
    ):
        """Update data metadata after fetching."""
        with get_raw_connection() as conn:
            conn.execute(
                """
                INSERT INTO data_metadata (ticker, source, first_date, last_date, last_updated, update_frequency)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(ticker) DO UPDATE SET
                    first_date = MIN(first_date, excluded.first_date),
                    last_date = MAX(last_date, excluded.last_date),
                    last_updated = excluded.last_updated
                """,
                (ticker, source, first_date.isoformat(), last_date.isoformat(), 
                 datetime.now().isoformat(), "daily")
            )
            conn.commit()
    
    def update_data(
        self,
        ticker: str,
        source: str = "yfinance",
        force: bool = False
    ) -> Dict:
        """
        Smart update: fetch only missing/new dates.
        
        Args:
            ticker: Ticker to update
            source: Data source
            force: Force full refresh
            
        Returns:
            Update result info.
        """
        freshness = self.check_data_freshness(ticker, source)
        
        if not force and not freshness["needs_update"]:
            return {"status": "up_to_date", "rows_added": 0}
        
        # Determine what dates to fetch
        existing = self.load_from_db(ticker, source=source)
        
        if existing.empty or force:
            start = datetime.strptime(DEFAULT_START_DATE, "%Y-%m-%d").date()
        else:
            start = existing["date"].max() + timedelta(days=1)
        
        end = date.today()
        
        if start >= end:
            return {"status": "up_to_date", "rows_added": 0}
        
        # Fetch new data
        if source == "yfinance":
            new_data = self.fetch_asset_data(ticker, start, end)
            table = "asset_prices"
        else:
            new_data = self.fetch_macro_data(ticker, start, end)
            table = "macro_data"
        
        if new_data.empty:
            return {"status": "no_new_data", "rows_added": 0}
        
        # Cache to database
        rows_added = self.cache_to_db(new_data, table)
        
        # Update metadata
        all_data = self.load_from_db(ticker, source=source)
        if not all_data.empty:
            self.update_metadata(
                ticker, source,
                all_data["date"].min(),
                all_data["date"].max()
            )
        
        return {"status": "updated", "rows_added": rows_added}
    
    def list_available_tickers(self) -> List[Dict]:
        """Return all cached tickers with their info."""
        with get_raw_connection() as conn:
            result = pd.read_sql(
                "SELECT ticker, source, first_date, last_date FROM data_metadata ORDER BY ticker",
                conn
            )
        
        return result.to_dict(orient="records")
    
    def get_data_range(self, ticker: str) -> Optional[Dict]:
        """Return min/max dates for a ticker."""
        with get_raw_connection() as conn:
            result = pd.read_sql(
                "SELECT first_date, last_date FROM data_metadata WHERE ticker = ?",
                conn,
                params=[ticker]
            )
        
        if result.empty:
            return None
        
        row = result.iloc[0]
        return {
            "first_date": row["first_date"],
            "last_date": row["last_date"]
        }
    
    async def get_asset_data(
        self,
        ticker: str,
        start: date,
        end: date,
        auto_update: bool = True
    ) -> pd.DataFrame:
        """
        Main entry point: get asset data with smart caching.
        
        Args:
            ticker: Ticker symbol
            start: Start date
            end: End date
            auto_update: Automatically fetch missing data
            
        Returns:
            DataFrame with price data.
        """
        # Try to load from cache first
        cached = self.load_from_db(ticker, start, end, source="yfinance")
        
        if auto_update:
            # Check if we need to fetch more data
            if cached.empty:
                # No data at all, fetch everything
                self.update_data(ticker, source="yfinance", force=False)
                cached = self.load_from_db(ticker, start, end, source="yfinance")
            else:
                # Check if we have gaps
                cached_start = cached["date"].min()
                cached_end = cached["date"].max()
                
                if start < cached_start or end > cached_end:
                    self.update_data(ticker, source="yfinance", force=False)
                    cached = self.load_from_db(ticker, start, end, source="yfinance")
        
        return cached


# Singleton instance
data_loader = DataLoader()

