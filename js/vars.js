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
    'newark': ['cc', 'cce', 'ps', 'psx']
}

const routesByCampus = {}

for (const campus in routesByCampusBase) {
    for (const route of routesByCampusBase[campus]) {
        routesByCampus[route] = campus;
    }
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
        const campus = routesByCampus[route];
        if (!busesByRoutes[campus][route]) {
            busesByRoutes[campus][route] = [];
        }
        busesByRoutes[campus][route].push(bus);
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