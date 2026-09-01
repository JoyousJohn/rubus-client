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

// Center a lat/lng in the region of the map that is still visible below the
// given popup element (bottom card on mobile, right-side column on desktop).
// Returns a container-pixel point (relative to the map's top-left) at which
// that lat/lng should be placed so it lands mid-way between the popup's bottom
// edge and the map's bottom edge. Falls back to the map's true center when no
// popup is measurable.
function getCenteredPointBelowPopup(latlng, popupEl) {
    const size = map.getSize();
    const cx = size.x / 2;
    const cy = size.y / 2;

    let bottomY = null;
    if (popupEl && popupEl.getBoundingClientRect) {
        const rect = popupEl.getBoundingClientRect();
        const mapRect = map.getContainer().getBoundingClientRect();
        const popupBottomInMap = rect.bottom - mapRect.top;
        // Only treat the popup as covering the top when it actually extends
        // into the map area (top-anchored cards); otherwise it's a side
        // column and horizontal offsetting applies instead.
        if (popupBottomInMap > 0 && popupBottomInMap < size.y) {
            bottomY = popupBottomInMap;
        }
    }

    if (bottomY === null) {
        return { x: cx, y: cy };
    }

    const mapPoint = map.latLngToContainerPoint(latlng);
    const pad = Math.min(40, size.y / 8);
    const targetY = (bottomY + size.y) / 2;
    const desiredY = Math.min(Math.max(targetY, bottomY + pad), size.y - pad);
    return { x: mapPoint.x, y: mapPoint.y + (desiredY - cy) };
}

// Fly so the feature lands centered in the visible map area below the popup.
// Reads the popup's current bottom edge at fly time, so it must be called
// after the popup has been shown. Uses the same duration semantics as the
// other callers (seconds for the compat layer's flyTo).
function flyToCenteredBelow(latlng, zoom, popupEl, duration) {
    const target = getCenteredPointBelowPopup(latlng, popupEl);
    const dest = map.containerPointToLatLng(target);
    map.flyTo([dest.lat, dest.lng], zoom, {
        animate: true,
        duration: duration !== undefined ? duration : 0.5
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
