/**
 * UI Manager for Portfolio Calculator
 * Handles all UI rendering and interactions
 */

const CalculatorUI = {
    // =========================================================================
    // Data Status
    // =========================================================================
    
    /**
     * Update data status indicator
     * @param {string} status - 'checking', 'fresh', 'updating', 'stale', 'error'
     * @param {string} text - Status text
     */
    updateDataStatus(status, text) {
        const icon = document.getElementById('dataStatusIcon');
        const textEl = document.getElementById('dataStatusText');
        
        if (icon) {
            icon.className = 'status-icon ' + status;
        }
        if (textEl) {
            textEl.textContent = text;
        }
    },
    
    // =========================================================================
    // Assets List
    // =========================================================================
    
    /**
     * Render the assets list
     */
    renderAssetsList() {
        const container = document.getElementById('assetsList');
        const assets = CalculatorState.assets;
        
        if (assets.length === 0) {
            container.innerHTML = '<p class="empty-state">No assets added yet</p>';
            this.updateTotalWeight();
            this.renderHoldingsList();
            return;
        }
        
        container.innerHTML = assets.map(asset => {
            const price = CalculatorState.prices[asset.ticker];
            const priceStr = price ? `$${price.price.toFixed(2)}` : 'Loading...';
            
            return `
                <div class="asset-row" data-ticker="${asset.ticker}">
                    <span class="asset-ticker">${asset.ticker}</span>
                    <input type="number" class="asset-weight-input" 
                           value="${(asset.weight * 100).toFixed(1)}" 
                           min="0" max="100" step="0.1"
                           onchange="Calculator.onWeightChange('${asset.ticker}', this.value)">
                    <span>%</span>
                    <span class="asset-price">${priceStr}</span>
                    <button class="remove-asset-btn" onclick="Calculator.removeAsset('${asset.ticker}')">&times;</button>
                </div>
            `;
        }).join('');
        
        this.updateTotalWeight();
        this.renderHoldingsList();
    },
    
    /**
     * Update total weight display
     */
    updateTotalWeight() {
        const totalEl = document.getElementById('totalWeight');
        const total = CalculatorState.getTotalWeight();
        const percentage = (total * 100).toFixed(1);
        
        if (totalEl) {
            totalEl.textContent = `${percentage}%`;
            totalEl.className = 'weight-value' + (Math.abs(total - 1) > 0.01 ? ' invalid' : '');
        }
    },
    
    /**
     * Render holdings inputs
     */
    renderHoldingsList() {
        const container = document.getElementById('holdingsList');
        const assets = CalculatorState.assets;
        
        if (assets.length === 0) {
            container.innerHTML = '<p class="empty-state">Add assets first</p>';
            return;
        }
        
        container.innerHTML = assets.map(asset => `
            <div class="holding-row">
                <span class="holding-ticker">${asset.ticker}</span>
                <input type="number" class="holding-input" 
                       value="${asset.currentShares}" 
                       min="0" step="1"
                       onchange="Calculator.onHoldingChange('${asset.ticker}', this.value)">
                <span>shares</span>
            </div>
        `).join('');
    },
    
    // =========================================================================
    // Position Summary
    // =========================================================================
    
    /**
     * Render position summary table
     * @param {Object} positions - Position data
     */
    renderPositionSummary(positions) {
        const card = document.getElementById('positionSummary');
        const tbody = document.querySelector('#positionTable tbody');
        
        if (!positions || Object.keys(positions).length <= 1) {
            card.style.display = 'none';
            return;
        }
        
        card.style.display = 'block';
        
        const rows = [];
        for (const [ticker, pos] of Object.entries(positions)) {
            if (ticker === '_totals') continue;
            
            rows.push(`
                <tr>
                    <td>${ticker}</td>
                    <td>${(pos.weight * 100).toFixed(1)}%</td>
                    <td>$${pos.price.toFixed(2)}</td>
                    <td>$${pos.targetDollar.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                    <td>${pos.targetShares.toLocaleString()}</td>
                    <td>$${pos.actualDollar.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                </tr>
            `);
        }
        
        tbody.innerHTML = rows.join('');
        
        // Update totals
        const totals = positions._totals;
        document.getElementById('totalWeightResult').textContent = '100%';
        document.getElementById('totalTargetDollar').textContent = 
            '$' + totals.targetDollar.toLocaleString(undefined, { maximumFractionDigits: 0 });
        document.getElementById('totalActualDollar').textContent = 
            '$' + totals.actualDollar.toLocaleString(undefined, { maximumFractionDigits: 0 });
    },
    
    // =========================================================================
    // Trade Orders
    // =========================================================================
    
    /**
     * Render trade orders
     * @param {Object} ordersData - {orders, totals}
     */
    renderTradeOrders(ordersData) {
        const card = document.getElementById('tradeOrders');
        const container = document.getElementById('tradeOrdersList');
        
        if (!ordersData || ordersData.orders.length === 0) {
            card.style.display = 'none';
            return;
        }
        
        // Check if there are any actual trades
        const actualTrades = ordersData.orders.filter(o => o.action !== 'HOLD');
        
        if (actualTrades.length === 0) {
            card.style.display = 'block';
            container.innerHTML = '<p class="no-trades">No trades needed - portfolio is balanced</p>';
            return;
        }
        
        card.style.display = 'block';
        
        container.innerHTML = ordersData.orders.map(order => {
            if (order.action === 'HOLD') return '';
            
            return `
                <div class="trade-order">
                    <span class="trade-action ${order.action.toLowerCase()}">${order.action}</span>
                    <span class="trade-ticker">${order.ticker}</span>
                    <span class="trade-details">
                        ${order.shares.toLocaleString()} shares @ $${order.price.toFixed(2)}
                    </span>
                    <span class="trade-value">$${order.tradeValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </div>
            `;
        }).filter(Boolean).join('');
        
        // Add summary
        if (ordersData.totals.netCashFlow !== 0) {
            const flowType = ordersData.totals.netCashFlow > 0 ? 'receive' : 'spend';
            const flowAmount = Math.abs(ordersData.totals.netCashFlow);
            container.innerHTML += `
                <div class="trade-order" style="margin-top: var(--spacing-sm); border-top: 1px solid var(--color-border); padding-top: var(--spacing-sm);">
                    <span class="trade-details">Net cash ${flowType}:</span>
                    <span class="trade-value ${flowType === 'receive' ? 'positive' : 'negative'}">
                        $${flowAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </span>
                </div>
            `;
        }
    },
    
    // =========================================================================
    // Risk Metrics
    // =========================================================================
    
    /**
     * Render risk metrics
     * @param {Object} metrics - Risk metrics
     */
    renderRiskMetrics(metrics) {
        const card = document.getElementById('riskMetrics');
        
        if (!metrics) {
            card.style.display = 'none';
            return;
        }
        
        card.style.display = 'block';
        
        // Format percentages
        const formatPct = (val) => (val * 100).toFixed(2) + '%';
        const formatMoney = (val) => '-$' + val.toLocaleString(undefined, { maximumFractionDigits: 0 });
        
        document.getElementById('expectedReturn').textContent = formatPct(metrics.annualizedReturn);
        document.getElementById('expectedReturn').className = 
            'metric-value ' + (metrics.annualizedReturn >= 0 ? 'positive' : 'negative');
        
        document.getElementById('volatility').textContent = formatPct(metrics.annualizedVolatility);
        
        document.getElementById('sharpeRatio').textContent = metrics.sharpeRatio.toFixed(2);
        document.getElementById('sharpeRatio').className = 
            'metric-value ' + (metrics.sharpeRatio >= 0 ? 'positive' : 'negative');
        
        document.getElementById('riskFreeRate').textContent = formatPct(metrics.riskFreeRate);
        
        document.getElementById('var95').textContent = formatMoney(metrics.var95_30d);
        document.getElementById('var99').textContent = formatMoney(metrics.var99_30d);
    },
    
    // =========================================================================
    // Projection
    // =========================================================================
    
    /**
     * Render projection summary
     * @param {Object} projection - Projection data (360d projection)
     */
    renderProjectionSummary(projection) {
        const card = document.getElementById('projectionCard');
        
        if (!projection) {
            card.style.display = 'none';
            return;
        }
        
        card.style.display = 'flex';
        
        const formatMoney = (val) => '$' + val.toLocaleString(undefined, { maximumFractionDigits: 0 });
        
        document.getElementById('projCurrentValue').textContent = formatMoney(projection.currentValue);
        document.getElementById('projExpectedValue').textContent = formatMoney(projection.expectedValue);
        document.getElementById('projRange95').textContent = 
            `${formatMoney(projection.intervals.p95.low)} - ${formatMoney(projection.intervals.p95.high)}`;
        
        // Reset to distribution view by default
        Projection.switchView('distribution');
    },
    
    // =========================================================================
    // Collapsible Sections
    // =========================================================================
    
    /**
     * Toggle collapsible section
     * @param {string} sectionId - Section element ID
     */
    toggleSection(sectionId) {
        const section = document.getElementById(sectionId);
        const parent = section?.closest('.collapsible');
        
        if (parent) {
            parent.classList.toggle('expanded');
        }
    },
    
    // =========================================================================
    // Status & Loading
    // =========================================================================
    
    /**
     * Show loading overlay
     * @param {string} text - Loading text
     */
    showLoading(text = 'Loading...') {
        const overlay = document.getElementById('loadingOverlay');
        const textEl = document.getElementById('loadingText');
        
        if (textEl) textEl.textContent = text;
        if (overlay) overlay.style.display = 'flex';
    },
    
    /**
     * Hide loading overlay
     */
    hideLoading() {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) overlay.style.display = 'none';
    },
    
    /**
     * Update status bar
     * @param {string} text - Status text
     */
    updateStatus(text) {
        const statusEl = document.getElementById('statusText');
        if (statusEl) statusEl.textContent = text;
    },
    
    /**
     * Update last calculated time
     */
    updateLastCalculated() {
        const el = document.getElementById('lastCalculated');
        if (el) {
            el.textContent = 'Last calculated: ' + new Date().toLocaleTimeString();
        }
    },
    
    /**
     * Show toast notification
     * @param {string} message - Toast message
     * @param {string} type - Toast type ('success', 'error', 'info')
     */
    toast(message, type = 'info') {
        // Use existing Utils.toast if available
        if (typeof Utils !== 'undefined' && Utils.toast) {
            Utils.toast(message, type);
        } else {
            console.log(`[${type.toUpperCase()}] ${message}`);
        }
    },
    
    // =========================================================================
    // Form Values
    // =========================================================================
    
    /**
     * Get target cash from input
     * @returns {number} Target cash value
     */
    getTargetCash() {
        const input = document.getElementById('targetCash');
        return parseFloat(input?.value) || 100000;
    },
    
    /**
     * Get lookback window from input
     * @returns {number} Lookback window in days
     */
    getLookbackWindow() {
        const input = document.getElementById('lookbackWindow');
        return parseInt(input?.value) || 252;
    },
    
    /**
     * Get leverage rate from input
     * @returns {number} Leverage rate (1 = no leverage)
     */
    getLeverageRate() {
        const input = document.getElementById('leverageRate');
        return parseFloat(input?.value) || 1;
    },
    
    /**
     * Get new asset input values
     * @returns {Object} {ticker, weight}
     */
    getNewAssetInput() {
        const tickerInput = document.getElementById('assetTickerInput');
        const weightInput = document.getElementById('assetWeightInput');
        
        return {
            ticker: tickerInput?.value.toUpperCase().trim() || '',
            weight: (parseFloat(weightInput?.value) || 0) / 100,
        };
    },
    
    /**
     * Clear new asset inputs
     */
    clearNewAssetInput() {
        const tickerInput = document.getElementById('assetTickerInput');
        const weightInput = document.getElementById('assetWeightInput');
        
        if (tickerInput) tickerInput.value = '';
        if (weightInput) weightInput.value = '25';
    },
    
    /**
     * Initialize UI with current state
     */
    init() {
        // Set initial values from state
        const targetInput = document.getElementById('targetCash');
        const lookbackInput = document.getElementById('lookbackWindow');
        const leverageInput = document.getElementById('leverageRate');
        
        if (targetInput) targetInput.value = CalculatorState.config.targetCash;
        if (lookbackInput) lookbackInput.value = CalculatorState.config.lookbackWindow;
        if (leverageInput) leverageInput.value = CalculatorState.config.leverageRate || 1;
        
        // Render assets
        this.renderAssetsList();
    },
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CalculatorUI;
}

