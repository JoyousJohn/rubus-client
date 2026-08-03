// js/pixel-ratio.js - adaptive pixel ratio (dev setting "Adaptive Pixel Ratio")
//
// When enabled, the app profiles pan frame times and steps the map's render
// pixel ratio down (slow device/pan) or back up (fast device/pan) instead of
// always paying the device DPR cost. The winning ratio is persisted and
// re-seeded on the next enable / page load.
//
// The browser reports the hardware devicePixelRatio; this module decides how
// much of it to actually render based on measured performance. The upper bound
// must match the pixelRatio cap in js/map-init.js.

const PIXEL_RATIO_STORAGE_KEY = 'adaptive-pixel-ratio';

const adaptivePixelRatio = {
    map: null,
    active: false,
    panning: false,
    panFrameTimes: [],
    lastPanTime: 0,
    slowPans: 0,
    fastPans: 0,
    currentRatio: null,

    // Upper bound matches the pixelRatio cap in js/map-init.js.
    maxRatio: Math.min(window.devicePixelRatio || 1, 2),
    ladder: [1, 1.25, 1.5, 1.75, 2],

    // Median frame time thresholds per drag (evaluated on dragend).
    slowFrameMs: 23,   // > 23ms (~<43fps) → step down
    fastFrameMs: 18,   // < 18ms → step up (reachable on 60Hz (~16.7ms) and faster panels)
    slowPansNeeded: 2, // consecutive slow pans before stepping down
    fastPansNeeded: 3  // consecutive fast pans before stepping up
};

function _prRungs() {
    const rungs = adaptivePixelRatio.ladder.filter(r => r <= adaptivePixelRatio.maxRatio);
    // The device DPR cap may be fractional (e.g. 1.354) and off the ladder;
    // keep it as the top rung so stepping can restore full sharpness.
    if (rungs[rungs.length - 1] !== adaptivePixelRatio.maxRatio) {
        rungs.push(adaptivePixelRatio.maxRatio);
    }
    return rungs;
}

function _prClosestRung(ratio) {
    const rungs = _prRungs();
    let best = 0;
    for (let i = 1; i < rungs.length; i++) {
        if (Math.abs(rungs[i] - ratio) < Math.abs(rungs[best] - ratio)) best = i;
    }
    return rungs[best];
}

function _prLoadPersisted() {
    try {
        const v = parseFloat(localStorage.getItem(PIXEL_RATIO_STORAGE_KEY));
        if (isFinite(v) && v >= 1) return _prClosestRung(Math.min(v, adaptivePixelRatio.maxRatio));
    } catch (e) {}
    return null;
}

function _prPersist(ratio) {
    try {
        localStorage.setItem(PIXEL_RATIO_STORAGE_KEY, String(ratio));
    } catch (e) {}
}

function _prToast(text) {
    const $toast = $('.pixel-ratio-toast');
    if ($toast.length) $toast.text(text).stop(true, true).fadeIn();
}

function _prHideToast() {
    const $toast = $('.pixel-ratio-toast');
    if ($toast.length) $toast.stop(true, true).fadeOut();
}

function _prApplyRatio(ratio) {
    const self = adaptivePixelRatio;
    ratio = Math.min(Math.max(ratio, 1), self.maxRatio);
    self.currentRatio = ratio;
    if (self.map && typeof self.map.setPixelRatio === 'function') {
        // Dedupe against what the map is actually rendering (not our
        // bookkeeping) so the initial seeded ratio gets applied on enable.
        if (typeof self.map.getPixelRatio === 'function' &&
            Math.abs(ratio - self.map.getPixelRatio()) < 0.001) return;
        self.map.setPixelRatio(ratio);
        _prPersist(ratio);
        _prToast('PIXEL RATIO ' + ratio.toFixed(2));
    } else if (self.map) {
        console.warn('[Adaptive PR] map.setPixelRatio() unavailable in this MapLibre build; ratio ' + ratio + ' not applied.');
    }
}

function _prStep(direction) {
    const self = adaptivePixelRatio;
    const rungs = _prRungs();
    const idx = rungs.indexOf(self.currentRatio);
    const next = rungs[idx + direction];
    if (next !== undefined) {
        _prApplyRatio(next);
    }
}

function _prEvaluatePan() {
    const self = adaptivePixelRatio;
    if (self.panFrameTimes.length < 3) return;

    const sorted = [...self.panFrameTimes].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];

    if (median > self.slowFrameMs) {
        self.slowPans++;
        self.fastPans = 0;
    } else if (median < self.fastFrameMs) {
        self.fastPans++;
        self.slowPans = 0;
    } else {
        self.slowPans = 0;
        self.fastPans = 0;
    }

    if (self.slowPans >= self.slowPansNeeded) {
        self.slowPans = 0;
        _prStep(-1);
    } else if (self.fastPans >= self.fastPansNeeded) {
        self.fastPans = 0;
        _prStep(1);
    }

    _prToast('PIXEL RATIO ' + self.currentRatio.toFixed(2));
}

function startAdaptivePixelRatio() {
    const self = adaptivePixelRatio;
    if (!map || self.active) return;
    self.active = true;
    self.map = map;

    // Seed from the persisted learning (clamped to the map's cap). The apply
    // dedupes against the map's actual ratio, so the seed is synced when it
    // differs and skipped when the map is already there.
    const seeded = _prLoadPersisted();
    self.currentRatio = seeded !== null ? seeded : self.maxRatio;
    _prApplyRatio(self.currentRatio);
    _prToast('PIXEL RATIO ' + self.currentRatio.toFixed(2));

    self.onDragStart = function() {
        self.panning = true;
        self.panFrameTimes = [];
        self.lastPanTime = 0;
    };
    self.onRender = function() {
        if (!self.panning) return;
        const now = performance.now();
        if (self.lastPanTime > 0) self.panFrameTimes.push(now - self.lastPanTime);
        self.lastPanTime = now;
    };
    self.onDragEnd = function() {
        self.panning = false;
        _prEvaluatePan();
    };

    map.on('dragstart', self.onDragStart);
    map.on('render', self.onRender);
    map.on('dragend', self.onDragEnd);
}

function stopAdaptivePixelRatio() {
    const self = adaptivePixelRatio;
    if (!self.active) return;
    self.active = false;

    if (self.map) {
        if (self.onDragStart) self.map.off('dragstart', self.onDragStart);
        if (self.onRender) self.map.off('render', self.onRender);
        if (self.onDragEnd) self.map.off('dragend', self.onDragEnd);

        // Restore the map's default cap so the feature is fully off.
        if (self.currentRatio !== null && typeof self.map.setPixelRatio === 'function') {
            const applied = (typeof self.map.getPixelRatio === 'function') ? self.map.getPixelRatio() : null;
            if (applied === null || Math.abs(self.maxRatio - applied) >= 0.001) {
                self.map.setPixelRatio(self.maxRatio);
            }
        }
    }
    self.map = null;
    self.currentRatio = null;
    self.panning = false;
    self.slowPans = 0;
    self.fastPans = 0;
    self.panFrameTimes = [];
    _prHideToast();
}

document.addEventListener('rubus-map-created', function() {
    if (typeof settings !== 'undefined' && settings['toggle-adaptive-pixel-ratio']) {
        startAdaptivePixelRatio();
    }
});
