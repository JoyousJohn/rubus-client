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

class BusWebSocketClient {
    constructor(wsUrl) {
        this.wsUrl = wsUrl;
        this.ws = null;
        this.wsUserIds = [];
        this.buses = {};  // Store previous data for each bus by busId
        this.manualDisconnect = false;
    }

    // Method to subscribe and send data to the WebSocket server
    subscribe(ws) {
        const subscribeMsg = {
            "subscribe": "location",
            "userId": [1268],
            "filter": {
                "outOfService": 0,
                // "busId": [4853, 4893]  // Replace with actual bus IDs
            },
            "field": [
                "busId",
                "bus", // only used to make bus obj when num was in excluded buses
                "latitude",
                "longitude",
                "course",
                "paxLoad",
                "more",
                "route", // also only used when excluded
                "speed"
            ]
        };
        ws.send(JSON.stringify(subscribeMsg));
    }

    // Process each message received from the WebSocket server
    processMessage(message) {

        if($('.info-campuses-mid').text() === 'No buses running!') { // this isn't even an existing text anymore, i have to figure out what i was trying to do here
            $('.bus-info-popup').hide(); // check if this works
        }

        const data = JSON.parse(message);

        // Skip secondary GPS
        if (data.more && data.more.secondary) {
            return;
        }

        const busId = data.busId;

        // alert(busId)
        // console.log(`Received bus data for bus ${busId}:`, data);
        
        // if (data.route && !data.route.includes('ONWK')) {
        //     console.log('Passio reported a non-overnight bus, returning to polling');
        //     wsClient.disconnect();
        //     // busData = {}; Do I clear all buses? Implement ws checking until ON actually go Oos? Maybe they just turn into other routes? I guess I gotta clear route selectors nonetheless. Have to emulate sometime. // ok, looks like busData updating is successfully handled elsewhere. I just need to remove ON polylines here. - I take this back... ON buses are successfully being detected as going out of servservice, but not that they're the last bus that went out? the (route && !busesByRoutes[selectedCampus][route]) condition in makeOoS has to be failing somewhere.
        //     startBusPolling();
        // }

        if (!busData[busId]) {
            // console.log(data)


            if (!data.route) {
                console.log("[WHAT] " + busId + " " + JSON.stringify(data) + " doesn't have a route...");
                // return;
                data.route = 'undefined'
            }

            if (!data.route.includes('ONWK')) return;

            // Don't add overnight buses to map when simulator is active
            if (sim) return;

            console.log(`New bus in WS: ${data.bus} (${busId}) (${data.route})`);
            busData[busId] = {};
            busData[busId].busName = data.bus;
            busData[busId].previousTime = new Date().getTime() - 5000;
            busData[busId].previousPositions = [[parseFloat(data.latitude), parseFloat(data.longitude)]];
            busData[busId].type = 'ws';
            busData[busId]['campus'] = routesByCampus[data.route];

            if (!('route' in data)) { // sometimes none...
                busData[busId].route = 'none';
            } else {

                if (data.route === 'ONWK1FS') {
                    busData[busId].route = 'on1';
                } else if (data.route === 'ONWK2FS') {
                    busData[busId].route = 'on2';
                } else {
                    return; // just don't deal with normal buses since these should show up inapi, hope this fixes everything
                    // let alphaRouteId = data.routeId.replace(/[^a-zA-Z]/g, '')

                    // if (alphaRouteId in routeMapping) {
                    //     busData[busId].route = routeMapping[alphaRouteId]
                    // }  else {
                    //     busData[busId].route = data.route
                    // }
                } 
            }

            // makeBusesByRoutes(); // might need this, gotta check by spoofing a on bus
            addStopsToMap();

            $('.knight-mover, .knight-mover-mini').hide();

            $('.info-panels-btn-wrapper').show();

        }

        busData[busId].lat = data.latitude
        busData[busId].long = data.longitude

        // Log position update source
        // console.log(`[WebSocket] Bus ${busId} position update: ${data.latitude}, ${data.longitude}`);
        busData[busId].rotation = data.course
        busData[busId].capacity = data.paxLoad
        
        // Update distance line position marker if this bus is focused
        if (popupBusId === busId && settings['toggle-distances-line-on-focus']) {
            updateDistanceLinePositionMarker(busId);
        }

        // Update position history for Bézier curves, but don't reset timing data
        // WebSocket updates are irregular and shouldn't affect animation duration calculations
        const currentTime = new Date().getTime();
        const timeSinceLastUpdate = currentTime - (busData[busId].previousTime || currentTime);

                // For WebSocket updates, ensure animation duration accounts for remaining API polling interval
        // This prevents animations from being too short when WebSocket updates come mid-polling-cycle
        const pollDelay = 5000; // Should match the API polling interval
        const remainingPollTime = Math.max(0, pollDelay - timeSinceLastUpdate);
        const animationDuration = timeSinceLastUpdate + remainingPollTime + 2500; // Base duration calculation

        // Store the calculated duration for use in updateMarkerPosition
        busData[busId].websocketAnimationDuration = animationDuration;

        // console.log(`[WebSocket] Bus ${busId}: Time since last update: ${Math.round(timeSinceLastUpdate/1000)}s, Remaining poll time: ${Math.round(remainingPollTime/1000)}s, Animation duration: ${Math.round(animationDuration/1000)}s`);

        busData[busId].previousPositions.push([parseFloat(data.latitude), parseFloat(data.longitude)]);

        // Keep only the last 10 positions to prevent memory bloat
        if (busData[busId].previousPositions.length > 10) {
            busData[busId].previousPositions = busData[busId].previousPositions.slice(-10);
        }

        if (!('speed' in busData[busId])) {
            busData[busId].speed = data.speed
            busData[busId].visualSpeed = data.speed
        }

        // Calculate speed for this bus
        // const speed = 

        // if (speed !== null) {
        //     console.log(`Bus ${busId} current speed: ${speed.toFixed(2)} mph`);
        // } else {
        //     console.log(`Not enough data to calculate speed for bus ${busId} yet.`);
        // }

        calculateSpeed(busId);

        plotBus(busId);

        let route = busData[busId].route
        if (!activeRoutes.has(route)) {
            console.log("Does this ever run?") // yes it does, after something like "New bus in WS: 4035 (13211) (ONWK2FS)"
            if (!route) route = 'undefined'
            // if (route === 'Campus Connect Express') alert('hi')
            activeRoutes.add(route)
            setPolylines(activeRoutes)
            populateRouteSelectors(activeRoutes)
            
            // Update rider routes if in rider mode
            if (appStyle === 'rider') {
                updateRiderRoutes();
            }
        }

    }

    connect() {
        this.ws = new WebSocket(this.wsUrl);

        this.ws.onopen = () => {
            console.log("Connected to WebSocket server");
            this.subscribe(this.ws);
        };

        this.ws.onmessage = (event) => {
            this.processMessage(event.data);
        };

        this.ws.onclose = () => {
            console.log("WebSocket connection closed.");
            if (!this.manualDisconnect) {
                console.log("Retrying connection...");
                setTimeout(() => this.connect(), 5000);
            }
        };

        this.ws.onerror = (error) => {
            // Extract meaningful error information from the Event object and WebSocket
            let errorMessage = "Unknown WebSocket error";
            let errorDetails = {};

            if (error && error.message) {
                errorMessage = error.message;
            } else if (error && error.type) {
                errorMessage = `WebSocket error type: ${error.type}`;
            }

            // Try to get additional error information from the WebSocket object
            if (this.ws) {
                // Use the utility function to extract all values from the WebSocket object
                errorDetails = extractAllValues(this.ws, 3, 0);

                // Check if we can get more specific error information based on readyState
                const readyState = this.ws.readyState;
                if (readyState === WebSocket.CLOSED) {
                    errorMessage = `WebSocket connection closed unexpectedly (${this.ws.url || 'unknown URL'})`;
                } else if (readyState === WebSocket.CLOSING) {
                    errorMessage = `WebSocket connection closing (${this.ws.url || 'unknown URL'})`;
                } else if (readyState === WebSocket.CONNECTING) {
                    errorMessage = `WebSocket connection failed during connection attempt (${this.ws.url || 'unknown URL'})`;
                }
            }

            // Use the utility function to extract all values from the error event and WebSocket details
            const processedError = extractAllValues(error, 3, 0);
            const processedErrorDetails = extractAllValues(errorDetails, 3, 0);

            console.error("WebSocket error:", errorMessage);
            console.error("Error details:", processedErrorDetails);
            console.error("Original error:", processedError);
            this.ws.close();
        };
    }

    disconnect() {
        this.manualDisconnect = true;
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
    
}

// Instantiate the WebSocket client
const wsClient = new BusWebSocketClient("wss://passio3.com/");
// wsClient.connect();
