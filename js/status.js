// Status tracking variables
let lastPassioResponse = 0;
let lastRubusResponse = 0;
let lastPassioResponseTime = 0;
let lastRubusResponseTime = 0;
let statusUpdateInterval = null;
let rubusRequestsFailing = false;

function getWebSocketStatusText(ws) {
    if (!ws) return "Not Available";

    switch (ws.readyState) {
        case WebSocket.CONNECTING:
            return "Connecting";
        case WebSocket.OPEN:
            return "Connected";
        case WebSocket.CLOSING:
            return "Closing";
        case WebSocket.CLOSED:
            return "Disconnected";
        default:
            return "Unknown";
    }
}

function updateStatusDisplay() {
    const pollDelay = 5000; // 5 seconds
    const pollDelayBuffer = 1000; // 1 second buffer

    const passioOnline = isServerOnline(lastPassioResponse, pollDelay, pollDelayBuffer);

    // For RUBus, we don't poll regularly like Passio
    // Instead, we rely on request failure tracking - if requests fail, it's offline
    // If we have any successful response and no failures, it's online
    const rubusOnline = rubusRequestsFailing ? false : (lastRubusResponse > 0);

    // Check WebSocket connection states (these may be undefined if not loaded yet)
    let passioWsText = "Loading...";
    let rubusWsText = "Loading...";
    let passioWsConnected = false;
    let rubusWsConnected = false;

    // Check Passio WebSocket
    try {
        passioWsText = getWebSocketStatusText(window.wsClient.ws);
        passioWsConnected = window.wsClient.ws.readyState === WebSocket.OPEN;
        console.log('Passio WebSocket state:', window.wsClient.ws.readyState, 'Status:', passioWsText);
    } catch (e) {
        console.log('Error checking Passio WebSocket:', e);
        passioWsText = "Loading...";
    }

    // Check RUBus WebSocket
    try {
        rubusWsText = getWebSocketStatusText(window.socket);
        rubusWsConnected = window.socket.readyState === WebSocket.OPEN;
        console.log('RUBus WebSocket state:', window.socket.readyState, 'Status:', rubusWsText);
    } catch (e) {
        console.log('Error checking RUBus WebSocket:', e);
        rubusWsText = "Loading...";
    }

    const passioTimeAgo = getTimeAgoString(lastPassioResponseTime);
    const rubusTimeAgo = getTimeAgoString(lastRubusResponseTime);

    const onlineColor = '#10b981';
    const offlineColor = '#ef4444';
    const wsColor = '#6366f1'; // Blue for WebSocket status

    // Display polling status (top row)
    $('.passio-status').text(`Passio ${passioOnline ? 'Online' : 'Offline'} (-${passioTimeAgo})`).css('color', passioOnline ? onlineColor : offlineColor);
    $('.rubus-status').text(`RUBus ${rubusOnline ? 'Online' : 'Offline'} (-${rubusTimeAgo})`).css('color', rubusOnline ? onlineColor : offlineColor);

    // Display WebSocket status (bottom row)
    $('.passio-ws-status').text(`Passio WS ${passioWsConnected ? 'Connected' : 'Disconnected'}`).css('color', passioWsConnected ? wsColor : offlineColor);
    $('.rubus-ws-status').text(`RUBus WS ${rubusWsConnected ? 'Connected' : 'Disconnected'}`).css('color', rubusWsConnected ? wsColor : offlineColor);
}

function updatePassioResponseTime() {
    const now = Date.now();
    lastPassioResponse = now;
    lastPassioResponseTime = now;
}

function updateRubusResponseTime() {
    const now = Date.now();
    lastRubusResponse = now;
    lastRubusResponseTime = now;
    rubusRequestsFailing = false; // Successful response means server is working
}

function markRubusRequestsFailing() {
    rubusRequestsFailing = true;
}

function getTimeAgoString(timestamp) {
    if (timestamp === 0) return "Never";

    const now = Date.now();
    const secondsAgo = Math.floor((now - timestamp) / 1000);

    if (secondsAgo < 60) {
        return `${secondsAgo}s`;
    } else if (secondsAgo < 3600) {
        const minutes = Math.floor(secondsAgo / 60);
        const remainingSeconds = secondsAgo % 60;
        return `${minutes}m ${remainingSeconds}s`;
    } else {
        const hours = Math.floor(secondsAgo / 3600);
        const remainingMinutes = Math.floor((secondsAgo % 3600) / 60);
        return `${hours}h ${remainingMinutes}m`;
    }
}

function isServerOnline(lastResponse, pollInterval, buffer) {
    if (lastResponse === 0) return false;
    const now = Date.now();
    return (now - lastResponse) <= (pollInterval + buffer);
}

function showStatus() {
    // Stop any existing status updates to ensure clean state
    stopStatusUpdates();

    // Check if status wrapper is currently displayed (not hidden)
    const statusWrapper = $('.status-wrapper');
    const isCurrentlyVisible = statusWrapper.css('display') !== 'none' && !statusWrapper.hasClass('none');

    if (isCurrentlyVisible) {
        // Toggle behavior: if already visible, hide and unselect
        statusWrapper.hide();
        $('.status').removeClass('footer-selected');
        $('.errors-wrapper').hide();
        $('.errors-tab').removeClass('footer-selected');
        return;
    }

    // Remove footer tab selection from other tabs
    $('.contact').removeClass('footer-selected');
    $('.changelog').removeClass('footer-selected');
    $('.errors-tab').removeClass('footer-selected');

    // Hide other wrappers
    $('.footer-contact-wrapper').hide();
    $('.footer-contact-loading').hide();
    $('.changelog-wrapper').hide();
    $('.errors-wrapper').hide();

    // Update display immediately
    updateStatusDisplay();

    // Start real-time updates every second
    statusUpdateInterval = setInterval(updateStatusDisplay, 1000);

    // Show status wrapper and add selection class
    statusWrapper.show();
    $('.status').addClass('footer-selected');
}

function stopStatusUpdates() {
    if (statusUpdateInterval) {
        clearInterval(statusUpdateInterval);
        statusUpdateInterval = null;
    }
}