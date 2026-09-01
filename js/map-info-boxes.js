// js/map-info-boxes.js - extracted verbatim from js/map.js
function hideInfoBoxes(instantly_hide) {
    searchReentry = false;
    if (typeof searchBackActive !== 'undefined') searchBackActive = false;
    // console.log('hideInfoBoxes() triggered')
    $('.desktop-esc-notice').hide();

    if (instantly_hide) {
        $('.bus-info-popup, .stop-info-popup, .my-location-popup, .building-info-popup').hide();
        closeSearch();
    } else {
        $('.bus-info-popup, .stop-info-popup, .my-location-popup, .building-info-popup').fadeOut();
        closeSearch();
    }
    
    // Hide the out of service hide button when closing popups
    $('.stop-info-hide-oos').hide();
    // Don't hide/empty the results list here: the search input handler is the
    // single source of truth for results visibility, and it re-runs when the
    // search menu reopens (preserving the last query's matches).

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

        if (typeof stopLayerManager !== 'undefined') {
            stopLayerManager.setSelected(null);
        }

        popupStopId = null;
        thisClosestStopId = null;

        // Restore all route selectors when stop is deselected
        populateRouteSelectors(activeRoutes);

        // Restore map route filter to pre-stop state (pan/drag to close should not leak stop-scoped filter)
        // Use direct show/hide without fitBounds to avoid locking isTransitioning during drag
        if (originalStopShownRoute !== undefined) {
            const routeToRestore = originalStopShownRoute;
            originalStopShownRoute = undefined;
            if (routeToRestore) {
                if (shownRoute !== routeToRestore) {
                    shownRoute = routeToRestore;
                    hidePolylinesExcept(routeToRestore);
                    hideStopsExcept(routeToRestore);
                    updateStopsOpacity();
                    for (const m in busMarkers) {
                        busMarkers[m].setVisibility(!isBusMarkerHiddenByRoute(m));
                    }
                    if (!polylines[routeToRestore]) {
                        addPolylineForRoute(routeToRestore).then(() => {
                            if (shownRoute === routeToRestore) polylines[routeToRestore].setStyle({ opacity: 1 });
                        });
                    } else {
                        polylines[routeToRestore].setStyle({ opacity: 1 });
                    }
                    updateTooltips(routeToRestore);
                    populateRouteSelectors(activeRoutes);
                }
            } else {
                shownRoute = null;
                showAllPolylines();
                showAllBuses();
                showAllStops();
                clearAllStopEtas();
                prunePolylinesWithoutInService();
                populateRouteSelectors(activeRoutes);
            }
        }
        
        $('.settings-btn').show();
        showSimBtnIfEligible();

        checkMinRoutes(); // because .knight-mover is hidden in popStopInfo()
    }

    if (popupBusName) {
        stopOvertimeCounter();
        const busIdThatWasFocused = popupBusName;
        popupBusName = null;
        if (settings['toggle-show-selected-rotation-points']) {
            removeBusRotationPoints(busIdThatWasFocused);
        }
        $('.info-shared-bus-mid').hide();

        // Remove distance line when bus is unfocused
        removeDistanceLineOnFocus();

        // If we just unfocused a bus, check if its route has no in-service buses and prune polyline if needed
        if (busData[busIdThatWasFocused]) {
            const route = busData[busIdThatWasFocused].route;
            const noInService = !routeHasInServiceBuses(route);
            if (noInService && polylines[route]) {
                logPolylineRemoval(route, 'hideInfoBoxes');
                try { polylines[route].remove(); } catch (e) { console.warn('[hideInfoBoxes] failed to remove polyline for route ' + route + ':', e); }
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
        $('.stop-info-back, .stop-info-back-wrapper').stop(true, true).hide();
        sourceBusName = null;
    }

    if (sourceStopId) {
        $('.bus-info-back, .bus-info-back-wrapper').stop(true, true).hide();
        sourceStopId = null;
    }

    if (selectedMarkerId && busMarkers[selectedMarkerId]) {
        const rotationElement = getMarkerRotationElement(busMarkers[selectedMarkerId]);
        if (rotationElement) {
            rotationElement.style.boxShadow = '';
        }
    }
    selectedMarkerId = null;
    // Clear WebGL selection glow
    if (typeof busLayerManager !== 'undefined') {
        busLayerManager.clearSelection();
    }

    if ($('.buses-panel-wrapper').is(':visible')) {
        $('.buses-panel-wrapper').slideUp('fast');
    }

    updateRidingBadgeUI();

    // Restore the "closest stops" widget once all popups/info boxes are hidden
    // (drag, panout, close).
    if (typeof showCenterStops === 'function') {
        showCenterStops();
    }

    // checkMinRoutes(); // to reshow knight mover if hidden; so far only hidden by search wrapper opening // find a better way to reshow. having this here causes a run on each drag.

}

const shownEscTypes = new Set();

function showEscNotice(type) {
    if (typeof isDesktop !== 'undefined' && (!isDesktop || (typeof isTouchDevice !== 'undefined' && isTouchDevice))) return;

    if (!settings['toggle-always-show-esc-hint']) {
        if (shownEscTypes.has(type)) return;
        shownEscTypes.add(type);
    }

    const $notice = $('.desktop-esc-notice');
    if (!$notice.length) return;

    $notice.css('display', 'flex');

    const $svg = $notice.find('.esc-border-glow');
    const $path = $notice.find('.esc-glow-path');

    const W = $svg[0].clientWidth;
    const H = $svg[0].clientHeight;
    const r = 12.8; // 0.8rem border-radius

    const d = `M 0.5 0.5 L ${W - 0.5} 0.5 L ${W - 0.5} ${H - r} Q ${W - 0.5} ${H - 0.5} ${W - r} ${H - 0.5} L ${r} ${H - 0.5} Q 0.5 ${H - 0.5} 0.5 ${H - r} Z`;
    $path.attr('d', d);

    $path.removeClass('animate-glow');
    void $path[0]?.offsetWidth;
    $path.addClass('animate-glow');
}
