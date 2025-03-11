let map;
let busMarkers = {};
let busData = {}
let polylines = {};
let activeRoutes = new Set();
let popupBusId;
let popupStopId;
let busesDoneInit; // don't check for moves until map is done plotting

let mapDragged = false;

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

    settings = JSON.parse(localStorage.getItem('settings'));

    map = L.map('map', {
        maxBounds: bounds, // Set the maximum bounds
        maxBoundsViscosity: 1.3, // Optional: Adjust the stickiness of the bounds (1.0 is default)
        zoomControl: false,
        inertiaDeceleration: 1000,
        zoomSnap: 0,
        edgeBufferTiles: 10,
        preferCanvas: settings && settings['map-renderer'] === 'canvas',
        scrollWheelZoom: false // Disable default scroll zoom
    }).setView([40.507476,-74.4541267], 14);

    map.setMinZoom(13);
    // map.getRenderer(map).options.padding = 1; // Keep map outside viewport rendered to avoid flicker

    let mapTheme
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

    if (settings && settings['toggle-pause-update-marker']) {
        pauseUpdateMarkerPositions = settings['toggle-pause-update-marker'];
    }

    tileLayer = L.tileLayer('https://api.mapbox.com/styles/v1/{id}/tiles/{z}/{x}/{y}?access_token=' + mapBoxToken, {
        maxZoom: 20,
        id: 'mapbox/' + mapTheme,
    }).addTo(map);

    let isTransitioning = false; // Flag to track if the map is transitioning
    let isFittingBounds = false;

    map.on('drag', function() {

        mapDragged = true;

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

    isDesktop = $(window).width() > 992;

    $(window).resize(function() {
        isDesktop = $(window).width() > 992;
    });
    
    if (!$('.theme-modal').is(':visible')) {
        launchFireworks(12);
    }

    if (window.location.hostname.includes('.dev')) {
        $('.dev-build-popup').fadeIn().delay(7000).slideUp();
    }

    map.getContainer().addEventListener('wheel', function(e) {
        if (e.deltaMode === 0) {
            e.preventDefault();
            const zoomAmount = e.deltaY < 0 ? 1 : -1;
            const newZoom = map.getZoom() + zoomAmount * 1;
            const mousePoint = map.mouseEventToContainerPoint(e);
            const latLng = map.containerPointToLatLng(mousePoint);
            map.setView(latLng, newZoom);
        }
    });
    map.on('dragstart', function() {
        map.scrollWheelZoom.disable();
    });

    map.on('dragend', function() {
        map.scrollWheelZoom.enable();
    });

});

const fireworks = new Fireworks.default($('#fireworks')[0], {
    traceSpeed: 2,
    traceLength: 3,
    opacity: 0.8,
    acceleration: 1.02,
    delay: {
        min: 50,
        max: 50
    },
    decay: {
        min: 0.007,
        max: 0.015
    },
    rocketsPoint: {
        min: 10,
        max: 90
    },
    lineWidth: {
        trace: {
            min: 0.5,
            max: 0.9
        }
    },
});

function launchFireworks(totalFireworks, currentCount = 0) {
    if (currentCount >= totalFireworks) return;

    // Random delay between 20 and 250ms
    const randomDelay = Math.floor(Math.random() * (250 - 20 + 1)) + 20;

    setTimeout(() => {
        fireworks.launch(1);
        launchFireworks(totalFireworks, currentCount + 1);
    }, randomDelay);
}

let fireworksTimeout;

$('.shoot-fireworks').click(function() {
    launchFireworks(12);
    $('.shoot-fireworks').css('background-color', '#ca45fa').css('color', '#f69ee0')
    if (fireworksTimeout) {
        clearTimeout(fireworksTimeout);
    }
    fireworksTimeout = setTimeout(() => {
        $('.shoot-fireworks').css('background-color', '').css('color', '')
        fireworksTimeout = null;
    }, 200);
});

$(document).on('keydown', function(e) {
    if (e.key === 'Escape') { hideInfoBoxes(); }
})

function hideInfoBoxes(instantly_hide) {

    // console.log('hideInfoBoxes() triggered')

    if (instantly_hide) {
        $('.bus-info-popup, .stop-info-popup, .bus-stopped-for, .my-location-popup').hide();  
    } else {
        $('.bus-info-popup, .stop-info-popup, .bus-stopped-for, .my-location-popup').fadeOut();  
    }

    if (popupStopId) {
        popupStopId = null;
        thisClosestStopId = null;
    }

    if (popupBusId) {
        stopOvertimeCounter();
        popupBusId = null;
        // $('.time, .overtime-time').text(''); // optional <- nvm, the wrapper fades out so by hiding this changes div size while still fading out.
    }

    if (sourceBusId) {
        $('.stop-info-back').fadeOut(); 
        sourceBusId = null;
    }

    if (sourceStopId) {
        $('.bus-info-back').fadeOut(); 
        sourceStopId = null;
    }

    if (selectedMarkerId && busMarkers[selectedMarkerId]) {
        busMarkers[selectedMarkerId].getElement().querySelector('.bus-icon-outer').style.boxShadow = '';
        busMarkers[selectedMarkerId].getElement().querySelector('.bus-icon-outer').style.borderColor = 'black';
        selectedMarkerId = null;
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
        hideInfoBoxes(true);
        $('.my-location-popup').show();
        return;
    }

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((position) => {
            const userLat = position.coords.latitude;
            const userLong = position.coords.longitude;
            userPosition = [userLat, userLong];

            marker = L.marker(userPosition, 
                { icon: L.icon({
                    iconUrl: 'img/location_marker.png',
                    iconSize: [24, 24],
                    iconAnchor: [12, 12],
                })
            })
            .addTo(map)
            .on('click', function() {
                $('.bus-info-popup, .stop-info-popup, .bus-stopped-for').hide();  
                $('.my-location-popup').show();
                sourceStopId = null;
                sourceBusId = null;
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

// Method to calculate Haversine distance between two points in miles
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

    // console.log(distance)

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
    if (distance > 0.002) {
        busData[busId].previousSpeedTime = currentTime;
    }
    // busData[busId].secondsDiff = currentTime - previousData.previousTime;

}

const animationFrames = {}
let pauseRotationUpdating = false;
let wholePixelPositioning = false;

let busLines = {}
let midpointCircle = {}

const updateMarkerPosition = (busId) => {
    const loc = {lat: busData[busId].lat, long: busData[busId].long};
    const marker = busMarkers[busId];

    let prevLatLng = undefined;
    if (busData[busId].previousPositions.length >= 3) {
        prevLatLng = {lat: busData[busId].previousPositions[busData[busId].previousPositions.length - 3][0], lng: busData[busId].previousPositions[busData[busId].previousPositions.length - 3][1]};
    }
    // console.log(busData[busId].previousPositions)
    // console.log(prevLatLng)
    // console.log('')
    const startLatLng = marker.getLatLng();
    const endLatLng = L.latLng(loc.lat, loc.long);

    const positioningOption = settings['bus-positioning'];
    const showPath = settings['toggle-show-bus-path'];

    // Always maintain the data structure regardless of display setting
    if (busLines[busId]) {
        if (busLines[busId]['prev'] && busLines[busId]['prev'].removeFrom) {
            busLines[busId]['prev'].removeFrom(map);
        }
        if (busLines[busId]['curve'] && busLines[busId]['curve'].removeFrom) {
            busLines[busId]['curve'].removeFrom(map);
        }
    } else {
        busLines[busId] = {};
    }

    // Handle current path line
    const prevPathEndpoint = busLines[busId]['curr'] ? busLines[busId]['curr']._latlngs[1] : startLatLng;
    if (busLines[busId]['curr'] && busLines[busId]['curr'].removeFrom) {
        busLines[busId]['curr'].removeFrom(map);
    }
    
    // Store previous path data
    if (busLines[busId]['curr'] && busLines[busId]['curr']._latlngs) {
        busLines[busId]['prev'] = busLines[busId]['curr']._latlngs;
    }

    // Always update the current line data
    busLines[busId]['curr'] = {
        _latlngs: [prevPathEndpoint, endLatLng]
    };

    // Only display the lines if showPath is true
    if (showPath) {
        // Display previous line (red)
        if (busLines[busId]['prev']) {
            const prevLine = L.polyline(busLines[busId]['prev'], {color: 'red', weight: 4}).addTo(map);
            busLines[busId]['prev'] = prevLine;
        }
        
        // Display current line (blue)
        const currLine = L.polyline(busLines[busId]['curr']._latlngs, {color: 'blue', weight: 4}).addTo(map);
        busLines[busId]['curr'] = currLine;
    }

    // Add Bézier curve only if positioning option is 'bezier'
    if (prevLatLng && positioningOption === 'bezier') {
        // Get our desired midpoint
        const desiredMidpoint = {
            lat: busLines[busId]['curr']._latlngs[0].lat,
            lng: busLines[busId]['curr']._latlngs[0].lng
        };
        
        const controlPoint = {
            lat: 2 * desiredMidpoint.lat - 0.5 * (prevLatLng.lat + endLatLng.lat),
            lng: 2 * desiredMidpoint.lng - 0.5 * (prevLatLng.lng + endLatLng.lng)
        };
        
        // Only display the curve if showPath is true
        if (showPath) {
            const path = L.curve(['M', [prevLatLng.lat, prevLatLng.lng],
                                'Q', [controlPoint.lat, controlPoint.lng],
                                    [endLatLng.lat, endLatLng.lng]],
                               {color: 'purple', weight: 5, opacity: 1}).addTo(map);
            busLines[busId]['curve'] = path;
            
            // Add a dot at the control point
            if (midpointCircle[busId]) midpointCircle[busId].removeFrom(map);
            midpointCircle[busId] = L.circleMarker([busLines[busId]['curr']._latlngs[0].lat, busLines[busId]['curr']._latlngs[0].lng], {
                radius: 4,
                color: 'lime',
                fillColor: 'lime',
                fillOpacity: 1
            }).addTo(map);
        }
    }

    const duration = (new Date().getTime() - busData[busId].previousTime) + 2500;
    const startTime = performance.now();
    busData[busId].previousTime = new Date().getTime();

    const startRotation = parseFloat(marker.getElement().querySelector('.bus-icon-outer').style.transform.replace('rotate(', '').replace('deg)', '') || '0');
    const endRotation = busData[busId].rotation + 45;
    const startPosition = marker.getLatLng();

    const calculateBezierPoint = (t) => {
        if (!prevLatLng || positioningOption !== 'bezier') return null;
        
        const desiredMidpoint = {
            lat: busLines[busId]['curr']._latlngs[0].lat,
            lng: busLines[busId]['curr']._latlngs[0].lng
        };
        
        const controlPoint = {
            lat: 2 * desiredMidpoint.lat - 0.5 * (prevLatLng.lat + endLatLng.lat),
            lng: 2 * desiredMidpoint.lng - 0.5 * (prevLatLng.lng + endLatLng.lng)
        };
        
        const curveJoinPoint = {
            lat: 0.25 * prevLatLng.lat + 0.5 * controlPoint.lat + 0.25 * endLatLng.lat,
            lng: 0.25 * prevLatLng.lng + 0.5 * controlPoint.lng + 0.25 * endLatLng.lng
        };
        
        if (t <= 0.3) {
            const t1 = t / 0.3;
            return {
                lat: startPosition.lat + (curveJoinPoint.lat - startPosition.lat) * t1,
                lng: startPosition.lng + (curveJoinPoint.lng - startPosition.lng) * t1
            };
        } else {
            const t2 = (t - 0.3) / 0.7;
            const curveT = 0.5 + (t2 * 0.5);
            
            return {
                lat: (1 - curveT) ** 2 * prevLatLng.lat +
                    2 * (1 - curveT) * curveT * controlPoint.lat +
                    curveT ** 2 * endLatLng.lat,
                lng: (1 - curveT) ** 2 * prevLatLng.lng +
                    2 * (1 - curveT) * curveT * controlPoint.lng +
                    curveT ** 2 * endLatLng.lng
            };
        }
    };

    const animateMarker = (currentTime) => {
        const elapsedTime = currentTime - startTime;
        const progress = Math.min(elapsedTime / duration, 1);

        // Determine the current position
        let currentLatLng;
        if (positioningOption === 'bezier' && prevLatLng) {
            // Use Bézier curve if prevLatLng is defined and bezier option is selected
            const bezierPoint = calculateBezierPoint(progress);
            if (bezierPoint) {
                currentLatLng = L.latLng(bezierPoint.lat, bezierPoint.lng);
            } else {
                currentLatLng = L.latLng(
                    startLatLng.lat + (endLatLng.lat - startLatLng.lat) * progress,
                    startLatLng.lng + (endLatLng.lng - startLatLng.lng) * progress
                );
            }
        } else {
            // Straight line interpolation for 'exact' option
            currentLatLng = L.latLng(
                startLatLng.lat + (endLatLng.lat - startLatLng.lat) * progress,
                startLatLng.lng + (endLatLng.lng - startLatLng.lng) * progress
            );
        }

        if (wholePixelPositioning) {
            marker.setLatLng(currentLatLng);
        } else {
            marker.setLatLngPrecise([currentLatLng.lat, currentLatLng.lng]);
        }
        
        let rotationChange = endRotation - startRotation;
        if (rotationChange > 180) {
            rotationChange -= 360;
        } else if (rotationChange < -180) {
            rotationChange += 360;
        }

        if (!busMarkers[busId]) return; // Bus went out of service

        if (!pauseRotationUpdating) {
            let currentRotation = startRotation + rotationChange * progress;
            const iconElement = marker.getElement().querySelector('.bus-icon-outer');
            if (iconElement) {
                iconElement.style.transform = `rotate(${currentRotation}deg)`;
            }
        }

        if (progress < 1) {
            animationFrames[busId] = requestAnimationFrame(animateMarker);
        } else {
            // console.log(`Updated bus ${busId} in ${(performance.now() - startTime) / 1000} seconds.`);

            delete animationFrames[busId];
        }
    };

    if (animationFrames[busId]) {
        cancelAnimationFrame(animationFrames[busId]);
        delete animationFrames[busId];
    }

    requestAnimationFrame(animateMarker);
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
            route: busData[busId].route,
            zIndexOffset: 500
        }).addTo(map);
        busMarkers[busId].getElement().querySelector('.bus-icon-outer').style.transform = `rotate(${busData[busId].rotation + 45}deg)`;
        busMarkers[busId].getElement().querySelector('.bus-icon-outer').style.backgroundColor = colorMappings[busData[busId].route];
    
        busMarkers[busId].on('click', function() {
            sourceStopId = null;
            sourceBusId = null;
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
    'bl': 'Livi/Busch',
    'on1': 'Overnight 1',
    'on2': 'Overnight 2',
    'ftbl': 'Football',
    'wknd1': 'All Campus',
    'wknd2': 'All Campus',
    'all': 'All Campus',
    'none': 'Unknown',
    'c': 'Busch Commuter',
    'rexl': 'Cook/Doug/Livi',
    'rexb': 'Cook/Busch',
    'winter1': 'Winter 1',
    'winter2': 'Winter 2'
} 

let colorMappings;

const defaultColorMappings = {
    'ee': 'red',
    'f': 'IndianRed',
    'h': 'RoyalBlue',
    'a': 'Orchid',
    'lx': 'Gold',
    'b': 'LimeGreen',
    'rexb': 'LightSeaGreen',
    'rexl': 'Coral',
    'bhe': 'SlateBlue',
    'bl': 'SlateBlue',
    'on1': 'BlueViolet',
    'on2': 'MediumTurquoise',
    'wknd1': 'HotPink',
    'wknd2': 'RebeccaPurple',
    'ftbl': 'gray',
    'none': 'lightgray',
    'c': 'MediumVioletRed',
    'all': 'MediumSpringGreen',
    'winter1': 'SpringGreen',
    'winter2': 'crimson'
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
    
    $('.stop-info-popup').hide();


    if (busData[busId]['overtime']) {
        $('.bus-stopped-for .stop-octagon').show();
        if (settings['toggle-show-bus-overtime-timer']) {
            startOvertimeCounter(busId);
        }
    } else {
        stopOvertimeCounter();
        $('.bus-stopped-for .stop-octagon, .overtime-time').hide();
    }
    
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
        const serviceDate = new Date(data.joined_service);
        const today = new Date();
        const isToday = serviceDate.getDate() === today.getDate() && 
                        serviceDate.getMonth() === today.getMonth() &&
                        serviceDate.getFullYear() === today.getFullYear();

        const formattedTime = serviceDate.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: undefined,
            hour12: true
        });

        const displayTime = isToday ? formattedTime : 
            `${formattedTime} on ${(serviceDate.getMonth() + 1).toString().padStart(2, '0')}/${serviceDate.getDate().toString().padStart(2, '0')}`;
        $('.bus-joined-service').text('Joined service at ' + displayTime);
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

        if (busData[busId].at_stop) {

            let stopId = busData[busId].stopId
            if (Array.isArray(stopId)) {
                stopId = stopId[0];
            }

            let stopName = stopsData[stopId].name
            const campusName = campusShortNamesMappings[stopsData[stopId].campus]

            $('.next-stops-grid > div').append($('<div class="next-stop-circle"></div>').css('background-color', colorMappings[data.route]))
            $('.next-stops-grid > div').append($(`<div class="flex flex-col pointer">
                    <div class="next-stop-campus">${campusName}</div>
                    <div class="next-stop-name flex">${stopName}</div>
                </div>`).click(() => { 
                    flyToStop(sortedStops[stopId]); 
                }));
            $('.next-stops-grid > div').append($(`<div class="flex flex-col center pointer">
                <div class="next-stop-eta">Here</div>
            </div>`).click(() => { 
                flyToStop(sortedStops[stopId]);  
            }));

        }

        for (let i = 0; i < sortedStops.length; i++) {

            let eta;

            if ((busData[busId]['route'] === 'wknd1' || busData[busId]['route'] === 'all' || busData[busId]['route'] === 'winter1' || busData[busId]['route'] === 'on1') && sortedStops[i] === 3) { // special case
                if (busData[busId]['stopId'] && !busData[busId]['prevStopId']) { // very rare case when bus added to server data where next stop is sac nb and there is no previous data yet, accurate eta cannot be known // only triggers if just passed socam sb or yard (at least for current 2024 routes [wknd1, all])
                    delete busETAs[busId]
                    console.log("I'm amazed this actually happened, wow")
                    return
                }
                const prevStopId = i === 0 ? sortedStops[sortedStops.length - 1] : sortedStops[i-1]
                eta = Math.round((busETAs[busId][3]['via'][prevStopId] + 10)/secondsDivisor);
            } else {
                eta = Math.round((busETAs[busId][sortedStops[i]] + 10)/secondsDivisor); // Turns out our ETAs are so accurate that they've been exactly 20 seconds too late, i.e. the exact buffer time I was adding! Wow!
            }

            const currentTime = new Date();

            let formattedTime;
            if (showETAsInSeconds && (eta < 600 || i === 0)) {
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

            } else if (showETAsInSeconds && eta >= 600) {
                currentTime.setMinutes(currentTime.getMinutes() + Math.floor(eta / 60));
                formattedTime = currentTime.toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                });

                let minutes = Math.floor(eta / 60);
                eta = `${minutes}m`;

            } else {
                currentTime.setMinutes(currentTime.getMinutes() + eta);
                formattedTime = currentTime.toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                });

                if (eta === 0) { eta = 1 }

                eta += 'm'
            }

            let stopName = stopsData[sortedStops[i]].name
            const campusName = campusShortNamesMappings[stopsData[sortedStops[i]].campus]

            if (i === 0 && settings['toggle-show-bus-progress']) {
                stopName += `<div class="ml-0p5rem" style="color: #00abff;">(${Math.round(busData[busId].progress*100)}%)</div>`
            }

            $('.next-stops-grid > div').append($('<div class="next-stop-circle"></div>').css('background-color', colorMappings[data.route]))
            $('.next-stops-grid > div').append($(`<div class="flex flex-col pointer">
                    <div class="next-stop-campus">${campusName}</div>
                    <div class="next-stop-name flex">${stopName}</div>
                </div>`).click(() => { 
                    flyToStop(sortedStops[i]); 
                }));
            $('.next-stops-grid > div').append($(`<div class="flex flex-col center pointer">
                <div class="next-stop-eta">${eta}</div>
                <div class="next-stop-time">${formattedTime}</div>
            </div>`).click(() => { 
                flyToStop(sortedStops[i]);  
            }));
        }

        $('.info-next-stops, .next-stops-grid').show(); // remove .show after adding message saying stops unavailable in the else statement above <-- ??

        if (popupBusId !== busId) {
            setTimeout(() => { // absolutely no idea why it doesn't reset scroll without a timeout
                $('.info-next-stops').scrollTop(0)
            }, 0);
        }  
    }

    else {
        $('.next-stops-grid').hide();
        $('.next-stops-grid > div').empty();
    }
    
    if (sourceStopId) {
        $('.bus-info-back').show();
    } else {
        $('.bus-info-back').hide(); 
    }
    sourceBusId = busId;

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
        $('.bus-stopped-for').show().find('.time').text(`Stopped for ${minutes}m ${remainingSeconds}s`);
    } else if (secondsDifference > 0) {
        $('.bus-stopped-for').show().find('.time').text("Stopped for " + secondsDifference + "s");
    }
    
    let seconds = secondsDifference
    stoppedForInterval = setInterval(() => {
        if (popupBusId === busId) {
            seconds++;
            if (seconds > 59) {
                const minutes = Math.floor(seconds / 60);
                const remainingSeconds = seconds % 60;
                $('.bus-stopped-for').show().find('.time').text(`Stopped for ${minutes}m ${remainingSeconds}s`);
            } else if (seconds > 0) {
                $('.bus-stopped-for').show().find('.time').text("Stopped for " + seconds + "s");
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


let overtimeInterval;
let overtimeBusId;

function startOvertimeCounter(busId) {

    if (busId === overtimeBusId) {
        return;
    }

    overtimeBusId = busId

    if (overtimeInterval) {
        clearInterval(overtimeInterval);
    }

    $('.overtime-time').show();
    
    const timeArrived = new Date(busData[busId].timeArrived);
    const avgWaitAtStop = waits[busData[busId].stopId];
    const arrivedAgoSeconds = Math.floor((new Date().getTime() - timeArrived) / 1000);
    const overtimeSeconds = arrivedAgoSeconds - avgWaitAtStop;
    // console.log(arrivedAgoSeconds)
    // console.log(avgWaitAtStop)
    // console.log(overtimeSeconds)
    const minutes = Math.floor(overtimeSeconds / 60);
    const seconds = overtimeSeconds % 60;
    $('.overtime-time').text((minutes > 0 ? minutes + 'm ' : '') + seconds + 's overtime');

    overtimeInterval = setInterval(() => {
        if (busData[busId] && busData[busId]['overtime']) {
            const arrivedAgoSeconds = Math.floor((new Date().getTime() - timeArrived) / 1000);
            const overtimeSeconds = arrivedAgoSeconds - avgWaitAtStop;
            const minutes = Math.floor(overtimeSeconds / 60);
            const seconds = overtimeSeconds % 60;
            $('.overtime-time').text((minutes > 0 ? minutes + 'm ' : '') + seconds + 's overtime');
        } else {
            stopOvertimeCounter();
        }
    }, 1000);
}

function stopOvertimeCounter() {
    if (overtimeInterval) {
        clearInterval(overtimeInterval);
        overtimeInterval = null;
        overtimeBusId = null;
        $('.overtime-time').text('').hide();;
    }
}