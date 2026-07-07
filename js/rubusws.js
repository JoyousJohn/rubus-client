// Utility function to deeply extract all values from nested objects/arrays
function extractAllValues(obj, maxDepth = 5, currentDepth = 0) {
    if (currentDepth >= maxDepth) {
        return '[Max depth reached]';
    }

    if (obj === null || obj === undefined) {
        return obj;
    }

    if (typeof obj === 'string' || typeof obj === 'number' || typeof obj === 'boolean') {
        return obj;
    }

    if (typeof obj === 'function') {
        return '[Function: ' + (obj.name || 'anonymous') + ']';
    }

    if (obj instanceof Error) {
        return obj.message + (obj.stack ? '\n' + obj.stack : '');
    }

    if (obj instanceof Event) {
        const eventDetails = {
            type: obj.type,
            target: obj.target ? extractAllValues(obj.target, maxDepth, currentDepth + 1) : null,
            currentTarget: obj.currentTarget ? extractAllValues(obj.currentTarget, maxDepth, currentDepth + 1) : null,
            bubbles: obj.bubbles,
            cancelable: obj.cancelable,
            defaultPrevented: obj.defaultPrevented,
            timeStamp: obj.timeStamp
        };

        // Add any additional properties that might be specific to this event type
        for (let key in obj) {
            if (obj.hasOwnProperty(key) && !(key in eventDetails)) {
                try {
                    eventDetails[key] = extractAllValues(obj[key], maxDepth, currentDepth + 1);
                } catch (e) {
                    eventDetails[key] = '[Unable to read property]';
                }
            }
        }

        return eventDetails;
    }

    if (Array.isArray(obj)) {
        return obj.map(item => extractAllValues(item, maxDepth, currentDepth + 1));
    }

    if (typeof obj === 'object') {
        const result = {};
        for (let key in obj) {
            if (obj.hasOwnProperty(key)) {
                try {
                    result[key] = extractAllValues(obj[key], maxDepth, currentDepth + 1);
                } catch (e) {
                    result[key] = '[Unable to read property]';
                }
            }
        }
        return result;
    }

    return String(obj);
}

let etas = {}
let waits = {}
let busLocations = {}
let busETAs = {}
let socket = null;

function updateETAs(etasData) {
    etas = etasData[selectedCampus] || {};
    // console.log(etas)
}

function updateWaits(waitsData) {
    const stop = Object.keys(waitsData)[0]
    waits[stop] = Math.round(waitsData[stop])
    // console.log(waitsData)
}

function closeRUBusSocket() {
    if (socket.readyState === WebSocket.OPEN) {
        socket.close();
    }
}

function openRUBusSocket() {

    if (socket && socket.readyState === WebSocket.OPEN) {
        closeRUBusSocket();
        // fetchBusData(true); // immediately update positions
    }

    // if (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost") {
        // socket = new WebSocket('ws://127.0.0.1:5000/ws');
    // } else {
        socket = new WebSocket('wss://demo.rubus.live/ws');
    // }

    // Make it globally accessible for status checking
    window.socket = socket;

    socket.addEventListener("open", (event) => {
        // console.log("RUBus WebSocket connection opened");
        // Update response time to indicate WebSocket is active
        updateRubusResponseTime();
    });

    function processEventData(eventData) {

        if ('event' in eventData) {

            if (eventData['event'] === 'eta_update') {
                updateETAs(eventData['etas']);
                return;
            }

            if (eventData['event'] === 'wait_update') {
                if (eventData['campus'] === selectedCampus) {
                    updateWaits(eventData['wait_update']);
                }
                return;
            }

            // if(eventData['event'] === 'out_of_service') {
                
            //     eventData['oos_buses'].forEach(busName => {
            //         if (busName in busData) {
            //             console.log(`[Out of Service] Bus ${busData[busName].busName} is out of service`)
            //             busMarkers[busName].remove();
            //             delete busMarkers[busName];
            //             delete busData[busName];
            //             delete busETAs[busName];
            //         }
            //     })
            //     return;    

            // }

            const busName = eventData.busName;

            if (!(busName in busData)) {// shouldn't happen
                console.log('this finally should happen bc we are excluding buses from other campuses');
                // busData[busName] = {}
                return
            }

            const busRoute = busData[busName].route;
            const stopId = eventData.stopId;

            if (busData[busName]['stopId']) {
                busData[busName]['prevStopId'] = busData[busName]['stopId'];
            }
            busData[busName]['stopId'] = stopId;
            busData[busName]['next_stop'] = getNextStopId(busRoute, stopId);

            const stopName = stopsData[stopId].name;

            if (eventData['event'] === 'arrival') {
                busData[busName]['at_stop'] = true;
                busData[busName]['timeArrived'] = eventData['time_arrived'];
                // console.log(`[l] Bus ${busName} (${busName}) arrived at ${stopName}`)

                if (popupBusName === busName) {
                    startStoppedForTimer(busName);
                    
                    if (settings['toggle-distances-line-on-focus']) {
                        showDistanceLineOnFocus(busName);
                    }
                }

                busData[busName].progress = 0;

                const $busLogElm = $(`
                    <div>${new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
                    <div><strong>${busName}</strong> <span style="color: #46dd46;">arrived</span> at ${stopName}</div>
                `)
                $('.bus-log').append($busLogElm);
                $('.bus-log-wrapper').scrollTop($('.bus-log-wrapper')[0].scrollHeight);

            } else if (eventData['event'] === 'departure') {
                busData[busName]['at_stop'] = false

                let stoppedFor = Math.floor((new Date() - new Date(busData[busName]['timeArrived'])) / 1000);

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

                delete busData[busName]['timeArrived'];
                // console.log(`[Departure] Bus ${busName} departed from ${stopName}`)

                if ($('.bus-stopped-for').is(':visible') && popupBusName === busName) {
                    clearInterval(stoppedForInterval)
                    $('.bus-stopped-for').slideUp();
                }
                delete busData[busName].overtime

                const $busLogElm = $(`
                    <div>${new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
                    <div><strong>${busName}</strong> <span style="color: #ec5050;">deparated</span> ${stopName} after ${stoppedFor} (${stoppedDiff}%)</div>
                `)
                $('.bus-log').append($busLogElm);
                $('.bus-log-wrapper').scrollTop($('.bus-log-wrapper')[0].scrollHeight);

                if (busRotationPoints[busName]) {
                    ['px1', 'px2', 'line'].forEach(val => {
                        if (busRotationPoints[busName][val]) { // not sure why this check is necessary... something with buses going in/out of service removing the point but not the var reference? how is this possible?
                            busRotationPoints[busName][val].remove();
                        }
                    })
                    delete busRotationPoints[busName];
                }
                
            }

            updateTimeToStops([busName]) // updates bus's etas to all stops

            if (popupStopId && busLocations[busName]) { // also check if in busLocations to not show stops if no info. I think updateStopBuses already prevents this but it was still showing 'bus in service since Invalid Date'
                // Preserve any active route filter in the stop info
                updateStopBuses(popupStopId)
            }

            if (popupBusName === busName) {
                popInfo(busName) // this is on the bus wrapper 
            }

        }

        // Initial connection, recall from visibilityChange
        else {
            for (let busName in eventData) {
                
                // console.log(parseInt('13209') in busData.keys())

                if (!(busName in busData)) {// shouldn't happen
                    // console.log(busName)
                    // console.log('this shouldnt happen 2')
                    // busData[busName] = {}
                    // console.log(eventData)
                    // this could now happen, except maybe i should confirm the bus actually isn't supposed to be in busdata bc diff campus before continuing. otherwise fail fast if it's, i.e., a nb bus not in bus data when selected campus is nb
                    continue

                }

                const busInfo = eventData[busName]

                busData[busName].at_stop = busInfo.stopped
                busData[busName].stopId = busInfo.stopId
                busData[busName].next_stop = getNextStopId(busData[busName].route, parseInt(busInfo.stopId)) // might throw error if busName not yet in busData (if rubus ws broadcasts data before new bus added from passio getData)
                busData[busName].timeArrived = busInfo.time_arrived;

            }

        }
    }

    socket.addEventListener("message", (event) => {    
        
        try {
            const eventData = JSON.parse(event.data);
            // console.log("Formatted message from server:", eventData);
            processEventData(eventData);

            // Update RUBus response time since WebSocket is active
            updateRubusResponseTime();
        } catch (error) {
            console.error("Error parsing JSON:", error);
            console.log(event.data)
        }

    });

    socket.addEventListener("close", (event) => {
        // console.log("Passio WebSocket connection closed:", event);
    });

    socket.addEventListener("error", (event) => {
        // Extract meaningful error information from the Event object and WebSocket
        let errorMessage = "Unknown RUBus WebSocket error";
        let errorDetails = {};

        if (event && event.message) {
            errorMessage = event.message;
        } else if (event && event.type) {
            errorMessage = `RUBus WebSocket error type: ${event.type}`;
        } else if (event && event.code) {
            errorMessage = `RUBus WebSocket error code: ${event.code}`;
        }

        // Try to get additional error information from the WebSocket object
        if (socket) {
            // Use the utility function to extract all values from the WebSocket object
            errorDetails = extractAllValues(socket, 3, 0);

            // Check if we can get more specific error information based on readyState
            const readyState = socket.readyState;
            if (readyState === WebSocket.CLOSED) {
                errorMessage = `RUBus WebSocket connection closed unexpectedly (${socket.url || 'unknown URL'})`;
            } else if (readyState === WebSocket.CLOSING) {
                errorMessage = `RUBus WebSocket connection closing (${socket.url || 'unknown URL'})`;
            } else if (readyState === WebSocket.CONNECTING) {
                errorMessage = `RUBus WebSocket connection failed during connection attempt (${socket.url || 'unknown URL'})`;
            }
        }

        console.error("RUBus WebSocket error:", errorMessage);
        console.error("Error details:", errorDetails);

        // Extract and log the original event object with all its nested values
        const originalEventExtracted = extractAllValues(event, 3, 0);
        console.error("Original event:", originalEventExtracted);
        // Don't mark RUBus as failing on WebSocket errors - only HTTP request failures matter
    });

}

