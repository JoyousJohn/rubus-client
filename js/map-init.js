// js/map-init.js - extracted verbatim from js/map.js
window.initMap = function() {
    if (typeof map !== 'undefined' && map) return;

    updateSettings();

    let mapTheme = resolveMapTileStyle(settings && settings['theme']);
    const initialView = views[selectedCampus] || [40.5033, -74.4521];

    map = new maplibregl.Map({
        container: 'map',
        style: getMapLibreStyleSpec(getTileUrlPattern(mapTheme)),
        center: [initialView[1], initialView[0]],
        zoom: 14,
        minZoom: settings['toggle-bypass-max-distance'] ? bypassMinZoomLevel : defaultMinZoomLevel,
        maxZoom: 20,
        attributionControl: false,
        pitchWithRotate: false,
        touchPitch: false,
        // A/B test: native sharpness (DPR 1.354). If FPS regresses vs the
        // pixelRatio:1.0 run, pixel count was the improvement — not the GL
        // context flags below.
        pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
        canvasContextAttributes: { antialias: false, alpha: false, depth: false, stencil: false }
    });

    // Install before the asynchronous style/tile load starts.
    installMapLibreRasterSharpnessFix(map);

    // Dev setting: raster sharpness mode ('off' | 'bicubic' | 'decimate').
    // Declared on window so gui.js can call it when the 3-option setting
    // changes; applied here — before the async style load compiles shaders —
    // so an 'off' setting never builds our shader at all.
    window.applyRasterSharpnessSetting = function() {
        const mode = (settings && settings['raster-sharpness']) || 'bicubic';
        if (window.__rubusRasterFix) window.__rubusRasterFix.setMode(mode);
    };
    applyRasterSharpnessSetting();

    window.updateStopsLayerOrder = function(stopsAboveBuses) {
        if (stopsAboveBuses === undefined) {
            stopsAboveBuses = !!settings['toggle-stops-above-buses'];
        }
        if (!map) return;
        try {
            if (stopsAboveBuses) {
                if (map.getLayer('stop-markers-layer')) map.moveLayer('stop-markers-layer');
                if (map.getLayer('stop-markers-labels')) map.moveLayer('stop-markers-labels');
            } else {
                if (map.getLayer('bus-markers-layer')) map.moveLayer('bus-markers-layer');
                if (map.getLayer('bus-markers-labels')) map.moveLayer('bus-markers-labels');
                if (map.getLayer('bus-markers-glow')) map.moveLayer('bus-markers-glow');
                if (map.getLayer('bus-markers-selected')) map.moveLayer('bus-markers-selected');
                if (map.getLayer('bus-markers-selected-labels')) map.moveLayer('bus-markers-selected-labels');
                // Pin the stop layers directly below the bus layers so stops
                // render above polylines/other content regardless of when the
                // content layers were created relative to the stop layers.
                const stopAnchor = map.getLayer('bus-markers-layer') ? 'bus-markers-layer'
                    : (map.getLayer('bus-markers-glow') ? 'bus-markers-glow' : undefined);
                if (map.getLayer('stop-markers-layer')) map.moveLayer('stop-markers-layer', stopAnchor);
                if (map.getLayer('stop-markers-labels')) map.moveLayer('stop-markers-labels', stopAnchor);
            }
            if (map.getLayer('bus-markers-glow')) map.moveLayer('bus-markers-glow');
            if (map.getLayer('bus-markers-selected')) map.moveLayer('bus-markers-selected');
            if (map.getLayer('bus-markers-selected-labels')) map.moveLayer('bus-markers-selected-labels');
            // The selected stop always paints above everything else (DOM
            // parity: its z-index is 2000, above bus markers at 500).
            if (map.getLayer('stop-markers-selected')) map.moveLayer('stop-markers-selected');
            if (map.getLayer('stop-markers-selected-labels')) map.moveLayer('stop-markers-selected-labels');
            // Repair any polylines that were inserted above buses by the
            // previous beforeId logic (always preferred 'stop-markers-layer',
            // so when stops were above buses a new polyline landed between
            // buses and stops). Move every polyline layer before the lowest
            // marker group so polylines stay below both stops and buses.
            const lowestMarkerId = stopsAboveBuses
                ? (map.getLayer('bus-markers-layer') ? 'bus-markers-layer' : (map.getLayer('bus-markers-glow') ? 'bus-markers-glow' : (map.getLayer('stop-markers-layer') ? 'stop-markers-layer' : null)))
                : (map.getLayer('stop-markers-layer') ? 'stop-markers-layer' : (map.getLayer('bus-markers-layer') ? 'bus-markers-layer' : (map.getLayer('bus-markers-glow') ? 'bus-markers-glow' : null)));
            if (lowestMarkerId) {
                for (const route in polylines) {
                    const poly = polylines[route];
                    const lid = poly && poly._mapLibreLayerId;
                    if (lid && map.getLayer(lid) && map.getLayer(lowestMarkerId)) {
                        map.moveLayer(lid, lowestMarkerId);
                    }
                }
            }
        } catch (e) {}
    };
    updateStopsLayerOrder();

    // Detailed Pan Diagnostics Profiler
    // Temporarily disabled: set PAN_PROFILER_ENABLED to true to re-enable.
    const PAN_PROFILER_ENABLED = false;
    if (PAN_PROFILER_ENABLED) {
        let panFrameTimes = [];
        let lastPanTime = 0;
        map.on('dragstart', function() {
            lastPanTime = performance.now();
            panFrameTimes = [];
            const activeBusesCount = typeof busMarkers !== 'undefined' ? Object.keys(busMarkers).filter(k => {
                const m = busMarkers[k];
                const el = m && m.getElement && m.getElement();
                return el && el.parentNode && el.style.display !== 'none';
            }).length : 0;
            const activeStopsCount = typeof busStopMarkers !== 'undefined' ? Object.keys(busStopMarkers).filter(k => {
                const m = busStopMarkers[k];
                const el = m && m.getElement && m.getElement();
                return el && el.parentNode && el.style.display !== 'none';
            }).length : 0;
            console.log('⚡ [DEBUG Pan Profiler] Drag Started:', {
                activeBusMarkers: activeBusesCount,
                activeStopMarkers: activeStopsCount,
                totalMarkers: activeBusesCount + activeStopsCount,
                mapZoom: Math.round(map.getZoom() * 10) / 10,
                pixelRatio: window.devicePixelRatio || 1
            });
        });

        map.on('render', function() {
            if (window.isMapDragging) {
                const now = performance.now();
                if (lastPanTime > 0) {
                    const frameTime = now - lastPanTime;
                    panFrameTimes.push(frameTime);
                }
                lastPanTime = now;
            }
        });

        map.on('dragend', function() {
            if (panFrameTimes.length > 0) {
                const avgDelta = panFrameTimes.reduce((a, b) => a + b, 0) / panFrameTimes.length;
                const fps = Math.round(1000 / avgDelta);
                const slowFrames = panFrameTimes.filter(t => t > 33.3).length;
                const maxFrame = Math.max(...panFrameTimes).toFixed(1);
                const minFrame = Math.min(...panFrameTimes).toFixed(1);
                console.log(`⚡ [DEBUG Pan Profiler Summary] Total Frames: ${panFrameTimes.length} | Avg FPS: ${fps} | Min Frame: ${minFrame}ms | Max Frame: ${maxFrame}ms | Slow Frames (>33ms): ${slowFrames}/${panFrameTimes.length}`);
            }
        });
    }

    initMapLibreCompatibility(map);

    // Initialize the WebGL bus marker layer system
    if (typeof busLayerManager !== 'undefined') {
        busLayerManager.init(map);
    }

    // Initialize the WebGL stop marker layer system (GL stops let the "Show
    // Stops Above Buses" setting work in maplibre renderer mode).
    if (typeof stopLayerManager !== 'undefined') {
        stopLayerManager.init(map);
    }

    document.dispatchEvent(new Event('rubus-map-created'));
    if (typeof initSpoofing === 'function') { initSpoofing(); }

    if (settings && settings['toggle-pause-update-marker']) {
        pauseUpdateMarkerPositions = settings['toggle-pause-update-marker'];
    }

    currentTileLayerType = 'streets';

    let isTransitioning = false; // Flag to track if the map is transitioning
    let isFittingBounds = false;
    let returningToSavedView = false;

    // Only dim while the user is actively dragging the map. Using just
    // 'dragstart' (not 'movestart') keeps programmatic pans like panout's
    // fitBounds(), flyTo(), and centerme from triggering the fade.
    map.on('dragstart', function() {
        if (!isDesktop && settings['toggle-dim-on-pan'] !== false) {
            $('.bottom, .knight-mover, .info-top-right').css('opacity', '0.4');
        }
    });

    map.on('dragstart', function() {
        mapDragged = true;

        if (isDesktop) {
            return;
        }

        if (isTransitioning || isDesktop || isFittingBounds || returningToSavedView) {
            return; 

        } else {
            isTransitioning = true;

            if (popupBusName && !isDesktop) {
                if (settings['toggle-bypass-max-distance']) {
                    map.setMinZoom(bypassMinZoomLevel);
                } else {
                    const minZoomLevel = defaultMinZoomLevel;
                    map.setMinZoom(minZoomLevel);
                    if (map.getZoom() < minZoomLevel) {
                        map.setZoom(minZoomLevel);
                    }
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
                        busMarkers[marker].setVisibility(true);
                    }
                }
            }

            if (settings['toggle-show-campus-switcher']) {
                $('.campus-switcher').show();
            }

            if (!shownRoute) {
                clearAllStopEtas(); // here instead of in hideInfoBoxes(); so fitting map btn doesn't hide them
            } else {
                updateTooltips(shownRoute);
            }

            $('.favs').show();

            // Temporarily commented out: fly back to previous camera position
            /*
            if (savedCenter && settings['toggle-hide-other-routes']) {
                returningToSavedView = true;
                flyToWithCallback(savedCenter, savedZoom, () => {
                    returningToSavedView = false;
                    savedCenter = null;
                    savedZoom = null;
                });
            }
            */
            savedCenter = null;
            savedZoom = null;
        }
    });

    map.on('moveend', function() {
        isTransitioning = false; // Clear the transitioning flag
        $('.panout').css('color', '#5b5b5b');
        $('.bottom, .knight-mover, .info-top-right').css('opacity', '1');
    });

    isDesktop = $(window).width() > 992;

    $(window).resize(function() {
        isDesktop = $(window).width() > 992;
        updateNextStopsMaxHeight();
        const escNotice = document.getElementById('escDesktopNotice');
        if (escNotice) {
            escNotice.style.display = isDesktop ? 'none' : 'block';
        }
        const $settingsInput = $('#settings-search-input');
        $settingsInput.attr('placeholder', isDesktop ? 'Search settings... (Ctrl + K)' : 'Search settings...');
    });
    
    // Only launch fireworks on open for returning users — first-timers get them after campus confirm
    const isReturningUser = !!(settings && settings['campus']);
    if (isReturningUser && !settings['toggle-disable-fireworks-on-open'] && shouldAutoLaunchFireworks()) {
        launchFireworks(12);
    }

    if (window.location.hostname.includes('.dev')) {
        $('.dev-build-popup').fadeIn().delay(7000).slideUp();
    }

    map.on('movestart dragstart zoomstart touchstart', function() {
        window.isMapDragging = true;
    });

    map.on('moveend dragend zoomend touchend', function() {
        window.isMapDragging = false;
        if (typeof busLayerManager !== 'undefined') {
            busLayerManager.scheduleBatchUpdate();
        }
        // Set max bounds after user finishes dragging after unfocusing on a bus
        if (shouldSetMaxBoundsAfterDrag) {
            if (!settings['toggle-bypass-max-distance']) {
                map.setMaxBounds(expandBounds(bounds[selectedCampus], 2));
            }
            shouldSetMaxBoundsAfterDrag = false; // Reset flag after use
        }
        requestOffScreenUpdate();
    });

    if (typeof initLocationWatchForRiding === 'function') { initLocationWatchForRiding(); }

    map.on('zoom zoomend', updateZoomToast);
    updateZoomToast();

    document.dispatchEvent(new Event('rubus-map-created'));
    if (typeof restoreSettingsPanelState === 'function') {
        restoreSettingsPanelState();
    }
};

$(document).ready(function() {
    updateSettings();
    // The build number doesn't depend on the map or the modals, so fetch it
    // once here rather than from updateSettings() (which runs multiple times).
    getBuildNumber();
    // Only build map on ready if the initial theme selection modal is not visible
    if (!$('.theme-modal').is(':visible')) {
        initMap();
    }
});
