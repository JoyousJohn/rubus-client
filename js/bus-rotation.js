// js/bus-rotation.js - extracted verbatim from js/map.js
let busRotationPoints = {}

// Remove a bus's rotation debug layers (pt1/pt2 markers and the connecting
// line). These are otherwise only cleaned at the start of calculateRotation,
// which won't run again for a bus whose lifecycle has ended (OOS via the
// polling path, sim exit, campus switch), so they'd persist on the map.
function removeBusRotationPoints(busName) {
    if (busRotationPoints[busName]) {
        ['pt1', 'pt2', 'line'].forEach(val => {
            const layer = busRotationPoints[busName][val];
            if (layer && typeof layer.remove === 'function') {
                try { layer.remove(); } catch (e) {}
            }
        });
        delete busRotationPoints[busName];
    }
}

// Coerce any rotation source (missing/invalid/non-numeric) to a finite
// number, defaulting to 0, so rotation math never produces NaN.
function normalizeRotation(rotation) {
    const n = Number(rotation);
    return Number.isFinite(n) ? n : 0;
}

// Resolve the route polyline points for a bus's route as a flat array of
// [lat, lng] pairs, from the points cache (persists across polyline layer
// pruning) or the live polyline layer. Returns null when unavailable.
function getRoutePolylinePoints(route) {
    let points = null;
    if (route && routePointsCache && routePointsCache[route]) {
        points = routePointsCache[route];
    } else if (route && polylines && polylines[route] && typeof polylines[route].getLatLngs === 'function') {
        points = polylines[route].getLatLngs();
    }
    if (!points || !points.length) return null;
    // Flatten multi-segment polylines into a single flat list of [lat, lng].
    if (Array.isArray(points[0])) {
        if (typeof points[0][0] === 'number') {
            return points;
        }
        return points.flat(1);
    }
    return points;
}

const calculateRotation = (busName, loc) => {
    // Tear down the previous call's debug layers BEFORE the early return below.
    // The original only cleaned up inside the stopLines branch, so layers leaked
    // permanently once a bus left a stop that has rotation points.
    if (busRotationPoints[busName]) {
        ['pt1', 'pt2', 'line'].forEach(val => {
            busRotationPoints[busName][val].remove();
        });
        delete busRotationPoints[busName];
    }

    let newRotation;
    if (!pauseRotationUpdating) {
        const bus = busData[busName];

        // When a bus is sitting at a stop, its physical GPS rotation is
        // unreliable — tiny stationary movements make the reported course
        // jitter. Override it by finding the closest point on the bus's route
        // polyline and pointing along the segment to the next polyline point,
        // so the marker faces where it's expected to drive next. Only the
        // rotation is overridden; the position is never touched here. The
        // "Disable Bus Rotation Fix at Stops" dev toggle turns this off.
        if (bus && bus.at_stop && !settings['toggle-disable-bus-rotation-fix-at-stop']) {
            const rawPoints = getRoutePolylinePoints(bus.route);
            if (rawPoints && rawPoints.length >= 2) {
                const polyPoints = rawPoints.map(pt => {
                    if (Array.isArray(pt)) {
                        return { lng: pt[1], lat: pt[0] };
                    }
                    return { lng: pt.lng, lat: pt.lat };
                });
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

                // Only build the debug layers when the dev toggle is on; the
                // bearing calculation above always runs so bus rotation stays correct.
                if (settings['toggle-show-rotation-points']) {
                    busRotationPoints[busName] = {}

                    // Add markers for the points
                    busRotationPoints[busName]['pt1'] = L.circleMarker(pt1, {
                        radius: 6,
                        fillColor: "red",
                        color: "#000",
                        weight: 0,
                        opacity: 1,
                        fillOpacity: 1
                    }).addTo(map);

                    busRotationPoints[busName]['pt2'] = L.circleMarker(pt2, {
                        radius: 6,
                        fillColor: "blue",
                        color: "#000",
                        weight: 0,
                        opacity: 1,
                        fillOpacity: 1
                    }).addTo(map);

                    // Add green line between the points
                    busRotationPoints[busName]['line'] = L.polyline([pt1, pt2], {
                        color: 'green',
                        weight: 3,
                        opacity: 1
                    }).addTo(map);
                }

                const toRad = deg => deg * Math.PI / 180;
                const toDeg = rad => rad * 180 / Math.PI;
                const dLon = toRad(pt2.lng - pt1.lng);
                const y = Math.sin(dLon) * Math.cos(toRad(pt2.lat));
                const x = Math.cos(toRad(pt1.lat)) * Math.sin(toRad(pt2.lat)) - Math.sin(toRad(pt1.lat)) * Math.cos(toRad(pt2.lat)) * Math.cos(dLon);
                let bearing = Math.atan2(y, x);
                bearing = (toDeg(bearing) + 360) % 360;
                newRotation = bearing + 45;
                // console.log(`New rotation for bus: ${busData[busName].busName}: ${newRotation}`)
                return newRotation;
            }

            // Route polyline unavailable; fall back to the GPS rotation.
            return normalizeRotation(bus.rotation) + 45;
        }

        newRotation = normalizeRotation(bus.rotation) + 45;
    } else {
        newRotation = normalizeRotation(busData[busName].rotation) + 45;
    }
    return newRotation;
};

// Immediately snap the rotation of every marker currently sitting at a stop to
// whatever rotation the current "Disable Bus Rotation Fix at Stops" toggle
// state calls for (polyline-derived when the fix is enabled, GPS when it's
// disabled), instead of letting the in-flight easing animation crawl toward it.
function immediatelyUpdateStoppedBusRotations() {
    if (typeof busData === 'undefined' || typeof busMarkers === 'undefined') return;
    for (const busName in busData) {
        const bus = busData[busName];
        if (!bus || !bus.at_stop) continue;
        if (bus.lat === undefined || bus.long === undefined) continue;
        const marker = busMarkers[busName];
        if (!marker || typeof marker.setRotation !== 'function') continue;

        // Kill the easing animation so its per-frame rotation writes can't
        // fight the snap below. Position isn't touched; a settled stopped bus
        // is already at its target position anyway.
        cancelBusAnimation(busName);

        const loc = { lat: bus.lat, long: bus.long };
        const newRotation = calculateRotation(busName, loc);
        if (newRotation !== undefined) {
            marker.setRotation(newRotation);
        }
    }
}


const animationFrames = {}
let busAnimationFrameId = null;
let pauseRotationUpdating = false;

// Each animation step declares its own interval via step.stepIntervalMs
// (0 = every rAF frame). Custom DOM-mode markers run at full frame rate;
// WebGL markers flush through source.setData()/updateData(), which rebuilds
// the worker tile index per flush, so they step at ~30Hz. The
// "bus-animation-rate" dev setting ("off"/"10hz"/"30hz") forces a fixed step
// for every mode, or keeps the per-mode defaults when "off".
const BUS_ANIMATION_STEP_MS = 100;   // 10Hz step mode
const WEBGL_ANIMATION_STEP_MS = 33;  // ~30Hz step mode
const animationLastStep = {};

// Screen-space margin (CSS px) added around the viewport when computing the
// off-screen animation cull bounds, so markers pause just past the visible
// map edge instead of exactly at it (no visible freezing at the border).
const BUS_CULL_MARGIN_PX = 200;

// Expanded viewport bounds used by the "Cull Off-Screen Bus Markers" dev
// setting. Rebuilt once per animation tick (null when culling is off, so the
// default path is untouched).
let busAnimationCullBounds = null;

// Compute a pixel-margin-expanded viewport as lat/lng bounds. A pixel margin
// (not a bounds ratio) keeps the slack constant in screen space at every zoom.
function computeBusAnimationCullBounds() {
    if (!map || typeof map.getSize !== 'function' || typeof map.containerPointToLatLng !== 'function') return null;
    const size = map.getSize();
    if (!size || size.x <= 0 || size.y <= 0) return null;
    const m = BUS_CULL_MARGIN_PX;
    try {
        const sw = map.containerPointToLatLng({ x: -m, y: size.y + m });
        const ne = map.containerPointToLatLng({ x: size.x + m, y: -m });
        return {
            south: sw.lat,
            north: ne.lat,
            west: sw.lng,
            east: ne.lng,
            contains(latlng) {
                const lat = latlng && (latlng.lat !== undefined ? latlng.lat : (Array.isArray(latlng) ? latlng[0] : latlng.latitude));
                const lng = latlng && (latlng.lng !== undefined ? latlng.lng : (Array.isArray(latlng) ? latlng[1] : (latlng.longitude !== undefined ? latlng.longitude : latlng.long)));
                return lat >= this.south && lat <= this.north && lng >= this.west && lng <= this.east;
            }
        };
    } catch (e) {
        return null;
    }
}

// Map a "bus-animation-rate" setting to a step interval for a renderer mode.
// "off" uses each mode's natural rate (custom DOM = every rAF frame, WebGL =
// ~30Hz flush throttle); "10hz"/"30hz" force a fixed step for every mode.
function busAnimationStepIntervalMs(rendererMode, rate) {
    if (rate === '10hz') return BUS_ANIMATION_STEP_MS;
    if (rate === '30hz') return WEBGL_ANIMATION_STEP_MS;
    return rendererMode === 'maplibre' ? WEBGL_ANIMATION_STEP_MS : 0;
}

// Recompute the step interval for every in-flight animation after the
// "bus-animation-rate" setting changes (includes currently animating buses).
function applyBusAnimationRate(rate) {
    for (const busName in animationFrames) {
        const step = animationFrames[busName];
        if (!step) continue;
        const marker = busMarkers[busName];
        step.stepIntervalMs = busAnimationStepIntervalMs(marker && marker._rendererMode, rate);
    }
}

// Cancel a bus's in-flight animation (registered step + throttle timestamp)
// so a re-registered animation doesn't inherit a stale step interval.
function cancelBusAnimation(busName) {
    delete animationFrames[busName];
    delete animationLastStep[busName];
}

// Single rAF loop driving all active bus animations. Instead of each bus
// scheduling its own requestAnimationFrame chain (N callbacks per frame),
// the loop walks the animation registry once per frame and advances each step.
function ensureBusAnimationLoop() {
    if (busAnimationFrameId !== null) return;
    const tick = (currentTime) => {
        busAnimationFrameId = requestAnimationFrame(tick);
        let hasActive = false;
        for (const busName in animationFrames) {
            if (animationFrames[busName]) { hasActive = true; break; }
        }
        if (!hasActive) {
            cancelAnimationFrame(busAnimationFrameId);
            busAnimationFrameId = null;
            return;
        }
        // Rebuild the cull bounds once per frame (not per step) so the check
        // in each animation step stays cheap. Null when the dev toggle is off.
        busAnimationCullBounds = null;
        if (settings && settings['toggle-cull-offscreen-bus-markers']) {
            busAnimationCullBounds = computeBusAnimationCullBounds();
        }
        for (const busName in animationFrames) {
            const step = animationFrames[busName];
            if (!step) continue;
            const stepMs = step.stepIntervalMs || 0;
            if (stepMs > 0 && currentTime - (animationLastStep[busName] || 0) < stepMs) continue;
            animationLastStep[busName] = currentTime;
            try {
                step(currentTime);
            } catch (e) {
                console.error('[animate] error for', busName, e);
            }
        }
    };
    busAnimationFrameId = requestAnimationFrame(tick);
}
