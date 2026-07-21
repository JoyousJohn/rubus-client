let polylineBounds = null;
let routeBounds = {};
let previousRoutesWithPolylines = new Set();

const FORCE_SHOW_SETTING = 'force-show-polylines';
const FORCE_SHOW_TOGGLE = 'toggle-force-show-polylines';

function isForceShowEnabled() {
    return settings && settings[FORCE_SHOW_TOGGLE] === true;
}

function isForceShowStopsEnabled() {
    return isForceShowEnabled() && settings['toggle-force-show-stops'] === true;
}

function getForceShowRoutes() {
    const raw = settings[FORCE_SHOW_SETTING] || '';
    return raw ? raw.split(',').filter(Boolean) : [];
}

function setForceShowRoutes(routes) {
    settings[FORCE_SHOW_SETTING] = routes.join(',');
    localStorage.setItem('settings', JSON.stringify(settings));
}

async function addForceShowPolyline(routeName) {
    if (polylines[routeName]) return;
    if (!routesByCampusBase[selectedCampus].includes(routeName)) return;
    let coordinates = await getPolylineData(routeName);
    if (!coordinates || !coordinates.length) return;
    if (Object.keys(coordinates[0])[0] === 'lat') {
        coordinates = coordinates.map(point => [point.lat, point.lng]);
    } else {
        coordinates = coordinates.map(point => [point[1], point[0]]);
    }
    const polylineOptions = getPolylineLayerOptions({
        color: colorMappings[routeName] || '#888',
        weight: 4,
        opacity: 1,
        smoothFactor: 1,
    });
    const polyline = L.polyline(coordinates, polylineOptions);
    polyline.addTo(map);
    polylines[routeName] = polyline;
    routeBounds[routeName] = polyline.getBounds();
}

function removeForceShowPolyline(routeName) {
    if (!polylines[routeName]) return;
    polylines[routeName].remove();
    delete polylines[routeName];
    delete routeBounds[routeName];
}

function applyForceShowState() {
    const forceRoutes = getForceShowRoutes();
    for (const route of Object.keys(polylines)) {
        if (!forceRoutes.includes(route)) {
            try { polylines[route].remove(); } catch (e) {}
            delete polylines[route];
        }
    }
    for (const route of forceRoutes) {
        addForceShowPolyline(route);
    }
}

function revertForceShowState() {
    for (const route of Object.keys(polylines)) {
        if (!routeHasInServiceBuses(route)) {
            try { polylines[route].remove(); } catch (e) {}
            delete polylines[route];
        }
    }
    const forceRoutes = getForceShowRoutes();
    for (const campus in busesByRoutes) {
        if (!busesByRoutes[campus]) continue;
        for (const route of Object.keys(busesByRoutes[campus])) {
            if (routeHasInServiceBuses(route) && !polylines[route] && !forceRoutes.includes(route)) {
                addForceShowPolyline(route);
            }
        }
    }
    removePreviouslyActiveStops();
    addStopsToMap();
}

function applyForceShowStops() {
    const forceRoutes = getForceShowRoutes();
    const allowedStopIds = new Set();
    for (const route of forceRoutes) {
        if (stopLists[route]) stopLists[route].forEach(s => allowedStopIds.add(Number(s)));
    }
    for (const stopId in busStopMarkers) {
        if (!allowedStopIds.has(Number(stopId))) {
            busStopMarkers[stopId].remove();
            delete busStopMarkers[stopId];
        }
    }
    for (const stopId of allowedStopIds) {
        const id = String(stopId);
        if (!busStopMarkers[id] && stopsData[id]) {
            const s = stopsData[id];
            const marker = L.marker([s.latitude, s.longitude], {
                icon: L.divIcon({
                    className: 'custom-stop-icon',
                    iconSize: [30, 30],
                    iconAnchor: [15, 15],
                    html: `<div class="marker-wrapper"><img src="img/stop_marker.png" width="18" height="18" stop-marker-id="${id}"/><div class="corner-label none" stop-eta="${id}">xm</div></div>`
                }),
                zIndexOffset: settings['toggle-stops-above-buses'] ? 1000 : 0,
            }).addTo(map).on('click', function() {
                if ($('body').hasClass('parking-permit-mode')) return;
                sourceStopId = null;
                sourceBusName = null;
                clearPanoutFeedback();
                popStopInfo(id);
                if (!shownRoute) {
                    showAllBuses();
                    showAllPolylines();
                }
            });
            busStopMarkers[id] = marker;
        }
    }
}

function revertForceShowStops() {
    addStopsToMap();
}

function renderForceShowCheckboxes() {
    const $container = $('.force-show-polylines-container');
    if (!$container.length) return;
    $container.empty();
    const forceRoutes = getForceShowRoutes();
    const campusRoutes = routesByCampusBase[selectedCampus] || [];
    const allOn = campusRoutes.every(r => forceRoutes.includes(r));

    const $allToggle = $(`
        <label class="force-show-option flex align-center pointer" style="gap:4px;padding:2px 6px;border-radius:4px;">
            <input type="checkbox" class="force-show-all-cb" ${allOn ? 'checked' : ''}>
            <span style="font-size:0.9rem;font-weight:600;">ALL</span>
        </label>
    `);
    $container.append($allToggle);

    for (const route of knownRoutes) {
        if (!campusRoutes.includes(route)) continue;
        const checked = forceRoutes.includes(route);
        const color = colorMappings[route] || '#888';
        $container.append(`
            <label class="force-show-option flex align-center pointer" style="gap:4px;padding:2px 6px;border-radius:4px;">
                <input type="checkbox" class="force-show-cb" data-route="${route}" ${checked ? 'checked' : ''}>
                <span style="color:${color};font-size:0.9rem">● ${route.toUpperCase()}</span>
            </label>
        `);
    }
}

$(document).on('change', '.force-show-cb', function() {
    const route = $(this).data('route');
    const show = $(this).prop('checked');
    let forceRoutes = getForceShowRoutes();
    if (show) {
        if (!forceRoutes.includes(route)) forceRoutes.push(route);
        if (isForceShowEnabled()) {
            addForceShowPolyline(route);
        }
    } else {
        forceRoutes = forceRoutes.filter(r => r !== route);
        if (isForceShowEnabled() || !routeHasInServiceBuses(route)) {
            removeForceShowPolyline(route);
        }
    }
    setForceShowRoutes(forceRoutes);
    const campusRoutes = routesByCampusBase[selectedCampus] || [];
    const allOn = campusRoutes.every(r => forceRoutes.includes(r));
    $('.force-show-all-cb').prop('checked', allOn);
    if (isForceShowStopsEnabled()) applyForceShowStops();
});

$(document).on('change', '.force-show-all-cb', function() {
    const selectAll = $(this).prop('checked');
    const campusRoutes = routesByCampusBase[selectedCampus] || [];
    let forceRoutes = getForceShowRoutes();
    if (selectAll) {
        for (const route of campusRoutes) {
            if (!forceRoutes.includes(route)) {
                forceRoutes.push(route);
                if (isForceShowEnabled()) addForceShowPolyline(route);
            }
        }
    } else {
        for (const route of campusRoutes) {
            if (isForceShowEnabled() || !routeHasInServiceBuses(route)) {
                removeForceShowPolyline(route);
            }
        }
        forceRoutes = forceRoutes.filter(r => !campusRoutes.includes(r));
    }
    setForceShowRoutes(forceRoutes);
    renderForceShowCheckboxes();
    if (isForceShowStopsEnabled()) applyForceShowStops();
});

// Canvas/SVG renderer for route polylines; respects polyline-renderer + padding settings
// Uses polylinesPane so routes stay above buildings (overlayPane) for both SVG and Canvas
function ensurePolylinesPane() {
    if (!map || map.getPane('polylinesPane')) return;
    map.createPane('polylinesPane');
    map.getPane('polylinesPane').style.zIndex = 450;
}

function createPolylineRenderer() {
    ensurePolylinesPane();
    const useCanvas = settings && settings['polyline-renderer'] === 'canvas';
    const usePadding = settings && settings['toggle-polyline-padding'];
    const options = { pane: 'polylinesPane' };
    if (usePadding) options.padding = 1.0;
    return useCanvas ? L.canvas(options) : L.svg(options);
}

function getPolylineLayerOptions(extra) {
    return Object.assign({
        pane: 'polylinesPane',
        renderer: createPolylineRenderer()
    }, extra || {});
}

function reapplyPolylineRenderers(reason) {
    for (const routeName in polylines) {
        const polyline = polylines[routeName];
        logPolylineRemoval(routeName, reason);
        polyline.removeFrom(map);
        polyline.options.pane = 'polylinesPane';
        polyline.setStyle({
            renderer: createPolylineRenderer()
        });
        polyline.addTo(map);
    }
}

// Track polyline removal for debugging race conditions
let polylineRemovalLog = [];
let polylineRemovalCount = {}; // Track how many times each route has been removed

// Track polyline removal with stack trace - only log if double removal occurs
function logPolylineRemoval(routeName, caller) {
    const timestamp = new Date().toISOString();
    const exists = !!polylines[routeName];
    
    // Increment removal count for this route
    if (!polylineRemovalCount[routeName]) {
        polylineRemovalCount[routeName] = 0;
    }
    polylineRemovalCount[routeName]++;
    
    const logEntry = {
        route: routeName,
        caller: caller,
        timestamp: timestamp,
        stack: new Error().stack,
        exists: exists,
        removalCount: polylineRemovalCount[routeName]
    };
    
    polylineRemovalLog.push(logEntry);
    
    // Only log if this is a double removal (count > 1) or if polyline doesn't exist when trying to remove
    if (polylineRemovalCount[routeName] > 1 || !exists) {
        console.warn(`[DOUBLE REMOVAL DETECTED] Route: ${routeName}, Caller: ${caller}, Removal Count: ${polylineRemovalCount[routeName]}, Exists: ${exists}`, logEntry);
        
        // Show previous removals for this route
        const previousRemovals = polylineRemovalLog.filter(entry => entry.route === routeName);
        console.log(`Previous removals for route ${routeName}:`, previousRemovals);
    }
    
    // Keep only last 50 entries to prevent memory bloat
    if (polylineRemovalLog.length > 50) {
        polylineRemovalLog = polylineRemovalLog.slice(-50);
    }
}

// Function to get removal history for debugging
function getPolylineRemovalHistory(routeName = null) {
    if (routeName) {
        return polylineRemovalLog.filter(entry => entry.route === routeName);
    }
    return polylineRemovalLog.slice(); // Return copy
}

// Global debugging functions (accessible from console)
window.debugPolylineRemovals = function(routeName = null) {
    const history = getPolylineRemovalHistory(routeName);
    console.table(history);
    return history;
};

window.debugPolylineState = function(routeName) {
    console.log(`Polyline state for route: ${routeName}`);
    console.log(`Exists in polylines object:`, !!polylines[routeName]);
    console.log(`On map:`, polylines[routeName] ? map.hasLayer(polylines[routeName]) : 'N/A');
    console.log(`Removal count:`, polylineRemovalCount[routeName] || 0);
    console.log(`Removal history:`, getPolylineRemovalHistory(routeName));
    return {
        exists: !!polylines[routeName],
        onMap: polylines[routeName] ? map.hasLayer(polylines[routeName]) : false,
        removalCount: polylineRemovalCount[routeName] || 0,
        history: getPolylineRemovalHistory(routeName)
    };
};

async function setPolylines(activeRoutes) {
    const forceRoutes = getForceShowRoutes();
    let routesToSet;
    if (isForceShowEnabled()) {
        routesToSet = forceRoutes.filter(r => routesByCampusBase[selectedCampus].includes(r));
    } else {
        routesToSet = Array.from(new Set([
            ...Array.from(activeRoutes).filter(route => {
                if (!routesByCampusBase[selectedCampus].includes(route)) return false;
                return routeHasInServiceBuses(route);
            }),
            ...forceRoutes.filter(r => routesByCampusBase[selectedCampus].includes(r))
        ]));
    }

    // console.log("Setting polylines for routesToSet: ", routesToSet)
    
    const fetchPromises = [];

    for (const routeName of routesToSet) {

        let coordinates = await getPolylineData(routeName);

        if (!coordinates) continue // if undefined

        // console.log(typeof coordinates[0])

        if (Object.keys(coordinates[0])[0] === 'lat') {
            coordinates = coordinates.map(point => [point.lat, point.lng]); // Note: Leaflet uses [lat, lng]
        } else {
            coordinates = coordinates.map(point => [point[1], point[0]]); // Note: Leaflet uses [lat, lng]

        }

        // const pathData = ['M', coordinates[0]];  // Move to the first point

        // for (let i = 1; i < coordinates.length - 1; i += 2) {
        //     const controlPoint = coordinates[i];
        //     const nextPoint = coordinates[i + 1];

        //     if (controlPoint && nextPoint) {
        //         pathData.push('Q', controlPoint, nextPoint);
        //     }
        // }

        // if (coordinates.length % 2 === 0) {
        //     pathData.push('L', coordinates[coordinates.length - 1]);
        // }

        // // Create the curve
        // const polyline = L.curve(pathData, {
        //     color: colorMappings[routeName],   
        //     weight: 4,      
        //     opacity: 1,     
        //     smoothFactor: 1 
        // }).addTo(map);

        const polylineOptions = getPolylineLayerOptions({
            color: colorMappings[routeName],
            weight: 4,
            opacity: 1,
            smoothFactor: 1,
            // noClip: true
        });

        const polyline = L.polyline(coordinates, polylineOptions);

        polyline.addTo(map);

        polylines[routeName] = polyline;

        // Cache route bounds even if layer later gets pruned
        const bounds = polyline.getBounds();
        routeBounds[routeName] = bounds;

        fetchPromises.push(coordinates);
    }

    if (fetchPromises.length === 0) return // no routes to populate

    Promise.all(fetchPromises).then(() => {
        updatePolylineBoundsIfNeeded();
        map.fitBounds(polylineBounds, { padding: [10, 10] });
    });
}

async function getPolylineData(routeName) {

    try {

        if (!knownRoutes.includes(routeName)) return // I don't think it should even be able to get this far to need this final check?

        let polylineData = null;

        // Load route data from local JSON file instead of server request
        const response = await fetch(`lib/routes/${routeName}_route.json`);
        if (response.status === 200) {
            const data = await response.json();
            polylineData = data;
        } else {
            console.error(`Error fetching polyline data for route ${routeName}:`, response.statusText);
        }
        return polylineData;
    } catch (error) {
        console.error(`Error fetching polyline data for route ${routeName}:`, error);
        markRubusRequestsFailing();
    }
} 


function getValidBusesServicingStop(stopId) {
    let validBuses = [];
    const routesServicing = getRoutesServicingStop(stopId)
    routesServicing.forEach(route => {
        busesByRoutes[selectedCampus][route].forEach(busName => {
            if (isValid(busName)) {
                validBuses.push(busName);
            }
        })
    })
    return validBuses;
}


// Force-add a polyline for a specific route regardless of bus in-service state
async function addPolylineForRoute(routeName) {
    try {
        if (polylines[routeName]) return;
        if (!routesByCampusBase[selectedCampus].includes(routeName)) return;

        let coordinates = await getPolylineData(routeName);
        if (!coordinates || !coordinates.length) return;

        if (Object.keys(coordinates[0])[0] === 'lat') {
            coordinates = coordinates.map(point => [point.lat, point.lng]);
        } else {
            coordinates = coordinates.map(point => [point[1], point[0]]);
        }

        const polylineOptions = getPolylineLayerOptions({
            color: colorMappings[routeName],
            weight: 4,
            opacity: 1,
            smoothFactor: 1,
        });

        const polyline = L.polyline(coordinates, polylineOptions);
        polyline.addTo(map);
        polylines[routeName] = polyline;
        
        // Reset removal count when polyline is successfully created
        if (polylineRemovalCount[routeName]) {
            delete polylineRemovalCount[routeName];
        }
        const bounds = polyline.getBounds();
        routeBounds[routeName] = bounds;
    } catch (e) {
        console.log('Failed to add polyline for route', routeName, e);
    }
}

// Check if a route has any in-service buses
function routeHasInServiceBuses(route) {
    try {
        const routeBuses = busesByRoutes[selectedCampus] && busesByRoutes[selectedCampus][route];
        return routeBuses && routeBuses.some(busName => busData[busName] && !busData[busName].oos);
    } catch (e) {
        return false;
    }
}

// Update polylineBounds efficiently - only when polylines actually change
function updatePolylineBoundsIfNeeded() {
    try {
        // Get current routes that have polylines
        const currentRoutesWithPolylines = new Set(
            Object.keys(polylines).filter(route =>
                routesByCampusBase[selectedCampus]?.includes(route)
            )
        );

        // Quick check: if no routes changed, return early
        const currentRoutesArray = Array.from(currentRoutesWithPolylines).sort();
        const previousRoutesArray = Array.from(previousRoutesWithPolylines).sort();

        if (JSON.stringify(currentRoutesArray) === JSON.stringify(previousRoutesArray)) {
            return; // No changes
        }

        let combinedBounds = null;

        // Compute bounds from current polylines
        for (const route of currentRoutesWithPolylines) {
            if (routeBounds[route]) {
                if (combinedBounds === null) {
                    combinedBounds = routeBounds[route];
                } else {
                    combinedBounds = combinedBounds.extend(routeBounds[route]);
                }
            }
        }

        // If no active routes, use campus bounds as default
        if (!combinedBounds) {
            combinedBounds = bounds[selectedCampus];
        }

        polylineBounds = combinedBounds;
        previousRoutesWithPolylines = currentRoutesWithPolylines;
    } catch (e) {
        console.log('Error updating polyline bounds', e);
        polylineBounds = null;
        previousRoutesWithPolylines.clear();
    }
}

// Remove polylines for routes that currently have no in-service buses
function prunePolylinesWithoutInService() {
    try {
        const forceRoutes = getForceShowRoutes();
        const campusRoutes = Object.keys(busesByRoutes[selectedCampus]);
        campusRoutes.forEach(routeName => {
            if (isForceShowEnabled() && !forceRoutes.includes(routeName)) {
                if (polylines[routeName]) {
                    logPolylineRemoval(routeName, 'prunePolylinesWithoutInService');
                    try { polylines[routeName].remove(); } catch (e) {}
                    delete polylines[routeName];
                }
                return;
            }
            if (forceRoutes.includes(routeName)) return;
            if (!routeHasInServiceBuses(routeName) && polylines[routeName]) {
                logPolylineRemoval(routeName, 'prunePolylinesWithoutInService');
                try { polylines[routeName].remove(); } catch (e) {}
                delete polylines[routeName];
                // Keep routeBounds cached for potential reuse (e.g., quick fit on reselect)
            }
        });
        updatePolylineBoundsIfNeeded();
    } catch (e) {
        console.log('Error pruning polylines without in-service buses', e);
    }
}

// Precompute and cache bounds for campus routes that have in-service buses without adding layers
async function precomputeAllRouteBounds() {
    try {
        const campusRoutes = routesByCampusBase[selectedCampus] || [];

        // Only precompute bounds for routes that have in-service buses
        const routesToPrecompute = campusRoutes.filter(routeName => {
            return routeHasInServiceBuses(routeName);
        });

        const fetches = routesToPrecompute.map(async (routeName) => {
            if (routeBounds[routeName]) return;
            try {
                const coords = await getPolylineData(routeName);
                if (!coords || !coords.length) return;

                let coordinates;
                if (Object.keys(coords[0])[0] === 'lat') {
                    coordinates = coords.map(point => [point.lat, point.lng]);
                } else {
                    coordinates = coords.map(point => [point[1], point[0]]);
                }
                const tmp = L.polyline(coordinates, { opacity: 0 });
                routeBounds[routeName] = tmp.getBounds();
            } catch (error) {
                console.warn(`Skipping polyline bounds for route ${routeName} due to error:`, error.message);
            }
        });
        await Promise.all(fetches);
    } catch (e) {
        console.log('Error precomputing all route bounds', e);
    }
}


let busStopMarkers = {};

function getNextStopId(route, stopId) {
    const routeStops = stopLists[route]
    const nextStopIndex = routeStops.indexOf(stopId) + 1;
    if (nextStopIndex < routeStops.length) {
        nextStopId = routeStops[nextStopIndex];
    } else {
        nextStopId = routeStops[0]
    }
    return nextStopId
}

// Given a route with potentially duplicated stopIds (e.g., SAC NB appears twice),
// determine the stop that comes immediately after currentStopId when approaching
// from prevStopId along that route's sequence.
function getNextStopAfterCurrentGivenPrev(route, prevStopId, currentStopId) {
    try {
        const routeStops = stopLists[route] || [];
        if (!routeStops.length) return getNextStopId(route, currentStopId);
        const len = routeStops.length;
        for (let i = 0; i < len; i++) {
            if (routeStops[i] === prevStopId && routeStops[(i + 1) % len] === currentStopId) {
                return routeStops[(i + 2) % len];
            }
        }
        // Fallback if pattern not found
        return getNextStopId(route, currentStopId);
    } catch (e) {
        return getNextStopId(route, currentStopId);
    }
}

function updateStopBuses(stopId, actuallyShownRoute) {

    // Determine which route (if any) should be visibly filtered in the stop info
    // - If caller passed undefined: use current shownRoute (maintains filter during async refreshes)
    // - If caller passed null/false/empty: show all (explicit override)
    // - If caller passed a route string: use it (unless 'fav')
    const visibleRoute = (typeof actuallyShownRoute === 'undefined')
        ? (shownRoute && shownRoute !== 'fav' ? shownRoute : undefined)
        : (actuallyShownRoute && actuallyShownRoute !== 'fav' ? actuallyShownRoute : undefined);

    let servicingEntries = []

    $('.info-stop-servicing').empty();

    const servicedRoutes = routesServicing(stopId)

    // Sort routes so that routes with in-service buses are at the end
    const sortedServicedRoutes = [...servicedRoutes].sort((a, b) => {
        const aHasInService = !routeHasInServiceBuses(a);
        const bHasInService = !routeHasInServiceBuses(b);
        
        // Routes with in-service buses should come after routes without
        if (aHasInService && !bHasInService) return 1;
        if (!aHasInService && bHasInService) return -1;
        return 0; // Keep original order for routes with same status
    });

    // console.log('servicedRoutes:', servicedRoutes)

    if (!servicedRoutes.length) {

        let stopNoBusesMsg

        if (!jQuery.isEmptyObject(busData)) {
            stopNoBusesMsg = 'NOT SERVICED BY ACTIVE ROUTES' /* when would this ever even be shown? */
        } else {
            stopNoBusesMsg = 'NO BUSES ACTIVE'
        }

        const $noneRouteElm = $(`<div class="no-buses">${stopNoBusesMsg}</div>`)
        $('.info-stop-servicing').append($noneRouteElm)
    }

    sortedServicedRoutes.forEach(servicedRoute => {
        
        const $serviedRouteElm = $(`<div>${servicedRoute.toUpperCase()}</div>`);
        if ((visibleRoute && visibleRoute !== servicedRoute) || !routeHasInServiceBuses(servicedRoute)) {
            $serviedRouteElm.css('color', 'var(--theme-hidden-route-col)');
        } else {
            $serviedRouteElm.css('color', colorMappings[servicedRoute]);
        }
        
        $('.info-stop-servicing').append($serviedRouteElm)
        // busIdsServicing = busIdsServicing.concat(busesByRoutes[servicedRoute]);
        busesByRoutes[selectedCampus][servicedRoute].forEach(busName => {

            let busStopId = busData[busName]['stopId']
            if (Array.isArray(busStopId)) {
                busStopId = busStopId[0];
            }

            // Add all buses on routes that service this stop
            let entry = {
                busName: busName,
                route: servicedRoute,
                eta: undefined // Will be set to 0 or actual ETA below
            };

            if (busData[busName]['at_stop'] && busStopId === stopId) {
                entry.eta = 0;
            } else if (busETAs[busName]) {
                if ((servicedRoute === 'wknd1' || servicedRoute === 'all' || servicedRoute === 'winter1' || servicedRoute === 'on1' || servicedRoute === 'summer1') && stopId === 3) { // special case: show both VIA paths
                    const viaMap = busETAs[busName] && busETAs[busName][3] && busETAs[busName][3]['via'];
                    if (viaMap && Object.keys(viaMap).length) {
                        const approachPrev = busData[busName] && busData[busName]['prevStopId'];
                        Object.entries(viaMap).forEach(([prevIdStr, etaSecs]) => {
                            const prevId = Number(prevIdStr);
                            const etaMins = Math.ceil(etaSecs / 60);
                            const nextStopId = getNextStopAfterCurrentGivenPrev(servicedRoute, prevId, 3);
                            const nextStop = stopsData[nextStopId];
                            const nextStopName = nextStop ? (nextStop.shorterName || nextStop.shortName || nextStop.mainName || nextStop.name) : '';

                            // Only show the current approach leg when the bus is still approaching SAC NB.
                            if (!busData[busName] || busData[busName]['next_stop'] !== 3 || !approachPrev || approachPrev === prevId) {
                                servicingEntries.push({
                                    busName: busName,
                                    route: servicedRoute,
                                    eta: etaMins,
                                    nextStopId: nextStopId,
                                    nextStopName: nextStopName,
                                    viaPrevStopId: prevId
                                });
                            }
                        });
                        // Skip the default entry since we added VIA entries above
                        return;
                    }
                } else {
                    const etaSecs = getETAForStop(busName, stopId)
                    if (etaSecs !== undefined) {
                        entry.eta = Math.ceil(etaSecs/60);
                    }
                }
            }

            // Add all buses on routes that service this stop
            servicingEntries.push(entry);
        })
    })

    const sortedEntries = servicingEntries
        .sort((a, b) => {
            const aDepot = busData[a.busName]?.atDepot;
            const bDepot = busData[b.busName]?.atDepot;
            if (aDepot && !bDepot) return 1;
            if (!aDepot && bDepot) return -1;

            const aInvalid = !isValid(a.busName);
            const bInvalid = !isValid(b.busName);
            if (aInvalid && !bInvalid) return 1;
            if (!aInvalid && bInvalid) return -1;

            const aDistanceFromLine = distanceFromLine(a.busName);
            const bDistanceFromLine = distanceFromLine(b.busName);
            if (aDistanceFromLine && !bDistanceFromLine) return 1;
            if (!aDistanceFromLine && bDistanceFromLine) return -1;

            // Keep 0 min at top relative ordering otherwise sort by ETA
            return a.eta - b.eta;
        });

    $('.stop-info-buses-grid, .stop-info-buses-grid-next').empty();

    // const infoNextStopsScrollPosition = $('.info-next-stops').scrollTop();
    // alert(infoNextStopsScrollPosition)

    sortedEntries.forEach(data => {

        // Skip out of service buses if hide setting is enabled
        if (hideOutOfServiceBuses && busData[data.busName].oos) {
            return;
        }

        const currentTime = new Date();
        currentTime.setMinutes(currentTime.getMinutes() + data.eta);
        const formattedTime = currentTime.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });

        const $routeCell = $('<div class="stop-bus-route"></div>');
        $routeCell.append(`<div>${data.route.toUpperCase()}</div>`);
        $('.stop-info-buses-grid').append($routeCell);

        let stopOctaconVisibilityClass = 'none'
        if (busData[data.busName].overtime) {
            stopOctaconVisibilityClass = ''
        }

        let stopOoSVisibilityClass = 'none';
        if (busData[data.busName].oos) {
            stopOoSVisibilityClass = '';
        }

        let stopDepotVisibilityClass = 'none';
        if (busData[data.busName].atDepot) {
            stopDepotVisibilityClass = '';
        }

        let busContainerStyle = '';
        if (data.eta === undefined || busData[data.busName].atDepot || distanceFromLine(data.busName) || !isValid(data.busName)) {
            busContainerStyle = ' style="grid-column: span 3;"';
        }

        const $stopBusElm = $(`<div class="flex justify-between align-center pointer"${busContainerStyle}>
            <div class="flex gap-x-0p5rem">
                <div class="stop-bus-name">${busData[data.busName].busName}</div>
                <div class="stop-oos ${stopOoSVisibilityClass}">OOS</div>
                <div class="stop-depot ${stopDepotVisibilityClass}">Depot</div>
            </div>
            <div class="stop-octagon ${stopOctaconVisibilityClass}"><div>!</div></div>
        </div>`)
        $('.stop-info-buses-grid').append($stopBusElm);

        if (visibleRoute && visibleRoute !== data.route) {
            $('.stop-octagon').last().css('background-color', 'var(--theme-hidden-route-col)').find('div').css('color', 'gray');
        }

        if (Object.is(data.eta, -0)) {
            $('.stop-info-buses-grid').append(`<div class="stop-bus-eta pointer">Detour</div>`);
            $('.stop-info-buses-grid').append(`<div class="pointer"></div>`);
        } else if (Object.is(data.eta, 0)) {
            $('.stop-info-buses-grid').append(`<div class="stop-bus-eta pointer">Here</div>`);
            $('.stop-info-buses-grid').append(`<div class="pointer"></div>`);
        } else if (data.eta === undefined || busData[data.busName].atDepot || distanceFromLine(data.busName) || !isValid(data.busName)) {
            // For invalid buses, the bus container already spans the remaining columns
            // Print the condition that led to
            let reason = '';
            if (data.eta === undefined) {
                reason += '[no ETA data] ';
            }
            if (busData[data.busName].atDepot) {
                reason += '[atDepot] ';
            }
            if (distanceFromLine(data.busName)) {
                reason += '[distanceFromLine] ';
            }
            if (!isValid(data.busName)) {
                reason += '[!isValid] ';
                // Add detailed reason why validation failed
                if (!busETAs[data.busName]) {
                    reason += '(no busETAs) ';
                } else {
                    // Check for negative ETA values
                    const route = busData[data.busName].route;
                    const invalidStops = [];
                    for (const stopId of stopLists[route]) {
                        const etaVal = getETAForStop(data.busName, stopId);
                        if (typeof etaVal === 'number' && etaVal < 0) {
                            invalidStops.push(`stop${stopId}:${etaVal}`);
                        }
                    }
                    if (invalidStops.length > 0) {
                        reason += `(negative ETAs: ${invalidStops.join(', ')}) `;
                    }
                }
            }
            // console.log(`[${data.busName}] xx:xx due to: ${reason.trim()}`);
        } else {
            $('.stop-info-buses-grid').append(`<div class="stop-bus-eta pointer">${data.eta >= 60 ? (data.eta%60 === 0 ? Math.floor(data.eta/60) + 'h' : Math.floor(data.eta/60) + 'h ' + data.eta%60 + 'm') : data.eta + 'm'}</div>`);
            $('.stop-info-buses-grid').append(`<div class="stop-bus-time pointer">${formattedTime}</div>`);
        }

        if (visibleRoute && visibleRoute !== data.route) {
            $('.stop-bus-route').last().css('color', 'var(--theme-hidden-route-col)');
            $('.stop-bus-eta').last().css('color', 'var(--theme-hidden-route-col)');
            $('.stop-info-buses-grid').children().slice(-4).removeClass('pointer');
        } else {
            if (routeHasInServiceBuses(data.route)) {
                $('.stop-bus-route').last().css('color', colorMappings[data.route]);
            } else {
                $('.stop-bus-route').last().css('color', 'gray');
            }
            $('.stop-info-buses-grid').children().slice(-4).click(function() {
                sourceStopId = stopId;
                flyToBus(data.busName);
                $('.stop-info-popup').hide(); // this was def being handled somewhere else before... need to check what happened sometime. Hard finding changes in recent commits that might've affected this.
            });
        }

        if (data.nextStopName) {
            $('.stop-info-buses-grid').append(`<div class="stop-bus-next-stop" style="font-weight: 500; font-size: 1.2rem; margin-top: -0.3rem; line-height: 1; grid-column: span 4; color: ${colorMappings[data.route]}">To ${data.nextStopName}</div>`);
        }
             
    })
    

    const loopTimes = calculateLoopTimes();
    const nextLoopEntries = servicingEntries.reduce((acc, entry) => {
        if (!busData[entry.busName].oos && !busData[entry.busName].atDepot && !distanceFromLine(entry.busName)) {
            acc.push({
                ...entry,
                eta: entry.eta + loopTimes[entry.route]
            })
        }
        return acc;
    }, [])
    .sort((a, b) => a.eta - b.eta);

    nextLoopEntries.forEach(data => {

        const currentTime = new Date();
        currentTime.setMinutes(currentTime.getMinutes() + data.eta);
        const formattedTime = currentTime.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true

        });


        if (!busData[data.busName].overtime && !busData[data.busName].oos && !busData[data.busName].atDepot && isValid(data.busName)) {

            const $routeCellNext = $('<div class="stop-bus-route"></div>');
            $routeCellNext.append(`<div>${data.route.toUpperCase()}</div>`);
            $('.stop-info-buses-grid-next').append($routeCellNext);

            const $stopBusElm = $(`<div class="flex justify-between align-center pointer">
                <div class="flex gap-x-0p5rem">
                    <div class="stop-bus-name">${busData[data.busName].busName}</div>
                </div>
            </div>`)
            $('.stop-info-buses-grid-next').append($stopBusElm);

            if (data.eta === 0) {
                // $('.stop-info-buses-grid').append(`<div></div>`)
                $('.stop-info-buses-grid-next').append(`<div class="stop-bus-eta pointer">Here</div>`);
                $('.stop-info-buses-grid-next').append(`<div class="pointer"></div>`);
            } else if (!busData[data.busName].atDepot) {
                $('.stop-info-buses-grid-next').append(`<div class="stop-bus-eta pointer right">${data.eta >= 60 ? (data.eta%60 === 0 ? Math.floor(data.eta/60) + 'h' : Math.floor(data.eta/60) + 'h ' + data.eta%60 + 'm') : data.eta + 'm'}</div>`);
                $('.stop-info-buses-grid-next').append(`<div class="stop-bus-time pointer">${formattedTime}</div>`);
            } else if (busData[data.busName].atDepot || distanceFromLine(data.busName)) {
                $('.stop-info-buses-grid-next').append(`<div class="stop-bus-eta pointer"></div>`);
                $('.stop-info-buses-grid-next').append(`<div class="stop-bus-time pointer"></div>`);
            }

            if (visibleRoute && visibleRoute !== data.route) {
                $('.stop-bus-route').last().css('color', 'var(--theme-hidden-route-col)');
                $('.stop-bus-eta').last().css('color', 'var(--theme-hidden-route-col)');
                $('.stop-info-buses-grid-next').children().slice(-4).removeClass('pointer');
            } else {
                $('.stop-bus-route').last().css('color', colorMappings[data.route]);
                $('.stop-info-buses-grid-next').children().slice(-4).click(function() {
                    sourceStopId = stopId;
                    flyToBus(data.busName);
                    $('.stop-info-popup').hide();
                });
            }

            if (data.nextStopName) {
                $('.stop-info-buses-grid-next').append(`<div class="stop-bus-next-stop" style="font-weight: 500; font-size: 1.2rem; margin-top: -0.3rem; line-height: 1; color: ${colorMappings[data.route]}">To ${data.nextStopName}</div>`);
            }
        }    
    })

    if (waits[stopId]) {
        const avgWait = waits[stopId];
        const mins = Math.floor(avgWait / 60);
        const secs = avgWait % 60;
        let waitStr = '';
        if (mins >= 1) {
            if (secs === 0) {
                waitStr = `${mins}m`;
            } else {
                waitStr = `${mins}m ${secs}s`;
            }
        } else {
            waitStr = `${secs}s`;
        }

        if (!jQuery.isEmptyObject(busData)) {
            $('.stop-info-avg-wait').text(`Buses stop here for ${waitStr} on average.`).show();
        }
    } else {
        $('.stop-info-avg-wait').hide();
    }
    
}

let sourceBusName = null;
let sourceStopId = null;

// Config object mapping stopId to its switch pair and direction info
const stopSwitchConfig = {
    'nb': {
        6: { // Hill North
            pair: 7,
            directions: [
                { label: 'NB', active: true, switch: 1 },
                { label: 'SB', active: false, switch: 2 }
            ]
        },
        7: { // Hill South
            pair: 6,
            directions: [
                { label: 'NB', active: false, switch: 1 },
                { label: 'SB', active: true, switch: 2 }
            ]
        },
        22: { // SoCam North
            pair: 23,
            directions: [
                { label: 'NB', active: true, switch: 1 },
                { label: 'SB', active: false, switch: 2 }
            ]
        },
        23: { // SoCam South
            pair: 22,
            directions: [
                { label: 'NB', active: false, switch: 1 },
                { label: 'SB', active: true, switch: 2 }
            ]
        },
        3: { // SAC North
            pair: 4,
            directions: [
                { label: 'NB', active: true, switch: 1 },
                { label: 'SB', active: false, switch: 2 }
            ]
        },
        4: { // SAC South
            pair: 3,
            directions: [
                { label: 'NB', active: false, switch: 1 },
                { label: 'SB', active: true, switch: 2 }
            ]
        },
        27: { // Werblin North
            pair: 11,
            directions: [
                { label: 'NB', active: true, switch: 1 },
                { label: 'SB', active: false, switch: 2 }
            ]
        },
        11: { // Werblin South
            pair: 27,
            directions: [
                { label: 'NB', active: false, switch: 1 },
                { label: 'SB', active: true, switch: 2 }
            ]
        },
        8: { // Allison Road Classrooms
            pair: 9,
            directions: [
                { label: 'ARC', active: true, switch: 1 },
                { label: 'Sci', active: false, switch: 2 }
            ]
        },
        9: { // Science Building
            pair: 8,
            directions: [
                { label: 'ARC', active: false, switch: 1 },
                { label: 'Sci', active: true, switch: 2 }
            ]
        }
    },
    'newark': {
        2: { // NJIT North
            pair: 3,
            directions: [
                { label: 'NB', active: true, switch: 1 },
                { label: 'SB', active: false, switch: 2 }
            ]
        },
        3: { // NJIT South
            pair: 2,
            directions: [
                { label: 'NB', active: false, switch: 1 },
                { label: 'SB', active: true, switch: 2 }
            ]
        },
        4: { // ICPH North
            pair: 5,
            directions: [
                { label: 'NB', active: true, switch: 1 },
                { label: 'SB', active: false, switch: 2 }
            ]
        },
        5: { // ICPH South
            pair: 4,
            directions: [
                { label: 'NB', active: false, switch: 1 },
                { label: 'SB', active: true, switch: 2 }
            ]
        },
        6: { // Bergen Building Front
            pair: 7,
            directions: [
                { label: 'Front', active: true, switch: 1 },
                { label: 'Back', active: false, switch: 2 }
            ]
        },
        7: { // Bergen Building Back
            pair: 6,
            directions: [
                { label: 'Front', active: false, switch: 1 },
                { label: 'Back', active: true, switch: 2 }
            ]
        },
    }
};

$(window).resize(function() {
    updateStopBusesMaxHeight();
});


function updateStopBusesMaxHeight() {
    const stopBuses = $('.stop-info-popup-inner');
    // if (stopBuses.length === 0) return; not sur ei need this
    const maxHeight = window.innerHeight - stopBuses.offset().top - $('.stop-btns').innerHeight() - $('.bottom').innerHeight();
    // console.log(maxHeight);
    $('.stop-info-popup-inner').css('max-height', maxHeight - 75);
}

async function popStopInfo(stopId) {
    // console.log('popStopInfo', stopId);
    
    if (!sim) {
        sa_event('stop_view_test', {
            'stop_id': stopId,
            'stop_name': stopsData[stopId].name
        });
        sa_event('view_stop', {
            'stop_id': stopId,
            'stop_name': stopsData[stopId].name
        });
    } else {
        sa_event('stop_view_test', {
            'stop_id': 'sim-' + stopId,
            'stop_name': 'sim-' + stopsData[stopId].name
        });
        sa_event('view_stop', {
            'stop_id': 'sim-' + stopId,
            'stop_name': 'sim-' + stopsData[stopId].name
        });
    }

    if (appStyle === 'rider') {
        popRiderStopInfo(stopId);
        return;
    }

    // Don't show stop info when in parking permit mode
    if ($('body').hasClass('parking-permit-mode')) {
        return;
    }
    if (popupStopId) {
        $(`img[stop-marker-id="${popupStopId}"]`).attr('src', 'img/stop_marker.png');
        busStopMarkers[popupStopId].setZIndexOffset(settings['toggle-stops-above-buses'] ? 1000 : 0);
        
        // If we have an active route filter, and it doesn't service the previous stop, hide it
        if (shownRoute && shownRoute !== 'fav' && stopLists[shownRoute]) {
            const isServiced = stopLists[shownRoute].some(id => Number(id) === Number(popupStopId));
            if (!isServiced) {
                busStopMarkers[popupStopId].remove();
            }
        }
    }

    // Ensure the newly selected stop marker is added to the map in case it was hidden by the route filter
    if (busStopMarkers[stopId]) {
        busStopMarkers[stopId].addTo(map);
    }

    $(`img[stop-marker-id="${stopId}"]`).attr('src', 'img/stop_marker_selected.png');
    busStopMarkers[stopId].setZIndexOffset(2000);

    if (Number(closestStopId) === stopId && (closestDistance < maxDistanceMiles || settings['toggle-bypass-max-distance'])) {
        $('.closest-stop').show();
    } else {
        $('.closest-stop').hide();
    }

    let stopName = stopsData[stopId].name;

    if (stopsData[stopId].mainName) {
        stopName = stopsData[stopId].mainName;
        const config = stopSwitchConfig[selectedCampus][stopId];
        if (config) {
            $('.info-stop-switch').css('display', 'inline-block');
            config.directions.forEach((dir, idx) => {
                const sel = `.info-stop-switch-${dir.switch}`;
                $(sel).text(dir.label);
                if (dir.active) {
                    $(sel).css('color', 'var(--theme-bg)').css('background-color', 'var(--theme-color)');
                } else {
                    $(sel).css('color', '').css('background-color', '');
                }
            });
            // Handle switch visibility and click
            config.directions.forEach((dir, idx) => {
                const sel = `.info-stop-switch-${dir.switch}`;
                // The "other" direction is the one that switches to the pair stop
                if (dir.active) return; // skip the active one
                if (!activeStops.includes(config.pair)) {
                    $(sel).hide();
                } else {
                    $(sel).show();
                    $('.stop-name-wrapper').parent().one('click', function() {popStopInfo(config.pair)});
                }
            });
        } else {
            $('.info-stop-switch').hide();
            $('.stop-name-wrapper').parent().off('click');
        }
    } else {
        $('.info-stop-switch').hide();
        $('.stop-name-wrapper').parent().off('click');
    }

    if (shownRoute && popupBusName) {
        busesByRoutes[selectedCampus][shownRoute].forEach(busName => {
            busMarkers[busName].getElement().style.display = '';
        })
        updateTooltips(shownRoute);
    } else {
        $('[stop-eta]').text('').hide();
    }

    popupStopId = stopId;

    // If we just unfocused a bus, check if its route has no in-service buses and prune polylines if needed
    if (popupBusName) {
        const route = busData[popupBusName].route;
        if (!routeHasInServiceBuses(route) && polylines[route]) {
            logPolylineRemoval(route, 'popStopInfo');
            try { polylines[route].remove(); } catch (e) {}
            delete polylines[route];
            // Keep routeBounds cached; recompute global polyline bounds via shared helper
            updatePolylineBoundsIfNeeded();
        }

        popupBusName = null;
    }

    if (!shownRoute) { // if we had a bus focused, stops not in its route would be hidden, e.g. tapping ARC from a wknd1 bus selected would have science building still hidden, and tapping the "Sci" mapping on top would fly to an invisible stop marker. Must show all.
        showAllStops();
    }

    if (selectedMarkerId && busMarkers[selectedMarkerId] ) { 
        const rotationElement = getMarkerRotationElement(busMarkers[selectedMarkerId]);
        if (rotationElement) {
            rotationElement.style.boxShadow = '';
        }
        selectedMarkerId = null;
    }

    $('.bus-info-popup, .route-panel, .my-location-popup, .knight-mover').hide();
    
    // Update route selectors to only show routes that service this stop
    populateRouteSelectors(activeRoutes, stopId);
    
    $('.settings-btn').hide();

    // return;

    $('.info-stop-name-text').text(settings['toggle-show-stop-id'] ? `${stopName} (#${stopId})` : stopName);

    // Compute second loop entries to check if we should show the shw next loop button
    const routesServicing = getRoutesServicingStop(stopId);
    let servicingEntries = [];
    routesServicing.forEach(route => {
        busesByRoutes[selectedCampus][route].forEach(busName => {
            if (isValid(busName)) {
                const eta = getETAForStop(busName, stopId);
                if (eta >= 0) {
                    servicingEntries.push({
                        busName: busName,
                        eta: eta,
                        route: route
                    });
                }
            }
        });
    });
    
    const loopTimes = calculateLoopTimes();
    const nextLoopEntries = servicingEntries.reduce((acc, entry) => {
        if (!busData[entry.busName].oos && !busData[entry.busName].atDepot && !distanceFromLine(entry.busName)) {
            acc.push({
                ...entry,
                eta: entry.eta + loopTimes[entry.route]
            });
        }
        return acc;
    }, []).sort((a, b) => a.eta - b.eta);

    const onlySpecialActive = activeRoutes.size > 0 && Array.from(activeRoutes).every(route => route === 'all' || route.endsWith('1') || route.endsWith('2'));
    const showSecondLoop = settings['toggle-always-show-second'] || onlySpecialActive;

    if (!showSecondLoop) {
        $('.stop-info-next-loop-wrapper').hide();
        $('.always-show-next-loop').hide(); // Hide always show button when wrapper is closed

        if (nextLoopEntries.length > 0) {
            $('.stop-info-show-next-loop').show();
        } else {
            $('.stop-info-show-next-loop').hide();
        }
    } else {
        $('.stop-info-next-loop-wrapper').show();
        $('.stop-info-show-next-loop').hide();
    }
    updateStopBuses(stopId, shownRoute);

    // Check if there are out of service buses and show hide button if not already hidden
    let hasOutOfServiceBuses = false;
    routesServicing.forEach(route => {
        busesByRoutes[selectedCampus][route].forEach(busName => {
            if (busData[busName].oos) {
                hasOutOfServiceBuses = true;
            }
        });
    });
    
    if (hasOutOfServiceBuses && !hideOutOfServiceBuses) {
        $('.stop-info-hide-oos').show();
    } else {
        $('.stop-info-hide-oos').hide();
    }

    if (sourceBusName && !sourceStopId) { // !sourceStopId kind a hack, have to look into how/why this is being set
        $('.stop-info-back-wrapper').css('display', 'flex');
    } else {
        $('.stop-info-back-wrapper').hide();
    }

    $('.stop-info-use-route-selectors-notice').hide();

    $('.stop-info-popup').stop(true, true).show();

    $('.stop-info-popup-inner').scrollTop(0);

    setTimeout(updateStopBusesMaxHeight, 0);

    $('.bus-log-wrapper').hide();

    $('.building-info-popup').hide();
    unhighlightBuilding();
}

async function addStopsToMap() {

    activeStops = []

    if (isForceShowStopsEnabled()) {
        const forceRoutes = getForceShowRoutes();
        for (const route of forceRoutes) {
            if (stopLists[route]) {
                activeStops = [...activeStops, ...stopLists[route]];
            }
        }
        activeStops = [...new Set(activeStops)];
    } else {
        for (const activeRoute in busesByRoutes[selectedCampus]) {
            if (!(activeRoute in stopLists)) { console.log('does this actually happen?'); continue; }
            activeStops = [...activeStops, ...stopLists[activeRoute]];
            activeStops = [...new Set(activeStops)];
        }
    }

    if (!activeStops.length && !isForceShowStopsEnabled()) {
        console.log('no buses running, showing all stops')
        activeStops = Array.from({length: Object.keys(stopsData).length}, (_, i) => i + 1);
    }

    checkIfLocationShared();

    // console.log(activeStops)
    activeStops.forEach(stopId => {

        if (!busStopMarkers[stopId]) { // Adding stops from new buses, need to exclude existing stops
            const thisStop = stopsData[stopId];
            const lat = thisStop['latitude'];
            const long = thisStop['longitude'];

            const marker = L.marker([lat, long], { 
                icon: L.divIcon({
                    className: 'custom-stop-icon',
                    iconSize: [30, 30],
                    iconAnchor: [15, 15],
                    html: `
                        <div class="marker-wrapper">
                            <img src="img/stop_marker.png" width="18" height="18" stop-marker-id="${stopId}"/>
                            <div class="corner-label none" stop-eta="${stopId}">xm</div>
                        </div>
                    `
                }),
                zIndexOffset: settings['toggle-stops-above-buses'] ? 1000 : 0,
            })
            .addTo(map)
            .on('click', function() {
                // Don't process stop clicks when in parking permit mode
                if ($('body').hasClass('parking-permit-mode')) {
                    return;
                }

                sourceStopId = null;
                sourceBusName = null;
                clearPanoutFeedback();
                popStopInfo(stopId);
                if (!shownRoute) {
                    showAllBuses();
                    showAllPolylines();
                }
            });
            
            busStopMarkers[stopId] = marker;
        }
    });
}



function removePreviouslyActiveStops() {
    let newActiveStops = [];

    if (isForceShowStopsEnabled()) {
        const forceRoutes = getForceShowRoutes();
        for (const route of forceRoutes) {
            if (stopLists[route]) {
                newActiveStops = [...newActiveStops, ...stopLists[route]];
            }
        }
    } else if (busesByRoutes && busesByRoutes[selectedCampus]) {
        for (const route in busesByRoutes[selectedCampus]) {
            if (route in stopLists) {
                newActiveStops = [...newActiveStops, ...stopLists[route]];
            }
        }
    }

    newActiveStops = [...new Set(newActiveStops)];

    if (newActiveStops.length === 0 && !isForceShowStopsEnabled()) {
        newActiveStops = Array.from({ length: Object.keys(stopsData).length }, (_, i) => i + 1);
    }

    for (const stopId in busStopMarkers) {
        if (!newActiveStops.includes(Number(stopId))) {
            map.removeLayer(busStopMarkers[stopId]);
            delete busStopMarkers[stopId];

            if (popupStopId === stopId) {
                popupStopId = null;
                hideInfoBoxes();
                sourceStopId = null;
            }
        }
    }

    activeStops = newActiveStops;
}



function routesServicing(stopId) {
    let routesServicing = []  
    let routesArray = Array.from(activeRoutes).filter(route => routesByCampusBase[selectedCampus].includes(route));
    routesArray.forEach(activeRoute => {
        if (stopLists[activeRoute].includes(stopId)) { // remove activeRoute in stopLists check after adding football routes + stops
            routesServicing.push(activeRoute);
        }
    })
    return routesServicing;
}


function progressToNextStop(busName) {
    if (!busData[busName]['next_stop']) {
        return 0;
    }

    const campusPercentages = percentageDistances[selectedCampus];

    const nextStopId = String(busData[busName]['next_stop']);
    if (!campusPercentages[nextStopId]) {
        return 0;
    }

    const prevStopId = String(busData[busName]['stopId']);
    if (!campusPercentages[nextStopId]['from'][prevStopId]) {
        return 0;
    }

    const nextStopDistances = campusPercentages[nextStopId]['from'][prevStopId]['geometry']['coordinates'];
    const percentages = campusPercentages[nextStopId]['from'][prevStopId]['properties']['percentages'];

    const busLat = busData[busName]['lat'];
    const busLng = busData[busName]['long'];

    // Step 1: Find the closest point
    let closestIndex = -1;
    let minDistance = Infinity;

    for (let i = 0; i < nextStopDistances.length; i++) {
        const pointLat = nextStopDistances[i][1];
        const pointLng = nextStopDistances[i][0];
        const dist = Math.sqrt(
            Math.pow(busLat - pointLat, 2) +
            Math.pow(busLng - pointLng, 2)
        );

        if (dist < minDistance) {
            minDistance = dist;
            closestIndex = i;
        }
    }

    // Step 2: Determine if the closest point is previous or future
    let previousPointIndex, nextPointIndex;

    if (closestIndex === 0) {
        previousPointIndex = 0;
        nextPointIndex = 1;
    } else if (closestIndex === nextStopDistances.length - 1) {
        previousPointIndex = nextStopDistances.length - 2;
        nextPointIndex = nextStopDistances.length - 1;
    } else {
        const previousPoint = nextStopDistances[closestIndex - 1];
        const nextPoint = nextStopDistances[closestIndex + 1];

        const distToPrevious = Math.sqrt(
            Math.pow(busLat - previousPoint[1], 2) +
            Math.pow(busLng - previousPoint[0], 2)
        );

        const distToNext = Math.sqrt(
            Math.pow(busLat - nextPoint[1], 2) +
            Math.pow(busLng - nextPoint[0], 2)
        );

        if (distToPrevious < distToNext) {
            previousPointIndex = closestIndex - 1;
            nextPointIndex = closestIndex;
        } else {
            previousPointIndex = closestIndex;
            nextPointIndex = closestIndex + 1;
        }
    }

    const previousPoint = nextStopDistances[previousPointIndex];
    const nextPoint = nextStopDistances[nextPointIndex];
    const previousPercentage = percentages[previousPointIndex];
    const nextPercentage = percentages[nextPointIndex];

    const distanceBetweenPoints = Math.sqrt(
        Math.pow(nextPoint[1] - previousPoint[1], 2) +
        Math.pow(nextPoint[0] - previousPoint[0], 2)
    );

    const distanceFromBusToPrevious = Math.sqrt(
        Math.pow(busLat - previousPoint[1], 2) +
        Math.pow(busLng - previousPoint[0], 2)
    );

    const progressBetweenPoints = distanceFromBusToPrevious / distanceBetweenPoints;
    const interpolatedPercentage = previousPercentage + (nextPercentage - previousPercentage) * progressBetweenPoints;

    return interpolatedPercentage;
}