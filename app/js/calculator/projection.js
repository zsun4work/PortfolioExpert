/**
 * 30-Day Projection Module
 * Calculates and visualizes potential portfolio value distribution
 */

const Projection = {
    // Days for projection
    PROJECTION_DAYS: 30,
    
    /**
     * Calculate 30-day projection based on risk metrics
     * @param {number} currentValue - Current portfolio value
     * @param {number} dailyMean - Daily mean return
     * @param {number} dailyStd - Daily standard deviation
     * @returns {Object} Projection details
     */
    calculate(currentValue, dailyMean, dailyStd) {
        const days = this.PROJECTION_DAYS;
        
        // Expected value after 30 days
        // Using compound growth: E[V_30] = V_0 * (1 + μ)^30
        const expectedValue = currentValue * Math.pow(1 + dailyMean, days);
        
        // Standard deviation of value after 30 days
        // σ_30 = V_0 * σ_daily * √30
        const projectedStd = currentValue * dailyStd * Math.sqrt(days);
        
        // Confidence intervals
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
        const expectedReturn = (expectedValue - currentValue) / currentValue;
        
        return {
            currentValue,
            expectedValue,
            expectedReturn,
            standardDeviation: projectedStd,
            intervals,
            days,
        };
    },
    
    /**
     * Generate normal distribution curve for visualization
     * @param {number} mean - Distribution mean
     * @param {number} std - Distribution standard deviation
     * @param {number} numPoints - Number of points to generate
     * @returns {Array} Array of {x, y} points
     */
    generateDistributionCurve(mean, std, numPoints = 200) {
        const xMin = mean - 4 * std;
        const xMax = mean + 4 * std;
        const step = (xMax - xMin) / numPoints;
        
        const curve = [];
        for (let i = 0; i <= numPoints; i++) {
            const x = xMin + i * step;
            // Normal distribution PDF
            const y = (1 / (std * Math.sqrt(2 * Math.PI))) * 
                      Math.exp(-0.5 * Math.pow((x - mean) / std, 2));
            curve.push({ x, y });
        }
        
        return curve;
    },
    
    /**
     * Render projection chart using Plotly
     * @param {Object} projection - Projection data from calculate()
     * @param {string} containerId - Chart container element ID
     */
    renderChart(projection, containerId = 'projectionChart') {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        const { expectedValue, standardDeviation, intervals, currentValue } = projection;
        
        // Generate distribution curve
        const curve = this.generateDistributionCurve(expectedValue, standardDeviation);
        
        // Create traces
        const traces = [];
        
        // 99% confidence fill
        traces.push({
            x: curve.filter(p => p.x >= intervals.p99.low && p.x <= intervals.p99.high).map(p => p.x),
            y: curve.filter(p => p.x >= intervals.p99.low && p.x <= intervals.p99.high).map(p => p.y),
            fill: 'tozeroy',
            type: 'scatter',
            mode: 'none',
            fillcolor: 'rgba(239, 68, 68, 0.1)',
            name: '99% CI',
            hoverinfo: 'skip',
        });
        
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
        });
        
        // Distribution curve line
        traces.push({
            x: curve.map(p => p.x),
            y: curve.map(p => p.y),
            type: 'scatter',
            mode: 'lines',
            line: { color: '#f59e0b', width: 2 },
            name: 'Distribution',
            hovertemplate: 'Value: $%{x:,.0f}<extra></extra>',
        });
        
        // Expected value marker
        const maxY = Math.max(...curve.map(p => p.y));
        traces.push({
            x: [expectedValue],
            y: [maxY],
            type: 'scatter',
            mode: 'markers+text',
            marker: { color: '#f59e0b', size: 12, symbol: 'diamond' },
            text: [`Expected: $${this.formatMoney(expectedValue)}`],
            textposition: 'top center',
            textfont: { color: '#f59e0b', size: 11 },
            name: 'Expected',
            hovertemplate: 'Expected Value: $%{x:,.0f}<extra></extra>',
        });
        
        // Current value marker
        const currentY = (1 / (standardDeviation * Math.sqrt(2 * Math.PI))) * 
                         Math.exp(-0.5 * Math.pow((currentValue - expectedValue) / standardDeviation, 2));
        traces.push({
            x: [currentValue],
            y: [currentY],
            type: 'scatter',
            mode: 'markers+text',
            marker: { color: '#3b82f6', size: 10, symbol: 'circle' },
            text: [`Current: $${this.formatMoney(currentValue)}`],
            textposition: 'bottom center',
            textfont: { color: '#3b82f6', size: 10 },
            name: 'Current',
            hovertemplate: 'Current Value: $%{x:,.0f}<extra></extra>',
        });
        
        // Layout
        const layout = {
            autosize: true,
            showlegend: true,
            legend: {
                x: 1,
                y: 1,
                xanchor: 'right',
                bgcolor: 'rgba(17, 24, 39, 0.8)',
                font: { color: '#94a3b8', size: 10 },
            },
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'transparent',
            font: {
                family: "'JetBrains Mono', monospace",
                color: '#94a3b8',
            },
            margin: { l: 60, r: 30, t: 20, b: 50 },
            xaxis: {
                title: 'Portfolio Value ($)',
                gridcolor: '#2d3748',
                linecolor: '#2d3748',
                tickformat: '$,.0f',
                tickfont: { size: 10 },
            },
            yaxis: {
                title: 'Probability Density',
                gridcolor: '#2d3748',
                linecolor: '#2d3748',
                tickfont: { size: 10 },
                showticklabels: false,
            },
            hovermode: 'closest',
            annotations: [
                // Confidence interval labels
                {
                    x: intervals.p68.low,
                    y: 0,
                    xref: 'x',
                    yref: 'paper',
                    text: `68%: $${this.formatMoney(intervals.p68.low)}`,
                    showarrow: false,
                    font: { size: 9, color: '#10b981' },
                    yanchor: 'top',
                },
                {
                    x: intervals.p68.high,
                    y: 0,
                    xref: 'x',
                    yref: 'paper',
                    text: `$${this.formatMoney(intervals.p68.high)}`,
                    showarrow: false,
                    font: { size: 9, color: '#10b981' },
                    yanchor: 'top',
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
     * Format money value
     * @param {number} value - Dollar amount
     * @returns {string} Formatted string
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
     * Run projection calculation and render
     * @returns {Object} Projection data
     */
    run() {
        const riskMetrics = CalculatorState.results.riskMetrics;
        if (!riskMetrics) {
            console.warn('Risk metrics not available for projection');
            return null;
        }
        
        const currentValue = CalculatorState.config.targetCash;
        const projection = this.calculate(
            currentValue,
            riskMetrics.dailyReturn,
            riskMetrics.dailyVolatility
        );
        
        // Store in state
        CalculatorState.results.projection = projection;
        
        // Render chart
        this.renderChart(projection);
        
        return projection;
    },
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Projection;
}

