// js/map-info-boxes.js - extracted verbatim from js/map.js
function hideInfoBoxes(instantly_hide) {
    stopFollowBus();
    searchReentry = false;
    if (typeof searchBackActive !== 'undefined') searchBackActive = false;
    navReentry = false;
    navBackActive = false;
    // console.log('hideInfoBoxes() triggered')
    $('.desktop-esc-notice').hide();

    if (instantly_hide) {
        $('.bus-info-popup, .stop-info-popup, .my-location-popup, .building-info-popup').hide();
        closeSearch();
    } else {
        $('.bus-info-popup, .stop-info-popup, .my-location-popup, .building-info-popup').fadeOut();
        closeSearch();
    }
    $('.chat-btn').show();
    delete window._panelOpenedAt['right'];
    
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
        
        busStopMarkers[popupStopId].setZIndexOffset(stopMarkersAboveBuses() ? 1000 : 0);

        if (typeof stopLayerManager !== 'undefined') {
            stopLayerManager.setSelected(null);
        }

        // Release any popup-only marker pin (non-rider stops shown for a popup
        // despite no in-service bus). Runs before the route-filter restore below.
        if (appStyle !== 'rider' && typeof clearTemporaryStopPin === 'function') {
            clearTemporaryStopPin();
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
        updateDirectFeedbackBtnVisibility();

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
        $('.info-capacity-percent').hide();
        $('.info-speed-wrapper').css('visibility', 'hidden');

        // Remove distance line when bus is unfocused
        removeDistanceLineOnFocus();

        // If we just unfocused a bus, check if its route has no in-service buses and prune polyline if needed
        if (busData[busIdThatWasFocused]) {
            const route = busData[busIdThatWasFocused].route;
            const noInService = !routeHasInServiceBuses(route);
            if (noInService && removePolyline(route, 'hideInfoBoxes')) {
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

    if (sourceRouteName) {
        $('.stop-info-back, .stop-info-back-wrapper, .bus-info-back, .bus-info-back-wrapper').stop(true, true).hide();
        sourceRouteName = null;
    }

    if (sourceStopId) {
        $('.bus-info-back, .bus-info-back-wrapper').stop(true, true).hide();
        sourceStopId = null;
    }

    // Drop any saved stop <-> bus return state (2nd-loop expansion, menu
    // scroll positions) when all popups close — a fresh open starts at top.
    // window.* prefix: these are var-declared in poly.js, so plain property
    // access/assignment (never throws, even cross-file load order).
    window.sourceStopSecondLoopOpen = false;
    window.sourceStopScrollTop = 0;
    window.sourceStopScrollStopId = null;
    window.sourceBusScrollTop = 0;
    window.sourceBusScrollBusName = null;

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

    // DISABLED: Your Bus feature // updateRidingBadgeUI();

    // Restore the "closest stops" widget once all popups/info boxes are hidden
    // (drag, panout, close).
    if (typeof showCenterStops === 'function') {
        showCenterStops();
    }

    // checkMinRoutes(); // to reshow knight mover if hidden; so far only hidden by search wrapper opening // find a better way to reshow. having this here causes a run on each drag.

}

// Menus that have already shown the hint this page load. After a user has seen
// the hint, further opens of that menu only get a delayed reminder.
const shownEscTypes = new Set();

// The menu each hint type belongs to, checked when a reminder timer fires.
const escMenuSelectors = {
    bus: '.bus-info-popup',
    stop: '.stop-info-popup',
    building: '.building-info-popup',
    info: '.info-panels-show-hide-wrapper'
};

// Bumped on every open of a menu. A reminder timer compares its captured token
// so that a newer open supersedes a still-pending reminder from an older one.
const escOpenTokens = {};

// How long a repeat open of the same menu must stay open before the hint is
// shown again, so returning users learn nothing new but stuck users are reminded.
const ESC_HINT_REMINDER_DELAY_MS = 5000;

function showEscNoticeNow() {
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

function showEscNotice(type) {
    // Every right-side popup (bus/stop/building) funnels through here on open.
    if (type !== 'info') {
        markPanelOpened('right');
    }

    if (!isDesktop || isTouchDevice) return;

    const token = escOpenTokens[type] = (escOpenTokens[type] || 0) + 1;

    // "Always Show Esc Hint" opts out of the once-per-type rule entirely.
    if (!settings['toggle-always-show-esc-hint']) {
        if (shownEscTypes.has(type)) {
            // Already seen: stay quiet on open, then remind only if the user is
            // still in that same menu after the delay.
            setTimeout(() => {
                if (escOpenTokens[type] !== token) return; // superseded by a newer open
                if (!$(escMenuSelectors[type]).is(':visible')) return;
                showEscNoticeNow();
            }, ESC_HINT_REMINDER_DELAY_MS);
            return;
        }
        shownEscTypes.add(type);
    }

    showEscNoticeNow();
}

// Clicking the "Press Esc to close" pill does the same thing as pressing Esc,
// so touch/click users get the same escape hatch the hint promises.
$(document).on('click', '.desktop-esc-notice', function() {
    document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        bubbles: true,
        cancelable: true
    }));
});
