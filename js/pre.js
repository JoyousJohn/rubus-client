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
    '55366': 'c'
}

const excludedRouteMappings = {
    '4056': 'Penn Station Local',
    '4063': 'Campus Connect',
    '4088': 'Campus Connect Express',
    '41231': 'Camden',
    '4098': 'Penn Station Express'
}

function getRouteStr(route) {
    if (route in routeMapping) {
        return [routeMapping[route], true]
    } else {
        const knownRoutes = ['a', 'b', 'bhe', 'ee', 'f', 'h', 'lx', 'on1', 'on2', 'rexb', 'rexl', 'wknd1', 'wknd2', 'c', 'ftbl', 'all', 'winter1', 'winter2', 'bl']
        let alphaRouteId = bus.route.replace(/[^a-zA-Z]/g, '').toLowerCase();
        if (knownRoutes.includes(alphaRouteId)) {
            return [alphaRouteId, true];
        } else {
            return [route, false] // unknown route
        }
    }     
}

async function fetchBusData(immediatelyUpdate) {

    const formData = '{"s0":"1268","sA":1}';
    // const formData = '{"s0":"1268","sA":1,"rA":15,"r0":"41231","r1":"4067","r2":"43711","r3":"43431","r4":"43440","r5":"43441","r6":"43398","r7":"43991","r8":"43990","r9":"43973","r10":"43397","r11":"4088","r12":"4063","r13":"4056","r14":"4098", "r15": "-1"}'
    const url = `https://passiogo.com/mapGetData.php?getBuses=1&wTransloc=1&hideExcluded=0&showBusInOos=1&showBusesExcluded=1&json=${encodeURIComponent(formData)}`;

    try {
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

        // Check if response is OK
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        // console.log('Response data:', data);

        let activeBuses = []
        let pollActiveRoutes = new Set()

        for (const someId in data.buses) {

            if (someId === '-1') continue;

            const bus = data.buses[someId][0]

            if (Object.keys(excludedRouteMappings).includes(bus.routeId)) { // if passio changes ids and a new non-nb bus route id is added then getNextStop will fail bc route is not in stopLists. Implement better system later.
                continue
            }

            const busId = bus.busId
            activeBuses.push(busId)

            if (!(busId in busData)) {
                busData[busId] = {};
                busData[busId].previousTime = new Date().getTime() - 5000;
                busData[busId].previousPositions = [[parseFloat(bus.latitude), parseFloat(bus.longitude)]];
            }

            busData[busId].busName = bus.busName;
            busData[busId].lat = bus.latitude;
            busData[busId].long = bus.longitude;

            const lastPosition = busData[busId].previousPositions[busData[busId].previousPositions.length - 1]
            if (lastPosition && lastPosition[0] !== parseFloat(bus.latitude) && lastPosition[1] !== parseFloat(bus.longitude)) {
                busData[busId].previousPositions.push([parseFloat(bus.latitude), parseFloat(bus.longitude)])
            }

            busData[busId].rotation = parseFloat(bus.calculatedCourse); //+ 45

            // let alphaRouteId = bus.routeId.replace(/[^a-zA-Z]/g, '')

            const [routeStr, isKnown] = getRouteStr(bus.routeId)
            busData[busId].route = routeStr
            busData[busId].isKnown = isKnown

            busData[busId].capacity = bus.paxLoad;

            busData[busId].oos = bus.outOfService === 1; 

            plotBus(busId, immediatelyUpdate);
            calculateSpeed(busId);

            // since fetchBusData is called once before etas and waits are fetched. Maybe find a better way to do this later.
            if (Object.keys(etas).length > 0) {
                updateTimeToStops([busId]);
            }

            const newRoutes = pollActiveRoutes.difference(activeRoutes);
            if (newRoutes.size > 0) {
                setPolylines(newRoutes);
                populateRouteSelectors(newRoutes);
                activeRoutes.union(newRoutes)
            }

            makeBusesByRoutes();
            pollActiveRoutes.add(busData[busId].route);
            
            if (busId === popupBusId) {
                $('.info-capacity').text(bus.paxLoad + '% capacity');
            }

        }

        // console.log('activeBuses', activeBuses)

        // activeBuses = activeBuses.filter(num => num !== 13209);

        for (const busId in busData) { 

            // console.log(busData)
            if (busData[busId]['route'] === 'on1' || busData[busId]['route'] === 'on2') {
                continue;
            }

            if (!activeBuses.includes(parseInt(busId))) {

                console.log(`[Out of Service] Bus ${busData[busId].busName} is out of service`)

                if (busMarkers[busId]) { // investigate why this would occur
                    busMarkers[busId].remove();
                    console.log('removing')
                }
                delete busMarkers[busId];
                delete busETAs[busId];   

                const route = busData[busId].route

                delete busData[busId];   
                makeBusesByRoutes(); // need to delete from busData first since the func pops busesByRoutes from busData

                if (!busesByRoutes[route]) {
                    console.log(`[INFO] The last bus for route ${route} went out of service.`)
                    polylines[route].remove();
                    $(`.route-selector[routename="${route}"]`).remove();
                }

                removePreviouslyActiveStops();

                if (popupBusId === busId) {
                    hideInfoBoxes();
                    sourceBusId = null;
                }
            }
        }

        if ($('.buses-panel-wrapper').is(':visible')) {
            updateBusOverview(Array.from(pollActiveRoutes))
        }

        if (popupStopId) {
            updateStopBuses(popupStopId)
        }

    } catch (error) {
        console.error('Error fetching bus data:', error);
    }
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

        if ((busRoute === 'wknd1' || busRoute === 'all' || busRoute === 'winter1' || busRoute === 'on1') && nextStop === 3) { // special case

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
                    console.log('i: ' + i + ' thisStopId -> [' + thisStopId + '][from][' + prevStopId + '] <- prevStopId' + ' not found.')
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

                if ((busRoute === 'wknd1' || busRoute === 'all' || busRoute === 'winter1' || busRoute === 'on1') && thisStopId === 3) { // special case
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

}


async function fetchWhere() {
    try {
        const response = await fetch('https://transloc.up.railway.app/where');
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        const data = await response.json();
        const busLocations = data;
        console.log('Bus locations fetched:', busLocations);

        const validBusIds = []
        for (const busId in busLocations) {

            if (!(busId in busData)) { continue; } // refreshed page and bus went out of service before backend could remove from busdata, still in bus_locactions.
                            
            busData[busId]['stopId'] = parseInt(busLocations[busId][0])
            if (busLocations[busId].length === 2) {
                busData[busId]['prevStopId'] = parseInt(busLocations[busId][1])  
            }

            validBusIds.push(busId)
        }

        updateTimeToStops(validBusIds)
        if (popupStopId) {
            updateStopBuses(popupStopId)
        }

        if (popupBusId) {
            popInfo(popupBusId)
        }

    } catch (error) {
        console.error('Error fetching bus locations:', error);
    }
}


async function startOvernight() {

    response = await fetch('https://transloc.up.railway.app/overnight');

    if (!response.ok) {
        throw new Error('Network response was not ok');

    } else {
        const data = await response.json();

        if (Object.keys(data).length) {
            wsClient.connect()
            
            for (const someId in data) {
    
                const bus = data[someId]
    
                if (Object.keys(excludedRouteMappings).includes(bus.routeId)) { // if passio changes ids and a new non-nb bus route id is added then getNextStop will fail bc route is not in stopLists. Implement better system later.
                    continue
                }
    
                const busId = bus.bus_id
    
                if (!(busId in busData)) {
                    busData[busId] = {}
                    busData[busId].previousTime = new Date().getTime() - 5000;
                    busData[busId].previousPositions = [[parseFloat(bus.lat), parseFloat(bus.lng)]]
                }
    
                busData[busId].busName = bus.name
                busData[busId].lat = bus.lat
                busData[busId].long = bus.lng
    
                busData[busId].rotation = parseFloat(bus.rotation)
    
                const [routeStr, isKnown] = getRouteStr(bus.route)
                busData[busId].route = routeStr
                busData[busId].isKnown = isKnown
                activeRoutes.add(busData[busId].route)

                busData[busId].capacity = bus.capacity
    
                plotBus(busId)
                calculateSpeed(busId)
    
                makeBusesByRoutes()
    
            }
        }

        // console.log(activeRoutes)
        // setPolylines(activeRoutes)

    }
}

$(document).ready(async function() {
    // Initialize settings before map is created
    settings = localStorage.getItem('settings');
    if (settings) {
        settings = JSON.parse(settings);
    } else {
        settings = defaultSettings;
    }

    await fetchBusData();

    if (!Object.keys(busData).length) {
        startOvernight();
    }

    for (const busId in busData) {
        const route = busData[busId].route
        if (route) activeRoutes.add(route);
    }

    if (activeRoutes.size > 0) {
        setPolylines(activeRoutes)
        populateRouteSelectors(activeRoutes)
        $('.info-mph').text('MPH')
        updateMarkerSize() // set correct html marker size before plotting
    } else {
        // $('.bus-info-popup').show().find('.info-campuses').text('Checking for buses...').addClass('pulsate');
        $('.info-main').css('justify-content', 'center'); // change back once buses go in serve. Gonna be annoying to implement that
        // setTimeout(() => {
            // $('.bus-info-popup').hide();
        $('.knight-mover').show();
        // }, 5000);
        $('.centerme-wrapper').addClass('centerme-bottom-right')
    }
    $('.centerme-wrapper').fadeIn();

    addStopsToMap()
    $('.buses-btn').css('display', 'flex');

    makeRidershipChart()

    async function fetchETAs() {
        try {
            const response = await fetch('https://transloc.up.railway.app/etas');
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            const data = await response.json();
            etas = data;
            // console.log('ETAs fetched:', etas);
            // updateTimeToStops('all')
        } catch (error) {
            console.error('Error fetching ETAs:', error);

            $('.notif-popup').text('RUBus/Passio servers are experiencing issues and ETAs could not be fetched. Accurate, live bus positioning is still available.').fadeIn();

        }

        try {
            const response = await fetch('https://transloc.up.railway.app/waits');
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            const data = await response.json();
            waits = data;
            // console.log('Waits fetched:', waits);
            // updateTimeToStops('all')
        } catch (error) {
            console.error('Error fetching waits:', error);
        }

    }

    await fetchETAs();

    await fetchWhere();

    async function fetchJoinTimes() {
        try {
            const response = await fetch('https://transloc.up.railway.app/joined_service');
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            const joined_service = await response.json();
            // console.log('Bus joined service times:', joined_service);

            for (const busId in joined_service) {
                if (!(busId in busData)) { continue; } 
                busData[busId]['joined_service'] = joined_service[busId]
            }

            if (popupBusId) {
                // alert(joined_service[popupBusId])
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

        } catch (error) {
            console.error('Error fetching joined service times:', error);
        }
    }

    fetchJoinTimes();

    openRUBusSocket();

    if (!wsClient.ws) {
        startBusPolling();
    }

    setInterval(async () => {
        await randomStepBusSpeeds();
    }, Math.floor(Math.random() * (1000 - 200 + 1)) + 200);

    document.addEventListener('visibilitychange', async function() {
        if (document.visibilityState === 'visible') {
            $('.updating-buses').fadeIn();
            hideInfoBoxes(); // Otherwise can check what menus were open and update them after getting new bus data - e.g. having to close "stopped for" from pre-existing selected bus if no longer stopped
            await fetchWhere();
            openRUBusSocket();

            if (!Object.keys(busData).length) {
                startOvernight();
            }

            $('.updating-buses').slideUp();
        }
    });

})

function startBusPolling() {
    setTimeout(() => {
        fetchBusData();
    }, 2000);

    setInterval(async () => {
        await fetchBusData();
    }, 5000);
}

async function randomStepBusSpeeds() {

    for (const busId in busData) {
        if (!('visualSpeed' in busData[busId]) || busData[busId].visualSpeed < 5) continue

        const randChange = Math.random() < 0.5 ? -1 : 1;
        busData[busId].visualSpeed += randChange;
        if (popupBusId == busId && showBusSpeeds) {
            $('.info-speed').text(Math.round(busData[busId].visualSpeed))
            // console.log('changed speed to ' + busData[busId].visualSpeed)
        }

        if (panelRoute === busData[busId].route) {
            $(`.route-bus-speed[bus-id="${busId}"]`).text(parseInt(busData[busId].visualSpeed) + 'mph | ' + busData[busId].capacity + '% full')
        }
    }
}
