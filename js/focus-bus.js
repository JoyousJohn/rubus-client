// js/focus-bus.js - extracted verbatim from js/map.js
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

// Dev-helper state: buses force-treated as departed (forceUnstopBus) so the
// stopped label stays gone. Clear with forceUnstoppedBuses.delete(busName).
const forceUnstoppedBuses = new Set();

async function focusBus(busName) {
    // Captured at entry: the await below yields to the event loop, but the
    // whole focus still belongs to the tap, so keep logging post-await too.
    const _fTap = (typeof performance !== 'undefined' && window.busPopupPerfLog && window.__busPopupT0 != null && (performance.now() - window.__busPopupT0) < 8000);
    const _flog = (stage) => { if (_fTap) window.busPopupPerfLog(stage, busName); };
    _flog('focusBus entry');
    // Clear panout feedback when focusing on a bus
    clearPanoutFeedback();

    if (!busData[busName]) {
        console.warn(`focusBus: bus ${busName} no longer in busData (possible OOS race)`);
        return;
    }

    const route = busData[busName].route;

    hideStopsExcept(route)
    hidePolylinesExcept(route)
    _flog('focusBus: after hideStopsExcept + hidePolylinesExcept');

    // Ensure the route polyline exists for focusing (temporary show for OOS routes).
    // Failure to load is non-fatal — we fall back to centering on the bus — but it
    // must not be hidden.
    _flog(`focusBus: before polyline ensure (cached=${!!polylines[route]})`);
    if (!polylines[route]) {
        try {
            await addPolylineForRoute(route);
        } catch (e) {
            console.error(`focusBus: failed to load polyline for route ${route}; centering on bus`, e);
        }
    }
    _flog('focusBus: after polyline ensure (await resolved)');

    // The await above yields to the event loop, during which the bus may have gone
    // out of service and been removed from busData. Re-assert the invariant before
    // touching busData again — the entry guard can't cover this race.
    if (!busData[busName]) {
        console.error(`focusBus: bus ${busName} removed from busData while loading polyline; aborting focus`);
        return;
    }
    if (popupBusName && popupBusName !== busName) {
        console.warn('[focus-bus] Aborting focus for ' + busName + '; user selected ' + popupBusName);
        return;
    }
    const bus = busData[busName];

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
            busMarkers[marker].setVisibility(false);
        }
    }
    _flog(`focusBus: after hiding other bus markers (total=${Object.keys(busMarkers).length})`);

    // Temporarily commented out: refit bounds to focused bus's route
    /*
    const topContainerHeight = 1 - ($(window).height() - $('.bus-btns').offset().top)/$(window).height()

    let focusBounds = null;
    if (polylines[route]) {
        const rb = polylines[route].getBounds();
        focusBounds = L.latLngBounds(rb.getSouthWest(), rb.getNorthEast());
    }

    // Always contribute the bus's own position. This is the general fallback
    // that makes focusBounds-null impossible for any bus with coordinates,
    // depot or not, polyline or not.
    if (bus.lat !== undefined && bus.long !== undefined) {
        const busLocBounds = L.latLngBounds(L.latLng(bus.lat, bus.long));
        if (focusBounds) {
            focusBounds.extend(busLocBounds);
        } else {
            focusBounds = busLocBounds;
        }
    }

    // Invariant: a bus in busData must have usable coordinates. Reaching here
    // with neither a route polyline nor coordinates is a data bug — fail loud.
    if (!focusBounds) {
        throw new Error(`focusBus: cannot compute bounds for ${busName} (route "${route}" has no polyline and bus has no coordinates)`);
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
    */

    if (!savedCenter) {
        savedCenter = map.getCenter();
        savedZoom = map.getZoom();
    }
    _flog('focusBus: exit');
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
    // TEMP PERF DEBUG: time the full polyline scan; only logs slow calls.
    const _d0 = (typeof performance !== 'undefined') ? performance.now() : 0;
    if (!busData[busName] || busData[busName].lat === undefined || busData[busName].long === undefined) {
        return returnDetails ? { isOffLine: false, feet: 0 } : false;
    }
    const busLatLng = L.latLng(busData[busName].lat, busData[busName].long);
    const route = busData[busName].route;

    // Fast reject: if the bus is well outside the route's cached bounding box,
    // it is definitely >500ft off the line — skip the per-point scan entirely.
    // The margin (~0.006deg ≈ 660m) exceeds the 500ft threshold so a bus just
    // off the route edge still falls through to the accurate scan.
    if (route && routeBounds[route]) {
        const rb = routeBounds[route];
        if (rb && typeof rb.getSouth === 'function') {
            const margin = 0.006;
            if (busLatLng.lat < rb.getSouth() - margin || busLatLng.lat > rb.getNorth() + margin ||
                busLatLng.lng < rb.getWest() - margin || busLatLng.lng > rb.getEast() + margin) {
                return returnDetails ? { isOffLine: true, feet: 10000 } : true;
            }
        }
    }

    let polyPoints = null;
    if (route && polylines[route]) {
        polyPoints = polylines[route].getLatLngs();
    } else if (route && routePointsCache[route]) {
        polyPoints = routePointsCache[route];
    }

    if (!polyPoints || !polyPoints.length) return returnDetails ? { isOffLine: false, feet: 0 } : false;
    
    // Group into rings: a flat point list is one run, a list of lists is several.
    // Points are only ever paired within a ring, so two runs are never joined by
    // a segment the map does not draw.
    let rings;
    const firstPoint = polyPoints[0];
    if (Array.isArray(firstPoint) && typeof firstPoint[0] === 'number') {
        rings = [polyPoints];                       // [[lat, lng], ...]
    } else if (Array.isArray(firstPoint)) {
        rings = polyPoints.filter(ring => Array.isArray(ring) && ring.length > 1);
    } else {
        rings = [polyPoints];                       // [{lat, lng}, ...]
    }

    // Measure in a local metre plane centred on the bus: raw longitude degrees are
    // ~cos(lat) too wide, and this keeps the projection a true perpendicular one
    // without a spherical call per point.
    const metresPerLatDeg = 111194.9;
    const metresPerLngDeg = metresPerLatDeg * Math.cos(busLatLng.lat * Math.PI / 180);
    const pointLat = (pt) => Array.isArray(pt) ? Number(pt[0]) : Number(pt.lat);
    const pointLng = (pt) => Array.isArray(pt) ? Number(pt[1]) : Number(pt.lng);

    let minDist = Infinity;
    let pointCount = 0;
    for (const ring of rings) {
        pointCount += ring.length;
        for (let i = 0; i + 1 < ring.length; i++) {
            const aLat = pointLat(ring[i]), aLng = pointLng(ring[i]);
            const bLat = pointLat(ring[i + 1]), bLng = pointLng(ring[i + 1]);
            if (!Number.isFinite(aLat) || !Number.isFinite(aLng) ||
                !Number.isFinite(bLat) || !Number.isFinite(bLng)) continue;

            const ax = (aLng - busLatLng.lng) * metresPerLngDeg;
            const ay = (aLat - busLatLng.lat) * metresPerLatDeg;
            const bx = (bLng - busLatLng.lng) * metresPerLngDeg;
            const by = (bLat - busLatLng.lat) * metresPerLatDeg;

            // Nearest point on the segment: project onto the line through A and B,
            // then clamp the parameter to [0,1] so the foot can't land off the ends.
            const dx = bx - ax, dy = by - ay;
            const lenSq = dx * dx + dy * dy;
            let t = lenSq > 0 ? -(ax * dx + ay * dy) / lenSq : 0;
            if (t < 0) t = 0;
            else if (t > 1) t = 1;

            const cx = ax + t * dx, cy = ay + t * dy;
            const d = Math.sqrt(cx * cx + cy * cy);
            if (d < minDist) minDist = d;
        }
    }

    if (minDist === Infinity) return returnDetails ? { isOffLine: false, feet: 0 } : false;
    try {
        if (typeof performance !== 'undefined' && window.busPopupPerfLog) {
            const _dDur = performance.now() - _d0;
            if (_dDur > 25) window.busPopupPerfLog(`distanceFromLine SLOW: ${_dDur.toFixed(1)}ms points=${pointCount}`, busName);
        }
    } catch (e) {}
    
    const distanceFeet = minDist * 3.28084;
    const isOffLine = distanceFeet > 333;

    if (returnDetails) {
        return { isOffLine: isOffLine, feet: Math.round(distanceFeet) };
    }
    return isOffLine;
}

function isBusShownOnMap(busName) {
    if (!busData[busName]) return false;
    if (sim === true || busData[busName].type === 'sim') return true;
    if (settings['toggle-show-out-of-service']) return true;
    return !(busData[busName].oos || busData[busName].atDepot || distanceFromLine(busName));
}

// True for buses that are genuinely running the route (not out of service,
// at the depot, or far from the line). Independent of the "show out of
// service buses" setting so it can be used for things like computing fit
// bounds, which should always ignore OOS/depot/far-from-line buses even
// when they are otherwise shown on the map.
function isBusInService(busName) {
    if (!busData[busName]) return false;
    if (sim === true || busData[busName].type === 'sim') return true;
    return !(busData[busName].oos || busData[busName].atDepot || distanceFromLine(busName));
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
        return `Stopped ${hours}h ${minutes}m ${seconds}s`;
    } else if (totalSeconds >= 60) {
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `Stopped ${minutes}m ${seconds}s`;
    } else if (totalSeconds > 0) {
        return `Stopped ${totalSeconds}s`;
    } else {
        return "Stopped 0s";
    }
}

// Hide and clear the "Stopped Xm Xs" label (bus departed, unfocused, or no
// longer at a stop). The label fades out; the bus-name slide-to-center that
// used to accompany it is disabled (see hideStoppedFor()).
const STOPPED_FOR_FADE_MS = 300;

// Dev helper: force-treat a bus as departed (console: forceUnstopBus('4054'))
// so the "Stopped Xm Xs" label fades out. Only animates if that bus's popup
// is the one open.
function forceUnstopBus(busName) {
    busName = String(busName); // accept ints (4054) too — keys/set membership are string-based
    forceUnstoppedBuses.add(busName);
    console.log(`[forceUnstopBus] ${busName} marked force-unstopped`);

    if (busData[busName]) {
        busData[busName].at_stop = false;
        delete busData[busName].timeArrived;
        delete busData[busName].overtime;
        console.log(`[forceUnstopBus] cleared at_stop/timeArrived/overtime for ${busName}`);
    } else {
        console.warn(`[forceUnstopBus] ${busName} not found in busData`);
    }

    if (popupBusName === busName) {
        console.log(`[forceUnstopBus] popup is on ${busName}; label visible: ${!$('.info-stopped-for').hasClass('none')}`);
        hideStoppedFor();
    } else {
        console.warn(`[forceUnstopBus] popup is on ${popupBusName}, not ${busName}. Open ${busName}'s popup (selectBusMarker('${busName}')) with its "Stopped" label visible, then re-run.`);
    }
}

let departingTimeout = null;

function showDeparting() {
    clearInterval(stoppedForInterval);
    stoppedForInterval = null;
    clearTimeout(stoppedForHideTimeout);
    stoppedForHideTimeout = null;
    clearTimeout(departingTimeout);

    const $stoppedFor = $('.info-stopped-for');
    $stoppedFor.removeClass('none').removeClass('overtime').addClass('departing').css('opacity', '').css('transition', '');
    $('.info-stopped-for-text').text('Departing...');
    $('.info-stopped-for .info-stopped-octagon').addClass('none');
    hideStoppedOctagon();
    stopOvertimeCounter();

    departingTimeout = setTimeout(() => {
        departingTimeout = null;
        const $stoppedFor = $('.info-stopped-for');
        if ($stoppedFor.hasClass('none')) return;
        $stoppedFor.slideUp(200, () => {
            $stoppedFor.addClass('none').removeClass('overtime').removeClass('departing').css('opacity', '').css('transition', '').css('display', '');
            $('.info-stopped-for-text').text('');
            $('.info-stopped-for .info-stopped-octagon').addClass('none');
            $('.info-stopped-overtime-explainer').hide();
            stopOvertimeCounter();
        });
    }, 7000);
}

function hideStoppedFor(immediate = false) {
    clearInterval(stoppedForInterval);
    stoppedForInterval = null;
    clearTimeout(stoppedForHideTimeout);
    stoppedForHideTimeout = null;
    clearTimeout(departingTimeout);
    departingTimeout = null;

    const $stoppedFor = $('.info-stopped-for');

    // Nothing to fade out if the label is already hidden.
    if ($stoppedFor.hasClass('none')) {
        $stoppedFor.removeClass('departing');
        stopOvertimeCounter();
        return;
    }
    $stoppedFor.removeClass('departing');

    if (immediate) {
        $stoppedFor.stop(true, true).addClass('none').removeClass('overtime').removeClass('departing').css('opacity', '').css('transition', '');
        $('.info-stopped-for-text').text('');
        $('.info-stopped-for .info-stopped-octagon').addClass('none');
        $('.info-stopped-overtime-explainer').hide();
        stopOvertimeCounter();
        return;
    }

    // Bus-name slide-to-center animation disabled (the name now sits beside the
    // route, not on the stopped label's row); only the label fade-out remains.
    // const $name = $('.info-name-mid');
    // const startLeft = $name[0].getBoundingClientRect().left;
    // $stoppedFor.addClass('none');
    // const endLeft = $name[0].getBoundingClientRect().left;
    // $stoppedFor.removeClass('none');
    // void $stoppedFor[0].offsetWidth;
    // const delta = endLeft - startLeft;

    // Kick off the fade-out transition on the visible label.
    $stoppedFor.css('transition', `opacity ${STOPPED_FOR_FADE_MS}ms ease`).css('opacity', 0);

    // if (delta) {
    //     $name.css('transition', `transform ${STOPPED_FOR_FADE_MS}ms ease`);
    //     void $name[0].offsetWidth; // force reflow so the transform animates from its current spot
    //     $name.css('transform', `translateX(${delta}px)`);
    // }

    stoppedForHideTimeout = setTimeout(() => {
        stoppedForHideTimeout = null;
        // Drop the label from the row and clear the inline opacity/transition.
        $stoppedFor.addClass('none').removeClass('overtime').removeClass('departing').css('opacity', '').css('transition', '');
        $('.info-stopped-for-text').text('');
        $('.info-stopped-for .info-stopped-octagon').addClass('none');
        // $name.css('transition', 'none').css('transform', 'none');
        stopOvertimeCounter();
    }, STOPPED_FOR_FADE_MS);
}

function startStoppedForTimer(busName) {

    clearInterval(stoppedForInterval); // not sure what could be causing the double timer that requires me to add this

    // Force-unstopped (dev helper): never re-show the stopped label.
    if (forceUnstoppedBuses.has(busName)) {
        return;
    }

    // Mutual exclusion: don't show "Stopped for" when the OOS/line-invalid
    // notice would also be visible (renderNextStopsGrid's isInvalidOrOos).
    // This prevents both notices appearing side-by-side in .info-extra.
    const dataForGuard = busData[busName];
    const isInvalidOrOosForGuard = !dataForGuard || !('next_stop' in dataForGuard) || !busETAs[busName] || dataForGuard.oos || dataForGuard.atDepot || distanceFromLine(busName);
    if (isInvalidOrOosForGuard) {
        if (dataForGuard && dataForGuard.at_stop === true) {
            window._lastContradictionWarn = window._lastContradictionWarn || {};
            const _now = Date.now();
            if (!window._lastContradictionWarn[busName] || _now - window._lastContradictionWarn[busName] > 30000) {
                window._lastContradictionWarn[busName] = _now;
                console.warn(`[bus-info-contradiction] Bus ${busName} at_stop=true but invalid/OOS (next_stop=${dataForGuard.next_stop} oos=${dataForGuard.oos} atDepot=${dataForGuard.atDepot} hasETA=${!!busETAs[busName]} offLine=${distanceFromLine(busName)} offLineDetails=${JSON.stringify(distanceFromLine(busName, true))}) - suppressing "Stopped for" timer for mutual exclusion with "Bus may be exiting..." notice`);
            }
        }
        hideStoppedFor(true);
        return;
    }

    // Cancel any in-progress fade-out from hideStoppedFor() or departing and reset the
    // inline opacity/transition it set, so the freshly-shown label is fully
    // visible.
    clearTimeout(stoppedForHideTimeout);
    stoppedForHideTimeout = null;
    clearTimeout(departingTimeout);
    departingTimeout = null;
    $('.info-stopped-for').removeClass('departing').css('opacity', '').css('transition', '');

    const arrivedDatetime = new Date(busData[busName].timeArrived);
    const now = new Date()//.toISOString();
    // console.log(now)
    const secondsDifference = Math.floor((now - arrivedDatetime) / 1000);
    // console.log('secondsDifference: ', secondsDifference)

    // "Stopped 4m 5s" - the label sits on its own line above the bus route.
    $('.info-stopped-for').removeClass('none').find('.info-stopped-for-text').text(formatStoppedTime(secondsDifference));
    
    let seconds = secondsDifference
    stoppedForInterval = setInterval(() => {
        if (popupBusName === busName) {
            const step = (sim === true) ? Math.max(1, (window.SIM_TIME_MULTIPLIER || 1)) : 1;
            if (!settings['toggle-pause-stopped-for-timer']) {
                seconds += step;
                $('.info-stopped-for').removeClass('none').find('.info-stopped-for-text').text(formatStoppedTime(seconds));
            }
        } else {
            clearInterval(stoppedForInterval);
        }
    }, 1000);
}

// Follow mode: after flyToBus lands, keep panning the map so the bus stays
// where it landed on screen while it moves. Driven each frame from the
// marker's interpolated position (same source as the route rail), so it
// tracks smoothly between polls. Ends on user drag, refocus, or bus removal.
let followedBusName = null;
let followAnchorPoint = null;
let followFrameId = null;
let followDragHandler = null;
let followMoveEndHandler = null;
let followContainerHandlers = null;

function stopFollowBus() {
    followedBusName = null;
    followAnchorPoint = null;
    if (followFrameId !== null) {
        cancelAnimationFrame(followFrameId);
        followFrameId = null;
    }
    if (followDragHandler) {
        map.off('dragstart', followDragHandler);
        map.off('zoomstart', followDragHandler);
        map.off('rotatestart', followDragHandler);
        map.off('pitchstart', followDragHandler);
        followDragHandler = null;
    }
    if (followMoveEndHandler) {
        map.off('moveend', followMoveEndHandler);
        followMoveEndHandler = null;
    }
    if (followContainerHandlers) {
        const c = map.getContainer();
        c.removeEventListener('mousedown', followContainerHandlers.mousedown);
        c.removeEventListener('touchstart', followContainerHandlers.touchstart);
        followContainerHandlers = null;
    }
}

function followTick() {
    followFrameId = null;
    if (!followedBusName || popupBusName !== followedBusName) {
        stopFollowBus();
        return;
    }
    const marker = busMarkers[followedBusName];
    const bus = busData[followedBusName];
    if (!marker || !bus || marker._isOnMap === false) {
        stopFollowBus();
        return;
    }
    let ll = marker.getLatLng() || { lat: Number(bus.lat), lng: Number(bus.long) };
    if (!Number.isFinite(ll.lat) || !Number.isFinite(ll.lng)) {
        stopFollowBus();
        return;
    }
    const pt = map.latLngToContainerPoint([ll.lat, ll.lng]);
    // Apply the exact float delta (no whole-pixel threshold): the camera is
    // float-precise, so sub-pixel pans track smoothly. A >=1px deadband lets
    // drift accumulate then snaps the whole scene at once — the creep-snap
    // cycle that reads as jitter at low speeds. Epsilon only skips work when
    // effectively stationary.
    const dx = pt.x - followAnchorPoint.x;
    const dy = pt.y - followAnchorPoint.y;
    if (Math.abs(dx) > 0.05 || Math.abs(dy) > 0.05) {
        map.panBy([dx, dy], { animate: false });
    }
    followFrameId = requestAnimationFrame(followTick);
}

function startFollowBus(busName) {
    stopFollowBus();
    followedBusName = busName;
    const container = map.getContainer();
    const earlyStop = () => stopFollowBus();
    container.addEventListener('mousedown', earlyStop, { once: true });
    container.addEventListener('touchstart', earlyStop, { once: true, passive: true });
    followContainerHandlers = { mousedown: earlyStop, touchstart: earlyStop };
    followDragHandler = () => stopFollowBus();
    map.on('dragstart', followDragHandler);
    map.on('zoomstart', followDragHandler);
    map.on('rotatestart', followDragHandler);
    map.on('pitchstart', followDragHandler);
    followMoveEndHandler = function() {
        if (followedBusName !== busName) return;
        const marker = busMarkers[busName];
        const bus = busData[busName];
        if (!marker || !bus) {
            stopFollowBus();
            return;
        }
        let ll = marker.getLatLng() || { lat: Number(bus.lat), lng: Number(bus.long) };
        followAnchorPoint = map.latLngToContainerPoint([ll.lat, ll.lng]);
        map.off('moveend', followMoveEndHandler);
        followMoveEndHandler = null;
        followFrameId = requestAnimationFrame(followTick);
    };
    map.on('moveend', followMoveEndHandler);
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

    const markerLatLng = busMarkers[busName]?.getLatLng?.();
    const lat = markerLatLng?.lat ?? Number(busData[busName].lat);
    const lng = markerLatLng?.lng ?? Number(busData[busName].long);
    const targetZoom = 15.5;

    // Leaving a stop for a bus: remember the stop's 2nd-loop expansion and
    // scroll position so the bus back button can restore them. The visibility
    // guard keeps unrelated flyToBus callers (fav, search) from clobbering it.
    if (popupStopId != null && $('.stop-info-popup').is(':visible')) {
        window.sourceStopSecondLoopOpen = $('.stop-info-next-loop-wrapper').is(':visible');
        window.sourceStopScrollTop = $('.stop-info-popup-inner').scrollTop() || 0;
        window.sourceStopScrollStopId = Number(popupStopId);
    }

    selectBusMarker(busName);

    // Center the bus in the map area still visible below the bus info popup.
    // The popup is shown synchronously by selectBusMarker → popInfo, so its
    // current content bottom (above the action-button row) is measurable here.
    // Follow once the flight has been started: the flight can be deferred while
    // a keyboard dismisses, and starting the follow before that would let the
    // flight's stopFollowBus() cancel it.
    const contentEl = document.querySelector('.bus-info-popup .info-next-stops');
    flyToCenteredBelow([lat, lng], targetZoom, contentEl, 0.3, () => startFollowBus(busName));
}


let overtimeInterval;
let overtimeBusId;

// Fade the overtime octagon in. It toggles display:none, and a transition
// can't animate from a display:none before-state, so ramp opacity manually
// with a forced reflow (same technique as hideStoppedFor).
function showStoppedOctagon() {
    const $oct = $('.info-stopped-for .info-stopped-octagon');
    clearTimeout(stoppedOctagonHideTimeout);
    stoppedOctagonHideTimeout = null;
    if (!$oct.hasClass('none')) {
        $oct.css('transition', 'none').css('opacity', 1);
        return;
    }
    $oct.removeClass('none').css('transition', 'none').css('opacity', 0);
    void $oct[0].offsetWidth;
    $oct.css('transition', `opacity ${STOPPED_FOR_FADE_MS}ms ease`).css('opacity', 1);
}

// Fade the overtime octagon out, then drop it from the layout.
function hideStoppedOctagon() {
    const $oct = $('.info-stopped-for .info-stopped-octagon');
    if ($oct.hasClass('none')) return;
    clearTimeout(stoppedOctagonHideTimeout);
    $oct.css('transition', `opacity ${STOPPED_FOR_FADE_MS}ms ease`).css('opacity', 0);
    stoppedOctagonHideTimeout = setTimeout(() => {
        stoppedOctagonHideTimeout = null;
        $oct.addClass('none').css('opacity', '').css('transition', '');
    }, STOPPED_FOR_FADE_MS);
}

function startOvertimeCounter(busName) {

    // Force-unstopped (dev helper): never re-show the overtime indicator.
    if (forceUnstoppedBuses.has(busName)) {
        return;
    }

    if (busName === overtimeBusId) {
        return;
    }

    overtimeBusId = busName;

    if (overtimeInterval) {
        clearInterval(overtimeInterval);
    }

    // Show the overtime indicator (red octagon + red text) and keep it in
    // sync with the overtime flag, auto-cleaning when the bus is no longer
    // overtime.
    const applyOvertimeState = () => {
        if (busData[busName] && busData[busName]['overtime']) {
            $('.info-stopped-for').removeClass('none').addClass('overtime');
            showStoppedOctagon();
        } else {
            stopOvertimeCounter();
        }
    };

    applyOvertimeState();
    overtimeInterval = setInterval(applyOvertimeState, 1000);
}

function stopOvertimeCounter() {
    if (overtimeInterval) {
        clearInterval(overtimeInterval);
        overtimeInterval = null;
        overtimeBusId = null;
    }
    $('.info-stopped-for').removeClass('overtime');
    hideStoppedOctagon();
    $('.info-stopped-overtime-explainer').slideUp('fast');
}

// Slide down overtime explanation when tapping the timer row or octagon while overtime is active
$(document).on('click', '.info-stopped-row', function(e) {
    e.stopPropagation();
    const $explainer = $('.info-stopped-overtime-explainer');
    if (!$explainer.is(':visible') && ($('.info-stopped-for').hasClass('overtime') || !$('.info-stopped-for .info-stopped-octagon').hasClass('none'))) {
        $explainer.stop(true, true).slideDown('fast');
    }
});

$(document).on('click', '.info-stopped-overtime-explainer', function(e) {
    e.stopPropagation();
    $(this).stop(true, true).slideUp('fast');
});

$('.satellite-btn').click(function() {
    if (currentTileLayerType === 'satellite') {
        const theme = resolveAutoTheme(settings['theme']);
        const newTheme = resolveMapTileStyle(theme);
        setMapRasterTiles(getTileUrlPattern(newTheme));
        currentTileLayerType = 'streets';

        $(this).removeClass('active');
    } else {
        setMapRasterTiles(`https://tiles.rubus.live/styles/v1/satellite-streets-v11/tiles/{z}/{x}/{y}.png`);
        currentTileLayerType = 'satellite';

        let theme = resolveAutoTheme(settings['theme']);
        $(this).addClass('active');
    }
    updateRouteArrowsTheme();
});
