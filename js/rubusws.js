// socket = new WebSocket('wss://rubus.live/ws');

let etas = {}
let busLocations = {}
let busETAs = {}

function updateETAs(etasData) {
    etas = etasData
    console.log(etas)
    alert('eta received')
}

function openRUBusSocket() {

    let socket;
    if (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost") {
        socket = new WebSocket('ws://127.0.0.1:5000/ws');
    } else {
        socket = new WebSocket('wss://transloc.up.railway.app/ws');
    }

    socket.addEventListener("open", (event) => {
        console.log("WebSocket connection opened:", event);
    });

    function processEventData(eventData) {

        if ('event' in eventData) {

            if (eventData['event'] === 'eta_update') {
                updateETAs(eventData['etas']);
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

            const busId = parseInt(eventData.busId)

            if (!(busId in busData)) {// shouldn't happen
                console.log('this shouldnt happen')
                // busData[busId] = {}
                return
            }

            const busRoute = busData[busId].route
            const stopId = eventData.stopId

            busData[busId]['stopId'] = stopId
            busData[busId]['next_stop'] = getNextStopId(busRoute, stopId)
            updateTimeToStops([busId])

            if (popupBusId === busId) {
                popInfo(busId)
            }

            const stopName = stopsData[stopId].name
            const busName = busData[busId].busName

            let nextStopId = null;

            if (eventData['event'] === 'arrival') {
                busData[busId]['at_stop'] = true
                busData[busId]['timeArrived'] = eventData['time_arrived']
                console.log(`[Arrival] Bus ${busName} arrived at ${stopName}`)

                if (popupBusId === busId) {
                    startStoppedForTimer(busId)
                }

            } else if (eventData['event'] === 'departure') {
                busData[busId]['at_stop'] = false
                delete busData[busId]['timeArrived'];
                console.log(`[Departure] Bus ${busName} departed from ${stopName}`)

                if ($('.bus-stopped-for').is(':visible') && popupBusId === busId) {
                    clearInterval(stoppedForInterval)
                    $('.bus-stopped-for').slideUp();
                }
            }
        }

        else {

            for (let busId in eventData) {
                
                // console.log(parseInt('13209') in busData.keys())

                if (!(busId in busData)) {// shouldn't happen
                    console.log(busId)
                    console.log('this shouldnt happen 2')
                    // busData[busId] = {}
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
        
        console.log('new data')

        try {
            const eventData = JSON.parse(event.data);
            console.log("Formatted message from server:", eventData);

            processEventData(eventData)

            


        } catch (error) {
            console.error("Error parsing JSON:", error);
        }

    });

    socket.addEventListener("close", (event) => {
        console.log("WebSocket connection closed:", event);
    });

    socket.addEventListener("error", (event) => {
        console.error("WebSocket error:", event);
    });

}