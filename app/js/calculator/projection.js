/**
 * Value Projection Module
 * Calculates and visualizes potential portfolio value distribution
 * Supports multiple time horizons (30d, 90d, 180d, 360d) and continuous projection
 */

const Projection = {
    // Time horizons for distribution view (in trading days)
    // 1 month = 21, 3 months = 63, 6 months = 126, 1 year = 252
    TIME_HORIZONS: [21, 63, 126, 252],
    
    // Labels for time horizons
    HORIZON_LABELS: {
        21: '1 Month',
        63: '3 Months',
        126: '6 Months',
        252: '1 Year',
    },
    
    // Trading days per year
    TRADING_DAYS_PER_YEAR: 252,
    
    // Current view mode
    currentView: 'distribution',
    
    // Stored projections for all horizons
    projections: {},
    
    /**
     * Calculate projection for a specific time horizon
     * Projects your actual equity/cash value with returns amplified by leverage
     * 
     * @param {number} baseCash - Your actual cash/equity
     * @param {number} baseDailyReturn - Daily mean return of real assets
     * @param {number} baseDailyStd - Daily standard deviation of real assets
     * @param {number} leverageRate - Leverage multiplier (1 = no leverage)
     * @param {number} days - Projection horizon in days
     * @returns {Object} Projection details
     */
    calculate(baseCash, baseDailyReturn, baseDailyStd, leverageRate = 1, days = 30) {
        // Your equity return is amplified by leverage
        const leveragedDailyReturn = baseDailyReturn * leverageRate;
        // Leveraged volatility (also amplified by leverage)
        const leveragedDailyStd = baseDailyStd * leverageRate;
        
        // Expected value of YOUR EQUITY after N days
        const expectedValue = baseCash * Math.pow(1 + leveragedDailyReturn, days);
        
        // Standard deviation of YOUR EQUITY after N days
        // Using the expected value as base and scaling volatility by √T
        // σ_T = E[V_T] × σ_leveraged_daily × √T
        const projectedStd = expectedValue * leveragedDailyStd * Math.sqrt(days);
        
        // Confidence intervals for YOUR EQUITY
        const intervals = {
            p68: {
                low: expectedValue - projectedStd,
                high: expectedValue + projectedStd,
            },
            p95: {
                low: expectedValue - 1.96 * projectedStd,
                high: expectedValue + 1.96 * projectedStd,
            },
            p99: {
                low: expectedValue - 2.576 * projectedStd,
                high: expectedValue + 2.576 * projectedStd,
            },
        };
        
        // Expected return as percentage
        const expectedReturn = (expectedValue - baseCash) / baseCash;
        
        return {
            currentValue: baseCash,
            expectedValue,
            expectedReturn,
            standardDeviation: projectedStd,
            intervals,
            days,
            leverageRate,
            leveragedDailyReturn,
            leveragedDailyStd,
            baseDailyReturn,
            baseDailyStd,
        };
    },
    
    /**
     * Calculate projections for all time horizons
     * @returns {Object} Projections keyed by days
     */
    calculateAll() {
        const riskMetrics = CalculatorState.results.riskMetrics;
        if (!riskMetrics) {
            console.warn('Risk metrics not available for projection');
            return null;
        }
        
        const baseCash = CalculatorState.config.targetCash;
        const leverageRate = CalculatorState.config.leverageRate || 1;
        
        const projections = {};
        
        for (const days of this.TIME_HORIZONS) {
            projections[days] = this.calculate(
                baseCash,
                riskMetrics.baseDailyReturn,
                riskMetrics.baseDailyVolatility,
                leverageRate,
                days
            );
        }
        
        this.projections = projections;
        return projections;
    },
    
    /**
     * Generate continuous projection data for timeline chart
     * Uses trading days (252 per year)
     * @returns {Object} Continuous projection data with daily values
     */
    calculateContinuous() {
        const riskMetrics = CalculatorState.results.riskMetrics;
        if (!riskMetrics) return null;
        
        const baseCash = CalculatorState.config.targetCash;
        const leverageRate = CalculatorState.config.leverageRate || 1;
        const leveragedDailyReturn = riskMetrics.baseDailyReturn * leverageRate;
        // Leveraged daily volatility (amplified by leverage)
        const leveragedDailyStd = riskMetrics.baseDailyVolatility * leverageRate;
        
        const days = [];
        const expected = [];
        const upper95 = [];
        const lower95 = [];
        const upper68 = [];
        const lower68 = [];
        
        // Use 252 trading days (1 year)
        for (let d = 0; d <= this.TRADING_DAYS_PER_YEAR; d++) {
            days.push(d);
            
            // Expected value at day d
            const expValue = baseCash * Math.pow(1 + leveragedDailyReturn, d);
            
            // Standard deviation at day d: σ_d = E[V_d] × σ_leveraged_daily × √d
            // Volatility scales with √T (square root of time rule)
            const std = expValue * leveragedDailyStd * Math.sqrt(Math.max(d, 1));
            
            expected.push(expValue);
            upper95.push(expValue + 1.96 * std);
            lower95.push(expValue - 1.96 * std);
            upper68.push(expValue + std);
            lower68.push(expValue - std);
        }
        
        return { days, expected, upper95, lower95, upper68, lower68 };
    },
    
    /**
     * Generate normal distribution curve for visualization
     */
    generateDistributionCurve(mean, std, numPoints = 100) {
        const xMin = mean - 3.5 * std;
        const xMax = mean + 3.5 * std;
        const step = (xMax - xMin) / numPoints;
        
        const curve = [];
        for (let i = 0; i <= numPoints; i++) {
            const x = xMin + i * step;
            const y = (1 / (std * Math.sqrt(2 * Math.PI))) * 
                      Math.exp(-0.5 * Math.pow((x - mean) / std, 2));
            curve.push({ x, y });
        }
        
        return curve;
    },
    
    /**
     * Render a single distribution chart (compact version for grid)
     */
    renderDistributionChart(projection, containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        const { expectedValue, standardDeviation, intervals, currentValue } = projection;
        const curve = this.generateDistributionCurve(expectedValue, standardDeviation);
        
        const traces = [];
        
        // 95% confidence fill
        traces.push({
            x: curve.filter(p => p.x >= intervals.p95.low && p.x <= intervals.p95.high).map(p => p.x),
            y: curve.filter(p => p.x >= intervals.p95.low && p.x <= intervals.p95.high).map(p => p.y),
            fill: 'tozeroy',
            type: 'scatter',
            mode: 'none',
            fillcolor: 'rgba(251, 191, 36, 0.2)',
            name: '95% CI',
            hoverinfo: 'skip',
            showlegend: false,
        });
        
        // 68% confidence fill
        traces.push({
            x: curve.filter(p => p.x >= intervals.p68.low && p.x <= intervals.p68.high).map(p => p.x),
            y: curve.filter(p => p.x >= intervals.p68.low && p.x <= intervals.p68.high).map(p => p.y),
            fill: 'tozeroy',
            type: 'scatter',
            mode: 'none',
            fillcolor: 'rgba(16, 185, 129, 0.3)',
            name: '68% CI',
            hoverinfo: 'skip',
            showlegend: false,
        });
        
        // Distribution curve line
        traces.push({
            x: curve.map(p => p.x),
            y: curve.map(p => p.y),
            type: 'scatter',
            mode: 'lines',
            line: { color: '#f59e0b', width: 2 },
            name: 'Distribution',
            hovertemplate: '$%{x:,.0f}<extra></extra>',
            showlegend: false,
        });
        
        // Expected value marker
        const maxY = Math.max(...curve.map(p => p.y));
        traces.push({
            x: [expectedValue],
            y: [maxY * 0.9],
            type: 'scatter',
            mode: 'markers',
            marker: { color: '#f59e0b', size: 8, symbol: 'diamond' },
            name: 'Expected',
            hovertemplate: 'Expected: $%{x:,.0f}<extra></extra>',
            showlegend: false,
        });
        
        // Current value line
        traces.push({
            x: [currentValue, currentValue],
            y: [0, maxY],
            type: 'scatter',
            mode: 'lines',
            line: { color: '#3b82f6', width: 1, dash: 'dash' },
            name: 'Current',
            hoverinfo: 'skip',
            showlegend: false,
        });
        
        const layout = {
            autosize: true,
            showlegend: false,
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'transparent',
            font: {
                family: "'JetBrains Mono', monospace",
                color: '#94a3b8',
                size: 9,
            },
            margin: { l: 40, r: 10, t: 5, b: 30 },
            xaxis: {
                gridcolor: '#2d3748',
                linecolor: '#2d3748',
                tickformat: '$,.0s',
                tickfont: { size: 8 },
                nticks: 5,
            },
            yaxis: {
                gridcolor: '#2d3748',
                linecolor: '#2d3748',
                showticklabels: false,
            },
            hovermode: 'closest',
            annotations: [
                {
                    x: expectedValue,
                    y: maxY,
                    xref: 'x',
                    yref: 'y',
                    text: `$${this.formatMoney(expectedValue)}`,
                    showarrow: false,
                    font: { size: 9, color: '#f59e0b' },
                    yanchor: 'bottom',
                },
            ],
        };
        
        const config = {
            responsive: true,
            displayModeBar: false,
        };
        
        Plotly.newPlot(container, traces, layout, config);
    },
    
    /**
     * Render the continuous timeline chart
     */
    renderContinuousChart() {
        const container = document.getElementById('projChartContinuous');
        if (!container) return;
        
        const data = this.calculateContinuous();
        if (!data) return;
        
        const traces = [];
        
        // 95% confidence band
        traces.push({
            x: [...data.days, ...data.days.slice().reverse()],
            y: [...data.upper95, ...data.lower95.slice().reverse()],
            fill: 'toself',
            type: 'scatter',
            mode: 'none',
            fillcolor: 'rgba(251, 191, 36, 0.15)',
            name: '95% CI',
            hoverinfo: 'skip',
        });
        
        // 68% confidence band
        traces.push({
            x: [...data.days, ...data.days.slice().reverse()],
            y: [...data.upper68, ...data.lower68.slice().reverse()],
            fill: 'toself',
            type: 'scatter',
            mode: 'none',
            fillcolor: 'rgba(16, 185, 129, 0.25)',
            name: '68% CI',
            hoverinfo: 'skip',
        });
        
        // Expected value line
        traces.push({
            x: data.days,
            y: data.expected,
            type: 'scatter',
            mode: 'lines',
            line: { color: '#f59e0b', width: 2 },
            name: 'Expected',
            hovertemplate: 'Day %{x}<br>Expected: $%{y:,.0f}<extra></extra>',
        });
        
        // Upper 95% line
        traces.push({
            x: data.days,
            y: data.upper95,
            type: 'scatter',
            mode: 'lines',
            line: { color: '#fbbf24', width: 1, dash: 'dot' },
            name: '95% Upper',
            hovertemplate: 'Day %{x}<br>95% Upper: $%{y:,.0f}<extra></extra>',
        });
        
        // Lower 95% line
        traces.push({
            x: data.days,
            y: data.lower95,
            type: 'scatter',
            mode: 'lines',
            line: { color: '#fbbf24', width: 1, dash: 'dot' },
            name: '95% Lower',
            hovertemplate: 'Day %{x}<br>95% Lower: $%{y:,.0f}<extra></extra>',
        });
        
        // Current value reference line
        traces.push({
            x: [0, this.TRADING_DAYS_PER_YEAR],
            y: [data.expected[0], data.expected[0]],
            type: 'scatter',
            mode: 'lines',
            line: { color: '#3b82f6', width: 1, dash: 'dash' },
            name: 'Current',
            hoverinfo: 'skip',
        });
        
        // Time horizon markers (trading days)
        const markerDays = this.TIME_HORIZONS; // [21, 63, 126, 252]
        const markerLabels = ['1M', '3M', '6M', '1Y'];
        const markerColors = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b'];
        
        markerDays.forEach((d, i) => {
            traces.push({
                x: [d],
                y: [data.expected[d]],
                type: 'scatter',
                mode: 'markers+text',
                marker: { color: markerColors[i], size: 10, symbol: 'circle' },
                text: [markerLabels[i]],
                textposition: 'top center',
                textfont: { color: markerColors[i], size: 10 },
                name: this.HORIZON_LABELS[d],
                hovertemplate: `${this.HORIZON_LABELS[d]}<br>Expected: $%{y:,.0f}<extra></extra>`,
                showlegend: false,
            });
        });
        
        const layout = {
            autosize: true,
            showlegend: true,
            legend: {
                x: 0,
                y: 1,
                xanchor: 'left',
                bgcolor: 'rgba(17, 24, 39, 0.8)',
                font: { color: '#94a3b8', size: 10 },
            },
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'transparent',
            font: {
                family: "'JetBrains Mono', monospace",
                color: '#94a3b8',
            },
            margin: { l: 70, r: 30, t: 20, b: 50 },
            xaxis: {
                title: 'Trading Days',
                gridcolor: '#2d3748',
                linecolor: '#2d3748',
                tickfont: { size: 10 },
                tickvals: [0, 21, 63, 126, 189, 252],
                ticktext: ['0', '1M', '3M', '6M', '9M', '1Y'],
            },
            yaxis: {
                title: 'Portfolio Value ($)',
                gridcolor: '#2d3748',
                linecolor: '#2d3748',
                tickformat: '$,.0f',
                tickfont: { size: 10 },
            },
            hovermode: 'x unified',
        };
        
        const config = {
            responsive: true,
            displayModeBar: false,
        };
        
        Plotly.newPlot(container, traces, layout, config);
    },
    
    /**
     * Render all distribution charts in the grid
     */
    renderDistributionGrid() {
        const chartIds = {
            21: 'projChart1m',
            63: 'projChart3m',
            126: 'projChart6m',
            252: 'projChart1y',
        };
        
        for (const days of this.TIME_HORIZONS) {
            if (this.projections[days]) {
                this.renderDistributionChart(this.projections[days], chartIds[days]);
            }
        }
    },
    
    /**
     * Switch between distribution and continuous views
     */
    switchView(view) {
        this.currentView = view;
        
        const distributionView = document.getElementById('distributionView');
        const continuousView = document.getElementById('continuousView');
        const distributionBtn = document.getElementById('distributionViewBtn');
        const continuousBtn = document.getElementById('continuousViewBtn');
        
        if (view === 'distribution') {
            distributionView.style.display = 'flex';
            continuousView.style.display = 'none';
            distributionBtn.classList.add('active');
            continuousBtn.classList.remove('active');
            
            // Re-render to ensure proper sizing
            setTimeout(() => this.renderDistributionGrid(), 50);
        } else {
            distributionView.style.display = 'none';
            continuousView.style.display = 'flex';
            distributionBtn.classList.remove('active');
            continuousBtn.classList.add('active');
            
            // Re-render to ensure proper sizing
            setTimeout(() => this.renderContinuousChart(), 50);
        }
    },
    
    /**
     * Format money value
     */
    formatMoney(value) {
        if (value >= 1000000) {
            return (value / 1000000).toFixed(1) + 'M';
        } else if (value >= 1000) {
            return (value / 1000).toFixed(0) + 'k';
        }
        return value.toFixed(0);
    },
    
    /**
     * Run projection calculation and render all views
     * @returns {Object} Projection data for 1 year (252 trading days) used for summary
     */
    run() {
        // Calculate projections for all horizons
        const projections = this.calculateAll();
        if (!projections) return null;
        
        // Store in state (use 1 year / 252 trading days for main projection)
        CalculatorState.results.projection = projections[252];
        
        // Render distribution grid
        this.renderDistributionGrid();
        
        // Render continuous chart
        this.renderContinuousChart();
        
        // Return 1 year projection for summary display
        return projections[252];
    },
};

// Export for global access
window.Projection = Projection;

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Projection;
}
