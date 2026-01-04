/**
 * Risk Analysis Module
 * Calculates expected return, variance, volatility, Sharpe ratio, and VaR
 */

const RiskAnalysis = {
    // Trading days per year for annualization
    TRADING_DAYS_PER_YEAR: 252,
    
    // Z-scores for VaR confidence levels
    Z_SCORES: {
        0.90: 1.282,
        0.95: 1.645,
        0.99: 2.326,
    },
    
    /**
     * Calculate daily returns from price history
     * @param {Array} prices - Array of {date, adjClose}
     * @returns {Array} Array of daily returns
     */
    calculateDailyReturns(prices) {
        if (!prices || prices.length < 2) {
            return [];
        }
        
        const returns = [];
        for (let i = 1; i < prices.length; i++) {
            const prevPrice = prices[i - 1].adjClose;
            const currPrice = prices[i].adjClose;
            if (prevPrice > 0) {
                returns.push((currPrice - prevPrice) / prevPrice);
            }
        }
        return returns;
    },
    
    /**
     * Calculate weighted portfolio returns
     * @param {Object} priceHistory - {ticker: [{date, adjClose}]}
     * @param {Object} weights - {ticker: weight}
     * @returns {Array} Array of daily portfolio returns
     */
    calculatePortfolioReturns(priceHistory, weights) {
        // Calculate returns for each asset
        const assetReturns = {};
        let minLength = Infinity;
        
        for (const [ticker, prices] of Object.entries(priceHistory)) {
            if (weights[ticker] === undefined) continue;
            assetReturns[ticker] = this.calculateDailyReturns(prices);
            minLength = Math.min(minLength, assetReturns[ticker].length);
        }
        
        if (minLength === 0 || minLength === Infinity) {
            return [];
        }
        
        // Calculate weighted portfolio returns
        const portfolioReturns = [];
        
        for (let i = 0; i < minLength; i++) {
            let dayReturn = 0;
            for (const [ticker, weight] of Object.entries(weights)) {
                if (assetReturns[ticker]) {
                    dayReturn += weight * assetReturns[ticker][i];
                }
            }
            portfolioReturns.push(dayReturn);
        }
        
        return portfolioReturns;
    },
    
    /**
     * Calculate mean of an array
     * @param {Array} arr - Array of numbers
     * @returns {number} Mean
     */
    mean(arr) {
        if (!arr || arr.length === 0) return 0;
        return arr.reduce((a, b) => a + b, 0) / arr.length;
    },
    
    /**
     * Calculate sample standard deviation
     * @param {Array} arr - Array of numbers
     * @param {number} mean - Pre-calculated mean (optional)
     * @returns {number} Standard deviation
     */
    stdDev(arr, mean = null) {
        if (!arr || arr.length < 2) return 0;
        
        if (mean === null) {
            mean = this.mean(arr);
        }
        
        const squaredDiffs = arr.map(x => Math.pow(x - mean, 2));
        const variance = squaredDiffs.reduce((a, b) => a + b, 0) / (arr.length - 1);
        return Math.sqrt(variance);
    },
    
    /**
     * Calculate expected return statistics
     * @param {Array} portfolioReturns - Daily portfolio returns
     * @returns {Object} Return statistics
     */
    calculateExpectedReturn(portfolioReturns) {
        const dailyMean = this.mean(portfolioReturns);
        const annualizedReturn = dailyMean * this.TRADING_DAYS_PER_YEAR;
        
        return {
            dailyReturn: dailyMean,
            annualizedReturn: annualizedReturn,
        };
    },
    
    /**
     * Calculate volatility statistics
     * @param {Array} portfolioReturns - Daily portfolio returns
     * @returns {Object} Volatility statistics
     */
    calculateVolatility(portfolioReturns) {
        const dailyMean = this.mean(portfolioReturns);
        const dailyStdDev = this.stdDev(portfolioReturns, dailyMean);
        const annualizedVolatility = dailyStdDev * Math.sqrt(this.TRADING_DAYS_PER_YEAR);
        
        return {
            dailyVolatility: dailyStdDev,
            annualizedVolatility: annualizedVolatility,
            dailyVariance: dailyStdDev * dailyStdDev,
        };
    },
    
    /**
     * Calculate Sharpe ratio
     * @param {number} annualizedReturn - Annualized portfolio return
     * @param {number} annualizedVolatility - Annualized volatility
     * @param {number} riskFreeRate - Annual risk-free rate
     * @returns {number} Sharpe ratio
     */
    calculateSharpeRatio(annualizedReturn, annualizedVolatility, riskFreeRate) {
        if (annualizedVolatility === 0) return 0;
        return (annualizedReturn - riskFreeRate) / annualizedVolatility;
    },
    
    /**
     * Calculate Value at Risk
     * @param {number} portfolioValue - Current portfolio value
     * @param {number} dailyVolatility - Daily volatility (std dev)
     * @param {number} days - Time horizon (e.g., 1 or 30)
     * @param {number} confidenceLevel - Confidence level (e.g., 0.95)
     * @returns {number} VaR (positive value representing potential loss)
     */
    calculateVaR(portfolioValue, dailyVolatility, days, confidenceLevel) {
        const z = this.Z_SCORES[confidenceLevel] || 1.645;
        const periodVolatility = dailyVolatility * Math.sqrt(days);
        return portfolioValue * periodVolatility * z;
    },
    
    /**
     * Run full risk analysis
     * @param {Object} priceHistory - {ticker: [{date, adjClose}]}
     * @returns {Object} Complete risk metrics
     */
    async analyze(priceHistory = null) {
        // Fetch historical prices if not provided
        if (!priceHistory) {
            const window = CalculatorState.config.lookbackWindow;
            priceHistory = await DataManager.fetchHistoricalPrices(window);
        }
        
        const weights = CalculatorState.getWeights();
        const portfolioValue = CalculatorState.config.targetCash;
        const riskFreeRate = CalculatorState.config.riskFreeRate || 0.05;
        
        // Calculate portfolio returns
        const portfolioReturns = this.calculatePortfolioReturns(priceHistory, weights);
        
        if (portfolioReturns.length === 0) {
            return null;
        }
        
        // Calculate metrics
        const returnStats = this.calculateExpectedReturn(portfolioReturns);
        const volStats = this.calculateVolatility(portfolioReturns);
        
        const sharpeRatio = this.calculateSharpeRatio(
            returnStats.annualizedReturn,
            volStats.annualizedVolatility,
            riskFreeRate
        );
        
        // Calculate VaR
        const var95_1d = this.calculateVaR(portfolioValue, volStats.dailyVolatility, 1, 0.95);
        const var99_1d = this.calculateVaR(portfolioValue, volStats.dailyVolatility, 1, 0.99);
        const var95_30d = this.calculateVaR(portfolioValue, volStats.dailyVolatility, 30, 0.95);
        const var99_30d = this.calculateVaR(portfolioValue, volStats.dailyVolatility, 30, 0.99);
        
        const metrics = {
            // Return metrics
            dailyReturn: returnStats.dailyReturn,
            annualizedReturn: returnStats.annualizedReturn,
            
            // Volatility metrics
            dailyVolatility: volStats.dailyVolatility,
            annualizedVolatility: volStats.annualizedVolatility,
            
            // Risk-adjusted
            sharpeRatio: sharpeRatio,
            riskFreeRate: riskFreeRate,
            
            // VaR
            var95_1d: var95_1d,
            var99_1d: var99_1d,
            var95_30d: var95_30d,
            var99_30d: var99_30d,
            
            // Raw data for projection
            portfolioReturns: portfolioReturns,
            dataPoints: portfolioReturns.length,
        };
        
        // Store in state
        CalculatorState.results.riskMetrics = metrics;
        
        return metrics;
    },
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = RiskAnalysis;
}

