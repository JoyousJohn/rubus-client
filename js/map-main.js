// js/map-main.js - extracted verbatim from js/map.js
let map;
let busMarkers = {};
let busData = {}
let polylines = {};
let activeRoutes = new Set();
var popupBusName;
let popupStopId;
let busesDoneInit; // don't check for moves until map is done plotting
let selectedCampus;
let popupBuildingName;
let popupBuildingLatLng;
let bikeRackMarkers = [];

let mapDragged = false;
let shouldSetMaxBoundsAfterDrag = false;

// settings vars
let showETAsInSeconds = false;
let showETAsInMs = false;

let isDesktop;
let isTouchDevice;

function checkIsTouchDevice() {
    return !!(
        ('ontouchstart' in window) ||
        (navigator.maxTouchPoints > 0) ||
        (window.matchMedia && (window.matchMedia('(pointer: coarse)').matches || window.matchMedia('(hover: none)').matches))
    );
}

isDesktop = $(window).width() > 992 && $(window).height() >= 500 && !checkIsTouchDevice();
isTouchDevice = checkIsTouchDevice();

// Full-height baseline for keyboard detection. The viewport meta uses
// interactive-widget=resizes-content, so on Android Chrome the keyboard
// shrinks the LAYOUT viewport (window.innerHeight) and the visual viewport
// together — innerHeight - visualViewport.height stays ~0 whether the
// keyboard is up or not, so a difference check never fires (false negative)
// and flights measure the shrunk layout, landing in the top half where the
// keyboard used to be. Instead, compare each viewport against its full-height
// baseline: shrunk vs baseline means covered/dismissing. This also covers
// resizes-visual (iOS: layout stays full, visual shrinks) and plain browser
// chrome changes.
let baselineViewportHeight = Math.max(
    window.innerHeight || 0,
    (window.visualViewport && window.visualViewport.height) || 0
);
let baselineViewportWidth = window.innerWidth || 0;
function updateBaselineViewportHeight() {
    const h1 = window.innerHeight || 0;
    const h2 = (window.visualViewport && window.visualViewport.height) || 0;
    const w = window.innerWidth || 0;
    // Rotation changes width significantly: the old portrait full height is not
    // the landscape full height. Reset the baseline instead of treating the
    // shorter rotated height as a keyboard.
    if (Math.abs(w - baselineViewportWidth) > 100) {
        baselineViewportWidth = w;
        baselineViewportHeight = Math.max(h1, h2);
        return;
    }
    // Only ever grow otherwise: URL-bar collapse to a taller height is a new
    // full height; a shrunk (keyboard) height must never lower the baseline.
    if (h1 > baselineViewportHeight) baselineViewportHeight = h1;
    if (h2 > baselineViewportHeight) baselineViewportHeight = h2;
}
window.addEventListener('resize', updateBaselineViewportHeight);
if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', updateBaselineViewportHeight);
}

// True while an on-screen keyboard is open or still dismissing (layout not
// yet restored). Must be baseline-relative (see above), not
// innerHeight - visualViewport.height.
function keyboardShowing() {
    const SHRINK_THRESHOLD = 100;
    const vv = window.visualViewport;
    if (vv && (baselineViewportHeight - vv.height) > SHRINK_THRESHOLD) return true;
    if ((baselineViewportHeight - (window.innerHeight || 0)) > SHRINK_THRESHOLD) return true;
    return false;
}

// Resolve the popup content element to measure at fly time. Callers query
// the selector synchronously after popStopInfo/showBuildingInfo/selectBusMarker,
// but if that query ran before the popup was visible it captured null and the
// flight would fall back to the map center — i.e. centered behind the popup
// instead of below it. If the passed element is missing/has no layout, fall
// back to whichever info popup is currently visible; when none is visible
// (e.g. flyMapToStopInBackground) return null so the caller centers on the map.
function resolvePopupContentEl(passedEl) {
    if (passedEl && passedEl.isConnected) {
        const r = passedEl.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) return passedEl;
    }
    // jQuery :visible handles display:none ancestors; querySelector can't.
    const fallback =
        ($('.stop-info-popup:visible .stop-info-popup-inner')[0]) ||
        ($('.building-info-popup:visible .building-info-popup-inner')[0]) ||
        ($('.bus-info-popup:visible .info-next-stops')[0]) ||
        ($('.bus-info-popup:visible .bus-info-main')[0]);
    return fallback || passedEl || null;
}

// Compute the container-pixel y (relative to the map's top-left) at which the
// given lat/lng should land so it sits mid-way between the bottom of the popup
// content (above the popup's bottom action-button row) and the map's bottom
// edge — i.e. centered in the still-visible map area. The buttons are short,
// so it's fine for them to sit above the centered space.
// Falls back to the map's true center (map height / 2) when no content
// element is measurable.
function getCenteredYBelowPopup(contentEl) {
    const size = map.getSize();
    const cy = size.y / 2;
    contentEl = resolvePopupContentEl(contentEl);

    let bottomY = null;
    if (contentEl) {
        const rect = contentEl.getBoundingClientRect();
        const mapRect = map.getContainer().getBoundingClientRect();
        const contentBottomInMap = rect.bottom - mapRect.top;
        // Only treat the popup as covering the top when it actually extends
        // into the map area (top-anchored cards); otherwise it's a side
        // column and horizontal offsetting applies instead.
        if (contentBottomInMap > 0 && contentBottomInMap < size.y) {
            bottomY = contentBottomInMap;
        }
    }

    if (bottomY === null) {
        return cy;
    }

    // Lower boundary of the free space: the map bottom edge, minus the route
    // selectors row when it's an actual bottom-anchored overlay over the map
    // (mobile). The other .bottom buttons float to the sides and don't block
    // the vertical strip, so only the selectors row is subtracted. On desktop
    // the row is a top-anchored column (or nested inside a subpanel when open),
    // which doesn't cut into the gap below the popup, so it's ignored.
    let lowerEdge = size.y;
    const $routeSelectors = $('.route-selectors');
    if ($routeSelectors.length && $routeSelectors.is(':visible')) {
            const rsRect = $routeSelectors[0].getBoundingClientRect();
            const mapRect = map.getContainer().getBoundingClientRect();
            const rsTop = rsRect.top - mapRect.top;
            const rsBottom = rsRect.bottom - mapRect.top;
            // Bottom-anchored: the row's bottom hugs the map's bottom edge and
            // its top sits below the popup, so it eats into the free band.
            if (rsTop > bottomY && rsBottom >= 0 && (size.y - rsBottom) < 24) {
                lowerEdge = rsTop;
            }
    }

    const pad = Math.min(40, size.y / 8);
    return Math.min(Math.max((bottomY + lowerEdge) / 2, bottomY + pad), lowerEdge - pad);
}

// Fly so the feature lands centered in the visible map area below the popup.
// Reads the popup's current bottom edge at fly time, so it must be called
// after the popup has been shown. Uses the same duration semantics as the
// other callers (seconds for the compat layer's flyTo).
//
// MapLibre's flyTo offset is "of the target center relative to real map
// container center" (source: camera.ts AnimationOptions) — the target center
// lands at centerPoint + offset. So to place the feature at screen y =
// desiredY, the fly center must be offset by (desiredY - cy) relative to the
// viewport center; the offset is applied during the animation, so it holds
// regardless of the zoom change.
//
// essential:true keeps prefers-reduced-motion from turning user-initiated
// flights into instant jumps.
function flyToCenteredBelow(latlng, zoom, popupEl, duration, onFlown) {
    // Any new popup flight retargets the map, so an in-progress bus follow must
    // end first. Callers that then start a follow (flyToBus) must do it in
    // onFlown, because a flight can be deferred while a keyboard dismisses.
    stopFollowBus();

    const fly = () => {
        // Container may have grown while the keyboard dismissed; sync the
        // MapLibre transform before measuring so getSize()/getCenteredYBelowPopup
        // see the full-height layout, not the shrunk one where the keyboard was.
        map.resize();
        // Popup max-heights are derived from window.innerHeight at show time
        // (popStopInfo defers updateStopBusesMaxHeight via setTimeout 0), so a
        // show-while-shrunk leaves a stale short cap. Recompute for the
        // restored height before measuring, otherwise the bottom — and hence
        // the flight offset — is for the keyboard-sized popup and the feature
        // lands high, in the top half where the keyboard used to be.
        if ($('.stop-info-popup').is(':visible')) {
            updateStopBusesMaxHeight();
        }
        if ($('.bus-info-popup').is(':visible')) {
            updateNextStopsMaxHeight();
        }
        if ($('.building-info-popup').is(':visible')) {
            updateBuildingPopupMaxHeight();
        }
        const size = map.getSize();
        const cy = size.y / 2;
        const offsetY = getCenteredYBelowPopup(popupEl) - cy;

        map.flyTo([latlng[0], latlng[1]], zoom, {
            animate: true,
            duration: duration !== undefined ? duration : 0.5,
            essential: true,
            offset: { x: 0, y: offsetY }
        });
        if (onFlown) onFlown();
    };

    // Nothing covering the map: fly now, synchronously, so the flight stays
    // ordered with respect to whatever the caller does after this returns.
    if (!keyboardShowing()) {
        fly();
        return;
    }

    // A keyboard is up/dismissing, so the container and popup max-heights are
    // still shrunk. Measuring now would center in the keyboard-sized top half.
    // Wait (bounded) for BOTH viewports to restore — with resizes-content the
    // layout viewport (window resize) lags the visual viewport — debounce so
    // the first visual resize doesn't finish while the container is still
    // shrunk, then settle one frame for overlay/popup layout before measuring.
    // NOTE: offset sign stays (desiredY - cy): MapLibre lands the target at
    // centerPoint + offset, so a positive offset puts the feature BELOW center,
    // in the free space under the top-anchored popup. Do NOT flip it.
    const vv = window.visualViewport;
    let done = false;
    let settleTimer = null;
    let debounceTimer = null;
    const finish = () => {
        if (done) return;
        done = true;
        if (vv) vv.removeEventListener('resize', onResize);
        window.removeEventListener('resize', onResize);
        clearTimeout(settleTimer);
        clearTimeout(debounceTimer);
        // One frame lets .search-wrapper hide / .bottom show / popup
        // max-height writes flush so getBoundingClientRect is full-height.
        requestAnimationFrame(fly);
    };
    const onResize = () => {
        if (done || keyboardShowing()) return;
        // Heights restored but layout may still be settling (container,
        // popup caps); debounce briefly rather than flying on the first event.
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(finish, 60);
    };
    if (vv) vv.addEventListener('resize', onResize);
    window.addEventListener('resize', onResize);
    // Bounded: if the keyboard never fully restores (split/floating/undismissed),
    // fly anyway with the best-effort measurement rather than hanging.
    settleTimer = setTimeout(finish, 600);
}

let currentTileLayerType = 'streets'; // Track the current tile layer type

window.resolveMapTileStyle = function(theme) {
    if (!theme) return 'streets-v11';
    theme = resolveAutoTheme(theme);
    if (theme.includes('coffee')) return 'coffee';
    if (theme.includes('glamour')) return 'glamour';
    if (theme.includes('forest')) return 'forest';
    if (theme === 'dark') return 'dark-v11';
    return 'streets-v11';
};

// TEMP TEST FLAG: set to true to build the map WITHOUT raster tiles, so pan
// performance can be measured with only vector layers (polylines, buses)
// rendering. Set back to false to restore normal tiles.
let tilesDisabledForTest = false;

// Single source of truth for whether a bus marker is hidden by the route
// filter. Both plotBus (which would otherwise reset display every poll) and
// toggleRoute use this, so route hiding isn't undone by position updates.
// busData[busName] is guaranteed by both callers, so a missing entry here
// fails fast rather than silently treating the bus as visible.
function isBusMarkerHiddenByRoute(busName) {
    const route = busData[busName]?.route;
    if (shownRoute && shownRoute !== route) return true;
    if (settings['toggle-hide-other-routes'] && popupBusName && busData[popupBusName]) {
        if (busName.toString() !== popupBusName.toString()) return true;
    }
    return false;
}
