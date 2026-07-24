let map;
let busMarkers = {};
let busData = {}
let polylines = {};
let activeRoutes = new Set();
var popupBusName;
let popupStopId;
let busesDoneInit; // don't check for moves until map is done plotting
let selectedCampus;
let popupBuildingName;
let popupBuildingLatLng;
let bikeRackMarkers = [];

let mapDragged = false;
let shouldSetMaxBoundsAfterDrag = false;

// settings vars
let showETAsInSeconds = false;

let isDesktop;
let tileLayer;
let currentTileLayerType = 'streets'; // Track the current tile layer type

$(document).ready(function() {

    updateSettings();

    let mapOptions = {
        maxBoundsViscosity: 1.3, // How much resistance to panning outside maxBounds
        zoomControl: false, // Disable +/- zoom control
        inertiaDeceleration: 1000, // higher means faster deceleration
        zoomSnap: 0, // can be 0 for continuous zoom, normally 1
        edgeBufferTiles: 10, // number of invisible tiles to load on edges
        scrollWheelZoom: true, // Leaflet's built-in handler (prevents browser page zoom, manages tiles)
        wheelPxPerZoomLevel: 20, // stronger default feel (lower = faster)
        wheelDebounceTime: 16,   // ~1 frame — zoom fires during gesture, not just after
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
    // Route polylines above buildings/parking (overlayPane 400); below markers (600)
    map.createPane('polylinesPane');
    map.getPane('polylinesPane').style.zIndex = 450;
    try { document.dispatchEvent(new Event('rubus-map-created')); } catch (_) {}
    try { if (typeof initSpoofing === 'function') { initSpoofing(); } } catch (_) {}

    map.setMinZoom(12);
    // map.getRenderer(map).options.padding = 1; // Keep map outside viewport rendered to avoid flicker

    let mapTheme;
    if (settings && settings['theme']) {

        if (settings['theme'] === 'light' || settings['theme'] === 'beige-coffee' || settings['theme'] === 'coffee') {
            mapTheme = 'streets-v11';
        } else if (settings['theme'] === 'dark' || settings['theme'] === 'y2k-glamour' || settings['theme'] === 'glamour') {
            mapTheme = 'dark-v11';
        } else if (settings['theme'] === 'auto') {
            const currentHour = new Date().getHours();
            mapTheme = (currentHour <= 7 || currentHour >= 18) ? 'dark-v11' : 'streets-v11';
        } else {
            mapTheme = 'streets-v11';
        }
    } else {
        mapTheme = 'streets-v11';
    }

    if (settings && settings['toggle-pause-update-marker']) {
        pauseUpdateMarkerPositions = settings['toggle-pause-update-marker'];
    }

        tileLayer = L.tileLayer(`https://tiles.rubus.live/styles/v1/${mapTheme}/tiles/{z}/{x}/{y}.png`, {
        maxZoom: 20,
        updateWhenIdle: true,   // load tiles after zoom settles (less mid-gesture thrash)
        updateWhenZooming: false,
        keepBuffer: 2,
    }).addTo(map);
    currentTileLayerType = 'streets';

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

            if (popupBusName && !isDesktop) {
                const minZoomLevel = 12;
                map.setMinZoom(minZoomLevel);
                if (map.getZoom() < minZoomLevel) {
                    map.setZoom(minZoomLevel);
                }
                shouldSetMaxBoundsAfterDrag = true;
            }

            hideInfoBoxes();

            // If navigation UI is visible, hide it and reset navigation state
            if ($('.navigate-wrapper').is(':visible')) {
                $('.navigate-wrapper').fadeOut(200);
                clearRouteDisplay();
                selectedFromBuilding = null;
                selectedToBuilding = null;
                currentAutocompleteIndex = -1;
                // Clear inputs without triggering user-driven logic
                isSettingInputProgrammatically = true;
                $('#nav-from-input, #nav-to-input').val('').removeClass('has-value');
                isSettingInputProgrammatically = false;
                // Hide any autocomplete dropdowns
                hideNavigationAutocomplete();
            }

            if (settings['toggle-show-bus-log']) {
                $('.bus-log-wrapper').show();
            }

            if (settings['toggle-hide-other-routes'] && !shownRoute) {
                
                showAllStops();
                // Don't show buses and polylines when in parking permit mode
                if (!$('body').hasClass('parking-permit-mode')) {
                    showAllBuses();
                    if (appStyle !== 'rider') {
                        showAllPolylines();
                    }                }
            } else if (settings['toggle-hide-other-routes'] && shownRoute) {
                for (const marker in busMarkers) {
                    if (busData[marker].route === shownRoute) {
                        busMarkers[marker].getElement().style.display = '';
                    }
                }
            }

            if (settings['toggle-show-campus-switcher']) {
                $('.campus-switcher').show();
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
        updateNextStopsMaxHeight();
    });
    
    if (!$('.theme-modal').is(':visible') && !settings['toggle-disable-fireworks-on-open']) {
        launchFireworks(12);
    }

    if (window.location.hostname.includes('.dev')) {
        $('.dev-build-popup').fadeIn().delay(7000).slideUp();
    }

    // Trackpad vs mouse sensitivity on Leaflet ScrollWheelZoom.
    // DomEvent binds the function at enable-time → disable → patch → enable.
    // Trackpad: CSS scale preview while pinching; ONE real setZoomAround when gesture ends
    //           (tiles/vectors rebuild once — not every wheel tick).
    // Mouse: stock sigmoid + short debounce (notch-friendly).
    // Touch-screen pinch stays on Leaflet TouchZoom (untouched).
    (function patchScrollWheelZoomSensitivity() {
        const TRACKPAD_MAX_ABS_DELTA = 50;
        // Leaflet getWheelDelta units per full zoom level (lower = stronger)
        const TRACKPAD_DELTA_PER_ZOOM = 12;
        const MOUSE_PX_PER_ZOOM = 60;
        const MOUSE_DEBOUNCE_MS = 40;
        const TRACKPAD_GESTURE_END_MS = 140; // idle after last wheel event → commit real zoom
        const DEBUG_WHEEL = false;

        const handler = map.scrollWheelZoom;
        if (!handler) {
            console.warn('[wheel-zoom] map.scrollWheelZoom missing');
            return;
        }

        handler.disable();

        handler._isTrackpadGesture = false;
        handler._trackpadGesture = null; // { startZoom, targetZoom, origin, panePos }
        handler._gestureEndTimer = null;

        function zoomDeltaFromInput(deltaIn, isTrackpad) {
            if (!deltaIn) return 0;
            if (isTrackpad) {
                return deltaIn / TRACKPAD_DELTA_PER_ZOOM;
            }
            const d2 = deltaIn / (MOUSE_PX_PER_ZOOM * 4);
            const d3 = 4 * Math.log(2 / (1 + Math.exp(-Math.abs(d2)))) / Math.LN2;
            return (deltaIn > 0 ? d3 : -d3);
        }

        function applyRealZoom(deltaIn, isTrackpad, mousePos) {
            const map = handler._map;
            if (!map || !deltaIn) return false;

            const zoom = map.getZoom();
            const zoomDelta = zoomDeltaFromInput(deltaIn, isTrackpad);
            const limited = map._limitZoom(zoom + zoomDelta) - zoom;
            if (!limited) return false;

            if (map.options.scrollWheelZoom === 'center' || !mousePos) {
                map.setZoom(zoom + limited, { animate: false });
            } else {
                map.setZoomAround(mousePos, zoom + limited, { animate: false });
            }
            return true;
        }

        // Cheap visual zoom: scale mapPane around cursor (no tile reload)
        function applyTrackpadPreview(g) {
            const map = handler._map;
            const pane = map.getPane('mapPane');
            const scale = map.getZoomScale(g.targetZoom, g.startZoom);
            // transform-origin 0,0 (Leaflet setTransform): keep origin fixed under cursor
            const newPos = g.origin.multiplyBy(1 - scale).add(g.panePos.multiplyBy(scale));
            L.DomUtil.setTransform(pane, newPos, scale);
        }

        // JS can't rebuild DOM layers in true parallel; stage work so the UI stays responsive:
        // 1) detach heavy vectors  2) setZoom (tiles load async)  3) re-attach on idle
        function commitTrackpadGesture() {
            handler._gestureEndTimer = null;
            const g = handler._trackpadGesture;
            handler._trackpadGesture = null;
            handler._delta = 0;
            if (!g) return;

            const map = handler._map;
            const finalZoom = map._limitZoom(g.targetZoom);
            const origin = g.origin;
            const startZoom = g.startZoom;

            // Yield so the last preview frame paints and input isn't stuck behind a 1–2s sync rebuild
            requestAnimationFrame(function() {
                if (Math.abs(finalZoom - startZoom) < 1e-6) {
                    map.setZoom(startZoom, { animate: false });
                    return;
                }

                const hadBuildings = typeof buildingsLayer !== 'undefined'
                    && buildingsLayer
                    && map.hasLayer(buildingsLayer);
                const hadPolylines = [];
                if (typeof polylines !== 'undefined' && polylines) {
                    for (const routeName in polylines) {
                        const pl = polylines[routeName];
                        if (pl && map.hasLayer(pl)) {
                            hadPolylines.push(pl);
                            map.removeLayer(pl);
                        }
                    }
                }
                if (hadBuildings) {
                    map.removeLayer(buildingsLayer);
                }

                const prevPauseMarkers = typeof pauseUpdateMarkerPositions !== 'undefined'
                    ? pauseUpdateMarkerPositions
                    : false;
                if (typeof pauseUpdateMarkerPositions !== 'undefined') {
                    pauseUpdateMarkerPositions = true;
                }
                if (typeof cancelAllAnimations === 'function') {
                    cancelAllAnimations();
                }

                // Core zoom: markers + tiles only (tiles fetch in parallel over network)
                map.setZoomAround(origin, finalZoom, { animate: false });

                function restoreHeavyLayers() {
                    for (let i = 0; i < hadPolylines.length; i++) {
                        try { hadPolylines[i].addTo(map); } catch (_) {}
                    }
                    if (hadBuildings && buildingsLayer && !map.hasLayer(buildingsLayer)) {
                        try { buildingsLayer.addTo(map); } catch (_) {}
                    }
                    if (typeof pauseUpdateMarkerPositions !== 'undefined') {
                        pauseUpdateMarkerPositions = prevPauseMarkers;
                    }
                }

                // Let the browser paint the zoomed map, then restore heavy layers when idle
                requestAnimationFrame(function() {
                    if (typeof requestIdleCallback === 'function') {
                        requestIdleCallback(restoreHeavyLayers, { timeout: 400 });
                    } else {
                        setTimeout(restoreHeavyLayers, 0);
                    }
                });

                if (DEBUG_WHEEL) {
                    console.log('[wheel-zoom] commit trackpad (staged)', {
                        startZoom: startZoom,
                        finalZoom: finalZoom,
                        restoredPolylines: hadPolylines.length,
                        restoredBuildings: hadBuildings
                    });
                }
            });
        }

        function scheduleTrackpadCommit() {
            if (handler._gestureEndTimer != null) {
                clearTimeout(handler._gestureEndTimer);
            }
            handler._gestureEndTimer = setTimeout(commitTrackpadGesture, TRACKPAD_GESTURE_END_MS);
        }

        handler._onWheelScroll = function(e) {
            const rawAbs = Math.abs(e.deltaY);
            const isTrackpad = e.deltaMode === 0 && (e.ctrlKey || rawAbs < TRACKPAD_MAX_ABS_DELTA);
            this._isTrackpadGesture = isTrackpad;

            const leafletDelta = L.DomEvent.getWheelDelta(e);
            this._lastMousePos = this._map.mouseEventToContainerPoint(e);

            L.DomEvent.stop(e);

            if (isTrackpad) {
                clearTimeout(this._timer);
                this._timer = null;
                this._startTime = null;

                const map = this._map;
                if (!this._trackpadGesture) {
                    this._trackpadGesture = {
                        startZoom: map.getZoom(),
                        targetZoom: map.getZoom(),
                        origin: this._lastMousePos,
                        panePos: map._getMapPanePos()
                    };
                } else {
                    // Keep zoom focal point updating with cursor during pinch
                    this._trackpadGesture.origin = this._lastMousePos;
                }

                const g = this._trackpadGesture;
                g.targetZoom = map._limitZoom(
                    g.targetZoom + zoomDeltaFromInput(leafletDelta, true)
                );
                applyTrackpadPreview(g);
                scheduleTrackpadCommit();

                if (DEBUG_WHEEL) {
                    console.log('[wheel-zoom] preview', {
                        startZoom: g.startZoom,
                        targetZoom: g.targetZoom,
                        scale: map.getZoomScale(g.targetZoom, g.startZoom)
                    });
                }
            } else {
                // Mouse: end any in-progress trackpad preview first
                if (this._gestureEndTimer != null) {
                    clearTimeout(this._gestureEndTimer);
                    this._gestureEndTimer = null;
                }
                if (this._trackpadGesture) {
                    commitTrackpadGesture();
                }

                this._delta += leafletDelta;
                if (!this._startTime) {
                    this._startTime = +new Date();
                }
                const left = Math.max(MOUSE_DEBOUNCE_MS - (+new Date() - this._startTime), 0);
                clearTimeout(this._timer);
                this._timer = setTimeout(() => {
                    const deltaIn = this._delta;
                    this._delta = 0;
                    this._startTime = null;
                    this._timer = null;
                    applyRealZoom(deltaIn, false, this._lastMousePos);
                }, left);
            }
        };

        handler._performZoom = function() {
            if (this._trackpadGesture) {
                commitTrackpadGesture();
                return;
            }
            const deltaIn = this._delta;
            this._delta = 0;
            this._startTime = null;
            applyRealZoom(deltaIn, this._isTrackpadGesture, this._lastMousePos);
        };

        // If user starts dragging mid-preview, commit real zoom first
        map.on('movestart dragstart zoomstart touchstart', function() {
            window.isMapDragging = true;
            if (handler._trackpadGesture) {
                if (handler._gestureEndTimer != null) {
                    clearTimeout(handler._gestureEndTimer);
                    handler._gestureEndTimer = null;
                }
                commitTrackpadGesture();
            }
        });

        handler.enable();
    })();

    map.on('moveend dragend zoomend touchend', function() {
        window.isMapDragging = false;
        // Set max bounds after user finishes dragging after unfocusing on a bus
        if (shouldSetMaxBoundsAfterDrag) {
            if (!settings['toggle-bypass-max-distance']) {
                map.setMaxBounds(expandBounds(bounds[selectedCampus], 2));
            }
            shouldSetMaxBoundsAfterDrag = false; // Reset flag after use
        }
        try { requestOffScreenUpdate(); } catch (e) {}
    });

    try { if (typeof initLocationWatchForRiding === 'function') { initLocationWatchForRiding(); } } catch (e) {}
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

    sa_event('load', {
        'device_type': deviceType,
        'pwa': isPWA,
        'ny_time': nyTime,
        'date': new Date()
    });
}

callPostLoadEvent();

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
    const isSettingsOpen = $('.settings-panel').is(':visible');
    const $settingsInput = $('#settings-search-input');

    if (isSettingsOpen) {
        const isControlK = (e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K');
        const isSlash = e.key === '/';
        const isInputFocused = $settingsInput.is(':focus');
        const isOtherInputFocused = $(e.target).is('input, textarea');

        if ((isControlK || isSlash) && !isInputFocused && !isOtherInputFocused) {
            e.preventDefault();
            $settingsInput.focus().select();
            return;
        }
    }

    if (e.key === 'Escape') {
        hideInfoBoxes();
        $('.settings-panel').fadeOut('fast');
        $('.bottom').fadeIn('fast'); // this is being hidden due to settings-btn click?... Why tho
        if (typeof detachSettingsViewportListeners === 'function') {
            detachSettingsViewportListeners();
        }
        $('.settings-floating-bar').hide();
        stopStatusUpdates();

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
        $('.bus-info-popup, .stop-info-popup, .bus-stopped-for, .my-location-popup, .building-info-popup').hide();
        closeSearch();
    } else {
        $('.bus-info-popup, .stop-info-popup, .bus-stopped-for, .my-location-popup, .building-info-popup').fadeOut();
        closeSearch();
    }
    
    // Hide the out of service hide button when closing popups
    $('.stop-info-hide-oos').hide();
    $('.search-results').empty().hide();

    if (popupStopId) {
        // Handle icon changes for rider app style mode
        if (appStyle === 'rider') {
            // Change selected stop icon back to rider-stop-marker and restore original size
            $(`img[stop-marker-id="${popupStopId}"]`).attr('src', 'img/rider/rider-stop-marker.png');
            $(`img[stop-marker-id="${popupStopId}"]`).attr('width', '15');
            $(`img[stop-marker-id="${popupStopId}"]`).attr('height', '15');
        } else {
            $(`img[stop-marker-id="${popupStopId}"]`).attr('src', 'img/stop_marker.png')
        }
        
        busStopMarkers[popupStopId].setZIndexOffset(settings['toggle-stops-above-buses'] ? 1000 : 0);

        popupStopId = null;
        thisClosestStopId = null;

        // Restore all route selectors when stop is deselected
        populateRouteSelectors(activeRoutes);
        
        $('.settings-btn').show();

        checkMinRoutes(); // because .knight-mover is hidden in popStopInfo()
    }

    if (popupBusName) {
        stopOvertimeCounter();
        const busIdThatWasFocused = popupBusName;
        popupBusName = null;
        $('.info-shared-bus-mid').hide();
        // $('.time, .overtime-time').text(''); // optional <- nvm, the wrapper fades out so by hiding this changes div size while still fading out.

        // Remove distance line when bus is unfocused
        removeDistanceLineOnFocus();

        // If we just unfocused a bus, check if its route has no in-service buses and prune polyline if needed
        if (busData[busIdThatWasFocused]) {
            const route = busData[busIdThatWasFocused].route;
            const noInService = !routeHasInServiceBuses(route);
            if (noInService && polylines[route]) {
                logPolylineRemoval(route, 'hideInfoBoxes');
                try { polylines[route].remove(); } catch (e) {}
                delete polylines[route];
                // Recompute global polyline bounds via shared helper
                updatePolylineBoundsIfNeeded();
            }
        }
    }

    if (popupBuildingName) {
        popupBuildingName = null;
        popupBuildingLatLng = null;
        unhighlightBuilding();
		checkMinRoutes(); // reshow knight mover if needed after closing building info
    }

    if (sourceBusName) {
        $('.stop-info-back').fadeOut(); 
        sourceBusName = null;
    }

    if (sourceStopId) {
        $('.bus-info-back').fadeOut(); 
        sourceStopId = null;
    }

    if (selectedMarkerId && busMarkers[selectedMarkerId]) {
        const rotationElement = getMarkerRotationElement(busMarkers[selectedMarkerId]);
        if (rotationElement) {
            rotationElement.style.boxShadow = '';
        }
    }
    selectedMarkerId = null;

    if ($('.buses-panel-wrapper').is(':visible')) {
        $('.buses-panel-wrapper').slideUp('fast');
    }

    try { updateRidingBadgeUI(); } catch (_) {}

    // checkMinRoutes(); // to reshow knight mover if hidden; so far only hidden by search wrapper opening // find a better way to reshow. having this here causes a run on each drag.

}

// Global flag to track when panout feedback should be active
let panoutFeedbackActive = false;
let panoutDragHandler = null;

function clearPanoutFeedback() {
    if (panoutFeedbackActive) {
        const $btn = $('.panout');
        $btn.removeClass('btn-feedback-active');

        // Remove drag handler if it exists
        if (panoutDragHandler) {
            map.off('dragstart', panoutDragHandler);
            panoutDragHandler = null;
        }

        panoutFeedbackActive = false;
    }

    // Also clear other location button feedbacks when map moves
    clearCentermeFeedback();
    clearFlyToClosestStopFeedback();

    // Also clear fly-to-closest-stop feedback if operation is complete
    const $flyBtn = $('.fly-closest-stop');
    const hasClass = $flyBtn.hasClass('btn-feedback-active');
    const inProgress = $flyBtn.data('fly-to-closest-stop-in-progress');

    if (hasClass && !inProgress) {
        $flyBtn.removeClass('btn-feedback-active');
    }
}

function clearCentermeFeedback(force = false) {
    const $btn = $('.centerme');
    // Clear centerme feedback if we have the class and either we're not in progress OR we're forcing the clear
    if ($btn.hasClass('btn-feedback-active') && (force || (!$btn.data('location-requesting') && !$btn.data('centerme-in-progress')))) {
        $btn.removeClass('btn-feedback-active');
        // If forcing, also clear the in-progress flags
        if (force) {
            $btn.removeData('location-requesting');
            $btn.removeData('centerme-in-progress');
        }
    }
}

function clearFlyToClosestStopFeedback(force = false) {
    const $btn = $('.fly-closest-stop');
    const hasClass = $btn.hasClass('btn-feedback-active');
    const inProgress = $btn.data('fly-to-closest-stop-in-progress');

    // Clear feedback if we have the class and either we're not in progress OR we're forcing the clear
    if (hasClass && (force || !inProgress)) {
        $btn.removeClass('btn-feedback-active');
        // If forcing, also clear the in-progress flag
        if (force) {
            $btn.removeData('fly-to-closest-stop-in-progress');
        }
    }
}

function panout() {
    // Clear any existing panout feedback
    clearPanoutFeedback();
    // Clear other location button backgrounds (force clear to override in-progress states)
    clearCentermeFeedback(true);
    clearFlyToClosestStopFeedback(true);

    // Apply feedback state immediately
    $('.panout').addClass('btn-feedback-active');
    panoutFeedbackActive = true;
    
    // Set up drag handler to detect manual user dragging
    panoutDragHandler = () => {
        clearPanoutFeedback();
    };
    
    // Set up drag handler immediately - it won't interfere with fitBounds
    map.on('dragstart', panoutDragHandler);

    sa_event('btn_press', {
        'btn': 'panout'
    });

    $('[stop-eta]').text('').hide();
    savedCenter = null;
    savedView = null;
    returningToSavedView = false; // not sure if I need this, this will be so hard to trigger within 88ms. drag and then panout...

    // Check if parking permit mode is active
    if ($('body').hasClass('parking-permit-mode')) {
        // Fit map to show all currently visible parking lots
        fitMapToParkingLots();
        return;
    }

    if (shownRoute) {
        map.fitBounds(routeBounds[shownRoute]);
    } else {
        map.fitBounds(polylineBounds);
    }

    hideInfoBoxes();

    if (shownRoute) {
        updateTooltips(shownRoute);
    } else {
        showAllBuses();
        showAllPolylines();
        showAllStops();
    }

    

}

// Map tile style for a UI theme. Light-family themes share streets tiles;
// dark-family themes share dark tiles. UI chrome is handled purely by CSS vars.
function resolveMapTileStyle(theme) {
    if (theme === 'light' || theme === 'beige-coffee' || theme === 'coffee') {
        return 'streets-v11';
    }
    return 'dark-v11';
}

// Apply theme CSS immediately; only touch the tile layer when the map style
// family actually changes. Avoids pan/zoom hacks that rebuild polylines & markers.
function changeMapStyle(newStyle) {
    console.log('changeMapStyle', newStyle);

    document.documentElement.setAttribute('theme', newStyle);

    // Bus marker inner colors use --theme-bus-icon-inner and update via CSS alone.
    // Polylines/stop markers are theme-independent and must not be rebuilt.

    // Satellite mode owns its own tiles
    if (currentTileLayerType === 'satellite' || !tileLayer || !map) {
        return;
    }

    const mapStyle = resolveMapTileStyle(newStyle);
    const newUrl = `https://tiles.rubus.live/styles/v1/${mapStyle}/tiles/{z}/{x}/{y}.png`;

    // setUrl already redraws tiles when the URL changes and is a no-op otherwise.
    // Do NOT setView to world origin — that forces every polyline/marker to rebuild.
    if (tileLayer._url !== newUrl) {
        tileLayer.setUrl(newUrl);
    }
    // Note: changeMapStyle only swaps light/dark streets variants; currentTileLayerType stays 'streets'
}

let userPosition;

function centerme() {
    const $btn = $('.centerme');
    
    // Prevent multiple simultaneous location requests
    if ($btn.data('location-requesting')) {
        return;
    }
    
    // Check if we're already at user location and haven't moved since
    if (userPosition && $btn.hasClass('btn-feedback-active')) {
        // Check if we're still at the same location
        const currentCenter = map.getCenter();
        const userLatLng = L.latLng(userPosition);
        const distance = currentCenter.distanceTo(userLatLng);
        
        // If we're still at the user location, don't allow another press
        if (distance < 1) { // Very small threshold just to prevent exact duplicate presses
            return;
        }
    }
    
    // Clear any existing timeout and restore state
    if ($btn.data('feedback-timeout')) {
        clearTimeout($btn.data('feedback-timeout'));
        $btn.removeData('feedback-timeout');
    }
    
    // Mark that centerme is in progress to prevent clearing feedback during operation
    $btn.data('centerme-in-progress', true);
    
    // Apply feedback state immediately and keep it active until map moves
    $btn.addClass('btn-feedback-active');

    // Set up immediate drag handler to clear feedback if user interrupts animation
    const immediateCentermeDragHandler = () => {
        $btn.removeClass('btn-feedback-active');
        $btn.removeData('centerme-in-progress');
        map.off('dragstart', immediateCentermeDragHandler);
    };
    map.on('dragstart', immediateCentermeDragHandler);

    if (userPosition) {
        // User position already available - fly to location and keep background active
        map.flyTo(userPosition, 18, {
            animate: true,
            duration: 0.3
        });
        hideInfoBoxes(true);
        $('.my-location-popup').show();

        // Clear other location button backgrounds since we're flying to location (force clear to override in-progress states)
        clearPanoutFeedback();
        clearFlyToClosestStopFeedback(true);
        
        // Set up centerme feedback clearing after flyTo animation completes
        const onFlyToComplete = () => {
            // Mark centerme as no longer in progress
            $btn.removeData('centerme-in-progress');
            // Set up drag handler to clear centerme feedback when user manually moves map
            // (only if the immediate handler hasn't already been triggered)
            if ($btn.hasClass('btn-feedback-active')) {
                const centermeDragHandler = () => {
                    clearCentermeFeedback();
                    map.off('dragstart', centermeDragHandler);
                };
                map.on('dragstart', centermeDragHandler);
            }
        };

        // Listen for moveend to know when flyTo animation is complete
        const moveEndHandler = () => {
            map.off('moveend', moveEndHandler);
            onFlyToComplete();
        };
        map.on('moveend', moveEndHandler);
        
        return;
    }

    if (navigator.geolocation) {
        // Mark that we're requesting location
        $btn.data('location-requesting', true);
        
        // Switch from static feedback to pulse animation
        $btn.removeClass('btn-feedback-active').addClass('btn-pulse');

        console.log("Trying to get location...")
        $('.getting-location-popup').fadeIn(300);

        navigator.geolocation.getCurrentPosition((position) => {
            // Location request succeeded - remove feedback state
            $btn.removeClass('btn-pulse');
            $btn.removeData('location-requesting');
            
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
                sourceBusName = null;
            })

            // Check distance before flying and showing nearest stop button
            const closestStop = findClosestStop(userLat, userLong);
            const closestDistance = closestStop.distance / 1000 * 0.621371; // Convert meters to miles
            
            if (closestDistance < maxDistanceMiles || settings['toggle-bypass-max-distance']) {
                // Only fly to location if within distance limit
                map.flyTo(userPosition, 18, {
                    animate: true,
                    duration: 0.3
                });

                // Clear panout background since we're flying to location
                clearPanoutFeedback();

                // Set up centerme feedback clearing after flyTo animation completes
                const onFlyToComplete = () => {
                    // Mark centerme as no longer in progress
                    $btn.removeData('centerme-in-progress');
                    // Set up drag handler to clear centerme feedback when user manually moves map
                    // (only if the immediate handler hasn't already been triggered)
                    if ($btn.hasClass('btn-feedback-active')) {
                        const centermeDragHandler = () => {
                            clearCentermeFeedback();
                            map.off('dragstart', centermeDragHandler);
                        };
                        map.on('dragstart', centermeDragHandler);
                    }
                };

                // Listen for moveend to know when flyTo animation is complete
                const moveEndHandler = () => {
                    map.off('moveend', moveEndHandler);
                    onFlyToComplete();
                };
                map.on('moveend', moveEndHandler);

                $('.fly-closest-stop-wrapper').show();
            }

            hideInfoBoxes();

            if(!locationShared) {
                localStorage.setItem('locationShared', true);
                locationShared = true;
            }

            findNearestStop(false);

        }, (error) => {
            // Location request failed - remove feedback state
            $btn.removeClass('btn-pulse');
            $btn.removeData('location-requesting');
            
            console.error('Error getting user location:', error);
            $('.getting-location-popup').slideUp();
        }, {
            enableHighAccuracy: true,
        });
    } else {
        // Geolocation not supported - remove feedback state
        $btn.removeClass('btn-feedback-active');
        console.error('Geolocation is not supported by this browser.');
    }

    sa_event('btn_press', {
        'btn': 'centerme'
    });
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
async function calculateSpeed(busName) {

    const currentLatitude = busData[busName].lat;
    const currentLongitude = busData[busName].long;
    const currentTime = new Date().getTime() / 1000;  // Time in seconds

    // Check if we have previous data for this bus
    if (!busData[busName].previousLatitude) {
        // Initialize previous data for this bus
        busData[busName].previousLatitude = currentLatitude;
        busData[busName].previousLongitude = currentLongitude;
        busData[busName].previousSpeedTime = currentTime
        return null;
    }

    const previousData = busData[busName];
    const distance = haversine(previousData.previousLatitude, previousData.previousLongitude, currentLatitude, currentLongitude);

    // Calculate time diff and guard against background-resume gaps or clock anomalies
    const timeDiffSeconds = (currentTime - previousData.previousSpeedTime);
    if (timeDiffSeconds <= 0 || timeDiffSeconds > 30) {
        // Reset baseline on invalid/large gaps to avoid unrealistic speeds when resuming
        busData[busName].previousLatitude = currentLatitude;
        busData[busName].previousLongitude = currentLongitude;
        busData[busName].previousSpeedTime = currentTime;
        delete busData[busName].lastRawSpeed;
        delete busData[busName].recentRawSpeeds;
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
        busData[busName].previousLatitude = currentLatitude;
        busData[busName].previousLongitude = currentLongitude;
        busData[busName].previousSpeedTime = currentTime;
        delete busData[busName].lastRawSpeed;
        delete busData[busName].recentRawSpeeds;
        if (busData[busName].visualSpeed !== undefined && busData[busName].visualSpeed > MAX_REASONABLE_SPEED) {
            busData[busName].visualSpeed = MAX_REASONABLE_SPEED;
        }
        return null;
    }

    // Maintain a short rolling window of recent raw speeds for robust smoothing
    if (!Array.isArray(busData[busName].recentRawSpeeds)) {
        busData[busName].recentRawSpeeds = [];
    }
    busData[busName].recentRawSpeeds.push(rawSpeed);
    if (busData[busName].recentRawSpeeds.length > 5) {
        busData[busName].recentRawSpeeds.shift();
    }

    // Rolling median to reduce effect of outliers
    const medianOf = (arr) => {
        const sorted = [...arr].sort((a,b) => a-b);
        const mid = Math.floor(sorted.length/2);
        return sorted.length % 2 ? sorted[mid] : (sorted[mid-1] + sorted[mid]) / 2;
    };
    const smoothedSpeed = medianOf(busData[busName].recentRawSpeeds);

    // Enforce post-smoothing cap and step-rate limit
    let baselineSpeed = ('speed' in busData[busName]) ? (busData[busName].speed || 0) : 0;
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
    //     busData[busName].previousLatitude = currentLatitude;
    //     busData[busName].previousLongitude = currentLongitude;
    //     busData[busName].previousSpeedTime = currentTime;
    //     return null;
    // }

    if (!('visualSpeed' in busData[busName])) {
        busData[busName].speed = acceptedSpeed;
        busData[busName].visualSpeed = acceptedSpeed;
        if (popupBusName === busName && showBusSpeeds) {
            console.log(busName + ' New Speed: ' + busData[busName].visualSpeed.toFixed(2))
            $('.info-speed-mid').text(Math.round(busData[busName].visualSpeed));
            $('.info-mph-mid').text('mph');
            $('.info-speed-wrapper').css('visibility', 'visible');
        }
        busData[busName].previousLatitude = currentLatitude;
        busData[busName].previousLongitude = currentLongitude;
        busData[busName].previousSpeedTime = currentTime;
        return
    }

    const currentVisualSpeed = busData[busName].visualSpeed;  // Use 0 if speed is not set
    const speedDiff = acceptedSpeed - currentVisualSpeed;
    // if (speedDiff < 1) return
    
    let totalUpdateSeconds = 7;
    if (acceptedSpeed < 10) {
        totalUpdateSeconds = 3; //decelerate faster
    }
    
    const denom = Math.max(Math.abs(speedDiff), 0.01);
    const updateIntervalMs = Math.min(2000, Math.max(50, (totalUpdateSeconds*1000) / denom));

    // if (popupBusName === busName) {
    //     console.log("speedDiff: ", speedDiff);
    //     console.log("updateIntervalMs: ", updateIntervalMs)
    // }

    // console.log(updateIntervalMs)

    const speedChangeDir = speedDiff > 0 ? 1 : -1;

    clearInterval(speedTimeout[busName]);

    // Set initial speed before starting the interval
    busData[busName].speed = acceptedSpeed;
    busData[busName].visualSpeed = currentVisualSpeed

    let elapsedMs = 0;
    speedTimeout[busName] = setInterval(() => {

        if (!busData[busName]) { // handle out of service
            clearInterval(speedTimeout[busName]);
            return;
        }

        busData[busName].visualSpeed += speedChangeDir;
        if (busData[busName].visualSpeed < 0) {
            busData[busName].visualSpeed = 0;
        }

        elapsedMs += updateIntervalMs;
        
        if (popupBusName === busName && showBusSpeeds) {
            // console.log(busName + ' New Speed: ' + busData[busName].visualSpeed.toFixed(2))
            $('.info-speed-mid').text(Math.round(busData[busName].visualSpeed));
            $('.info-mph-mid').text('mph');
            $('.info-speed-wrapper').css('visibility', 'visible');
        }

        if (panelRoute === busData[busName].route) {
            $(`.route-bus-speed[bus-name="${busName}"]`).text(parseInt(busData[busName].visualSpeed) + 'mph | ' + busData[busName].capacity + '% full')
        }
        
        if (elapsedMs >= totalUpdateSeconds*1000) {
            clearInterval(speedTimeout[busName]);
        }
    }, updateIntervalMs); // Convert seconds to milliseconds


    // Update the previous data for this bus
    busData[busName].previousLatitude = currentLatitude;
    busData[busName].previousLongitude = currentLongitude;
    if (distance > 0.002) {
        busData[busName].previousSpeedTime = currentTime;
    }
    // busData[busName].secondsDiff = currentTime - previousData.previousTime;

}

let busRotationPoints = {}

const calculateRotation = (busName, loc) => {
    let newRotation;
    if (!pauseRotationUpdating) {
        const currentStopId = busData[busName].stopId;

        if (!stopLines[currentStopId]) {
            return busData[busName].rotation + 45;
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
    
        if (busRotationPoints[busName]) {
            ['pt1', 'pt2', 'line'].forEach(val => {
                busRotationPoints[busName][val].remove();
            })
        }
        
            busRotationPoints[busName] = {}
            
            // Add markers for the points
            busRotationPoints[busName]['pt1'] = L.circleMarker(pt1, {
                radius: 6,
                fillColor: "red",
                color: "#000",
                weight: 0,
                opacity: 1,
                fillOpacity: settings['toggle-show-rotation-points'] ? 1 : 0
            }).addTo(map);
            
            busRotationPoints[busName]['pt2'] = L.circleMarker(pt2, {
                radius: 6,
                fillColor: "blue",
                color: "#000",
                weight: 0,
                opacity: 1,
                fillOpacity: settings['toggle-show-rotation-points'] ? 1 : 0
            }).addTo(map);

            // Add green line between the points
            busRotationPoints[busName]['line'] = L.polyline([pt1, pt2], {
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
            // console.log(`New rotation for bus: ${busData[busName].busName}: ${newRotation}`)
        } else {
            newRotation = busData[busName].rotation + 45;
        }
    return newRotation;
};


const animationFrames = {}
let pauseRotationUpdating = false;
let wholePixelPositioning = false;

let busLines = {}
let midpointCircle = {}


// Helper function to get the rotation element for any marker type (cached for high performance)
function getMarkerRotationElement(marker) {
    if (!marker) return null;
    if (marker._rotationElement) return marker._rotationElement;
    const el = marker.getElement ? marker.getElement() : null;
    if (!el) return null;
    const rotEl = el.querySelector('.bus-icon-outer') ||
                  el.querySelector('.passio-marker') ||
                  el.querySelector('.rider-marker') ||
                  el.querySelector('.duck-marker');
    if (rotEl) marker._rotationElement = rotEl;
    return rotEl;
}

// Cache for colored SVG data URLs
const svgCache = {};

// Function to update existing Passio markers for a specific route when color changes
function updateExistingPassioMarkersForRoute(route) {
    const newColor = colorMappings[route];
    
    // Find all buses for this route and update their markers
    for (const busName in busMarkers) {
        if (busData[busName] && busData[busName].route === route) {
            const marker = busMarkers[busName];
            const markerElement = marker.getElement();
            
            // Update the arrow-in background color
            const arrowIn = markerElement.querySelector('.passio-marker-arrow-in');
            if (arrowIn) {
                arrowIn.style.backgroundColor = newColor;
            }
            
            // Update the circle border color
            const circle = markerElement.querySelector('.passio-marker-circle');
            if (circle) {
                circle.style.borderColor = newColor;
            }
            
            // Update the SVG image with new colored version
            const busIcon = markerElement.querySelector('.passio-bus-icon');
            if (busIcon && svgCache[newColor]) {
                busIcon.src = svgCache[newColor];
            }
        }
    }
}

// Function to generate a colored SVG data URL from the passio-bus.svg file (synchronous after pre-generation)
function generateColoredSvg(color) {
    // Return cached version if it exists
    if (svgCache[color]) {
        return svgCache[color];
    }
    
    // Fallback to original SVG if not cached
    return 'img/passio-bus.svg';
}

// Pre-generate all colored SVGs on startup
async function preGenerateColoredSvgs() {
    const colors = [...new Set(Object.values(colorMappings))];
    
    for (const color of colors) {
        try {
            await generateColoredSvgForColor(color);
        } catch (error) {
            console.error(`Failed to pre-generate SVG for color ${color}:`, error);
        }
    }
}

// Internal function to generate and cache a single colored SVG
async function generateColoredSvgForColor(color) {
    const response = await fetch('img/passio-bus.svg');
    const svgContent = await response.text();
    
    // Parse the SVG
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgContent, 'image/svg+xml');
    const svgElement = svgDoc.documentElement;
    
    // Modify the SVG to use the specified color
    // Look for fill attributes or add them to paths
    const paths = svgElement.querySelectorAll('path');
    paths.forEach(path => {
        if (!path.getAttribute('fill') || path.getAttribute('fill') !== 'none') {
            path.setAttribute('fill', color);
        }
    });
    
    // Also check for other elements that might have colors
    const elements = svgElement.querySelectorAll('*');
    elements.forEach(element => {
        if (element.tagName !== 'svg' && (!element.getAttribute('fill') || element.getAttribute('fill') !== 'none')) {
            element.setAttribute('fill', color);
        }
    });
    
    // Serialize back to string
    const serializer = new XMLSerializer();
    const modifiedSvgContent = serializer.serializeToString(svgElement);
    
    // Create blob URL
    const blob = new Blob([modifiedSvgContent], { type: 'image/svg+xml' });
    const svgUrl = URL.createObjectURL(blob);
    
    // Cache the result
    svgCache[color] = svgUrl;
}

// Function to generate a route-colored Passio marker SVG (cached and synchronous after pre-generation)

const updateMarkerPosition = (busName, immediatelyUpdate) => {
    const loc = {lat: busData[busName].lat, long: busData[busName].long};
    const marker = busMarkers[busName];

    // Cancel any existing animations for this bus
    if (animationFrames[busName]) {
        cancelAnimationFrame(animationFrames[busName]);
        delete animationFrames[busName];
    }

    // Get current position
    const startLatLng = marker.getLatLng();
    const endLatLng = L.latLng(loc.lat, loc.long);
    
    let prevLatLng;
    try {
        if (busData[busName].previousPositions.length >= 3) {
            prevLatLng = {
                lat: busData[busName].previousPositions[busData[busName].previousPositions.length - 3][0], 
                lng: busData[busName].previousPositions[busData[busName].previousPositions.length - 3][1]
            };
        }
    } catch (error) {
        console.log(error);
        console.log(busData[busName].previousPositions);
        console.log(busData[busName]);
    }

    const positioningOption = settings['bus-positioning'];
    const showPath = settings['toggle-show-bus-path'];

    // Always maintain the data structure regardless of display setting
    if (busLines[busName]) {
        if (busLines[busName]['prev'] && busLines[busName]['prev'].removeFrom) {
            busLines[busName]['prev'].removeFrom(map);
        }
        if (busLines[busName]['curve'] && busLines[busName]['curve'].removeFrom) {
            busLines[busName]['curve'].removeFrom(map);
        }
        if (busLines[busName]['join'] && busLines[busName]['join'].removeFrom) {
            busLines[busName]['join'].removeFrom(map);
            delete busLines[busName]['join'];
        }
    } else {
        busLines[busName] = {};
    }

    // Handle current path line
    const prevPathEndpoint = busLines[busName]['curr'] ? busLines[busName]['curr']._latlngs[1] : startLatLng;
    if (busLines[busName]['curr'] && busLines[busName]['curr'].removeFrom) {
        busLines[busName]['curr'].removeFrom(map);
    }
    
    // Store previous path data
    if (busLines[busName]['curr'] && busLines[busName]['curr']._latlngs) {
        busLines[busName]['prev'] = busLines[busName]['curr']._latlngs;
    }

    // Always update the current line data
    busLines[busName]['curr'] = {
        _latlngs: [prevPathEndpoint, endLatLng]
    };

	// Prepare two-segment path: current -> previous target -> new target
	let previousTargetLatLng = prevPathEndpoint;
	if (previousTargetLatLng && previousTargetLatLng.lat !== undefined && previousTargetLatLng.lng !== undefined) {
		previousTargetLatLng = L.latLng(previousTargetLatLng.lat, previousTargetLatLng.lng);
	}
	const distanceToPreviousTarget = previousTargetLatLng && startLatLng.distanceTo ? startLatLng.distanceTo(previousTargetLatLng) : 0;
	const distanceFromPreviousToEnd = previousTargetLatLng && previousTargetLatLng.distanceTo ? previousTargetLatLng.distanceTo(endLatLng) : 0;
	const totalPathDistance = distanceToPreviousTarget + distanceFromPreviousToEnd;
	const useTwoSegmentPath = previousTargetLatLng && totalPathDistance > 0 && distanceToPreviousTarget > 1;

    // Only display the lines if showPath is true
    if (showPath) {
        // If we're mid-animation, render a temporary join segment from the current
        // marker position to the previous path endpoint so the first leg is visible
        try {
            if (prevPathEndpoint && startLatLng && typeof startLatLng.distanceTo === 'function') {
                const needJoin = startLatLng.distanceTo(L.latLng(prevPathEndpoint.lat, prevPathEndpoint.lng)) > 0.5;
                if (needJoin) {
                    const joinLine = L.polyline([startLatLng, prevPathEndpoint], {color: '#888', weight: 3, dashArray: '4,6'}).addTo(map);
                    busLines[busName]['join'] = joinLine;
                }
            }
        } catch (e) {}

        // Display previous line (red)
        if (busLines[busName]['prev']) {
            const prevLine = L.polyline(busLines[busName]['prev'], {color: 'red', weight: 4}).addTo(map);
            busLines[busName]['prev'] = prevLine;
        }
        
        // Display current line (blue)
        const currLine = L.polyline(busLines[busName]['curr']._latlngs, {color: 'blue', weight: 4}).addTo(map);
        busLines[busName]['curr'] = currLine;
    }

    // Add Bézier curve only if positioning option is 'bezier'
    if (prevLatLng && positioningOption === 'bezier') {
        // Define the mid-arc join waypoint (where red/blue connect)
        const joinWaypointLatLng = {
            lat: busLines[busName]['curr']._latlngs[0].lat,
            lng: busLines[busName]['curr']._latlngs[0].lng
        };
        
        // Quadratic control point chosen so the curve passes through joinWaypoint at t=0.5
        const bezierControlLatLng = {
            lat: 2 * joinWaypointLatLng.lat - 0.5 * (prevLatLng.lat + endLatLng.lat),
            lng: 2 * joinWaypointLatLng.lng - 0.5 * (prevLatLng.lng + endLatLng.lng)
        };
        
        // Only display the curve if showPath is true
        if (showPath) {
            const path = L.curve(['M', [prevLatLng.lat, prevLatLng.lng],
                                'Q', [bezierControlLatLng.lat, bezierControlLatLng.lng],
                                    [endLatLng.lat, endLatLng.lng]],
                               {color: 'purple', weight: 5, opacity: 1}).addTo(map);
            busLines[busName]['curve'] = path;
            
            // Add a dot at the join waypoint
            if (midpointCircle[busName]) midpointCircle[busName].removeFrom(map);
            midpointCircle[busName] = L.circleMarker([busLines[busName]['curr']._latlngs[0].lat, busLines[busName]['curr']._latlngs[0].lng], {
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
            const newRotation = calculateRotation(busName, loc);
            const iconElement = getMarkerRotationElement(marker);
            if (iconElement && newRotation !== undefined) {
                iconElement.style.transform = `rotate(${newRotation}deg)`;
                
                // Counter-rotate the SVG image for Passio markers only
                if (settings['marker-type'] === 'passio') {
                    const busIcon = marker.getElement().querySelector('.passio-bus-icon');
                    const counterRotation = -newRotation;
                    busIcon.style.transform = `rotate(${counterRotation}deg)`;
                }
            }
        }

        // Clear two-segment path data to prevent stale path information from affecting future animations
        // After teleporting, we don't want to use old path endpoints for the next animation
        if (busLines[busName]) {
            // Get the marker's position after teleporting to ensure we use the correct current position
            const currentPosition = marker.getLatLng();
            // Reset current path to start fresh on next animation
            busLines[busName]['curr'] = {
                _latlngs: [currentPosition, currentPosition] // Set both points to current position after teleport
            };
            // Clear previous path data since we've teleported and old path is irrelevant
            delete busLines[busName]['prev'];
        }

        // Clear any stored animation durations so they don't carry over to the
        // next non-immediate update. This path returns early and never reaches the
        // duration-consumption code below, so stale values would otherwise persist.
        delete busData[busName].apiAnimationDuration;
        delete busData[busName].websocketAnimationDuration;
        delete busData[busName].overnightAnimationDuration;

        return; // Exit early - no animation needed
    }

    // Calculate animation duration (scaled for sim buses)
    const timeSinceLastUpdate = new Date().getTime() - busData[busName].previousTime;
    // Cap the maximum animation duration to prevent extremely long animations after app resume
    // uynsure if thi s does anything or is needed
    const cappedTimeSinceLastUpdate = Math.min(timeSinceLastUpdate, 30000); // Max 30 seconds

    // Use stored animation duration if available (for consistent timing across update sources)
    let duration;
    if (busData[busName].websocketAnimationDuration) {
        duration = busData[busName].websocketAnimationDuration;
        // Clear the stored duration after use
        delete busData[busName].websocketAnimationDuration;
        // console.log(`[Animation] Using WebSocket-calculated duration: ${Math.round(duration/1000)}s for bus ${busName}`);
    } else if (busData[busName].apiAnimationDuration) {
        duration = busData[busName].apiAnimationDuration;
        // Clear the stored duration after use
        delete busData[busName].apiAnimationDuration;
        // console.log(`[Animation] Using API-calculated duration: ${Math.round(duration/1000)}s for bus ${busName}`);
    } else if (busData[busName].overnightAnimationDuration) {
        duration = busData[busName].overnightAnimationDuration;
        // Clear the stored duration after use
        delete busData[busName].overnightAnimationDuration;
        // console.log(`[Animation] Using Overnight API-calculated duration: ${Math.round(duration/1000)}s for bus ${busName}`);
    } else {
        const baseDuration = cappedTimeSinceLastUpdate + 2500;
        duration = baseDuration;
    }
    try {
        if (window.sim === true && busData[busName] && busData[busName].type === 'sim') {
            const mult = Math.max(1, (window.SIM_TIME_MULTIPLIER || 1));
            duration = duration / mult;
        }
    } catch (e) {}
    const startTime = performance.now();

    const rotationElement = getMarkerRotationElement(marker);
    const startRotation = parseFloat(rotationElement.style.transform.replace('rotate(', '').replace('deg)', '') || '0');
    const endRotation = calculateRotation(busName, loc);

    const calculateBezierPoint = (t) => {
        if (!prevLatLng || positioningOption !== 'bezier') return null;
        
        // The join waypoint is the mid-curve constraint at t=0.5
        const joinWaypointLatLng = {
            lat: busLines[busName]['curr']._latlngs[0].lat,
            lng: busLines[busName]['curr']._latlngs[0].lng
        };
        
        const bezierControlLatLng = {
            lat: 2 * joinWaypointLatLng.lat - 0.5 * (prevLatLng.lat + endLatLng.lat),
            lng: 2 * joinWaypointLatLng.lng - 0.5 * (prevLatLng.lng + endLatLng.lng)
        };
        
        // This equals joinWaypointLatLng by construction; kept for clarity of intent
        const midCurvePointLatLng = {
            lat: 0.25 * prevLatLng.lat + 0.5 * bezierControlLatLng.lat + 0.25 * endLatLng.lat,
            lng: 0.25 * prevLatLng.lng + 0.5 * bezierControlLatLng.lng + 0.25 * endLatLng.lng
        };
        
        if (t <= 0.3) {
            const t1 = t / 0.3;
            return {
                lat: startLatLng.lat + (midCurvePointLatLng.lat - startLatLng.lat) * t1,
                lng: startLatLng.lng + (midCurvePointLatLng.lng - startLatLng.lng) * t1
            };
        } else {
            const t2 = (t - 0.3) / 0.7;
            const curveT = 0.5 + (t2 * 0.5);
            
            return {
                lat: (1 - curveT) ** 2 * prevLatLng.lat +
                    2 * (1 - curveT) * curveT * bezierControlLatLng.lat +
                    curveT ** 2 * endLatLng.lat,
                lng: (1 - curveT) ** 2 * prevLatLng.lng +
                    2 * (1 - curveT) * curveT * bezierControlLatLng.lng +
                    curveT ** 2 * endLatLng.lng
            };
        }
    };

    const animateMarker = (currentTime) => {
        // Skip this animation frame if busName has been removed from animationFrames
        if (!animationFrames[busName]) return;
        
        const elapsedTime = currentTime - startTime;
        const progress = Math.min(elapsedTime / duration, 1);

        // Check if the bus marker still exists
        if (!busMarkers[busName]) {
            // Bus went out of service, clean up the animation
            delete animationFrames[busName];
            return;
        }

		// Determine the current position (two-segment path: start -> previous target -> new target)
		let currentLatLng;
		const useTwoSegment = useTwoSegmentPath;
		if (useTwoSegment) {
			const distanceTraveled = totalPathDistance * progress;
			// Remove the temporary join line once we pass the connection point
			if (distanceTraveled > distanceToPreviousTarget && busLines[busName] && busLines[busName]['join'] && busLines[busName]['join'].removeFrom) {
				busLines[busName]['join'].removeFrom(map);
				delete busLines[busName]['join'];
			}
			if (distanceTraveled <= distanceToPreviousTarget) {
				// Segment 1: move from start to previous target (linear)
				const t1 = distanceToPreviousTarget === 0 ? 1 : (distanceTraveled / distanceToPreviousTarget);
				currentLatLng = L.latLng(
					startLatLng.lat + (previousTargetLatLng.lat - startLatLng.lat) * t1,
					startLatLng.lng + (previousTargetLatLng.lng - startLatLng.lng) * t1
				);
			} else {
				// Segment 2: move from previous target to new end
				const remaining = Math.max(0, distanceTraveled - distanceToPreviousTarget);
				const t2 = distanceFromPreviousToEnd === 0 ? 1 : (remaining / distanceFromPreviousToEnd);
				if (positioningOption === 'bezier' && prevLatLng) {
					// Map into the curve phase of the existing bezier helper
					const t = 0.3 + 0.7 * Math.min(1, Math.max(0, t2));
					const bezierPoint = calculateBezierPoint(t);
					if (bezierPoint) {
						currentLatLng = L.latLng(bezierPoint.lat, bezierPoint.lng);
					} else {
						currentLatLng = L.latLng(
							previousTargetLatLng.lat + (endLatLng.lat - previousTargetLatLng.lat) * t2,
							previousTargetLatLng.lng + (endLatLng.lng - previousTargetLatLng.lng) * t2
						);
					}
				} else {
					currentLatLng = L.latLng(
						previousTargetLatLng.lat + (endLatLng.lat - previousTargetLatLng.lat) * t2,
						previousTargetLatLng.lng + (endLatLng.lng - previousTargetLatLng.lng) * t2
					);
				}
			}
		} else {
			// Single segment fallback (original behavior)
			if (positioningOption === 'bezier' && prevLatLng) {
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
				currentLatLng = L.latLng(
					startLatLng.lat + (endLatLng.lat - startLatLng.lat) * progress,
					startLatLng.lng + (endLatLng.lng - startLatLng.lng) * progress
				);
			}
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
            const iconElement = getMarkerRotationElement(marker);
            if (iconElement) {
                iconElement.style.transform = `rotate(${currentRotation}deg)`;
                
                // Counter-rotate the SVG image for Passio markers only (cached element)
                if (settings['marker-type'] === 'passio') {
                    if (!marker._passioBusIcon && marker.getElement()) {
                        marker._passioBusIcon = marker.getElement().querySelector('.passio-bus-icon');
                    }
                    const busIcon = marker._passioBusIcon;
                    if (busIcon) {
                        const counterRotation = -currentRotation;
                        busIcon.style.transform = `rotate(${counterRotation}deg)`;
                    }
                }
            }
        }

        if (progress < 1) {
            // Only schedule next frame if we're still animating and this ID hasn't been replaced
            animationFrames[busName] = requestAnimationFrame(animateMarker);
        } else {
            // Animation complete, clean up
            delete animationFrames[busName];
        }
    };
    
    // Start the animation
    animationFrames[busName] = requestAnimationFrame(animateMarker);
};


// Allow sim to retime ongoing animations when speed multiplier changes
window.retimeSimAnimations = function() {
    try {
        if (window.sim !== true) return;
        for (const busName in busData) {
            const bus = busData[busName];
            if (!bus || bus.type !== 'sim') continue;
            if (!busMarkers[busName]) continue;
            // Restart animation from current position to current target with new duration scaling
            updateMarkerPosition(busName, false);
        }
    } catch (e) {}
};

let selectedMarkerId;
let pauseUpdateMarkerPositions = false;

function plotBus(busName, immediatelyUpdate=false) {
    const loc = {lat: busData[busName].lat, long: busData[busName].long};

    if (!busMarkers[busName]) {
        // Create a new bus marker if it doesn't exist
        const route = busData[busName].route;
        const markerType = settings?.['marker-type'] || 'rubus';

        if (markerType === 'passio') {
            // Create Passio HTML marker with route-based color
            const routeColor = colorMappings[route] || '#446bef';
            const currentSize = settings['marker-size'] || 'medium';
            const passioSizeClass = {
                'small': 'small-marker',
                'medium': 'medium-marker',
                'big': 'big-marker'
            }[currentSize];

            // Generate colored SVG data URL
            const coloredSvg = generateColoredSvg(routeColor);

            busMarkers[busName] = L.marker([loc.lat, loc.long], {
                icon: L.divIcon({
                    className: 'bus-icon',
                    iconSize: [30, 30],
                    iconAnchor: [15, 15],
                    html: `
                        <div class="bus-marker-wrapper">
                            <div class="passio-marker ${passioSizeClass}" style="will-change: transform;">
                                <div class="passio-marker-arrow-out">
                                    <div class="passio-marker-arrow-in" style="background-color: ${routeColor};"></div>
                                </div>
                                <div class="passio-marker-circle" style="border-color: ${routeColor};">
                                    <img src="${coloredSvg}" class="passio-bus-icon" style="width: 35%; height: 35%; object-fit: contain;">
                                </div>
                            </div>
                            <div class="bus-name-label none" bus-name="${busName}">${busData[busName].busName}</div>
                        </div>
                    `
                }),
                route: route,
                zIndexOffset: 500
            }).addTo(map);

            getMarkerRotationElement(busMarkers[busName]).style.transform = `rotate(${busData[busName].rotation + 45}deg)`;

            // Counter-rotate the SVG image to keep it at 0 degrees relative to viewport (Passio markers only)
            if (settings['marker-type'] === 'passio') {
                const busIcon = busMarkers[busName].getElement().querySelector('.passio-bus-icon');
                const counterRotation = -(busData[busName].rotation + 45);
                busIcon.style.transform = `rotate(${counterRotation}deg)`;
            }
        } else if (markerType === 'rider') {
            // Create Rider HTML marker with route-based color
            const routeColor = colorMappings[route] || '#446bef';
            const currentSize = settings['marker-size'] || 'medium';
            const riderSizeClass = {
                'small': 'small-marker',
                'medium': 'medium-marker',
                'big': 'big-marker'
            }[currentSize];

            busMarkers[busName] = L.marker([loc.lat, loc.long], {
                icon: L.divIcon({
                    className: 'bus-icon',
                    iconSize: [30, 30],
                    iconAnchor: [15, 15],
                    html: `
                        <div class="bus-marker-wrapper">
                            <div class="rider-marker ${riderSizeClass}" style="will-change: transform; background-color: ${routeColor};">
                                <i class="fa-solid fa-location-arrow-up" style="color: white;"></i>
                            </div>
                            <div class="bus-name-label none" bus-name="${busName}">${busData[busName].busName}</div>
                        </div>
                    `
                }),
                route: route,
                zIndexOffset: 500
            }).addTo(map);

            getMarkerRotationElement(busMarkers[busName]).style.transform = `rotate(${busData[busName].rotation + 45}deg)`;
        } else if (markerType === 'duck') {
            // Create Duck HTML marker with route-based color
            const routeColor = colorMappings[route] || '#446bef';
            const currentSize = settings['marker-size'] || 'medium';
            const duckSizeClass = {
                'small': 'small-marker',
                'medium': 'medium-marker',
                'big': 'big-marker'
            }[currentSize];

            busMarkers[busName] = L.marker([loc.lat, loc.long], {
                icon: L.divIcon({
                    className: 'bus-icon',
                    iconSize: [30, 30],
                    iconAnchor: [15, 15],
                    html: `
                        <div class="bus-marker-wrapper">
                            <div class="duck-marker ${duckSizeClass}" style="will-change: transform;">
                                <i class="fa-solid fa-duck" style="color: ${routeColor};"></i>
                            </div>
                            <div class="bus-name-label none" bus-name="${busName}">${busData[busName].busName}</div>
                        </div>
                    `
                }),
                route: route,
                zIndexOffset: 500
            }).addTo(map);

            getMarkerRotationElement(busMarkers[busName]).style.transform = `rotate(${busData[busName].rotation + 45}deg)`;
        } else {
            // Create RUBus div-based marker
            busMarkers[busName] = L.marker([loc.lat, loc.long], {
                icon: L.divIcon({
                    className: 'bus-icon',
                    iconSize: [30, 30],
                    iconAnchor: [15, 15],
                    html: `
                        <div class="bus-marker-wrapper">
                            <div class="bus-icon-outer" style="will-change: transform;">
                                <div class="bus-icon-inner"></div>
                            </div>
                            <div class="bus-name-label none" bus-name="${busName}">${busData[busName].busName}</div>
                        </div>
                    `
                }),
                route: route,
                zIndexOffset: 500
            }).addTo(map);

            getMarkerRotationElement(busMarkers[busName]).style.transform = `rotate(${busData[busName].rotation + 45}deg)`;
            busMarkers[busName].getElement().querySelector('.bus-icon-outer').style.backgroundColor = colorMappings[route];
        }

            // Setup marker (now synchronous for all marker types)
            try {
                if ((shownRoute && shownRoute !== busData[busName].route) || (settings['toggle-hide-other-routes'] && popupBusName && busData[popupBusName].route !== busData[busName].route) || popupBusName) {
                    busMarkers[busName].getElement().style.display = '';
                }
            } catch (error) {
                console.error('Error updating bus marker visibility:', error);
            }

            busMarkers[busName].on('click', function() {
                sourceStopId = null;
                sourceBusName = null;
                selectBusMarker(busName);
            });

            updateBusNameTooltips();

            // Update marker position after marker is created
            if (!pauseUpdateMarkerPositions) {
                updateMarkerPosition(busName, immediatelyUpdate || forceImmediateUpdate);
            }
    } else if (!pauseUpdateMarkerPositions) {
        // if (document.visibilityState === 'hidden') {
        //     immediatelyUpdate = true;
        //     // console.log('page hidden, updating immediately')
        // }
        updateMarkerPosition(busName, immediatelyUpdate || forceImmediateUpdate);
    }

    // Record last time a marker was updated/rendered
    try { lastUpdateTime = Date.now(); } catch (e) {}
    try { requestOffScreenUpdate(); } catch (e) {}
}

function selectBusMarker(busName) {

    popInfo(busName, true);
    // console.log(busName + ': ')
    // console.table(busData[busName])
    popupBusName = busName

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

    $('.bus-log-wrapper').hide();

    try { updateRidingBadgeUI(); } catch (_) {}
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
    'on1': '',
    'on2': '',
    'ftbl': 'Football',
    'wknd1': '',
    'wknd2': '',
    'all': '',
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
    'helix': '',
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

function popInfo(busName, resetCampusFontSize) {

    const data = busData[busName]
    let dataRoute = data.route

    if (!sim) {
        sa_event('bus_view_test', {
            'bus_id': busName,
            'route': data.route,
        });
        sa_event('view_bus', {
            'bus_id': busName,
            'route': data.route,
        });
    } else {
        sa_event('bus_view_test', {
            'route': 'sim-' + data.route,
        });
        sa_event('view_bus', {
            'route': 'sim-' + data.route,
        });
    }

    if (appStyle === 'rider') {
        popRiderInfo(busName);
        return;
    }

    $('.bus-ridership-wrapper').show();
    // Only destroy charts if showing a different bus
    if (currentRidershipChartBusId !== busName) {
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
    
    if (popupStopId) {
        if (appStyle === 'rider') {
            $(`img[stop-marker-id="${popupStopId}"]`).attr('src', 'img/rider/rider-stop-marker.png');
            $(`img[stop-marker-id="${popupStopId}"]`).attr('width', '15');
            $(`img[stop-marker-id="${popupStopId}"]`).attr('height', '15');
        } else {
            $(`img[stop-marker-id="${popupStopId}"]`).attr('src', 'img/stop_marker.png');
        }
        if (busStopMarkers[popupStopId]) {
            busStopMarkers[popupStopId].setZIndexOffset(settings['toggle-stops-above-buses'] ? 1000 : 0);
        }
        popupStopId = null;
        thisClosestStopId = null;
        $('.stop-info-popup').hide();
        $('.settings-btn').show();
        populateRouteSelectors(activeRoutes);
    }

    if (busData[busName]['overtime']) {
        $('.bus-stopped-for .stop-octagon').show();
        if (settings['toggle-show-bus-overtime-timer']) {
            startOvertimeCounter(busName);
        }
    } else {
        stopOvertimeCounter();
        $('.bus-stopped-for').hide();
        $('.stop-octagon, .overtime-time').hide();
    }

    let displayRoute;
    if (dataRoute === 'wknd1' || dataRoute === 'wknd2') {
        dataRoute = 'Weekend ' + dataRoute.slice(-1);
        displayRoute = dataRoute.charAt(0).toUpperCase() + dataRoute.slice(1).toLowerCase();
    } else if (dataRoute === 'on1' || dataRoute === 'on2') {
        dataRoute = 'Overnight ' + dataRoute.slice(-1);
        displayRoute = dataRoute;
    } else if (dataRoute === 'summer1' || dataRoute === 'summer2') {
        dataRoute = dataRoute.charAt(0).toUpperCase() + dataRoute.slice(1, -1) + ' ' + dataRoute.slice(-1);
        displayRoute = dataRoute;
    } else if (dataRoute === 'all') {
        displayRoute = 'All Campus';
    } else {
        displayRoute = dataRoute.toUpperCase();
    }
    $('.info-route-mid').text(displayRoute).parent().css('color', colorMappings[data.route])
    if (data.busName.slice(-1) === "E") {
        $('.info-bolt').show();
    } else {
        $('.info-bolt').hide();
    }
    
    let busNameElmText = data.busName
    
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
        $('.info-mph-mid').text('mph');
        $('.info-speed-wrapper').css('visibility', 'visible');
    } else {
        $('.info-speed-wrapper').css('visibility', 'hidden');
    }
    $('.info-name-mid').text(busNameElmText);
    $('.info-capacity-mid').html(' | <span class="info-capacity-val">' + data.capacity + '%</span> capacity');

    if (busData[busName].oos) {
        $('.bus-oos-mid').show();
    } else {
        $('.bus-oos-mid').hide();
    }

    if (busData[busName].atDepot) {
        $('.bus-depot-mid').show();
    } else {
        $('.bus-depot-mid').hide();
    }

    if (sharedBusName && sharedBusName === busName) {
        $('.info-shared-bus-mid').show();
    }

    if (joined_service[busName]) {
        const serviceDate = new Date(joined_service[busName]);
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
        const timeInServiceText = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

        $('.bus-joined-service').text('Joined service at ' + displayTime + ' (' + timeInServiceText + ' ago)');
    
    }

    $('.info-next-stops').show();
        
    $('.bus-data-extra').empty();
    let extraDataHtml = `<div class="center mb-0p5rem">Bus ID: ${busName}</div>`;
    for (const [key, value] of Object.entries(busData[busName])) {
        // Format all values including arrays
        if (value !== null) {
            let extraDataVal = value
            if (key === 'isKnown') {
                extraDataVal = value ? 'Yes' : 'No';
                extraDataHtml += `<div>${key}: <span style="opacity: 0.7; color: ${value ? '#4CAF50' : '#f44336'}">${extraDataVal}</span></div>`;
                const validityResult = getBusValidityInfo(busName);
                const validityText = validityResult.valid ? 'Yes' : `No (${validityResult.reason})`;
                extraDataHtml += `<div>isValid: <span style="opacity: 0.7; color: ${validityResult.valid ? '#4CAF50' : '#f44336'}">${validityText}</span></div>`;

                const distInfo = distanceFromLine(busName, true);
                const distText = distInfo.isOffLine ? `true (${distInfo.feet.toLocaleString()} ft away)` : 'false';
                extraDataHtml += `<div>distanceFromLine validity: <span style="opacity: 0.7; color: ${distInfo.isOffLine ? '#f44336' : '#4CAF50'}">${distText}</span></div>`;

                continue; // Skip processing isKnown again in the normal flow
            } else if (key === 'stopId') {
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
            } else if (key === 'route_change' && typeof value === 'object') {
                // Format route_change object to show readable information
                const routeChangeData = value;
                const oldRoute = routeChangeData.old_route || 'Unknown';
                const changeTime = routeChangeData.route_change_time ? 
                    new Date(routeChangeData.route_change_time).toLocaleString() : 'Unknown time';
                extraDataVal = `From: ${oldRoute} at ${changeTime}`;
            } else if (typeof value === 'object' && value !== null) {
                // For any other objects, display as JSON
                extraDataVal = JSON.stringify(value, null, 2);
            }
            extraDataHtml += `<div>${key}: <span style="opacity: 0.7">${extraDataVal}</span></div>`;
        }
    }
    $('.bus-data-extra').html(extraDataHtml);

    if ('at_stop' in busData[busName] && busData[busName].at_stop === true) {
        startStoppedForTimer(busName)
    } else {
        $('.bus-stopped-for').hide();
    }

    // console.log('data: ', data)
    // console.log('next_stop' in data)

    $('.next-stop-circle').remove(); // remaining .next-stop-circles rom rote menu messes this up

    if ('next_stop' in data && busETAs[busName] && !busData[busName].atDepot) { // Hide next stops when bus is at depot
        $('.next-stops-grid > div').empty();
        
        // Track whether we should show the closest stop section
        const shouldShowClosestStop = closestStopId && routesServicing(closestStopId).includes(data.route) && 
            (userPosition ? (closestDistance < maxDistanceMiles || settings['toggle-bypass-max-distance']) : true);
        
        if (shouldShowClosestStop) {
            const $circle = $('<div class="closest-stop-circle closest-stop-bg" style="margin-right: 1rem;"></div>').css('background-color', colorMappings[data.route])
            $('.next-stops-grid > div').append($(`<div class="flex justify-center align-center closest-stop-bg h-100" style="margin-right: -2rem; margin-left: -1rem; border-radius: 0.8rem 0 0 0.8rem;"></div>`).append($circle))
            $('.next-stops-grid > div').append($(`<div class="flex flex-col pointer closest-stop-bg" style="margin-right: -2rem; padding: 1rem 0;">
                <div class="next-stop-closest closest-stop">Closest Stop</div>
                <div class="next-stop-name flex">${stopsData[closestStopId].name}</div>
            </div>`).click(() => {
                flyToStop(closestStopId, true); // true indicates user interaction
            }));
            $('.next-stops-grid > div').append($(`<div class="flex flex-col center pointer closest-stop-bg h-100 justify-center" style="margin-right: -1rem; border-radius: 0 0.8rem 0.8rem 0; padding-right: 1rem;">
                <div class="next-stop-eta closest-stop-eta" data-stop-id="${closestStopId}">temp</div>
                <div class="next-stop-time closest-stop-time">temp:temp</div>
            </div>`).click(() => {
                flyToStop(closestStopId, true); // true indicates user interaction
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

        // Check if closest stop is the next stop (first in route)
        const closestStopIsNextStop = closestStopId && closestStopId === sortedStops[0] && routesServicing(closestStopId).includes(data.route);

        // Special-case ordering for SAC NB (stop 3) approach legs on weekend/all-style routes
        let approachPrev = null;
        if ((busData[busName]['route'] === 'wknd1' || busData[busName]['route'] === 'all' || busData[busName]['route'] === 'winter1' || busData[busName]['route'] === 'on1' || busData[busName]['route'] === 'summer1') && nextStop === 3) {
            approachPrev = busData[busName]['prevStopId'];
            if (!approachPrev) {
                const viaMap = busETAs && busETAs[busName] && busETAs[busName][3] && busETAs[busName][3]['via'];
                const via22 = viaMap && (viaMap['22'] ?? viaMap[22]);
                const via2 = viaMap && (viaMap['2'] ?? viaMap[2]);
                if (typeof via22 === 'number' && typeof via2 === 'number') {
                    approachPrev = via22 <= via2 ? 22 : 2;
                }
            }
            if (approachPrev === 2) {
                // Base is [3, ..., 22, 1, 2]; insert second 3 between 22 and 1
                const idx22 = sortedStops.indexOf(22);
                if (idx22 !== -1) {
                    const head = sortedStops.slice(0, idx22 + 1); // includes 22
                    const tail = sortedStops.slice(idx22 + 1);     // typically [1,2]
                    sortedStops = head.concat([3]).concat(tail);
                }
            } else if (approachPrev === 22) {
                // Move [1,2] right after first 3 and add a second 3 before continuing
                const afterFirst3 = sortedStops.slice(1).filter(s => s !== 1 && s !== 2);
                sortedStops = [3, 1, 2, 3].concat(afterFirst3);
            }
        }

        if (busData[busName].at_stop && !(closestStopId && closestStopId === busData[busName].stopId)) {

            let stopId = busData[busName].stopId
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
                // If closest stop is the next stop, use closest stop circle as first circle
                if (closestStopIsNextStop) {
                    firstCircle = $('.closest-stop-circle').css('background-color', 'red').addClass('next-stop-circle');
                    firstCircle.append(`<div class="next-stop-circle" style="z-index: 1; background-color: ${colorMappings[data.route]}"></div>`)
                } else {
                    firstCircle = $('.next-stops-grid .next-stop-circle').last().css('background-color', 'red');
                    firstCircle.append(`<div class="next-stop-circle" style="z-index: 1; background-color: ${colorMappings[data.route]}"></div>`)
                }
            }

        }

        let negativeETA = false;

        for (let i = 0; i < sortedStops.length; i++) {

            let eta;

            if ((busData[busName]['route'] === 'wknd1' || busData[busName]['route'] === 'all' || busData[busName]['route'] === 'winter1' || busData[busName]['route'] === 'on1' || busData[busName]['route'] === 'summer1') && sortedStops[i] === 3) { // special case
                if (nextStop === 3 && busData[busName]['stopId'] && !approachPrev) { // very rare case when bus added to server data where next stop is sac nb and there is no previous data yet, accurate eta cannot be known // only triggers if just passed socam sb or yard (at least for current 2024 routes [wknd1, all])
                    delete busETAs[busName];
                    console.log("I'm amazed this actually happened, wow"); // encountered this 4/19/2025 six:38 pm at livi dining
                    return;
                }
                // Use correct approach prev stop for ETA calculation for each SAC NB visit
                let etaPrevStopId;
                if (i === 0) {
                    // First SAC NB - use the actual approach previous stop
                    etaPrevStopId = approachPrev;
                } else {
                    // Second SAC NB - use the previous stop in the current sorted sequence
                    etaPrevStopId = sortedStops[i-1];
                }
                const etaSecs = getETAForStop(busName, 3, etaPrevStopId);
                eta = Math.round(((etaSecs || 0) + 10)/secondsDivisor);
            } else {
                const etaSecs = getETAForStop(busName, sortedStops[i]);
                eta = Math.round(((etaSecs || 0) + 10)/secondsDivisor); // Turns out our ETAs are so accurate that they've been exactly 20 seconds too late, i.e. the exact buffer time I was adding! Wow!
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
                stopName += `<div class="ml-0p5rem" style="color: #00abff;">(${Math.round(busData[busName].progress*100)}%)</div>`
            }

            if (closestStopId && closestStopId === sortedStops[i] && routesServicing(closestStopId).includes(data.route)) {
                if (busData[busName].at_stop && closestStopId === busData[busName].stopId) {
                    $('.closest-stop-eta').text('Here')
                    $('.closest-stop-time').hide();
                } else {
                    $('.closest-stop-eta').text(eta)
                    $('.closest-stop-time').text(formattedTime)
                    $(`[stop-eta="${sortedStops[i]}"]`).text(eta).show();
                }
            }

            if (i === 0 && shouldShowClosestStop && closestStopId === sortedStops[i] && !busData[busName].at_stop) { continue; } // don't show duplicates if next bus stop is closest stop. Has to be down here because eta still needs to be calculated.

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
                // If closest stop is the next stop and we're showing the closest stop section, use it as first circle
                if (closestStopIsNextStop && shouldShowClosestStop) {
                    firstCircle = $('.closest-stop-circle').addClass('next-stop-circle');
                    firstCircle.append(`<div class="next-stop-circle" style="z-index: 1; background-color: ${colorMappings[data.route]}"></div>`)
                } else {
                    firstCircle = $('.next-stops-grid .next-stop-circle').last();
                    firstCircle.append(`<div class="next-stop-circle" style="z-index: 1; background-color: ${colorMappings[data.route]}"></div>`)
                }
            }

            // Always set lastCircle to the most recently added circle in the next-stops-grid
            lastCircle = $('.next-stops-grid .next-stop-circle').last();

        }

        if (busData[busName].oos) {
            distanceFromLine(busName);
        }

        if (!negativeETA) {

            $('.info-next-stops, .next-stops-grid').show(); // remove .show after adding message saying stops unavailable in the else statement above <-- ??

            if (popupBusName !== busName) {
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

    updateHistoricalCapacity(busName);

    if (sourceBusName !== busName) { // kinda a hack to repopulating bus breaks when already shown, fixes hiding the shown more breaks each time... needed some way to check if it was already shown, can probably find a better way to check later (set a separate var, or hide/clear/empty some element on hide info boxes/pop info bus change...)
        $('.bus-history').show();
        $('.info-quickness-mid').hide();
        getBusBreaks(busName);
        $('.show-more-breaks, .show-all-breaks').show();
    }
    
    if (sourceStopId) {
        $('.bus-info-back-wrapper').css('display', 'flex');
    } else {
        $('.bus-info-back-wrapper').hide();
    }
    sourceBusName = busName;

    if (favBuses.includes(busName)) {
        $('.bus-star > i').css('color', 'gold').removeClass('icon-star').addClass('icon-star-solid')
    } else {
        $('.bus-star > i').css('color', 'var(--theme-color)').removeClass('icon-star-solid').addClass('icon-star')
    }

    if (!isDesktop) {
        if (!settings['toggle-bypass-max-distance']) {
            const expandedBounds = expandBounds(bounds[selectedCampus], 2.8);
            map.setMaxBounds(expandedBounds);
        }
        map.setMinZoom(9);
    }

    $('.my-location-popup').hide(); // investigate why I don't have to hide the other info boxes
    $('.stop-info-popup').hide(); // nvm I changed something somewhere to make me need to hide this one too
    
    $('.building-info-popup').hide();
    unhighlightBuilding();

    $('.bus-info-popup').stop(true, true).show();

    updateNextStopsMaxHeight();

    if (!popupBusName && settings['toggle-hide-other-routes']) {
        focusBus(busName);
    }

    try { updateRidingBadgeUI(); } catch (_) {}
}

function updateNextStopsMaxHeight() {
    const nextStops = $('.info-next-stops');
    if (nextStops.length === 0) return;
    
    // Account for the overdue break element if it's visible
    let overdueBreakHeight = 0;
    const overdueBreak = $('.info-overdue-break');
    if (overdueBreak.is(':visible')) {
        const marginTop = parseFloat(overdueBreak.css('margin-top')) || 0;
        overdueBreakHeight = overdueBreak.outerHeight() + marginTop;
    }
    
    // 1.5rem*2 = vertical padding on .info-next-stops, plus xrem gap to be above .bottom <-- no longer acccrate 8/19
    const maxHeight = window.innerHeight - nextStops.offset().top - $('.bus-info-bottom').innerHeight() - $('.bottom').innerHeight() - overdueBreakHeight;
    // console.log(maxHeight);
    nextStops.css('max-height', maxHeight - 75);
}

function populateBusBreaks(busBreakData, busName) {
    const MAX_INITIAL_BREAKS = 7; // Maximum number of breaks shown initially

    if (!busBreakData || busBreakData.error) {
        $('.bus-breaks').empty();
        // $('.bus-breaks').append(`<div class="text-1p2rem" style="grid-column: 1 / span 3; color: #acacac;">This bus hasn't taken any breaks yet.</div>`);
        $('.past-breaks-wrapper, .bus-history').hide();
        $('.show-more-breaks, .show-all-breaks').hide();
        $('.info-overdue-break').hide();
        // Update max height since overdue break is now hidden
        updateNextStopsMaxHeight();
        return;
    }

    // Get bus route and expected stops for comparison
    const busRoute = busData[busName]?.route;
    let expectedStops = [];
    if (busRoute && stopLists[busRoute] && stopLists[busRoute].length > 0) {
        expectedStops = stopLists[busRoute];
    }
    
    // Calculate time since last long break (duration > 180 seconds)
    const lastBreakMin = (() => {
        if (busBreakData && busBreakData.length > 0) {
            // Filter for long breaks only (duration > 180 seconds)
            const longBreaks = busBreakData.filter(breakItem => breakItem.break_duration > 180);
            
            if (longBreaks.length > 0) {
                // Get the most recent long break
                const lastLongBreak = longBreaks[longBreaks.length - 1];
                if (lastLongBreak && lastLongBreak.time_departed) {
                    const lastBreakTime = new Date(lastLongBreak.time_departed.replace(/\.\d+/, ''));
                    const currentTime = new Date();
                    const diffInMs = currentTime - lastBreakTime;
                    const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
                    // console.log(`Last long break was ${diffInMinutes} minutes ago`);
                    return diffInMinutes;
                }
            } else {
                console.log('No long breaks found in data');
            }
        }
        console.log('No break data available');
        return null;
    })();

    if (lastBreakMin && lastBreakMin > 120) {
        // Only show if actually overdue (more than 2 hours)
        $('.info-overdue-break').html(`<div class="flex align-center justify-center gap-x-0p5rem"><i class="fa-solid fa-clock"></i> <span>${Math.floor(lastBreakMin / 60)} HOURS SINCE BREAK</span></div>`).slideDown(function() {
            // Update max height after slideDown animation completes
            updateNextStopsMaxHeight();
        });
    } else if (settings['toggle-always-show-break-overdue']) {
        const hours = Math.floor(lastBreakMin / 60);
        const minutes = lastBreakMin % 60;
        let timeString = '';
        if (hours > 0) {
            timeString += `${hours} hour${hours !== 1 ? 's' : ''}`;
        }
        if (minutes > 0 || hours === 0) {
            if (hours > 0) timeString += ' ';
            timeString += `${minutes} minute${minutes !== 1 ? 's' : ''}`;
        }
        $('.info-overdue-break').html(`<div class="flex align-center justify-center gap-x-0p5rem"><i class="fa-solid fa-clock"></i> <span>Last break ${timeString} ago!</span></div>`).slideDown(function() {
            // Update max height after slideDown animation completes
            updateNextStopsMaxHeight();
        });
    } else {
        $('.info-overdue-break').hide();
    }

    $('.past-breaks-wrapper').show();
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
    const actualStops = new Set(reversedData.map(breakItem => breakItem.stop_id));

    // Create combined list of actual stops + missed stops in chronological order
    const allStopsToShow = [];

    // Add all actual stops in chronological order (most recent first)
    for (const breakItem of reversedData) {
        allStopsToShow.push({ breakItem, isMissed: false });
    }

    // Add missed stops if we have route data
    if (expectedStops && expectedStops.length > 0 && actualStops.size > 0) {
        // Find missed stops by looking at the route sequence
        const missedStops = [];
        
        // Go through the route sequence and find gaps between consecutive actual stops
        for (let i = 0; i < expectedStops.length - 1; i++) {
            const currentStop = expectedStops[i];
            const nextStop = expectedStops[i + 1];
            
            // If both consecutive stops in the route were visited, check for missed stops between them
            if (actualStops.has(currentStop) && actualStops.has(nextStop)) {
                // Find any stops between currentStop and nextStop in the route that were missed
                for (let j = i + 1; j < expectedStops.indexOf(nextStop); j++) {
                    const potentialMissedStop = expectedStops[j];
                    if (!actualStops.has(potentialMissedStop)) {
                        missedStops.push(potentialMissedStop);
                    }
                }
            }
        }
        
        // Log if bus missed stops
        if (missedStops.length > 0) {
            console.log(`Bus ${busName} (${busData[busName]?.busName}) missed ${missedStops.length} stops:`, missedStops.map(stopId => stopsData[stopId]?.name || stopId));
        }
        
        // Add missed stops to the list (these will be hidden initially and shown when "Show All Stops" is clicked)
        for (const missedStopId of missedStops) {
            allStopsToShow.push({ stopId: missedStopId, isMissed: true });
        }
    }

    for (const stopData of allStopsToShow) {
        let extraClass = '';

        if (!stopData.isMissed) {
            const breakItem = stopData.breakItem;
            if (breakItem.break_duration > 180) {
                extraClass = 'long-break';
                breakCount++;
            } else {
                extraClass += 'none';
            }

            if (breakCount >= MAX_INITIAL_BREAKS) {
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
        } else {
            // Handle missed stops - these should always be hidden initially
            const stopId = stopData.stopId;
            const stopName = stopsData[stopId].shortName || stopsData[stopId].name;

            // Missed stops are always hidden initially (shown only when "Show All Stops" is clicked)
            const missedStopExtraClass = ' none';

            breakDiv.append(`<div class="${missedStopExtraClass}" style="color:#656565;">--:--</div>`);
            breakDiv.append(`<div class="${missedStopExtraClass}" style="color: var(--theme-extra); text-decoration: line-through;">${stopName}</div>`);
            breakDiv.append(`<div class="${missedStopExtraClass}"><div class="bold-500" style="color: #f84949;">Missed</div></div>`);
        }
    }


    const percentDiff = ((totalBusBreakTime - totalAvgBreakTime) / totalAvgBreakTime * 100).toFixed(1);

    const timeDiff = Math.round((new Date(busBreakData[busBreakData.length - 1].time_departed.replace(/\.\d+/, '')) - new Date(busBreakData[0].time_arrived.replace(/\.\d+/, ''))) / 1000);
    const breakMinPerHour = (totalBusStopTime / timeDiff * 60).toFixed(1);
    // $('.bus-avg-break-time-per-hour').html(`${breakMinPerHour} min/hr`);

    $('.bus-avg-break-time').html(`Stops <span style="color: ${percentDiff > 0 ? '#f84949' : 'var(--theme-short-stops-color)'};">${Math.abs(percentDiff)}%</span> ${percentDiff > 0 ? 'longer' : 'shorter'} than avg, breaks for <span style="color: var(--theme-breaks-min-color);">${Math.ceil(breakMinPerHour)} min/hr</span>`);

    // Temp disable quickness
    // if ((totalBusBreakTime - totalAvgBreakTime) / totalAvgBreakTime > 0.3) {
    //     $('.info-quickness-mid').html(" | <span class='text-1p2rem' style='color: #fa3c3c;'>Lengthy stops</span>").show();
    // } else if ((totalBusBreakTime - totalAvgBreakTime) / totalAvgBreakTime < -0.2) {
    //     $('.info-quickness-mid').html(" | <span class='text-1p2rem' style='color: var(--theme-short-stops-color);'>Short stops</span>").show();
    // }

    if (settings['toggle-show-bus-quickness-breakdown']) {
        $('.bus-quickness-breakdown-wrapper').html(`<div class="flex flex-col text-1p3rem mt-0p5rem">
            <div>Total bus stop time/loop: ${Math.round(totalBusBreakTime)}s</div>
            <div>Network avg stop time/loop: ${Math.round(totalAvgBreakTime)}s</div>
            <div>Percent difference: ${percentDiff}%</div>
        </div>`).show();
    } else {
        $('.bus-quickness-breakdown-wrapper').hide();
    }

    // Show "Show All Breaks" button only if there are more long breaks than the limit
    const totalLongBreaks = busBreakData.filter(breakItem => breakItem.break_duration > 180).length;
    if (totalLongBreaks > MAX_INITIAL_BREAKS) {
        $('.show-more-breaks').show();
    } else {
        $('.show-more-breaks').hide();
    }
    
    // Show "Show All Stops" button if there are more stops than just the long breaks shown
    if (breakCount !== busBreakData.length) {
        $('.show-all-breaks').show();
    } else {
        $('.show-all-breaks').hide();
    }

    if (breakCount === 0) {
        $('.bus-breaks').children().slice(0, 3).remove();
        // $('.bus-breaks').append(`<div class="no-breaks text-1p2rem" style="grid-column: 1 / span 3; color: #acacac;">This bus hasn't taken any breaks yet.</div>`);
        $('.show-more-breaks').hide();
        $('.show-all-breaks').click(function() { $('.no-breaks').remove(); });
        $('.show-all-breaks').text("Show Stops");
        $('.bus-avg-break-time').html(`Stops <span style="color: ${percentDiff > 0 ? '#f84949' : 'var(--theme-short-stops-color)'};">${Math.abs(percentDiff)}%</span> ${percentDiff > 0 ? 'longer' : 'shorter'} than avg`);
    } else {
        $('.show-all-breaks').text("Show All Stops (Slow)");
    }
}


let busBreaksCache = {};

function checkAllBusesForMissedStops() {
    console.log('Checking all active buses for missed stops...');
    
    if (!busesByRoutes || !busesByRoutes[selectedCampus]) {
        console.log('No buses data available for campus:', selectedCampus);
        return;
    }
    
    let busesWithMissedStops = 0;
    let totalBuses = 0;
    
    // Loop through all routes
    for (const route in busesByRoutes[selectedCampus]) {
        const routeBuses = busesByRoutes[selectedCampus][route];
        
        for (const busName of routeBuses) {
            totalBuses++;
            
            // Get the bus's route and expected stops
            const busRoute = busData[busName]?.route;
            if (!busRoute || !stopLists[busRoute] || stopLists[busRoute].length === 0) {
                continue;
            }
            
            const expectedStops = stopLists[busRoute];
            
            // Get actual stops from bus break data
            if (busBreaksCache[busName] && busBreaksCache[busName].data && !busBreaksCache[busName].data.error) {
                const busBreakData = busBreaksCache[busName].data;
                const actualStops = new Set(busBreakData.map(breakItem => breakItem.stop_id));
                
                // Find missed stops using the same logic as populateBusBreaks
                const missedStops = [];
                
                for (let i = 0; i < expectedStops.length - 1; i++) {
                    const currentStop = expectedStops[i];
                    const nextStop = expectedStops[i + 1];
                    
                    if (actualStops.has(currentStop) && actualStops.has(nextStop)) {
                        for (let j = i + 1; j < expectedStops.indexOf(nextStop); j++) {
                            const potentialMissedStop = expectedStops[j];
                            if (!actualStops.has(potentialMissedStop)) {
                                missedStops.push(potentialMissedStop);
                            }
                        }
                    }
                }
                
                if (missedStops.length > 0) {
                    busesWithMissedStops++;
                    console.log(`🚌 Bus ${busName} (${busData[busName]?.busName}) on route ${route.toUpperCase()} missed ${missedStops.length} stops:`, 
                        missedStops.map(stopId => stopsData[stopId]?.name || stopId));
                }
            }
        }
    }
    
    console.log(`📊 Summary: ${busesWithMissedStops} out of ${totalBuses} buses have missed stops`);
}

function generateSimBusBreaks(busName) {
    const route = busData[busName]?.route;
    if (!route) return null;

    const routeStops = stopLists[route] || [];
    if (routeStops.length === 0) return [];

    const joinedTime = busData[busName]?.joined_service
        ? new Date(busData[busName].joined_service).getTime()
        : Date.now() - 6 * 60 * 60 * 1000;

    const elapsedMs = Date.now() - joinedTime;
    const campusKey = routesByCampus[route] || selectedCampus || 'nb';

    const avgTimePerStop = 4 * 60 * 1000;
    const totalPossibleStops = Math.max(1, Math.floor(elapsedMs / avgTimePerStop));
    const stopsPerLoop = routeStops.length;
    const totalLoops = Math.ceil(totalPossibleStops / stopsPerLoop);
    const loopsToShow = Math.min(totalLoops, Math.floor(Math.random() * 2) + 1);
    const stopsToShow = Math.min(totalPossibleStops, loopsToShow * stopsPerLoop);

    const breaks = [];
    let cursorTime = Date.now();
    let stopIdx = routeStops.length - 1;

    for (let i = 0; i < stopsToShow; i++) {
        const stopId = routeStops[stopIdx];
        const prevStopId = routeStops[(stopIdx - 1 + routeStops.length) % routeStops.length];

        let travelSecs = 180;
        try {
            const seg = percentageDistances?.[campusKey]?.[String(stopId)]?.from?.[String(prevStopId)];
            if (seg?.properties?.totalMiles) {
                travelSecs = Math.round(seg.properties.totalMiles / 20 * 3600);
            }
        } catch (e) {}
        travelSecs = Math.max(30, Math.min(600, travelSecs + (Math.random() * 60 - 30)));

        const avgWait = waits?.[stopId];
        const dwellSecs = avgWait
            ? Math.max(10, Math.round(avgWait * (0.5 + Math.random() * 1.5)))
            : Math.floor(Math.random() < 0.6 ? Math.random() * 140 + 15 : Math.random() * 420 + 180);

        const timeArrived = new Date(cursorTime - (travelSecs + dwellSecs) * 1000);
        const timeDeparted = new Date(cursorTime - travelSecs * 1000);

        breaks.unshift({
            stop_id: stopId,
            time_arrived: timeArrived.toISOString().replace('Z', ''),
            time_departed: timeDeparted.toISOString().replace('Z', ''),
            break_duration: dwellSecs
        });

        cursorTime = timeArrived.getTime();
        stopIdx = (stopIdx - 1 + routeStops.length) % routeStops.length;
    }

    return breaks;
}

function getBusBreaks(busName) {
    const currentTime = new Date().getTime();
    const THREE_MINUTES = 3 * 60 * 1000;

    if (busBreaksCache[busName] &&
        (currentTime - busBreaksCache[busName].timestamp) < THREE_MINUTES) {
        populateBusBreaks(busBreaksCache[busName].data, busName);
        return;
    }

    if (busData[busName]?.type === 'sim') {
        const fakeBreaks = generateSimBusBreaks(busName);
        busBreaksCache[busName] = {
            data: fakeBreaks,
            timestamp: currentTime
        };
        populateBusBreaks(fakeBreaks, busName);
        return;
    }

    fetch(`https://demo.rubus.live/get_breaks?bus_id=${busName}`)
        .then(response => response.json())
        .then(data => {
            busBreaksCache[busName] = {
                data: data,
                timestamp: currentTime
            };
            populateBusBreaks(data, busName);
            updateRubusResponseTime();
        })
        .catch(error => {
            console.error('Error fetching bus breaks:', error);
            markRubusRequestsFailing();
        });
}

let busRiderships = {};

let busRidershipCharts = {};
let currentRidershipChartBusId = null;

function shouldShowCapacityChart(busName) {
    const timeRiderships = busRiderships[busName];
    if (!timeRiderships || Object.keys(timeRiderships).length === 0) {
        return false;
    }
    
    const values = Object.values(timeRiderships);
    const allSame = values.every(value => value === values[0]);
    if (allSame) {
        return false; // Hide chart if all values are the same
    }
    
    // Count unique values
    const uniqueValues = new Set(values);
    if (uniqueValues.size < 5) {
        return false; // Hide chart if fewer than 5 unique values
    }
    
    return true; // Show chart if it has 5 or more unique values
}

function updateHistoricalCapacity(busName) {
    // Only proceed if this is a new bus selection or data needs refresh
    const currentMinute = new Date().getMinutes();
    const shouldRefresh = currentMinute % 5 === 1 && !busRiderships.lastUpdate || 
                         (currentMinute % 5 === 1 && new Date().getTime() - busRiderships.lastUpdate > 60000);
    
    const handleChartUpdate = () => {
        const shouldShow = shouldShowCapacityChart(busName);
        if (shouldShow) {
            createBusRidershipChart(busName);
            currentRidershipChartBusId = busName;
        } else {
            $('.bus-ridership-wrapper, .bus-history').hide();
        }
    };
                         
    if (Object.keys(busRiderships).length === 0 || shouldRefresh) {
        fetch('https://demo.rubus.live/bus_ridership')
            .then(response => response.json())
            .then(data => {
                const dataChanged = JSON.stringify(busRiderships) !== JSON.stringify(data);
                busRiderships = data;
                busRiderships.lastUpdate = new Date().getTime();
                if (!busRidershipCharts[busName] || dataChanged) {
                    handleChartUpdate();
                }
                updateRubusResponseTime();
            })
            .catch(error => {
                console.error('Error fetching bus ridership data:', error);
                markRubusRequestsFailing();
            });
    } else if (!busRidershipCharts[busName]) {
        handleChartUpdate();
    }
}

function createBusRidershipChart(busName) {
    
    // If chart already exists, just update its data if needed
    if (busRidershipCharts[busName]) {
        const timeRiderships = busRiderships[busName];
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
        const currentLabels = busRidershipCharts[busName].data.labels;
        const currentValues = busRidershipCharts[busName].data.datasets[0].data;
        
        if (JSON.stringify(currentLabels) !== JSON.stringify(newLabels) || 
            JSON.stringify(currentValues) !== JSON.stringify(newValues)) {
            busRidershipCharts[busName].data.labels = newLabels;
            busRidershipCharts[busName].data.datasets[0].data = newValues;
            busRidershipCharts[busName].update();
        }
        
        $('.bus-historical-capacity').show();
        return;
    }

    if (!busRiderships[busName]) {
        $('.bus-historical-capacity').hide();
        return;
    }

    const timeRiderships = busRiderships[busName];
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
    
    busRidershipCharts[busName] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                // label: 'Passengers',
                data: values,
                borderColor: colorMappings[busData[busName].route],
                backgroundColor: function() {
                    const color = colorMappings[busData[busName].route];
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

async function focusBus(busName) {
    // Clear panout feedback when focusing on a bus
    clearPanoutFeedback();

    const route = busData[busName].route;

    hideStopsExcept(route)
    hidePolylinesExcept(route)

    // Ensure the route polyline exists for focusing (temporary show for OOS routes)
    if (!polylines[route]) {
        try { await addPolylineForRoute(route); } catch (e) {}
    }

    // Show distance line on focus if the setting is enabled
    if (settings['toggle-distances-line-on-focus']) {
        showDistanceLineOnFocus(busName);
        // Hide the route polyline when showing distance line
        if (polylines[route]) {
            polylines[route].setStyle({ opacity: 0 });
        }
    } 
    // not sure if needed, is route polyline being made visible elsewhere? I think it's correctly handled in settings when setting is toggled.
    // else {
    //     // Ensure the route polyline is visible when distance line setting is off
    //     if (polylines[route]) {
    //         polylines[route].setStyle({ opacity: 1 });
    //     }
    // }

    for (const marker in busMarkers) {
        if (marker !== busName.toString()) {
            busMarkers[marker].getElement().style.display = 'none';
        }
    }

    // if (!popupBusName) {
        const topContainerHeight = 1 - ($(window).height() - $('.bus-btns').offset().top)/$(window).height()

        let focusBounds = null;
        if (polylines[route]) {
            const rb = polylines[route].getBounds();
            focusBounds = L.latLngBounds(rb.getSouthWest(), rb.getNorthEast());
        }

        if (busData[busName].atDepot) {
            const busLocBounds = L.latLngBounds([L.latLng(busData[busName].lat, busData[busName].long)]);
            if (focusBounds) {
                focusBounds.extend(busLocBounds);
            } else {
                focusBounds = busLocBounds;
            }
        }

        const mapSize = map.getSize();
        // Only apply top padding on mobile - on desktop the wrapper is to the side, not covering the top
        const topGuiHeight = !isDesktop ? mapSize.y * topContainerHeight : 0;

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

// Global variable to store the current distance line layer
let distanceLineLayer = null;
// Global variable to store the red dot marker showing bus position on distance line
let distanceLinePositionMarker = null;

function showDistanceLineOnFocus(busName) {
    // Remove any existing distance line
    removeDistanceLineOnFocus();
    
    const route = busData[busName].route;
    const campusKey = routesByCampus[route] || selectedCampus || 'nb';
    
    // Don't show distance line if bus is at depot or out of service
    if (busData[busName].atDepot || busData[busName].oos) {
        console.log('Bus', busName, 'is at depot or out of service, not showing distance line');
        return;
    }
    
    const currentStopId = busData[busName].stopId;
    const prevStopId = busData[busName].prevStopId;
    const nextStopId = busData[busName].next_stop;
    
    let currentStop = currentStopId;
    if (Array.isArray(currentStopId)) {
        currentStop = currentStopId[0];
    }
    
    // Determine the correct segment to show
    let fromStopId, toStopId;
    
    // On special routes where stop 3 is visited twice, use prevStopId to resolve
    if (isSpecialRoute(route) && Number(currentStop) === 3) {
        const stopList = stopLists[route];
        if (stopList && prevStopId) {
            const idx = stopList.lastIndexOf(Number(prevStopId));
            if (idx !== -1 && idx + 1 < stopList.length) {
                fromStopId = 3;
                toStopId = stopList[idx + 1];
            }
        }
    }
    
    if (!fromStopId && currentStop && nextStopId) {
        // Normal case: show segment from current stop to next stop
        fromStopId = currentStop;
        toStopId = nextStopId;
    } else if (!fromStopId && prevStopId && currentStop) {
        // Fallback: show segment from previous stop to current stop
        fromStopId = prevStopId;
        toStopId = currentStop;
    } else if (!fromStopId) {
        console.log('Cannot determine route segment for bus', busName, '- missing stop information');
        console.log('Current stop:', currentStopId, 'Next stop:', nextStopId, 'Previous stop:', prevStopId);
        return;
    }
    
    // Handle special case buses that visit stop #3 twice (when heading to stop 3)
    if (isSpecialRoute(route) && toStopId === 3 && !(Number(currentStop) === 3)) {
        // Use previous stop ID to determine which approach to stop 3
        if (prevStopId) {
            fromStopId = prevStopId;
            toStopId = 3;
        } else {
            console.log('Special route bus missing prevStopId for stop 3');
            return;
        }
    }
    
    // Get the distance line segment from percentageDistances
    const segment = percentageDistances[campusKey] 
        && percentageDistances[campusKey][String(toStopId)]
        && percentageDistances[campusKey][String(toStopId)].from
        ? percentageDistances[campusKey][String(toStopId)].from[String(fromStopId)]
        : null;
    
    if (!segment || !segment.geometry || !Array.isArray(segment.geometry.coordinates)) {
        console.log('No distance segment found for route from stop', fromStopId, 'to stop', toStopId);
        return;
    }
    
    // Convert coordinates from [lng, lat] to [lat, lng] for Leaflet
    const coordinates = segment.geometry.coordinates.map(coord => [coord[1], coord[0]]);
    
    // Create the distance line
    distanceLineLayer = L.polyline(coordinates, {
        color: colorMappings[route] || '#ff0000',
        weight: 4,
        opacity: 0.8,
        dashArray: '10, 5'
    });
    
    // Add to map
    distanceLineLayer.addTo(map);
    
    // Update the red dot position marker
    updateDistanceLinePositionMarker(busName);
    
    console.log('Showing distance line from stop', fromStopId, 'to stop', toStopId, 'for bus', busName);
}

function removeDistanceLineOnFocus() {
    if (distanceLineLayer) {
        map.removeLayer(distanceLineLayer);
        distanceLineLayer = null;
    }
    if (distanceLinePositionMarker) {
        map.removeLayer(distanceLinePositionMarker);
        distanceLinePositionMarker = null;
    }
}

function findClosestPointOnDistanceLine(busName) {
    const busLatLng = L.latLng(busData[busName].lat, busData[busName].long);
    const lineCoordinates = distanceLineLayer.getLatLngs();
    
    let minDist = Infinity;
    let closestPoint = null;
    
    // Find closest existing point in the line coordinates (no interpolation)
    for (let i = 0; i < lineCoordinates.length; i++) {
        const point = lineCoordinates[i];
        const distance = busLatLng.distanceTo(point);
        
        if (distance < minDist) {
            minDist = distance;
            closestPoint = point;
        }
    }
    
    return closestPoint;
}

function updateDistanceLinePositionMarker(busName) {
    const closestPoint = findClosestPointOnDistanceLine(busName);
    
    // Calculate distance from bus to closest point
    const busLatLng = L.latLng(busData[busName].lat, busData[busName].long);
    const distanceMeters = busLatLng.distanceTo(closestPoint);
    const distanceFeet = Math.round(distanceMeters * 3.28084); // Convert meters to feet
    
    // Remove existing marker
    if (distanceLinePositionMarker) {
        map.removeLayer(distanceLinePositionMarker);
    }
    
    // Create new red dot marker with custom HTML tooltip (matching stop ETA pattern)
    distanceLinePositionMarker = L.marker(closestPoint, {
        icon: L.divIcon({
            className: 'custom-distance-marker',
            iconSize: [12, 12],
            iconAnchor: [6, 6],
            html: `
                <div class="distance-marker-wrapper">
                    <div class="distance-dot"></div>
                    <div class="distance-tooltip" distance-value="${distanceFeet}">${distanceFeet} ft</div>
                </div>
            `
        }),
        zIndexOffset: 1000
    }).addTo(map);
    
    console.log('Created distance line position marker with tooltip:', distanceFeet, 'ft');
}

function distanceFromLine(busName, returnDetails = false) {
    const busLatLng = L.latLng(busData[busName].lat, busData[busName].long);
    const route = busData[busName].route;
    let polyPoints = null;
    if (route && polylines[route]) {
        polyPoints = polylines[route].getLatLngs();
    } else if (route && routePointsCache[route]) {
        polyPoints = routePointsCache[route];
    }
    
    let flatPoints = polyPoints;
    if (Array.isArray(polyPoints[0])) {
        flatPoints = polyPoints.flat(2);
    }
    
    let minDist = Infinity;
    for (let i = 0; i < flatPoints.length; i++) {
        const d = busLatLng.distanceTo(flatPoints[i]);
        if (d < minDist) {
            minDist = d;
            closestPoint = flatPoints[i];
        }
    }
    
    const distanceFeet = minDist * 0.000621371 * 5280;
    const isOffLine = distanceFeet > 500;

    if (returnDetails) {
        return { isOffLine: isOffLine, feet: Math.round(distanceFeet) };
    }
    return isOffLine;
}

function isValid(busName) {
    if (!busETAs[busName]) return false;
    if (distanceFromLine(busName)) return false;

    for (const stopId of stopLists[busData[busName].route]) {
        const etaVal = getETAForStop(busName, stopId);
        if (typeof etaVal === 'number' && etaVal < 0) {
            return false;
        }
    }

    return true;
}

function getBusValidityInfo(busName) {
    if (!busETAs[busName]) {
        return {
            valid: false,
            reason: 'not in busETAs'
        };
    }

    if (distanceFromLine(busName)) {
        return {
            valid: false,
            reason: 'Off route line (>500 ft)'
        };
    }

    for (const stopId of stopLists[busData[busName].route]) {
        const etaVal = getETAForStop(busName, stopId);
        if (typeof etaVal === 'number' && etaVal < 0) {
            return {
                valid: false,
                reason: `Negative ETA: ${etaVal}`
            };
        }
    }

    return {
        valid: true,
        reason: null
    };
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

function formatStoppedTime(totalSeconds) {
    if (totalSeconds >= 3600) {
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        return `Stopped for ${hours}h ${minutes}m ${seconds}s`;
    } else if (totalSeconds >= 60) {
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `Stopped for ${minutes}m ${seconds}s`;
    } else if (totalSeconds > 0) {
        return `Stopped for ${totalSeconds}s`;
    } else {
        return "Stopped for 0s";
    }
}

function startStoppedForTimer(busName) {

    clearInterval(stoppedForInterval); // not sure what could be causing the double timer that requires me to add this

    const arrivedDatetime = new Date(busData[busName].timeArrived);
    const now = new Date()//.toISOString();
    // console.log(now)
    const secondsDifference = Math.floor((now - arrivedDatetime) / 1000);
    // console.log('secondsDifference: ', secondsDifference)

    $('.bus-stopped-for').show().find('.time').text(formatStoppedTime(secondsDifference));

    const maxHeight = window.innerHeight - $('.info-next-stops').offset().top - $('.bus-info-bottom').innerHeight() - $('.bottom').innerHeight()
    $('.info-next-stops').css('max-height', maxHeight - 135)
    
    let seconds = secondsDifference
    stoppedForInterval = setInterval(() => {
        if (popupBusName === busName) {
            const step = (window.sim === true) ? Math.max(1, (window.SIM_TIME_MULTIPLIER || 1)) : 1;
            seconds += step;
            $('.bus-stopped-for').show().find('.time').text(formatStoppedTime(seconds));
        } else {
            clearInterval(stoppedForInterval);
        }
    }, 1000);
}

function flyToBus(busName) {
    if (!busName) {
        console.error(`Invalid bus ID: busName is undefined or null. Input bus ID: ${busName}`);
        return;
    }
    if (!busData) {
        console.error('Missing bus data: busData is undefined or null');
        return;
    }
    if (!busData[busName]) {
        console.error(`Invalid bus data for bus ID ${busName}: busData[${busName}] is undefined or null`);
        return;
    }

    const lat = Number(busData[busName].lat);
    const long = Number(busData[busName].long);
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
   
    selectBusMarker(busName);
   
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

function startOvertimeCounter(busName) {

    if (busName === overtimeBusId) {
        return;
    }

    overtimeBusId = busName;

    if (overtimeInterval) {
        clearInterval(overtimeInterval);
    }

    $('.overtime-time').show();
    
    const timeArrived = new Date(busData[busName].timeArrived);
    const avgWaitAtStop = waits[busData[busName].stopId[0]];
    const arrivedAgoSeconds = Math.floor((new Date().getTime() - timeArrived) / 1000);
    const overtimeSeconds = arrivedAgoSeconds - avgWaitAtStop;
    // console.log(arrivedAgoSeconds)
    // console.log(avgWaitAtStop)
    // console.log(overtimeSeconds)
    const minutes = Math.floor(overtimeSeconds / 60);
    const seconds = overtimeSeconds % 60;
    $('.overtime-time').text((minutes > 0 ? minutes + 'm ' : '') + seconds + 's overtime');

    overtimeInterval = setInterval(() => {
        if (busData[busName] && busData[busName]['overtime']) {
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
    if (currentTileLayerType === 'satellite') {
        let theme = settings['theme'];
        if (theme === 'auto') {
            const currentHour = new Date().getHours();
            theme = (currentHour <= 7 || currentHour >= 18) ? 'dark' : 'light';
        }

        const newTheme = resolveMapTileStyle(theme);
        map.removeLayer(tileLayer);

        tileLayer = L.tileLayer(`https://tiles.rubus.live/styles/v1/${newTheme}/tiles/{z}/{x}/{y}.png`).addTo(map);
        currentTileLayerType = 'streets';

        $(this).removeClass('active');
    } else {
        map.removeLayer(tileLayer);
        tileLayer = L.tileLayer(`https://tiles.rubus.live/styles/v1/satellite-streets-v11/tiles/{z}/{x}/{y}.png`).addTo(map);
        currentTileLayerType = 'satellite';

        let theme = settings['theme']
        if (theme === 'auto') {
            const currentHour = new Date().getHours();
            theme = (currentHour <= 7 || currentHour >= 18) ? 'dark' : 'light';
        }
        $(this).addClass('active');
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

function navToBuilding() {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isAndroid = /Android/.test(navigator.userAgent);
    let url = '';

    if (isIOS) {
        url = `http://maps.apple.com/?daddr=${popupBuildingLatLng}&dirflg=w`;
    } else if (isAndroid) {
        url = `https://www.google.com/maps/dir/?api=1&destination=${popupBuildingLatLng}&travelmode=walking`;
    } else {
        // Fallback, use GM
        url = `https://www.google.com/maps/dir/?api=1&destination=${popupBuildingLatLng}&travelmode=walking`;
    }

    window.open(url, '_blank');
}

function showBikeRacks() {
    if (!bikeRacks || !bikeRacks[selectedCampus]) {
        console.log('No bike rack data available for campus:', selectedCampus);
        return;
    }

    // Clear any existing bike rack markers
    hideBikeRacks();

    // Loop through all bike rack locations for the current campus
    for (const category in bikeRacks[selectedCampus]) {
        const locations = bikeRacks[selectedCampus][category];
        for (const location of locations) {
            const [lng, lat] = location; // Note: bike_racks.js uses [lng, lat] format

            const marker = L.marker([lat, lng], {
                icon: L.icon({
                    iconUrl: 'img/bike_rack.png',
                    iconSize: [16, 16],
                    iconAnchor: [8, 8]
                }),
                zIndexOffset: -100
            });

            marker.addTo(map);
            bikeRackMarkers.push(marker);
        }
    }

    console.log(`Added ${bikeRackMarkers.length} bike rack markers for campus: ${selectedCampus}`);
}

function hideBikeRacks() {
    for (const marker of bikeRackMarkers) {
        map.removeLayer(marker);
    }
    bikeRackMarkers = [];
    // console.log('Removed all bike rack markers');
}

// Off-screen bus directional edge indicators logic
function getVisibleActiveBuses() {
    const activeBuses = [];
    if (typeof busMarkers === 'undefined' || typeof busData === 'undefined' || !map) return activeBuses;
    
    for (const busName in busMarkers) {
        const marker = busMarkers[busName];
        if (!marker || !map.hasLayer(marker)) continue;
        const data = busData[busName];
        if (!data || !data.route || data.atDepot) continue;
        
        // Skip hidden elements
        const el = marker.getElement();
        if (el && (el.style.display === 'none' || el.style.visibility === 'hidden')) {
            continue;
        }

        // Filter out by selected route if filtering is active
        if (typeof shownRoute !== 'undefined' && shownRoute && data.route !== shownRoute) {
            continue;
        }

        const latLng = marker.getLatLng();
        if (!latLng || isNaN(latLng.lat) || isNaN(latLng.lng)) continue;

        activeBuses.push({
            busName: busName,
            route: data.route,
            latLng: latLng,
            marker: marker
        });
    }
    return activeBuses;
}

function updateOffScreenContainerZIndex() {
    let container = document.getElementById('offscreen-bus-indicators-container');
    if (!container) return;
    const isAboveGui = typeof settings !== 'undefined' && settings['toggle-offscreen-bus-indicators-above-gui'] === true;
    container.style.zIndex = isAboveGui ? '650' : '400';
}

function updateOffScreenBusIndicators() {
    if (!map || typeof busMarkers === 'undefined') return;

    if (typeof settings !== 'undefined' && settings['toggle-offscreen-bus-indicators'] === false) {
        let container = document.getElementById('offscreen-bus-indicators-container');
        if (container) container.innerHTML = '';
        return;
    }

    let container = document.getElementById('offscreen-bus-indicators-container');
    if (!container) {
        const mapEl = document.getElementById('map');
        if (mapEl) {
            container = document.createElement('div');
            container.id = 'offscreen-bus-indicators-container';
            mapEl.appendChild(container);
        } else {
            return;
        }
    }

    updateOffScreenContainerZIndex();

    const activeBuses = getVisibleActiveBuses();
    if (activeBuses.length === 0) {
        container.innerHTML = '';
        return;
    }

    const bounds = map.getBounds();

    // Group active buses by route
    const busesByRouteMap = {};
    for (const bus of activeBuses) {
        if (!busesByRouteMap[bus.route]) {
            busesByRouteMap[bus.route] = [];
        }
        busesByRouteMap[bus.route].push(bus);
    }

    const busesToIndicate = [];

    // For each route, check if any of its buses are visible on screen
    for (const route in busesByRouteMap) {
        const routeBuses = busesByRouteMap[route];
        const routeHasBusInView = routeBuses.some(bus => bounds.contains(bus.latLng));
        
        // Show indicator badges for off-screen buses of routes that have 0 buses in view
        if (!routeHasBusInView) {
            for (const bus of routeBuses) {
                busesToIndicate.push(bus);
            }
        }
    }

    if (busesToIndicate.length === 0) {
        container.innerHTML = '';
        return;
    }

    const mapSize = map.getSize();
    const W = mapSize.x;
    const H = mapSize.y;
    if (W <= 0 || H <= 0) return;

    const paddingTop = 22;
    const paddingBottom = 22;
    const paddingLeft = 22;
    const paddingRight = 22;

    const centerPx = map.latLngToContainerPoint(map.getCenter());
    const cx = centerPx.x;
    const cy = centerPx.y;

    const minX = paddingLeft;
    const maxX = W - paddingRight;
    const minY = paddingTop;
    const maxY = H - paddingBottom;

    const indicatorsData = [];

    for (const bus of busesToIndicate) {
        const targetPx = map.latLngToContainerPoint(bus.latLng);
        const dx = targetPx.x - cx;
        const dy = targetPx.y - cy;

        if (dx === 0 && dy === 0) continue;

        let tX = Infinity;
        if (dx > 0) {
            tX = (maxX - cx) / dx;
        } else if (dx < 0) {
            tX = (minX - cx) / dx;
        }

        let tY = Infinity;
        if (dy > 0) {
            tY = (maxY - cy) / dy;
        } else if (dy < 0) {
            tY = (minY - cy) / dy;
        }

        const t = Math.min(tX, tY);
        if (!isFinite(t) || t <= 0) continue;

        const edgeX = Math.max(minX, Math.min(maxX, cx + t * dx));
        const edgeY = Math.max(minY, Math.min(maxY, cy + t * dy));

        const angleRad = Math.atan2(dy, dx);
        const angleDeg = angleRad * (180 / Math.PI);
        const arrowRotation = angleDeg + 90;

        indicatorsData.push({
            busName: bus.busName,
            route: bus.route,
            latLng: bus.latLng,
            x: edgeX,
            y: edgeY,
            angleDeg: angleDeg,
            arrowRotation: arrowRotation
        });
    }

    renderOffScreenIndicators(container, indicatorsData);
}

function getShortestRotation(currentDeg, targetDeg) {
    let diff = (targetDeg - currentDeg) % 360;
    if (diff < -180) {
        diff += 360;
    } else if (diff > 180) {
        diff -= 360;
    }
    return currentDeg + diff;
}

function renderOffScreenIndicators(container, indicators) {
    const existingElements = Array.from(container.children);
    const updatedIds = new Set();

    indicators.forEach(ind => {
        const safeId = ind.busName.replace(/[^a-zA-Z0-9_-]/g, '-');
        const id = `offscreen-marker-${safeId}`;
        updatedIds.add(id);

        let el = document.getElementById(id);
        const color = (typeof colorMappings !== 'undefined' && colorMappings[ind.route]) ? colorMappings[ind.route] : '#565fe5';
        const routeLabel = ind.route.toUpperCase();

        if (!el) {
            el = document.createElement('div');
            el.id = id;
            el.className = 'offscreen-bus-marker';
            el.innerHTML = `
                <i class="fa-solid fa-arrow-up offscreen-bus-marker-arrow"></i>
            `;
            el.onclick = function(e) {
                e.stopPropagation();
                if (map) {
                    map.flyTo(ind.latLng, Math.max(map.getZoom(), 15), {
                        animate: true,
                        duration: 0.3
                    });
                }
                if (typeof settings !== 'undefined' && settings['toggle-offscreen-bus-indicators-select-on-tap']) {
                    if (typeof popInfo === 'function') {
                        popInfo(ind.busName);
                    }
                }
            };
            container.appendChild(el);
        }

        el.style.left = ind.x + 'px';
        el.style.top = ind.y + 'px';
        el.style.backgroundColor = color;

        const arrowEl = el.querySelector('.offscreen-bus-marker-arrow');
        if (arrowEl) {
            let currentRot = parseFloat(arrowEl.dataset.currentRotation);
            let nextRot = ind.arrowRotation;
            if (!isNaN(currentRot)) {
                nextRot = getShortestRotation(currentRot, ind.arrowRotation);
            }
            arrowEl.dataset.currentRotation = nextRot;
            arrowEl.style.transform = `rotate(${nextRot}deg)`;
        }
    });

    existingElements.forEach(el => {
        if (!updatedIds.has(el.id)) {
            el.remove();
        }
    });
}

let offscreenUpdateScheduled = false;
function requestOffScreenUpdate() {
    if (offscreenUpdateScheduled) return;
    offscreenUpdateScheduled = true;
    requestAnimationFrame(() => {
        offscreenUpdateScheduled = false;
        updateOffScreenBusIndicators();
    });
}

function initOffscreenBusListeners() {
    if (map) {
        map.on('move drag zoom viewreset moveend resize', requestOffScreenUpdate);
    }
}

document.addEventListener('rubus-map-created', initOffscreenBusListeners);
$(document).ready(function() {
    if (map) {
        initOffscreenBusListeners();
    }
});