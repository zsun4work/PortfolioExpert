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
        unemployment: '#f97316', // Orange for unemployment
        cpi: '#ec4899',          // Pink for CPI
        grid: '#2d3748',         // Grid lines
        text: '#94a3b8',         // Text color
        background: '#111827',   // Chart background
    },
    
    // Selection mode state
    selectionMode: {
        active: false,
        isSelecting: false,
        startX: 0,
        startDate: null,
        endDate: null,
        equityCurve: null,  // Store equity curve data for date conversion
    },
    
    // Flag to prevent recursive relayout updates
    isUpdating: false,
    lastRange: null,
    pendingUpdate: null,
    
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
        
        // Clear any existing chart and event listeners
        if (this.instance) {
            try {
                Plotly.purge(container);
            } catch (e) {
                console.warn('Could not purge existing chart:', e);
            }
        }
        container.innerHTML = '';
        
        // Reset state
        this.lastRange = null;
        this.isUpdating = false;
        if (this.pendingUpdate) {
            clearTimeout(this.pendingUpdate);
            this.pendingUpdate = null;
        }
        
        const dates = equityCurve.map(d => d.date);
        const values = equityCurve.map(d => d.value);
        
        console.log('Preparing chart with', dates.length, 'data points');
        console.log('Date range:', dates[0], 'to', dates[dates.length - 1]);
        console.log('Value range:', Math.min(...values), 'to', Math.max(...values));
        
        // Check if we have valid macro data (filter out null/undefined rates)
        let fedRateData = [];
        if (options.fedRateData && options.fedRateData.length > 0) {
            fedRateData = options.fedRateData.filter(d => d.rate != null && !isNaN(d.rate));
        }
        let unemploymentData = [];
        if (options.unemploymentData && options.unemploymentData.length > 0) {
            unemploymentData = options.unemploymentData.filter(d => d.rate != null && !isNaN(d.rate));
        }
        let cpiData = [];
        if (options.cpiYoyData && options.cpiYoyData.length > 0) {
            cpiData = options.cpiYoyData.filter(d => d.rate != null && !isNaN(d.rate));
        }
        
        const hasFedRate = fedRateData.length > 0;
        const hasUnemployment = unemploymentData.length > 0;
        const hasCpi = cpiData.length > 0;
        const hasMacroData = hasFedRate || hasUnemployment || hasCpi;
        
        // Calculate max macro value for y-axis scaling
        let maxMacroValue = 1;
        if (hasFedRate) maxMacroValue = Math.max(maxMacroValue, ...fedRateData.map(d => d.rate));
        if (hasUnemployment) maxMacroValue = Math.max(maxMacroValue, ...unemploymentData.map(d => d.rate));
        if (hasCpi) maxMacroValue = Math.max(maxMacroValue, ...cpiData.map(d => Math.abs(d.rate)));
        
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
                fillcolor: 'rgba(139, 92, 246, 0.08)',
                hovertemplate: 'Fed Rate: %{y:.2f}%<extra></extra>',
                yaxis: 'y2',
            });
        }
        
        // Add Unemployment rate trace if provided
        if (hasUnemployment) {
            traces.push({
                x: unemploymentData.map(d => d.date),
                y: unemploymentData.map(d => d.rate),
                type: 'scatter',
                mode: 'lines',
                name: 'Unemployment Rate (%)',
                line: {
                    color: this.colors.unemployment,
                    width: 1.5,
                },
                hovertemplate: 'Unemployment: %{y:.1f}%<extra></extra>',
                yaxis: 'y2',
            });
        }
        
        // Add CPI YoY trace if provided
        if (hasCpi) {
            traces.push({
                x: cpiData.map(d => d.date),
                y: cpiData.map(d => d.rate),
                type: 'scatter',
                mode: 'lines',
                name: 'CPI YoY (%)',
                line: {
                    color: this.colors.cpi,
                    width: 1.5,
                },
                hovertemplate: 'CPI YoY: %{y:.1f}%<extra></extra>',
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
            margin: { l: 60, r: hasMacroData ? 60 : 30, t: 30, b: 50 },
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
            // Secondary y-axis for macro indicators (shared axis for all rates)
            ...(hasMacroData ? {
                yaxis2: {
                    title: 'Rate (%)',
                    titlefont: { color: this.colors.text, size: 10 },
                    tickfont: { color: this.colors.text, size: 10 },
                    overlaying: 'y',
                    side: 'right',
                    showgrid: false,
                    range: [hasCpi ? Math.min(0, ...cpiData.map(d => d.rate)) * 1.2 : 0, maxMacroValue * 1.2],
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
                    // Prevent recursive updates from our own relayout calls
                    if (this.isUpdating) return;
                    
                    // Only process user-initiated zoom events (must have both range values)
                    if (eventData['xaxis.range[0]'] && eventData['xaxis.range[1]']) {
                        // Parse dates - handle both ISO format and datetime strings
                        let startStr = eventData['xaxis.range[0]'];
                        let endStr = eventData['xaxis.range[1]'];
                        
                        // Extract just the date part if it includes time
                        const start = startStr.toString().split(' ')[0].split('T')[0];
                        const end = endStr.toString().split(' ')[0].split('T')[0];
                        
                        // Validate dates
                        if (!start || !end || start === 'Invalid' || end === 'Invalid') {
                            console.warn('Invalid date range received:', startStr, endStr);
                            return;
                        }
                        
                        // Check if range actually changed to prevent infinite loops
                        const newRange = `${start}-${end}`;
                        if (this.lastRange === newRange) return;
                        this.lastRange = newRange;
                        
                        console.log('Chart range selected:', start, 'to', end);
                        
                        // Debounce the callback to prevent rapid-fire updates
                        if (this.pendingUpdate) {
                            clearTimeout(this.pendingUpdate);
                        }
                        this.pendingUpdate = setTimeout(() => {
                            this.pendingUpdate = null;
                            options.onRangeSelect(start, end);
                        }, 50);
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
        
        // Prevent recursive updates - keep flag set for async relayout
        this.isUpdating = true;
        Plotly.relayout(this.instance, { shapes }).then(() => {
            // Reset flag after relayout completes
            setTimeout(() => { this.isUpdating = false; }, 100);
        }).catch(() => {
            this.isUpdating = false;
        });
    },
    
    /**
     * Clear period highlights
     */
    clearHighlights() {
        if (!this.instance) return;
        this.isUpdating = true;
        Plotly.relayout(this.instance, { shapes: [] }).then(() => {
            setTimeout(() => { this.isUpdating = false; }, 100);
        }).catch(() => {
            this.isUpdating = false;
        });
    },
    
    /**
     * Reset zoom to full data range
     */
    resetZoom() {
        if (!this.instance) return;
        this.isUpdating = true;
        this.lastRange = null;  // Clear last range on reset
        Plotly.relayout(this.instance, {
            'xaxis.autorange': true,
            'yaxis.autorange': true,
        }).then(() => {
            setTimeout(() => { this.isUpdating = false; }, 100);
        }).catch(() => {
            this.isUpdating = false;
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
    
    // =========================================================================
    // Sub-Period Selection Mode
    // =========================================================================
    
    /**
     * Toggle selection mode on/off
     */
    toggleSelectionMode() {
        this.selectionMode.active = !this.selectionMode.active;
        
        const overlay = document.getElementById('selectionOverlay');
        const indicator = document.getElementById('selectionModeIndicator');
        const selectBtn = document.getElementById('selectPeriodBtn');
        
        if (this.selectionMode.active) {
            // Activate selection mode
            overlay.style.display = 'block';
            indicator.style.display = 'flex';
            selectBtn.classList.add('selection-active');
            
            // Bind mouse events
            this.bindSelectionEvents();
            
            Utils.toast('Selection mode activated. Drag on chart to select a period.', 'info');
        } else {
            // Deactivate selection mode
            this.deactivateSelectionMode();
        }
    },
    
    /**
     * Deactivate selection mode
     */
    deactivateSelectionMode() {
        this.selectionMode.active = false;
        this.selectionMode.isSelecting = false;
        
        const overlay = document.getElementById('selectionOverlay');
        const indicator = document.getElementById('selectionModeIndicator');
        const selectBtn = document.getElementById('selectPeriodBtn');
        const selectionBox = document.getElementById('selectionBox');
        const tooltip = document.getElementById('selectionTooltip');
        
        if (overlay) overlay.style.display = 'none';
        if (indicator) indicator.style.display = 'none';
        if (selectBtn) selectBtn.classList.remove('selection-active');
        if (selectionBox) selectionBox.classList.remove('visible');
        if (tooltip) tooltip.style.display = 'none';
        
        // Remove event listeners
        this.unbindSelectionEvents();
    },
    
    /**
     * Bind mouse events for selection
     */
    bindSelectionEvents() {
        const overlay = document.getElementById('selectionOverlay');
        if (!overlay) return;
        
        // Store bound functions for removal later
        this._onMouseDown = this.onSelectionMouseDown.bind(this);
        this._onMouseMove = this.onSelectionMouseMove.bind(this);
        this._onMouseUp = this.onSelectionMouseUp.bind(this);
        
        overlay.addEventListener('mousedown', this._onMouseDown);
        overlay.addEventListener('mousemove', this._onMouseMove);
        overlay.addEventListener('mouseup', this._onMouseUp);
        overlay.addEventListener('mouseleave', this._onMouseUp);
    },
    
    /**
     * Unbind mouse events
     */
    unbindSelectionEvents() {
        const overlay = document.getElementById('selectionOverlay');
        if (!overlay) return;
        
        if (this._onMouseDown) overlay.removeEventListener('mousedown', this._onMouseDown);
        if (this._onMouseMove) overlay.removeEventListener('mousemove', this._onMouseMove);
        if (this._onMouseUp) overlay.removeEventListener('mouseup', this._onMouseUp);
        if (this._onMouseUp) overlay.removeEventListener('mouseleave', this._onMouseUp);
    },
    
    /**
     * Handle mouse down - start selection
     */
    onSelectionMouseDown(e) {
        if (!this.selectionMode.active) return;
        
        const overlay = document.getElementById('selectionOverlay');
        const rect = overlay.getBoundingClientRect();
        
        this.selectionMode.isSelecting = true;
        this.selectionMode.startX = e.clientX - rect.left;
        this.selectionMode.startDate = this.pixelToDate(this.selectionMode.startX);
        
        overlay.classList.add('selecting');
        
        // Initialize selection box
        const selectionBox = document.getElementById('selectionBox');
        selectionBox.style.left = this.selectionMode.startX + 'px';
        selectionBox.style.top = '0';
        selectionBox.style.width = '0';
        selectionBox.style.height = '100%';
        selectionBox.classList.add('visible');
    },
    
    /**
     * Handle mouse move - update selection
     */
    onSelectionMouseMove(e) {
        if (!this.selectionMode.isSelecting) return;
        
        const overlay = document.getElementById('selectionOverlay');
        const rect = overlay.getBoundingClientRect();
        const currentX = e.clientX - rect.left;
        
        // Update selection box
        const selectionBox = document.getElementById('selectionBox');
        const startX = this.selectionMode.startX;
        const left = Math.min(startX, currentX);
        const width = Math.abs(currentX - startX);
        
        selectionBox.style.left = left + 'px';
        selectionBox.style.width = width + 'px';
        
        // Update end date and tooltip
        this.selectionMode.endDate = this.pixelToDate(currentX);
        this.updateSelectionTooltip(e.clientX, e.clientY);
    },
    
    /**
     * Handle mouse up - finish selection
     */
    onSelectionMouseUp(e) {
        if (!this.selectionMode.isSelecting) return;
        
        const overlay = document.getElementById('selectionOverlay');
        overlay.classList.remove('selecting');
        
        this.selectionMode.isSelecting = false;
        
        // Hide tooltip
        const tooltip = document.getElementById('selectionTooltip');
        tooltip.style.display = 'none';
        
        // Hide selection box
        const selectionBox = document.getElementById('selectionBox');
        selectionBox.classList.remove('visible');
        
        // Check if we have a valid selection
        const startDate = this.selectionMode.startDate;
        const endDate = this.selectionMode.endDate;
        
        if (startDate && endDate && startDate !== endDate) {
            // Ensure start < end
            const [finalStart, finalEnd] = startDate < endDate 
                ? [startDate, endDate] 
                : [endDate, startDate];
            
            // Show confirmation modal
            this.showSubPeriodConfirmation(finalStart, finalEnd);
        }
        
        // Deactivate selection mode
        this.deactivateSelectionMode();
    },
    
    /**
     * Update the selection tooltip with current dates
     */
    updateSelectionTooltip(mouseX, mouseY) {
        const tooltip = document.getElementById('selectionTooltip');
        const startDateEl = document.getElementById('tooltipStartDate');
        const endDateEl = document.getElementById('tooltipEndDate');
        
        const startDate = this.selectionMode.startDate;
        const endDate = this.selectionMode.endDate;
        
        if (!startDate || !endDate) return;
        
        // Ensure correct order for display
        const [displayStart, displayEnd] = startDate < endDate 
            ? [startDate, endDate] 
            : [endDate, startDate];
        
        startDateEl.textContent = displayStart;
        endDateEl.textContent = displayEnd;
        
        // Position tooltip near mouse
        tooltip.style.display = 'block';
        tooltip.style.left = (mouseX + 15) + 'px';
        tooltip.style.top = (mouseY - 60) + 'px';
    },
    
    /**
     * Convert pixel X position to date
     * @param {number} pixelX - X position in pixels
     * @returns {string} Date string (YYYY-MM-DD)
     */
    pixelToDate(pixelX) {
        if (!this.instance || !this.selectionMode.equityCurve) return null;
        
        try {
            // Get the chart's x-axis range
            const layout = this.instance._fullLayout;
            if (!layout || !layout.xaxis) return null;
            
            const xaxis = layout.xaxis;
            const plotArea = layout._size;
            
            // Calculate the relative position within the plot area
            // Account for left margin
            const plotLeft = plotArea.l;
            const plotWidth = plotArea.w;
            
            // Clamp pixel position to plot area
            const relativeX = Math.max(0, Math.min(pixelX - plotLeft, plotWidth));
            const fraction = relativeX / plotWidth;
            
            // Get the date range from the equity curve
            const dates = this.selectionMode.equityCurve.map(d => d.date);
            const index = Math.round(fraction * (dates.length - 1));
            const clampedIndex = Math.max(0, Math.min(index, dates.length - 1));
            
            return dates[clampedIndex];
        } catch (error) {
            console.error('Error converting pixel to date:', error);
            return null;
        }
    },
    
    /**
     * Show the sub-period confirmation modal
     */
    showSubPeriodConfirmation(startDate, endDate) {
        const modal = document.getElementById('subPeriodConfirmModal');
        const startEl = document.getElementById('confirmStartDate');
        const endEl = document.getElementById('confirmEndDate');
        
        startEl.textContent = startDate;
        endEl.textContent = endDate;
        
        // Store for confirmation
        this.selectionMode.confirmedStart = startDate;
        this.selectionMode.confirmedEnd = endDate;
        
        modal.style.display = 'flex';
    },
    
    /**
     * Store equity curve data for date conversion
     */
    setEquityCurveData(equityCurve) {
        this.selectionMode.equityCurve = equityCurve;
    },
};

// Export for use in other modules
window.Chart = Chart;

