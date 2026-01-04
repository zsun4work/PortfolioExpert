/**
 * Calculator State Management
 * Manages the state for the portfolio calculator including assets, config, and results
 */

const CalculatorState = {
    // Storage key for persistence
    STORAGE_KEY: 'portfolioCalculator_state',
    
    // Shared storage key with viewer
    VIEWER_STORAGE_KEY: 'portfolioViewer_state',
    
    // Configuration
    config: {
        targetCash: 100000,
        lookbackWindow: 252,  // Trading days
        riskFreeRate: null,   // From Fed rate
    },
    
    // Assets list
    assets: [],
    
    // Current prices (fetched from API)
    prices: {},
    
    // Data freshness status
    dataStatus: {
        lastChecked: null,
        isUpdating: false,
        isFresh: false,
        tickerStatus: {},  // {ticker: {lastDate, isFresh}}
    },
    
    // Calculated results
    results: {
        positions: null,
        tradeOrders: null,
        riskMetrics: null,
        projection: null,
    },
    
    // =========================================================================
    // Asset Management
    // =========================================================================
    
    /**
     * Add an asset to the portfolio
     * @param {string} ticker - Ticker symbol
     * @param {number} weight - Weight as decimal (0-1)
     * @param {number} currentShares - Current shares owned
     */
    addAsset(ticker, weight, currentShares = 0) {
        ticker = ticker.toUpperCase().trim();
        
        // Check if already exists
        const existing = this.assets.find(a => a.ticker === ticker);
        if (existing) {
            existing.weight = weight;
            existing.currentShares = currentShares;
        } else {
            this.assets.push({
                ticker,
                weight,
                currentShares,
            });
        }
        
        this.saveToStorage();
        return true;
    },
    
    /**
     * Remove an asset from the portfolio
     * @param {string} ticker - Ticker symbol
     */
    removeAsset(ticker) {
        this.assets = this.assets.filter(a => a.ticker !== ticker);
        delete this.prices[ticker];
        this.saveToStorage();
    },
    
    /**
     * Update asset weight
     * @param {string} ticker - Ticker symbol
     * @param {number} weight - New weight as decimal (0-1)
     */
    updateWeight(ticker, weight) {
        const asset = this.assets.find(a => a.ticker === ticker);
        if (asset) {
            asset.weight = weight;
            this.saveToStorage();
        }
    },
    
    /**
     * Update current shares for an asset
     * @param {string} ticker - Ticker symbol
     * @param {number} shares - Current shares
     */
    updateCurrentShares(ticker, shares) {
        const asset = this.assets.find(a => a.ticker === ticker);
        if (asset) {
            asset.currentShares = shares;
            this.saveToStorage();
        }
    },
    
    /**
     * Get total weight of all assets
     * @returns {number} Total weight
     */
    getTotalWeight() {
        return this.assets.reduce((sum, a) => sum + a.weight, 0);
    },
    
    /**
     * Normalize all weights to sum to 1
     */
    normalizeWeights() {
        const total = this.getTotalWeight();
        if (total > 0) {
            this.assets.forEach(a => {
                a.weight = a.weight / total;
            });
            this.saveToStorage();
        }
    },
    
    /**
     * Get all ticker symbols
     * @returns {string[]} Array of tickers
     */
    getTickers() {
        return this.assets.map(a => a.ticker);
    },
    
    /**
     * Get weights as object
     * @returns {Object} {ticker: weight}
     */
    getWeights() {
        const weights = {};
        this.assets.forEach(a => {
            weights[a.ticker] = a.weight;
        });
        return weights;
    },
    
    /**
     * Get current holdings as object
     * @returns {Object} {ticker: shares}
     */
    getCurrentHoldings() {
        const holdings = {};
        this.assets.forEach(a => {
            holdings[a.ticker] = a.currentShares;
        });
        return holdings;
    },
    
    // =========================================================================
    // Configuration
    // =========================================================================
    
    /**
     * Update target cash
     * @param {number} value - Target cash value
     */
    setTargetCash(value) {
        this.config.targetCash = Math.max(0, value);
        this.saveToStorage();
    },
    
    /**
     * Update lookback window
     * @param {number} days - Number of trading days
     */
    setLookbackWindow(days) {
        this.config.lookbackWindow = Math.max(20, Math.min(1260, days));
        this.saveToStorage();
    },
    
    /**
     * Set risk-free rate from Fed data
     * @param {number} rate - Annual rate as decimal
     */
    setRiskFreeRate(rate) {
        this.config.riskFreeRate = rate;
    },
    
    // =========================================================================
    // Persistence
    // =========================================================================
    
    /**
     * Save state to localStorage
     */
    saveToStorage() {
        try {
            const state = {
                config: this.config,
                assets: this.assets,
            };
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(state));
        } catch (e) {
            console.warn('Failed to save calculator state:', e);
        }
    },
    
    /**
     * Load state from localStorage
     */
    loadFromStorage() {
        try {
            const saved = localStorage.getItem(this.STORAGE_KEY);
            if (saved) {
                const state = JSON.parse(saved);
                this.config = { ...this.config, ...state.config };
                this.assets = state.assets || [];
                return true;
            }
        } catch (e) {
            console.warn('Failed to load calculator state:', e);
        }
        return false;
    },
    
    /**
     * Import assets from the backtest viewer
     * @returns {boolean} Whether import was successful
     */
    importFromViewer() {
        try {
            const viewerState = localStorage.getItem(this.VIEWER_STORAGE_KEY);
            if (viewerState) {
                const parsed = JSON.parse(viewerState);
                const tickers = parsed.selectedTickers || [];
                const weights = parsed.weights || {};
                
                // Clear current assets
                this.assets = [];
                
                // Import each ticker with its weight
                tickers.forEach(ticker => {
                    const weight = weights[ticker] || (1 / tickers.length);
                    this.addAsset(ticker, weight, 0);
                });
                
                return tickers.length > 0;
            }
        } catch (e) {
            console.warn('Failed to import from viewer:', e);
        }
        return false;
    },
    
    /**
     * Reset all state
     */
    reset() {
        this.assets = [];
        this.prices = {};
        this.results = {
            positions: null,
            tradeOrders: null,
            riskMetrics: null,
            projection: null,
        };
        this.dataStatus = {
            lastChecked: null,
            isUpdating: false,
            isFresh: false,
            tickerStatus: {},
        };
        this.saveToStorage();
    },
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CalculatorState;
}

