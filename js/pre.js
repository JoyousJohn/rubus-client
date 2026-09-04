const excludedRouteMappings = {};

let tripshotDown = false;
let pendingForceImmediate = false;

// Composite server-outage state: tracks which RUBus/TripShot data sources are
// currently failing so the notification banner lists every active failure and
// only hides once all have recovered. Keys: 'bus positions', 'ETAs',
// 'wait times', 'live updates'.
const serverFailures = new Set();
let serverFailureDetail = '';

function markServerFailure(key, detail) {
    serverFailures.add(key);
    if (detail !== undefined) {
        serverFailureDetail = detail;
    }
    updateServerFailureBanner();
}

function clearServerFailure(key) {
    serverFailures.delete(key);
    if (key === 'bus positions') {
        serverFailureDetail = '';
    }
    if (serverFailures.size === 0) {
        serverFailureDetail = '';
    }
    updateServerFailureBanner();
}

function updateServerFailureBanner() {
    if (typeof $ === 'undefined') return;
    if (serverFailures.size === 0) {
        $('.notif-popup').slideUp();
        return;
    }
    const parts = ['bus positions', 'ETAs', 'wait times', 'live updates'].filter(key => serverFailures.has(key));
    let html = `RUBus/TripShot servers are experiencing issues. Unavailable: ${parts.join(', ')}.`;
    if (serverFailureDetail) {
        html += `<br><br>Error: ${serverFailureDetail}`;
    }
    $('.notif-popup').html(html).fadeIn();
}

async function immediatelyUpdateBusDataPre() {
    cancelAllAnimations();

    $('.updating-buses').stop(true, true).fadeIn();

    for (const busName in busData) {
        if (routesByCampus[busData[busName].route] !== selectedCampus) continue; // bc marker only created if selected campus. cna also just check if marker exists like i have commented out below, but i must've previously added that check and removed it to have my code fail fast... possible race condition back then somewhere? maybe when a marker created back on visibility change?
        if (busMarkers[busName]) {
            const iconElement = busMarkers[busName].getElement().querySelector('.bus-icon-outer');
            if (iconElement) {
                iconElement.style.backgroundColor = 'gray';
            }
        }
    }

    // Temporarily commented out for testing: Preemptively calling hideInfoBoxes() causes open bus/stop
    // popups to close immediately whenever network drops or long update gaps trigger an immediate update.
    // Downstream reconciliation in fetchBusData and makeBulkOoS already closes popups if a bus goes OOS
    // or updates the popup content in-place if the bus is still active.
    // hideInfoBoxes(); // Otherwise can check what menus were open and update them after getting new bus data - e.g. having to close "stopped for" from pre-existing selected bus if no longer stopped

    if ($('.buses-panel-wrapper').is(':visible')) { // hide info boxes closes this so we should show it again immediately as it shouldn't be included in the panels being hidden
        $('.buses-panel-wrapper').stop(true, true).show(); // true true to cancel slideup (which is already in progress) animation which completes *after* this .show, thus overrides
    }    

    await fetchWhere();
    checkMinRoutes(); // ddoes this work right?
    openRUBusSocket();
}

async function immediatelyUpdateBusDataPost() {
    $('.updating-buses').stop(true, true).slideUp();
}

async function fetchBusData(immediatelyUpdate, isInitial, skipPolylineUpdateFromFetch) {

    if (sim) return;
    if (busFetchInProgress) {
        if (forceImmediateUpdate || immediatelyUpdate) pendingForceImmediate = true;
        return;
    }
    busFetchInProgress = true;

    const url = 'https://demo.rubus.live/buses';

    const currentTime = new Date().getTime();
    const timeSinceLastPoll = currentTime - lastPollTime;

    // Determine if we should force immediate update
    // Priority: explicit caller flag > forced resume flag > long gap since last update > background/hidden tab > setting toggle
    const longGapSinceUpdate = (currentTime - (lastUpdateTime || 0)) > (pollDelay + pollDelayBuffer);
    const isDocHidden = (typeof document !== 'undefined' && document.visibilityState === 'hidden');
    const shouldImmediateUpdate = Boolean(immediatelyUpdate) || forceImmediateUpdate || longGapSinceUpdate || isDocHidden || settings['toggle-always-immediate-update'];
    
    // Allow immediate updates even on initial load if forceImmediateUpdate is set (app resume scenario)
    if (shouldImmediateUpdate && (!isInitial || forceImmediateUpdate)) {
        immediatelyUpdate = true;
        await immediatelyUpdateBusDataPre();
    } else {
        immediatelyUpdate = false;
    }

    lastPollTime = currentTime;
    
    let slowConnectionTimeout;
    let fetchTimeout;
    const controller = new AbortController();
    try {
        slowConnectionTimeout = setTimeout(() => {
            $('.slow-connection').slideDown();
        }, 3000);
        fetchTimeout = setTimeout(() => {
            controller.abort();
        }, 8000);
        const response = await fetch(url, {
            method: 'GET',
            signal: controller.signal
        });
        clearTimeout(slowConnectionTimeout);
        clearTimeout(fetchTimeout);
        $('.slow-connection').slideUp();

        if (!response.ok) {
            markServerFailure('bus positions');
            tripshotDown = true;
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (sim) return; // don't allow race conditions of simming before fetch completed

        if (!data || data.error) {
            markServerFailure('bus positions', data.error);
            tripshotDown = true;
            return;
        } else {
            // Server is responding successfully, hide notification popup and reset tripshotDown flag
            clearServerFailure('bus positions');
            if (tripshotDown) {
                tripshotDown = false;
            }
        }

        let activeBuses = [];
        let pollActiveRoutes = new Set();
        let hasNewOrChangedBuses = false;

        const priorActiveBuses = (typeof busMarkers !== 'undefined')
            ? Object.keys(busMarkers).filter(name => isBusShownOnMap(name))
            : [];
        const priorIdleBuses = priorActiveBuses.filter(name => !animationFrames[name]);
        const priorAnimatingBuses = priorActiveBuses.filter(name => !!animationFrames[name]);
        let pollMovedCount = 0;
        let pollUnchangedCount = 0;
        let pollDurations = [];

        for (const busName in data) {

            const markerExisted = !!busMarkers[busName];
            try {
            const bus = data[busName];

            if (Object.keys(excludedRouteMappings).includes(bus.route)) {
                continue;
            }

            const routeStr = normalizeFeedRoute(bus.route);
            if (!routeStr) {
                console.warn(`[api] Skipping bus ${busName} with non-serviceable route '${bus.route}'`);
                continue;
            }

            if (routesByCampus[routeStr] !== selectedCampus) {
                continue;
            }
            activeBuses.push(busName);

            let isNew = false;

            if (!busData[busName]) {
                console.log(`New bus in API: ${busName} (${routeStr})`)
                busData[busName] = {};
                busData[busName].previousTime = new Date().getTime() - 5000;
                const initLat = parseFiniteCoord(bus.lat);
                const initLng = parseFiniteCoord(bus.lng);
                busData[busName].previousPositions = (isFinite(initLat) && isFinite(initLng)) ? [[initLat, initLng]] : [];
                populateMeClosestStops();
                busData[busName].route = routeStr;
                busData[busName]['type'] = 'api';
                busData[busName]['campus'] = routesByCampus[routeStr];

                if (joined_service[busName]) {
                    busData[busName].joined_service = joined_service[busName];
                } else {
                    busData[busName].joined_service = new Date();
                }

                // Initialize position/status BEFORE deleteAllStops/addStopsToMap:
                // routeHasInServiceBuses() treats missing lat/long/oos/atDepot as
                // in-service (!undefined === true, distanceFromLine === false),
                // so calling addStopsToMap() before these are set falsely marks
                // a depot/OOS bus (e.g. helix) as in-service and narrows stops
                // to just its route instead of falling back to ALL stops.
                // This is why sim-exit (non-initial fetch) ended with 2 stops
                // while initial load (addStopsToMap deferred to makeNewMap,
                // after fields are set) correctly showed all 29.
                if (isFinite(initLat) && isFinite(initLng)) {
                    busData[busName].lat = initLat;
                    busData[busName].long = initLng;
                }
                busData[busName].oos = false;
                try {
                    busData[busName].atDepot = isAtDepot(bus.lng, bus.lat);
                } catch (e) {
                    busData[busName].atDepot = false;
                }

                // All stops are shown so no buses, and if this is the first bus, we need to hide all stops first before showing stops for this route
                if (Object.keys(busData).length === 1) {
                    console.log("Is first bus, deleting all stops")
                    makeBusesByRoutes();
                    deleteAllStops();
                }

                if (!isInitial) {
                    addStopsToMap();
                    updateTimeToStops([busName]);
                }

                busData[busName].busName = (typeof formatElectricBusName === 'function') ? formatElectricBusName(busName) : busName;
                await populateFavs();

                // The simulator may have started while this fetch was in
                // flight; bail so API data never mutates simulator state.
                if (sim) return;

                isNew = true;
                hasNewOrChangedBuses = true;

                if (!isInitial) {
                    const $time = $('<div></div>').text(new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }));
                    const $line = $('<div></div>');
                    $line.append($('<span></span>').text(routeStr.toUpperCase()).css('color', colorMappings[routeStr] || '#000'));
                    $line.append(document.createTextNode(' '));
                    $line.append($('<strong></strong>').text(busData[busName].busName || busName));
                    $line.append(document.createTextNode(' '));
                    $line.append($('<span style="color: var(--theme-accent);"></span>').text('in service'));
                    $('.bus-log').append($time).append($line);
                    $('.bus-log-wrapper').scrollTop($('.bus-log-wrapper')[0].scrollHeight);
                }

            } else {
                if (typeof isElectricBus === 'function' && isElectricBus(busName)) {
                    busData[busName].busName = formatElectricBusName(busData[busName].busName || busName);
                }
                if (busData[busName].route !== routeStr) { // Route changed for existing bus...
                    hasNewOrChangedBuses = true;
                    const oldRoute = busData[busName].route;
                    console.log(`[ROUTE CHANGE] Bus ${busName} changed routes: ${oldRoute} → ${routeStr}`);
                    busData[busName]['route_change'] = {
                        'old_route': oldRoute,
                        'route_change_time': new Date(),
                    };

                    delete busETAs[busName];
                    busData[busName].route = routeStr;
                    // Keep the cached campus in sync with the new route so
                    // per-bus consumers don't read a stale campus.
                    busData[busName]['campus'] = routesByCampus[routeStr];
                    
                    updateTimeToStops([busName]);

                    // Re-color the marker for its new route (all marker types,
                    // both renderer modes). Uses the same fallback as marker
                    // creation (plotBus) for routes without a color mapping.
                    busLayerManager.setBusRoute(busName, routeStr, colorMappings[routeStr] || '#446bef');

                    makeActiveRoutes();
                    if (!activeRoutes.has(oldRoute)) {
                        populateRouteSelectors(activeRoutes);
                        console.log(`[INFO] The last bus for route ${oldRoute} changed routes to ${routeStr}.`)
                        logPolylineRemoval(oldRoute, 'fetchBusData-routeChange');
                        console.log('Polylines on map before remove:', polylines[oldRoute] && polylines[oldRoute].isAdded ? polylines[oldRoute].isAdded() : false);
                        polylines[oldRoute].remove();
                        console.log('Polylines on map after remove:', polylines[oldRoute] && polylines[oldRoute].isAdded ? polylines[oldRoute].isAdded() : false);
                        updatePolylineBoundsIfNeeded();

                        if (shownRoute && shownRoute === oldRoute) {
                            toggleRoute(oldRoute);
                        }
                    }

                    if (!skipPolylineUpdateFromFetch && !polylines[routeStr] && isBusShownOnMap(busName)) {
                        setPolylines([routeStr]);
                    }
                    populateFavs();
                }
            }

            const apiLat = parseFiniteCoord(bus.lat);
            const apiLng = parseFiniteCoord(bus.lng);
            if (isFinite(apiLat) && isFinite(apiLng)) {
                busData[busName].lat = apiLat;
                busData[busName].long = apiLng;
            } else {
                warnInvalidCoords(busName, bus.lat, bus.lng, 'api');
            }

            if (!Array.isArray(busData[busName].previousPositions)) {
                console.error('[pre] previousPositions missing for', busName, '— initializing');
                busData[busName].previousPositions = [];
            }
            let lastPosition;
            try {
                lastPosition = busData[busName].previousPositions[busData[busName].previousPositions.length - 1];
            } catch (error) {
                console.error('Error accessing previous positions array:', error)
                console.error(busData)
                console.error(busMarkers)
            }

            // Movement is any change in latitude OR longitude, so one-axis
            // moves are never treated as "unchanged".
            const coordsAreFinite = isFinite(apiLat) && isFinite(apiLng);
            const moved = lastPosition && (lastPosition[0] !== apiLat || lastPosition[1] !== apiLng);

            if (moved) {
                const currentTime = new Date().getTime();
                const lastMoveTime = busData[busName].previousMoveTime || busData[busName].previousTime || currentTime;
                const timeSinceLastMove = currentTime - lastMoveTime;

                // Effective interval between GPS position changes:
                // Transit GPS feeds broadcast in ~5-12s intervals. If the bus was stationary at a stop
                // for longer (>15s), clamp to nominal 10s GPS interval so it resumes at normal driving speed.
                const effectiveInterval = Math.max(5000, Math.min(timeSinceLastMove, 12000));
                const animationDuration = effectiveInterval + 2500;

                busData[busName].apiAnimationDuration = animationDuration;
                busData[busName].previousMoveTime = currentTime;
                busData[busName].previousTime = currentTime;
                pollMovedCount++;
                pollDurations.push(animationDuration);

                // Only append finite coordinates to the Bézier history
                if (coordsAreFinite) {
                    busData[busName].previousPositions.push([apiLat, apiLng]);
                }
                
                if (popupBusName === busName && settings['toggle-distances-line-on-focus']) {
                    updateDistanceLinePositionMarker(busName);
                }
            } else {
                pollUnchangedCount++;
            }

            const apiRotation = parseFiniteCoord(bus.rotation);
            if (isFinite(apiRotation)) {
                busData[busName].rotation = apiRotation;
            }

            busData[busName].isKnown = knownRoutes.includes(routeStr);

            busData[busName].capacity = bus.capacity;

            busData[busName].oos = false;

            busData[busName].atDepot = isAtDepot(bus.lng, bus.lat);


            if (routesByCampus[busData[busName].route] === selectedCampus) {

                plotBus(busName, shouldImmediateUpdate, moved);
                if (shouldImmediateUpdate) {
                    const iconElement = busMarkers[busName].getElement().querySelector('.bus-icon-outer');
                    if (iconElement) {
                        iconElement.style.backgroundColor = colorMappings[routeStr];
                    }
                }   
            }

            calculateSpeed(busName);

            if (isNew && shownRoute && shownRoute !== routeStr) {
                busMarkers[busName].setVisibility(false);
            }

            if (isNew) {
                $('.info-panels-btn-wrapper').show();
            }

            makeBusesByRoutes();

            if (etas && Object.keys(etas).length > 0) {
                updateTimeToStops([busName]);
            }

            if (isBusShownOnMap(busName)) {
                pollActiveRoutes.add(busData[busName].route);
            }
 
            if (busName === popupBusName) {
                updateBusPopupSpeedOrCapacity(busName);
            }
            } catch (e) {
                console.error('[fetchBusData] error processing bus', busName, ':', e);
                // Preserve the busData ⟺ busMarkers invariant: if this bus is
                // new and its marker was never created (e.g. an exception in
                // the middle of the update), drop the busData entry so it's
                // re-fetched fresh next poll instead of persisting as a zombie
                // that crashes immediatelyUpdateBusDataPre / plotBus consumers.
                if (!markerExisted && !busMarkers[busName]) {
                    if (typeof busLayerManager !== 'undefined') {
                        busLayerManager.removeProxy(busName);
                    }
                    delete busMarkers[busName];
                    delete busETAs[busName];
                    delete busData[busName];
                }
            }
        }

        const routesNeedingPolylines = new Set(
            [...pollActiveRoutes].filter(route =>
                !polylines[route] &&
                getCampusRoutes(selectedCampus).includes(route)
            )
        );

        if (routesNeedingPolylines.size > 0 && !skipPolylineUpdateFromFetch) {
            await initRoutePointsCache(selectedCampus);
            if (sim) return;
            await setPolylines(routesNeedingPolylines, { fitBounds: false });
        }

        const newRoutes = new Set([...pollActiveRoutes].filter(route => !activeRoutes.has(route)));
        if (newRoutes.size > 0) {
            newRoutes.forEach(item => activeRoutes.add(item));
            populateRouteSelectors(activeRoutes);
            
            if (appStyle === 'rider') {
                updateRiderRoutes();
            }
        }
        prunePolylinesWithoutInService();

        if (hasNewOrChangedBuses && !sim) {
            fetchWhere();
        }

        if (shouldImmediateUpdate) {
            immediatelyUpdateBusDataPost();
        }

        lastUpdateTime = currentTime;
        localStorage.setItem('lastUpdateTime', lastUpdateTime.toString());
        forceImmediateUpdate = false;

        updateRubusResponseTime();

        clearServerFailure('bus positions');
        if (tripshotDown) {
            tripshotDown = false;
        }

        const oosBusNames = [];

        for (const busName in busData) { 
            if (busData[busName]['route'] === 'on1' || busData[busName]['route'] === 'on2') {
                continue;
            }

            if (!activeBuses.includes(busName)) {
                oosBusNames.push(busName);
            }
        }

        if (oosBusNames.length) {
            console.log(`[Out of Service][${oosBusNames.length}] Buses out of service: ${oosBusNames.join(', ')}`);
            makeBulkOoS(oosBusNames);
        }

        reconcileBusMarkers();

        if ($('.buses-panel-wrapper').is(':visible')) {
            updateBusOverview(Array.from(pollActiveRoutes));
        }

        if (popupStopId) {
            updateStopBuses(popupStopId, shownRoute);
        }

        if (typeof updateNavOnOutOfService === 'function') {
            updateNavOnOutOfService();
        }

        if (activeBuses.length) {
            $('.right-btns').removeClass('right-btns-bottom');
            if (!settings['toggle-show-knight-mover']){
                $('.knight-mover').hide();
            }
            checkMinRoutes();
        }

    } catch (error) {
        console.error('Error fetching bus data:', error);
        markServerFailure('bus positions');
    } finally {
        busFetchInProgress = false;
        // Guarantee the "UPDATING" badge settles. It's normally hidden by
        // immediatelyUpdateBusDataPost() on the success path; tucking the hide
        // here means a dropped/aborted/failed immediate fetch can never leave
        // the badge up (the badge is only shown after this fetch passed the
        // busFetchInProgress guard, so any failure lands in this finally).
        $('.updating-buses').stop(true, true).slideUp();
        if (pendingForceImmediate) {
            pendingForceImmediate = false;
            forceImmediateUpdate = true;
            setTimeout(() => fetchBusData(true, false), 0);
        }
    }
}

function makeBulkOoS(oosBusNames) {
    if (!oosBusNames.length) return;

    // Capture route info before deleting busData entries.
    const affectedRoutes = new Set();
    let removedSelectedBus = false;
    let removedSharedBus = false;

    for (const busName of oosBusNames) {
        const bus = busData[busName];
        if (!bus) continue;

        if (bus.route) affectedRoutes.add(bus.route);

        const $time = $('<div></div>').text(new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        const $line = $('<div></div>');
        $line.append($('<span></span>').text(bus.route.toUpperCase()).css('color', colorMappings[bus.route] || '#000'));
        $line.append(document.createTextNode(' '));
        $line.append($('<strong></strong>').text(busName));
        $line.append(document.createTextNode(' '));
        $line.append($('<span style="color: var(--theme-accent);"></span>').text('out of service'));
        $('.bus-log').append($time).append($line);
        $('.bus-log-wrapper').scrollTop($('.bus-log-wrapper')[0].scrollHeight);

        clearBusSpeed(busName);
        if (busMarkers[busName]) {
            busMarkers[busName].remove();
        }
        busLayerManager.removeProxy(busName);
        delete busMarkers[busName];
        delete busETAs[busName];
        delete busData[busName];

        // Remove any debug path layers this bus left on the map.
        removeBusPathLayers(busName);
        removeBusRotationPoints(busName);

        if (popupBusName === busName) removedSelectedBus = true;
        if (sharedBusName && sharedBusName === busName) removedSharedBus = true;
    }

    // Rebuild once instead of once per bus (avoids O(n²) when many buses go OoS).
    makeBusesByRoutes();

    let anyRouteEmptied = false;
    const emptiedRoutes = [];
    for (const route of affectedRoutes) {
        if (!busesByRoutes[selectedCampus] || !busesByRoutes[selectedCampus][route]) {
            anyRouteEmptied = true;
            emptiedRoutes.push(route);
            console.log(`[INFO] The last bus for route ${route} went out of service.`)
            activeRoutes.delete(route);

            if (appStyle === 'rider') {
                updateRiderRoutes();
            }

            if (route !== 'none') {
                console.log(`Removing polyline for route ${route}`);
                updatePolylineBoundsIfNeeded();
                if (polylines[route]) {
                    logPolylineRemoval(route, 'makeBulkOoS');
                    polylines[route].remove();
                }
            } else {
                console.log('Route is none');
            }
            delete polylines[route];
            $(`.route-selector[routename="${route}"]`).remove();

            if (shownRoute && shownRoute === route) {
                toggleRoute(route);
            }
        }
    }

    if (removedSelectedBus) {
        console.log("Selected bus went OOS");
        hideInfoBoxes();
        sourceBusName = null;
    }

    if (removedSharedBus) {
        $('.shared, .info-shared').hide();
        sharedBusName = null;
    }

    removePreviouslyActiveStops();
    // Recompute stop visibility after busData/busesByRoutes have been updated.
    // removePreviouslyActiveStops() only handles route membership; this also
    // catches routes whose remaining buses are invalid or off-route.
    updateStopsOpacity();
    populateMeClosestStops();
    populateFavs(false);

    if (anyRouteEmptied) {
        checkMinRoutes();
    }

    if (typeof updateNavOnOutOfService === 'function') {
        updateNavOnOutOfService(oosBusNames, emptiedRoutes);
    }
}

function reconcileBusMarkers() {
    // Guarantees the busData ⟺ busMarkers invariant after every poll. Any
    // busData entry whose marker is missing (a zombie left by a mid-fetch
    // error or external cleanup) is re-created via plotBus, or dropped so it's
    // re-fetched fresh next poll. Logged per-bus so a persistent root cause
    // stays visible instead of being silently swallowed.
    for (const busName in busData) {
        if (busMarkers[busName]) continue;
        try {
            plotBus(busName, false);
        } catch (e) {
            console.error('[reconcileBusMarkers] could not create marker for', busName, ':', e);
        }
        if (!busMarkers[busName]) {
            busLayerManager.removeProxy(busName);
            clearBusSpeed(busName);
            delete busETAs[busName];
            delete busData[busName];
        }
    }
}

function makeOoS(busName) {
    
    console.log(`[Out of Service][${new Date().toLocaleString('en-US', {timeZone: 'America/New_York', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false}).replace(',','')}] busName: ${busName}`)

    const _route = busData[busName] ? busData[busName].route : null;
    const $time = $('<div></div>').text(new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    const $line = $('<div></div>');
    if (_route) {
        $line.append($('<span></span>').text(_route.toUpperCase()).css('color', colorMappings[_route] || '#000'));
        $line.append(document.createTextNode(' '));
    }
    $line.append($('<strong></strong>').text(busName));
    $line.append(document.createTextNode(' '));
    $line.append($('<span style="color: var(--theme-accent);"></span>').text('out of service'));
    $('.bus-log').append($time).append($line);
    $('.bus-log-wrapper').scrollTop($('.bus-log-wrapper')[0].scrollHeight);

    clearBusSpeed(busName);
    if (busMarkers[busName]) { // investigate why this would occur
        busMarkers[busName].remove();
    }
    // Clean up WebGL proxy
    busLayerManager.removeProxy(busName);
    delete busMarkers[busName];
    delete busETAs[busName];

    // Remove any debug path layers (busLines/midpointCircle) this bus left on
    // the map — updateMarkerPosition won't run for it again to clean them up.
    removeBusPathLayers(busName);
    removeBusRotationPoints(busName);

    const route = busData[busName].route;

    const busDataCopy = JSON.parse(JSON.stringify(busData[busName]));

    delete busData[busName];   
    console.log("makeOos() busesByRoutes before: ", busesByRoutes)
    console.log("busData before: ", busData)
    makeBusesByRoutes(); // need to delete from busData first since the func pops busesByRoutes from busData
    console.log("makeOos() busesByRoutes after: ", busesByRoutes)
    console.log("busData after: ", busData)
    
    const emptiedRoutes = [];
    if (route && (!busesByRoutes[selectedCampus] || !busesByRoutes[selectedCampus][route])) { // for some reason route can be undefined, investigate. // if no more buses, buses by routes will no longer have a campus key. checking if no longer has this key, but can also update the make function to include the campus anyway.
        console.log(`[INFO] The last bus for route ${route} went out of service.`)
        activeRoutes.delete(route);
        emptiedRoutes.push(route);
        
        // Update rider routes if in rider mode
        if (appStyle === 'rider') {
            updateRiderRoutes();
        }
        
        if (route !== 'none') { // otherwise route should always exist... I don't want to just check if route exists in polylines, have to ensure code works flawlessly!
            console.log(`Removing polyline for route ${route}`);
            // Update global bounds since a route was removed
            updatePolylineBoundsIfNeeded();
            if (polylines[route]) {
                logPolylineRemoval(route, 'makeOoS');
                console.log('Polylines on map before remove:', polylines[route].isAdded ? polylines[route].isAdded() : false);
                polylines[route].remove();
                console.log('Polylines on map after remove:', polylines[route].isAdded ? polylines[route].isAdded() : false);
            }
        } else {
            console.log('Route is none');
        }
        delete polylines[route];
        $(`.route-selector[routename="${route}"]`).remove(); 
        checkMinRoutes();

        if (shownRoute && shownRoute === route) {
            toggleRoute(route);
        }

    } else if (!route) {
        // alert("Undefined route went OoS!")
        console.log("A bus with an undefined route claimed to go out of service... busData:");
        console.log(busDataCopy)
    }

    removePreviouslyActiveStops();
    // Recompute stop visibility after deleting the bus so the final serviced
    // route state is reflected immediately.
    updateStopsOpacity();

    if (popupBusName === busName) {
        console.log("Selected bus went OOS");
        console.log(popupBusName);
        console.log(busName);
        console.log(sourceBusName);
        hideInfoBoxes();
        sourceBusName = null;
        // Distance line will be removed by hideInfoBoxes -> removeDistanceLineOnFocus
    }

    if (sharedBusName && sharedBusName == busName) {
        $('.shared, .info-shared').hide();
        sharedBusName = null;
    }

    populateMeClosestStops();
    populateFavs(false); // Do I need this? <-- yes you do

    // Hide all-stops button if no buses remain
    if (Object.keys(busData).length === 0) {
        // $('.info-panels-btn-wrapper').hide();
    }

    if (typeof updateNavOnOutOfService === 'function') {
        updateNavOnOutOfService([busName], emptiedRoutes);
    }
}


function updateTimeToStops(busNames) {
    
    busNames.forEach(busName => {
        
        const data = busData[busName]
        let stopId = data.stopId

        if (Array.isArray(stopId)) {
            stopId = stopId[0]
        }

        if (!stopId) {
            return;
        }

        const busRoute = busData[busName].route
        const isSpecialRoute = (busRoute === 'wknd1' || busRoute === 'all' || busRoute === 'winter1' || busRoute === 'on1' || busRoute === 'summer1')
        const nextStop = getNextStopId(busRoute, stopId)
        busData[busName].next_stop = nextStop
        // console.log(`next stop for bus ${busName} is ${nextStop}`)

        let routeStops = stopLists[busRoute]
        // console.log(routeStops.length)
        let sortedStops = []
        let via; // capture approach leg only when special-case applies

        const nextStopIndex = routeStops.indexOf(nextStop);
        if (nextStopIndex !== -1) {
            sortedStops = routeStops.slice(nextStopIndex)
                            .concat(routeStops.slice(0, nextStopIndex));
        }

        if ((busRoute === 'wknd1' || busRoute === 'all' || busRoute === 'winter1' || busRoute === 'on1' || busRoute === 'summer1') && nextStop === 3) { // special case

            if (!busData[busName]['prevStopId']) { // very rare case when bus added to server data where next stop is sac nb and there is no previous data yet, accurate eta cannot be known
                delete busETAs[busName]
                return
            }

            const prevStopId = busData[busName]['prevStopId']
            via = prevStopId
            // console.log('special case')
            if (prevStopId === 2) {
                sortedStops = [3, 6, 9, 10, 12, 13, 14, 4, 17, 18, 19, 20, 21, 16, 22, 3, 1, 2] 
            } else if (prevStopId === 22) {
                sortedStops = [3, 1, 2, 3, 6, 9, 10, 12, 13, 14, 4, 17, 18, 19, 20, 21, 16, 22]
            }
        }

        // console.log(sortedStops.length)

        // Figure out if I need this:
        // if (nextStopIndex + 1 === routeStops.length) {
        //     sortedStops.push(routeStops[0])
        //     console.log('pushed ', routeStops[0])
        // } else {
        //     sortedStops.push(routeStops[nextStopIndex + 1])
        // }

        let currentETA = 0

        // console.log(' ')
        // console.log(busName)
        // console.log('sortedStops: ',sortedStops)

        for (let i = 0; i < sortedStops.length; i++) {

            if (etas) {

                let prevStopId;
                let progress = 0;

                if (i === 0 && !data['at_stop']) {
                    prevStopId = sortedStops[sortedStops.length-1]

                    progress = (sim && busData[busName] && busData[busName].sim) ? progressPercentFor(busName) : progressToNextStop(busName);
                    busData[busName]['progress'] = progress
                    // console.log(`Progress for busName ${busName} (name: ${busData[busName].busName}): ${Math.round(progress*100)}%`)

                } else if (i === 0 && data['at_stop']) {

                    prevStopId = sortedStops[sortedStops.length-1]

                    const timeArrived = new Date(data.timeArrived)
                    let arrivedAgoSeconds = Math.floor((new Date().getTime() - timeArrived) / 1000)

                    // if (arrivedAgoSeconds > 0) {

                    const avgWaitAtStop = waits ? waits[prevStopId] : undefined

                    if (avgWaitAtStop) {
                        if (arrivedAgoSeconds < avgWaitAtStop) {
                            const expectedWaitAtStop = avgWaitAtStop - arrivedAgoSeconds
    
                            currentETA += expectedWaitAtStop;
                            busData[busName]['overtime'] = false;
                        } else {
                            busData[busName]['overtime'] = true;
    
                            if (popupBusName === busName && !overtimeInterval && settings['toggle-show-bus-overtime-timer']) {
                                startOvertimeCounter(busName);
                            }
                        }
                    }  
                } else {
                    prevStopId = sortedStops[i-1]
                }

                const thisStopId = sortedStops[i]

                // NOT SURE IF NEEDED??
                // If the bus is at this stop, set ETA to 0
                // if (data['at_stop'] && ((Array.isArray(data['stopId']) && thisStopId === data['stopId'][0]) || thisStopId === data['stopId'])) {
                //     if ((busRoute === 'wknd1' || busRoute === 'all' || busRoute === 'winter1' || busRoute === 'on1' || busRoute === 'summer1') && thisStopId === 3) {
                //         if (!busETAs[busName][thisStopId]) busETAs[busName][thisStopId] = {'via': {}}
                //         busETAs[busName][thisStopId]['via'][prevStopId] = 0;
                //     } else {
                //         busETAs[busName][thisStopId] = 0;
                //     }
                //     continue;
                // }

                // console.log('prev stop: ', prevStopId)
                // console.log('thisStopId stop: ', thisStopId)
                // console.log('eta: ', currentETA)

                // console.table(etas[thisStopId])

                if (etas && etas[thisStopId] && prevStopId in etas[thisStopId]['from']) {
                    currentETA += Math.round(etas[thisStopId]['from'][prevStopId] * (1 - progress))
                    // console.log(Math.round(etas[thisStopId]['from'][prevStopId]))
                } else {
                    // console.log(routeStops)
                    // console.log('nextStop: ', nextStop)
                    // console.log('i: ' + i + ' thisStopId -> [' + thisStopId + '][from][' + prevStopId + '] <- prevStopId' + ' not found.')
                    currentETA += 300 * (1 - progress)
                    // console.log(``)
                }

                if (i !== 0 && waits && waits[prevStopId]) {
                    currentETA += waits[prevStopId]
                    // console.log(`Adding ${waits[prevStopId]}s to currentETA to get to stopId ${thisStopId}`)
                } else if (i !== 0) {
                    currentETA += 30
                }

                if (!busETAs[busName]) {
                    busETAs[busName] = {};
                }

                // console.log(thisStopId)

                if (isSpecialRoute && thisStopId === 3) { // special handling for SAC North
                    // Determine the approach leg for this occurrence of 3
                    const approachPrev = (i === 0 && busData[busName] && busData[busName]['prevStopId']) ? busData[busName]['prevStopId'] : prevStopId;
                    if (approachPrev !== undefined) {
                        if (!busETAs[busName][thisStopId]) busETAs[busName][thisStopId] = {'via': {}}
                        busETAs[busName][thisStopId]['via'][approachPrev] = Math.round(currentETA)
                    }
                    // Do not overwrite stop 3 with a numeric ETA on special routes
                } else {
                    busETAs[busName][thisStopId] = Math.round(currentETA)
                }

            }
        }

        if (popupBusName === busName) {
            popInfo(busName)
        }

    });

    if (shownRoute && !popupBusName && !popupStopId) {
        updateTooltips(shownRoute);
    }
}


async function fetchWhere() {
    if (sim) return;
    try {
        const response = await fetch('https://demo.rubus.live/where');
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        const data = await response.json();
        const busLocations = data;
        // console.log('Bus locations fetched:', busLocations);

        updateRubusResponseTime();

        const validBusNames = []
        for (const busName in busLocations) {

            // if (!(busName in busData)) { continue; } // refreshed page and bus went out of service before backend could remove from busdata, still in bus_locactions.
            
            if (!busData[busName]) {
                continue;
                // busData[busName] = {
                //     'route': busLocations[busName]['route'],
                //     'src_test': 'fetchWhere',
                //     'previousPositions': [] // hope this is enough?
                // } // may need to set previousPosition keys here
            }
            
            if (!busLocations[busName]['where']) { continue; } // joined service and didn't get to a stop polygon yet        
            
            busData[busName]['stopId'] = parseInt(busLocations[busName]['where'][0]);
            if (busLocations[busName]['where'].length === 2) {
                busData[busName]['prevStopId'] = parseInt(busLocations[busName]['where'][1]);
                busData[busName]['at_stop'] = false;
            } else if (busLocations[busName]['where'].length === 1) {
                busData[busName]['at_stop'] = true;
                delete busData[busName]['prevStopId'];
            }

            updateRouteBusStatus(busName);

            validBusNames.push(busName);
        }

        if (typeof immediatelyUpdateStoppedBusRotations === 'function') {
            immediatelyUpdateStoppedBusRotations();
        }

        updateTimeToStops(validBusNames);
        if (panelRoute) {
            for (const bName of validBusNames) {
                updateRouteBusStatus(bName);
            }
        }
        if (popupStopId) {
            // Preserve any active route filter in the stop info
            updateStopBuses(popupStopId);
        }

        if (popupBusName) {
            popInfo(popupBusName);
        }

        // Update all stops menu if info panels are open (after activeStops is created)
        if ($('.info-panels-show-hide-wrapper').is(':visible')) {
            populateAllStops();
        }

    } catch (error) {
        console.error('Error fetching bus locations:', error);
        markRubusRequestsFailing();
        markServerFailure('bus positions');
    }

}



function getEasternHourAndDayOfWeek() {
    const now = new Date();
    const easternStr = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
    const easternDate = new Date(easternStr);
    return {
        year: easternDate.getFullYear(),
        month: easternDate.getMonth(), // 0-11
        date: easternDate.getDate(),
        hour: easternDate.getHours(),
        dayOfWeek: easternDate.getDay() // 0-6 (0=Sun)
    };
}

// Knight Mover stops accepting calls 15 minutes before it leaves service so the
// driver can finish the active trip(s) already in progress. Instead of hardcoding
// the call cutoff, subtract this buffer from the service end hour dynamically so
// the "accepts calls until" text stays correct if the schedule ever changes.
const KNIGHT_MOVER_CALL_BUFFER_MIN = 15;

function formatKnightMoverCallCutoff(serviceEndHour) {
    const totalMinutes = serviceEndHour * 60 - KNIGHT_MOVER_CALL_BUFFER_MIN;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const suffix = hours >= 12 ? 'PM' : 'AM';
    const displayHour = hours % 12 === 0 ? 12 : hours % 12;
    return `${displayHour}:${String(minutes).padStart(2, '0')}${suffix}`;
}

function checkMinRoutes() {

    // The Call Knight Mover popup must never appear while the simulator is
    // running. It's still hidden at the end of startSim() and when closing a
    // stop popup, but hideInfoBoxes() re-invokes checkMinRoutes() to restore
    // it after a drag, which would otherwise resurrect it mid-sim.
    if (sim) {
        $('.knight-mover').hide();
        return;
    }

    const { year: currentYear, month: currentMonth, date: currentDay, hour, dayOfWeek } = getEasternHourAndDayOfWeek();
    
    // Check if within spring break period (March 14-23 for 2026, March 11-19 for 2027, March 10-23 for other years)
    let isSpringBreak = false;
    if (currentYear === 2026) {
        isSpringBreak = (currentMonth === 2 && currentDay >= 14 && currentDay <= 23);
    } else if (currentYear === 2027) {
        isSpringBreak = (currentMonth === 2 && currentDay >= 11 && currentDay <= 19);
    } else {
        isSpringBreak = (currentMonth === 2 && currentDay >= 10 && currentDay <= 23);
    }

    // Check if summer period (valid until 8/25, i.e., before August 25)
    // currentMonth is 0-indexed (May=4, June=5, July=6, August=7)
    const isSummer = (currentMonth > 4 || (currentMonth === 4 && currentDay >= 15)) && (currentMonth < 7 || (currentMonth === 7 && currentDay <= 25));

    let isKnightMoverActive = false;

    if (isSpringBreak) {
        console.log("Spring break detected!");
        const knightMoverStartHour = 12;
        const knightMoverEndHour = 10;
        $('#knight-mover-hours').html(
            `Knight Mover accepts calls until ${formatKnightMoverCallCutoff(knightMoverEndHour)}<br>` +
            `<span style="color: #4babd7ff">(${currentYear} spring recess special hours)</span>`
        );
        if (hour >= knightMoverStartHour || hour < knightMoverEndHour) {
            isKnightMoverActive = true;
        }
    } else if (isSummer) {
        // Summer hours valid until 8/25:
        // Weekdays (Mon=1..Fri=5 morning): Midnight to 7:00 AM (0..6)
        // Weekends/Holidays (Fri night, Sat, Sun): 7:00 PM (19) to 10:00 AM (9)
        const isWeekendOrHoliday = (dayOfWeek === 0 || dayOfWeek === 6);
        if (isWeekendOrHoliday) {
            // 7:00 PM to 10:00 AM
            const summerWeekendEndHour = 10;
            if (hour >= 19 || hour < summerWeekendEndHour) {
                isKnightMoverActive = true;
            }
            $('#knight-mover-hours').html(`Knight Mover accepts calls until ${formatKnightMoverCallCutoff(summerWeekendEndHour)}`);
        } else {
            // Weekday: Midnight to 7:00 AM
            const summerWeekdayEndHour = 7;
            if (hour >= 0 && hour < summerWeekdayEndHour) {
                isKnightMoverActive = true;
            }
            $('#knight-mover-hours').html(`Knight Mover accepts calls until ${formatKnightMoverCallCutoff(summerWeekdayEndHour)}`);
        }
    } else {
        // Regular semester schedule
        // Fri–Sun: no Knight Mover; Mon–Thu overnight: 3:00 AM to service end.
        // Service runs until 6:00 AM; the call cutoff (5:45 AM) is derived from
        // that via the 15-minute buffer so the text is never hardcoded.
        const knightMoverEndHour = 6;
        if (dayOfWeek >= 1 && dayOfWeek <= 4 && hour >= 3 && hour < knightMoverEndHour) {
            isKnightMoverActive = true;
        }
        $('#knight-mover-hours').html(`Knight Mover accepts calls until ${formatKnightMoverCallCutoff(knightMoverEndHour)}`);
    }

    // console.log(`[KnightMover Debug] active:${isKnightMoverActive}, campus:${selectedCampus}, appStyle:${appStyle}, userSettingOverride:${settings['toggle-show-knight-mover']}, time:${currentMonth+1}/${currentDay}/${currentYear} ${hour}:00, day:${dayOfWeek}`);

    if (!isKnightMoverActive) {
        $('.knight-mover').hide();
        return;
    }

    if (selectedCampus !== 'nb' || appStyle === 'rider') {
        $('.knight-mover').hide();
        return;
    }

    $('.knight-mover').show();

    updateKnightMoverStatus();
}

function updateKnightMoverStatus() {
    let validBuses = 0;
    for (const busName in busData) {
        if (!busData[busName].oos && !busData[busName].atDepot && isValid(busName)) {
            validBuses++;
        }
    }
    $('#knight-mover-status').text(
        validBuses > 0 ? '\u24D8 Partial bus service' : '\u24D8 No buses in service'
    );
}

function makeActiveRoutes() {
    activeRoutes.clear();
    for (const busName in busData) {
        if (!settings['toggle-show-out-of-service'] && !isBusShownOnMap(busName)) continue;
        const route = busData[busName].route;
        if (route) activeRoutes.add(route);
    }
    populateRouteSelectors(activeRoutes); 
}


let cachedAlertMessages = null;

function clearAlertsDisplay() {
    $('.tripshot-messages-list').empty();
    $('.tripshot-mini').empty();
}

function refreshAlertsDisplay() {
    if (!cachedAlertMessages) return;
    clearAlertsDisplay();
    populateMessages(cachedAlertMessages);
}

function populateMessages(messages) {
    messages.forEach(message => {
        console.log(message)

        const createdUTC = message['createdUtc'];
        console.log(createdUTC)
        const createdLocalDatetime = new Date(createdUTC + 'Z');
        const createdFormatted = createdLocalDatetime.toLocaleString('en-US', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });

        let title = message['gtfsAlertHeaderText'];
        title = title.replace(/^\d{1,2}\/\d{1,2}:\s*/, '');
        title = title.replace(/:$/, '');
        title = title.replace(/^[A-Za-z]{3}\s\d{1,2}\/\d{1,2}:\s*/, ''); // Remove date prefix like "Wed 4/23: "
        title = title.replace(/^[A-Za-z]+\s\d{1,2}\/\d{1,2}\s/, ''); // Remove date prefix like "Wednesday 8/27 "
        title = title.replace(/^[A-Za-z]+\s\d{1,2}\/\d{1,2}\/\d{2,4}-/, ''); // Remove "Sunday 8/31/25-" style
        title = title.replace(/^[A-Za-z]{3,9}\s\d{1,2}\/\d{1,2}\/\d{2,4}:\s*/, '');
        title = title.replace(/^[A-Za-z]+\s\d{1,2}\/\d{1,2}:\s*/, ''); // Remove date prefix like "Monday 9/15: "
        title = title.replace('New Brunswick', 'NB');

        let desc = message['gtfsAlertDescriptionText'];
        desc = desc.replace(/^[A-Za-z]+\s\d{1,2}\/\d{1,2}\/\d{2,4}:\s*/, '');        

        // Skip alerts that mention a campus other than the selected one (unless setting overrides)
        if (!settings['toggle-show-alerts-other-campuses']) {
            const titleLower = title.toLowerCase();
            const otherCampusPatterns = {
                nb: [/camden/, /newark/],
                camden: [/\bnb\b/, /newark/],
                newark: [/\bnb\b/, /camden/]
            };
            const patterns = otherCampusPatterns[selectedCampus];
            if (patterns && patterns.some(re => re.test(titleLower))) {
                return; // Don't show this alert
            }
        }

        // console.log(message)

        const $msgElm = $(
            `<div data-alert-big="${message['id']}" class="none">
                <div class="flex flex-col gap-y-1rem br-1rem" style="background-color: var(--theme-bg); padding: 2rem 3rem;">
                    <div class="center bold-500">${title}</div>
                    <div class="text-1p4rem">${desc}</div>
                    <div class="text-1p2rem" style="color: var(--theme-extra);">${createdFormatted}</div>
                    <div class="flex justify-between text-1p2rem">
                        <div id="big-hide" class="pointer">Hide</div>
                        <div id="big-close" class="pointer" style="color: #f22c2c;">Close</div>
                    </div>
                </div>
            </div>
            `)

            $msgElm.find('#big-hide').click(function() {
                $(`[data-alert-big="${message['id']}"]`).slideUp();
                $(`.tripshot-mini-alert[data-alert-mini="${message['id']}"]`).show();
            })

            $msgElm.find('#big-close').click(function() {
                $(this).parent().parent().remove();
                $(`.tripshot-mini-alert[data-alert-mini="${message['id']}"]`).remove();
            })

        $('.tripshot-messages-list').append($msgElm)

        const $miniElm = $(`<div data-alert-mini="${message['id']}" class="tripshot-mini-alert gap-x-0p5rem pointer">
            <div class="br-1rem bold flex justify-center align-center" style="background-color: white; color: red; aspect-ratio: 1; height: 100%;">!</div>
            <div class="pr-0p5rem">${title}</div>
        </div>`);
        
        $miniElm.click(function() {
            $(`[data-alert-big="${message['id']}"]`).slideDown();
            $(`[data-alert-mini="${message['id']}"]`).hide();
        });
        
        $('.tripshot-mini').append($miniElm);

    })

}

function getMessages() {
    const payload = {
        systemSelected0: "1268",
        amount: 1, // unsure what this does
    };

    fetch("https://passiogo.com/goServices.php?getAlertMessages=1&deviceId=21050160&alertCRC=0d4cbb29&buildNo=110&embedded=0", {
    method: "POST",
    headers: {
        "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "json=" + encodeURIComponent(JSON.stringify(payload))
    })
    .then(res => res.json())
    .then(data => {
        const messages = data.msgs;
        if (messages) {
            cachedAlertMessages = messages;
            clearAlertsDisplay();
            populateMessages(messages);
        }
    })
    .catch(err => console.error("Error", err));

}


function cancelAllAnimations() {
    Object.keys(animationFrames).forEach(busName => {
        delete animationFrames[busName];
    });
}


let joined_service = {};

async function fetchETAs() {
    // Capture the campus once: both fetches below key their data by
    // selectedCampus, and switching campus mid-flight would otherwise mix ETAs
    // and waits from different campuses for one poll cycle.
    const campus = selectedCampus;
    // The caller (resume handler) sets this flag to signal a user-visible pull,
    // e.g. after long idle when ETAs are stale. Surface an honest indicator
    // while it runs; the init/campus-switch callers leave it unset so no badge
    // flashes there.
    const showIndicator = _etAsRefreshScheduled === true;
    if (showIndicator) {
        $('.refreshing-etas').stop(true, true).fadeIn();
    }
    // Track sub-fetch success so the resume gate's freshness timestamp is only
    // advanced when the tables actually refreshed: a failed or aborted fetch
    // leaves lastETAsFetchTime stale so the next resume retries immediately
    // instead of waiting out the freshness window.
    let etasSucceeded = false;
    let waitsSucceeded = false;

    const etasController = new AbortController();
    const etasFetchTimeout = setTimeout(() => etasController.abort(), 8000);
    try {
        const response = await fetch('https://demo.rubus.live/etas', {
            method: 'GET',
            signal: etasController.signal
        });
        clearTimeout(etasFetchTimeout);
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        const data = await response.json();
        etas = data[campus] || {}; // can prob remove || {} if server defaults eta obj empty campus mappings
        // console.log('ETAs fetched:', etas);
        // updateTimeToStops('all')
        etasSucceeded = true;

        clearServerFailure('ETAs');

        updateRubusResponseTime();
    } catch (error) {
        clearTimeout(etasFetchTimeout);
        console.error('Error fetching ETAs:', error);
        markRubusRequestsFailing();

        markServerFailure('ETAs');
    }

    const waitsController = new AbortController();
    const waitsFetchTimeout = setTimeout(() => waitsController.abort(), 8000);
    try {
        const response = await fetch('https://demo.rubus.live/waits', {
            method: 'GET',
            signal: waitsController.signal
        });
        clearTimeout(waitsFetchTimeout);
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        const data = await response.json();
        waits = data[campus];
        updateWaitTimes();
        // console.log('Waits fetched:', waits);
        waitsSucceeded = true;

        clearServerFailure('wait times');

        updateRubusResponseTime();
    } catch (error) {
        clearTimeout(waitsFetchTimeout);
        console.error('Error fetching waits:', error);
        markRubusRequestsFailing();
        markServerFailure('wait times');
    }

    // Only advance the freshness timestamp when both tables refreshed; a failed
    // or aborted fetch leaves it stale so the resume gate retries promptly.
    if (etasSucceeded && waitsSucceeded) {
        lastETAsFetchTime = Date.now();
    }

    // Deterministic re-render once the ETA/waits tables are ready: recompute
    // busETAs from the (possibly new) tables, then refresh any open stop popup
    // so it never keeps showing values derived from a stale table (and any new
    // popup opened between the start of this fetch and its completion gets the
    // fresh numbers immediately on open). updateStoBuses itself is guarded and
    // renders missing busETAs as dimmed no-ETA rows, which is the honest state
    // before the tables are populated.
    if (typeof busData === 'object' && busData !== null) {
        Object.keys(busData).forEach(busName => {
            if (busData[busName] && busData[busName].route) {
                updateTimeToStops([busName]);
            }
        });
    }
    if (popupStopId) {
        updateStopBuses(popupStopId);
    }

    // Hide the indicator once both fetches settle (success or error) so it
    // never lingers if a sub-fetch throws.
    if (typeof $ !== 'undefined') {
        $('.refreshing-etas').stop(true, true).slideUp();
    }

}

$(document).ready(async function() {
    // Initialize settings before map is created
    settings = typeof loadSettingsFromStorage === 'function'
        ? loadSettingsFromStorage()
        : null;
    if (!settings) {
        settings = {...defaultSettings};
    }

    // Restore timing variables from localStorage to survive bfcache restoration
    const storedLastUpdateTime = localStorage.getItem('lastUpdateTime');
    if (storedLastUpdateTime) {
        lastUpdateTime = parseInt(storedLastUpdateTime);
    }

    async function fetchJoinTimes() {
        try {
            const response = await fetch('https://demo.rubus.live/joined_service');
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            joined_service = await response.json();
            // console.log('Bus joined service times:', joined_service);

        } catch (error) {
            console.error('Error fetching joined service times:', error);
            markRubusRequestsFailing();
        }
    }

    await Promise.all([
        fetchJoinTimes(),
        typeof initRoutePointsCache === 'function' ? initRoutePointsCache(selectedCampus) : Promise.resolve()
    ]);

    async function initBusDataPipeline() {
        await fetchBusData(false, true);

        $('.loading-buses').stop(true, true).fadeOut(400, function() {
            // The badge is locked visible by `.loading-buses:not(.none) { display:
            // inline-flex !important }` (index.css:530), so a plain fadeOut()'s
            // inline `display:none` is ignored and the badge pops back in. Add the
            // `none` class once faded so it leaves that selector and stays hidden.
            $(this).addClass('none');
        });

        document.dispatchEvent(new Event('rubus-bus-data-loaded'));

        checkShared();


        makeActiveRoutes();
        // setPolylines(activeRoutes);
        updatePolylineBoundsIfNeeded();

        // Fit once to the final route bounds after all polylines have loaded.
        // setPolylines in fetchBusData is called once per new route with
        // fitBounds:false, so this single fit is where the initial zoom-out
        // happens (skipped when there are no buses to fit).
        if (activeRoutes.size > 0 && polylineBounds && polylineBounds.isValid()) {
            map.fitBounds(polylineBounds, { padding: [10, 10] });
        }

        // console.log(activeRoutes)

        if (activeRoutes.size > 0) {
            updateMarkerSize(); // set correct html marker size before plotting
            checkMinRoutes();
        } else {
            $('.info-main').css('justify-content', 'center'); // change back once buses go in serve. Gonna be annoying to implement that
            // setTimeout(() => {
                // $('.bus-info-popup').hide();
            // Never surface the Call Knight Mover popup while the simulator is
            // running, even when a real fetch poll lands with no active routes.
            if (!sim && !tripshotDown && selectedCampus === 'nb') $('.knight-mover').show();

            const now = new Date();
            const hour = now.getHours();
            // Only surface the no-active-routes message when no fetch is
            // failing: if the failure banner is up, it must not be overwritten.
            if (serverFailures.size === 0 && hour >= 8 && hour < 23) {
                $('.knight-mover').hide();
                $('.notif-popup').html(
                    `Passio servers are unavailable. Data shown may be limited. This affects all bus apps.<br><br>You can still see navigation directions, including what bus to take, by tapping the search icon towards the bottom right.<br><br>RUBus will immediately display buses once Passio is back online.` +
                    `<br><br><span class="notif-close-btn" style="color: rgb(138, 193, 248); cursor: pointer; display: inline-block; pointer-events: all;">Close</span>`
                ).fadeIn();
                $('.notif-popup').off('click', '.notif-close-btn').on('click', '.notif-close-btn', function() {
                    $('.notif-popup').slideUp();
                });
            }
            // }, 5000);
            // $('.centerme-wrapper').addClass('centerme-bottom-right')
            $('.right-btns').addClass('right-btns-bottom')
        }
        $('.centerme-wrapper').fadeIn();

        addStopsToMap();

        setTimeout(() => {
            populateFavs()
        }, 1);
        makeRidershipChart()

        await fetchETAs();

        await fetchWhere();

        function populateJoinedService() {
            if (popupBusName) {
                const serviceDate = new Date(joined_service[popupBusName]);
                const today = new Date();
                const isToday = serviceDate.getDate() === today.getDate() && 
                                serviceDate.getMonth() === today.getMonth() &&
                                serviceDate.getFullYear() === today.getFullYear();

                const formattedTime = serviceDate.toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: undefined,
                    hour12: true
                });

                const displayTime = isToday ? formattedTime : 
                    `${formattedTime} on ${(serviceDate.getMonth() + 1).toString().padStart(2, '0')}/${serviceDate.getDate().toString().padStart(2, '0')}`;
                $('.bus-joined-service').text('Joined service at ' + displayTime);
                $('.info-next-stops').show();
            }
        }
        populateJoinedService();

        // wsClient.connect()
        openRUBusSocket();

        // On app resume/return, force the next update to be immediate and fetch promptly
        let _lastResumeTrigger = 0;
        const triggerImmediateResumeUpdate = () => {
            if (typeof sim !== 'undefined' && sim) {
                if (typeof resumeSim === 'function') {
                    resumeSim();
                } else if (window.resumeSim) {
                    window.resumeSim();
                }
                return;
            }

            // ALWAYS force immediate updates and cancel all in-flight animations on resume
            forceImmediateUpdate = true;
            cancelAllAnimations();

            // Reset stale timing data for all buses to prevent incorrect animation durations
            const currentTime = new Date().getTime();
            for (const busName in busData) {
                if (busData[busName]) {
                    // Reset previousTime and previousMoveTime to current time to prevent long animation durations
                    busData[busName].previousTime = currentTime;
                    busData[busName].previousMoveTime = currentTime;

                    // Reset previousPositions to current position to prevent stale Bézier curve calculations
                    if (busData[busName].lat !== undefined && busData[busName].long !== undefined) {
                        busData[busName].previousPositions = [[busData[busName].lat, busData[busName].long]];
                    }

                    // Clear any stale stored animation durations so they don't carry over
                    delete busData[busName].apiAnimationDuration;
                    delete busData[busName].websocketAnimationDuration;
                    delete busData[busName].simAnimationDuration;
                }
            }

            // Long-idle resume: the ETA leg-time/waits tables (and the per-bus
            // busETAs derived from them) may be minutes/hours old. Rather than
            // show those stale numbers in a freshly-opened stop popup for the
            // duration of the resume fetch, invalidate now: any popup opened
            // before the fresh data lands renders honest "no ETA" dimmed rows
            // instead of outdated values. The refresh that repopulates busETAs
            // is scheduled below and re-renders the popup when the tables land.
            if (typeof busETAs === 'object' && busETAs !== null) {
                Object.keys(busETAs).forEach(busName => {
                    delete busETAs[busName];
                });
            }
            if (popupStopId) {
                updateStopBuses(popupStopId);
            }

            const now = Date.now();
            // Debounce the immediate network fetch with a short window (800ms) to avoid
            // redundant simultaneous requests when focus + visibilitychange fire together.
            // The ETA-table refresh below is intentionally scheduled outside this gate:
            // on the first resume in a long time the tables genuinely need re-fetching,
            // and the stale-busETAs invalidation above must not be double-run.
            if (now - _lastResumeTrigger < 800) {
                return;
            }
            _lastResumeTrigger = now;

            // Re-fetch the ETA/waits tables when they're stale (the app slept for
            // longer than this threshold), so busETAs are recomputed from fresh
            // leg-time data instead of a stale schedule. Gate ensures only one such
            // refresh is in flight (fetchETAs is async and debounce already runs
            // handleImmediate once, but focus may fire again during the fetch).
            const ETAS_FRESH_MS = 120000; // 2 minutes — matches longGapSinceUpdate intent
            if (settings['toggle-pause-tripshot-polling']) {
                // Even with polling paused, a stale ETA table undermines the popup;
                // fetch the tables (but never the bus positions).
                if (Date.now() - (lastETAsFetchTime || 0) > ETAS_FRESH_MS) {
                    fetchETAs();
                }
            } else if (Date.now() - (lastETAsFetchTime || 0) > ETAS_FRESH_MS && !_etAsRefreshScheduled) {
                _etAsRefreshScheduled = true;
                // fetchETAs unconditionally re-renders the popup when tables land,
                // so no further trigger needed here.
                fetchETAs()
                    .then(() => { _etAsRefreshScheduled = false; })
                    .catch(() => { _etAsRefreshScheduled = false; });
            }

            // Kick a fetch right away to avoid waiting for the interval
            busFetchInProgress = false;
            if (!settings['toggle-pause-tripshot-polling']) { fetchBusData(true); }
        };

        const triggerPause = () => {
            // Cancel all animations immediately when page is blurred or hidden
            cancelAllAnimations();

            if (typeof sim !== 'undefined' && sim) {
                if (typeof pauseSim === 'function') {
                    pauseSim();
                } else if (window.pauseSim) {
                    window.pauseSim();
                }
            }
        };

        window.addEventListener('focus', triggerImmediateResumeUpdate);
        window.addEventListener('blur', triggerPause);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                triggerImmediateResumeUpdate();
            } else if (document.visibilityState === 'hidden') {
                triggerPause();
            }
        });
        window.addEventListener('pageshow', (ev) => {
            // pageshow fires when bfcache restores the page in Safari/iOS/Chrome
            if (ev.persisted) {
                console.log('Bfcache restoration detected - using standard resume handler');
                triggerImmediateResumeUpdate();
            }
        });

        // if (!wsClient.ws) {
            startBusPolling();
        // }

        setInterval(async () => {
            await randomStepBusSpeeds();
        }, Math.floor(Math.random() * (1000 - 200 + 1)) + 200);

        window.addEventListener('beforeunload', cancelAllAnimations);

        // getMessages();
    }

    if (typeof map !== 'undefined' && map) {
        await initBusDataPipeline();
    } else {
        document.addEventListener('rubus-map-created', async function onMapCreated() {
            document.removeEventListener('rubus-map-created', onMapCreated);
            await initBusDataPipeline();
        });
    }

})

function startBusPolling() {
    setTimeout(() => {
        if (!settings['toggle-pause-tripshot-polling']) { fetchBusData(); }
    }, initPollDelay);

    setInterval(async () => {
        if (!settings['toggle-pause-tripshot-polling']) { fetchBusData(); }
    }, pollDelay);
}

async function randomStepBusSpeeds() {

    for (const busName in busData) {
        if (!('visualSpeed' in busData[busName]) || busData[busName].visualSpeed < 5) continue

        const randChange = Math.random() < 0.5 ? -1 : 1;
        busData[busName].visualSpeed += randChange;
        if (popupBusName == busName) {
            updateBusPopupSpeedOrCapacity(busName);
        }

        if (panelRoute === busData[busName].route) {
            $(`.route-bus-speed[bus-name="${busName}"]`).text(parseInt(busData[busName].visualSpeed) + 'mph');
            $(`.route-bus-capacity[bus-name="${busName}"]`).text(busData[busName].capacity + '% full');
            updateRouteBusStatus(busName);
        }
    }
}
