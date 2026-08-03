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

$(document).on('keydown', function(e) {
    const isSettingsOpen = $('.settings-panel').is(':visible');
    const $settingsInput = $('#settings-search-input');

    if (isSettingsOpen) {
        const isControlK = (e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K');
        const isSlash = e.key === '/';
        const isInputFocused = $settingsInput.is(':focus');
        const isOtherInputFocused = $(e.target).is('input, textarea');

        if ((isControlK || isSlash) && !isInputFocused && !isOtherInputFocused) {
            e.preventDefault();
            $settingsInput.focus().select();
            return;
        }
    }

    if (e.key === 'Escape') {
        hideInfoBoxes();
        $('.settings-panel').fadeOut('fast');
        $('.bottom').fadeIn('fast'); // this is being hidden due to settings-btn click?... Why tho
        if (typeof detachSettingsViewportListeners === 'function') {
            detachSettingsViewportListeners();
        }
        $('.settings-floating-bar').hide();
        stopStatusUpdates();

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
            $('[stop-eta]').text('').hide(); // here instead of in hideInfoBoxes(); so fitting map btn doesn't hide them
        } else {
            updateTooltips(shownRoute);
        }

        if (savedCenter && settings['toggle-hide-other-routes']) {
            returningToSavedView = true;
            flyToWithCallback(savedCenter, savedZoom, () => {
                returningToSavedView = false;
                savedCenter = null;
                savedZoom = null;
            });
        }

    }
})
