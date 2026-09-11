// js/map-fireworks.js - extracted verbatim from js/map.js
function flyToWithCallback(center, zoom, callback) {
    const onMoveEnd = () => {
        map.off('moveend', onMoveEnd); // Clean up listener
        callback();
    };
  
    map.on('moveend', onMoveEnd);
    map.flyTo(center, zoom, { animate: true, duration: 0.088 });
  }
  

const fireworks = new Fireworks.default($('#fireworks')[0], {
    traceSpeed: 2,
    traceLength: 3,
    opacity: 0.8,
    acceleration: 1.02,
    delay: {
        min: 50,
        max: 50
    },
    decay: {
        min: 0.007,
        max: 0.015
    },
    rocketsPoint: {
        min: 10,
        max: 90
    },
    lineWidth: {
        trace: {
            min: 0.5,
            max: 0.9
        }
    },
});

function launchFireworks(totalFireworks, currentCount = 0) {
    if (currentCount >= totalFireworks) return;

    // Random delay between 20 and 250ms
    const randomDelay = Math.floor(Math.random() * (250 - 20 + 1)) + 20;

    setTimeout(() => {
        fireworks.launch(1);
        launchFireworks(totalFireworks, currentCount + 1);
    }, randomDelay);
}

function shouldAutoLaunchFireworks() {
    const lastLaunch = localStorage.getItem('last-fireworks-launch');
    if (lastLaunch) {
        const elapsed = Date.now() - parseInt(lastLaunch);
        if (elapsed < 8 * 60 * 60 * 1000) return false;
    }
    localStorage.setItem('last-fireworks-launch', Date.now().toString());
    return true;
}

let fireworksTimeout;

let clickTimes = [];
const CLICKS_PER_SECOND_THRESHOLD = 5;
const CLICK_WINDOW_MS = 1000;

function trackClick() {
    const now = Date.now();
    clickTimes.push(now);
    
    clickTimes = clickTimes.filter(time => now - time <= CLICK_WINDOW_MS);
    
    const clicksPerSecond = clickTimes.length;
    
    if (clicksPerSecond >= CLICKS_PER_SECOND_THRESHOLD) {
        animatePikachu();
        clickTimes = [];
    }
}

// Add click event listener to the fireworks button
$('.shoot-fireworks').click(function() {
    trackClick();
    launchFireworks(12);
    $('.shoot-fireworks').css('background-color', '#ca45fa').css('color', '#f69ee0')
    if (fireworksTimeout) {
        clearTimeout(fireworksTimeout);
    }
    fireworksTimeout = setTimeout(() => {
        $('.shoot-fireworks').css('background-color', '').css('color', '')
        fireworksTimeout = null;
    }, 200);
});

// Close only the most recently opened panel (ESC ordering).
// Returns the closed panel identifier or null if nothing was closed.
function closeLatestPanel() {
    const times = window._panelOpenedAt || {};
    const open = [];
    if ($('.color-selection-modal').is(':visible')) open.push('color');
    if ($('.leave-feedback-wrapper').is(':visible')) open.push('feedback');
    if ($('.settings-panel').is(':visible')) open.push('settings');
    if ($('.info-panels-show-hide-wrapper').is(':visible')) open.push('info');
    if ($('.bus-info-popup, .stop-info-popup, .building-info-popup, .my-location-popup').is(':visible')) open.push('right');
    if (!open.length) {
        // Preserve legacy behavior: ESC also dismissed standalone search.
        if ($('.search-wrapper').is(':visible')) {
            closeSearch();
            return 'search';
        }
        return null;
    }
    // Newest first; ties break toward the most transient (color > feedback > right > info > settings).
    const priority = { color: 5, feedback: 4, right: 3, info: 2, settings: 1 };
    open.sort((a, b) => ((times[b] || 0) - (times[a] || 0)) || (priority[b] - priority[a]));
    const latest = open[0];
    if (latest === 'color') {
        $('.color-selection-modal').css('display', 'none');
    } else if (latest === 'feedback') {
        closeFeedbackModal();
    } else if (latest === 'right') {
        hideInfoBoxes();
    } else if (latest === 'info') {
        $('.info-panels-close').click();
    } else {
        closeSettingsPanel();
    }
    return latest;
}

$(document).on('keydown', function(e) {
    const isSettingsOpen = $('.settings-panel').is(':visible');
    const $settingsInput = $('#settings-search-input');

    if (isSettingsOpen) {
        const isControlK = (e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K');
        const isSlash = e.key === '/';
        const isInputFocused = $settingsInput.is(':focus');
        const isOtherInputFocused = $(e.target).is('input, textarea');

        if (isControlK) {
            e.preventDefault();
            $settingsInput.focus().select();
            return;
        }
        if (isSlash && !isInputFocused && !isOtherInputFocused) {
            e.preventDefault();
            $settingsInput.focus().select();
            return;
        }
    }

    if (e.key === 'Escape') {
        if ($('.chat-wrapper').is(':visible')) {
            e.preventDefault();
            if (typeof closeChat === 'function') {
                closeChat();
            } else {
                $('.chat-ui-close').click();
            }
            return;
        }

        // Close only the most recently opened panel, not everything at once.
        const closed = closeLatestPanel();
        if (!closed) return;

        e.preventDefault();

        // If only the feedback modal or color modal was closed, do not reset underlying map route/stops
        if (closed === 'feedback' || closed === 'color') {
            return;
        }

        if (settings['toggle-hide-other-routes'] && !shownRoute) {
            showAllStops();
            showAllBuses();
            showAllPolylines();
        } else if (settings['toggle-hide-other-routes'] && shownRoute) {
            for (const marker in busMarkers) {
                if (busData[marker].route === shownRoute) {
                    busMarkers[marker].setVisibility(true);
                }
            }
        }

        if (!shownRoute) {
            clearAllStopEtas(); // here instead of in hideInfoBoxes(); so fitting map btn doesn't hide them
        } else {
            updateTooltips(shownRoute);
        }

        // Temporarily commented out: fly back to previous camera position
        /*
        if (savedCenter && settings['toggle-hide-other-routes']) {
            returningToSavedView = true;
            flyToWithCallback(savedCenter, savedZoom, () => {
                returningToSavedView = false;
                savedCenter = null;
                savedZoom = null;
            });
        }
        */
        savedCenter = null;
        savedZoom = null;

    }
})
