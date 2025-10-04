// Global error tracking system
class ErrorTracker {
    constructor() {
        this.errors = [];
        this.isErrorPanelVisible = false;
        this.maxErrors = 100; // Limit to prevent memory issues
        this.init();
    }

    init() {
        // Capture unhandled JavaScript errors
        window.addEventListener('error', (event) => {
            this.addError({
                type: 'JavaScript Error',
                message: event.message,
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno,
                stack: event.error ? event.error.stack : null,
                timestamp: new Date()
            });
        });

        // Capture unhandled promise rejections
        window.addEventListener('unhandledrejection', (event) => {
            this.addError({
                type: 'Unhandled Promise Rejection',
                message: event.reason ? event.reason.toString() : 'Unknown rejection',
                stack: event.reason && event.reason.stack ? event.reason.stack : null,
                timestamp: new Date()
            });
        });

        // Capture console errors (if console.error is used)
        this.interceptConsoleError();

        // Bind events
        this.bindEvents();
    }

    interceptConsoleError() {
        const originalConsoleError = console.error;
        const originalConsoleWarn = console.warn;
        const self = this;

        console.error = function(...args) {
            // Call original console.error
            originalConsoleError.apply(console, args);

            // Also track in our error system with better error handling
            const message = args.map(arg => {
                if (arg instanceof Error) {
                    // Handle Error objects specially
                    return `${arg.name}: ${arg.message}${arg.stack ? '\n' + arg.stack : ''}`;
                } else if (typeof arg === 'object') {
                    // Try to get useful information from objects
                    try {
                        if (arg.message) return arg.message;
                        if (arg.toString) return arg.toString();
                        return JSON.stringify(arg, Object.getOwnPropertyNames(arg), 2);
                    } catch {
                        return String(arg);
                    }
                }
                return String(arg);
            }).join(' ');

            self.addError({
                type: 'Console Error',
                message: message,
                timestamp: new Date()
            });
        };

        console.warn = function(...args) {
            // Call original console.warn
            originalConsoleWarn.apply(console, args);

            // Also track in our warning system
            const message = args.map(arg => {
                if (arg instanceof Error) {
                    // Handle Error objects specially
                    return `${arg.name}: ${arg.message}${arg.stack ? '\n' + arg.stack : ''}`;
                } else if (typeof arg === 'object') {
                    // Try to get useful information from objects
                    try {
                        if (arg.message) return arg.message;
                        if (arg.toString) return arg.toString();
                        return JSON.stringify(arg, Object.getOwnPropertyNames(arg), 2);
                    } catch {
                        return String(arg);
                    }
                }
                return String(arg);
            }).join(' ');

            self.addError({
                type: 'Console Warning',
                message: message,
                timestamp: new Date()
            });
        };
    }

    addError(errorInfo) {
        const error = {
            id: Date.now() + Math.random(),
            type: errorInfo.type || 'Unknown Error',
            message: errorInfo.message || 'No message',
            filename: errorInfo.filename || 'Unknown file',
            lineno: errorInfo.lineno || 0,
            colno: errorInfo.colno || 0,
            stack: errorInfo.stack || null,
            timestamp: errorInfo.timestamp || new Date()
        };

        console.log('Adding error:', error);

        this.errors.unshift(error); // Add to beginning for newest first

        // Limit number of stored errors
        if (this.errors.length > this.maxErrors) {
            this.errors = this.errors.slice(0, this.maxErrors);
        }

        // Update error count in tab
        this.updateErrorCount();
        
        // Auto-show error panel if it's currently visible
        if (this.isErrorPanelVisible) {
            this.renderErrors();
        }

        // Also log to console for debugging
        console.warn('Error tracked:', error);
    }

    updateErrorCount() {
        const errorTab = document.getElementById('errors-tab');
        const countElement = document.getElementById('error-count');
        
        console.log('Updating error count:', this.errors.length);
        console.log('Error tab found:', errorTab);
        console.log('Count element found:', countElement);
        
        if (errorTab && countElement) {
            countElement.textContent = this.errors.length;
            // Always show the errors tab, only show/hide the count badge
            errorTab.style.display = 'block';
            countElement.style.display = this.errors.length > 0 ? 'inline' : 'none';
            console.log('Error count updated to:', this.errors.length);
        } else {
            console.error('Error tab or count element not found!');
        }
    }


    renderErrorsHTML() {
        if (this.errors.length === 0) {
            return '<div class="error-empty">No errors recorded</div>';
        }

        return this.errors.map(error => {
            const timeStr = this.formatTimestamp(error.timestamp);
            return `
                <div class="error-item">
                    <div class="error-time">${timeStr}</div>
                    <div class="error-content">
                        <div class="error-type" data-type="${error.type}">${error.type}</div>
                        <div class="error-message">${this.escapeHtml(error.message)}</div>
                        ${error.filename !== 'Unknown file' ? `<div class="error-location">${error.filename}:${error.lineno}:${error.colno}</div>` : ''}
                        ${error.stack ? `<div class="error-stack" onclick="this.classList.toggle('expanded')">Stack trace (click to expand)</div><pre class="error-stack-content">${this.escapeHtml(error.stack)}</pre>` : ''}
                    </div>
                </div>
            `;
        }).join('');
    }

    renderErrors() {
        const errorList = document.getElementById('error-list');
        if (errorList) {
            errorList.innerHTML = this.renderErrorsHTML();
        }
        
        // Also update the panel title with current error count
        const errorPanelTitle = document.querySelector('.error-panel-title');
        if (errorPanelTitle) {
            errorPanelTitle.textContent = `JavaScript Errors (${this.errors.length})`;
        }
    }

    formatTimestamp(timestamp) {
        const date = new Date(timestamp);
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const seconds = date.getSeconds().toString().padStart(2, '0');
        const ms = date.getMilliseconds().toString().padStart(3, '0');
        return `${hours}:${minutes}:${seconds}.${ms}`;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    bindEvents() {
        // Bind error tab click
        const errorTab = document.getElementById('errors-tab');
        if (errorTab) {
            errorTab.addEventListener('click', () => {
                this.toggleErrorPanel();
            });
        }
    }

    toggleErrorPanel() {
        const errorsWrapper = document.querySelector('.errors-wrapper');
        if (!errorsWrapper) return;

        this.isErrorPanelVisible = !this.isErrorPanelVisible;

        if (this.isErrorPanelVisible) {
            this.renderErrors();
            // Hide other panels when showing errors
            $('.footer-contact-wrapper').hide();
            $('.footer-contact-loading').hide();
            $('.contact').removeClass('footer-selected');
            $('.changelog-wrapper').hide();
            $('.changelog').removeClass('footer-selected');
            $('.status-wrapper').hide();
            $('.status').removeClass('footer-selected');
            stopStatusUpdates();

            errorsWrapper.classList.remove('none');
            errorsWrapper.classList.add('error-panel-visible');
            $('.errors-tab').addClass('footer-selected');
        } else {
            errorsWrapper.classList.add('none');
            errorsWrapper.classList.remove('error-panel-visible');
            $('.errors-tab').removeClass('footer-selected');
        }
    }


    // Public method to manually add errors
    trackError(errorInfo) {
        this.addError(errorInfo);
    }
}

// Initialize error tracker when DOM is ready
let errorTracker;
document.addEventListener('DOMContentLoaded', () => {
    errorTracker = new ErrorTracker();
    // Make error tracker globally available
    window.errorTracker = errorTracker;
    console.log('Error tracker initialized:', errorTracker);
});
