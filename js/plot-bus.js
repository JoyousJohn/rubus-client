// js/plot-bus.js - extracted verbatim from js/map.js
// TEMP PERF DEBUG (tap -> bus popup 1s freeze): shared timing helper (see
// bus-layer.js for the canonical definition; guarded so load order is safe).
// Master switch: all perf logs are behind window.BUS_POPUP_PERF_DEBUG
// (default OFF). Set it to true in the console to re-enable at runtime.
if (typeof window.BUS_POPUP_PERF_DEBUG === 'undefined') {
    window.BUS_POPUP_PERF_DEBUG = false;
}
if (!window.busPopupPerfReset) {
    window.__busPopupT0 = null;
    window.busPopupPerfReset = function() { window.__busPopupT0 = performance.now(); return window.__busPopupT0; };
}
if (!window.busPopupPerfLog) {
    window.busPopupPerfLog = function(stage, busName) {
        try {
            if (!window.BUS_POPUP_PERF_DEBUG) return;
            const now = performance.now();
            if (window.__busPopupT0 == null) window.__busPopupT0 = now;
            const delta = now - window.__busPopupT0;
            console.log(`[bus-popup-perf][${new Date().toISOString()}][+${delta.toFixed(1)}ms] ${stage}` + (busName ? ` bus=${busName}` : ''));
        } catch (e) {}
    };
}
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
            if (window.busPopupPerfLog) window.busPopupPerfLog('tap: proxy click handler entry (plotBus)', busName);
            sourceStopId = null;
            sourceBusName = null;
            sourceRouteName = null;
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
    // Anchor tap-to-popup timing for non-tap callers (flyToBus/search/favs):
    // a stale T0 (>2s) means no tap preceded this, so re-anchor here.
    try {
        if (isNewFocus && window.busPopupPerfReset && (window.__busPopupT0 == null || (performance.now() - window.__busPopupT0) > 2000)) {
            window.busPopupPerfReset();
        }
    } catch (e) {}
    if (window.busPopupPerfLog) window.busPopupPerfLog(`selectBusMarker entry (isNewFocus=${isNewFocus})`, busName);
    popupBusName = busName;
    if (window.busPopupPerfLog) window.busPopupPerfLog('selectBusMarker: before popInfo', busName);
    popInfo(busName, true, isNewFocus);
    if (window.busPopupPerfLog) window.busPopupPerfLog('selectBusMarker: after popInfo (sync)', busName);

    if (settings['toggle-hide-other-routes'] && isNewFocus) {
        if (window.busPopupPerfLog) window.busPopupPerfLog('selectBusMarker: before focusBus', busName);
        try {
            const _selectFocusResult = focusBus(busName);
            if (_selectFocusResult && typeof _selectFocusResult.then === 'function') {
                _selectFocusResult.then(() => { if (window.busPopupPerfLog) window.busPopupPerfLog('selectBusMarker: focusBus done (async)', busName); })
                    .catch((err) => { if (window.busPopupPerfLog) window.busPopupPerfLog('selectBusMarker: focusBus error (async): ' + err, busName); });
            } else if (window.busPopupPerfLog) {
                window.busPopupPerfLog('selectBusMarker: focusBus done (sync)', busName);
            }
        } catch (err) {
            if (window.busPopupPerfLog) window.busPopupPerfLog('selectBusMarker: focusBus threw: ' + err, busName);
        }
    }

    if (selectedMarkerId) {
        const rotationElement = getMarkerRotationElement(busMarkers[selectedMarkerId]);
        if (rotationElement) {
            rotationElement.style.boxShadow = '';
        }
    }
    
    if (window.busPopupPerfLog) window.busPopupPerfLog('selectBusMarker: before selection glow + setSelectedBus', busName);
    const rotationElement = getMarkerRotationElement(busMarkers[busName]);
    if (rotationElement) {
        rotationElement.style.boxShadow = '0 0 10px ' + colorMappings[busData[busName].route];
    }

    selectedMarkerId = busName;

    // Update the WebGL selection glow layer
    if (typeof busLayerManager !== 'undefined') {
        busLayerManager.setSelectedBus(busName);
    }
    if (window.busPopupPerfLog) window.busPopupPerfLog('selectBusMarker: exit', busName);

    $('.bus-log-wrapper').hide();

    // DISABLED: Your Bus feature // updateRidingBadgeUI();
}
