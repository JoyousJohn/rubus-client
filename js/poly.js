let polylineBounds;
let routeBounds ={};

async function setPolylines(activeRoutes) {
    // console.log("activeRoutes: ", activeRoutes)
    const routesToSet = Array.from(activeRoutes).filter(route => routesByCampusBase[selectedCampus].includes(route));

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

        const polylineOptions = {
            color: colorMappings[routeName],
            weight: 4,
            opacity: 1,
            smoothFactor: 1,
            // noClip: true
        };

        if (settings['toggle-polyline-padding']) {
            polylineOptions.renderer = L.svg({ padding: 1.0 });
        }

        const polyline = L.polyline(coordinates, polylineOptions);

        polyline.addTo(map);

        polylines[routeName] = polyline;

        routeBounds[routeName] = polyline.getBounds();

        fetchPromises.push(coordinates);
    }

    if (fetchPromises.length === 0) return // no routes to populate

    Promise.all(fetchPromises).then(() => {
        const group = new L.featureGroup(Object.values(polylines));
        polylineBounds = group.getBounds();
        map.fitBounds(polylineBounds, { padding: [10, 10] });
    });
}

async function getPolylineData(routeName) {

    try {

        if (!knownRoutes.includes(routeName)) return // I don't think it should even be able to get this far to need this final check?

        let polylineData = null;

        if (localStorage.getItem(`polylineData.${routeName}`) !== null) {
            // console.log(`Using cached polyline data for route ${routeName}`);
            polylineData = JSON.parse(localStorage.getItem(`polylineData.${routeName}`));
        } else {
            const response = await fetch('https://transloc.up.railway.app/r/' + routeName);
            if (response.status === 200) {
                const data = await response.json();
                localStorage.setItem(`polylineData.${routeName}`, JSON.stringify(data));
                polylineData = data;
            } else {
                console.error(`Error fetching polyline data for route ${routeName}:`, response.statusText);
            }
        }
        return polylineData;
    } catch (error) {
        console.error(`Error fetching polyline data for route ${routeName}:`, error);
    }
} 


function getValidBusesServicingStop(stopId) {
    let validBuses = [];
    const routesServicing = getRoutesServicingStop(stopId)
    routesServicing.forEach(route => {
        busesByRoutes[selectedCampus][route].forEach(busId => {
            if (isValid(busId)) {
                validBuses.push(busId);
            }
        })
    })
    return validBuses;
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

function updateStopBuses(stopId, actuallyShownRoute) {

    let servicingBuses = {}

    $('.info-stop-servicing').empty();

    const servicedRoutes = routesServicing(stopId)

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

    servicedRoutes.forEach(servicedRoute => {
        
        const $serviedRouteElm = $(`<div>${servicedRoute.toUpperCase()}</div>`);
        if (actuallyShownRoute && actuallyShownRoute !== servicedRoute) {
            $serviedRouteElm.css('color', 'var(--theme-hidden-route-col)');
        } else {
            $serviedRouteElm.css('color', colorMappings[servicedRoute]);
        }
        
        $('.info-stop-servicing').append($serviedRouteElm)
        // busIdsServicing = busIdsServicing.concat(busesByRoutes[servicedRoute]);
        busesByRoutes[selectedCampus][servicedRoute].forEach(busId => {

            let busStopId = busData[busId]['stopId']
            if (Array.isArray(busStopId)) {
                busStopId = busStopId[0];
            }

            if (busData[busId]['at_stop'] && busStopId === stopId) {
                servicingBuses[busId] = {
                    'route': servicedRoute,
                    'eta': 0,
                }
            }

            else if (busETAs[busId]) {

                let eta;
                if ((servicedRoute === 'wknd1' || servicedRoute === 'all' || servicedRoute === 'winter1' || servicedRoute === 'on1' || servicedRoute === 'summer1') && stopId === 3) { // special case
                    eta = Math.min(...Object.values(busETAs[busId][3]['via']));
                } else {
                    eta = busETAs[busId][stopId]
                }

                servicingBuses[busId] = {
                    'route': servicedRoute,
                    'eta': Math.ceil(eta/60) // can ceil only if this stop is the next stop, otherwise round to match the eta shown in bus info wrapper?
                }
            }
        })
    })

    const sortedBusIds = Object.entries(servicingBuses)
    .sort(([busIdA, a], [busIdB, b]) => {
        const aDepot = busData[busIdA]?.atDepot;
        const bDepot = busData[busIdB]?.atDepot;
        if (aDepot && !bDepot) return 1;
        if (!aDepot && bDepot) return -1;

        const aInvalid = !isValid(busIdA);
        const bInvalid = !isValid(busIdB);
        if (aInvalid && !bInvalid) return 1;
        if (!aInvalid && bInvalid) return -1;

        // Add check for negative zero
        const aIsNegZero = Object.is(a.eta, -0);
        const bIsNegZero = Object.is(b.eta, -0);
        if (aIsNegZero && !bIsNegZero) return 1;
        if (!aIsNegZero && bIsNegZero) return -1;

        return a.eta - b.eta;
    })
    .map(([busId]) => busId);

    $('.stop-info-buses-grid, .stop-info-buses-grid-next').empty();

    // const infoNextStopsScrollPosition = $('.info-next-stops').scrollTop();
    // alert(infoNextStopsScrollPosition)

    sortedBusIds.forEach(busId => {
        const data = servicingBuses[busId]

        const currentTime = new Date();
        currentTime.setMinutes(currentTime.getMinutes() + data.eta);
        const formattedTime = currentTime.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });

        $('.stop-info-buses-grid').append($(`<div class="stop-bus-route">${data.route.toUpperCase()}</div>`));

        let stopOctaconVisibilityClass = 'none'
        if (busData[busId].overtime) {
            stopOctaconVisibilityClass = ''
        }

        let stopOoSVisibilityClass = 'none';
        if (busData[busId].oos) {
            stopOoSVisibilityClass = '';
        }

        let stopDepotVisibilityClass = 'none';
        if (busData[busId].atDepot) {
            stopDepotVisibilityClass = '';
        }

        const $stopBusElm = $(`<div class="flex justify-between align-center pointer">
            <div class="flex gap-x-0p5rem">
                <div class="stop-bus-id">${busData[busId].busName}</div>
                <div class="stop-oos ${stopOoSVisibilityClass}">OOS</div>
                <div class="stop-depot ${stopDepotVisibilityClass}">Depot</div>
            </div>
            <div class="stop-octagon ${stopOctaconVisibilityClass}"><div>!</div></div>
        </div>`)
        $('.stop-info-buses-grid').append($stopBusElm);

        if (actuallyShownRoute && actuallyShownRoute !== data.route) {
            $('.stop-octagon').last().css('background-color', 'var(--theme-hidden-route-col)').find('div').css('color', 'gray');
        }

        if (Object.is(data.eta, -0)) {
            $('.stop-info-buses-grid').append(`<div class="stop-bus-eta pointer">Detour</div>`);
            $('.stop-info-buses-grid').append(`<div class="pointer"></div>`);
        } else if (Object.is(data.eta, 0)) {
            $('.stop-info-buses-grid').append(`<div class="stop-bus-eta pointer">Here</div>`);
            $('.stop-info-buses-grid').append(`<div class="pointer"></div>`);
        } else if (!busData[busId].atDepot) {
            $('.stop-info-buses-grid').append(`<div class="stop-bus-eta pointer">${data.eta >= 60 ? Math.floor(data.eta/60) + 'h ' + data.eta%60 + 'm' : data.eta + 'm'}</div>`);
            $('.stop-info-buses-grid').append(`<div class="stop-bus-time pointer">${formattedTime}</div>`);
        } else if (busData[busId].atDepot || distanceFromLine(busId) || !isValid(busId)) {
            $('.stop-info-buses-grid').append(`<div class="stop-bus-eta pointer">Xm</div>`);
            $('.stop-info-buses-grid').append(`<div class="stop-bus-time pointer">xx:xx</div>`);
        }

        if (actuallyShownRoute && actuallyShownRoute !== data.route) {
            $('.stop-bus-route').last().css('color', 'var(--theme-hidden-route-col)');
            $('.stop-bus-eta').last().css('color', 'var(--theme-hidden-route-col)');
            $('.stop-info-buses-grid').children().slice(-4).removeClass('pointer');
        } else {
            $('.stop-bus-route').last().css('color', colorMappings[data.route]);
            $('.stop-info-buses-grid').children().slice(-4).click(function() {
                sourceStopId = stopId;
                flyToBus(busId);
                $('.stop-info-popup').hide(); // this was def being handled somewhere else before... need to check what happened sometime. Hard finding changes in recent commits that might've affected this.
            });
        }
             
    })
    

    const loopTimes = calculateLoopTimes();
    const nextLoopServicing = JSON.parse(JSON.stringify(servicingBuses));

    for (busId in servicingBuses) {
        if (!busData[busId].oos && !busData[busId].atDepot) {
            nextLoopServicing[busId].eta += loopTimes[servicingBuses[busId].route];
            // nextLoopServicing[busId].isNext = true;
        } else {
            delete nextLoopServicing[busId];
        }
    }

    const sortedNextLoopBusIds = Object.entries(nextLoopServicing)
    .sort(([busIdA, a], [busIdB, b]) => {
        const aDepot = busData[busIdA]?.atDepot;
        const bDepot = busData[busIdB]?.atDepot;

        if (aDepot && !bDepot) return 1;
        if (!aDepot && bDepot) return -1;

        return a.eta - b.eta;
    })
    .map(([busId]) => busId);

    sortedNextLoopBusIds.forEach(busId => {
        const data = nextLoopServicing[busId]

        const currentTime = new Date();
        currentTime.setMinutes(currentTime.getMinutes() + data.eta);
        const formattedTime = currentTime.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });


        if (!busData[busId].overtime && !busData[busId].oos && !busData[busId].atDepot && isValid(busId)) {

            $('.stop-info-buses-grid-next').append($(`<div class="stop-bus-route">${data.route.toUpperCase()}</div>`));

            const $stopBusElm = $(`<div class="flex justify-between align-center pointer">
                <div class="flex gap-x-0p5rem">
                    <div class="stop-bus-id">${busData[busId].busName}</div>
                </div>
            </div>`)
            $('.stop-info-buses-grid-next').append($stopBusElm);

            if (data.eta === 0) {
                // $('.stop-info-buses-grid').append(`<div></div>`)
                $('.stop-info-buses-grid-next').append(`<div class="stop-bus-eta pointer">Here</div>`);
                $('.stop-info-buses-grid-next').append(`<div class="pointer"></div>`);
            } else if (!busData[busId].atDepot) {
                $('.stop-info-buses-grid-next').append(`<div class="stop-bus-eta pointer right">${data.eta >= 60 ? Math.floor(data.eta/60) + 'h ' + data.eta%60 + 'm' : data.eta + 'm'}</div>`);
                $('.stop-info-buses-grid-next').append(`<div class="stop-bus-time pointer">${formattedTime}</div>`);
            } else if (busData[busId].atDepot || distanceFromLine(busId)) {
                $('.stop-info-buses-grid-next').append(`<div class="stop-bus-eta pointer">Xm</div>`);
                $('.stop-info-buses-grid-next').append(`<div class="stop-bus-time pointer">xx:xx</div>`);
            }

            if (actuallyShownRoute && actuallyShownRoute !== data.route) {
                $('.stop-bus-route').last().css('color', 'var(--theme-hidden-route-col)');
                $('.stop-bus-eta').last().css('color', 'var(--theme-hidden-route-col)');
                $('.stop-info-buses-grid-next').children().slice(-4).removeClass('pointer');
            } else {
                $('.stop-bus-route').last().css('color', colorMappings[data.route]);
                $('.stop-info-buses-grid-next').children().slice(-4).click(function() {
                    sourceStopId = stopId;
                    flyToBus(busId);
                    $('.stop-info-popup').hide();
                });
            }
        }    
    })

    if (waits[stopId]) {
        const avgWait = waits[stopId];
        const waitStr = `${Math.floor(avgWait / 60)}m ${avgWait % 60}s`;
    
        if (!jQuery.isEmptyObject(busData)) {
            $('.stop-info-avg-wait').text(`Buses stop here for an average of ${waitStr}.`).show();
        }
    } else {
        $('.stop-info-avg-wait').hide();
    }
    
}

let sourceBusId = null;
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

async function popStopInfo(stopId) {
    if (popupStopId) {
        $(`img[stop-marker-id="${popupStopId}"]`).attr('src', 'img/stop_marker.png');
        busStopMarkers[popupStopId].setZIndexOffset(settings['toggle-stops-above-buses'] ? 1000 : 0);
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

    if (shownRoute && popupBusId) {
        busesByRoutes[selectedCampus][shownRoute].forEach(busId => {
            busMarkers[busId].getElement().style.display = '';
        })
        updateTooltips(shownRoute);
    } else {
        $('[stop-eta]').text('').hide();
    }

    popupStopId = stopId;
    popupBusId = null;

    if (selectedMarkerId && busMarkers[selectedMarkerId] ) { 
        busMarkers[selectedMarkerId].getElement().querySelector('.bus-icon-outer').style.boxShadow = '';
        busMarkers[selectedMarkerId].getElement().querySelector('.bus-icon-outer').style.borderColor = 'black';
        selectedMarkerId = null;
    }

    $('.bus-info-popup, .route-panel, .my-location-popup, .knight-mover').hide();

    // return;

    $('.info-stop-name-text').text(settings['toggle-show-stop-id'] ? `${stopName} (#${stopId})` : stopName);

    if (!settings['toggle-always-show-second']) {
        $('.stop-info-next-loop-wrapper').hide();

        if (getValidBusesServicingStop(stopId).length !== 0) {
            $('.stop-info-show-next-loop').show();
        } else {
            $('.stop-info-show-next-loop').hide();
        }
    } else {
        $('.stop-info-next-loop-wrapper').show();
        $('.stop-info-show-next-loop').hide();
    }
    updateStopBuses(stopId, shownRoute);

    if (sourceBusId && !sourceStopId) { // !sourceStopId kind a hack, have to look into how/why this is being set
        $('.stop-info-back').show();
    } else {
        $('.stop-info-back').hide();
    }

    $('.stop-info-popup').stop(true, true).show();

    $('.stop-info-popup-inner').scrollTop(0);

    $('.bus-log-wrapper').hide();

    sa_event('stop_view_test', {
        'stop_id': stopId,
        'stop_name': stopsData[stopId].name
    });
    
}

async function addStopsToMap() {

    activeStops = []

    for (const activeRoute in busesByRoutes[selectedCampus]) {
        if (!(activeRoute in stopLists)) { console.log('does this actually happen?'); continue; } // why would this trigger?
        activeStops = [...activeStops, ...stopLists[activeRoute]];
        activeStops = [...new Set(activeStops)];
    }

    if (!activeStops.length) { // no buses running, show all stops
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

                sourceStopId = null;
                sourceBusId = null;
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
    for (const route in busesByRoutes) {
        if (route in stopLists) {
            newActiveStops = [...newActiveStops, ...stopLists[route]];
        }
    }
    newActiveStops = [...new Set(newActiveStops)];
    activeStops = newActiveStops; // confirm this work

    // if (newActiveStops.length === 0) {
    //     newActiveStops = Array.from({length: 25}, (_, i) => i + 1);
    // }

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


function progressToNextStop(busId) {
    if (!busData[busId]['next_stop']) {
        return 0;
    }

    const campusPercentages = percentageDistances[selectedCampus];

    const nextStopId = String(busData[busId]['next_stop']);
    if (!campusPercentages[nextStopId]) {
        return 0;
    }

    const prevStopId = String(busData[busId]['stopId']);
    if (!campusPercentages[nextStopId]['from'][prevStopId]) {
        return 0;
    }

    const nextStopDistances = campusPercentages[nextStopId]['from'][prevStopId]['geometry']['coordinates'];
    const percentages = campusPercentages[nextStopId]['from'][prevStopId]['properties']['percentages'];

    const busLat = busData[busId]['lat'];
    const busLng = busData[busId]['long'];

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