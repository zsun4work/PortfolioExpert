-- Portfolio Viewer Database Schema

-- Asset price data (from yfinance)
CREATE TABLE IF NOT EXISTS asset_prices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT NOT NULL,
    date DATE NOT NULL,
    open REAL,
    high REAL,
    low REAL,
    close REAL,
    adj_close REAL,
    volume INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(ticker, date)
);

-- Macroeconomic data (from FRED)
CREATE TABLE IF NOT EXISTS macro_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    series_id TEXT NOT NULL,
    date DATE NOT NULL,
    value REAL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(series_id, date)
);

-- Data freshness tracking
CREATE TABLE IF NOT EXISTS data_metadata (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT UNIQUE NOT NULL,
    source TEXT NOT NULL,
    first_date DATE,
    last_date DATE,
    last_updated TIMESTAMP,
    update_frequency TEXT
);

-- Saved portfolio configurations
CREATE TABLE IF NOT EXISTS portfolios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    config JSON NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_asset_prices_ticker_date ON asset_prices(ticker, date);
CREATE INDEX IF NOT EXISTS idx_macro_data_series_date ON macro_data(series_id, date);

