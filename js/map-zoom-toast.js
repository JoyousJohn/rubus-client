// js/map-zoom-toast.js - extracted verbatim from js/map.js
function updateZoomToast() {
    if (!map) return;
    const $toast = $('.zoom-toast');
    if (settings['toggle-show-zoom-toast']) {
        $toast.text('ZOOM ' + Math.round(map.getZoom() * 10) / 10);
        $toast.stop(true, true).fadeIn();
    } else {
        $toast.stop(true, true).fadeOut();
    }
}

let fpsRafId = null;
let fpsFrameCount = 0;
let fpsLastTime = performance.now();

let fpsMin = Infinity;
let fpsMax = 0;
let fpsTotalSamples = 0;
let fpsSum = 0;

function resetFpsStats() {
    fpsMin = Infinity;
    fpsMax = 0;
    fpsTotalSamples = 0;
    fpsSum = 0;
}

const RESET_BTN_HTML = `| <span class="fps-reset-btn pointer" title="Reset FPS stats" style="cursor: pointer; user-select: none; color: #93c5fd;">Reset</span>`;

function updateFpsCounter() {
    if (typeof settings === 'undefined' || !settings['toggle-show-fps']) {
        stopFpsCounter();
        return;
    }

    fpsFrameCount++;
    const now = performance.now();
    const elapsed = now - fpsLastTime;

    if (elapsed >= 500) {
        const currentFps = Math.round((fpsFrameCount * 1000) / elapsed);

        fpsMin = Math.min(fpsMin, currentFps);
        fpsMax = Math.max(fpsMax, currentFps);
        fpsSum += currentFps;
        fpsTotalSamples++;
        const avgFps = Math.round(fpsSum / fpsTotalSamples);

        const html = `${currentFps} FPS | Min: ${fpsMin} | Avg: ${avgFps} | Max: ${fpsMax} ${RESET_BTN_HTML}`;
        $('.fps-toast').html(html).stop(true, true).fadeIn();

        fpsFrameCount = 0;
        fpsLastTime = now;
    }

    fpsRafId = requestAnimationFrame(updateFpsCounter);
}

function startFpsCounter() {
    if (fpsRafId) return;
    resetFpsStats();
    fpsFrameCount = 0;
    fpsLastTime = performance.now();
    $('.fps-toast').html(`-- FPS | Min: -- | Avg: -- | Max: -- ${RESET_BTN_HTML}`).stop(true, true).fadeIn();
    fpsRafId = requestAnimationFrame(updateFpsCounter);
}

function stopFpsCounter() {
    if (fpsRafId) {
        cancelAnimationFrame(fpsRafId);
        fpsRafId = null;
    }
    resetFpsStats();
    $('.fps-toast').stop(true, true).fadeOut();
}

// Prevent map drag/pan when interacting with toast elements
$(document).on('mousedown mouseup mousemove touchstart touchend touchmove pointerdown pointerup pointermove', '.zoom-toast, .fps-toast, .pixel-ratio-toast', function(e) {
    e.stopPropagation();
});

let resetBgTimeout = null;

$(document).on('click', '.fps-reset-btn', function(e) {
    e.stopPropagation();
    e.preventDefault();
    resetFpsStats();

    const $toast = $('.fps-toast');
    $toast.css('background-color', '#10b981');
    if (resetBgTimeout) clearTimeout(resetBgTimeout);
    resetBgTimeout = setTimeout(() => {
        $toast.css('background-color', '');
    }, 350);
});

document.addEventListener('rubus-map-created', function() {
    if (typeof settings !== 'undefined' && settings['toggle-show-fps']) {
        startFpsCounter();
    }
});

function postLoadEvent() {
    let isPWA = window.matchMedia('(display-mode: standalone)').matches || 
                  window.navigator.standalone || 
                  document.referrer.includes('android-app://');

    const userAgent = navigator.userAgent.toLowerCase();
    let deviceType;
    
    if (/iphone/.test(userAgent)) {
        deviceType = 'iphone';
    } else if (/ipad/.test(userAgent)) {
        deviceType = 'ipad';
    } else if (/android/.test(userAgent)) {
        deviceType = 'android';
    } else if (/macintosh/.test(userAgent)) {
        deviceType = 'macintosh';
    } else if (/windows/.test(userAgent)) {
        deviceType = 'windows'; 
    } else if (/linux/.test(userAgent)) {
        deviceType = 'linux';
    } else {
        deviceType = 'other';
    }

    if (isPWA) {
        isPWA = 'pwa';
    } else {
        isPWA = 'web';
    }

    const date = new Date();
    const timeOptions = {
        timeZone: 'America/New_York',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    };
    const timeString = date.toLocaleTimeString('en-US', timeOptions);

    const dateOptions = {
        timeZone: 'America/New_York',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    };
    const dateString = date.toLocaleDateString('en-US', dateOptions);
    
    const nyTime = `${timeString}, ${dateString}`;

    sa_event('load_test_2', {
        'device_type': deviceType,
        'pwa': isPWA,
        'ny_time': nyTime,
        'date': new Date()
    });

    sa_event('load', {
        'device_type': deviceType,
        'pwa': isPWA,
        'ny_time': nyTime,
        'date': new Date()
    });
}

callPostLoadEvent();
