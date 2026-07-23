const excludedRouteMappings = {};

let passioDown = false;

async function immediatelyUpdateBusDataPre() {
    cancelAllAnimations();

    $('.updating-buses').fadeIn();

    for (const busName in busData) {
        if (routesByCampus[busData[busName].route] !== selectedCampus) continue; // bc marker only created if selected campus. cna also just check if marker exists like i have commented out below, but i must've previously added that check and removed it to have my code fail fast... possible race condition back then somewhere? maybe when a marker created back on visibility change?
        // if (busMarkers[busName]) {
            const iconElement = busMarkers[busName].getElement().querySelector('.bus-icon-outer');
            if (iconElement) {
                iconElement.style.backgroundColor = 'gray';
            }
        // }
    }

    hideInfoBoxes(); // Otherwise can check what menus were open and update them after getting new bus data - e.g. having to close "stopped for" from pre-existing selected bus if no longer stopped

    if ($('.buses-panel-wrapper').is(':visible')) { // hide info boxes closes this so we should show it again immediately as it shouldn't be included in the panels being hidden
        $('.buses-panel-wrapper').stop(true, true).show(); // true true to cancel slideup (which is already in progress) animation which completes *after* this .show, thus overrides
    }    

    await fetchWhere();
    checkMinRoutes(); // ddoes this work right?
    openRUBusSocket();
}

async function immediatelyUpdateBusDataPost() {
    // if (!Object.keys(busData).length) { // maybe add a condition here to only cheeck on weekends at night?
        startOvernight(true, true);
    // }
    $('.updating-buses').slideUp();
}

async function fetchBusData(immediatelyUpdate, isInitial, skipPolylineUpdateFromFetch) {

    if (sim) return;
    if (busFetchInProgress) return;
    busFetchInProgress = true;

    const url = 'https://demo.rubus.live/buses';

    const currentTime = new Date().getTime();
    const timeSinceLastPoll = currentTime - lastPollTime;

    // Determine if we should force immediate update
    // Priority: explicit caller flag > forced resume flag > long gap since last update > setting toggle
    const longGapSinceUpdate = (currentTime - (lastUpdateTime || 0)) > (pollDelay + pollDelayBuffer);
    const shouldImmediateUpdate = Boolean(immediatelyUpdate) || forceImmediateUpdate || longGapSinceUpdate || settings['toggle-always-immediate-update'];
    
    // Debug logging for immediate update decisions
    if (shouldImmediateUpdate) {
        console.log(`Immediate update triggered: immediatelyUpdate=${immediatelyUpdate}, forceImmediateUpdate=${forceImmediateUpdate}, longGap=${longGapSinceUpdate}, timeGap=${currentTime - (lastUpdateTime || 0)}ms`);
    }

    // Allow immediate updates even on initial load if forceImmediateUpdate is set (app resume scenario)
    if (shouldImmediateUpdate && (!isInitial || forceImmediateUpdate)) {
        immediatelyUpdate = true;
        immediatelyUpdateBusDataPre();
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
            $('.notif-popup').html(`Passio servers are unavailable and incorrect (if any) bus data may be being displayed.`).fadeIn();
            passioDown = true;
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (sim) return; // don't allow race conditions of simming before fetch completed

        if (!data || data.error) {
            $('.notif-popup').html(
                `RUBus servers are unavailable and incorrect (if any) bus data may be shown. <br><br>Error: ${data.error}` +
                `<br><br><span class="notif-close-btn" style="color:rgb(138, 193, 248); cursor: pointer; display: inline-block; pointer-events: all;">Close</span>`
            ).fadeIn();
            $('.notif-popup').off('click', '.notif-close-btn').on('click', '.notif-close-btn', function() {
                $('.notif-popup').slideUp();
            });
            passioDown = true;
            return;
        } else {
            // Server is responding successfully, hide notification popup and reset passioDown flag
            if (passioDown) {
                $('.notif-popup').slideUp();
                passioDown = false;
            }
        }

        let activeBuses = [];
        let pollActiveRoutes = new Set();

        for (const busName in data) {

            const bus = data[busName];

            if (Object.keys(excludedRouteMappings).includes(bus.route)) {
                continue;
            }

            const routeStr = bus.route;
            const isKnown = knownRoutes.includes(routeStr);

            if (routesByCampus[routeStr] !== selectedCampus) {
                continue;
            }
            activeBuses.push(busName);

            let isNew = false;

            if (!busData[busName]) {
                console.log(`New bus in API: ${busName} (${routeStr})`)
                busData[busName] = {};
                busData[busName].previousTime = new Date().getTime() - 5000;
                busData[busName].previousPositions = [[parseFloat(bus.lat), parseFloat(bus.lng)]];
                populateMeClosestStops();
                busData[busName].route = routeStr;
                busData[busName]['type'] = 'api';
                busData[busName]['campus'] = routesByCampus[routeStr];

                if (joined_service[busName]) {
                    busData[busName].joined_service = joined_service[busName];
                } else {
                    busData[busName].joined_service = new Date();
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

                busData[busName].busName = busName;
                await populateFavs();

                isNew = true;

            } else {
                if (busData[busName].route !== routeStr) { // Route changed for existing bus...
                    const oldRoute = busData[busName].route;
                    console.log(`[ROUTE CHANGE] Bus ${busName} changed routes: ${oldRoute} → ${routeStr}`);
                    busData[busName]['route_change'] = {
                        'old_route': oldRoute,
                        'route_change_time': new Date(),
                    };

                    delete busETAs[busName];
                    busData[busName].route = routeStr;
                    
                    updateTimeToStops([busName]);

                    try {
                        const iconElement = busMarkers[busName].getElement().querySelector('.bus-icon-outer');
                        if (iconElement) {
                            iconElement.style.backgroundColor = colorMappings[routeStr];
                        }
                    } catch (error) {
                        console.log('Error accessing busMarkers:', error)
                        console.log(busData)
                        console.log(busMarkers)
                    }

                    makeActiveRoutes();
                    if (!activeRoutes.has(oldRoute)) {
                        populateRouteSelectors(activeRoutes);
                        console.log(`[INFO] The last bus for route ${oldRoute} changed routes to ${routeStr}.`)
                        logPolylineRemoval(oldRoute, 'fetchBusData-routeChange');
                        console.log('Polylines on map before remove:', map.hasLayer(polylines[oldRoute]));
                        polylines[oldRoute].remove();
                        console.log('Polylines on map after remove:', map.hasLayer(polylines[oldRoute]));
                        updatePolylineBoundsIfNeeded();

                        if (shownRoute && shownRoute === oldRoute) {
                            toggleRoute(oldRoute);
                        }
                    }

                    if (!skipPolylineUpdateFromFetch && !polylines[routeStr]) {
                        setPolylines([routeStr]);
                    }
                    populateFavs();
                }
            }

            busData[busName].lat = bus.lat;
            busData[busName].long = bus.lng;

            let lastPosition;
            try {
                lastPosition = busData[busName].previousPositions[busData[busName].previousPositions.length - 1];
            } catch (error) {
                console.log('Error accessing previous positions array:', error)
                console.log(busData[busName])
            }

            if (lastPosition && lastPosition[0] !== parseFloat(bus.lat) && lastPosition[1] !== parseFloat(bus.lng)) {
                const currentTime = new Date().getTime();
                const timeSinceLastUpdate = currentTime - (busData[busName].previousTime || currentTime);
                const animationDuration = Math.min(timeSinceLastUpdate, 30000) + 2500;

                busData[busName].apiAnimationDuration = animationDuration;
                
                busData[busName].previousPositions.push([parseFloat(bus.lat), parseFloat(bus.lng)]);
                busData[busName].previousTime = currentTime;
                
                if (popupBusName === busName && settings['toggle-distances-line-on-focus']) {
                    updateDistanceLinePositionMarker(busName);
                }
            }

            busData[busName].rotation = parseFloat(bus.rotation);

            busData[busName].isKnown = isKnown;

            busData[busName].capacity = bus.capacity;

            busData[busName].oos = false;

            busData[busName].atDepot = isAtDepot(bus.lng, bus.lat);


            if (routesByCampus[busData[busName].route] === selectedCampus) {

                plotBus(busName, shouldImmediateUpdate);
                if (shouldImmediateUpdate) {
                    const iconElement = busMarkers[busName].getElement().querySelector('.bus-icon-outer');
                    if (iconElement) {
                        iconElement.style.backgroundColor = colorMappings[routeStr];
                    }
                }   
                prunePolylinesWithoutInService();
            }

            calculateSpeed(busName);

            if (isNew && shownRoute && shownRoute !== routeStr) {
                busMarkers[busName].getElement().style.display = 'none';
            }

            if (isNew) {
                $('.info-panels-btn-wrapper').show();
            }

            makeBusesByRoutes();

            if (etas && Object.keys(etas).length > 0) {
                updateTimeToStops([busName]);
            }

            if (!busData[busName].oos) {
                pollActiveRoutes.add(busData[busName].route);
            }

            let newRoutes;
            if (typeof pollActiveRoutes.difference === 'function') {
                newRoutes = pollActiveRoutes.difference(activeRoutes);
            } else {
                newRoutes = new Set([...pollActiveRoutes].filter(route => !activeRoutes.has(route)));
            }
            if (newRoutes.size > 0) {
                await initRoutePointsCache(selectedCampus);
                if (!skipPolylineUpdateFromFetch) {
                    setPolylines(newRoutes);
                }
                newRoutes.forEach(item => activeRoutes.add(item))
                populateRouteSelectors(activeRoutes);
                
                if (appStyle === 'rider') {
                    updateRiderRoutes();
                }
            }
 
            if (busName === popupBusName) {
                $('.info-capacity-mid').html(' | <span class="info-capacity-val">' + bus.capacity + '%</span> capacity');
            }
        }

        if (shouldImmediateUpdate) {
            immediatelyUpdateBusDataPost();
        }

        lastUpdateTime = currentTime;
        localStorage.setItem('lastUpdateTime', lastUpdateTime.toString());
        forceImmediateUpdate = false;

        updateRubusResponseTime();

        if (passioDown) {
            $('.notif-popup').slideUp();
            passioDown = false;
        }

        for (const busName in busData) { 
            if (busData[busName]['route'] === 'on1' || busData[busName]['route'] === 'on2') {
                continue;
            }

            if (!activeBuses.includes(busName)) {
                console.log(`[Out of Service][${busData[busName].route}] Bus ${busData[busName].busName} is out of service`);
                makeOoS(busName);
            }
        }

        if ($('.buses-panel-wrapper').is(':visible')) {
            updateBusOverview(Array.from(pollActiveRoutes));
        }

        if (popupStopId) {
            updateStopBuses(popupStopId, shownRoute);
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
    } finally {
        busFetchInProgress = false;
    }
}

function makeOoS(busName) {
    
    console.log(`[Out of Service][${new Date().toLocaleString('en-US', {timeZone: 'America/New_York', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false}).replace(',','')}] busName: ${busName}`)

    if (busMarkers[busName]) { // investigate why this would occur
        busMarkers[busName].remove();
    }
    delete busMarkers[busName];
    delete busETAs[busName];   

    const route = busData[busName].route;

    const busDataCopy = JSON.parse(JSON.stringify(busData[busName]));

    delete busData[busName];   
    console.log("makeOos() busesByRoutes before: ", busesByRoutes)
    console.log("busData before: ", busData)
    makeBusesByRoutes(); // need to delete from busData first since the func pops busesByRoutes from busData
    console.log("makeOos() busesByRoutes after: ", busesByRoutes)
    console.log("busData after: ", busData)
    
    if (route && (!busesByRoutes[selectedCampus] || !busesByRoutes[selectedCampus][route])) { // for some reason route can be undefined, investigate. // if no more buses, buses by routes will no longer have a campus key. checking if no longer has this key, but can also update the make function to include the campus anyway.
        console.log(`[INFO] The last bus for route ${route} went out of service.`)
        activeRoutes.delete(route);
        
        // Update rider routes if in rider mode
        if (appStyle === 'rider') {
            updateRiderRoutes();
        }
        
        if (route !== 'none') { // otherwise route should always exist... I don't want to just check if route exists in polylines, have to ensure code works flawlessly!
            console.log(`Removing polyline for route ${route}`);
            // Update global bounds since a route was removed
            updatePolylineBoundsIfNeeded();
            logPolylineRemoval(route, 'makeOoS');
            console.log('Polylines on map before remove:', map.hasLayer(polylines[route]));
            polylines[route].remove();
            console.log('Polylines on map after remove:', map.hasLayer(polylines[route]));
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
    populateFavs(popSelectors=false); // Do I need this? <-- yes you do

    // Hide all-stops button if no buses remain
    if (Object.keys(busData).length === 0) {
        // $('.info-panels-btn-wrapper').hide();
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

                    progress = progressToNextStop(busName) // why does this trigger for arrived buses if at_stop is immediately set to true and progress reset to 0?
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
                                $('.bus-stopped-for .stop-octagon').show();
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
            
            busData[busName]['stopId'] = parseInt(busLocations[busName]['where'][0])
            if (busLocations[busName]['where'].length === 2) {
                busData[busName]['prevStopId'] = parseInt(busLocations[busName]['where'][1])  
            }

            validBusNames.push(busName)
            activeRoutes.add(busData[busName].route)
        }

        // console.log(validBusNames)
        Object.keys(busData).forEach(busName => {
            if (!validBusNames.includes(busName) && busData[busName].route.includes('on')) { // this should only affect returning to the app which had overnight buses previously (from ws), otherwise it would briefly cause buses not yet reaching a stop to pop out before respawning from fetch data
                makeOoS(busName)
            }
        })

        updateTimeToStops(validBusNames)
        if (popupStopId) {
            // Preserve any active route filter in the stop info
            updateStopBuses(popupStopId)
        }

        if (popupBusName) {
            popInfo(popupBusName)
        }

        // Update all stops menu if info panels are open (after activeStops is created)
        if ($('.info-panels-show-hide-wrapper').is(':visible')) {
            populateAllStops();
        }

    } catch (error) {
        console.error('Error fetching bus locations:', error);
        markRubusRequestsFailing();
    }

}


async function startOvernight(setColorBack, immediatelyUpdate = false) {
    try {
        response = await fetch('https://demo.rubus.live/overnight');

        if (!response.ok) {
            throw new Error('Network response was not ok');
        }

        const data = await response.json();

        if (Object.keys(data).length) {
            
            const previousActiveRoutes = new Set(activeRoutes);
            
            for (const busName in data) {
    
                const bus = data[busName];
    
                if (Object.keys(excludedRouteMappings).includes(bus.route)) {
                    continue;
                }
    
                if (!busData[busName]) {
                    busData[busName] = {};
                    busData[busName].previousTime = new Date().getTime() - 5000;
                    busData[busName].previousPositions = [[parseFloat(bus.lat), parseFloat(bus.lng)]];
                    busData[busName]['type'] = 'over';
                }
    
                busData[busName].busName = busName;
                busData[busName].lat = bus.lat;
                busData[busName].long = bus.lng;

                const currentTime = new Date().getTime();
                const timeSinceLastUpdate = currentTime - (busData[busName].previousTime || currentTime);
                const animationDuration = Math.min(timeSinceLastUpdate, 30000) + 2500;

                busData[busName].overnightAnimationDuration = animationDuration;

                console.log(`[Overnight API] Bus ${busName}: Time since last update: ${Math.round(timeSinceLastUpdate/1000)}s, Animation duration: ${Math.round(animationDuration/1000)}s`);
                
                busData[busName].previousTime = currentTime;
    
                busData[busName].rotation = parseFloat(bus.rotation);
    
                const routeStr = bus.route;
                busData[busName].route = routeStr;
                busData[busName].isKnown = knownRoutes.includes(routeStr);
                activeRoutes.add(busData[busName].route);

                busData[busName].capacity = bus.capacity;
    
                plotBus(busName, immediatelyUpdate);
                calculateSpeed(busName);

                if (setColorBack) {
                    const iconElement = busMarkers[busName].getElement().querySelector('.bus-icon-outer');
                    if (iconElement) {
                        iconElement.style.backgroundColor = colorMappings[routeStr];
                    }
                }
    
            }

            for (const busName in busData) {
                if (busData[busName].type === 'over' && !(busName in data)) {
                    console.log(`[startOvernight()][Out of Service][${busData[busName].route} Bus ${busData[busName].busName} is out of service?`);
                    makeOoS(busName);
                }
            }

            makeBusesByRoutes();

            populateRouteSelectors(activeRoutes);
            const newActiveRoutes = new Set([...activeRoutes].filter(route => !previousActiveRoutes.has(route)));
            if (newActiveRoutes.size > 0) {
                setPolylines(newActiveRoutes);
                newActiveRoutes.forEach(item => activeRoutes.add(item));
                updatePolylineBoundsIfNeeded();
            }
        }
    } catch (error) {
        console.error('Error fetching overnight data:', error);
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

function checkMinRoutes() {

    console.log("Checking min routes")

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
        const knightMoverHoursText = `Knight Mover accepts calls until 10:00AM<br><span style="color: #4babd7ff">(${currentYear} spring recess special hours)</span>`;
        $('#knight-mover-hours').html(knightMoverHoursText);
        const knightMoverStartHour = 12;
        const knightMoverEndHour = 10;
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
            if (hour >= 19 || hour < 10) {
                isKnightMoverActive = true;
            }
            $('#knight-mover-hours').html('Knight Mover accepts calls until 10:00AM');
        } else {
            // Weekday: Midnight to 7:00 AM
            if (hour >= 0 && hour < 7) {
                isKnightMoverActive = true;
            }
            $('#knight-mover-hours').html('Knight Mover accepts calls until 7:00AM');
        }
    } else {
        // Regular semester schedule
        // Fri–Sun: no Knight Mover; Mon–Thu overnight: 3:00–5:59 AM
        if (dayOfWeek >= 1 && dayOfWeek <= 4 && hour >= 3 && hour < 6) {
            isKnightMoverActive = true;
        }
        $('#knight-mover-hours').html('Knight Mover accepts calls until 5:45AM');
    }

    console.log(`[KnightMover Debug] active:${isKnightMoverActive}, campus:${selectedCampus}, appStyle:${appStyle}, userSettingOverride:${settings['toggle-show-knight-mover']}, time:${currentMonth+1}/${currentDay}/${currentYear} ${hour}:00, day:${dayOfWeek}`);

    if (!isKnightMoverActive) {
        $('.knight-mover').hide();
        return;
    }

    if (selectedCampus !== 'nb' || appStyle === 'rider') {
        $('.knight-mover').hide();
        return;
    }

    $('.knight-mover').show();
}

function makeActiveRoutes() {
    activeRoutes.clear();
    for (const busName in busData) {
        const route = busData[busName].route;
        if (route) activeRoutes.add(route);
    }
    populateRouteSelectors(activeRoutes); 
}


let cachedAlertMessages = null;

function clearAlertsDisplay() {
    $('.passio-messages-list').empty();
    $('.passio-mini').empty();
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
                $(`.passio-mini-alert[data-alert-mini="${message['id']}"]`).show();
            })

            $msgElm.find('#big-close').click(function() {
                $(this).parent().parent().remove();
                $(`.passio-mini-alert[data-alert-mini="${message['id']}"]`).remove();
            })

        $('.passio-messages-list').append($msgElm)

        const $miniElm = $(`<div data-alert-mini="${message['id']}" class="passio-mini-alert gap-x-0p5rem pointer">
            <div class="br-1rem bold flex justify-center align-center" style="background-color: white; color: red; aspect-ratio: 1; height: 100%;">!</div>
            <div class="pr-0p5rem">${title}</div>
        </div>`);
        
        $miniElm.click(function() {
            $(`[data-alert-big="${message['id']}"]`).slideDown();
            $(`[data-alert-mini="${message['id']}"]`).hide();
        });
        
        $('.passio-mini').append($miniElm);

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
        cancelAnimationFrame(animationFrames[busName]);
        delete animationFrames[busName];
    });
  }


let joined_service = {};

async function fetchETAs() {
    try {
        const response = await fetch('https://demo.rubus.live/etas');
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        const data = await response.json();
        etas = data[selectedCampus] || {}; // can prob remove || {} if server defaults eta obj empty campus mappings
        // console.log('ETAs fetched:', etas);
        // updateTimeToStops('all')

        updateRubusResponseTime();
    } catch (error) {
        console.error('Error fetching ETAs:', error);
        markRubusRequestsFailing();

        $('.notif-popup').text('RUBus/Passio servers are experiencing issues and ETAs could not be fetched. Accurate, live bus positioning is still available.').fadeIn();
    }

    try {
        const response = await fetch('https://demo.rubus.live/waits');
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        const data = await response.json();
        waits = data[selectedCampus];
        updateWaitTimes();
        // console.log('Waits fetched:', waits);

        updateRubusResponseTime();
    } catch (error) {
        console.error('Error fetching waits:', error);
        markRubusRequestsFailing();
    }

}

$(document).ready(async function() {
    // Initialize settings before map is created
    settings = localStorage.getItem('settings');
    if (settings) {
        settings = JSON.parse(settings);
    } else {
        console.log('does this also run?')
        settings = defaultSettings;
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

    await fetchJoinTimes();

    await startOvernight(false);

    await fetchBusData(false, true);

    document.dispatchEvent(new Event('rubus-bus-data-loaded'));

    checkShared();

    // if (!Object.keys(busData).length) {
    // await startOvernight();
    // }

    makeActiveRoutes();
    // setPolylines(activeRoutes);
    updatePolylineBoundsIfNeeded();

    // console.log(activeRoutes)

    if (activeRoutes.size > 0) {
        updateMarkerSize(); // set correct html marker size before plotting
        checkMinRoutes();
    } else {
        $('.info-main').css('justify-content', 'center'); // change back once buses go in serve. Gonna be annoying to implement that
        // setTimeout(() => {
            // $('.bus-info-popup').hide();
        if (!passioDown && selectedCampus === 'nb') $('.knight-mover').show();

        const now = new Date();
        const hour = now.getHours();
        if (hour >= 8 && hour < 23) {
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

    addStopsToMap()
    
    
    
    // $('.buses-btn').css('display', 'flex');

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
    const triggerImmediateResumeUpdate = () => {
        console.log('App resumed - triggering immediate bus update');
        forceImmediateUpdate = true;

        // Cancel all in-progress animations immediately so stale rAF callbacks
        // don't visually run when the browser unpauses requestAnimationFrame.
        // This must happen here (not only inside fetchBusData→immediatelyUpdateBusDataPre)
        // because fetchBusData(true) can be silently dropped by the busFetchInProgress guard.
        cancelAllAnimations();

        // Reset stale timing data for all buses to prevent incorrect animation durations
        const currentTime = new Date().getTime();
        for (const busName in busData) {
            if (busData[busName]) {
                // Reset previousTime to current time to prevent long animation durations
                busData[busName].previousTime = currentTime;

                // Reset previousPositions to current position to prevent stale Bézier curve calculations
                if (busData[busName].lat !== undefined && busData[busName].long !== undefined) {
                    busData[busName].previousPositions = [[busData[busName].lat, busData[busName].long]];
                }

                // Clear any stale stored animation durations so they don't carry over
                // to the next non-immediate update. The teleport (immediate) path in
                // updateMarkerPosition returns early and never consumes these values.
                delete busData[busName].apiAnimationDuration;
                delete busData[busName].websocketAnimationDuration;
                delete busData[busName].overnightAnimationDuration;
            }
        }

        // Kick a fetch right away to avoid waiting for the interval
        busFetchInProgress = false;
        if (!settings['toggle-pause-passio-polling']) { fetchBusData(true); }
    };

    window.addEventListener('focus', triggerImmediateResumeUpdate);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            triggerImmediateResumeUpdate();
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

})

function startBusPolling() {
    setTimeout(() => {
        if (!settings['toggle-pause-passio-polling']) { fetchBusData(); }
    }, initPollDelay);

    setInterval(async () => {
        if (!settings['toggle-pause-passio-polling']) { fetchBusData(); }
    }, pollDelay);
}

async function randomStepBusSpeeds() {

    for (const busName in busData) {
        if (!('visualSpeed' in busData[busName]) || busData[busName].visualSpeed < 5) continue

        const randChange = Math.random() < 0.5 ? -1 : 1;
        busData[busName].visualSpeed += randChange;
        if (popupBusName == busName && showBusSpeeds) {
            $('.info-speed-mid').text(Math.round(busData[busName].visualSpeed));
            $('.info-mph-mid').text('mph');
            $('.info-speed-wrapper').css('visibility', 'visible');
        }

        if (panelRoute === busData[busName].route) {
            $(`.route-bus-speed[bus-name="${busName}"]`).text(parseInt(busData[busName].visualSpeed) + 'mph | ' + busData[busName].capacity + '% full');
        }
    }
}
