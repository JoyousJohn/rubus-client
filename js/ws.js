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

        if($('.info-campuses').text() === 'No buses running!') {
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

            addStopsToMap();
            makeBusesByRoutes();

            $('.knight-mover, .knight-mover-mini').hide();

            $('.all-stops-btn-wrapper').show();

        }

        busData[busId].lat = data.latitude
        busData[busId].long = data.longitude
        busData[busId].rotation = data.course
        busData[busId].capacity = data.paxLoad

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
        plotBus(busId)

        let route = busData[busId].route
        if (!activeRoutes.has(route)) {
            console.log("Does this ever run?") // yes it does, after something like "New bus in WS: 4035 (13211) (ONWK2FS)"
            if (!route) route = 'undefined'
            // if (route === 'Campus Connect Express') alert('hi')
            activeRoutes.add(route)
            setPolylines(activeRoutes)
            populateRouteSelectors(activeRoutes)
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
            console.error("WebSocket error:", error);
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
