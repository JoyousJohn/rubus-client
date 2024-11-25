let map;
let busMarkers = {};
let busData = {}
let polylines = {};
let activeRoutes = new Set();
let popupBusId;
let popupStopId;
let busesDoneInit; // don't check for moves until map is done plotting

// settings vars
let showETAsInSeconds = false;
let showBusId = false;

const southWest = L.latLng(40.4550081,-74.4957839); // Define the southwest corner of the bounds
const northEast = L.latLng(40.538852,-74.4074799); // Define the northeast corner of the bounds
const bounds = L.latLngBounds(southWest, northEast); // Create a LatLngBounds object

// const originalOnDown = L.Draggable.prototype._onDown;

// // Override the _onDown method
// L.Draggable.prototype._onDown = function(e) {
//     console.log('Draggable _onDown called with event:', {
//         type: e.type,
//         touches: e.touches ? e.touches.length : 0,
//         which: e.which,
//         button: e.button,
//         shiftKey: e.shiftKey,
//         _dragging: L.Draggable._dragging,
//         _enabled: this._enabled
//     });

//     this._moved = false;

//     // Check if dragging is already in progress or if conditions to block dragging are met
//     if (L.Draggable._dragging || e.shiftKey || ((e.which !== 1) && (e.button !== 1) && !e.touches) || !this._enabled) {
//         console.log('Blocked: dragging conditions not met');
//         return;
//     }

//     // Allow dragging if the zoom animation class is not present
//     if (L.DomUtil.hasClass(this._element, 'leaflet-zoom-anim')) {
//         console.log('Blocked: zoom animation class present');
//         return;
//     }

//     // If we get here, drag should be allowed
//     console.log('All checks passed, initializing drag');
//     L.Draggable._dragging = true;  // Prevent dragging multiple objects at once.

//     if (this._preventOutline) {
//         L.DomUtil.preventOutline(this._element);
//     }

//     L.DomUtil.disableImageDrag();
//     L.DomUtil.disableTextSelection();
//     console.log('Drag initialized successfully');
// };

let isDesktop;
let tileLayer;

const mapBoxToken = 'pk.eyJ1IjoiaGFwcHlqb2huIiwiYSI6ImNsbzB1NzlxZDByYXIyam9kd2QybnB4ZzUifQ.2Ssy25qvKfJ70J4LpueDKA'

$(document).ready(function() {

    map = L.map('map', {
        maxBounds: bounds, // Set the maximum bounds
        maxBoundsViscosity: 1.3, // Optional: Adjust the stickiness of the bounds (1.0 is default)
        zoomControl: false,
        inertiaDeceleration: 1000,
        zoomSnap: 0,
        // maxBoundsViscosity: 1.0,
        // intertia: true,
        // updateWhenIdle: true,
        // updateWhenZooming: true,
        // preferCanvas: true,

    }).setView([40.507476,-74.4541267], 14);

    map.setMinZoom(13);
    // map.getRenderer(map).options.padding = 1; // Keep map outside viewport rendered to avoid flicker

    let mapTheme
    settings = JSON.parse(localStorage.getItem('settings'));
    if (settings && settings['theme']) {

        if (settings['theme'] === 'light') {
            mapTheme = 'streets-v11'
        } else if (settings['theme'] === 'dark') {
            mapTheme = 'dark-v11'
        } else if (settings['theme'] === 'auto') {
            const currentHour = new Date().getHours();
            mapTheme = (currentHour <= 7 || currentHour >= 18) ? 'dark-v11' : 'streets-v11';
        } 
    } else {
        mapTheme = 'streets-v11'
    }

    tileLayer = L.tileLayer('https://api.mapbox.com/styles/v1/{id}/tiles/{z}/{x}/{y}?access_token=' + mapBoxToken, {
        maxZoom: 20,
        id: 'mapbox/' + mapTheme,
    }).addTo(map);

    let isTransitioning = false; // Flag to track if the map is transitioning
    let isFittingBounds = false;

    map.on('drag', function() {

        if (isDesktop) {
            return;
        }

        if (isTransitioning || isDesktop || isFittingBounds) {
            return; 

        } else {
            isTransitioning = true;

            if (Object.keys(busData).length === 0) { // don't hide no buses running notification // can && and check if no-bus is visible to show the message again after user clicks on a stop
                return;
            }
            hideInfoBoxes();
        }

    });

    map.on('moveend', function() {
        isTransitioning = false; // Clear the transitioning flag
        // console.log('Set istransitioning to false');
        $('.panout').css('color', '#5b5b5b')
    });

    map.on('zoomend', updateDotPosition);
    updateDotPosition();

    isDesktop = $(window).width() > 992;

    $(window).resize(function() {
        isDesktop = $(window).width() > 992;
    });

});

$(document).on('keydown', function(e) {
    if (e.key === 'Escape') { hideInfoBoxes(); }
})

function hideInfoBoxes() {

    // console.log('hideInfoBoxes() triggered')

    $('.bus-info-popup, .stop-info-popup, .bus-stopped-for, .my-location-popup').fadeOut();  

    if (popupStopId) {
        popupStopId = null;
        thisClosestStopId = null;
    }

    popupBusId = null;
    popupStopId = null;

    if (selectedMarkerId && busMarkers[selectedMarkerId]) {
        busMarkers[selectedMarkerId].getElement().querySelector('.bus-icon-outer').style.boxShadow = '';
        busMarkers[selectedMarkerId].getElement().querySelector('.bus-icon-outer').style.borderColor = 'black';
    }

    if ($('.buses-panel-wrapper').is(':visible')) {
        $('.buses-panel-wrapper').slideUp('fast');
    }

}

function panout() {

    // console.log(map.getBounds())
    // console.log(bounds)

    // improve this later with a flag?

    // const marginOfError = 0.01; // Define a margin of error
    // console.log(Math.abs(map.getBounds().getNorthEast().lng - bounds.getNorthEast().lng))
    // console.log(Math.abs(map.getBounds().getSouthWest().lng - bounds.getSouthWest().lng))
    // console.log(Math.abs(map.getBounds().getNorthEast().lat - bounds.getNorthEast().lat))
    // console.log(Math.abs(map.getBounds().getSouthWest().lat - bounds.getSouthWest().lat) < marginOfError)

    // if (Math.abs(map.getBounds().getNorthEast().lng - bounds.getNorthEast().lng) < marginOfError &&
    //     Math.abs(map.getBounds().getSouthWest().lng - bounds.getSouthWest().lng) < marginOfError &&
    //     Math.abs(map.getBounds().getNorthEast().lat - bounds.getNorthEast().lat) < marginOfError &&
    //     Math.abs(map.getBounds().getSouthWest().lat - bounds.getSouthWest().lat) < marginOfError) {
    //     return; // Exit if the current bounds are equal to the bounds var
    // }

    if (polylineBounds) {
        map.fitBounds(polylineBounds);
    } else { // no buses running, show all of nb
        map.fitBounds(bounds);
    }
    $('.panout').css('color', 'blue')
    setTimeout(() => {
        $('.panout').css('color', 'rgb(185, 185, 185)')
    }, 500);

    hideInfoBoxes();
}

function changeMapStyle(newStyle) {

    document.documentElement.setAttribute('theme', newStyle);

    if (newStyle === 'light') {
        newStyle = 'streets-v11'
    } else {
        newStyle = 'dark-v11'
    }

    console.log("Setting map style to " + newStyle)
    let newUrl = 'https://api.mapbox.com/styles/v1/mapbox/' + newStyle + '/tiles/{z}/{x}/{y}?access_token=' + mapBoxToken;
    tileLayer.setUrl(newUrl);
    
    // Force map to immediately update (not require zoom)
    const currentCenter = map.getCenter();
    const currentZoom = map.getZoom();
    map.setView([0, 0], 1, { animate: false });
    map.setView(currentCenter, currentZoom, { animate: true });
}

let userPosition;

function centerme() {

    if (userPosition) {
        map.flyTo(userPosition, 18, {
            animate: true,
            duration: 0.3
        });
        hideInfoBoxes();
        return;
    }

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((position) => {
            const userLat = position.coords.latitude;
            const userLong = position.coords.longitude;
            userPosition = [userLat, userLong];

            L.marker(userPosition, 
                { icon: L.icon({
                    iconUrl: 'img/location_marker.png',
                    iconSize: [24, 24],
                    iconAnchor: [12, 12],
                })
            }).addTo(map)

            marker.on('click', function() {
                $('.bus-info-popup, .stop-info-popup, .bus-stopped-for').hide();  
                $('.my-location-popup').show();
            })

            map.flyTo(userPosition, 18, {
                animate: true,
                duration: 0.3
            });

            $('.fly-closest-stop-wrapper').show();

            hideInfoBoxes();

            if(!locationShared) {
                localStorage.setItem('locationShared', true);
                locationShared = true;
            }

            findNearestStop(false);

        }, (error) => {
            console.error('Error getting user location:', error);
        });
    } else {
        console.error('Geolocation is not supported by this browser.');
    }
}

// Method to calculate Haversine distance between two points
function haversine(lat1, lon1, lat2, lon2) {
    const R = 3958.8; // Radius of Earth in miles
    const toRadians = (degree) => degree * (Math.PI / 180);
    lat1 = toRadians(lat1);
    lon1 = toRadians(lon1);
    lat2 = toRadians(lat2);
    lon2 = toRadians(lon2);
    const dLat = lat2 - lat1;
    const dLon = lon2 - lon1;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}


let speedTimeout = {};
let showBusSpeeds = true;

// Method to calculate speed in mph for a specific bus
async function calculateSpeed(busId) {

    const currentLatitude = busData[busId].lat;
    const currentLongitude = busData[busId].long;
    const currentTime = new Date().getTime() / 1000;  // Time in seconds

    // Check if we have previous data for this bus
    if (!busData[busId].previousLatitude) {
        // Initialize previous data for this bus
        busData[busId].previousLatitude = currentLatitude;
        busData[busId].previousLongitude = currentLongitude;
        busData[busId].previousSpeedTime = currentTime
        return null;
    }

    const previousData = busData[busId];
    const distance = haversine(previousData.previousLatitude, previousData.previousLongitude, currentLatitude, currentLongitude);
    const timeDiffHours = (currentTime - previousData.previousSpeedTime) / 3600;

    if (timeDiffHours === 0) {
        return;
    }

    const realSpeed = distance / timeDiffHours;
    // console.log('realSpeed: ', realSpeed)

    if (!('visualSpeed' in busData[busId])) {
        busData[busId].speed = realSpeed
        busData[busId].visualSpeed = realSpeed
        if (popupBusId === busId && showBusSpeeds) {
            console.log(busId + ' New Speed: ' + busData[busId].visualSpeed.toFixed(2))
            $('.info-speed').text(Math.round(busData[busId].visualSpeed))
        }
        busData[busId].previousLatitude = currentLatitude;
        busData[busId].previousLongitude = currentLongitude;
        busData[busId].previousSpeedTime = currentTime;
        return
    }

    const currentVisualSpeed = busData[busId].visualSpeed;  // Use 0 if speed is not set
    const speedDiff = realSpeed - currentVisualSpeed;
    // if (speedDiff < 1) return
    
    let totalUpdateSeconds = 7;
    if (realSpeed < 10) {
        totalUpdateSeconds = 3; //decelerate faster
    }
    
    const updateIntervalMs = Math.abs(totalUpdateSeconds*1000 / speedDiff);

    if (popupBusId === busId) {
        console.log("speedDiff: ", speedDiff);
        console.log("updateIntervalMs: ", updateIntervalMs)
    }

    // console.log(updateIntervalMs)

    const speedChangeDir = speedDiff > 0 ? 1 : -1;

    clearInterval(speedTimeout[busId]);

    // Set initial speed before starting the interval
    busData[busId].speed = realSpeed;
    busData[busId].visualSpeed = currentVisualSpeed

    let elapsedMs = 0;
    speedTimeout[busId] = setInterval(() => {

        if (!busData[busId]) { // handle out of service
            clearInterval(speedTimeout[busId]);
            return;
        }

        busData[busId].visualSpeed += speedChangeDir;
        if (busData[busId].visualSpeed < 0) {
            busData[busId].visualSpeed = 0;
        }

        elapsedMs += updateIntervalMs;
        
        if (popupBusId === busId && showBusSpeeds) {
            // console.log(busId + ' New Speed: ' + busData[busId].visualSpeed.toFixed(2))
            $('.info-speed').text(Math.round(busData[busId].visualSpeed))
        }

        if (panelRoute === busData[busId].route) {
            $(`.route-bus-speed[bus-id="${busId}"]`).text(parseInt(busData[busId].visualSpeed) + 'mph | ' + busData[busId].capacity + '% full')
        }
        
        if (elapsedMs >= totalUpdateSeconds*1000) {
            clearInterval(speedTimeout[busId]);
        }
    }, updateIntervalMs); // Convert seconds to milliseconds


    // Update the previous data for this bus
    busData[busId].previousLatitude = currentLatitude;
    busData[busId].previousLongitude = currentLongitude;
    busData[busId].previousSpeedTime = currentTime;
    // busData[busId].secondsDiff = currentTime - previousData.previousTime;

}

const animationFrames = {}
let pauseRotationUpdating = false;
let wholePixelPositioning = false;

// Update the marker's position during animation
const updateMarkerPosition = (busId) => {
    const loc = {lat: busData[busId].lat, long: busData[busId].long};
    const marker = busMarkers[busId];

    if (animationFrames[busId]) {
        cancelAnimationFrame(animationFrames[busId]);
        delete animationFrames[busId];
    }

    // Get the start and end points
    const startLatLng = marker.getLatLng();
    const endLatLng = L.latLng(loc.lat, loc.long);

    const duration = (new Date().getTime() - busData[busId].previousTime) + 2.5;
    if (popupBusId === busId) console.log("duration: ", duration)
    const startTime = performance.now();

    busData[busId].previousTime = new Date().getTime()

    // Get the start and end rotations
    const startRotation = parseFloat(marker.getElement().querySelector('.bus-icon-outer').style.transform.replace('rotate(', '').replace('deg)', '') || '0');
    const endRotation = busData[busId].rotation + 45;

    // Function to animate the marker
    const animateMarker = (currentTime) => {

        const elapsedTime = currentTime - startTime;
        const progress = Math.min(elapsedTime / duration, 1);

        // Calculate current position
        const currentLat = startLatLng.lat + (endLatLng.lat - startLatLng.lat) * progress;
        const currentLng = startLatLng.lng + (endLatLng.lng - startLatLng.lng) * progress;

        if (wholePixelPositioning) {
            marker.setLatLng([currentLat, currentLng]);
        } else {
            marker.setLatLngPrecise([currentLat, currentLng]);
        }

        let rotationChange = endRotation - startRotation
        if (rotationChange > 180) {
            rotationChange -= 360;
        } else if (rotationChange < -180) {
            rotationChange += 360;
        }

        if (!busMarkers[busId]) { // bus went out of service
            return
        }

        if (!pauseRotationUpdating) {
            let currentRotation = startRotation + rotationChange * progress;

            const iconElement = marker.getElement().querySelector('.bus-icon-outer');
            if (iconElement) {
                iconElement.style.transform = `rotate(${currentRotation}deg)`;
            }
        }
        // Calculate and apply current rotation
        
        if (progress < 1) {
            animationFrames[busId] = requestAnimationFrame(animateMarker);
        } else {
            delete animationFrames[busId]; // Animation complete, clean up
        }
    };

    // Start the animation
    requestAnimationFrame(animateMarker);
};

// Add this function to handle map zooming and panning
const handleMapInteraction = () => {
    for (const busId in busMarkers) {
        const marker = busMarkers[busId];
        const markerElement = marker.getElement();
        const loc = {lat: busData[busId].lat, long: busData[busId].long};
        const pixel = map.latLngToLayerPoint([loc.lat, loc.long]);
        markerElement.style.transform = `translate(${pixel.x}px, ${pixel.y}px)`;
    }
};

let selectedMarkerId
let pauseUpdateMarkerPositions = false

function plotBus(busId) {

    // console.log('plotting bus with id:', busId)

    const loc = {lat: busData[busId].lat, long: busData[busId].long};

    if (!busMarkers[busId]) {
        // Create a new bus marker if it doesn't exist
        busMarkers[busId] = L.marker([loc.lat, loc.long], {
            icon: L.divIcon({
                className: 'bus-icon',
                iconSize: [30, 30],
                iconAnchor: [15, 15],
                html: '<div class="bus-icon-outer" style="will-change: transform;"><div class="bus-icon-inner"></div></div>'
            }),
            route: busData[busId].route
        }).addTo(map);
        busMarkers[busId].getElement().querySelector('.bus-icon-outer').style.transform = `rotate(${busData[busId].rotation + 45}deg)`;
        busMarkers[busId].getElement().querySelector('.bus-icon-outer').style.backgroundColor = colorMappings[busData[busId].route];
    
        busMarkers[busId].on('click', function() {
            selectBusMarker(busId)
            // busMarkers[busId].getElement().querySelector('.bus-icon-outer').style.borderColor = 'blue';
        });

    } else if (!pauseUpdateMarkerPositions) {
        // Update the existing marker's position
        updateMarkerPosition(busId);
    }
}

function selectBusMarker(busId) {

    popInfo(busId);
    // console.log(busId + ': ')
    // console.table(busData[busId])
    popupBusId = busId

    if (selectedMarkerId) {
        busMarkers[selectedMarkerId].getElement().querySelector('.bus-icon-outer').style.boxShadow = '';
        busMarkers[selectedMarkerId].getElement().querySelector('.bus-icon-outer').style.borderColor = 'black';
    }
    
    busMarkers[busId].getElement().querySelector('.bus-icon-outer').style.boxShadow = '0 0 10px ' + colorMappings[busData[busId].route];

    selectedMarkerId = busId
}

const campusMappings = {
    'ee': 'Cook/Doug/CA',
    'f': 'Cook/Doug/CA',
    'h': 'College Ave/Busch',
    'a': 'College Ave/Busch',
    'lx': 'College Ave/Livi',
    'b': 'Livingston/Busch',
    'bhe': 'Livi/Busch',
    'on1': 'Overnight 1',
    'on2': 'Overnight 2',
    'ftbl': 'Football',
    'wknd1': 'All Campus',
    'wknd2': 'All Campus',
    'none': 'Unknown',
    'c': 'Busch Commuter',
    'rexl': 'Cook/Doug/Livi',
    'rexb': 'Cook/Busch'
} 

const colorMappings = {
    'ee': 'red',
    'f': 'IndianRed',
    'h': 'RoyalBlue',
    'a': 'Orchid',
    'lx': 'Gold',
    'b': 'LimeGreen',
    'rexb': 'LightSeaGreen',
    'rexl': 'Coral',
    'bhe': 'SlateBlue',
    'on1': 'HotPink',
    'on2': 'RebeccaPurple',
    'wknd1': 'HotPink',
    'wknd2': 'RebeccaPurple',
    'ftbl': 'gray',
    'none': 'lightgray',
    'c': 'MediumVioletRed'
}

const campusShortNamesMappings = {
    'ca': 'CA',
    'busch': 'Busch',
    'livingston': 'Livi',
    'cook': 'Cook',
    'douglas': 'Douglas',
    'downtown': 'NB'
}

let stoppedForInterval;

function popInfo(busId) {

    let secondsDivisor = 60;
    if (showETAsInSeconds) {
        secondsDivisor = 1;
    }

    $('.stop-info-popup, .route-panel').hide();

    const data = busData[busId]
    $('.info-route').text(data.route.toUpperCase()).css('color', colorMappings[data.route])
    
    let busNameElmText = data.busName
    if (showBusId) {
        busNameElmText += ' (' + busId + ')'
    }
    
    $('.info-campuses').text(campusMappings[data.route])
    if (showBusSpeeds) {
        $('.info-speed').text(parseInt(data.visualSpeed))
    }
    $('.info-name').text(busNameElmText + ' | ')
    $('.info-capacity').text(data.capacity + '% capacity')


    if (data.joined_service) {
        const joinedServiceDateTime = new Date(data.joined_service);
        const formattedTime = joinedServiceDateTime.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: undefined,
            hour12: true
        });
        $('.bus-joined-service').text('Joined service at ' + formattedTime);
        $('.info-next-stops').show();
    }
    if ('at_stop' in busData[busId] && busData[busId].at_stop === true) {
        startStoppedForTimer(busId)
    } else {
        $('.bus-stopped-for').hide();
    }

    // console.log('data: ', data)

    // console.log('next_stop' in data)

    if ('next_stop' in data) {
        $('.next-stops-grid > div').empty();

        const nextStop = data.next_stop
        let routeStops = stopLists[data.route]
        let sortedStops = []

        const nextStopIndex = routeStops.indexOf(nextStop);

        if (nextStopIndex !== -1) {
            sortedStops = routeStops
                .slice(nextStopIndex)
                .concat(routeStops.slice(0, nextStopIndex));
        }

        if (nextStopIndex + 1 === routeStops.length) {
            sortedStops.push(routeStops[0]);
        } else {
            sortedStops.push(routeStops[nextStopIndex + 1]);
        }


        for (let i = 0; i < sortedStops.length-1; i++) {

            let eta = Math.round((busETAs[busId][sortedStops[i]] + 10)/secondsDivisor); // Turns out our ETAs are so accurate that they've been exactly 20 seconds too late, i.e. the exact buffer time I was adding! Wow!
            // console.log(sortedStops[i])
            const currentTime = new Date();

            let formattedTime;
            if (showETAsInSeconds) {
                currentTime.setSeconds(currentTime.getSeconds() + eta);
                formattedTime = currentTime.toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: true
                });

                let minutes = Math.floor(eta / 60);
                let seconds = eta % 60;
                eta = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

            } else {
                currentTime.setMinutes(currentTime.getMinutes() + eta);
                formattedTime = currentTime.toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                });

                eta += 'm'
            }

            const stopName = stopsData[sortedStops[i]].name
            const campusName = campusShortNamesMappings[stopsData[sortedStops[i]].campus]

            $('.next-stops-grid > div').append($('<div class="next-stop-circle"></div>').css('background-color', colorMappings[data.route]))
            $('.next-stops-grid > div').append($(`<div class="flex flex-col pointer">
                    <div class="next-stop-campus">${campusName}</div>
                    <div class="next-stop-name">${stopName}</div>
                </div>`).click(() => { flyToStop(sortedStops[i])}));
            $('.next-stops-grid > div').append($(`<div class="flex flex-col center pointer">
                <div class="next-stop-eta">${eta}</div>
                <div class="next-stop-time">${formattedTime}</div>
            </div>`).click(() => { flyToStop(sortedStops[i])}));
        }

        $('.info-next-stops, .next-stops-grid').show(); // remove .show after adding message saying stops unavailable in the else statement above <-- ??

        setTimeout(() => { // absolutely no idea why it doesn't reset scroll without a timeout
            $('.info-next-stops').scrollTop(0)
        }, 0);
    }

    else {
        $('.next-stops-grid').hide();
        $('.next-stops-grid > div').empty();
    }
    
    $('.my-location-popup').hide(); // investigate why I don't have to hide the other info boxes
    $('.bus-info-popup').show();
}

function startStoppedForTimer(busId) {

    clearInterval(stoppedForInterval); // not sure what could be causing the double timer that requires me to add this

    const arrivedDatetime = new Date(busData[busId].timeArrived);
    const now = new Date()//.toISOString();
    // console.log(now)
    const secondsDifference = Math.floor((now - arrivedDatetime) / 1000);
    // console.log('secondsDifference: ', secondsDifference)

    if (secondsDifference > 59) {
        const minutes = Math.floor(secondsDifference / 60);
        const remainingSeconds = secondsDifference % 60;
        $('.bus-stopped-for').text(`Stopped for ${minutes}m ${remainingSeconds}s`).show();
    } else if (secondsDifference > 0) {
        $('.bus-stopped-for').text("Stopped for " + secondsDifference + "s").show();
    }
    
    let seconds = secondsDifference
    stoppedForInterval = setInterval(() => {
        if (popupBusId === busId) {
            seconds++;
            if (seconds > 59) {
                const minutes = Math.floor(seconds / 60);
                const remainingSeconds = seconds % 60;
                $('.bus-stopped-for').text(`Stopped for ${minutes}m ${remainingSeconds}s`).show();
            } else if (seconds > 0) {
                $('.bus-stopped-for').text("Stopped for " + seconds + "s").show();
            }
        } else {
            clearInterval(stoppedForInterval);
        }
    }, 1000);
}

function flyToBus(busId) {
    if (!busId || !busData || !busData[busId]) {
        console.error('Invalid bus ID or missing bus data');
        return;
    }

    const lat = Number(busData[busId].lat);
    const long = Number(busData[busId].long);
    const loc = { lat, long };
    const targetZoom = 18;
    
    // First fly to location and zoom
    map.flyTo(
        [loc.lat, loc.long],
        targetZoom,
        {
            animate: true,
            duration: 0.3
        }
    );
   
    // Then select the marker which will show the popup
    selectBusMarker(busId);
   
    // Wait for popup to appear and then adjust the map
    const checkForPopupAndAdjust = () => {
        const popupElement = document.querySelector('.bus-info-popup');
        
        // Check if both popup exists and map has finished zooming
        if (popupElement && Math.abs(map.getZoom() - targetZoom) < 0.01) {
            const pixelOffset = popupElement.offsetHeight / 2;
           
            const pixelsToLatLngAtZoom = (pixels) => {
                // Use targetZoom instead of current zoom
                const metersPerPixel = 40075016.686 * Math.abs(Math.cos(loc.lat * Math.PI / 180))
                    / Math.pow(2, targetZoom + 8);
                return (pixels * metersPerPixel) / 111111;
            };
           
            const latOffset = pixelsToLatLngAtZoom(pixelOffset);
            const newLat = Number(loc.lat) + Number(latOffset);
           
            console.log('Zoom level when adjusting:', map.getZoom());
            console.log('Original lat:', loc.lat);
            console.log('Pixel offset:', pixelOffset);
            console.log('Lat offset:', latOffset);
            console.log('New lat:', newLat);
           
            map.flyTo(
                [newLat, Number(loc.long)],
                targetZoom,
                {
                    animate: true,
                    duration: 0.5
                }
            );
        } else {
            // Keep checking until both conditions are met
            if (!checkForPopupAndAdjust.attempts) {
                checkForPopupAndAdjust.attempts = 1;
            } else {
                checkForPopupAndAdjust.attempts++;
                if (checkForPopupAndAdjust.attempts > 20) { // Increased max attempts
                    console.error('Failed to find popup or reach target zoom after multiple attempts');
                    return;
                }
            }
            setTimeout(checkForPopupAndAdjust, 50);
        }
    };
   
    // Start checking for popup and zoom level
    setTimeout(checkForPopupAndAdjust, 50);
}

$('.zoom-scroll-bar').click(function() {

})