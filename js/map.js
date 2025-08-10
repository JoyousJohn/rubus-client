let map;
let busMarkers = {};
let busData = {}
let polylines = {};
let activeRoutes = new Set();
let popupBusId;
let popupStopId;
let busesDoneInit; // don't check for moves until map is done plotting
let selectedCampus;

let mapDragged = false;

// settings vars
let showETAsInSeconds = false;
let showBusId = false;

let isDesktop;
let tileLayer;

const mapBoxToken = 'pk.eyJ1Ijoiam9obi1oYXBweSIsImEiOiJjbWFrMzR2cnYwNDJ1MnFvaGh4dGd5YnlmIn0.cMHFVjIXIo_IaSI-Q6RtfQ';

$(document).ready(function() {

    updateSettings();

    let mapOptions = {
        maxBoundsViscosity: 1.3, // How much resistance to panning outside maxBounds
        zoomControl: false, // Disable +/- zoom control
        inertiaDeceleration: 1000, // higher means faster deceleration
        zoomSnap: 0, // can be 0 for continuous zoom, normally 1
        edgeBufferTiles: 10, // number of invisible tiles to load on edges
        scrollWheelZoom: false, // Disable default scroll zoom
    };

    // Set maxBounds based on bypass setting
    if (!settings['toggle-bypass-max-distance']) {
        mapOptions.maxBounds = expandBounds(bounds[selectedCampus], 2);
    }

    const usePolylinePadding = settings && settings['toggle-polyline-padding'];
    const preferCanvasRenderer = settings && settings['map-renderer'] === 'canvas';

    if (usePolylinePadding) {
        if (preferCanvasRenderer) {
            // Polyline padding enabled AND Canvas renderer preferred
            mapOptions.renderer = L.canvas({ padding: 0.1 }); // Adjust padding as needed
        } else {
            // Polyline padding enabled AND SVG renderer preferred (or default)
            mapOptions.renderer = L.svg({ padding: 0.1 }); // Adjust padding as needed
        }
    } else if (preferCanvasRenderer) {
        // Polyline padding NOT enabled, but Canvas renderer IS preferred
        mapOptions.preferCanvas = true; // Leaflet's default L.canvas() has 0.1 padding
    }
    // If none of the above, Leaflet defaults to L.svg() without explicit padding.

    map = L.map('map', mapOptions).setView(views[selectedCampus], 14); // Rutgers Student Center

    map.setMinZoom(12);
    // map.getRenderer(map).options.padding = 1; // Keep map outside viewport rendered to avoid flicker

    let mapTheme;
    if (settings && settings['theme']) {

        if (settings['theme'] === 'light') {
            mapTheme = 'streets-v11';
        } else if (settings['theme'] === 'dark') {
            mapTheme = 'dark-v11';
        } else if (settings['theme'] === 'auto') {
            const currentHour = new Date().getHours();
            mapTheme = (currentHour <= 7 || currentHour >= 18) ? 'dark-v11' : 'streets-v11';
        } 
    } else {
        mapTheme = 'streets-v11';
    }

    if (settings && settings['toggle-pause-update-marker']) {
        pauseUpdateMarkerPositions = settings['toggle-pause-update-marker'];
    }

    tileLayer = L.tileLayer('https://api.mapbox.com/styles/v1/{id}/tiles/{z}/{x}/{y}?access_token=' + mapBoxToken, {
        maxZoom: 20,
        id: 'mapbox/' + mapTheme
    }).addTo(map);

    let isTransitioning = false; // Flag to track if the map is transitioning
    let isFittingBounds = false;
    let returningToSavedView = false;

    map.on('drag', function() {

        mapDragged = true;

        if (isDesktop) {
            return;
        }

        if (isTransitioning || isDesktop || isFittingBounds || returningToSavedView) {
            return; 

        } else {
            isTransitioning = true;

            if (popupBusId && !isDesktop) {
                const minZoomLevel = 12;
                map.setMinZoom(minZoomLevel);
                if (map.getZoom() < minZoomLevel) {
                    map.setZoom(minZoomLevel);
                }
                // map.setMaxBounds(bounds[selectedCampus]);
            }

            hideInfoBoxes();

            if (settings['toggle-show-bus-log']) {
                $('.bus-log-wrapper').show();
            }

            if (settings['toggle-hide-other-routes'] && !shownRoute) {
                showAllStops();
                showAllBuses();
                showAllPolylines();
            } else if (settings['toggle-hide-other-routes'] && shownRoute) {
                for (const marker in busMarkers) {
                    if (busData[marker].route === shownRoute) {
                        busMarkers[marker].getElement().style.display = '';
                    }
                }
            }

            if (!shownRoute) {
                $('[stop-eta]').text('').hide(); // here instead of in hideInfoBoxes(); so fitting map btn doesn't hide them
            } else {
                updateTooltips(shownRoute);
            }

            $('.favs').show();

            if (savedCenter && settings['toggle-hide-other-routes']) {
                returningToSavedView = true;
                flyToWithCallback(savedCenter, savedZoom, () => {
                    returningToSavedView = false;
                    savedCenter = null;
                    savedZoom = null;
                });
            }
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

function postLoadEvent() {
    let isPWA = window.matchMedia('(display-mode: standalone)').matches || 
                  window.navigator.standalone || 
                  document.referrer.includes('android-app://');

    const userAgent = navigator.userAgent.toLowerCase();
    let deviceType;
    
    if (/iphone/.test(userAgent)) {
        deviceType = 'iphone';
    } else if (/ipad/.test(userAgent)) {
        deviceType = 'ipad';
    } else if (/android/.test(userAgent)) {
        deviceType = 'android';
    } else if (/macintosh/.test(userAgent)) {
        deviceType = 'macintosh';
    } else if (/windows/.test(userAgent)) {
        deviceType = 'windows'; 
    } else if (/linux/.test(userAgent)) {
        deviceType = 'linux';
    } else {
        deviceType = 'other';
    }

    if (isPWA) {
        isPWA = 'pwa';
    } else {
        isPWA = 'web';
    }

    const date = new Date();
    const timeOptions = {
        timeZone: 'America/New_York',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    };
    const timeString = date.toLocaleTimeString('en-US', timeOptions);

    const dateOptions = {
        timeZone: 'America/New_York',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    };
    const dateString = date.toLocaleDateString('en-US', dateOptions);
    
    const nyTime = `${timeString}, ${dateString}`;

    sa_event('load_test_2', {
        'device_type': deviceType,
        'pwa': isPWA,
        'ny_time': nyTime,
        'date': new Date()
    });
}

function flyToWithCallback(center, zoom, callback) {
    const onMoveEnd = () => {
        map.off('moveend', onMoveEnd); // Clean up listener
        callback();
    };
  
    map.on('moveend', onMoveEnd);
    map.flyTo(center, zoom, { animate: true, duration: 0.088 });
  }
  

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

let clickTimes = [];
const CLICKS_PER_SECOND_THRESHOLD = 5;
const CLICK_WINDOW_MS = 1000;

function trackClick() {
    const now = Date.now();
    clickTimes.push(now);
    
    clickTimes = clickTimes.filter(time => now - time <= CLICK_WINDOW_MS);
    
    const clicksPerSecond = clickTimes.length;
    
    if (clicksPerSecond >= CLICKS_PER_SECOND_THRESHOLD) {
        animatePikachu();
        clickTimes = [];
    }
}

// Add click event listener to the fireworks button
$('.shoot-fireworks').click(function() {
    trackClick();
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
    if (e.key === 'Escape') { 
        hideInfoBoxes(); 
        $('.settings-panel').fadeOut('fast');
        $('.bottom').fadeIn('fast'); // this is being hidden due to settings-btn click?... Why tho
        $('.settings-close').hide();

        if (settings['toggle-hide-other-routes'] && !shownRoute) {
            showAllStops();
            showAllBuses();
            showAllPolylines();
        } else if (settings['toggle-hide-other-routes'] && shownRoute) {
            for (const marker in busMarkers) {
                if (busData[marker].route === shownRoute) {
                    busMarkers[marker].getElement().style.display = '';
                }
            }
        }

        if (!shownRoute) {
            $('[stop-eta]').text('').hide(); // here instead of in hideInfoBoxes(); so fitting map btn doesn't hide them
        } else {
            updateTooltips(shownRoute);
        }

        if (savedCenter && settings['toggle-hide-other-routes']) {
            returningToSavedView = true;
            flyToWithCallback(savedCenter, savedZoom, () => {
                returningToSavedView = false;
                savedCenter = null;
                savedZoom = null;
            });
        }

    }
})

function hideInfoBoxes(instantly_hide) {
    // console.log('hideInfoBoxes() triggered')

    if (instantly_hide) {
        $('.bus-info-popup, .stop-info-popup, .bus-stopped-for, .my-location-popup').hide(); 
    } else {
        $('.bus-info-popup, .stop-info-popup, .bus-stopped-for, .my-location-popup').fadeOut();  
    }

    if (popupStopId) {

        $(`img[stop-marker-id="${popupStopId}"]`).attr('src', 'img/stop_marker.png')

        popupStopId = null;
        thisClosestStopId = null;

        checkMinRoutes(); // because .knight-mover is hidden in popStopInfo()
    }

    if (popupBusId) {
        stopOvertimeCounter();
        popupBusId = null;
        $('.info-shared-bus-mid').hide();
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
    }
    selectedMarkerId = null;

    if ($('.buses-panel-wrapper').is(':visible')) {
        $('.buses-panel-wrapper').slideUp('fast');
    }

}

function panout() {

    if (polylineBounds) {
        $('[stop-eta]').text('').hide();
        savedCenter = null;
        savedView = null;
        returningToSavedView = false; // not sure if I need this, this will be so hard to trigger within 88ms. drag and then panout...

        if (shownRoute) {
            map.fitBounds(routeBounds[shownRoute]);
        } else {
            map.fitBounds(polylineBounds);
        }

    } else { // no buses running, show all of nb
        map.fitBounds(bounds[selectedCampus]);
    }
    $('.panout').css('color', 'blue');
    setTimeout(() => {
        $('.panout').css('color', 'rgb(185, 185, 185)');
    }, 500);

    hideInfoBoxes();

    if (shownRoute) {
        updateTooltips(shownRoute);
    } else {
        showAllBuses();
        showAllPolylines();
        showAllStops();
    }

}

function changeMapStyle(newStyle) {

    document.documentElement.setAttribute('theme', newStyle);

    if (newStyle === 'light') {
        newStyle = 'streets-v11';
    } else {
        newStyle = 'dark-v11';
    }

    // console.log("Setting map style to " + newStyle);
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

        console.log("Trying to get location...")
        $('.getting-location-popup').fadeIn(300);

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
            $('.getting-location-popup').slideUp();
        }, {
            enableHighAccuracy: true,
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

    // Calculate time diff and guard against background-resume gaps or clock anomalies
    const timeDiffSeconds = (currentTime - previousData.previousSpeedTime);
    if (timeDiffSeconds <= 0 || timeDiffSeconds > 30) {
        // Reset baseline on invalid/large gaps to avoid unrealistic speeds when resuming
        busData[busId].previousLatitude = currentLatitude;
        busData[busId].previousLongitude = currentLongitude;
        busData[busId].previousSpeedTime = currentTime;
        delete busData[busId].lastRawSpeed;
        delete busData[busId].recentRawSpeeds;
        return null;
    }
    const timeDiffHours = timeDiffSeconds / 3600;

    // console.log(distance)

    if (timeDiffHours === 0) {
        return;
    }

    const rawSpeed = distance / timeDiffHours;
    const MAX_REASONABLE_SPEED = 65; // mph
    const MAX_STEP_DELTA = 12;       // mph per hop max change relative to last accepted

    // Reject obvious GPS jumps
    if (rawSpeed > 100) {
        busData[busId].previousLatitude = currentLatitude;
        busData[busId].previousLongitude = currentLongitude;
        busData[busId].previousSpeedTime = currentTime;
        delete busData[busId].lastRawSpeed;
        delete busData[busId].recentRawSpeeds;
        if (busData[busId].visualSpeed !== undefined && busData[busId].visualSpeed > MAX_REASONABLE_SPEED) {
            busData[busId].visualSpeed = MAX_REASONABLE_SPEED;
        }
        return null;
    }

    // Maintain a short rolling window of recent raw speeds for robust smoothing
    if (!Array.isArray(busData[busId].recentRawSpeeds)) {
        busData[busId].recentRawSpeeds = [];
    }
    busData[busId].recentRawSpeeds.push(rawSpeed);
    if (busData[busId].recentRawSpeeds.length > 5) {
        busData[busId].recentRawSpeeds.shift();
    }

    // Rolling median to reduce effect of outliers
    const medianOf = (arr) => {
        const sorted = [...arr].sort((a,b) => a-b);
        const mid = Math.floor(sorted.length/2);
        return sorted.length % 2 ? sorted[mid] : (sorted[mid-1] + sorted[mid]) / 2;
    };
    const smoothedSpeed = medianOf(busData[busId].recentRawSpeeds);

    // Enforce post-smoothing cap and step-rate limit
    let baselineSpeed = ('speed' in busData[busId]) ? (busData[busId].speed || 0) : 0;
    let proposedSpeed = Math.min(smoothedSpeed, MAX_REASONABLE_SPEED);
    if (baselineSpeed > 0) {
        const maxUp = baselineSpeed + MAX_STEP_DELTA;
        const maxDown = Math.max(0, baselineSpeed - MAX_STEP_DELTA * 1.5);
        proposedSpeed = Math.min(Math.max(proposedSpeed, maxDown), maxUp);
    }

    const acceptedSpeed = proposedSpeed;
    // console.log('averagedSpeed: ', averagedSpeed)

    // // Discard outlier speeds (e.g., resume or GPS jump) and reset baseline
    // if (realSpeed > 60) { // mph; higher is unrealistic for campus buses
    //     busData[busId].previousLatitude = currentLatitude;
    //     busData[busId].previousLongitude = currentLongitude;
    //     busData[busId].previousSpeedTime = currentTime;
    //     return null;
    // }

    if (!('visualSpeed' in busData[busId])) {
        busData[busId].speed = acceptedSpeed;
        busData[busId].visualSpeed = acceptedSpeed;
        if (popupBusId === busId && showBusSpeeds) {
            console.log(busId + ' New Speed: ' + busData[busId].visualSpeed.toFixed(2))
            $('.info-speed-mid').text(Math.round(busData[busId].visualSpeed));
            $('.info-mph-mid').text('MPH');
        }
        busData[busId].previousLatitude = currentLatitude;
        busData[busId].previousLongitude = currentLongitude;
        busData[busId].previousSpeedTime = currentTime;
        return
    }

    const currentVisualSpeed = busData[busId].visualSpeed;  // Use 0 if speed is not set
    const speedDiff = acceptedSpeed - currentVisualSpeed;
    // if (speedDiff < 1) return
    
    let totalUpdateSeconds = 7;
    if (acceptedSpeed < 10) {
        totalUpdateSeconds = 3; //decelerate faster
    }
    
    const denom = Math.max(Math.abs(speedDiff), 0.01);
    const updateIntervalMs = Math.min(2000, Math.max(50, (totalUpdateSeconds*1000) / denom));

    // if (popupBusId === busId) {
    //     console.log("speedDiff: ", speedDiff);
    //     console.log("updateIntervalMs: ", updateIntervalMs)
    // }

    // console.log(updateIntervalMs)

    const speedChangeDir = speedDiff > 0 ? 1 : -1;

    clearInterval(speedTimeout[busId]);

    // Set initial speed before starting the interval
    busData[busId].speed = acceptedSpeed;
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
            $('.info-speed-mid').text(Math.round(busData[busId].visualSpeed))
            $('.info-mph-mid').text('MPH');
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

let busRotationPoints = {}

const calculateRotation = (busId, loc) => {
    let newRotation;
    if (!pauseRotationUpdating) {
        const currentStopId = busData[busId].stopId;

        if (!stopLines[currentStopId]) {
            return busData[busId].rotation + 45;
        }
        // console.log('at yard')

        let polyPoints = stopLines[currentStopId];
        let minDist = Infinity;
        let closestIdx = 0;

        // Find the closest point in the array
        for (let i = 0; i < polyPoints.length; i++) {
            const point = polyPoints[i];
            const dx = loc.long - point.lng;
            const dy = loc.lat - point.lat;
            const dist = dx * dx + dy * dy;
            
            if (dist < minDist) {
                minDist = dist;
                closestIdx = i;
            }
        }

        const nextIdx = (closestIdx + 1) % polyPoints.length;
        const pt1 = polyPoints[closestIdx];
        const pt2 = polyPoints[nextIdx];
    
        if (busRotationPoints[busId]) {
            ['pt1', 'pt2', 'line'].forEach(val => {
                busRotationPoints[busId][val].remove();
            })
        }
        
            busRotationPoints[busId] = {}
            
            // Add markers for the points
            busRotationPoints[busId]['pt1'] = L.circleMarker(pt1, {
                radius: 6,
                fillColor: "red",
                color: "#000",
                weight: 0,
                opacity: 1,
                fillOpacity: settings['toggle-show-rotation-points'] ? 1 : 0
            }).addTo(map);
            
            busRotationPoints[busId]['pt2'] = L.circleMarker(pt2, {
                radius: 6,
                fillColor: "blue",
                color: "#000",
                weight: 0,
                opacity: 1,
                fillOpacity: settings['toggle-show-rotation-points'] ? 1 : 0
            }).addTo(map);

            // Add green line between the points
            busRotationPoints[busId]['line'] = L.polyline([pt1, pt2], {
                color: 'green',
                weight: 3,
                opacity: settings['toggle-show-rotation-points'] ? 1 : 0
            }).addTo(map);

            const toRad = deg => deg * Math.PI / 180;
            const toDeg = rad => rad * 180 / Math.PI;
            const dLon = toRad(pt2.lng - pt1.lng);
            const y = Math.sin(dLon) * Math.cos(toRad(pt2.lat));
            const x = Math.cos(toRad(pt1.lat)) * Math.sin(toRad(pt2.lat)) - Math.sin(toRad(pt1.lat)) * Math.cos(toRad(pt2.lat)) * Math.cos(dLon);
            let bearing = Math.atan2(y, x);
            bearing = (toDeg(bearing) + 360) % 360;
            newRotation = bearing + 45;
            // console.log(`New rotation for bus: ${busData[busId].busName}: ${newRotation}`)
        } else {
            newRotation = busData[busId].rotation + 45;
        }
    return newRotation;
};


const animationFrames = {}
let pauseRotationUpdating = false;
let wholePixelPositioning = false;

let busLines = {}
let midpointCircle = {}

const updateMarkerPosition = (busId, immediatelyUpdate) => {
    const loc = {lat: busData[busId].lat, long: busData[busId].long};
    const marker = busMarkers[busId];

    // Cancel any existing animations for this bus
    if (animationFrames[busId]) {
        cancelAnimationFrame(animationFrames[busId]);
        delete animationFrames[busId];
    }

    // Get current position
    const startLatLng = marker.getLatLng();
    const endLatLng = L.latLng(loc.lat, loc.long);
    
    let prevLatLng;
    try {
        if (busData[busId].previousPositions.length >= 3) {
            prevLatLng = {
                lat: busData[busId].previousPositions[busData[busId].previousPositions.length - 3][0], 
                lng: busData[busId].previousPositions[busData[busId].previousPositions.length - 3][1]
            };
        }
    } catch (error) {
        console.log(error);
        console.log(busData[busId].previousPositions);
        console.log(busData[busId]);
    }

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

    // If immediatelyUpdate is true, skip animation and set position directly
    if (immediatelyUpdate) {
        if (wholePixelPositioning) {
            marker.setLatLng(endLatLng);
        } else {
            marker.setLatLngPrecise([endLatLng.lat, endLatLng.lng]);
        }
        
        // Update rotation immediately as well
        if (!pauseRotationUpdating) {
            const newRotation = calculateRotation(busId, loc);
            const iconElement = marker.getElement().querySelector('.bus-icon-outer');
            if (iconElement && newRotation !== undefined) {
                iconElement.style.transform = `rotate(${newRotation}deg)`;
            }
        }
        
        return; // Exit early - no animation needed
    }

    // Calculate animation duration
    const duration = (new Date().getTime() - busData[busId].previousTime) + 2500;
    const startTime = performance.now();
    busData[busId].previousTime = new Date().getTime();

    const startRotation = parseFloat(marker.getElement().querySelector('.bus-icon-outer').style.transform.replace('rotate(', '').replace('deg)', '') || '0');
    const endRotation = calculateRotation(busId, loc);

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
                lat: startLatLng.lat + (curveJoinPoint.lat - startLatLng.lat) * t1,
                lng: startLatLng.lng + (curveJoinPoint.lng - startLatLng.lng) * t1
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
        // Skip this animation frame if busId has been removed from animationFrames
        // This happens when a new animation starts or cancellation occurs
        if (!animationFrames[busId]) return;
        
        const elapsedTime = currentTime - startTime;
        const progress = Math.min(elapsedTime / duration, 1);

        // Check if the bus marker still exists
        if (!busMarkers[busId]) {
            // Bus went out of service, clean up the animation
            delete animationFrames[busId];
            return;
        }

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

        if (!pauseRotationUpdating) {
            let currentRotation = startRotation + rotationChange * progress;
            const iconElement = marker.getElement().querySelector('.bus-icon-outer');
            if (iconElement) {
                iconElement.style.transform = `rotate(${currentRotation}deg)`;
            }
        }

        if (progress < 1) {
            // Only schedule next frame if we're still animating and this ID hasn't been replaced
            animationFrames[busId] = requestAnimationFrame(animateMarker);
        } else {
            // Animation complete, clean up
            delete animationFrames[busId];
        }
    };
    
    // Start the animation
    animationFrames[busId] = requestAnimationFrame(animateMarker);
};

let selectedMarkerId;
let pauseUpdateMarkerPositions = false;

function plotBus(busId, immediatelyUpdate=false) {
    
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
    
        try {
            if ((shownRoute && shownRoute !== busData[busId].route) || (settings['toggle-hide-other-routes'] && popupBusId && busData[popupBusId].route !== busData[busId].route) || popupBusId) {
                busMarkers[busId].getElement().style.display = '';
            }
        } catch (error) {
            console.error('Error updating bus marker visibility:', error);
            console.log(busData);
            console.log(busData[popupBusId]); // why can this ever be the case?
        }

        busMarkers[busId].on('click', function() {
            sourceStopId = null;
            sourceBusId = null;
            selectBusMarker(busId);
        });

    } else if (!pauseUpdateMarkerPositions) {
        // if (document.visibilityState === 'hidden') {
        //     immediatelyUpdate = true;
        //     // console.log('page hidden, updating immediately')
        // }
        updateMarkerPosition(busId, immediatelyUpdate);
    }
}

function selectBusMarker(busId) {

    popInfo(busId, true);
    // console.log(busId + ': ')
    // console.table(busData[busId])
    popupBusId = busId

    if (selectedMarkerId) {
        busMarkers[selectedMarkerId].getElement().querySelector('.bus-icon-outer').style.boxShadow = '';
        busMarkers[selectedMarkerId].getElement().querySelector('.bus-icon-outer').style.borderColor = 'black';
    }
    
    busMarkers[busId].getElement().querySelector('.bus-icon-outer').style.boxShadow = '0 0 10px ' + colorMappings[busData[busId].route];

    selectedMarkerId = busId;

    $('.bus-log-wrapper').hide();
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
    'on1': 'All Campus',
    'on2': 'All Campus',
    'ftbl': 'Football',
    'wknd1': 'All Campus',
    'wknd2': 'All Campus',
    'all': 'All Campus',
    'none': 'Unknown',
    'c': 'Busch Commuter',
    'rexl': 'Cook/Doug/Livi',
    'rexb': 'Cook/Busch',
    'winter1': 'Winter 1',
    'winter2': 'Winter 2',
    'summer1': '',
    'summer2': '',
    'commencement': 'Commencement',

    'ps': 'Penn Station',
    'cc': 'Campus Connect',
    'ccx': 'Campus Connect Express',
    'psx': 'Penn Station Express',
    'cam': 'Camden',
} 

let colorMappings;

const defaultColorMappings = {
    'ee': '#fd0000', // bc red is also a color in color circle select, checkmark will appear double
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
    'winter2': 'crimson',
    'fav': 'gold',
    'summer1': 'Plum',
    'summer2': 'PowderBlue',
    'commencement': 'LightSalmon',

    'psx': 'LightSalmon',
    'ps': 'LightGreen',
    'ccx': 'Plum',
    'cc': 'PaleTurquoise',

    'cam': 'navy',
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

let savedCenter;
let savedZoom;

function popInfo(busId, resetCampusFontSize) {
    // Only destroy charts if showing a different bus
    if (currentRidershipChartBusId !== busId) {
        for (const existingBusId in busRidershipCharts) {
            busRidershipCharts[existingBusId].destroy();
            delete busRidershipCharts[existingBusId];
        }
        $('.bus-historical-capacity').empty();
    }

    let secondsDivisor = 60;
    if (showETAsInSeconds) {
        secondsDivisor = 1;
    }
    
    $(`img[stop-marker-id="${popupStopId}"]`).attr('src', 'img/stop_marker.png')

    if (busData[busId]['overtime']) {
        $('.bus-stopped-for .stop-octagon').show();
        if (settings['toggle-show-bus-overtime-timer']) {
            startOvertimeCounter(busId);
        }
    } else {
        stopOvertimeCounter();
        $('.bus-stopped-for').hide();
        $('.stop-octagon, .overtime-time').hide();
    }
    
    const data = busData[busId]

    let dataRoute = data.route
    if (dataRoute === 'summer1' || dataRoute === 'summer2') {
        dataRoute = dataRoute.slice(0, -1) + ' ' + dataRoute.slice(-1)
    }
    $('.info-route-mid').text(dataRoute.toUpperCase()).css('color', colorMappings[data.route])
    
    let busNameElmText = data.busName
    if (showBusId) {
        busNameElmText += ' (' + busId + ')'
    }
    
    if (resetCampusFontSize === true) {
        $('.info-campuses-mid').css('font-size', '2.5rem');
    }
    const campusesElement = $('.info-campuses-mid');
    campusesElement.text(campusMappings[data.route]);
    
    setTimeout(() => {
        while (campusesElement[0].scrollWidth > campusesElement[0].clientWidth && parseInt(campusesElement.css('font-size')) > 12) {
            campusesElement.css('font-size', (parseInt(campusesElement.css('font-size')) - 1) + 'px');
        }  
    }, 0);    

    if (showBusSpeeds && !Number.isNaN(parseInt(data.visualSpeed))) {
        $('.info-speed-mid').text(parseInt(data.visualSpeed));
        $('.info-mph-mid').text('MPH');
    }
    $('.info-name-mid').text(busNameElmText + ' | ');
    $('.info-capacity-mid').text(data.capacity + '% capacity');

    if (busData[busId].oos) {
        $('.bus-oos-mid').show();
    } else {
        $('.bus-oos-mid').hide();
    }

    if (busData[busId].atDepot) {
        $('.bus-depot-mid').show();
    } else {
        $('.bus-depot-mid').hide();
    }

    if (sharedBus && sharedBus === busId) {
        $('.info-shared-bus-mid').show();
    }

    if (joined_service[busId]) {
        const serviceDate = new Date(joined_service[busId]);
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
        
        const timeInService = Math.floor((today - serviceDate) / 1000);
        const hours = Math.floor(timeInService / 3600);
        const minutes = Math.floor((timeInService % 3600) / 60);
        const timeInServiceText = `${hours}h ${minutes}m`;

        $('.bus-joined-service').text('Joined service at ' + displayTime + ' (' + timeInServiceText + ' ago)');
    
    }

    $('.info-next-stops').show();
        
    $('.bus-data-extra').empty();
    let extraDataHtml = `<div class="center mb-0p5rem">Bus ID: ${busId}</div>`;
    for (const [key, value] of Object.entries(busData[busId])) {
        // Format all values including arrays
        if (value !== null) {
            let extraDataVal = value
            if (key === 'stopId') {
                if (Array.isArray(value)) {
                    const formattedStops = [];
                    for (const id of value) {
                        const stopName = stopsData[id] ? stopsData[id].name : 'Unknown';
                        formattedStops.push(`${id} (${stopName})`);
                    }
                    extraDataVal = formattedStops.join(', ');
                } else {
                    extraDataVal += ' (' + (stopsData[value] ? stopsData[value].name : 'Unknown') + ')';
                }
            } else if (key === 'prevStopId' || key === 'next_stop') {
                extraDataVal += ' (' + (stopsData[value] ? stopsData[value].name : 'Unknown') + ')';
            }
            extraDataHtml += `<div>${key}: <span style="opacity: 0.7">${extraDataVal}</span></div>`;
        }
    }
    $('.bus-data-extra').html(extraDataHtml);

    if ('at_stop' in busData[busId] && busData[busId].at_stop === true) {
        startStoppedForTimer(busId)
    } else {
        $('.bus-stopped-for').hide();
    }

    // console.log('data: ', data)
    // console.log('next_stop' in data)

    $('.next-stop-circle').remove(); // remaining .next-stop-circles rom rote menu messes this up

    if ('next_stop' in data && busETAs[busId]) { // instead of checking && busETAs[busId], can also do && !busData[busId].atDepot, since we're just trying to hide next stops when there's no prev stop visited info... wait why not just do that? busData[busId].stopId?
        $('.next-stops-grid > div').empty();

        if (closestStopId && routesServicing(closestStopId).includes(data.route)) {
            const $circle = $('<div class="closest-stop-circle closest-stop-bg" style="margin-right: 1rem;"></div>').css('background-color', colorMappings[data.route])
            $('.next-stops-grid > div').append($(`<div class="flex justify-center align-center closest-stop-bg h-100" style="margin-right: -2rem; margin-left: -1rem; border-radius: 0.8rem 0 0 0.8rem;"></div>`).append($circle))
            $('.next-stops-grid > div').append($(`<div class="flex flex-col pointer closest-stop-bg" style="margin-right: -2rem; padding: 1rem 0;">
                <div class="next-stop-closest closest-stop">Closest Stop</div>
                <div class="next-stop-name flex">${stopsData[closestStopId].name}</div>
            </div>`).click(() => { 
                flyToStop(closestStopId); 
            }));
            $('.next-stops-grid > div').append($(`<div class="flex flex-col center pointer closest-stop-bg h-100 justify-center" style="margin-right: -1rem; border-radius: 0 0.8rem 0.8rem 0; padding-right: 1rem;">
                <div class="next-stop-eta closest-stop-eta" data-stop-id="${closestStopId}">temp</div>
                <div class="next-stop-time closest-stop-time">temp:temp</div>
            </div>`).click(() => { 
                flyToStop(closestStopId);  
            }));
            $('.next-stops-grid > .grid').css('margin-top', '-0.5rem')
            // $('.next-stops-grid > div').append('<div class="closest-stop-divider"><hr></div>')
        }

        let firstCircle = null;
        let lastCircle = null;

        const nextStop = data.next_stop
        let routeStops = stopLists[data.route]
        let sortedStops = []

        const nextStopIndex = routeStops.indexOf(nextStop);

        if (nextStopIndex !== -1) {
            sortedStops = routeStops
                .slice(nextStopIndex)
                .concat(routeStops.slice(0, nextStopIndex));
        }

        if (busData[busId].at_stop && !(closestStopId && closestStopId === busData[busId].stopId)) {

            let stopId = busData[busId].stopId
            if (Array.isArray(stopId)) {
                stopId = stopId[0];
            }

            let stopName = stopsData[stopId].name;
            let campusName = '';
            if (selectedCampus === 'nb') {
                campusName = campusShortNamesMappings[stopsData[stopId].campus];
            }

            $('.next-stops-grid > div').append($('<div class="next-stop-circle"></div>').css('background-color', colorMappings[data.route]))
            $('.next-stops-grid > div').append($(`<div class="flex flex-col pointer">
                    <div class="next-stop-campus">${campusName}</div>
                    <div class="next-stop-name flex">${stopName}</div>
                </div>`).click(() => { 
                    flyToStop(stopId); 
                }));
            $('.next-stops-grid > div').append($(`<div class="flex flex-col center pointer">
                <div class="next-stop-eta" data-stop-id="${stopId}">Here</div>
            </div>`).click(() => { 
                flyToStop(stopId);  
            }));

            if (!firstCircle) {
                firstCircle = $('.next-stops-grid .next-stop-circle').last().css('background-color', 'red');
                firstCircle.append(`<div class="next-stop-circle" style="z-index: 1; background-color: ${colorMappings[data.route]}"></div>`)
            }

        }

        let negativeETA = false;

        for (let i = 0; i < sortedStops.length; i++) {

            let eta;

            if ((busData[busId]['route'] === 'wknd1' || busData[busId]['route'] === 'all' || busData[busId]['route'] === 'winter1' || busData[busId]['route'] === 'on1' || busData[busId]['route'] === 'summer1') && sortedStops[i] === 3) { // special case
                if (busData[busId]['stopId'] && !busData[busId]['prevStopId']) { // very rare case when bus added to server data where next stop is sac nb and there is no previous data yet, accurate eta cannot be known // only triggers if just passed socam sb or yard (at least for current 2024 routes [wknd1, all])
                    delete busETAs[busId];
                    console.log("I'm amazed this actually happened, wow"); // encountered this 4/19/2025 six:38 pm at livi dining
                    return;
                }
                const prevStopId = i === 0 ? sortedStops[sortedStops.length - 1] : sortedStops[i-1]
                eta = Math.round((busETAs[busId][3]['via'][prevStopId] + 10)/secondsDivisor);
            } else {
                eta = Math.round((busETAs[busId][sortedStops[i]] + 10)/secondsDivisor); // Turns out our ETAs are so accurate that they've been exactly 20 seconds too late, i.e. the exact buffer time I was adding! Wow!
            }

            if (eta < 0 && !settings['toggle-show-invalid-etas']) {
                negativeETA = true;
                break;
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

                let hours = Math.floor(eta / 3600);
                let minutes = Math.floor((eta % 3600) / 60);
                let seconds = eta % 60;
                eta = hours > 0 ? `${hours}h ${minutes}m ${seconds}s` : 
                      minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

            } else if (showETAsInSeconds && eta >= 600) {
                currentTime.setMinutes(currentTime.getMinutes() + Math.floor(eta / 60));
                formattedTime = currentTime.toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                });

                let hours = Math.floor(eta / 3600);
                let minutes = Math.floor((eta % 3600) / 60);
                eta = hours > 0 ? (minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`) : `${minutes}m`;

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
            let campusName = '';
            if (selectedCampus === 'nb') {
                campusName = campusShortNamesMappings[stopsData[sortedStops[i]].campus];
            }

            if (i === 0 && settings['toggle-show-bus-progress']) {
                stopName += `<div class="ml-0p5rem" style="color: #00abff;">(${Math.round(busData[busId].progress*100)}%)</div>`
            }

            if (closestStopId && closestStopId === sortedStops[i] && routesServicing(closestStopId).includes(data.route)) {
                if (busData[busId].at_stop && closestStopId === busData[busId].stopId) {
                    $('.closest-stop-eta').text('Here')
                    $('.closest-stop-time').hide();
                } else {
                    $('.closest-stop-eta').text(eta)
                    $('.closest-stop-time').text(formattedTime)
                    $(`[stop-eta="${sortedStops[i]}"]`).text(eta).show();
                }
            }

            if (i === 0 && closestStopId === sortedStops[i] && !busData[busId].at_stop) { continue; } // don't show duplicates if next bus stop is closest stop. Has to be down here because eta still needs to be calculated.

            $('.next-stops-grid > div').append($('<div class="next-stop-circle"></div>').css('background-color', colorMappings[data.route]))
            $('.next-stops-grid > div').append($(`<div class="flex flex-col pointer">
                    <div class="next-stop-campus">${campusName}</div>
                    <div class="next-stop-name flex">${stopName}</div>
                </div>`).click(() => { 
                    flyToStop(sortedStops[i]); 
                }));
            $('.next-stops-grid > div').append($(`<div class="flex flex-col center pointer">
                <div class="next-stop-eta" data-stop-id="${sortedStops[i]}">${eta}</div>
                <div class="next-stop-time">${formattedTime}</div>
            </div>`).click(() => { 
                flyToStop(sortedStops[i]);  
            }));
            $(`[stop-eta="${sortedStops[i]}"]`).text(eta).show();

            if (!firstCircle) {
                firstCircle = $('.next-stops-grid .next-stop-circle').last();
                firstCircle.append(`<div class="next-stop-circle" style="z-index: 1; background-color: ${colorMappings[data.route]}"></div>`)
            }

            if (i === sortedStops.length - 1) {
                lastCircle = $('.next-stop-circle').last();
            }

        }

        if (busData[busId].oos) {
            distanceFromLine(busId);
        }

        if (!negativeETA) {

            $('.info-next-stops, .next-stops-grid').show(); // remove .show after adding message saying stops unavailable in the else statement above <-- ??

            if (popupBusId !== busId) {
                setTimeout(() => { // absolutely no idea why it doesn't reset scroll without a timeout
                    $('.info-next-stops').scrollTop(0)
                }, 0);
            }  

            setTimeout(() => {
                const firstRect = firstCircle[0].getBoundingClientRect();
                const lastRect = lastCircle[0].getBoundingClientRect();
                const heightDiff = Math.abs(lastRect.top - firstRect.top);
                firstCircle.addClass('connecting-line');
                firstCircle[0].style.setProperty('--connecting-line-height', `${heightDiff}px`);
            }, 0);
            
        } else {
            $('.next-stops-grid').hide(); // For some reason *only* the closest stop at top of next stops remains visible if negative ETA, and only if negative ETA happens while site was open. Investigate why, unsure if this fixes. The closest stop should be part of the element, so I'm confused...
            setTimeout(() => {
                $('.info-next-stops').scrollTop(0)
            }, 0);
        }
    }

    else {
        $('.next-stops-grid').hide();
        $('.next-stops-grid > div').empty();
    }

    updateHistoricalCapacity(busId);

    if (sourceBusId !== busId) { // kinda a hack to repopulating bus breaks when already shown, fixes hiding the shown more breaks each time... needed some way to check if it was already shown, can probably find a better way to check later (set a separate var, or hide/clear/empty some element on hide info boxes/pop info bus change...)
        $('.info-quickness-mid').hide();
        getBusBreaks(busId);
        $('.show-more-breaks, .show-all-breaks').show();
    }
    
    if (sourceStopId) {
        $('.bus-info-back').show();
    } else {
        $('.bus-info-back').hide(); 
    }
    sourceBusId = busId;

    if (favBuses.includes(parseInt(busId))) {
        $('.bus-star > i').css('color', 'gold').removeClass('fa-regular').addClass('fa-solid')
    } else {
        $('.bus-star > i').css('color', 'var(--theme-color)').removeClass('fa-solid').addClass('fa-regular')
    }

    if (!isDesktop) {
        const expandedBounds = expandBounds(bounds[selectedCampus], 2.8);
        // map.setMaxBounds(expandedBounds);
        map.setMinZoom(9);
    }

    $('.my-location-popup').hide(); // investigate why I don't have to hide the other info boxes
    $('.stop-info-popup').hide(); // nvm I changed something somewhere to make me need to hide this one too

    $('.bus-info-popup').stop(true, true).show();

    const maxHeight = window.innerHeight - $('.info-next-stops').offset().top - $('.bus-info-bottom').innerHeight() - $('.bottom').innerHeight()
    $('.info-next-stops').css('max-height', maxHeight - 135) // 1.5rem*2 = vertical padding on .info-next-stops, plus xrem gap to be above .bottom

    if (!popupBusId && settings['toggle-hide-other-routes']) {
        focusBus(busId);
    }

    sa_event('bus_view_test', {
        'bus_id': busId,
        'route': data.route,
    });

}


function populateBusBreaks(busBreakData) {

    if (!busBreakData || busBreakData.error) {
        $('.bus-breaks').empty();
        $('.bus-breaks').append(`<div class="text-1p2rem" style="grid-column: 1 / span 3; color: #acacac;">This bus hasn't taken any breaks yet.</div>`);
        $('.show-more-breaks, .show-all-breaks').hide();
        return;
    }

    const breakDiv = $('.bus-breaks');
    breakDiv.empty(); // Clear existing breaks before adding new ones
    
    breakDiv.append(`<div class="mb-0p5rem text-1p2rem">Time</div>`);
    breakDiv.append(`<div class="mb-0p5rem text-1p2rem">Stop</div>`);
    breakDiv.append(`<div class="mb-0p5rem text-1p2rem">Duration</div>`);

    let breakCount = 0;

    let consideredStops = new Set();
    let totalAvgBreakTime = 0;
    let totalBusBreakTime = 0;
    let totalBusStopTime = 0;

    const reversedData = [...busBreakData].reverse();

    for (const breakItem of reversedData) {

        let extraClass = '';

        if (breakItem.break_duration > 180) {
            extraClass = 'long-break';
            breakCount++;
        } else {
            extraClass += 'none';
        }

        if (breakCount >= 7) {
            extraClass += ' none';
        }

        const timeArrived = new Date(breakItem.time_arrived.replace(/\.\d+/, ''));
        const formattedTime = timeArrived.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
        
        breakDiv.append(`<div class="${extraClass}" style="color:#656565;">${formattedTime}</div>`);
        breakDiv.append(`<div class="${extraClass}" style="color: var(--theme-extra);">${stopsData[breakItem.stop_id].shortName || stopsData[breakItem.stop_id].name}</div>`);
        
        let durationDiffPercent = Math.round(((breakItem.break_duration - waits[breakItem.stop_id])/breakItem.break_duration * 100));
        
        let percentDiffCol = ''
        if (durationDiffPercent > 0) { // slower than average
            percentDiffCol = '#f84949';
            durationDiffPercent = '+' + durationDiffPercent;
        } else if (durationDiffPercent < 0) { // faster than average
            percentDiffCol = 'var(--theme-short-stops-color)';
        }


        breakDiv.append(`<div class="${extraClass}"><div class="flex gap-x-0p5rem justify-between">
            <div class="bold-500">${Math.floor(breakItem.break_duration/60) ? Math.floor(breakItem.break_duration/60) + 'm ' : ''}${Math.round(breakItem.break_duration % 60) ? Math.round(breakItem.break_duration % 60) + 's' : ''}</div>
            <div class="stop-dur-percent none text-1p2rem" style="color: ${percentDiffCol};">${durationDiffPercent}%</div>
        </div></div>`);

        if (!consideredStops.has(breakItem.stop_id)) {
            totalAvgBreakTime += waits[breakItem.stop_id];
            totalBusBreakTime += breakItem.break_duration;
            consideredStops.add(breakItem.stop_id);
        }

        if (breakItem.break_duration > 180) {   
            totalBusStopTime += breakItem.break_duration;
        }
    }


    const percentDiff = ((totalBusBreakTime - totalAvgBreakTime) / totalAvgBreakTime * 100).toFixed(1);

    const timeDiff = Math.round((new Date(busBreakData[busBreakData.length - 1].time_departed.replace(/\.\d+/, '')) - new Date(busBreakData[0].time_arrived.replace(/\.\d+/, ''))) / 1000);
    const breakMinPerHour = (totalBusStopTime / timeDiff * 60).toFixed(1);
    // $('.bus-avg-break-time-per-hour').html(`${breakMinPerHour} min/hr`);

    $('.bus-avg-break-time').html(`Stops <span style="color: ${percentDiff > 0 ? '#f84949' : 'var(--theme-short-stops-color)'};">${Math.abs(percentDiff)}%</span> ${percentDiff > 0 ? 'longer' : 'shorter'} than avg, breaks for <span style="color: var(--theme-breaks-min-color);">${Math.ceil(breakMinPerHour)} min/hr</span>`);

    if ((totalBusBreakTime - totalAvgBreakTime) / totalAvgBreakTime > 0.3) {
        $('.info-quickness-mid').html(" | <span class='text-1p2rem' style='color: #fa3c3c;'>Lengthy stops</span>").show();
    } else if ((totalBusBreakTime - totalAvgBreakTime) / totalAvgBreakTime < -0.2) {
        $('.info-quickness-mid').html(" | <span class='text-1p2rem' style='color: var(--theme-short-stops-color);'>Short stops</span>").show();
    }

    if (settings['toggle-show-bus-quickness-breakdown']) {
        $('.bus-quickness-breakdown-wrapper').html(`<div class="flex flex-col text-1p3rem mt-0p5rem">
            <div>Total bus stop time/loop: ${Math.round(totalBusBreakTime)}s</div>
            <div>Network avg stop time/loop: ${Math.round(totalAvgBreakTime)}s</div>
            <div>Percent difference: ${percentDiff}%</div>
        </div>`).show();
    } else {
        $('.bus-quickness-breakdown-wrapper').hide();
    }

    if (breakCount !== busBreakData.length) {
        $('.show-more-breaks, .show-all-breaks').show();
    }

    if (breakCount === 0) {
        $('.bus-breaks').children().slice(0, 3).remove();
        $('.bus-breaks').append(`<div class="no-breaks text-1p2rem" style="grid-column: 1 / span 3; color: #acacac;">This bus hasn't taken any breaks yet.</div>`);
        $('.show-more-breaks').hide();
        $('.show-all-breaks').click(function() { $('.no-breaks').remove(); });
        $('.show-all-breaks').text("Show Stops");
        $('.bus-avg-break-time').html(`Stops <span style="color: ${percentDiff > 0 ? '#f84949' : 'var(--theme-short-stops-color)'};">${Math.abs(percentDiff)}%</span> ${percentDiff > 0 ? 'longer' : 'shorter'} than avg`);
    } else {
        $('.show-all-breaks').text("Show All Stops (Slow)");
    }


    // eventually find a way to count breaks vs stops, probably by counting ivs with .long-break, and only show .show-more-breaks if this number is not 7, or whatever var i set to max def visible breaks

}


let busBreaksCache = {};

function getBusBreaks(busId) {
    const currentTime = new Date().getTime();
    const THREE_MINUTES = 3 * 60 * 1000;

    if (busBreaksCache[busId] && 
        (currentTime - busBreaksCache[busId].timestamp) < THREE_MINUTES) {
        populateBusBreaks(busBreaksCache[busId].data);
        return;
    }

    fetch(`https://transloc.up.railway.app/get_breaks?bus_id=${busId}`)
        .then(response => response.json())
        .then(data => {
            busBreaksCache[busId] = {
                data: data,
                timestamp: currentTime
            };                
            populateBusBreaks(data);
        })
        .catch(error => {
            console.error('Error fetching bus breaks:', error);
        });
}

let busRiderships = {};

let busRidershipCharts = {};
let currentRidershipChartBusId = null;

function updateHistoricalCapacity(busId) {
    // Only proceed if this is a new bus selection or data needs refresh
    const currentMinute = new Date().getMinutes();
    const shouldRefresh = currentMinute % 5 === 1 && !busRiderships.lastUpdate || 
                         (currentMinute % 5 === 1 && new Date().getTime() - busRiderships.lastUpdate > 60000);
                         
    if (Object.keys(busRiderships).length === 0 || shouldRefresh) {
        fetch('https://transloc.up.railway.app/bus_ridership')
            .then(response => response.json())
            .then(data => {
                const dataChanged = JSON.stringify(busRiderships) !== JSON.stringify(data);
                busRiderships = data;
                busRiderships.lastUpdate = new Date().getTime();
                if (!busRidershipCharts[busId] || dataChanged) {
                    createBusRidershipChart(busId);
                    currentRidershipChartBusId = busId;
                }
            })
            .catch(error => {
                console.error('Error fetching bus ridership data:', error);
            });
    } else if (!busRidershipCharts[busId]) {
        createBusRidershipChart(busId);
        currentRidershipChartBusId = busId;
    }
}

function createBusRidershipChart(busId) {
    
    // If chart already exists, just update its data if needed
    if (busRidershipCharts[busId]) {
        const timeRiderships = busRiderships[busId];
        if (!timeRiderships || !Object.keys(timeRiderships).length) {
            $('.bus-historical-capacity').hide();
            return;
        }

        const utcOffset = new Date().getTimezoneOffset();
        const entries = Object.entries(timeRiderships).map(([key, value]) => {
            let localMinutes = parseInt(key) - utcOffset;
            if (localMinutes < 0) localMinutes += 1440;
            const sortMinutes = localMinutes < 300 ? localMinutes + 1440 : localMinutes;
            const hours = Math.floor(localMinutes / 60);
            const minutes = localMinutes % 60;
            const time = new Date();
            time.setHours(hours, minutes, 0, 0);
            const formattedTime = time.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit'
            });
            return [formattedTime, value, sortMinutes];
        });

        const sortedData = Object.fromEntries(
            entries.sort(([, , a], [, , b]) => a - b)
        );

        const newLabels = Object.keys(sortedData);
        const newValues = Object.values(sortedData);

        // Only update if data has changed
        const currentLabels = busRidershipCharts[busId].data.labels;
        const currentValues = busRidershipCharts[busId].data.datasets[0].data;
        
        if (JSON.stringify(currentLabels) !== JSON.stringify(newLabels) || 
            JSON.stringify(currentValues) !== JSON.stringify(newValues)) {
            busRidershipCharts[busId].data.labels = newLabels;
            busRidershipCharts[busId].data.datasets[0].data = newValues;
            busRidershipCharts[busId].update();
        }
        
        $('.bus-historical-capacity').show();
        return;
    }

    if (!busRiderships[busId]) {
        $('.bus-historical-capacity').hide();
        return;
    }

    const timeRiderships = busRiderships[busId];
    if (!Object.keys(timeRiderships).length) {
        $('.bus-historical-capacity').hide();
        return;
    }

    const utcOffset = new Date().getTimezoneOffset();

    const entries = Object.entries(timeRiderships).map(([key, value]) => {
        let localMinutes = parseInt(key) - utcOffset;
        if (localMinutes < 0) localMinutes += 1440; // Handle day wraparound

        // Add 24 hours (1440 mins) to early morning times to sort them at the end
        const sortMinutes = localMinutes < 300 ? localMinutes + 1440 : localMinutes;

        const hours = Math.floor(localMinutes / 60);
        const minutes = localMinutes % 60;
        const time = new Date();
        time.setHours(hours, minutes, 0, 0);

        const formattedTime = time.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit'
        });

        return [formattedTime, value, sortMinutes];
    });

    const sortedData = Object.fromEntries(
        entries.sort(([, , a], [, , b]) => a - b)
    );

    const labels = Object.keys(sortedData);
    const values = Object.values(sortedData);

    const ctx = document.createElement('canvas');
    $('.bus-historical-capacity').empty().css('height', '90px').append(ctx).show();
    
    busRidershipCharts[busId] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                // label: 'Passengers',
                data: values,
                borderColor: colorMappings[busData[busId].route],
                backgroundColor: function() {
                    const color = colorMappings[busData[busId].route];
                    if (color.startsWith('rgb')) {
                        return color.replace(')', ', 0.2)').replace('rgb', 'rgba');
                    } else {
                        const temp = document.createElement('div');
                        temp.style.color = color;
                        document.body.appendChild(temp);
                        const rgb = window.getComputedStyle(temp).color;
                        document.body.removeChild(temp);
                        return rgb.replace(')', ', 0.2)').replace('rgb', 'rgba');
                    }
                }(),
                fill: true,
                tension: 0.4,
                pointRadius: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function(context) {
                            return `${context.parsed.y}% full`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    display: false
                },
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        autoSkip: false,
                        maxRotation: 45,
                        padding: 5,
                        // Explicitly set which ticks to display
                        callback: function(value, index, values) {
                            const label = this.getLabelForValue(value);
                            const timePart = String(label).split(' ')[0];
                            
                            // Always show first and last labels
                            // if (index === 0 || index === values.length - 1) {
                            //     const [hour, period] = String(label).split(' ');
                            //     return hour.split(':')[0] + ' ' + period;
                            // }
                            
                            // For intermediate labels, only show hour labels (:00)
                            if (timePart.endsWith(':00')) {
                                const [hour, period] = String(label).split(' ');
                                const hourNum = hour.split(':')[0];
                                const timeLabel = hourNum + ' ' + period;
                                
                                // // Check if this hour matches the first or last hour
                                // const firstLabel = String(this.getLabelForValue(values[0].value));
                                // const lastLabel = String(this.getLabelForValue(values[values.length - 1].value));
                                // const firstHour = firstLabel.split(' ')[0].split(':')[0];
                                // const firstPeriod = firstLabel.split(' ')[1];
                                // const lastHour = lastLabel.split(' ')[0].split(':')[0];
                                // const lastPeriod = lastLabel.split(' ')[1];
                                
                                // // Don't show intermediate labels that match first or last hour
                                // if (timeLabel === firstHour + ' ' + firstPeriod || timeLabel === lastHour + ' ' + lastPeriod) {
                                    // return '';
                                // }
                                
                                return timeLabel;
                            }
                            return '';
                        }
                    }
                }
            }
        }
    });
}

function focusBus(busId) {

    const route = busData[busId].route;

    hideStopsExcept(route)
    hidePolylinesExcept(route)

    for (const marker in busMarkers) {
        if (marker !== busId.toString()) {
            busMarkers[marker].getElement().style.display = 'none';
        }
    }

    // if (!popupBusId) {
        const topContainerHeight = 1 - ($(window).height() - $('.bus-btns').offset().top)/$(window).height()

        let focusBounds = polylines[route].getBounds()

        if (busData[busId].atDepot) {
            const busLocBounds = L.latLngBounds([L.latLng(busData[busId].lat, busData[busId].long)]);
            focusBounds.extend(busLocBounds);
        }

        const mapSize = map.getSize();
        const topGuiHeight = mapSize.y * topContainerHeight;

        const extraPaddingY = 30;
        const extraPaddingX = 30;

        map.fitBounds(focusBounds, {
            paddingTopLeft:     [extraPaddingX, topGuiHeight],
            paddingBottomRight: [extraPaddingX, extraPaddingY + 30],
            animate: true
        });
    // }

    if (!savedCenter) {
        savedCenter = map.getCenter();
        savedZoom = map.getZoom();
    }
}

function distanceFromLine(busId) {
    const busLatLng = L.latLng(busData[busId].lat, busData[busId].long);
    const polyline = polylines[busData[busId].route];
    const polyPoints = polyline.getLatLngs();
    
    let minDist = Infinity;
    let closestPoint = null;
    
    for (let i = 0; i < polyPoints.length; i++) {
        const d = busLatLng.distanceTo(polyPoints[i]);
        if (d < minDist) {
            minDist = d;
            closestPoint = polyPoints[i];
        }
    }
    
    const distanceMiles = minDist * 0.000621371 * 5280;
    // console.log(`Bus ${busId} is ${distanceMiles.toFixed(3)} ft from its route`);
    return (distanceMiles > 200)
}

function isValid(busId) {

    if (!busETAs[busId]) return false;

    stopLists[busData[busId].route].forEach(stopId => {
        if (busETAs[busId][stopId] < 0) return false;
    })

    return true;
}

function expandBounds(origBounds, factor) {
    const currentSouthWest = origBounds.getSouthWest();
    const currentNorthEast = origBounds.getNorthEast();
    const newSouthWest = L.latLng(
        currentSouthWest.lat - (currentNorthEast.lat - currentSouthWest.lat) * (factor - 1) / 2,
        currentSouthWest.lng - (currentNorthEast.lng - currentSouthWest.lng) * (factor - 1) / 2
    );
    const newNorthEast = L.latLng(
        currentNorthEast.lat + (currentNorthEast.lat - currentSouthWest.lat) * (factor - 1) / 2,
        currentNorthEast.lng + (currentNorthEast.lng - currentSouthWest.lng) * (factor - 1) / 2
    );
    return L.latLngBounds(newSouthWest, newNorthEast);
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

    const maxHeight = window.innerHeight - $('.info-next-stops').offset().top - $('.bus-info-bottom').innerHeight() - $('.bottom').innerHeight()
    $('.info-next-stops').css('max-height', maxHeight - 135)
    
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
    if (!busId) {
        console.error(`Invalid bus ID: busId is undefined or null. Input bus ID: ${busId}`);
        return;
    }
    if (!busData) {
        console.error('Missing bus data: busData is undefined or null');
        return;
    }
    if (!busData[busId]) {
        console.error(`Invalid bus data for bus ID ${busId}: busData[${busId}] is undefined or null`);
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

    overtimeBusId = busId;

    if (overtimeInterval) {
        clearInterval(overtimeInterval);
    }

    $('.overtime-time').show();
    
    const timeArrived = new Date(busData[busId].timeArrived);
    const avgWaitAtStop = waits[busData[busId].stopId[0]];
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

$('.satellite-btn').click(function() {
    const currentId = tileLayer.options.id;
    if (currentId.includes('satellite')) {
        let theme = settings['theme'];
        if (theme === 'auto') {
            const currentHour = new Date().getHours();
            theme = (currentHour <= 7 || currentHour >= 18) ? 'dark' : 'light';
        }
        
        const newTheme = theme === 'dark' ? 'dark-v11' : 'streets-v11';
        map.removeLayer(tileLayer);
        
        tileLayer = L.tileLayer(`https://api.mapbox.com/styles/v1/mapbox/${newTheme}/tiles/{z}/{x}/{y}?access_token=${mapBoxToken}`, {
            id: 'mapbox/' + newTheme,
        }).addTo(map);
        
        $(this).css('background-color', 'var(--theme-bg)');
    } else {
        map.removeLayer(tileLayer);
        tileLayer = L.tileLayer(`https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/tiles/{z}/{x}/{y}?access_token=${mapBoxToken}`, {
            id: 'mapbox/satellite-streets-v12',
        }).addTo(map);
        
        let theme = settings['theme']
        if (theme === 'auto') {
            const currentHour = new Date().getHours();
            theme = (currentHour <= 7 || currentHour >= 18) ? 'dark' : 'light';
        }
        $(this).css('background-color', 'var(--theme-satellite-btn)');
    }
});

let lastPikachuGif = null;

const gifSoundMap = {
    'img/pika.gif': 'img/pika.mp3',
    'img/jolteon.gif': 'img/jolteon.mp3',
    'img/sonic.gif': 'img/sonic.mp3',
    'img/mario.gif': 'img/mario.mp3',
    'img/yoshi.gif': 'img/yoshi.mp3',
    'img/luigi.gif': 'img/luigi.mp3',
    'img/kirby.gif': 'img/kirby.mp3',
    'img/link.gif': 'img/link.mp3',
    'img/tom.gif': 'img/tom.mp3',
    'img/roadrunner.gif': 'img/roadrunner.mp3',
};

function animatePikachu() {
    const pika = document.createElement('img');
    const gifs = Object.keys(gifSoundMap);
    
    const availableGifs = gifs.filter(gif => gif !== lastPikachuGif);
    const selectedGif = availableGifs[Math.floor(Math.random() * availableGifs.length)];
    lastPikachuGif = selectedGif;
    
    // Play the corresponding sound for the selected GIF
    const sound = new Audio(gifSoundMap[selectedGif]);
    setTimeout(() => {
        sound.play();
    }, 100);
    
    pika.src = selectedGif;
    if (pika.src.includes('jolteon.gif')) {
        pika.style.transform = 'translateY(-50%) scaleX(-1)';
    } else if (pika.src.includes('sonic.gif')) {
        pika.style.transform = 'translateY(-50%) scale(0.7)';
    } else if (pika.src.includes('kirby.gif')) {
        pika.style.transform = 'translateY(-50%) scale(0.57)';
    } else if (pika.src.includes('tom.gif')) {
        pika.style.transform = 'translateY(-50%) scaleX(-1)';
    } else if (pika.src.includes('roadrunner.gif')) {
        pika.style.transform = 'translateY(-50%) scaleX(-2) scaleY(2)';
    } else {
        pika.style.transform = 'translateY(-50%)';
    }
    pika.style.position = 'fixed';
    pika.style.top = '50%';
    pika.style.left = '-100px';
    pika.style.width = '100px';
    pika.style.height = 'auto';
    pika.style.zIndex = '1000';
    document.body.appendChild(pika);

    const startTime = performance.now();
    const duration = 1800;
    const screenWidth = window.innerWidth;

    function animate(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        const newPosition = -100 + (screenWidth + 200) * progress;
        pika.style.left = `${newPosition}px`;

        if (progress < 1) {
            requestAnimationFrame(animate);
        } else {
            pika.remove();
        }
    }

    requestAnimationFrame(animate);
}


function navToStop() {

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isAndroid = /Android/.test(navigator.userAgent);
    let url = '';

    const stopLat = stopsData[popupStopId].latitude
    const stopLng = stopsData[popupStopId].longitude

    if (isIOS) {
        url = `http://maps.apple.com/?daddr=${stopLat},${stopLng}&dirflg=w`;
    } else if (isAndroid) {
        url = `https://www.google.com/maps/dir/?api=1&destination=${stopLat},${stopLng}&travelmode=walking`;
    } else {
        // Fallback, use GM
        url = `https://www.google.com/maps/dir/?api=1&destination=${stopLat},${stopLng}&travelmode=walking`;
    }

    window.open(url, '_blank');

}