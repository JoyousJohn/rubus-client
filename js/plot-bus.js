// js/plot-bus.js - extracted verbatim from js/map.js
let selectedMarkerId;
let pauseUpdateMarkerPositions = false;

function plotBus(busName, immediatelyUpdate=false, moved=true) {
    if (typeof map === 'undefined' || !map) return;

    const shouldShow = isBusShownOnMap(busName);
    const loc = {lat: busData[busName].lat, long: busData[busName].long};

    if (!busMarkers[busName]) {
        // Create a new bus marker using the WebGL symbol layer proxy
        const route = busData[busName].route;
        const markerType = settings?.['marker-type'] || 'rubus';
        const routeColor = colorMappings[route] || '#446bef';
        const currentSize = settings['marker-size'] || 'medium';
        const sizeClass = {
            'small': 'small-marker',
            'medium': 'medium-marker',
            'big': 'big-marker'
        }[currentSize] || 'medium-marker';

        // Create the WebGL proxy marker (replaces all 4 DOM marker types)
        const initialRotation = (typeof calculateRotation === 'function') ? calculateRotation(busName, loc) : (normalizeRotation(busData[busName].rotation) + 45);
        busMarkers[busName] = busLayerManager.createProxy(busName, [loc.lat, loc.long], {
            markerType: markerType,
            route: route,
            routeColor: routeColor,
            sizeClass: sizeClass,
            displayName: (typeof formatElectricBusName === 'function') ? formatElectricBusName(busData[busName].busName) : busData[busName].busName,
            rotation: initialRotation
        }).addTo(map);

        // Set initial rotation (stored as a plain number; mock DOM kept in sync for compat)
        busMarkers[busName].setRotation(initialRotation);

        // Hide the marker at creation if the route filter says so (the default
        // is visible; without this a new bus on a hidden route would show).
        if (isBusMarkerHiddenByRoute(busName)) {
            busMarkers[busName].setVisibility(false);
        }

        busMarkers[busName].on('click', function() {
            sourceStopId = null;
            sourceBusName = null;
            selectBusMarker(busName);
        });

        updateBusNameTooltips();
    }

    // Hidden (out-of-service/off-line) buses keep their marker object so other
    // code referencing busMarkers[busName] stays valid, but they stay off the
    // map and skip all per-update work: no animation, no position/rotation
    // updates. isBusShownOnMap is O(1) for buses far outside the route bounds
    // thanks to the distanceFromLine fast-path.
    if (!shouldShow) {
        if (busMarkers[busName]) {
            busMarkers[busName].remove();
        }
        return;
    }

    if (!pauseUpdateMarkerPositions) {
        updateMarkerPosition(busName, immediatelyUpdate || forceImmediateUpdate, moved);
    }

    // Ensure the marker is on the map. addTo() removes + re-appends the
    // element, which reorders overlapping markers (equal z-index, DOM order
    // decides) and makes the on-top marker flip — so only re-add when the
    // marker isn't already on the map. The display is then set from the route
    // filter so polls don't re-show buses hidden by a selected route.
    if (busMarkers[busName]) {
        if (!busMarkers[busName]._isOnMap) {
            busMarkers[busName].addTo(map);
        }
        busMarkers[busName].setVisibility(!isBusMarkerHiddenByRoute(busName));
    }

    // Record last time a marker was updated/rendered
    lastUpdateTime = Date.now();
    requestOffScreenUpdate();
}

function selectBusMarker(busName) {
    const isNewFocus = (popupBusName !== busName);
    popupBusName = busName;
    popInfo(busName, true, isNewFocus);

    if (settings['toggle-hide-other-routes'] && isNewFocus) {
        focusBus(busName);
    }

    if (selectedMarkerId) {
        const rotationElement = getMarkerRotationElement(busMarkers[selectedMarkerId]);
        if (rotationElement) {
            rotationElement.style.boxShadow = '';
        }
    }
    
    const rotationElement = getMarkerRotationElement(busMarkers[busName]);
    if (rotationElement) {
        rotationElement.style.boxShadow = '0 0 10px ' + colorMappings[busData[busName].route];
    }

    selectedMarkerId = busName;

    // Update the WebGL selection glow layer
    if (typeof busLayerManager !== 'undefined') {
        busLayerManager.setSelectedBus(busName);
    }

    $('.bus-log-wrapper').hide();

    // DISABLED: Your Bus feature // updateRidingBadgeUI();
}
