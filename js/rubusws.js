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
let rubusSocketGen = 0;

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
    if (!socket) {
        return;
    }
    try { socket.close(); } catch (e) {}
    socket = null;
    window.socket = null;
    rubusSocketGen++;
}

function openRUBusSocket() {
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
        return;
    }
    if (socket) {
        try { socket.close(); } catch (e) {}
        socket = null;
        window.socket = null;
    }

    // if (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost") {
        // socket = new WebSocket('ws://127.0.0.1:5000/ws');
    // } else {
    const gen = ++rubusSocketGen;
    const ws = new WebSocket('wss://demo.rubus.live/ws');
    ws._gen = gen;
    // }

    // Make it globally accessible for status checking
    window.socket = socket = ws;

    ws.addEventListener("open", (event) => {
        if (ws._gen !== rubusSocketGen || socket !== ws) {
            ws.close();
            return;
        }
        // console.log("RUBus WebSocket connection opened");
        // Update response time to indicate WebSocket is active
        updateRubusResponseTime();
    });

    function processEventData(eventData) {
        if (sim) return;

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

            if (!(busName in busData)) return; // ignore buses from other campuses - will need to rework later to allow new buses coming into service after init load from rubus api

            const busRoute = busData[busName].route;
            const stopId = eventData.stopId;

            if (busData[busName]['stopId']) {
                busData[busName]['prevStopId'] = busData[busName]['stopId'];
            }
            busData[busName]['stopId'] = stopId;
            if (stopId !== null && stopId !== undefined && !isNaN(Number(stopId))) {
                busData[busName]['next_stop'] = getNextStopId(busRoute, Number(stopId));
            }

            const stopName = (stopId !== null && stopId !== undefined && stopsData[stopId]) ? stopsData[stopId].name : '';

            if (eventData['event'] === 'arrival') {
                busData[busName]['at_stop'] = true;
                busData[busName]['timeArrived'] = eventData['time_arrived'];
                updateRouteBusStatus(busName);
                // console.log(`[l] Bus ${busName} (${busName}) arrived at ${stopName}`)

                if (popupBusName === busName) {
                    startStoppedForTimer(busName);
                    
                    if (settings['toggle-distances-line-on-focus']) {
                        showDistanceLineOnFocus(busName);
                    }
                }

                busData[busName].progress = 0;

                if (typeof animateBusRotation === 'function') {
                    const loc = { lat: busData[busName].lat, long: busData[busName].long };
                    const targetRotation = calculateRotation(busName, loc);
                    if (targetRotation !== undefined) {
                        animateBusRotation(busName, targetRotation, 700);
                    }
                } else if (typeof immediatelyUpdateStoppedBusRotations === 'function') {
                    immediatelyUpdateStoppedBusRotations(true);
                }

                const _esc = (typeof escapeHtml === 'function' ? escapeHtml : (s)=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'));
                const $time = $('<div></div>').text(new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }));
                const $arrivedLine = $('<div></div>');
                $arrivedLine.append($('<span></span>').text(busRoute.toUpperCase()).css('color', colorMappings[busRoute] || '#000'));
                $arrivedLine.append(document.createTextNode(' '));
                $arrivedLine.append($('<strong></strong>').text(busName));
                $arrivedLine.append(document.createTextNode(' '));
                $arrivedLine.append($('<span style="color: #46dd46;"></span>').text('arrived'));
                $arrivedLine.append(document.createTextNode(' at ' + stopName));
                $('.bus-log').append($time).append($arrivedLine);
                $('.bus-log-wrapper').scrollTop($('.bus-log-wrapper')[0].scrollHeight);

            } else if (eventData['event'] === 'departure') {
                busData[busName]['at_stop'] = false
                updateRouteBusStatus(busName);

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

                if (popupBusName === busName) {
                    showDeparting();
                }
                delete busData[busName].overtime

                const $time2 = $('<div></div>').text(new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }));
                const $departLine = $('<div></div>');
                $departLine.append($('<span></span>').text(busRoute.toUpperCase()).css('color', colorMappings[busRoute] || '#000'));
                $departLine.append(document.createTextNode(' '));
                $departLine.append($('<strong></strong>').text(busName));
                $departLine.append(document.createTextNode(' '));
                $departLine.append($('<span style="color: #ec5050;"></span>').text('departed'));
                $departLine.append(document.createTextNode(' ' + stopName + ' after ' + stoppedFor + ' (' + stoppedDiff + '%)'));
                $('.bus-log').append($time2).append($departLine);
                $('.bus-log-wrapper').scrollTop($('.bus-log-wrapper')[0].scrollHeight);

                if (busRotationPoints[busName]) {
                    ['pt1', 'pt2', 'line'].forEach(val => {
                        if (busRotationPoints[busName][val]) { // not sure why this check is necessary... something with buses going in/out of service removing the point but not the var reference? how is this possible?
                            busRotationPoints[busName][val].remove();
                        }
                    })
                    delete busRotationPoints[busName];
                }
                
            }

            updateTimeToStops([busName]) // updates bus's etas to all stops

            // Refresh the open stop popup on every arrival/departure event.
            // busLocations is only ever written by the simulator, so in live mode
            // the old gate on it meant this never fired and the popup waited for
            // the next 5s poll. updateStopBuses already guards each bus with
            // isValid/atDepot/distanceFromLine and renders missing ETAs as a
            // dimmed row, so there is no ghost-info risk. busETAs were just
            // recomputed for this bus by updateTimeToStops above.
            if (popupStopId) {
                // Preserve any active route filter in the stop info
                updateStopBuses(popupStopId)
            }

            if (popupBusName === busName) {
                popInfo(busName) // this is on the bus wrapper 
            }

        }

        // Initial connection, recall from visibilityChange
        else {
            const snapshotBusNames = [];
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

                const busInfo = eventData[busName];

                busData[busName].at_stop = Boolean(busInfo.stopped);
                busData[busName].stopId = busInfo.stopId;
                if (busInfo.stopId !== null && busInfo.stopId !== undefined && !isNaN(Number(busInfo.stopId))) {
                    busData[busName].next_stop = getNextStopId(busData[busName].route, Number(busInfo.stopId));
                }
                busData[busName].timeArrived = busInfo.time_arrived;

                // Force-unstopped (dev helper): keep the bus treated as
                // departed so the stopped label stays gone.
                if (forceUnstoppedBuses.has(busName)) {
                    busData[busName].at_stop = false;
                    delete busData[busName].timeArrived;
                    delete busData[busName].overtime;
                }

                snapshotBusNames.push(busName);

            }

            // Recompute ETAs for every bus replayed by the snapshot so the
            // where/at_stop state applied above is immediately reflected in
            // every ETA surface (stop popup, tooltips, offscreen chips) instead
            // of waiting for the next poll. updateTimeToStops also handles the
            // popup re-render (popInfo / updateTooltips).
            if (snapshotBusNames.length) {
                updateTimeToStops(snapshotBusNames);
            }
            if (popupStopId) {
                updateStopBuses(popupStopId);
            }

            immediatelyUpdateStoppedBusRotations();
            if (shownRoute && !popupBusName && !popupStopId && typeof updateTooltips === 'function') {
                updateTooltips(shownRoute);
            }

        }
    }

    ws.addEventListener("message", (event) => {

        if (ws._gen !== rubusSocketGen || socket !== ws) {
            ws.close();
            return;
        }

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

    ws.addEventListener("close", (event) => {
        if (ws._gen !== rubusSocketGen || socket !== ws) {
            return;
        }
        // console.log("Passio WebSocket connection closed:", event);
    });

    ws.addEventListener("error", (event) => {
        if (ws._gen !== rubusSocketGen || socket !== ws) {
            return;
        }

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

