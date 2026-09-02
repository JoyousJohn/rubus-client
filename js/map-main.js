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

    let bottomY = null;
    if (contentEl && contentEl.getBoundingClientRect) {
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

    const pad = Math.min(40, size.y / 8);
    return Math.min(Math.max((bottomY + size.y) / 2, bottomY + pad), size.y - pad);
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
function flyToCenteredBelow(latlng, zoom, popupEl, duration) {
    const size = map.getSize();
    const cx = size.x / 2;
    const cy = size.y / 2;
    const desiredY = getCenteredYBelowPopup(popupEl);

    // Feature should stay horizontally centered and land at desiredY.
    const offsetY = desiredY - cy;

    map.flyTo([latlng[0], latlng[1]], zoom, {
        animate: true,
        duration: duration !== undefined ? duration : 0.5,
        essential: true,
        offset: { x: 0, y: offsetY }
    });
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
