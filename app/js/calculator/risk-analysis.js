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
     * Calculate daily returns WITH dates from price history
     * @param {Array} prices - Array of {date, adjClose}
     * @returns {Array} Array of {date, return}
     */
    calculateDailyReturnsWithDates(prices) {
        if (!prices || prices.length < 2) {
            return [];
        }
        
        const returns = [];
        for (let i = 1; i < prices.length; i++) {
            const prevPrice = prices[i - 1].adjClose;
            const currPrice = prices[i].adjClose;
            if (prevPrice > 0) {
                returns.push({
                    date: prices[i].date,
                    return: (currPrice - prevPrice) / prevPrice,
                });
            }
        }
        return returns;
    },
    
    /**
     * Calculate correlation between two assets using date-aligned returns
     * @param {Array} returns1 - First return series with dates [{date, return}]
     * @param {Array} returns2 - Second return series with dates [{date, return}]
     * @returns {number} Correlation coefficient (-1 to 1)
     */
    calculateCorrelation(returns1, returns2) {
        // Create date -> return maps for fast lookup
        const map1 = new Map();
        const map2 = new Map();
        
        for (const r of returns1) {
            map1.set(r.date, r.return);
        }
        for (const r of returns2) {
            map2.set(r.date, r.return);
        }
        
        // Find common dates and build aligned arrays
        const aligned1 = [];
        const aligned2 = [];
        
        for (const [date, ret1] of map1) {
            if (map2.has(date)) {
                aligned1.push(ret1);
                aligned2.push(map2.get(date));
            }
        }
        
        const n = aligned1.length;
        if (n < 2) return 0;
        
        // Calculate means
        const mean1 = this.mean(aligned1);
        const mean2 = this.mean(aligned2);
        
        // Calculate correlation
        let sumProduct = 0;
        let sumSq1 = 0;
        let sumSq2 = 0;
        
        for (let i = 0; i < n; i++) {
            const diff1 = aligned1[i] - mean1;
            const diff2 = aligned2[i] - mean2;
            sumProduct += diff1 * diff2;
            sumSq1 += diff1 * diff1;
            sumSq2 += diff2 * diff2;
        }
        
        const denom = Math.sqrt(sumSq1 * sumSq2);
        if (denom === 0) return 0;
        
        return sumProduct / denom;
    },
    
    /**
     * Calculate correlation matrix for all assets
     * @param {Object} priceHistory - {ticker: [{date, adjClose}]}
     * @returns {Object} {tickers: [], matrix: [][], commonDates: number}
     */
    calculateCorrelationMatrix(priceHistory) {
        const tickers = Object.keys(priceHistory);
        const n = tickers.length;
        
        if (n === 0) return { tickers: [], matrix: [], commonDates: 0 };
        
        // Calculate returns WITH dates for each asset
        const assetReturns = {};
        for (const ticker of tickers) {
            assetReturns[ticker] = this.calculateDailyReturnsWithDates(priceHistory[ticker]);
        }
        
        // Build correlation matrix
        const matrix = [];
        let minCommonDates = Infinity;
        
        for (let i = 0; i < n; i++) {
            const row = [];
            for (let j = 0; j < n; j++) {
                if (i === j) {
                    row.push(1.0); // Self-correlation is 1
                } else if (j < i) {
                    row.push(matrix[j][i]); // Matrix is symmetric
                } else {
                    // Calculate correlation with date alignment
                    const corr = this.calculateCorrelation(
                        assetReturns[tickers[i]],
                        assetReturns[tickers[j]]
                    );
                    row.push(corr);
                    
                    // Track common dates for info
                    const dates1 = new Set(assetReturns[tickers[i]].map(r => r.date));
                    const dates2 = new Set(assetReturns[tickers[j]].map(r => r.date));
                    const commonCount = [...dates1].filter(d => dates2.has(d)).length;
                    minCommonDates = Math.min(minCommonDates, commonCount);
                }
            }
            matrix.push(row);
        }
        
        return { 
            tickers, 
            matrix, 
            commonDates: minCommonDates === Infinity ? 0 : minCommonDates 
        };
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
        const targetCash = CalculatorState.config.targetCash;
        const leverageRate = CalculatorState.config.leverageRate || 1;
        const riskFreeRate = CalculatorState.config.riskFreeRate || 0.05;
        
        // Leveraged portfolio value (total position size)
        const leveragedValue = targetCash * leverageRate;
        
        // Calculate portfolio returns
        const portfolioReturns = this.calculatePortfolioReturns(priceHistory, weights);
        
        if (portfolioReturns.length === 0) {
            return null;
        }
        
        // Calculate base (unleveraged) metrics
        const returnStats = this.calculateExpectedReturn(portfolioReturns);
        const volStats = this.calculateVolatility(portfolioReturns);
        
        // Apply leverage to returns and volatility
        // Leverage amplifies both gains and losses
        const leveragedDailyReturn = returnStats.dailyReturn * leverageRate;
        const leveragedAnnualizedReturn = returnStats.annualizedReturn * leverageRate;
        const leveragedDailyVolatility = volStats.dailyVolatility * leverageRate;
        const leveragedAnnualizedVolatility = volStats.annualizedVolatility * leverageRate;
        
        // Sharpe ratio calculation (uses leveraged metrics)
        // Note: Sharpe ratio remains the same with leverage (both return and vol scale equally)
        // But we calculate based on leveraged values for consistency
        const sharpeRatio = this.calculateSharpeRatio(
            leveragedAnnualizedReturn,
            leveragedAnnualizedVolatility,
            riskFreeRate
        );
        
        // Calculate VaR using leveraged portfolio value and leveraged volatility
        const var95_1d = this.calculateVaR(leveragedValue, leveragedDailyVolatility, 1, 0.95);
        const var99_1d = this.calculateVaR(leveragedValue, leveragedDailyVolatility, 1, 0.99);
        const var95_30d = this.calculateVaR(leveragedValue, leveragedDailyVolatility, 30, 0.95);
        const var99_30d = this.calculateVaR(leveragedValue, leveragedDailyVolatility, 30, 0.99);
        
        // Calculate correlation matrix
        const correlationData = this.calculateCorrelationMatrix(priceHistory);
        
        const metrics = {
            // Return metrics (leveraged)
            dailyReturn: leveragedDailyReturn,
            annualizedReturn: leveragedAnnualizedReturn,
            
            // Volatility metrics (leveraged)
            dailyVolatility: leveragedDailyVolatility,
            annualizedVolatility: leveragedAnnualizedVolatility,
            
            // Base (unleveraged) metrics for projection calculations
            baseDailyReturn: returnStats.dailyReturn,
            baseDailyVolatility: volStats.dailyVolatility,
            baseAnnualizedReturn: returnStats.annualizedReturn,
            baseAnnualizedVolatility: volStats.annualizedVolatility,
            
            // Risk-adjusted
            sharpeRatio: sharpeRatio,
            riskFreeRate: riskFreeRate,
            
            // VaR (based on leveraged position)
            var95_1d: var95_1d,
            var99_1d: var99_1d,
            var95_30d: var95_30d,
            var99_30d: var99_30d,
            
            // Correlation matrix
            correlation: correlationData,
            
            // Leverage info
            leverageRate: leverageRate,
            leveragedValue: leveragedValue,
            baseCash: targetCash,
            
            // Raw data for projection (base unleveraged returns)
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

