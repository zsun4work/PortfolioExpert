/**
 * Chart management using Plotly.js
 */

const Chart = {
    instance: null,
    containerId: 'performanceChart',
    
    // Color scheme
    colors: {
        primary: '#f59e0b',      // Amber accent
        secondary: '#3b82f6',    // Blue
        success: '#10b981',      // Green
        danger: '#ef4444',       // Red
        fedRate: '#8b5cf6',      // Purple for Fed rate
        grid: '#2d3748',         // Grid lines
        text: '#94a3b8',         // Text color
        background: '#111827',   // Chart background
    },
    
    /**
     * Initialize the chart container
     */
    init() {
        this.clear();
    },
    
    /**
     * Clear the chart and show placeholder
     */
    clear() {
        const container = document.getElementById(this.containerId);
        if (container) {
            container.innerHTML = `
                <div class="chart-placeholder">
                    <span class="placeholder-icon">📊</span>
                    <p>Run a backtest to see results</p>
                </div>
            `;
        }
        this.instance = null;
    },
    
    /**
     * Update chart with equity curve data
     * @param {Array} equityCurve - Array of {date, value} objects
     * @param {Object} options - Chart options
     */
    updateData(equityCurve, options = {}) {
        const container = document.getElementById(this.containerId);
        console.log('Chart.updateData called:', {
            containerId: this.containerId,
            containerFound: !!container,
            equityCurveLength: equityCurve?.length,
            firstPoint: equityCurve?.[0],
            lastPoint: equityCurve?.[equityCurve?.length - 1],
        });
        
        if (!container) {
            console.error('Chart container not found:', this.containerId);
            return;
        }
        if (!equityCurve || equityCurve.length === 0) {
            console.warn('No equity curve data to display');
            return;
        }
        
        // Check if Plotly is loaded
        if (typeof Plotly === 'undefined') {
            console.error('Plotly library not loaded! Check your internet connection or CDN availability.');
            container.innerHTML = `
                <div class="chart-placeholder">
                    <span class="placeholder-icon">⚠️</span>
                    <p>Chart library failed to load. Check your internet connection.</p>
                </div>
            `;
            return;
        }
        
        // Clear placeholder
        container.innerHTML = '';
        
        const dates = equityCurve.map(d => d.date);
        const values = equityCurve.map(d => d.value);
        
        console.log('Preparing chart with', dates.length, 'data points');
        console.log('Date range:', dates[0], 'to', dates[dates.length - 1]);
        console.log('Value range:', Math.min(...values), 'to', Math.max(...values));
        
        // Check if we have valid Fed rate data (filter out null/undefined rates)
        let fedRateData = [];
        if (options.fedRateData && options.fedRateData.length > 0) {
            fedRateData = options.fedRateData.filter(d => d.rate != null && !isNaN(d.rate));
        }
        const hasFedRate = fedRateData.length > 0;
        
        // Main equity curve trace
        const traces = [{
            x: dates,
            y: values,
            type: 'scatter',
            mode: 'lines',
            name: 'Portfolio Value',
            line: {
                color: this.colors.primary,
                width: 2,
            },
            fill: 'tozeroy',
            fillcolor: 'rgba(245, 158, 11, 0.1)',
            hovertemplate: '<b>%{x}</b><br>Value: %{y:.2f}<extra></extra>',
        }];
        
        // Add Fed rate trace if provided
        if (hasFedRate) {
            traces.push({
                x: fedRateData.map(d => d.date),
                y: fedRateData.map(d => d.rate),
                type: 'scatter',
                mode: 'lines',
                name: 'Fed Funds Rate (%)',
                line: {
                    color: this.colors.fedRate,
                    width: 1.5,
                },
                fill: 'tozeroy',
                fillcolor: 'rgba(139, 92, 246, 0.15)',
                hovertemplate: 'Fed Rate: %{y:.2f}%<extra></extra>',
                yaxis: 'y2',
            });
        }
        
        // Add benchmark if provided
        if (options.benchmark) {
            traces.push({
                x: options.benchmark.map(d => d.date),
                y: options.benchmark.map(d => d.value),
                type: 'scatter',
                mode: 'lines',
                name: 'Benchmark',
                line: {
                    color: this.colors.secondary,
                    width: 1.5,
                    dash: 'dash',
                },
                hovertemplate: '<b>%{x}</b><br>Benchmark: %{y:.2f}<extra></extra>',
                yaxis: 'y',
            });
        }
        
        const layout = {
            title: options.title || '',
            autosize: true,
            showlegend: traces.length > 1,
            legend: {
                x: 0,
                y: 1.1,
                orientation: 'h',
                font: { color: this.colors.text, size: 11 },
            },
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'transparent',
            font: {
                family: "'JetBrains Mono', monospace",
                color: this.colors.text,
                size: 11,
            },
            margin: { l: 60, r: hasFedRate ? 60 : 30, t: 30, b: 50 },
            xaxis: {
                type: 'date',
                gridcolor: this.colors.grid,
                linecolor: this.colors.grid,
                tickfont: { size: 10 },
                rangeslider: { visible: false },
            },
            yaxis: {
                title: 'Portfolio Value',
                gridcolor: this.colors.grid,
                linecolor: this.colors.grid,
                tickfont: { size: 10 },
                tickformat: '.0f',
            },
            // Secondary y-axis for Fed rate (only if Fed rate data is present)
            ...(hasFedRate ? {
                yaxis2: {
                    title: 'Fed Rate (%)',
                    titlefont: { color: this.colors.fedRate, size: 10 },
                    tickfont: { color: this.colors.fedRate, size: 10 },
                    overlaying: 'y',
                    side: 'right',
                    showgrid: false,
                    range: [0, Math.max(...fedRateData.map(d => d.rate), 1) * 1.2],
                },
            } : {}),
            hovermode: 'x unified',
            hoverlabel: {
                bgcolor: '#1f2937',
                bordercolor: this.colors.primary,
                font: { color: this.colors.text, size: 11 },
            },
            dragmode: 'zoom',
        };
        
        const config = {
            responsive: true,
            displayModeBar: true,
            modeBarButtonsToRemove: ['lasso2d', 'select2d', 'autoScale2d'],
            displaylogo: false,
        };
        
        try {
            Plotly.newPlot(container, traces, layout, config);
            this.instance = container;
            console.log('Chart rendered successfully');
            
            // Set up range selection callback
            if (options.onRangeSelect) {
                container.on('plotly_relayout', (eventData) => {
                    if (eventData['xaxis.range[0]'] && eventData['xaxis.range[1]']) {
                        const start = eventData['xaxis.range[0]'].split(' ')[0];
                        const end = eventData['xaxis.range[1]'].split(' ')[0];
                        options.onRangeSelect(start, end);
                    }
                });
            }
        } catch (error) {
            console.error('Failed to render chart:', error);
            container.innerHTML = `
                <div class="chart-placeholder">
                    <span class="placeholder-icon">⚠️</span>
                    <p>Failed to render chart: ${error.message}</p>
                </div>
            `;
        }
    },
    
    /**
     * Highlight a specific period on the chart
     * @param {string} start - Start date
     * @param {string} end - End date
     */
    highlightPeriod(start, end) {
        if (!this.instance) return;
        
        const shapes = [{
            type: 'rect',
            xref: 'x',
            yref: 'paper',
            x0: start,
            x1: end,
            y0: 0,
            y1: 1,
            fillcolor: 'rgba(245, 158, 11, 0.15)',
            line: {
                color: this.colors.primary,
                width: 1,
            },
        }];
        
        Plotly.relayout(this.instance, { shapes });
    },
    
    /**
     * Clear period highlights
     */
    clearHighlights() {
        if (!this.instance) return;
        Plotly.relayout(this.instance, { shapes: [] });
    },
    
    /**
     * Reset zoom to full data range
     */
    resetZoom() {
        if (!this.instance) return;
        Plotly.relayout(this.instance, {
            'xaxis.autorange': true,
            'yaxis.autorange': true,
        });
    },
    
    /**
     * Export chart as PNG
     */
    async exportImage() {
        if (!this.instance) return;
        
        try {
            const imgData = await Plotly.toImage(this.instance, {
                format: 'png',
                width: 1200,
                height: 600,
                scale: 2,
            });
            
            // Create download link
            const link = document.createElement('a');
            link.href = imgData;
            link.download = `portfolio_${Utils.today()}.png`;
            link.click();
            
            Utils.toast('Chart exported successfully', 'success');
        } catch (error) {
            Utils.toast('Failed to export chart', 'error');
            console.error('Export error:', error);
        }
    },
    
    /**
     * Add drawdown visualization
     * @param {Array} equityCurve - Equity curve data
     */
    addDrawdown(equityCurve) {
        if (!this.instance || !equityCurve) return;
        
        // Calculate drawdown
        let peak = equityCurve[0].value;
        const drawdown = equityCurve.map(point => {
            if (point.value > peak) peak = point.value;
            return {
                date: point.date,
                drawdown: (point.value - peak) / peak * 100,
            };
        });
        
        // Add drawdown trace
        Plotly.addTraces(this.instance, {
            x: drawdown.map(d => d.date),
            y: drawdown.map(d => d.drawdown),
            type: 'scatter',
            mode: 'lines',
            name: 'Drawdown',
            yaxis: 'y2',
            line: {
                color: this.colors.danger,
                width: 1,
            },
            fill: 'tozeroy',
            fillcolor: 'rgba(239, 68, 68, 0.1)',
        });
        
        // Update layout for dual axis
        Plotly.relayout(this.instance, {
            yaxis2: {
                title: 'Drawdown %',
                overlaying: 'y',
                side: 'right',
                gridcolor: 'transparent',
                tickformat: '.1f',
                ticksuffix: '%',
                range: [-50, 5],
            },
        });
    },
    
    /**
     * Plot multiple equity curves for comparison
     * @param {Object} curves - Object with name -> equityCurve data
     */
    plotComparison(curves) {
        const container = document.getElementById(this.containerId);
        if (!container) return;
        
        container.innerHTML = '';
        
        const colorPalette = [
            this.colors.primary,
            this.colors.secondary,
            this.colors.success,
            '#8b5cf6', // Purple
            '#ec4899', // Pink
        ];
        
        const traces = Object.entries(curves).map(([name, data], index) => ({
            x: data.map(d => d.date),
            y: data.map(d => d.value),
            type: 'scatter',
            mode: 'lines',
            name: name,
            line: {
                color: colorPalette[index % colorPalette.length],
                width: 2,
            },
        }));
        
        const layout = {
            autosize: true,
            showlegend: true,
            legend: {
                x: 0,
                y: 1.1,
                orientation: 'h',
                font: { color: this.colors.text, size: 11 },
            },
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'transparent',
            font: {
                family: "'JetBrains Mono', monospace",
                color: this.colors.text,
                size: 11,
            },
            margin: { l: 60, r: 30, t: 30, b: 50 },
            xaxis: {
                type: 'date',
                gridcolor: this.colors.grid,
                linecolor: this.colors.grid,
            },
            yaxis: {
                title: 'Portfolio Value',
                gridcolor: this.colors.grid,
                linecolor: this.colors.grid,
            },
            hovermode: 'x unified',
        };
        
        Plotly.newPlot(container, traces, layout, { responsive: true, displaylogo: false });
        this.instance = container;
    },
};

// Export for use in other modules
window.Chart = Chart;

