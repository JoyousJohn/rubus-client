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
        console.log(`Received bus data for bus ${busId}:`, data);
        
        // Passio reported a non-weekend bus, return to polling
        if (!data.route.includes('ONWK')) {
            console.log('Passio reported a non-weekend bus, returning to polling');
            wsClient.disconnect();
            // busData = {}; Do I clear all buses? Implement ws checking until ON actually go Oos? Maybe they just turn into other routes? I guess I gotta clear route selectors nonetheless. Have to emulate sometime.
            startBusPolling();
        }

        if (!busData[busId]) {

            busData[busId] = {}
            busData[busId].busName = data.bus
            busData[busId].previousTime = new Date().getTime() - 5000;

            if (!('route' in data)) { // sometimes none...
                busData[busId].route = 'none'
            } else {

                let alphaRouteId = bus.routeId.replace(/[^a-zA-Z]/g, '')

                if (alphaRouteId in routeMapping) {
                    busData[busId].route = routeMapping[alphaRouteId]
                }  else {
                    busData[busId].route = data.route
                }
            }
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
