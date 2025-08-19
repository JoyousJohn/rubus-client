const routeMapping = {
    '26280': 'on1',
    '26281': 'on2',
    '26435': 'wknd1',
    '26436': 'wknd2',
    '43397': 'bhe',
    '43398': 'lx',
    '43430': 'a',
    '43431': 'ee',
    '43440': 'h',
    '43441': 'rexl',
    '43711': 'rexb',
    '43973': 'b',
    '45773': 'f', // used to be 43974
    '43990': 'ftbl', // 'Football Before Kickoff'
    'Football Service Transition': 'ftbl',
    '43991': 'ftbl',
    '4067': 'c',
    '37199': 'all',
    'ONWK1T': 'on1',
    'ONWK2T': 'on2',

    '46583': 'winter1',
    '46584': 'winter2',

    // new route Ids
    '36875': 'rexb',
    '36874': 'lx',
    '36873': 'h',
    '31970': 'ee',
    '31961': 'b',
    '31651': 'f',
    '31650': 'bhe',
    '36877': 'rexl',
    '31678': 'a',
    '41540': 'c',

    // new v2
    '54550': 'rexb',
    '54544': 'f',
    '54545': 'lx',
    '54541': 'b',
    '54540': 'a',
    '55368': 'h',
    '59451': 'bl',
    '54551': 'rexl',
    '54543': 'ee',
    '55366': 'c',

    // exams (5/six+)
    '55283': 'rexl',
    '55277': 'b',
    '55276': 'a',
    '55281': 'lx',
    '55282': 'rexb',
    '55280': 'f',
    '55369': 'h',
    '55279': 'ee',
    '55367': 'c',
    '61741': 'bl',
    
    // summer (5/15)
    '41752': 'summer1',
    '44051': 'summer2',

    // commencement (5/18)
    '62409': 'commencement',

    '4056': 'ps',
    '4063': 'cc',
    '4088': 'ccx',
    '4098': 'psx',
    '41231': 'cam',
}


// maybe filter by selected route instead
const excludedRouteMappings = {
    // '4056': 'Penn Station Local',
    // '4063': 'Campus Connect',
    // '4088': 'Campus Connect Express',
    // '41231': 'Camden',
    // '4098': 'Penn Station Express'
};

function getRouteStr(route) {
    // console.log(route)
    if (route in routeMapping) {
        return [routeMapping[route], true];
    } else {
        let alphaRouteId = route.replace(/[^a-zA-Z]/g, '').toLowerCase();
        // console.log(alphaRouteId)
        if (knownRoutes.includes(alphaRouteId)) {
            return [alphaRouteId, true];
        } else {
            return [route, false]; // unknown route
        }
    }     
}

let passioDown = false;

async function immediatelyUpdateBusDataPre() {
    cancelAllAnimations();

    $('.updating-buses').fadeIn();

    for (const busId in busData) {
        if (routesByCampus[busData[busId].route] !== selectedCampus) continue; // bc marker only created if selected campus. cna also just check if marker exists like i have commented out below, but i must've previously added that check and removed it to have my code fail fast... possible race condition back then somewhere? maybe when a marker created back on visibility change?
        // if (busMarkers[busId]) {
            busMarkers[busId].getElement().querySelector('.bus-icon-outer').style.backgroundColor = 'gray';
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
        startOvernight(true);
    // }
    $('.updating-buses').slideUp();
}

async function fetchBusData(immediatelyUpdate, isInitial) {

    if (sim) return;
    if (busFetchInProgress) return;
    busFetchInProgress = true;

    const formData = '{"s0":"1268","sA":1}';
    // const formData = '{"s0":"1268","sA":1,"rA":15,"r0":"41231","r1":"4067","r2":"43711","r3":"43431","r4":"43440","r5":"43441","r6":"43398","r7":"43991","r8":"43990","r9":"43973","r10":"43397","r11":"4088","r12":"4063","r13":"4056","r14":"4098", "r15": "-1"}'
    const url = `https://passiogo.com/mapGetData.php?getBuses=1&wTransloc=1&hideExcluded=0&showBusInOos=1&showBusesExcluded=1&json=${encodeURIComponent(formData)}`;

    const currentTime = new Date().getTime();
    const timeSinceLastPoll = currentTime - lastPollTime;
    // console.log(timeSinceLastPoll)

    // Determine if we should force immediate update
    // Priority: explicit caller flag > forced resume flag > long gap since last update > setting toggle
    const longGapSinceUpdate = (currentTime - (lastUpdateTime || 0)) > (pollDelay + pollDelayBuffer);
    const shouldImmediateUpdate = Boolean(immediatelyUpdate) || forceImmediateUpdate || longGapSinceUpdate || settings['toggle-always-immediate-update'];
    if (shouldImmediateUpdate && !isInitial) {
        immediatelyUpdate = true;
        immediatelyUpdateBusDataPre();
    } else {
        immediatelyUpdate = false;
    }

    lastPollTime = currentTime;
    
    let slowConnectionTimeout;
    try {
        slowConnectionTimeout = setTimeout(() => {
            $('.slow-connection').slideDown();
        }, 3000);
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json, text/javascript, */*; q=0.01',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate, br, zstd',
                'Origin': 'https://rutgers.passiogo.com',
                'Referer': 'https://rutgers.passiogo.com/',
                'Connection': 'keep-alive'
            }
        });
        clearTimeout(slowConnectionTimeout);
        $('.slow-connection').slideUp();

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (sim) return; // don't allow race cconditions of simming before fetch completed
        // console.log('Response data:', data);

        if (data.error) {
            $('.notif-popup').html(`Passio servers are unavailable and incorrect (if any) bus data may be shown. <br><br>Passio is reporting: ${data.error}`).fadeIn();
            passioDown = true;
            return;
        } else {
            $('.notif-popup').slideUp(); // will this also slide up errors when rubus servers are down? maybe I'll need a second wrapper?
        }

        let activeBuses = [];
        let pollActiveRoutes = new Set();

        for (const someId in data.buses) {

            if (someId === '-1') continue;

            const bus = data.buses[someId][0];

            if (Object.keys(excludedRouteMappings).includes(bus.routeId)) { // if passio changes ids and a new non-nb bus route id is added then getNextStop will fail bc route is not in stopLists. Implement better system later.
                continue;
            }

            const [routeStr, isKnown] = getRouteStr(bus.routeId);

            // console.log(routeStr)

            if (routesByCampus[routeStr] !== selectedCampus) {
                // console.log(`Bus ${bus.busName} (${routeStr}) is not in ${selectedCampus}`)
                continue;

            }

            const busId = bus.busId;
            activeBuses.push(busId);

            let isNew = false;

            if (!busData[busId]) {
                console.log(`New bus in API: ${bus.busName} (${busId}) (${routeStr})`)
                busData[busId] = {};
                busData[busId].previousTime = new Date().getTime() - 5000;
                busData[busId].previousPositions = [[parseFloat(bus.latitude), parseFloat(bus.longitude)]];
                populateMeClosestStops();
                busData[busId].route = routeStr;
                busData[busId]['type'] = 'api';
                busData[busId]['campus'] = routesByCampus[routeStr];

                if (joined_service[busId]) {
                    busData[busId].joined_service = joined_service[busId];
                } else {
                    busData[busId].joined_service = new Date();
                }

                // All stops are shown so no buses, and if this is the first bus, we need to hide all stops first before showing stops for this route
                if (Object.keys(busData).length === 1) {
                    console.log("Is first bus, deleting all stops")
                    makeBusesByRoutes(); // need to make this before adddStopsToMap triggers below. ik this works for going from no buses to one bus, need to test more complex situations... no sure which
                    deleteAllStops();
                    console.log(busStopMarkers)
                }


                if (!isInitial) {
                    addStopsToMap();
                    updateTimeToStops([busId]); // otherwise can briefly get undefined when reading ETA for this bus. Found this when selecting route selector and I think the tooltip code failed to read (gui line 295 at the time)
                }

                busData[busId].busName = bus.busName;
                await populateFavs();

                isNew = true;

            } else {
                if (busData[busId].route !== routeStr) { // Route changed for existing bus...
                    const oldRoute = busData[busId].route;
                    busData[busId]['route_change'] = {
                        'old_route': oldRoute,
                        'route_change_time': new Date(),
                    };
                    busData[busId].route = routeStr;

                    try {
                        busMarkers[busId].getElement().querySelector('.bus-icon-outer').style.backgroundColor = colorMappings[routeStr]; // somehow got  busMarkers[busId] is undefined... how was busId in busData but not busMarkers? don't understand...
                    } catch (error) {
                        console.log('Error accessing busMarkers:', error)
                        console.log(busData)
                        console.log(busMarkers)
                    }

                    makeActiveRoutes();
                    if (!activeRoutes.has(routeStr)) {
                        populateRouteSelectors(activeRoutes);
                        console.log(`[INFO] The last bus for route ${oldRoute} changed routes to ${routeStr}.`)
                        console.log('Polylines on map before remove:', map.hasLayer(polylines[oldRoute]));
                            polylines[oldRoute].remove();
                            console.log('Polylines on map after remove:', map.hasLayer(polylines[oldRoute]));
                        // $(`.route-selector[routename="${route}"]`).remove(); // not sure if i need this or if it's triggered elsewhere
                        // checkMinRoutes(); // also unsure if i need this

                        if (shownRoute && shownRoute === oldRoute) {
                            toggleRoute(oldRoute);
                        }
                    }

                    if (!polylines[routeStr]) {
                        setPolylines([routeStr]);
                    }
                    populateFavs();
                }
            }

            busData[busId].lat = bus.latitude;
            busData[busId].long = bus.longitude;

            // getting undefined on previousPositions, but it should be set from both above in pre where new bus and in ws where new bus, so I added a type key to debug this.
            // maybe limit ws to on/none? maybe getting long lat when setting it there is failing? don't think I've ever seen it without coords
            
            let lastPosition;
            try {
                lastPosition = busData[busId].previousPositions[busData[busId].previousPositions.length - 1]; // gett
            } catch (error) {
                console.log('Error accessing previous positions array:', error)
                console.log(busData[busId])
            }

            if (lastPosition && lastPosition[0] !== parseFloat(bus.latitude) && lastPosition[1] !== parseFloat(bus.longitude)) {
                busData[busId].previousPositions.push([parseFloat(bus.latitude), parseFloat(bus.longitude)]);
            }

            busData[busId].rotation = parseFloat(bus.calculatedCourse); //+ 45

            busData[busId].isKnown = isKnown;

            busData[busId].capacity = bus.paxLoad;

            busData[busId].oos = bus.outOfService === 1; 

            busData[busId].atDepot = isAtDepot(bus.longitude, bus.latitude);

            if (routesByCampus[busData[busId].route] === selectedCampus) {
                plotBus(busId, immediatelyUpdate);
                if (immediatelyUpdate) {
                    busMarkers[busId].getElement().querySelector('.bus-icon-outer').style.backgroundColor = colorMappings[routeStr];
                }   
            }

            calculateSpeed(busId);

            // does the below need to go in the selected campus check above?
            if (isNew && shownRoute && shownRoute !== routeStr) { // may have to timeout 0s this
                busMarkers[busId].getElement().style.display = 'none';
            }

            if (isNew) {
                $('.all-stops-btn-wrapper').show();
            }

            makeBusesByRoutes(); // this has to go before updateTimeToStops since that calls populateAllStops which uses this. Not sure if moving this back up here broke something else though. Should find a better way to do the thing below.

            // since fetchBusData is called once before etas and waits are fetched. Maybe find a better way to do this later.
            if (Object.keys(etas).length > 0) {
                updateTimeToStops([busId]);
            }

            pollActiveRoutes.add(busData[busId].route);
            // console.log('-')
            // console.log(pollActiveRoutes)
            const newRoutes = pollActiveRoutes.difference(activeRoutes);
            if (newRoutes.size > 0) {
                // console.log('newRoutes: ', newRoutes)
                // console.log('activeRoutes: ' , activeRoutes)
                setPolylines(newRoutes);
                newRoutes.forEach(item => activeRoutes.add(item))
                populateRouteSelectors(activeRoutes); // this adds selectors for each route multiple times, maybe later improve by only adding the new routes instead of emptying and setting all <-- not sure this is still true
            }
 
            if (busId === popupBusId) {
                $('.info-capacity-mid').text(bus.paxLoad + '% capacity');
            }

        }

        if (immediatelyUpdate) {
            immediatelyUpdateBusDataPost();
        }

        // Mark the time of the last successful update and clear force flag
        lastUpdateTime = currentTime;
        forceImmediateUpdate = false;

        // console.log('activeBuses', activeBuses)

        // activeBuses = activeBuses.filter(num => num !== 13209);

        for (const busId in busData) { 

            // console.log(busData)
            if (busData[busId]['route'] === 'on1' || busData[busId]['route'] === 'on2') {
                continue;
            }

            if (!activeBuses.includes(parseInt(busId))) {
                console.log(`[Out of Service][${busData[busId].route}] Bus ${busData[busId].busName} is out of service`);
                makeOoS(busId);
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
                $('.knight-mover, .knight-mover-mini').hide();
            }
            checkMinRoutes();
        } else {
            $('.all-stops-btn-wrapper').hide();
        }

    } catch (error) {
        console.error('Error fetching bus data:', error);
    } finally {
        busFetchInProgress = false;
    }
}


function makeOoS(busId) {
    
    console.log(`[Out of Service][${new Date().toLocaleString('en-US', {timeZone: 'America/New_York', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false}).replace(',','')}] busId: ${busId}`)

    if (busMarkers[busId]) { // investigate why this would occur
        busMarkers[busId].remove();
    }
    delete busMarkers[busId];
    delete busETAs[busId];   

    const route = busData[busId].route;

    const busDataCopy = JSON.parse(JSON.stringify(busData[busId]));

    delete busData[busId];   
    console.log("makeOos() busesByRoutes before: ", busesByRoutes)
    console.log("busData before: ", busData)
    makeBusesByRoutes(); // need to delete from busData first since the func pops busesByRoutes from busData
    console.log("makeOos() busesByRoutes after: ", busesByRoutes)
    console.log("busData after: ", busData)
    
    if (route && (!busesByRoutes[selectedCampus] || !busesByRoutes[selectedCampus][route])) { // for some reason route can be undefined, investigate. // if no more buses, buses by routes will no longer have a campus key. checking if no longer has this key, but can also update the make function to include the campus anyway.
        console.log(`[INFO] The last bus for route ${route} went out of service.`)
        activeRoutes.delete(route);
        if (route !== 'none') { // otherwise route should always exist... I don't want to just check if route exists in polelines, have to ensure code works flawlessly!
            console.log(`Removing polyline for route ${route}`);
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
        alert("Undefined route went OoS!")
        console.log("A bus with an undefined route claimed to go out of service... busData:");
        console.log(busDataCopy)
    }

    removePreviouslyActiveStops();

    if (popupBusId === busId) {
        console.log("Selected bus went OOS");
        console.log(popupBusId);
        console.log(busId);
        console.log(sourceBusId);
        hideInfoBoxes();
        sourceBusId = null;
    }

    if (sharedBus && sharedBus == busId) {
        $('.shared, .info-shared').hide();
        sharedBus = null;
    }

    populateMeClosestStops();
    populateFavs(popSelectors=false); // Do I need this? <-- yes you do

}


function updateTimeToStops(busIds) {
    
    busIds.forEach(busId => {
        
        const data = busData[busId]
        let stopId = data.stopId

        if (Array.isArray(stopId)) {
            stopId = stopId[0]
        }

        if (!stopId) {
            return;
        }

        const busRoute = busData[busId].route
        const nextStop = getNextStopId(busRoute, stopId)
        busData[busId].next_stop = nextStop
        // console.log(`next stop for bus ${busId} is ${nextStop}`)

        let routeStops = stopLists[busRoute]
        // console.log(routeStops.length)
        let sortedStops = []

        const nextStopIndex = routeStops.indexOf(nextStop);
        if (nextStopIndex !== -1) {
            sortedStops = routeStops.slice(nextStopIndex)
                            .concat(routeStops.slice(0, nextStopIndex));
        }

        if ((busRoute === 'wknd1' || busRoute === 'all' || busRoute === 'winter1' || busRoute === 'on1' || busRoute === 'summer1') && nextStop === 3) { // special case

            if (!busData[busId]['prevStopId']) { // very rare case when bus added to server data where next stop is sac nb and there is no previous data yet, accurate eta cannot be known
                delete busETAs[busId]
                return
            }

            const prevStopId = busData[busId]['prevStopId']
            via = prevStopId
            console.log('special case')
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
        // console.log(busId)
        // console.log('sortedStops: ',sortedStops)

        for (let i = 0; i < sortedStops.length; i++) {

            if (etas) {

                let prevStopId;
                let progress = 0;

                if (i === 0 && !data['at_stop']) {
                    prevStopId = sortedStops[sortedStops.length-1]

                    progress = progressToNextStop(busId) // why does this trigger for arrived buses if at_stop is immediately set to true and progress reset to 0?
                    busData[busId]['progress'] = progress
                    // console.log(`Progress for busId ${busId} (name: ${busData[busId].busName}): ${Math.round(progress*100)}%`)

                } else if (i === 0 && data['at_stop']) {

                    prevStopId = sortedStops[sortedStops.length-1]

                    const timeArrived = new Date(data.timeArrived)
                    let arrivedAgoSeconds = Math.floor((new Date().getTime() - timeArrived) / 1000)

                    // if (arrivedAgoSeconds > 0) {

                    const avgWaitAtStop = waits[prevStopId]

                    if (avgWaitAtStop) {
                        if (arrivedAgoSeconds < avgWaitAtStop) {
                            const expectedWaitAtStop = avgWaitAtStop - arrivedAgoSeconds
    
                            currentETA += expectedWaitAtStop;
                            busData[busId]['overtime'] = false;
                        } else {
                            busData[busId]['overtime'] = true;
    
                            if (popupBusId === busId && !overtimeInterval && settings['toggle-show-bus-overtime-timer']) {
                                $('.bus-stopped-for .stop-octagon').show();
                                startOvertimeCounter(busId);
                            }
                        }
                    }  
                } else {
                    prevStopId = sortedStops[i-1]
                }

                const thisStopId = sortedStops[i]

                // console.log('prev stop: ', prevStopId)
                // console.log('thisStopId stop: ', thisStopId)
                // console.log('eta: ', currentETA)

                // console.table(etas[thisStopId])

                if (etas[thisStopId] && prevStopId in etas[thisStopId]['from']) {
                    currentETA += Math.round(etas[thisStopId]['from'][prevStopId] * (1 - progress))
                    // console.log(Math.round(etas[thisStopId]['from'][prevStopId]))
                } else {
                    // console.log(routeStops)
                    // console.log('nextStop: ', nextStop)
                    // console.log('i: ' + i + ' thisStopId -> [' + thisStopId + '][from][' + prevStopId + '] <- prevStopId' + ' not found.')
                    currentETA += 300 * (1 - progress)
                    // console.log(``)
                }

                if (i !== 0 && waits[prevStopId]) {
                    currentETA += waits[prevStopId]
                    // console.log(`Adding ${waits[prevStopId]}s to currentETA to get to stopId ${thisStopId}`)
                } else if (i !== 0) {
                    currentETA += 30
                }

                if (!busETAs[busId]) {
                    busETAs[busId] = {};
                }

                // console.log(thisStopId)

                if ((busRoute === 'wknd1' || busRoute === 'all' || busRoute === 'winter1' || busRoute === 'on1' || busRoute === 'summer1') && thisStopId === 3) { // special case
                    if (!busETAs[busId][thisStopId]) busETAs[busId][thisStopId] = {'via': {}}
                    busETAs[busId][thisStopId]['via'][prevStopId] = Math.round(currentETA)
                } else {
                    busETAs[busId][thisStopId] = Math.round(currentETA)
                }

            }
        }

        if (popupBusId === busId) {
            popInfo(busId)
        }

    });

    if (shownRoute && !popupBusId && !popupStopId) {
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

        const validBusIds = []
        for (const busId in busLocations) {

            // if (!(busId in busData)) { continue; } // refreshed page and bus went out of service before backend could remove from busdata, still in bus_locactions.
            
            if (!busData[busId]) {
                continue;
                // busData[busId] = {
                //     'route': busLocations[busId]['route'],
                //     'src_test': 'fetchWhere',
                //     'previousPositions': [] // hope this is enough?
                // } // may need to set previousPosition keys here
            }
            
            if (!busLocations[busId]['where']) { continue; } // joined service and didn't get to a stop polygon yet        
            
            busData[busId]['stopId'] = parseInt(busLocations[busId]['where'][0])
            if (busLocations[busId]['where'].length === 2) {
                busData[busId]['prevStopId'] = parseInt(busLocations[busId]['where'][1])  
            }

            validBusIds.push(busId)
            activeRoutes.add(busData[busId].route)
        }

        // console.log(validBusIds)
        Object.keys(busData).forEach(busId => {
            if (!validBusIds.includes(busId) && busData[busId].route.includes('on')) { // this should only affect returning to the app which had overnight buses previously (from ws), otherwise it would briefly cause buses not yet reaching a stop to pop out before respawning from fetch data
                makeOoS(busId)
            }
        })

        updateTimeToStops(validBusIds)
        if (popupStopId) {
            // Preserve any active route filter in the stop info
            updateStopBuses(popupStopId)
        }

        if (popupBusId) {
            popInfo(popupBusId)
        }

    } catch (error) {
        console.error('Error fetching bus locations:', error);
    }
}


async function startOvernight(setColorBack) {

    response = await fetch('https://demo.rubus.live/overnight');

    if (!response.ok) {
        throw new Error('Network response was not ok');

    } else {
        const data = await response.json();

        if (Object.keys(data).length) {
            
            const previousActiveRoutes = new Set(activeRoutes);
            
            for (const someId in data) {
    
                const bus = data[someId];
    
                if (Object.keys(excludedRouteMappings).includes(bus.routeId)) { // if passio changes ids and a new non-nb bus route id is added then getNextStop will fail bc route is not in stopLists. Implement better system later.
                    continue;
                }
    
                const busId = bus.busId;
    
                if (!busData[busId]) {
                    busData[busId] = {};
                    busData[busId].previousTime = new Date().getTime() - 5000;
                    busData[busId].previousPositions = [[parseFloat(bus.lat), parseFloat(bus.lng)]];
                    busData[busId]['type'] = 'over';
                }
    
                busData[busId].busName = bus.name;
                busData[busId].lat = bus.lat;
                busData[busId].long = bus.long;
    
                busData[busId].rotation = parseFloat(bus.rotation);
    
                const [routeStr, isKnown] = getRouteStr(bus.route);
                busData[busId].route = routeStr;
                busData[busId].isKnown = isKnown;
                activeRoutes.add(busData[busId].route);

                busData[busId].capacity = bus.capacity;
    
                plotBus(busId);
                calculateSpeed(busId);

                if (setColorBack) {
                    busMarkers[busId].getElement().querySelector('.bus-icon-outer').style.backgroundColor = colorMappings[routeStr];
                }
    
            }

            for (const busId in busData) {
                if (busData[busId].type === 'over' && !(busId in data)) { // I think all objects should have the type key set...
                    console.log(`[startOvernight()][Out of Service][${busData[busId].route} Bus ${busData[busId].busName} is out of service?`);
                    makeOoS(busId);
                }
            }

            makeBusesByRoutes();

            populateRouteSelectors(activeRoutes);
            const newActiveRoutes = new Set([...activeRoutes].filter(route => !previousActiveRoutes.has(route)));
            if (newActiveRoutes.size > 0) {
                setPolylines(newActiveRoutes);
            }

            addStopsToMap();

            // console.log(activeRoutes)
            // console.log(polylines)
            // setPolylines(activeRoutes);
            // console.log(polylines)
            // populateRouteSelectors(activeRoutes); 
        }
    }
}

function checkMinRoutes() {
    
    if (selectedCampus !== 'nb') return;

    const today = new Date().toLocaleString("en-US", { timeZone: "America/New_York" });
    if (today === 5 || today === 6 || today === 0) return; // fri, sat, sun, no knight mover, don't check
    const hour = new Date().getHours();
    if (hour < 3 || hour >= 6) return;

    const minRoutes = ["ee", "lx", "h", "bl"];

    let isAnyBusActuallyInService = false;
    minRoutes.forEach(route => {
        // remove busesByRoutes[selectedCampus] && later. we need to investigate whyitsnotgetting itscampuskeysettoan empty obj when no buses later.
        if (busesByRoutes[selectedCampus] && busesByRoutes[selectedCampus][route]) {
            busesByRoutes[selectedCampus][route].forEach(busId => {
                const valid = isValid(busId);
                if (valid) {
                    isAnyBusActuallyInService = true;
                }
            }) 
        }
        
    })


    if (!activeRoutes.size) {
        $('.knight-mover').show();
        $('.knight-mover-mini').hide();

        populateRouteSelectors(); // to remove favs
        $('.all-stops-btn-wrapper').hide();
        return;
    }

    const excludeRoutes = ['on1', 'on2'];
    const isWeekend = new Date(today).getDay() === 0 || new Date(today).getDay() === 6;
    if (isWeekend) {
        excludeRoutes.push('wknd1', 'wknd2');
    }

    if (excludeRoutes.some(route => activeRoutes.has(route))) { return; }

    if(!minRoutes.every(str => activeRoutes.has(str))) {

        if (!isAnyBusActuallyInService) {
            $('.knight-mover').show();
        } else {
            $('.knight-mover-mini').css('display', 'flex');
        }

    } else if (settings['toggle-show-knight-mover']) {
        $('.knight-mover-mini').hide();
    }
}

function makeActiveRoutes() {
    activeRoutes.clear();
    for (const busId in busData) {
        const route = busData[busId].route;
        if (route) activeRoutes.add(route);
    }
    populateRouteSelectors(activeRoutes); 
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

        let desc = message['gtfsAlertDescriptionText'];
        desc = desc.replace(/^[A-Za-z]+\s\d{1,2}\/\d{1,2}\/\d{2,4}:\s*/, '');        

        console.log(message)

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

        $('.passio-mini').append(`<div data-alert-mini="${message['id']}" class="passio-mini-alert gap-x-0p5rem pointer">
            <div class="br-1rem bold flex justify-center align-center" style="background-color: white; color: red; aspect-ratio: 1; height: 100%;">!</div>
            <div class="pr-0p5rem">${title}</span>
        </div>`)
        .click(function() {
            $(`[data-alert-big="${message['id']}"]`).slideDown();
            $(`[data-alert-mini="${message['id']}"]`).hide();
        })

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
            populateMessages(messages);
        }
    })
    .catch(err => console.error("Error", err));

}


function cancelAllAnimations() {
    Object.keys(animationFrames).forEach(busId => {
        cancelAnimationFrame(animationFrames[busId]);
        delete animationFrames[busId];
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
        etas = data[selectedCampus];
        // console.log('ETAs fetched:', etas);
        // updateTimeToStops('all')
    } catch (error) {
        console.error('Error fetching ETAs:', error);

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
    } catch (error) {
        console.error('Error fetching waits:', error);
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
        }
    }

    await fetchJoinTimes();

    await startOvernight(false);

    await fetchBusData(false, true);

    checkShared();

    // if (!Object.keys(busData).length) {
    // await startOvernight();
    // }

    makeActiveRoutes();
    // setPolylines(activeRoutes);

    // console.log(activeRoutes)

    if (activeRoutes.size > 0) {
        updateMarkerSize(); // set correct html marker size before plotting
        checkMinRoutes();
    } else {
        $('.info-main').css('justify-content', 'center'); // change back once buses go in serve. Gonna be annoying to implement that
        // setTimeout(() => {
            // $('.bus-info-popup').hide();
        if (!passioDown && selectedCampus === 'nb') $('.knight-mover').show();
        // }, 5000);
        // $('.centerme-wrapper').addClass('centerme-bottom-right')
        $('.right-btns').addClass('right-btns-bottom')
    }
    $('.centerme-wrapper').fadeIn();

    addStopsToMap()
    $('.buses-btn').css('display', 'flex');

    setTimeout(() => {
        populateFavs()
    }, 1);
    makeRidershipChart()

    await fetchETAs();

    await fetchWhere();

    function populateJoinedService() {
        if (popupBusId) {
            const serviceDate = new Date(joined_service[popupBusId]);
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

    wsClient.connect()
    openRUBusSocket();

    // On app resume/return, force the next update to be immediate and fetch promptly
    const triggerImmediateResumeUpdate = () => {
        forceImmediateUpdate = true;
        // Kick a fetch right away to avoid waiting for the interval
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

    getMessages();

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

    for (const busId in busData) {
        if (!('visualSpeed' in busData[busId]) || busData[busId].visualSpeed < 5) continue

        const randChange = Math.random() < 0.5 ? -1 : 1;
        busData[busId].visualSpeed += randChange;
        if (popupBusId == busId && showBusSpeeds) {
            $('.info-speed-mid').text(Math.round(busData[busId].visualSpeed));
            $('.info-mph-mid').text('MPH');
        }

        if (panelRoute === busData[busId].route) {
            $(`.route-bus-speed[bus-id="${busId}"]`).text(parseInt(busData[busId].visualSpeed) + 'mph | ' + busData[busId].capacity + '% full');
        }
    }
}
