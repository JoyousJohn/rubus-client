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
    'ONWK1FS': 'on1',
    'ONWK2FS': 'on2',
    'Football Service Transition': 'ftbl',
    '43991': 'ftbl',
    '4067': 'c',
    '37199': 'all'
}

const excludedRouteMappings = {
    '4056': 'Penn Station Local',
    '4063': 'Campus Connect',
    '4088': 'Campus Connect Express',
    '41231': 'Camden',
    '4098': 'Penn Station Express'
}


async function fetchBusData() {

    const formData = '{"s0":"1268","sA":1}';
    // const formData = '{"s0":"1268","sA":1,"rA":15,"r0":"41231","r1":"4067","r2":"43711","r3":"43431","r4":"43440","r5":"43441","r6":"43398","r7":"43991","r8":"43990","r9":"43973","r10":"43397","r11":"4088","r12":"4063","r13":"4056","r14":"4098", "r15": "-1"}'
    const url = `https://passiogo.com/mapGetData.php?getBuses=1&wTransloc=1&hideExcluded=0&showBusInOos=0&showBusesExcluded=1&json=${encodeURIComponent(formData)}`;

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
                busData[busId] = {}
                busData[busId].previousTime = new Date().getTime() - 5000;
            }

            busData[busId].busName = bus.busName
            busData[busId].lat = bus.latitude
            busData[busId].long = bus.longitude
            busData[busId].rotation = parseFloat(bus.calculatedCourse) //+ 45

            

            if (bus.routeId in routeMapping) {
                busData[busId].route = routeMapping[bus.routeId]
            } else {
                busData[busId].route = bus.route
            }            
            busData[busId].capacity = bus.paxLoad

            plotBus(busId)
            calculateSpeed(busId)

            // since fetchBusData is called once before etas and waits are fetched. Maybe find a better way to do this later.
            if (Object.keys(etas).length > 0) {
                updateTimeToStops([busId])
            }

            makeBusesByRoutes()
            pollActiveRoutes.add(busData[busId].route)
            
            if (busId === popupBusId) {
                $('.info-capacity').text(bus.paxLoad + '% capacity');
            }

        }

        // console.log('activeBuses', activeBuses)

        // activeBuses = activeBuses.filter(num => num !== 13209);

        for (const busId in busData) { 

            // console.log(busId)
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
                pollActiveRoutes.delete(route);

                makeBusesByRoutes();
                if (jQuery.isEmptyObject(busesByRoutes)) {
                    console.log(`[INFO] The last bus for route ${route} went out of service.`)
                    polylines[route].remove();
                    $(`.route-selector[routename="${route}"]`).remove();
                }

                delete busData[busId];   
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
        const stopId = data.stopId

        const busRoute = busData[busId].route
        const nextStop = getNextStopId(busRoute, stopId)
        busData[busId].next_stop = nextStop

        let routeStops = stopLists[busRoute]
        // console.log(routeStops.length)
        let sortedStops = []

        const nextStopIndex = routeStops.indexOf(nextStop);
        if (nextStopIndex !== -1) {
            sortedStops = routeStops.slice(nextStopIndex)
                            .concat(routeStops.slice(0, nextStopIndex));
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
                busETAs[busId][thisStopId] = Math.round(currentETA)
            }
        }

        if (popupBusId === busId) {
            popInfo(busId)
        }

    });

}


$(document).ready(async function() {

    await fetchBusData();

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
        $('.bus-info-popup').show().find('.info-campuses').text('Checking for buses...').addClass('pulsate');
        $('.info-main').css('justify-content', 'center'); // change back once buses go in serve. Gonna be annoying to implement that
        setTimeout(() => {
            $('.bus-info-popup').find('.info-campuses').text('No buses running!').removeClass('pulsate');
        }, 5000);
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
            console.log('ETAs fetched:', etas);
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
            console.log('Waits fetched:', waits);
            // updateTimeToStops('all')
        } catch (error) {
            console.error('Error fetching waits:', error);
        }

    }

    await fetchETAs();

    async function fetchWhere() {
        try {
            const response = await fetch('https://transloc.up.railway.app/where');
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            const data = await response.json();
            busLocations = data;
            console.log('Bus locations fetched:', busLocations);

            const validBusIds = []
            for (const busId in busLocations) {
                if (!(busId in busData)) { continue; } // refreshed page and bus went out of service before backend could remove from busdata, still in bus_locactions.
                busData[busId]['stopId'] = parseInt(busLocations[busId])
                validBusIds.push(busId)
            }

            updateTimeToStops(validBusIds)
            if (popupStopId) {
                updateStopBuses(popupStopId)
            }
        } catch (error) {
            console.error('Error fetching bus locations:', error);
        }
    }

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
                const formattedTime = new Date(joined_service[popupBusId]).toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: undefined,
                    hour12: true
                });
                $('.bus-joined-service').text('Joined service at ' + formattedTime);
                $('.info-next-stops').show();
            }

        } catch (error) {
            console.error('Error fetching joined service times:', error);
        }
    }

    fetchJoinTimes();

    openRUBusSocket();

    if (Object.keys(busData).length === 0) wsClient.connect();

    setTimeout(() => {
        fetchBusData();
    }, 2000);

    setInterval(async () => {
        await fetchBusData();
    }, 5000);

    setInterval(async () => {
        await randomStepBusSpeeds();
    }, Math.floor(Math.random() * (1000 - 200 + 1)) + 200);

})

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
