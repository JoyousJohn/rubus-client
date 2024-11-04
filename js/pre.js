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
    '43990': 'null',
    'ONWK1FS': 'on1',
    'ONWK2FS': 'on2',
    'Football Service Transition': 'ftbl',
    '43991': 'ftbl',
    '4067': 'c'
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

        for (const someId in data.buses) {

            if (someId === '-1') continue;

            const bus = data.buses[someId][0]
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

            if (Object.keys(excludedRouteMappings).includes(bus.routeId)) {
                continue
            }

            if (bus.routeId in routeMapping) {
                busData[busId].route = routeMapping[bus.routeId]
            } else {
                busData[busId].route = bus.route
            }            
            busData[busId].capacity = bus.paxLoad

            plotBus(busId)
            calculateSpeed(busId)
            
        }

        // console.log('activeBuses', activeBuses)

        // activeBuses = activeBuses.filter(num => num !== 13209);

        for (const busId in busData) { 

            // console.log(busId)

            if (!activeBuses.includes(parseInt(busId))) {

                console.log(`[Out of Service] Bus ${busData[busId].busName} is out of service`)
                busMarkers[busId].remove();
                delete busMarkers[busId];
                delete busData[busId];
                delete busETAs[busId];   
                
            }

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

        let routeStops = stopLists[busRoute]
        let sortedStops = []

        const nextStopIndex = routeStops.indexOf(nextStop);
        if (nextStopIndex !== -1) {
            sortedStops = routeStops.slice(nextStopIndex)
                            .concat(routeStops.slice(0, nextStopIndex));
        }

        if (nextStopIndex + 1 === routeStops.length) {
            sortedStops.push(routeStops[0])
        } else {
            sortedStops.push(routeStops[nextStopIndex + 1])
        }

        let currentETA = 0

        // console.log(busId)

        for (let i = 0; i < sortedStops.length-1; i++) {

            if (etas) {

                let prevStopId

                if (i === 0) {
                    prevStopId = sortedStops[sortedStops.length-1]
                } else {
                    prevStopId = sortedStops[i-1]
                }

                const thisStopId = sortedStops[i]

                // console.log('prev stop: ', prevStopId)
                // console.log('thisStopId stop: ', thisStopId)
                // console.log('eta: ', currentETA)

                // console.table(etas[thisStopId])

                if (etas[thisStopId] && prevStopId in etas[thisStopId]['from']) {
                    currentETA += etas[thisStopId]['from'][prevStopId]
                } else {
                    // console.log(routeStops)
                    // console.log('nextStop: ', nextStop)
                    // console.log(thisStopId + ' from  ' + prevStopId + ' not found. 1111111')
                    currentETA += 300
                }

                if (waits[prevStopId]) {
                    currentETA += waits[prevStopId]
                    // console.log(`Adding ${waits[prevStopId]}s to currentETA to get to stopId ${thisStopId}`)
                } else {
                    currentETA += 30
                }

                if (!busETAs[busId]) {
                    busETAs[busId] = {};
                }
                busETAs[busId][thisStopId] = Math.round(currentETA)

                if (busId === '18018') {
                    console.log(`[${busId}] ETA for stopId ${thisStopId}: ${busETAs[busId][thisStopId]} seconds`)
                }

            }
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
    } else {
        $('.bus-info-popup').show().find('.info-campuses').text('Checking for buses...');
        setTimeout(() => {
            $('.bus-info-popup').find('.info-campuses').text('No buses running!');
        }, 5000);
    }

    makeBusesByRoutes()
    addStopsToMap()

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
        } catch (error) {
            console.error('Error fetching bus locations:', error);
        }
    }

    await fetchWhere();

    openRUBusSocket();

    // if (Object.keys(busData).length === 0) wsClient.connect();

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
        if (popupBusId == busId) {
            $('.info-speed').text(Math.round(busData[busId].visualSpeed))
            // console.log('changed speed to ' + busData[busId].visualSpeed)
        }

        if (panelRoute === busData[busId].route) {
            $(`.route-bus-speed[bus-id="${busId}"]`).text(parseInt(busData[busId].visualSpeed) + 'mph | ' + busData[busId].capacity + '% full')
        }
    }
}
