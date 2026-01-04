/**
 * Utility functions for Portfolio Viewer
 */

const Utils = {
    /**
     * Format a number as percentage
     * @param {number} value - Value to format (e.g., 0.125 for 12.5%)
     * @param {number} decimals - Decimal places
     * @returns {string} Formatted percentage string
     */
    formatPercent(value, decimals = 2) {
        if (value === null || value === undefined || isNaN(value)) {
            return '--';
        }
        const percent = value * 100;
        const sign = percent >= 0 ? '+' : '';
        return `${sign}${percent.toFixed(decimals)}%`;
    },

    /**
     * Format a number with specified decimals
     * @param {number} value - Value to format
     * @param {number} decimals - Decimal places
     * @returns {string} Formatted number string
     */
    formatNumber(value, decimals = 2) {
        if (value === null || value === undefined || isNaN(value)) {
            return '--';
        }
        return value.toFixed(decimals);
    },

    /**
     * Format a date object or string to ISO date string
     * @param {Date|string} date - Date to format
     * @returns {string} ISO date string (YYYY-MM-DD)
     */
    formatDate(date) {
        if (!date) return '';
        const d = new Date(date);
        return d.toISOString().split('T')[0];
    },

    /**
     * Format a date range for display
     * @param {string} start - Start date
     * @param {string} end - End date
     * @returns {string} Formatted range string
     */
    formatDateRange(start, end) {
        return `${start} to ${end}`;
    },

    /**
     * Parse a date string to Date object
     * @param {string} dateStr - Date string (YYYY-MM-DD)
     * @returns {Date} Date object
     */
    parseDate(dateStr) {
        return new Date(dateStr + 'T00:00:00');
    },

    /**
     * Get today's date as ISO string
     * @returns {string} Today's date (YYYY-MM-DD)
     */
    today() {
        return this.formatDate(new Date());
    },

    /**
     * Get date N years ago
     * @param {number} years - Number of years back
     * @returns {string} Date string (YYYY-MM-DD)
     */
    yearsAgo(years) {
        const date = new Date();
        date.setFullYear(date.getFullYear() - years);
        return this.formatDate(date);
    },

    /**
     * Debounce function calls
     * @param {Function} func - Function to debounce
     * @param {number} wait - Wait time in ms
     * @returns {Function} Debounced function
     */
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    /**
     * Throttle function calls
     * @param {Function} func - Function to throttle
     * @param {number} limit - Time limit in ms
     * @returns {Function} Throttled function
     */
    throttle(func, limit) {
        let inThrottle;
        return function executedFunction(...args) {
            if (!inThrottle) {
                func(...args);
                inThrottle = true;
                setTimeout(() => (inThrottle = false), limit);
            }
        };
    },

    /**
     * Generate a unique ID
     * @returns {string} Unique ID string
     */
    generateId() {
        return `id_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    },

    /**
     * Normalize weights to sum to 1.0
     * @param {Object} weights - Object of ticker -> weight
     * @returns {Object} Normalized weights
     */
    normalizeWeights(weights) {
        const total = Object.values(weights).reduce((sum, w) => sum + w, 0);
        if (total === 0) {
            const n = Object.keys(weights).length;
            const equalWeight = n > 0 ? 1 / n : 0;
            return Object.fromEntries(
                Object.keys(weights).map(k => [k, equalWeight])
            );
        }
        return Object.fromEntries(
            Object.entries(weights).map(([k, v]) => [k, v / total])
        );
    },

    /**
     * Check if weights sum to approximately 1.0
     * @param {Object} weights - Object of ticker -> weight
     * @param {number} tolerance - Acceptable deviation
     * @returns {boolean} True if valid
     */
    validateWeights(weights, tolerance = 0.01) {
        const total = Object.values(weights).reduce((sum, w) => sum + w, 0);
        return Math.abs(total - 1.0) <= tolerance;
    },

    /**
     * Deep clone an object
     * @param {Object} obj - Object to clone
     * @returns {Object} Cloned object
     */
    deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    },

    /**
     * Show loading overlay
     * @param {string} message - Loading message
     */
    showLoading(message = 'Loading...') {
        const overlay = document.getElementById('loadingOverlay');
        const msgEl = document.getElementById('loadingMessage');
        if (overlay && msgEl) {
            msgEl.textContent = message;
            overlay.style.display = 'flex';
        }
    },

    /**
     * Hide loading overlay
     */
    hideLoading() {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
    },

    /**
     * Update status message
     * @param {string} message - Status message
     * @param {string} type - Message type ('info', 'success', 'error')
     */
    setStatus(message, type = 'info') {
        const statusEl = document.getElementById('statusMessage');
        if (statusEl) {
            statusEl.textContent = message;
            statusEl.className = `status-message status-${type}`;
        }
    },

    /**
     * Set API connection status
     * @param {boolean} connected - Connection status
     */
    setApiStatus(connected) {
        const dot = document.getElementById('apiStatus');
        if (dot) {
            dot.className = `status-dot ${connected ? 'connected' : 'disconnected'}`;
        }
    },

    /**
     * Show a toast notification (simple implementation)
     * @param {string} message - Notification message
     * @param {string} type - Type ('success', 'error', 'info')
     */
    toast(message, type = 'info') {
        // For now, just update status bar
        this.setStatus(message, type);
        
        // Auto-clear after 5 seconds
        setTimeout(() => {
            this.setStatus('Ready', 'info');
        }, 5000);
    },

    /**
     * Calculate number of days between two dates
     * @param {string} start - Start date string
     * @param {string} end - End date string
     * @returns {number} Number of days
     */
    daysBetween(start, end) {
        const startDate = this.parseDate(start);
        const endDate = this.parseDate(end);
        const diffTime = Math.abs(endDate - startDate);
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    },

    /**
     * Format large numbers with K/M/B suffixes
     * @param {number} value - Value to format
     * @returns {string} Formatted string
     */
    formatCompact(value) {
        if (value === null || value === undefined) return '--';
        
        const absValue = Math.abs(value);
        if (absValue >= 1e9) {
            return (value / 1e9).toFixed(1) + 'B';
        }
        if (absValue >= 1e6) {
            return (value / 1e6).toFixed(1) + 'M';
        }
        if (absValue >= 1e3) {
            return (value / 1e3).toFixed(1) + 'K';
        }
        return value.toFixed(2);
    }
};

// Export for use in other modules
window.Utils = Utils;

