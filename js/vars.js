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

const knownRoutes = ['a', 'b', 'bhe', 'ee', 'f', 'h', 'lx', 'on1', 'on2', 'rexb', 'rexl', 'wknd1', 'wknd2', 'c', 'ftbl', 'all', 'winter1', 'winter2', 'bl', 'summer1', 'summer2', 'commencement', 'cam', 'cc', 'ccx', 'ps', 'psx']

const routesByCampusBase = {
    'nb': ['fav', 'a', 'b', 'bhe', 'ee', 'f', 'h', 'lx', 'on1', 'on2', 'rexb', 'rexl', 'wknd1', 'wknd2', 'c', 'ftbl', 'all', 'winter1', 'winter2', 'bl', 'summer1', 'summer2', 'commencement'],
    'camden': ['cam'],
    'newark': ['cc', 'cce', 'ps', 'psx']
}

const routesByCampus = {}

for (const campus in routesByCampusBase) {
    for (const route of routesByCampusBase[campus]) {
        routesByCampus[route] = campus;
    }
}

let busesByRoutes = {};

function makeBusesByRoutes() {
    busesByRoutes = {};
    for (const bus in busData) {
        const route = busData[bus].route;
        const campus = routesByCampus[route];
        if (!busesByRoutes[campus]) {
            busesByRoutes[campus] = {};
        }
        if (!busesByRoutes[campus][route]) {
            busesByRoutes[campus][route] = [];
        }
        busesByRoutes[campus][route].push(bus);
    }
}