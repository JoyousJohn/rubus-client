const initPollDelay = 2000;
const pollDelay = 5000;
const pollDelayBuffer = 1000;
let lastPollTime = 0;
// Timestamp of the last successful marker update/render
let lastUpdateTime = 0;
// Flag to force the next fetch to perform an immediate, non-animated update
let forceImmediateUpdate = false;
// Prevent overlapping network fetches
let busFetchInProgress = false;

// Global settings object, loaded synchronously so every script (including
// ready-handler code in campus.js/search.js that runs before pre.js loads
// settings) sees the real stored values. Mirrors loadSettingsFromStorage().
let settings = {};
try {
    const raw = localStorage.getItem('settings');
    if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            settings = parsed;
        } else {
            console.error('[settings] stored "settings" is not a plain object; starting empty:', parsed);
            localStorage.removeItem('settings');
        }
    }
} catch (e) {
    console.error('[settings] corrupted "settings" in localStorage; starting empty:', e);
    localStorage.removeItem('settings');
}

let maxDistanceMiles = 14;

let sim = false;
let spoof = false;

function resolveAutoTheme(theme) {
    if (theme !== 'auto') return theme;
    // When updating these time ranges, also update the inline script in index.html
    const h = new Date().getHours();
    if (h < 6) return 'y2k-glamour';      // 12am–6am
    if (h < 12) return 'light';           // 6am–12pm
    if (h < 18) return 'beige-coffee';    // 12pm–6pm
    return 'dark';                        // 6pm–12am
}

// Global variable to track if out of service buses should be hidden in stop grid
let hideOutOfServiceBuses = false;

const knownRoutes = ['a', 'b', 'bhe', 'ee', 'f', 'h', 'lx', 'on1', 'on2', 'rexb', 'rexl', 'wknd1', 'wknd2', 'c', 'ftbl', 'all', 'winter1', 'winter2', 'bl', 'summer1', 'summer2', 'commencement', 'helix', 'cam', 'cc', 'ccx', 'ps', 'psx']

const routesByCampusBase = {
    'nb': ['fav', 'a', 'b', 'bhe', 'ee', 'f', 'h', 'lx', 'on1', 'on2', 'rexb', 'rexl', 'wknd1', 'wknd2', 'c', 'ftbl', 'all', 'winter1', 'winter2', 'bl', 'summer1', 'summer2', 'commencement', 'helix'],
    'camden': ['cam'],
    'newark': ['cc', 'ccx', 'ps', 'psx']
}

function getCampusRoutes(campus) {
    const routes = routesByCampusBase[campus];
    if (!routes) {
        throw new Error(`[Campus] selectedCampus '${campus}' not found in routesByCampusBase. Valid campuses: ${Object.keys(routesByCampusBase).join(', ')}`);
    }
    return routes;
}

const routesByCampus = {}

for (const campus in routesByCampusBase) {
    for (const route of routesByCampusBase[campus]) {
        routesByCampus[route] = campus;
    }
}

// Known feed aliases -> canonical base-route codes. Both the API and the
// WebSocket can report alpha route IDs ("ONWK1FS", ...) instead of the
// canonical codes ('on1', ...) used everywhere else in the app.
const feedRouteAliases = {
    'onwk1fs': 'on1',
    'onwk2fs': 'on2',
};

// Normalize a route string coming from an external feed (API/WS) into the
// canonical base-route code, or null when the value is not a serviceable
// route. This is the single choke point between the feed and busData, so an
// unknown route is reported here instead of being silently stored.
function normalizeFeedRoute(raw) {
    if (typeof raw !== 'string' || !raw.trim()) {
        console.warn('[route] feed reported a non-string/empty route value:', raw);
        return null;
    }
    const key = raw.trim().toLowerCase();
    if (key === 'none' || key === 'undefined') {
        console.warn('[route] feed reported a fabricated route value:', raw);
        return null;
    }
    if (knownRoutes.includes(key)) return key;
    const mapped = feedRouteAliases[key];
    if (mapped && knownRoutes.includes(mapped)) return mapped;
    console.warn(`[route] unknown route value from feed (not in knownRoutes): '${raw}'`);
    return null;
}

let busesByRoutes = Object.fromEntries(
    Object.keys(routesByCampusBase).map(campus => [campus, {}])
);

function makeBusesByRoutes() {
    busesByRoutes = {};
    for (const campus of Object.keys(routesByCampusBase)) {
        busesByRoutes[campus] = {};
    }
    for (const bus in busData) {
        const route = busData[bus].route;
        // Invariant: every route stored on busData must resolve to a campus.
        // Validate loudly here rather than letting an undefined campus crash
        // with an opaque TypeError (which it would below). If this throws,
        // a bus was stored without running it through normalizeFeedRoute().
        if (!(route in routesByCampus)) {
            throw new Error(`[Invariant] bus ${bus} has unrecognized route '${route}' in busData. All routes must go through normalizeFeedRoute() before being stored.`);
        }
        const campus = routesByCampus[route];
        if (!busesByRoutes[campus][route]) {
            busesByRoutes[campus][route] = [];
        }
        busesByRoutes[campus][route].push(bus);
    }
    // Reconcile: a route may only stay active if it has at least one bus.
    // Covers every deletion path (OoS, zombie/marker-loss cleanup, sim exit),
    // not just the ones that explicitly remember to prune activeRoutes.
    if (typeof activeRoutes !== 'undefined' && activeRoutes) {
        for (const route of [...activeRoutes]) {
            const hasBus = Object.values(busesByRoutes).some(campusRoutes =>
                campusRoutes[route] && campusRoutes[route].length > 0
            );
            if (!hasBus) activeRoutes.delete(route);
        }
    }
}

function showSimBtnIfEligible() {
    if (!sim && selectedCampus === 'nb' && settings && settings['toggle-show-sim']) {
        $('.sim-btn').show();
    }
}

// Special-route handling for SAC North (stop 3)
function isSpecialRoute(route) {
    return route === 'wknd1' || route === 'all' || route === 'winter1' || route === 'on1' || route === 'summer1';
}

// Unified ETA accessor that hides schema differences
function getETAForStop(busName, stopId, previousStopId) {
    if (!busETAs || !busETAs[busName]) return undefined;
    const route = busData && busData[busName] ? busData[busName].route : undefined;
    const special = isSpecialRoute(route);
    if (special && stopId === 3) {
        const viaMap = busETAs[busName][3] && busETAs[busName][3]['via'];
        if (!viaMap) return undefined;
        if (previousStopId !== undefined && previousStopId !== null) {
            return viaMap[previousStopId];
        }
        const values = Object.values(viaMap).filter(v => typeof v === 'number');
        if (!values.length) return undefined;
        return Math.min.apply(null, values);
    }
    return busETAs[busName][stopId];
}

// Coordinate ingestion helpers (used by ws.js / pre.js). A coordinate is only
// accepted when it parses to a finite number; null/undefined/''/non-numeric
// strings are rejected as NaN so bad feed data can't silently become 0.
function parseFiniteCoord(v) {
    if (v === null || v === undefined) return NaN;
    const n = typeof v === 'number' ? v : parseFloat(v);
    return isFinite(n) ? n : NaN;
}

// Rate-limited per-bus warning for rejected coordinates, so a corrupt feed
// stays visible without flooding the console at bus-update frequency.
const _invalidCoordWarns = {};
window.warnInvalidCoords = function(busName, lat, lng, source) {
    const now = Date.now();
    if (now - (_invalidCoordWarns[busName] || 0) < 10000) return;
    _invalidCoordWarns[busName] = now;
    console.warn(`[data] rejected invalid coordinates for bus ${busName} (${source}): lat=${lat} lng=${lng}`);
};