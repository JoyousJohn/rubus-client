let etas = {}
let waits = {}
let busLocations = {}
let busETAs = {}
let socket = null;

function updateETAs(etasData) {
    etas = etasData
    // console.log(etas)
}

function updateWaits(waitsData) {
    const stop = Object.keys(waitsData)[0]
    waits[stop] = Math.round(waitsData[stop])
    // console.log(waitsData)
}

function closeRUBusSocket() {
    console.log(socket.readyState)
    if (socket.readyState === WebSocket.OPEN) {
        console.log('open, closing,,,')
        socket.close();
        console.log(socket.readyState)
    } else {
        console.log('not open !!!')
    }
}

function openRUBusSocket() {

    if (socket && socket.readyState === WebSocket.OPEN) {
        closeRUBusSocket();
        fetchBusData(true); // immediately update positions
    }

    if (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost") {
        socket = new WebSocket('ws://127.0.0.1:5000/ws');
    } else {
        socket = new WebSocket('wss://transloc.up.railway.app/ws');
    }

    socket.addEventListener("open", (event) => {
        // console.log("Passio WebSocket connection opened");
    });

    function processEventData(eventData) {

        if ('event' in eventData) {

            if (eventData['event'] === 'eta_update') {
                updateETAs(eventData['etas']);
                return;
            }

            if (eventData['event'] === 'wait_update') {
                updateWaits(eventData['wait_update']);
                return;
            }

            // if(eventData['event'] === 'out_of_service') {
                
            //     eventData['oos_buses'].forEach(busId => {
            //         if (busId in busData) {
            //             console.log(`[Out of Service] Bus ${busData[busId].busName} is out of service`)
            //             busMarkers[busId].remove();
            //             delete busMarkers[busId];
            //             delete busData[busId];
            //             delete busETAs[busId];
            //         }
            //     })
            //     return;    

            // }

            const busId = parseInt(eventData.busId);

            if (!(busId in busData)) {// shouldn't happen
                console.log('this shouldnt happen');
                // busData[busId] = {}
                return
            }

            const busRoute = busData[busId].route;
            const stopId = eventData.stopId;

            if (busData[busId]['stopId']) {
                busData[busId]['prevStopId'] = busData[busId]['stopId'];
            }
            busData[busId]['stopId'] = stopId;
            busData[busId]['next_stop'] = getNextStopId(busRoute, stopId);

            const stopName = stopsData[stopId].name;
            const busName = busData[busId].busName;

            if (eventData['event'] === 'arrival') {
                busData[busId]['at_stop'] = true;
                busData[busId]['timeArrived'] = eventData['time_arrived'];
                // console.log(`[l] Bus ${busName} (${busId}) arrived at ${stopName}`)

                if (popupBusId === busId) {
                    startStoppedForTimer(busId);
                }

                busData[busId].progress = 0;

                const $busLogElm = $(`
                    <div>${new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
                    <div><strong>${busName}</strong> <span style="color: #46dd46;">arrived</span> at ${stopName}</div>
                `)
                $('.bus-log').append($busLogElm);
                $('.bus-log-wrapper').scrollTop($('.bus-log-wrapper')[0].scrollHeight);

            } else if (eventData['event'] === 'departure') {
                busData[busId]['at_stop'] = false

                let stoppedFor = Math.floor((new Date() - new Date(busData[busId]['timeArrived'])) / 1000);

                let stoppedDiff = Math.floor((stoppedFor - waits[stopId])/waits[stopId]*100)
                if (stoppedDiff > 0) {
                    stoppedDiff = '+' + stoppedDiff
                }

                if (stoppedFor < 60) {
                    stoppedFor = `${stoppedFor}s`;
                } else {
                    const minutes = Math.floor(stoppedFor / 60);
                    const seconds = stoppedFor % 60;
                    stoppedFor = `${minutes}m${seconds}s`;
                }

                delete busData[busId]['timeArrived'];
                // console.log(`[Departure] Bus ${busName} departed from ${stopName}`)

                if ($('.bus-stopped-for').is(':visible') && popupBusId === busId) {
                    clearInterval(stoppedForInterval)
                    $('.bus-stopped-for').slideUp();
                }
                delete busData[busId].overtime

                const $busLogElm = $(`
                    <div>${new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
                    <div><strong>${busName}</strong> <span style="color: #ec5050;">deparated</span> ${stopName} after ${stoppedFor} (${stoppedDiff}%)</div>
                `)
                $('.bus-log').append($busLogElm);
                $('.bus-log-wrapper').scrollTop($('.bus-log-wrapper')[0].scrollHeight);

                if (busRotationPoints[busId]) {
                    ['px1', 'px2', 'line'].forEach(val => {
                        if (busRotationPoints[busId][val]) { // not sure why this check is necessary... something with buses going in/out of service removing the point but not the var reference? how is this possible?
                            busRotationPoints[busId][val].remove();
                        }
                    })
                    delete busRotationPoints[busId];
                }
                
            }

            updateTimeToStops([busId]) // updates bus's etas to all stops

            if (popupStopId && busLocations[busId]) { // also check if in busLocations to not show stops if no info. I think updateStopBuses already prevents this but it was still showing 'bus in service since Invalid Date'
                updateStopBuses(popupStopId) // this is on the stops wrapper
            }

            if (popupBusId === busId) {
                popInfo(busId) // this is on the bus wrapper 
            }

        }

        // Initial connection, recall from visibilityChange
        else {
            for (let busId in eventData) {
                
                // console.log(parseInt('13209') in busData.keys())

                if (!(busId in busData)) {// shouldn't happen
                    console.log(busId)
                    console.log('this shouldnt happen 2')
                    // busData[busId] = {}
                    console.log(eventData)
                    continue

                }

                const busInfo = eventData[busId]

                busData[busId].at_stop = busInfo.stopped
                busData[busId].stopId = busInfo.stopId
                busData[busId].next_stop = getNextStopId(busData[busId].route, parseInt(busInfo.stopId)) // might throw error if busId not yet in busData (if rubus ws broadcasts data before new bus added from passio getData)
                busData[busId].timeArrived = busInfo.time_arrived;

            }

        }
    }

    socket.addEventListener("message", (event) => {    
        
        try {
            const eventData = JSON.parse(event.data);
            // console.log("Formatted message from server:", eventData);
            processEventData(eventData);
        } catch (error) {
            console.error("Error parsing JSON:", error);
        }

    });

    socket.addEventListener("close", (event) => {
        // console.log("Passio WebSocket connection closed:", event);
    });

    socket.addEventListener("error", (event) => {
        console.error("Passio WebSocket error:", event);
    });

}

