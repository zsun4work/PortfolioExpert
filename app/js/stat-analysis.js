/**
 * Stat Analysis Page - Main Application Logic
 */

const StatAnalysis = {
    // Application state
    state: {
        selectedTickers: [],
        dateRange: { start: null, end: null },
        windows: [], // [{id, days, enabled, color}]
        summaryData: null,
        rollingData: {}, // {windowDays: data}
        correlationPairs: [],
        selectedCorrelationPair: null,
    },
    
    // Window colors palette (for window differentiation)
    windowColors: [
        '#f59e0b', '#3b82f6', '#10b981', '#8b5cf6',
        '#ef4444', '#ec4899', '#06b6d4', '#84cc16'
    ],
    
    // Ticker colors palette (distinct colors for each asset)
    tickerColors: [
        '#60a5fa', // Blue
        '#f472b6', // Pink
        '#34d399', // Green
        '#fbbf24', // Amber
        '#a78bfa', // Purple
        '#f97316', // Orange
        '#22d3d8', // Cyan
        '#ef4444', // Red
        '#84cc16', // Lime
        '#e879f9', // Magenta
    ],
    
    // Chart instances
    charts: {
        volatility: null,
        return: null,
        correlation: null,
    },
    
    // Date picker instances
    datePickers: {
        start: null,
        end: null,
    },
    
    // LocalStorage key
    STORAGE_KEY: 'statAnalysis_state',
    
    /**
     * Initialize the application
     */
    async init() {
        console.log('Initializing Stat Analysis...');
        
        // Set up date pickers
        this.initDatePickers();
        
        // Bind event listeners
        this.bindEvents();
        
        // Check API connectivity
        await this.checkApiConnection();
        
        // Load saved state
        this.loadStateFromStorage();
        
        // If no saved state, set defaults
        if (!this.state.dateRange.start) {
            this.setDefaultDateRange();
        }
        
        // Add default windows if none exist
        if (this.state.windows.length === 0) {
            this.addWindow(60, false);
        }
        
        // Render UI
        this.renderTickers();
        this.renderWindows();
        this.updateAnalyzeButton();
        this.updatePresetButtons();
        
        Utils.setStatus('Ready');
        console.log('Initialization complete');
    },
    
    /**
     * Initialize Flatpickr date pickers
     */
    initDatePickers() {
        const config = {
            dateFormat: 'Y-m-d',
            theme: 'dark',
            disableMobile: true,
        };
        
        this.datePickers.start = flatpickr('#startDate', {
            ...config,
            onChange: (dates, dateStr) => {
                this.state.dateRange.start = dateStr;
                this.updateAnalyzeButton();
                this.saveStateToStorage();
            },
        });
        
        this.datePickers.end = flatpickr('#endDate', {
            ...config,
            onChange: (dates, dateStr) => {
                this.state.dateRange.end = dateStr;
                this.updateAnalyzeButton();
                this.saveStateToStorage();
            },
        });
    },
    
    /**
     * Bind event listeners
     */
    bindEvents() {
        // Ticker input
        const tickerInput = document.getElementById('tickerInput');
        const addTickerBtn = document.getElementById('addTickerBtn');
        
        addTickerBtn.addEventListener('click', () => this.addTicker());
        tickerInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addTicker();
        });
        
        // Load data button
        document.getElementById('loadDataBtn').addEventListener('click', () => this.loadAllData());
        
        // Import from backtest button
        document.getElementById('importFromBacktestBtn').addEventListener('click', () => this.importFromBacktest());
        
        // Analyze button
        document.getElementById('analyzeBtn').addEventListener('click', () => this.runAnalysis());
        
        // Add window
        document.getElementById('addWindowBtn').addEventListener('click', () => this.addWindowFromInput());
        document.getElementById('newWindowInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addWindowFromInput();
        });
        
        // Preset window buttons
        document.querySelectorAll('.preset-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const days = parseInt(btn.dataset.window);
                this.addWindow(days, true);
            });
        });
        
        // Correlation pair select
        document.getElementById('correlationPairSelect').addEventListener('change', (e) => {
            this.state.selectedCorrelationPair = e.target.value;
            this.updateCorrelationChart();
        });
    },
    
    /**
     * Check API connection
     */
    async checkApiConnection() {
        const connected = await API.checkHealth();
        if (!connected) {
            Utils.toast('Cannot connect to backend. Start the server first.', 'error');
        }
        return connected;
    },
    
    /**
     * Set default date range (last 5 years)
     */
    setDefaultDateRange() {
        const end = Utils.today();
        const start = Utils.yearsAgo(5);
        
        this.state.dateRange = { start, end };
        this.datePickers.start.setDate(start);
        this.datePickers.end.setDate(end);
    },
    
    // =========================================================================
    // State Persistence
    // =========================================================================
    
    saveStateToStorage() {
        try {
            const stateToSave = {
                selectedTickers: this.state.selectedTickers,
                dateRange: this.state.dateRange,
                windows: this.state.windows,
            };
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(stateToSave));
        } catch (e) {
            console.warn('Failed to save state:', e);
        }
    },
    
    loadStateFromStorage() {
        try {
            const saved = localStorage.getItem(this.STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                this.state.selectedTickers = parsed.selectedTickers || [];
                this.state.dateRange = parsed.dateRange || { start: null, end: null };
                this.state.windows = parsed.windows || [];
                
                // Update date pickers
                if (this.state.dateRange.start) {
                    this.datePickers.start.setDate(this.state.dateRange.start);
                }
                if (this.state.dateRange.end) {
                    this.datePickers.end.setDate(this.state.dateRange.end);
                }
                
                console.log('Loaded saved state:', this.state.selectedTickers);
            }
        } catch (e) {
            console.warn('Failed to load state:', e);
        }
    },
    
    // =========================================================================
    // Ticker Management
    // =========================================================================
    
    addTicker() {
        const input = document.getElementById('tickerInput');
        const rawInput = input.value.trim();
        
        if (!rawInput) return;
        
        const tickers = rawInput
            .split(',')
            .map(t => t.trim().toUpperCase())
            .filter(t => t.length > 0);
        
        if (tickers.length === 0) return;
        
        const added = [];
        const skipped = [];
        
        for (const ticker of tickers) {
            if (this.state.selectedTickers.includes(ticker)) {
                skipped.push(ticker);
            } else {
                this.state.selectedTickers.push(ticker);
                added.push(ticker);
            }
        }
        
        if (added.length > 0) {
            input.value = '';
            this.renderTickers();
            this.updateAnalyzeButton();
            this.saveStateToStorage();
            Utils.toast(`Added: ${added.join(', ')}`, 'success');
        }
        
        if (skipped.length > 0) {
            Utils.toast(`Already added: ${skipped.join(', ')}`, 'info');
        }
    },
    
    removeTicker(ticker) {
        this.state.selectedTickers = this.state.selectedTickers.filter(t => t !== ticker);
        this.renderTickers();
        this.updateAnalyzeButton();
        this.saveStateToStorage();
    },
    
    renderTickers() {
        const container = document.getElementById('selectedTickers');
        
        if (this.state.selectedTickers.length === 0) {
            container.innerHTML = '<p class="empty-state">No tickers selected</p>';
            return;
        }
        
        container.innerHTML = this.state.selectedTickers.map((ticker, index) => {
            const color = this.tickerColors[index % this.tickerColors.length];
            return `
                <span class="ticker-chip" style="border-color: ${color}; background: ${color}15;">
                    <span class="ticker-color-dot" style="background: ${color};"></span>
                    ${ticker}
                    <button class="remove-btn" onclick="StatAnalysis.removeTicker('${ticker}')">&times;</button>
                </span>
            `;
        }).join('');
    },
    
    /**
     * Import tickers from the Backtest tab
     */
    importFromBacktest() {
        try {
            const saved = localStorage.getItem('portfolioViewer_state');
            if (!saved) {
                Utils.toast('No data found from Backtest tab', 'info');
                return;
            }
            
            const parsed = JSON.parse(saved);
            const backtestTickers = parsed.selectedTickers || [];
            
            if (backtestTickers.length === 0) {
                Utils.toast('No tickers found in Backtest tab', 'info');
                return;
            }
            
            // Import tickers
            const added = [];
            for (const ticker of backtestTickers) {
                if (!this.state.selectedTickers.includes(ticker)) {
                    this.state.selectedTickers.push(ticker);
                    added.push(ticker);
                }
            }
            
            // Import date range if available
            if (parsed.dateRange) {
                if (parsed.dateRange.start) {
                    this.state.dateRange.start = parsed.dateRange.start;
                    this.datePickers.start.setDate(parsed.dateRange.start);
                }
                if (parsed.dateRange.end) {
                    this.state.dateRange.end = parsed.dateRange.end;
                    this.datePickers.end.setDate(parsed.dateRange.end);
                }
            }
            
            this.renderTickers();
            this.updateAnalyzeButton();
            this.saveStateToStorage();
            
            if (added.length > 0) {
                Utils.toast(`Imported ${added.length} tickers from Backtest: ${added.join(', ')}`, 'success');
            } else {
                Utils.toast('All tickers already added', 'info');
            }
        } catch (e) {
            console.error('Import error:', e);
            Utils.toast('Failed to import from Backtest tab', 'error');
        }
    },
    
    /**
     * Get color for a ticker by index
     */
    getTickerColor(ticker) {
        const index = this.state.selectedTickers.indexOf(ticker);
        return this.tickerColors[index % this.tickerColors.length];
    },
    
    /**
     * Get line style based on window size
     */
    getWindowLineStyle(windowIndex) {
        const styles = ['solid', 'dash', 'dot', 'dashdot'];
        return styles[windowIndex % styles.length];
    },
    
    // =========================================================================
    // Window Management
    // =========================================================================
    
    addWindow(days, showToast = false) {
        // Check if window already exists
        if (this.state.windows.some(w => w.days === days)) {
            if (showToast) Utils.toast(`${days}-day window already exists`, 'info');
            return;
        }
        
        const colorIndex = this.state.windows.length % this.windowColors.length;
        
        this.state.windows.push({
            id: Utils.generateId(),
            days: days,
            enabled: true,
            color: this.windowColors[colorIndex],
        });
        
        // Sort by days
        this.state.windows.sort((a, b) => a.days - b.days);
        
        this.renderWindows();
        this.updatePresetButtons();
        this.saveStateToStorage();
        
        if (showToast) Utils.toast(`Added ${days}-day rolling window`, 'success');
    },
    
    addWindowFromInput() {
        const input = document.getElementById('newWindowInput');
        const days = parseInt(input.value);
        
        if (isNaN(days) || days < 5) {
            Utils.toast('Window must be at least 5 days', 'error');
            return;
        }
        
        if (days > 500) {
            Utils.toast('Window cannot exceed 500 days', 'error');
            return;
        }
        
        this.addWindow(days, true);
        input.value = '';
    },
    
    removeWindow(id) {
        this.state.windows = this.state.windows.filter(w => w.id !== id);
        this.renderWindows();
        this.updatePresetButtons();
        this.saveStateToStorage();
    },
    
    toggleWindow(id) {
        const window = this.state.windows.find(w => w.id === id);
        if (window) {
            window.enabled = !window.enabled;
            this.renderWindows();
            this.saveStateToStorage();
            
            // Update charts if we have data
            if (Object.keys(this.state.rollingData).length > 0) {
                this.updateAllCharts();
            }
        }
    },
    
    renderWindows() {
        const container = document.getElementById('windowsContainer');
        
        if (this.state.windows.length === 0) {
            container.innerHTML = '<p class="empty-state">No rolling windows defined</p>';
            return;
        }
        
        container.innerHTML = this.state.windows.map((w, index) => `
            <div class="window-chip ${w.enabled ? 'active' : ''}">
                <div class="window-chip-info">
                    <span class="window-chip-color" style="background-color: ${w.color}"></span>
                    <span class="window-chip-value">${w.days} days</span>
                </div>
                <div class="window-chip-toggle">
                    <input type="checkbox" ${w.enabled ? 'checked' : ''} 
                           onchange="StatAnalysis.toggleWindow('${w.id}')"
                           title="Show/hide in charts">
                    <button class="remove-btn" onclick="StatAnalysis.removeWindow('${w.id}')">&times;</button>
                </div>
            </div>
        `).join('');
    },
    
    updatePresetButtons() {
        document.querySelectorAll('.preset-btn').forEach(btn => {
            const days = parseInt(btn.dataset.window);
            const exists = this.state.windows.some(w => w.days === days);
            btn.classList.toggle('added', exists);
        });
    },
    
    // =========================================================================
    // Data Loading
    // =========================================================================
    
    async loadAllData() {
        if (this.state.selectedTickers.length === 0) {
            Utils.toast('No tickers selected', 'info');
            return;
        }
        
        Utils.showLoading('Loading data...');
        
        try {
            let loaded = 0;
            for (const ticker of this.state.selectedTickers) {
                Utils.showLoading(`Loading ${ticker}...`);
                
                const result = await API.loadData(
                    ticker,
                    this.state.dateRange.start,
                    this.state.dateRange.end
                );
                
                if (result.status === 'success') {
                    loaded++;
                }
            }
            
            Utils.toast(`Loaded data for ${loaded} tickers`, 'success');
        } catch (error) {
            Utils.toast(`Error: ${error.message}`, 'error');
        } finally {
            Utils.hideLoading();
        }
    },
    
    // =========================================================================
    // Analysis
    // =========================================================================
    
    updateAnalyzeButton() {
        const btn = document.getElementById('analyzeBtn');
        const canAnalyze = this.state.selectedTickers.length > 0 &&
                          this.state.dateRange.start &&
                          this.state.dateRange.end;
        btn.disabled = !canAnalyze;
    },
    
    async runAnalysis() {
        if (this.state.selectedTickers.length === 0) {
            Utils.toast('No tickers selected', 'error');
            return;
        }
        
        Utils.showLoading('Running analysis...');
        
        try {
            // Get summary statistics
            Utils.showLoading('Calculating summary statistics...');
            const summaryResult = await API.getStatisticsSummary(
                this.state.selectedTickers,
                this.state.dateRange.start,
                this.state.dateRange.end
            );
            
            this.state.summaryData = summaryResult;
            this.displaySummaryStats(summaryResult);
            
            // Get rolling statistics for all enabled windows
            const enabledWindows = this.state.windows.filter(w => w.enabled);
            
            if (enabledWindows.length > 0) {
                Utils.showLoading('Calculating rolling statistics...');
                const windowDays = enabledWindows.map(w => w.days);
                
                const rollingResult = await API.getMultiWindowRollingStats(
                    this.state.selectedTickers,
                    windowDays,
                    this.state.dateRange.start,
                    this.state.dateRange.end
                );
                
                this.state.rollingData = rollingResult.results;
                
                // Extract correlation pairs
                this.extractCorrelationPairs();
                
                // Update charts
                this.updateAllCharts();
            }
            
            // Hide placeholder, show results
            document.getElementById('placeholderContainer').style.display = 'none';
            
            Utils.toast('Analysis complete', 'success');
        } catch (error) {
            console.error('Analysis error:', error);
            Utils.toast(`Error: ${error.message}`, 'error');
        } finally {
            Utils.hideLoading();
        }
    },
    
    // =========================================================================
    // Display Summary Statistics
    // =========================================================================
    
    displaySummaryStats(data) {
        const container = document.getElementById('summaryContainer');
        container.style.display = 'block';
        
        // Update date range badge
        const dateRange = data.date_range;
        document.getElementById('summaryDateRange').textContent = 
            `${dateRange.start} to ${dateRange.end}`;
        
        // Update asset stats table
        const tbody = document.querySelector('#assetStatsTable tbody');
        tbody.innerHTML = '';
        
        for (const ticker of data.tickers) {
            const stats = data.asset_stats[ticker];
            const returnClass = stats.expected_return >= 0 ? 'stat-positive' : 'stat-negative';
            
            tbody.innerHTML += `
                <tr>
                    <td class="ticker-cell">${ticker}</td>
                    <td class="stat-value">${(stats.volatility * 100).toFixed(2)}%</td>
                    <td class="stat-value ${returnClass}">${(stats.expected_return * 100).toFixed(2)}%</td>
                    <td>${stats.data_points}</td>
                </tr>
            `;
        }
        
        // Update correlation matrix
        this.renderCorrelationMatrix(data.tickers, data.correlation_matrix);
    },
    
    renderCorrelationMatrix(tickers, matrix) {
        const container = document.getElementById('correlationMatrix');
        
        if (tickers.length < 2) {
            container.innerHTML = '<p class="empty-state">Need at least 2 assets for correlation</p>';
            return;
        }
        
        let html = '<table class="corr-table">';
        
        // Header row
        html += '<thead><tr><th></th>';
        for (const ticker of tickers) {
            html += `<th>${ticker}</th>`;
        }
        html += '</tr></thead><tbody>';
        
        // Data rows
        for (const ticker1 of tickers) {
            html += `<tr><td>${ticker1}</td>`;
            for (const ticker2 of tickers) {
                const corr = matrix[ticker1][ticker2];
                const corrClass = this.getCorrelationClass(corr, ticker1 === ticker2);
                const displayVal = ticker1 === ticker2 ? '1.00' : corr.toFixed(2);
                html += `<td class="corr-cell ${corrClass}">${displayVal}</td>`;
            }
            html += '</tr>';
        }
        
        html += '</tbody></table>';
        container.innerHTML = html;
    },
    
    getCorrelationClass(corr, isDiagonal) {
        if (isDiagonal) return 'diagonal';
        if (corr >= 0.7) return 'corr-high-pos';
        if (corr >= 0.3) return 'corr-med-pos';
        if (corr >= -0.3) return 'corr-low';
        if (corr >= -0.7) return 'corr-med-neg';
        return 'corr-high-neg';
    },
    
    // =========================================================================
    // Rolling Charts
    // =========================================================================
    
    extractCorrelationPairs() {
        this.state.correlationPairs = [];
        
        // Get pairs from first window's data
        const firstWindowKey = Object.keys(this.state.rollingData)[0];
        if (!firstWindowKey) return;
        
        const corrData = this.state.rollingData[firstWindowKey].rolling_correlation;
        if (!corrData || corrData.length === 0) return;
        
        // Extract unique pairs
        const pairs = new Set();
        for (const point of corrData) {
            pairs.add(point.pair);
        }
        
        this.state.correlationPairs = Array.from(pairs);
        
        // Update dropdown
        const select = document.getElementById('correlationPairSelect');
        select.innerHTML = this.state.correlationPairs.map(pair => 
            `<option value="${pair}">${pair}</option>`
        ).join('');
        
        // Set default selection
        if (this.state.correlationPairs.length > 0 && !this.state.selectedCorrelationPair) {
            this.state.selectedCorrelationPair = this.state.correlationPairs[0];
        }
    },
    
    updateAllCharts() {
        this.updateVolatilityChart();
        this.updateReturnChart();
        this.updateCorrelationChart();
    },
    
    updateVolatilityChart() {
        const container = document.getElementById('rollingVolatilityContainer');
        const chartArea = document.getElementById('rollingVolatilityChart');
        
        const enabledWindows = this.state.windows.filter(w => w.enabled);
        if (enabledWindows.length === 0 || Object.keys(this.state.rollingData).length === 0) {
            container.style.display = 'none';
            return;
        }
        
        container.style.display = 'block';
        
        const traces = [];
        const tickers = this.state.selectedTickers;
        
        // For each ticker, create traces for each window
        // Color by ticker, line style by window
        for (let tickerIdx = 0; tickerIdx < tickers.length; tickerIdx++) {
            const ticker = tickers[tickerIdx];
            const tickerColor = this.tickerColors[tickerIdx % this.tickerColors.length];
            
            for (let windowIdx = 0; windowIdx < enabledWindows.length; windowIdx++) {
                const window = enabledWindows[windowIdx];
                const windowData = this.state.rollingData[String(window.days)];
                if (!windowData || !windowData.rolling_volatility) continue;
                
                const volData = windowData.rolling_volatility;
                const dates = volData.map(d => d.date);
                const values = volData.map(d => d[ticker] !== null ? d[ticker] * 100 : null);
                
                // Line style varies by window
                const dashStyle = this.getWindowLineStyle(windowIdx);
                
                traces.push({
                    x: dates,
                    y: values,
                    type: 'scatter',
                    mode: 'lines',
                    name: `${ticker} (${window.days}d)`,
                    line: {
                        color: tickerColor,
                        width: 2,
                        dash: dashStyle,
                    },
                    hovertemplate: `${ticker} ${window.days}d: %{y:.2f}%<extra></extra>`,
                });
            }
        }
        
        const layout = this.getChartLayout('Annualized Volatility (%)');
        
        Plotly.newPlot(chartArea, traces, layout, { responsive: true, displayModeBar: false });
        
        // Update legend with both tickers and windows
        this.updateCombinedChartLegend('volChartLegend', tickers, enabledWindows);
    },
    
    updateReturnChart() {
        const container = document.getElementById('rollingReturnContainer');
        const chartArea = document.getElementById('rollingReturnChart');
        
        const enabledWindows = this.state.windows.filter(w => w.enabled);
        if (enabledWindows.length === 0 || Object.keys(this.state.rollingData).length === 0) {
            container.style.display = 'none';
            return;
        }
        
        container.style.display = 'block';
        
        const traces = [];
        const tickers = this.state.selectedTickers;
        
        // Color by ticker, line style by window
        for (let tickerIdx = 0; tickerIdx < tickers.length; tickerIdx++) {
            const ticker = tickers[tickerIdx];
            const tickerColor = this.tickerColors[tickerIdx % this.tickerColors.length];
            
            for (let windowIdx = 0; windowIdx < enabledWindows.length; windowIdx++) {
                const window = enabledWindows[windowIdx];
                const windowData = this.state.rollingData[String(window.days)];
                if (!windowData || !windowData.rolling_return) continue;
                
                const retData = windowData.rolling_return;
                const dates = retData.map(d => d.date);
                const values = retData.map(d => d[ticker] !== null ? d[ticker] * 100 : null);
                
                const dashStyle = this.getWindowLineStyle(windowIdx);
                
                traces.push({
                    x: dates,
                    y: values,
                    type: 'scatter',
                    mode: 'lines',
                    name: `${ticker} (${window.days}d)`,
                    line: {
                        color: tickerColor,
                        width: 2,
                        dash: dashStyle,
                    },
                    hovertemplate: `${ticker} ${window.days}d: %{y:.2f}%<extra></extra>`,
                });
            }
        }
        
        // Add zero line
        const layout = this.getChartLayout('Annualized Expected Return (%)');
        layout.shapes = [{
            type: 'line',
            x0: 0,
            x1: 1,
            xref: 'paper',
            y0: 0,
            y1: 0,
            line: {
                color: '#4a5568',
                width: 1,
                dash: 'dot',
            },
        }];
        
        Plotly.newPlot(chartArea, traces, layout, { responsive: true, displayModeBar: false });
        
        this.updateCombinedChartLegend('retChartLegend', tickers, enabledWindows);
    },
    
    updateCorrelationChart() {
        const container = document.getElementById('rollingCorrelationContainer');
        const chartArea = document.getElementById('rollingCorrelationChart');
        
        const enabledWindows = this.state.windows.filter(w => w.enabled);
        const selectedPair = this.state.selectedCorrelationPair;
        
        if (enabledWindows.length === 0 || 
            Object.keys(this.state.rollingData).length === 0 ||
            !selectedPair) {
            container.style.display = 'none';
            return;
        }
        
        container.style.display = 'block';
        
        const traces = [];
        
        for (const window of enabledWindows) {
            const windowData = this.state.rollingData[String(window.days)];
            if (!windowData || !windowData.rolling_correlation) continue;
            
            // Filter to selected pair
            const pairData = windowData.rolling_correlation.filter(d => d.pair === selectedPair);
            if (pairData.length === 0) continue;
            
            const dates = pairData.map(d => d.date);
            const values = pairData.map(d => d.correlation);
            
            traces.push({
                x: dates,
                y: values,
                type: 'scatter',
                mode: 'lines',
                name: `${window.days}d window`,
                line: {
                    color: window.color,
                    width: 2,
                },
                hovertemplate: `${window.days}d: %{y:.3f}<extra></extra>`,
            });
        }
        
        const layout = this.getChartLayout('Correlation');
        layout.yaxis.range = [-1.1, 1.1];
        
        // Add reference lines
        layout.shapes = [
            {
                type: 'line',
                x0: 0,
                x1: 1,
                xref: 'paper',
                y0: 0,
                y1: 0,
                line: { color: '#4a5568', width: 1, dash: 'dot' },
            },
            {
                type: 'line',
                x0: 0,
                x1: 1,
                xref: 'paper',
                y0: 0.5,
                y1: 0.5,
                line: { color: 'rgba(16, 185, 129, 0.3)', width: 1, dash: 'dot' },
            },
            {
                type: 'line',
                x0: 0,
                x1: 1,
                xref: 'paper',
                y0: -0.5,
                y1: -0.5,
                line: { color: 'rgba(239, 68, 68, 0.3)', width: 1, dash: 'dot' },
            },
        ];
        
        Plotly.newPlot(chartArea, traces, layout, { responsive: true, displayModeBar: false });
    },
    
    getChartLayout(yAxisTitle) {
        return {
            autosize: true,
            showlegend: true,
            legend: {
                x: 0,
                y: 1.15,
                orientation: 'h',
                font: { color: '#94a3b8', size: 10 },
            },
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'transparent',
            font: {
                family: "'JetBrains Mono', monospace",
                color: '#94a3b8',
                size: 10,
            },
            margin: { l: 50, r: 20, t: 10, b: 40 },
            xaxis: {
                type: 'date',
                gridcolor: '#2d3748',
                linecolor: '#2d3748',
                tickfont: { size: 9 },
            },
            yaxis: {
                title: yAxisTitle,
                gridcolor: '#2d3748',
                linecolor: '#2d3748',
                tickfont: { size: 9 },
            },
            hovermode: 'x unified',
        };
    },
    
    updateChartLegend(containerId, windows) {
        const container = document.getElementById(containerId);
        container.innerHTML = windows.map(w => `
            <span class="legend-item">
                <span class="legend-color" style="background: ${w.color}"></span>
                ${w.days}d
            </span>
        `).join('');
    },
    
    /**
     * Update chart legend showing both ticker colors and window styles
     */
    updateCombinedChartLegend(containerId, tickers, windows) {
        const container = document.getElementById(containerId);
        
        // Create ticker color legend
        const tickerLegend = tickers.map((ticker, idx) => {
            const color = this.tickerColors[idx % this.tickerColors.length];
            return `
                <span class="legend-item">
                    <span class="legend-color-dot" style="background: ${color};"></span>
                    ${ticker}
                </span>
            `;
        }).join('');
        
        // Create window style legend (only if multiple windows)
        let windowLegend = '';
        if (windows.length > 1) {
            const styleNames = ['solid', 'dashed', 'dotted', 'dash-dot'];
            windowLegend = '<span class="legend-separator">|</span>' + windows.map((w, idx) => {
                const style = styleNames[idx % styleNames.length];
                return `
                    <span class="legend-item">
                        <span class="legend-line legend-line-${style}"></span>
                        ${w.days}d
                    </span>
                `;
            }).join('');
        }
        
        container.innerHTML = tickerLegend + windowLegend;
    },
};

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    StatAnalysis.init();
});

// Export for global access
window.StatAnalysis = StatAnalysis;

