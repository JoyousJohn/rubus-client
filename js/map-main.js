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
    const route = busData[busName].route;
    if (shownRoute && shownRoute !== route) return true;
    if (settings['toggle-hide-other-routes'] && popupBusName && busData[popupBusName] && busData[popupBusName].route !== route) return true;
    return false;
}
