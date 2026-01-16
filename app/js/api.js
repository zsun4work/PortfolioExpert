/**
 * API client for communicating with the Portfolio Viewer backend
 */

const API = {
    baseUrl: 'http://localhost:8000',
    
    /**
     * Make an HTTP request to the backend
     * @param {string} endpoint - API endpoint
     * @param {Object} options - Fetch options
     * @returns {Promise<Object>} Response data
     */
    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json',
            },
        };
        
        const fetchOptions = { ...defaultOptions, ...options };
        
        try {
            const response = await fetch(url, fetchOptions);
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `HTTP ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
                Utils.setApiStatus(false);
                throw new Error('Cannot connect to backend. Is the server running?');
            }
            throw error;
        }
    },
    
    /**
     * Check if the API is reachable
     * @returns {Promise<boolean>} True if connected
     */
    async checkHealth() {
        try {
            await this.request('/health');
            Utils.setApiStatus(true);
            return true;
        } catch {
            Utils.setApiStatus(false);
            return false;
        }
    },
    
    // =========================================================================
    // Data Endpoints
    // =========================================================================
    
    /**
     * Get list of available tickers
     * @returns {Promise<Object>} Tickers list response
     */
    async getTickers() {
        return this.request('/data/tickers');
    },
    
    /**
     * Get date range for a specific ticker
     * @param {string} ticker - Ticker symbol
     * @returns {Promise<Object>} Date range response
     */
    async getDataRange(ticker) {
        return this.request(`/data/range/${ticker.toUpperCase()}`);
    },
    
    /**
     * Load/cache data for a ticker
     * @param {string} ticker - Ticker symbol
     * @param {string} start - Start date (optional)
     * @param {string} end - End date (optional)
     * @param {string} source - Data source ('yfinance' or 'fred')
     * @returns {Promise<Object>} Load status response
     */
    async loadData(ticker, start = null, end = null, source = 'yfinance') {
        return this.request('/data/load', {
            method: 'POST',
            body: JSON.stringify({
                ticker: ticker.toUpperCase(),
                start,
                end,
                source,
            }),
        });
    },
    
    /**
     * Update ticker data to latest
     * @param {string} ticker - Ticker symbol
     * @param {boolean} force - Force full refresh
     * @returns {Promise<Object>} Update status response
     */
    async updateData(ticker, force = false) {
        const params = new URLSearchParams({
            ticker: ticker.toUpperCase(),
            force: force.toString(),
        });
        return this.request(`/data/update?${params}`, {
            method: 'POST',
        });
    },
    
    /**
     * Check data freshness for a ticker
     * @param {string} ticker - Ticker symbol
     * @param {string} source - Data source
     * @returns {Promise<Object>} Freshness info
     */
    async checkFreshness(ticker, source = 'yfinance') {
        const params = new URLSearchParams({ source });
        return this.request(`/data/freshness/${ticker.toUpperCase()}?${params}`);
    },
    
    /**
     * Get cached price data for a ticker
     * @param {string} ticker - Ticker symbol
     * @param {string} start - Start date (optional)
     * @param {string} end - End date (optional)
     * @returns {Promise<Object>} Price data response
     */
    async getPrices(ticker, start = null, end = null) {
        const params = new URLSearchParams();
        if (start) params.append('start', start);
        if (end) params.append('end', end);
        
        const queryString = params.toString();
        const endpoint = `/data/prices/${ticker.toUpperCase()}${queryString ? '?' + queryString : ''}`;
        return this.request(endpoint);
    },
    
    /**
     * Get Federal Funds Rate data
     * @param {string} start - Start date (optional)
     * @param {string} end - End date (optional)
     * @param {boolean} update - Whether to update from FRED first
     * @returns {Promise<Object>} Fed rate data
     */
    async getFedRate(start = null, end = null, update = true) {
        const params = new URLSearchParams();
        if (start) params.append('start', start);
        if (end) params.append('end', end);
        params.append('update', update.toString());
        
        const queryString = params.toString();
        return this.request(`/data/fed-rate?${queryString}`);
    },
    
    // =========================================================================
    // Backtest Endpoints
    // =========================================================================
    
    /**
     * Run a portfolio backtest
     * @param {Object} config - Backtest configuration
     * @param {string[]} config.tickers - List of ticker symbols
     * @param {Object} config.weights - Ticker -> weight mapping
     * @param {string} config.start - Start date
     * @param {string} config.end - End date
     * @param {number} config.margin - Margin/leverage ratio (default 1.0)
     * @returns {Promise<Object>} Backtest results
     */
    async runBacktest(config) {
        return this.request('/backtest', {
            method: 'POST',
            body: JSON.stringify({
                tickers: config.tickers,
                weights: config.weights,
                start: config.start,
                end: config.end,
                margin: config.margin || 1.0,
            }),
        });
    },
    
    /**
     * Run a backtest with sub-period weight adjustments
     * @param {Object} config - Sub-period backtest configuration
     * @param {string[]} config.tickers - List of ticker symbols
     * @param {Object} config.global_weights - Default weights for periods without overrides
     * @param {number} config.global_margin - Default margin for periods without overrides
     * @param {string} config.start - Full backtest start date
     * @param {string} config.end - Full backtest end date
     * @param {Array} config.periods - List of {start, end, weights, margin} objects for sub-period overrides
     * @returns {Promise<Object>} Backtest results with period breakdown
     */
    async runSubperiodBacktest(config) {
        return this.request('/backtest/subperiod', {
            method: 'POST',
            body: JSON.stringify({
                tickers: config.tickers,
                global_weights: config.global_weights,
                global_margin: config.global_margin || 1.0,
                start: config.start,
                end: config.end,
                periods: config.periods,
            }),
        });
    },
    
    /**
     * Analyze a specific period within a backtest
     * @param {Object} params - Analysis parameters
     * @returns {Promise<Object>} Period analysis results
     */
    async analyzePeriod(params) {
        const searchParams = new URLSearchParams({
            full_start: params.fullStart,
            full_end: params.fullEnd,
            period_start: params.periodStart,
            period_end: params.periodEnd,
        });
        
        // Add tickers as repeated params
        params.tickers.forEach(t => searchParams.append('tickers', t));
        
        // Add weights as JSON
        searchParams.append('weights', JSON.stringify(params.weights));
        
        return this.request(`/backtest/analyze-period?${searchParams}`, {
            method: 'POST',
        });
    },
    
    // =========================================================================
    // Portfolio Endpoints
    // =========================================================================
    
    /**
     * List saved portfolios
     * @returns {Promise<Object>} List of portfolio summaries
     */
    async listPortfolios() {
        return this.request('/portfolios');
    },
    
    /**
     * Save a portfolio configuration
     * @param {string} name - Portfolio name
     * @param {Object} config - Portfolio configuration
     * @returns {Promise<Object>} Save status
     */
    async savePortfolio(name, config) {
        return this.request('/portfolios', {
            method: 'POST',
            body: JSON.stringify({ name, config }),
        });
    },
    
    /**
     * Load a saved portfolio
     * @param {string} name - Portfolio name
     * @returns {Promise<Object>} Portfolio configuration
     */
    async getPortfolio(name) {
        return this.request(`/portfolios/${encodeURIComponent(name)}`);
    },
    
    /**
     * Delete a saved portfolio
     * @param {string} name - Portfolio name
     * @returns {Promise<Object>} Delete status
     */
    async deletePortfolio(name) {
        return this.request(`/portfolios/${encodeURIComponent(name)}`, {
            method: 'DELETE',
        });
    },
    
    /**
     * Generate equal-weight allocation
     * @param {string[]} tickers - List of tickers
     * @returns {Promise<Object>} Equal weight allocation
     */
    async getEqualWeights(tickers) {
        const params = new URLSearchParams();
        tickers.forEach(t => params.append('tickers', t));
        return this.request(`/portfolios/equal-weight?${params}`, {
            method: 'POST',
        });
    },
    
    /**
     * Validate weight allocation
     * @param {Object} weights - Ticker -> weight mapping
     * @returns {Promise<Object>} Validation result
     */
    async validateWeights(weights) {
        return this.request('/portfolios/validate-weights', {
            method: 'POST',
            body: JSON.stringify(weights),
        });
    },
    
    // =========================================================================
    // Statistics Endpoints
    // =========================================================================
    
    /**
     * Get summary statistics for selected assets
     * @param {string[]} tickers - List of ticker symbols
     * @param {string} start - Start date (optional)
     * @param {string} end - End date (optional)
     * @returns {Promise<Object>} Summary statistics including volatility, return, and correlation
     */
    async getStatisticsSummary(tickers, start = null, end = null) {
        const params = new URLSearchParams();
        if (start) params.append('start', start);
        if (end) params.append('end', end);
        
        const queryString = params.toString();
        const endpoint = `/statistics/summary${queryString ? '?' + queryString : ''}`;
        
        return this.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(tickers),
        });
    },
    
    /**
     * Get rolling statistics for selected assets with a single window
     * @param {string[]} tickers - List of ticker symbols
     * @param {number} window - Rolling window size in days
     * @param {string} start - Start date (optional)
     * @param {string} end - End date (optional)
     * @returns {Promise<Object>} Rolling volatility, return, and correlation data
     */
    async getRollingStatistics(tickers, window = 60, start = null, end = null) {
        const params = new URLSearchParams();
        params.append('window', window.toString());
        if (start) params.append('start', start);
        if (end) params.append('end', end);
        
        return this.request(`/statistics/rolling?${params}`, {
            method: 'POST',
            body: JSON.stringify(tickers),
        });
    },
    
    /**
     * Get rolling statistics for multiple window sizes
     * @param {string[]} tickers - List of ticker symbols
     * @param {number[]} windows - List of window sizes in days
     * @param {string} start - Start date (optional)
     * @param {string} end - End date (optional)
     * @returns {Promise<Object>} Rolling statistics for each window size
     */
    async getMultiWindowRollingStats(tickers, windows, start = null, end = null) {
        const params = new URLSearchParams();
        if (start) params.append('start', start);
        if (end) params.append('end', end);
        
        return this.request(`/statistics/multi-window-rolling?${params}`, {
            method: 'POST',
            body: JSON.stringify({ tickers, windows }),
        });
    },
};

// Export for use in other modules
window.API = API;

