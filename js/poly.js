let polylineBounds;

async function setPolylines(activeRoutes) {
    const fetchPromises = [];

    for (const routeName of activeRoutes) {
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

        const polyline = L.polyline(coordinates, {
            color: colorMappings[routeName],
            weight: 4,
            opacity: 1,
            smoothFactor: 1
        });

        // Add the polyline to the map
        polyline.addTo(map);

        polylines[routeName] = polyline;

        fetchPromises.push(coordinates);
    }

    if (fetchPromises.length === 0) return // no routes to populate

    Promise.all(fetchPromises).then(() => {
        // Fit the map to show all polylines
        const group = new L.featureGroup(Object.values(polylines));
        polylineBounds = group.getBounds();
        map.fitBounds(polylineBounds, { padding: [10, 10] });
        // addStopsToMap();
    });
}

async function getPolylineData(routeName) {

    try {

        const knownRoutes = ['a', 'b', 'bhe', 'ee', 'f', 'h', 'lx', 'on1', 'on2', 'rexb', 'rexl', 'wknd1', 'wknd2', 'c', 'lx', 'ftbl']
        if (!knownRoutes.includes(routeName)) return

        let polylineData;

        if (localStorage.getItem(`polylineData.${routeName}`) !== null) {
            polylineData = JSON.parse(localStorage.getItem(`polylineData.${routeName}`));
        } else {
            const response = await fetch('https://transloc.up.railway.app/r/' + routeName);
            const data = await response.json();
            localStorage.setItem(`polylineData.${routeName}`, JSON.stringify(data));
            polylineData = data;
        }
        return polylineData;
    } catch (error) {
        console.error(`Error fetching polyline data for route ${routeName}:`, error);
    }
} 

const busStopMarkers = {};
let stopsData = null;
let stopLists;

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

function updateStopBuses(stopId) {
    let servicingBuses = {}

    $('.info-stop-servicing').empty();

    const servicedRoutes = routesServicing(stopId)

    // console.log('servicedRoutes:', servicedRoutes)

    if (!servicedRoutes.length) {

        let stopNoBusesMsg

        if (!jQuery.isEmptyObject(busData)) {
            stopNoBusesMsg = 'NOT SERVICED BY ACTIVE ROUTES'
        } else {
            stopNoBusesMsg = 'NO BUSES ACTIVE'
        }

        const $noneRouteElm = $(`<div class="no-buses">${stopNoBusesMsg}/div>`)
        $('.info-stop-servicing').append($noneRouteElm)
    }

    servicedRoutes.forEach(servicedRoute => {
        const $serviedRouteElm = $(`<div>${servicedRoute.toUpperCase()}</div>`).css('color', colorMappings[servicedRoute])
        $('.info-stop-servicing').append($serviedRouteElm)
        // busIdsServicing = busIdsServicing.concat(busesByRoutes[servicedRoute]);
        busesByRoutes[servicedRoute].forEach(busId => {

            if (busData[busId]['at_stop'] && busData[busId]['stopId'] === stopId) {
                servicingBuses[busId] = {
                    'route': servicedRoute,
                    'eta': 0,
                }
            }

            else if (busETAs[busId]) {
                servicingBuses[busId] = {
                    'route': servicedRoute,
                    'eta': Math.round(busETAs[busId][stopId]/60)
                }
            }
        })
    })

    const sortedBusIds = Object.entries(servicingBuses)
        .sort(([, a], [, b]) => a.eta - b.eta)
        .map(([busId]) => busId);

    $('.stop-info-buses-grid').empty();

    sortedBusIds.forEach(busId => {
        const data = servicingBuses[busId]

        const currentTime = new Date();
        currentTime.setMinutes(currentTime.getMinutes() + data.eta);
        const formattedTime = currentTime.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });

        $('.stop-info-buses-grid').append($(`<div class="stop-bus-route">${data.route.toUpperCase()}</div>`).css('color', colorMappings[data.route]))
        $('.stop-info-buses-grid').append(`<div class="stop-bus-id">${busData[busId].busName}</div>`)

        if (data.eta === 0) {
            // $('.stop-info-buses-grid').append(`<div></div>`)
            $('.stop-info-buses-grid').append(`<div class="stop-bus-eta">Here</div>`)
            $('.stop-info-buses-grid').append(`<div></div>`)
        } else {
            $('.stop-info-buses-grid').append(`<div class="stop-bus-eta">${(data.eta)}m</div>`)
            $('.stop-info-buses-grid').append(`<div class="stop-bus-time">${formattedTime}</div>`)
        }
             
        $('.stop-info-buses-grid').children().slice(-4).click(function() {
            flyToBus(busId)
        });
    })

    const avgWait = waits[stopId]
    const waitStr = `${Math.round(avgWait / 60)}m ${avgWait % 60}s`
    $('.stop-info-avg-wait').text(`Buses stop here for an average of ${waitStr}.`)
}

async function popStopInfo(stopId) {

    if (Number(closestStopId) === stopId) {
        $('.closest-stop').show();
    } else {
        $('.closest-stop').hide();
    }

    popupStopId = stopId;
    $('.bus-info-popup, .route-panel').hide();

    const stopData = stopsData[stopId]
    $('.info-stop-name').text(stopData.name)

    updateStopBuses(stopId);

    $('.stop-info-popup').show().scrollTop(0);
    
}

async function addStopsToMap() {

    stopLists = await getStopsList()
    activeStops = []

    for (const activeRoute in busesByRoutes) {
        if (!(activeRoute in stopLists)) continue
        activeStops = [...activeStops, ...stopLists[activeRoute]]
        activeStops = [...new Set(activeStops)]
    }

    if (!activeStops.length) { // no buses running, show all stops
        activeStops = Array.from({length: 22}, (_, i) => i + 1);
    }

    // console.log(activeStops)

    stopsData = await getStopsData();
    checkIfLocationShared();

    activeStops.forEach(stopId => {

        const thisStop = stopsData[stopId];
        const lat = thisStop['latitude'];
        const long = thisStop['longitude'];

        const busStopIcon = L.icon({
            iconUrl: 'img/stop_marker.png',
            iconSize: [18, 18], // Customize icon size as needed
            iconAnchor: [9, 9], // Center the icon
            // popupAnchor: [0, -15] // Adjust the popup location
        });

        // Create a marker for the current bus stop
        const marker = L.marker([lat, long], { icon: busStopIcon })
            .addTo(map) // Add the marker to the map
            .on('click', function() {
                popStopInfo(stopId)
            })

        busStopMarkers[stopId] = marker;
    });

    async function getStopsList() {
        try {
            let stopListsData;
    
            if (localStorage.getItem('stopsList') !== null) {
                stopListsData = JSON.parse(localStorage.getItem('stopsList'));
            } else {
                const response = await fetch('https://transloc.up.railway.app/stopLists');
                const data = await response.json();
                localStorage.setItem('stopsList', JSON.stringify(data));
                stopListsData = data;
            }
            return stopListsData;
        } catch (error) {
            console.error('Error fetching bus stop list:', error);
            throw error; // Propagate the error
        }
    }

    async function getStopsData() {
        try {
            if (localStorage.getItem('stopsData') !== null) {
                stopsData = JSON.parse(localStorage.getItem('stopsData'));
            } else {
                const response = await fetch('https://transloc.up.railway.app/stops');
                const data = await response.json();
                localStorage.setItem('stopsData', JSON.stringify(data));
                stopsData = data;
            }
            return stopsData;
        } catch (error) {
            console.error('Error fetching stops data:', error);
        }
    }

}

function routesServicing(stopId) {
    let routesServicing = []  
    activeRoutes.forEach(activeRoute => {
        if (activeRoute in stopLists && stopLists[activeRoute].includes(stopId)) { // remove activeRoute in stopLists check after adding football routes + stops
            routesServicing.push(activeRoute)
        }
    })
    return routesServicing
}

let busesByRoutes = {}

function makeBusesByRoutes() {
    busesByRoutes = {}
    for (const bus in busData) {
        const route = busData[bus].route 
        // console.log(route)
        if (!busesByRoutes.hasOwnProperty(route)) {
            busesByRoutes[route] = []
        }
        busesByRoutes[route].push(bus)
        // console.log(busesByRoutes[route])
    }
}

