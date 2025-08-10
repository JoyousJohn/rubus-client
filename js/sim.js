const SIM_ROUTES = ['lx', 'ee', 'f', 'c', 'bl', 'b', 'h', 'a', 'rexl', 'rexb']
const SC_STOPS = [1, 10, 13, 17]

// Simulation config (customizable)
const SIM_MIN_STOP_SECS = 30;     // minimum dwell time at stops
const SIM_MAX_STOP_SECS = 180;    // maximum dwell time at stops (non-SC)
const SIM_MAX_SPEED_MPH = 28;     // max cruising speed
const SIM_MIN_SPEED_MPH = 6;      // min rolling speed between stops
const SIM_ACC_MPH_PER_S = 2.5;    // acceleration per second
const SIM_DEC_MPH_PER_S = 3.0;    // deceleration per second
const SIM_TICK_MS = 300;          // movement tick
const SIM_MIN_ETA_UPDATE_MS = 1000; // min interval between ETA updates per batch
const SIM_PROGRESS_DELTA_FOR_UPDATE = 0.03; // 3% progress change triggers ETA update

let simMoveTimer = null;
let simEtaPending = new Set();
let simEtaUpdateLast = 0;

async function generateSimBusData() {
    // Desired distribution per route
    const targetCounts = {
        'c': 1,
        'lx': Math.floor(Math.random() * (9 - 7 + 1)) + 7,     // 7-9
        'rexl': Math.floor(Math.random() * (4 - 3 + 1)) + 3,   // 3-4
        'rexb': Math.floor(Math.random() * (4 - 3 + 1)) + 3,   // 3-4
        'f': Math.floor(Math.random() * (5 - 3 + 1)) + 3,      // 3-5
        'ee': 7,                                               // 7
        'bl': 2,                                               // 2
        'b': 5,                                                // 5
        'h': Math.floor(Math.random() * (7 - 4 + 1)) + 4,      // 4-7
        'a': Math.floor(Math.random() * (7 - 4 + 1)) + 4       // 4-7
    };

    const totalBuses = Object.values(targetCounts).reduce((acc, n) => acc + n, 0);
    const minAtStopQuota = Math.ceil(totalBuses * 0.20);
    let atStopAssigned = 0;

    const routesToGenerate = Object.keys(targetCounts);
    for (const routeName of routesToGenerate) {
        const count = targetCounts[routeName];

        // Ensure polyline data exists in localStorage; fetch if missing
        let polylinePoints = null;
        try {
            const cached = localStorage.getItem(`polylineData.${routeName}`);
            if (cached) {
                polylinePoints = JSON.parse(cached);
            } else if (typeof getPolylineData === 'function') {
                polylinePoints = await getPolylineData(routeName);
                if (polylinePoints) {
                    localStorage.setItem(`polylineData.${routeName}`, JSON.stringify(polylinePoints));
                }
            }
        } catch (e) {
            console.error('Error retrieving polyline data for route', routeName, e);
        }

        // Skip this route if we still don't have polyline points
        if (!Array.isArray(polylinePoints) || polylinePoints.length === 0) {
            continue;
        }

        const m = polylinePoints.length;
        const baseStart = Math.floor(Math.random() * m);
        let segment = Math.floor(m / count);
        if (segment <= 0) segment = 1;
        const jitterRange = Math.max(0, Math.floor(segment / 3));

        for (let i = 0; i < count; i++) {
            let seededAtStop = false;
            // Choose a spaced index with slight jitter to avoid clustering
            const jitter = jitterRange ? (Math.floor(Math.random() * (2 * jitterRange + 1)) - jitterRange) : 0;
            const randomIdx = ((baseStart + i * segment + jitter) % m + m) % m;

            // Normalize to objects with lat/lng if necessary
            let lat, lng;
            // Priority: ensure at least 20% of buses are placed at stops
            const campusKey = routesByCampus[routeName] || selectedCampus || 'nb';
            const routeStops = stopLists[routeName] || [];
            if (atStopAssigned < minAtStopQuota && routeStops.length > 0 && allStopsData && allStopsData[campusKey]) {
                const chosenStopIdx = Math.floor(Math.random() * routeStops.length);
                const chosenStopId = routeStops[chosenStopIdx];
                const stopInfo = allStopsData[campusKey][String(chosenStopId)] || allStopsData[campusKey][chosenStopId];
                if (stopInfo && stopInfo.latitude && stopInfo.longitude) {
                    // Try to place near the stop along an incoming or outgoing segment, not exactly at the stop
                    const prevId = routeStops[(chosenStopIdx - 1 + routeStops.length) % routeStops.length];
                    const nextId = routeStops[(chosenStopIdx + 1) % routeStops.length];

                    const candidates = [];
                    try {
                        // Outgoing segment: chosenStop -> nextId, take the first few points past the stop
                        const outSeg = percentageDistances[campusKey]
                            && percentageDistances[campusKey][String(nextId)]
                            && percentageDistances[campusKey][String(nextId)].from
                            && percentageDistances[campusKey][String(nextId)].from[String(chosenStopId)]
                            ? percentageDistances[campusKey][String(nextId)].from[String(chosenStopId)]
                            : null;
                        if (outSeg && outSeg.geometry && Array.isArray(outSeg.geometry.coordinates)) {
                            const coords = outSeg.geometry.coordinates; // [lng, lat]
                            for (let t of [1, 2, 3]) {
                                if (t < coords.length) {
                                    const [lngC, latC] = coords[t];
                                    candidates.push({ lat: latC, lng: lngC });
                                }
                            }
                        }
                        // Incoming segment: prevId -> chosenStop, take the last few points before the stop
                        const inSeg = percentageDistances[campusKey]
                            && percentageDistances[campusKey][String(chosenStopId)]
                            && percentageDistances[campusKey][String(chosenStopId)].from
                            && percentageDistances[campusKey][String(chosenStopId)].from[String(prevId)]
                            ? percentageDistances[campusKey][String(chosenStopId)].from[String(prevId)]
                            : null;
                        if (inSeg && inSeg.geometry && Array.isArray(inSeg.geometry.coordinates)) {
                            const coords = inSeg.geometry.coordinates; // [lng, lat]
                            for (let t of [coords.length - 2, coords.length - 3, coords.length - 4]) {
                                if (t >= 0 && t < coords.length) {
                                    const [lngC, latC] = coords[t];
                                    candidates.push({ lat: latC, lng: lngC });
                                }
                            }
                        }
                    } catch (e) {
                        // ignore, will fallback
                    }

                    // If no segment-based candidates (or very short segments), fallback to nearest polyline vertex to the stop
                    if (!candidates.length) {
                        let bestIdx = 0;
                        let bestD2 = Infinity;
                        for (let p = 0; p < polylinePoints.length; p++) {
                            const node = polylinePoints[p];
                            let nlat, nlng;
                            if (node && typeof node === 'object' && 'lat' in node && 'lng' in node) {
                                nlat = parseFloat(node.lat);
                                nlng = parseFloat(node.lng);
                            } else if (Array.isArray(node) && node.length >= 2) {
                                // Guess [lng, lat]
                                nlng = parseFloat(node[0]);
                                nlat = parseFloat(node[1]);
                            } else {
                                continue;
                            }
                            const dx = (nlng - stopInfo.longitude);
                            const dy = (nlat - stopInfo.latitude);
                            const d2 = dx * dx + dy * dy;
                            if (d2 < bestD2) { bestD2 = d2; bestIdx = p; }
                        }
                        // Prefer an adjacent vertex to avoid exact stop even if a vertex matches
                        const neighbor = Math.random() < 0.5 ? Math.max(0, bestIdx - 1) : Math.min(polylinePoints.length - 1, bestIdx + 1);
                        const fallbackPt = polylinePoints[neighbor];
                        if (fallbackPt && typeof fallbackPt === 'object' && 'lat' in fallbackPt && 'lng' in fallbackPt) {
                            candidates.push({ lat: parseFloat(fallbackPt.lat), lng: parseFloat(fallbackPt.lng) });
                        } else if (Array.isArray(fallbackPt) && fallbackPt.length >= 2) {
                            candidates.push({ lat: parseFloat(fallbackPt[1]), lng: parseFloat(fallbackPt[0]) });
                        }
                    }

                    // Choose the candidate closest to the stop (but not exact)
                    let best = null;
                    let minD2 = Infinity;
                    for (const c of candidates) {
                        const dx = (c.lng - stopInfo.longitude);
                        const dy = (c.lat - stopInfo.latitude);
                        const d2 = dx * dx + dy * dy;
                        if (d2 < minD2 && (c.lat !== stopInfo.latitude || c.lng !== stopInfo.longitude)) {
                            minD2 = d2;
                            best = c;
                        }
                    }

                    if (best) {
                        lat = best.lat;
                        lng = best.lng;
                        seededAtStop = true;
                        atStopAssigned++;
                    }
                }
            }

            if (!seededAtStop) {
                const pt = polylinePoints[randomIdx];
                if (pt && typeof pt === 'object' && 'lat' in pt && 'lng' in pt) {
                    lat = parseFloat(pt.lat);
                    lng = parseFloat(pt.lng);
                } else if (Array.isArray(pt) && pt.length >= 2) {
                    // Heuristic: backend sometimes returns [lng, lat]; handle both
                    const a = parseFloat(pt[0]);
                    const b = parseFloat(pt[1]);
                    // Choose interpretation that puts lat in typical NJ bounds (39-41)
                    if (b > -90 && b < 90) {
                        // Assume [lng, lat]
                        lng = a;
                        lat = b;
                    } else {
                        // Fallback: assume [lat, lng]
                        lat = a;
                        lng = b;
                    }
                } else {
                    continue;
                }
            }

            // Determine rotation using angle to next point on polyline
            let angleDeg;
            if (seededAtStop) {
                // Compute bearing from stop to next stop along route
                const campusKeyB = routesByCampus[routeName] || selectedCampus || 'nb';
                const routeStopsB = stopLists[routeName] || [];
                const currentStopId = routeStopsB.length ? (function(){
                    // Find which stop is closest to our seeded lat/lng
                    let bestId = routeStopsB[0];
                    let bestD = Infinity;
                    for (const sid of routeStopsB) {
                        const si = allStopsData[campusKeyB][String(sid)] || allStopsData[campusKeyB][sid];
                        if (!si) continue;
                        const dx = (si.longitude - lng);
                        const dy = (si.latitude - lat);
                        const d2 = dx*dx + dy*dy;
                        if (d2 < bestD) { bestD = d2; bestId = sid; }
                    }
                    return bestId;
                })() : null;
                const nextStopId = currentStopId != null ? getNextStopId(routeName, currentStopId) : null;
                let bearingFromSeg = null;
                try {
                    if (currentStopId != null && nextStopId != null && percentageDistances[campusKeyB] && percentageDistances[campusKeyB][String(nextStopId)] && percentageDistances[campusKeyB][String(nextStopId)].from && percentageDistances[campusKeyB][String(nextStopId)].from[String(currentStopId)]) {
                        const segCoords = percentageDistances[campusKeyB][String(nextStopId)].from[String(currentStopId)].geometry.coordinates;
                        if (Array.isArray(segCoords) && segCoords.length >= 2) {
                            const [lng1, lat1] = segCoords[0];
                            const [lng2, lat2] = segCoords[1];
                            const dLatS = lat2 - lat1;
                            const dLngS = lng2 - lng1;
                            bearingFromSeg = Math.atan2(dLngS, dLatS) * (180/Math.PI);
                        }
                    }
                } catch {}
                if (bearingFromSeg == null) {
                    // Fallback: bearing towards next stop's coordinates
                    const nextInfo = nextStopId != null ? (allStopsData[campusKeyB][String(nextStopId)] || allStopsData[campusKeyB][nextStopId]) : null;
                    if (nextInfo) {
                        const dLatS = nextInfo.latitude - lat;
                        const dLngS = nextInfo.longitude - lng;
                        bearingFromSeg = Math.atan2(dLngS, dLatS) * (180/Math.PI);
                    } else {
                        bearingFromSeg = 0;
                    }
                }
                angleDeg = bearingFromSeg;
                if (angleDeg < 0) angleDeg += 360;
            } else {
                const nextIdx = (randomIdx + 1) % polylinePoints.length;
                const npt = polylinePoints[nextIdx];
                let nlat, nlng;
                if (npt && typeof npt === 'object' && 'lat' in npt && 'lng' in npt) {
                    nlat = parseFloat(npt.lat);
                    nlng = parseFloat(npt.lng);
                } else if (Array.isArray(npt) && npt.length >= 2) {
                    const a2 = parseFloat(npt[0]);
                    const b2 = parseFloat(npt[1]);
                    if (b2 > -90 && b2 < 90) {
                        nlng = a2;
                        nlat = b2;
                    } else {
                        nlat = a2;
                        nlng = b2;
                    }
                } else {
                    // If next point invalid, default to no rotation
                    nlat = lat;
                    nlng = lng;
                }
                const dLat = nlat - lat;
                const dLng = nlng - lng;
                angleDeg = Math.atan2(dLng, dLat) * (180 / Math.PI); // 0=N, 90=E
                if (angleDeg < 0) angleDeg += 360;
            }

            // Unique 4 or 5 digit busId
            let busId;
            do {
                const fourOrFive = Math.random() < 0.5;
                busId = fourOrFive
                    ? Math.floor(Math.random() * (9999 - 1000 + 1)) + 1000
                    : Math.floor(Math.random() * (99999 - 10000 + 1)) + 10000;
            } while (busData[busId]);

            if (!window.activeRoutes) {
                window.activeRoutes = new Set();
            }
            activeRoutes.add(routeName);

            if (!window.joined_service) {
                window.joined_service = {};
            }
            const hoursAgo = Math.floor(Math.random() * (8 - 1 + 1)) + 1; // 1-8 hours ago
            const joinedTime = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
            joined_service[busId] = joinedTime;

            busData[busId] = {};
            busData[busId].previousTime = Date.now() - 5000;
            busData[busId].previousPositions = [[lat, lng]];
            busData[busId].lat = lat;
            busData[busId].long = lng;
            busData[busId].route = routeName;
            busData[busId].type = 'sim';
            busData[busId].campus = routesByCampus[routeName];
            busData[busId].busName = String(Math.floor(Math.random() * 9000) + 1000);
            busData[busId].rotation = angleDeg;
            busData[busId].capacity = Math.floor(Math.random() * 101); // 0-100
            busData[busId].joined_service = joinedTime;

            // Determine nearest segment (prev -> next) along this route using percentageDistances
            if (!seededAtStop) {
                try {
                    const campusKeyNS = routesByCampus[routeName] || selectedCampus || 'nb';
                    const routeStopsNS = stopLists[routeName] || [];
                    if (routeStopsNS.length >= 2 && percentageDistances[campusKeyNS]) {
                        let best = { dist2: Infinity, prev: null, next: null };
                        for (let s = 0; s < routeStopsNS.length; s++) {
                            const prevStop = routeStopsNS[s];
                            const nextStop = routeStopsNS[(s + 1) % routeStopsNS.length];
                            const nextStr = String(nextStop);
                            const prevStr = String(prevStop);
                            const seg = percentageDistances[campusKeyNS][nextStr] && percentageDistances[campusKeyNS][nextStr].from
                                ? percentageDistances[campusKeyNS][nextStr].from[prevStr]
                                : null;
                            if (!seg || !seg.geometry || !Array.isArray(seg.geometry.coordinates)) continue;
                            const coords = seg.geometry.coordinates; // [lng, lat]
                            for (let k = 0; k < coords.length; k++) {
                                const [lngK, latK] = coords[k];
                                const dx = lng - lngK;
                                const dy = lat - latK;
                                const d2 = dx * dx + dy * dy;
                                if (d2 < best.dist2) {
                                    best = { dist2: d2, prev: prevStop, next: nextStop };
                                }
                            }
                        }
                        if (best.prev !== null && best.next !== null) {
                            if (!window.busLocations) window.busLocations = {};
                            busLocations[busId] = { where: [best.next, best.prev] };
                            busData[busId].stopId = best.prev; // this is correct
                            busData[busId].prevStopId = best.prev; // this is correct
                            busData[busId].next_stop = getNextStopId(routeName, best.prev); // this is correct
                            busData[busId].at_stop = false;
                        }
                    }
                } catch (e) {
                    console.error('Error determining nearest segment for sim bus', busId, e);
                }
            } else {
                // Seeded at stop: set stop context directly
                try {
                    const campusKeyS = routesByCampus[routeName] || selectedCampus || 'nb';
                    const routeStopsS = stopLists[routeName] || [];
                    if (routeStopsS.length > 0) {
                        // Choose current stop by nearest to our seeded position (it's exact but safe)
                        let currId = routeStopsS[0];
                        let bestD2 = Infinity;
                        for (const sid of routeStopsS) {
                            const si = allStopsData[campusKeyS][String(sid)] || allStopsData[campusKeyS][sid];
                            if (!si) continue;
                            const dx = (si.longitude - lng);
                            const dy = (si.latitude - lat);
                            const d2 = dx*dx + dy*dy;
                            if (d2 < bestD2) { bestD2 = d2; currId = sid; }
                        }
                        const prevIdx = (routeStopsS.indexOf(currId) - 1 + routeStopsS.length) % routeStopsS.length;
                        const prevId = routeStopsS[prevIdx];
                        const nextId = getNextStopId(routeName, currId);
                        if (!window.busLocations) window.busLocations = {};
                        busLocations[busId] = { where: [currId] };
                        busData[busId].stopId = currId;
                        busData[busId].prevStopId = prevId;
                        busData[busId].next_stop = nextId;
                        busData[busId].at_stop = true;
                        // Set timeArrived now for seeded-at-stop placement
                        try {
                            const isStudentCenter = Array.isArray(SC_STOPS) && SC_STOPS.includes(Number(currId));
                            const minSec = isStudentCenter ? 60 : SIM_MIN_STOP_SECS;   // 1 min vs configured min
                            const maxSec = isStudentCenter ? 600 : SIM_MAX_STOP_SECS; // 10 min vs configured max
                            const secsAgo = Math.floor(Math.random() * (maxSec - minSec + 1)) + minSec;
                            busData[busId].timeArrived = new Date(Date.now() - secsAgo * 1000);
                        } catch {}
                    }
                } catch (e) {
                    console.error('Error setting seeded stop context', e);
                }
            }

            // If within 30 meters of any stop on its route, mark as at_stop
            try {
                const campusKey2 = routesByCampus[routeName] || selectedCampus || 'nb';
                const routeStops2 = stopLists[routeName] || [];
                if (allStopsData && allStopsData[campusKey2]) {
                    const thresholdMiles = 30 / 1609.34; // 30 meters in miles
                    for (const stopId of routeStops2) {
                        const stopInfo = allStopsData[campusKey2][String(stopId)] || allStopsData[campusKey2][stopId];
                        if (!stopInfo) continue;
                        const dMiles = typeof haversine === 'function'
                            ? haversine(lat, lng, stopInfo.latitude, stopInfo.longitude)
                            : (function(){
                                const toRad = (deg) => deg * Math.PI / 180;
                                const R = 3958.8;
                                const dLat = toRad(stopInfo.latitude - lat);
                                const dLon = toRad(stopInfo.longitude - lng);
                                const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat)) * Math.cos(toRad(stopInfo.latitude)) * Math.sin(dLon/2)**2;
                                const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
                                return R * c;
                            })();
                        if (dMiles <= thresholdMiles) {
                            busData[busId].at_stop = true;
                            const isStudentCenter = Array.isArray(SC_STOPS) && SC_STOPS.includes(Number(stopId));
                            const minSec = isStudentCenter ? 60 : SIM_MIN_STOP_SECS;   // 1 min vs configured min
                            const maxSec = isStudentCenter ? 600 : SIM_MAX_STOP_SECS; // 10 min vs configured max
                            const secsAgo = Math.floor(Math.random() * (maxSec - minSec + 1)) + minSec;
                            busData[busId].timeArrived = new Date(Date.now() - secsAgo * 1000);
                            break;
                        }
                    }
                }
            } catch (e) {
                console.error('Error checking proximity to stops for sim bus', busId, e);
            }

            // Fallback: ensure any bus marked at_stop has a timeArrived
            try {
                if (busData[busId].at_stop && !busData[busId].timeArrived) {
                    const campusKey3 = routesByCampus[routeName] || selectedCampus || 'nb';
                    const routeStops3 = stopLists[routeName] || [];
                    let nearestStopId = null;
                    let bestDMiles = Infinity;
                    for (const sid of routeStops3) {
                        const si = allStopsData[campusKey3][String(sid)] || allStopsData[campusKey3][sid];
                        if (!si) continue;
                        const dMiles = typeof haversine === 'function'
                            ? haversine(lat, lng, si.latitude, si.longitude)
                            : (function(){
                                const toRad = (deg) => deg * Math.PI / 180;
                                const R = 3958.8;
                                const dLat = toRad(si.latitude - lat);
                                const dLon = toRad(si.longitude - lng);
                                const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat)) * Math.cos(toRad(si.latitude)) * Math.sin(dLon/2)**2;
                                const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
                                return R * c;
                            })();
                        if (dMiles < bestDMiles) { bestDMiles = dMiles; nearestStopId = sid; }
                    }
                    const isStudentCenter2 = Array.isArray(SC_STOPS) && SC_STOPS.includes(Number(nearestStopId));
                    const minSec2 = isStudentCenter2 ? 60 : SIM_MIN_STOP_SECS;
                    const maxSec2 = isStudentCenter2 ? 600 : SIM_MAX_STOP_SECS;
                    const secsAgo2 = Math.floor(Math.random() * (maxSec2 - minSec2 + 1)) + minSec2;
                    busData[busId].timeArrived = new Date(Date.now() - secsAgo2 * 1000);
                }
            } catch {}

            // Initialize movement state
            initSimMovementForBus(busId);

            // Plot immediately if on current campus
            try {
                if (routesByCampus[routeName] === selectedCampus) {
                    plotBus(busId, true);
                }
            } catch (e) {
                console.error('Error plotting simulated bus', busId, e);
            }
        }
    }
}

function buildSegmentForBus(busId) {
    const route = busData[busId].route;
    const campusKey = routesByCampus[route] || selectedCampus || 'nb';
    const currStop = busData[busId].stopId;
    const nextStop = busData[busId].next_stop || getNextStopId(route, currStop);
    const seg = percentageDistances[campusKey]
        && percentageDistances[campusKey][String(nextStop)]
        && percentageDistances[campusKey][String(nextStop)].from
        ? percentageDistances[campusKey][String(nextStop)].from[String(currStop)]
        : null;

    let coords = [];
    let percentages = [];
    if (seg && seg.geometry && Array.isArray(seg.geometry.coordinates)) {
        coords = seg.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
        percentages = (seg.properties && Array.isArray(seg.properties.percentages)) ? seg.properties.percentages : [];
    } else {
        // Fallback: use full route polyline
        try {
            const cached = localStorage.getItem(`polylineData.${route}`);
            if (cached) {
                const polyPoints = JSON.parse(cached);
                coords = polyPoints.map(p => ('lat' in p) ? { lat: p.lat, lng: p.lng } : { lat: p[1], lng: p[0] });
                percentages = coords.map((_, idx) => coords.length > 1 ? idx / (coords.length - 1) : 0);
            }
        } catch {}
    }

    // Precompute distances between points (miles)
    const segDistances = [];
    let totalMiles = 0;
    for (let i = 1; i < coords.length; i++) {
        const d = typeof haversine === 'function' ? haversine(coords[i - 1].lat, coords[i - 1].lng, coords[i].lat, coords[i].lng) : 0;
        segDistances.push(d);
        totalMiles += d;
    }

    return { coords, percentages, segDistances, totalMiles };
}

function initSimMovementForBus(busId) {
    if (!busData[busId]) return;

    const route = busData[busId].route;
    const campusKey = routesByCampus[route] || selectedCampus || 'nb';

    // Ensure stop context
    if (!busData[busId].stopId) {
        // Choose nearest route stop as current
        const routeStops = stopLists[route] || [];
        if (routeStops.length) {
            let bestId = routeStops[0];
            let bestD = Infinity;
            for (const sid of routeStops) {
                const si = allStopsData[campusKey][String(sid)] || allStopsData[campusKey][sid];
                if (!si) continue;
                const dx = (si.longitude - busData[busId].long);
                const dy = (si.latitude - busData[busId].lat);
                const d2 = dx*dx + dy*dy;
                if (d2 < bestD) { bestD = d2; bestId = sid; }
            }
            busData[busId].stopId = bestId;
            busData[busId].next_stop = getNextStopId(route, bestId);
            const prevIdx = (routeStops.indexOf(bestId) - 1 + routeStops.length) % routeStops.length;
            busData[busId].prevStopId = routeStops[prevIdx];
        }
    }

    const seg = buildSegmentForBus(busId);
    const simState = {
        coords: seg.coords,
        percentages: seg.percentages,
        segDistances: seg.segDistances,
        totalMiles: seg.totalMiles,
        progressMiles: 0,
        moving: !busData[busId].at_stop,
        waitUntil: busData[busId].at_stop ? (Date.now() + randomDwellMs(busId)) : null,
        speedMph: busData[busId].at_stop ? 0 : (SIM_MIN_SPEED_MPH + Math.random() * 3),
        targetSpeedMph: SIM_MIN_SPEED_MPH + Math.random() * 5,
        lastTick: Date.now(),
        lastReportedProgress: 0,
    };

    // If starting somewhere mid-segment, snap to closest point on the segment path
    if (!busData[busId].at_stop && simState.coords.length > 1) {
        let bestSegIdx = 0;
        let bestT = 0;
        let bestD2 = Infinity;
        let accMilesToSegStart = 0;
        let accMilesTracker = 0;
        for (let i = 0; i < simState.segDistances.length; i++) {
            const p1 = simState.coords[i];
            const p2 = simState.coords[i + 1];
            const ax = p1.lng, ay = p1.lat;
            const bx = p2.lng, by = p2.lat;
            const px = busData[busId].long, py = busData[busId].lat;
            const abx = bx - ax, aby = by - ay;
            const apx = px - ax, apy = py - ay;
            const ab2 = abx*abx + aby*aby;
            const t = ab2 > 0 ? Math.max(0, Math.min(1, (apx*abx + apy*aby) / ab2)) : 0;
            const qx = ax + abx * t;
            const qy = ay + aby * t;
            const dx = px - qx;
            const dy = py - qy;
            const d2 = dx*dx + dy*dy;
            if (d2 < bestD2) {
                bestD2 = d2;
                bestSegIdx = i;
                bestT = t;
                accMilesToSegStart = accMilesTracker;
            }
            accMilesTracker += simState.segDistances[i];
        }
        simState.progressMiles = accMilesToSegStart + simState.segDistances[bestSegIdx] * bestT;
        // Snap bus position to the projected point to prevent initial backward jump
        const projP1 = simState.coords[bestSegIdx];
        const projP2 = simState.coords[bestSegIdx + 1];
        const projLat = projP1.lat + (projP2.lat - projP1.lat) * bestT;
        const projLng = projP1.lng + (projP2.lng - projP1.lng) * bestT;
        busData[busId].lat = projLat;
        busData[busId].long = projLng;
        // Set initial rotation along the segment direction
        let angleDeg = Math.atan2((projP2.lng - projP1.lng), (projP2.lat - projP1.lat)) * (180 / Math.PI);
        if (angleDeg < 0) angleDeg += 360;
        busData[busId].rotation = angleDeg;
    }

    busData[busId].sim = simState;

    // Initialize progress and queue ETA update
    const initProgress = progressPercentFor(busId);
    busData[busId].progress = initProgress;
    busData[busId].sim.lastReportedProgress = initProgress;
    simEtaPending.add(String(busId));
}

function randomDwellMs(busId) {
    const stopId = busData[busId].stopId;
    const isSC = Array.isArray(SC_STOPS) && SC_STOPS.includes(Number(stopId));
    const min = isSC ? 60 : SIM_MIN_STOP_SECS;
    const max = isSC ? 600 : SIM_MAX_STOP_SECS;
    const secs = Math.floor(Math.random() * (max - min + 1)) + min;
    return secs * 1000;
}

function progressPercentFor(busId) {
    const simState = busData[busId].sim;
    if (!simState || simState.totalMiles <= 0) return 0;
    const ratio = Math.max(0, Math.min(1, simState.progressMiles / simState.totalMiles));
    return ratio;
}

function updateSimBus(busId) {
    const bus = busData[busId];
    if (!bus || !bus.sim) return;
    const simState = bus.sim;

    const now = Date.now();
    const dtSec = Math.min(1.0, (now - simState.lastTick) / 1000);
    simState.lastTick = now;

    // Handle dwell at stop
    if (!simState.moving) {
        if (simState.waitUntil && now >= simState.waitUntil) {
            // depart
            simState.moving = true;
            simState.waitUntil = null;
            bus.at_stop = false;
            delete bus.timeArrived;
            simState.targetSpeedMph = SIM_MIN_SPEED_MPH + Math.random() * 5;
            // Progress reset and ETA refresh on departure
            bus.progress = 0;
            simState.lastReportedProgress = 0;
            simEtaPending.add(String(busId));
        } else {
            return;
        }
    }

    // Adjust target speed based on mid-segment allowance
    const progressPct = progressPercentFor(busId);
    const isMid = progressPct >= 0.25 && progressPct <= 0.75;
    const approachingEnd = progressPct >= 0.90;
    const allowedMax = isMid ? SIM_MAX_SPEED_MPH : Math.max(SIM_MIN_SPEED_MPH + 2, Math.floor(SIM_MAX_SPEED_MPH * 0.6));
    if (approachingEnd) {
        simState.targetSpeedMph = Math.max(SIM_MIN_SPEED_MPH, simState.targetSpeedMph - SIM_DEC_MPH_PER_S * dtSec * 2);
    } else {
        simState.targetSpeedMph = Math.min(allowedMax, simState.targetSpeedMph + SIM_ACC_MPH_PER_S * 0.2 * dtSec);
    }

    // Move current speed towards target
    if (simState.speedMph < simState.targetSpeedMph) {
        simState.speedMph = Math.min(simState.targetSpeedMph, simState.speedMph + SIM_ACC_MPH_PER_S * dtSec);
    } else if (simState.speedMph > simState.targetSpeedMph) {
        simState.speedMph = Math.max(simState.targetSpeedMph, simState.speedMph - SIM_DEC_MPH_PER_S * dtSec);
    }

    // Advance along segment by distance
    const moveMiles = simState.speedMph * (dtSec / 3600);
    simState.progressMiles += moveMiles;

    // If segment finished, arrive at stop
    if (simState.progressMiles >= simState.totalMiles - 1e-6) {
        const route = bus.route;
        const campusKey = routesByCampus[route] || selectedCampus || 'nb';
        const currStop = bus.next_stop || bus.stopId;
        const prevStop = bus.stopId || bus.prevStopId;
        // Snap to stop lat/lng
        try {
            const stopInfo = allStopsData[campusKey][String(currStop)] || allStopsData[campusKey][currStop];
            if (stopInfo) {
                bus.lat = stopInfo.latitude;
                bus.long = stopInfo.longitude;
            }
        } catch {}

        // Update stop context
        bus.prevStopId = prevStop;
        bus.stopId = currStop;
        bus.next_stop = getNextStopId(route, currStop);
        if (!window.busLocations) window.busLocations = {};
        busLocations[busId] = { where: [currStop] };
        bus.at_stop = true;
        bus.timeArrived = new Date();
        bus.progress = 0;
        simState.lastReportedProgress = 0;
        simEtaPending.add(String(busId));

        // Reset sim state for dwell
        simState.moving = false;
        simState.waitUntil = now + randomDwellMs(busId);
        simState.speedMph = 0;
        simState.targetSpeedMph = SIM_MIN_SPEED_MPH + Math.random() * 5;

        // Build next segment for when we depart
        const nextSeg = buildSegmentForBus(busId);
        simState.coords = nextSeg.coords;
        simState.percentages = nextSeg.percentages;
        simState.segDistances = nextSeg.segDistances;
        simState.totalMiles = nextSeg.totalMiles;
        simState.progressMiles = 0;

        // Plot/update
        try { plotBus(busId); } catch {}
        return;
    }

    // Interpolate position along current segment
    const { coords, segDistances } = simState;
    if (coords.length < 2) return;

    let accMiles = 0;
    let segIdx = 0;
    while (segIdx < segDistances.length && accMiles + segDistances[segIdx] < simState.progressMiles) {
        accMiles += segDistances[segIdx];
        segIdx++;
    }
    const t = segDistances[segIdx] > 0 ? (simState.progressMiles - accMiles) / segDistances[segIdx] : 0;
    const p1 = coords[Math.min(segIdx, coords.length - 1)];
    const p2 = coords[Math.min(segIdx + 1, coords.length - 1)];
    const newLat = p1.lat + (p2.lat - p1.lat) * t;
    const newLng = p1.lng + (p2.lng - p1.lng) * t;

    // Update bus position and rotation
    bus.lat = newLat;
    bus.long = newLng;
    const dLat = p2.lat - p1.lat;
    const dLng = p2.lng - p1.lng;
    let angleDeg = Math.atan2(dLng, dLat) * (180 / Math.PI);
    if (angleDeg < 0) angleDeg += 360;
    bus.rotation = angleDeg;

    // Maintain previousPositions history
    const lastPos = bus.previousPositions[bus.previousPositions.length - 1];
    if (!lastPos || lastPos[0] !== newLat || lastPos[1] !== newLng) {
        bus.previousPositions.push([newLat, newLng]);
        if (bus.previousPositions.length > 20) {
            bus.previousPositions.shift();
        }
    }

    // Update progress and queue ETA update if changed significantly
    const newProgress = progressPercentFor(busId);
    bus.progress = newProgress;
    if (Math.abs(newProgress - simState.lastReportedProgress) >= SIM_PROGRESS_DELTA_FOR_UPDATE) {
        simState.lastReportedProgress = newProgress;
        simEtaPending.add(String(busId));
    }

    // Plot
    try { plotBus(busId); } catch {}
}

function startSimMovementLoop() {
    if (simMoveTimer) return;
    simMoveTimer = setInterval(() => {
        for (const busId in busData) {
            if (busData[busId] && busData[busId].type === 'sim') {
                updateSimBus(busId);
            }
        }

        // Throttled batch ETA updates for sim buses
        const now = Date.now();
        if (simEtaPending.size && now - simEtaUpdateLast >= SIM_MIN_ETA_UPDATE_MS) {
            try {
                const ids = Array.from(simEtaPending);
                simEtaPending.clear();
                simEtaUpdateLast = now;
                if (typeof updateTimeToStops === 'function') {
                    updateTimeToStops(ids);
                }
            } catch (e) {
                // ignore ETA update errors
            }
        }
    }, SIM_TICK_MS);
}

function stopSimMovementLoop() {
    if (simMoveTimer) {
        clearInterval(simMoveTimer);
        simMoveTimer = null;
    }
    simEtaPending.clear();
}

async function startSim() {
    sim = true;
    for (const busId in busData) {
        makeOoS(busId);
    }
    await generateSimBusData();
    makeBusesByRoutes();
    deleteAllStops();
    addStopsToMap();
    setPolylines(SIM_ROUTES);
    populateRouteSelectors(activeRoutes);
    try { updateTimeToStops(Object.keys(busData)); } catch (e) {}
    startSimMovementLoop();
}

function endSim() {
    for (const busId in busData) {
        makeOoS(busId);
    }
    addStopsToMap();
    deleteAllPolylines();
    sim = false;
    stopSimMovementLoop();
    fetchBusData();
}


$(document).ready(function() {
    $('.sim-btn').on('touchstart click', function() {
        $(this).hide();
        $('.sim-popup').slideDown();
        startSim();
    })

    $('.sim-exit').click(function() {
        $('.sim-popup').fadeOut();
        $('.sim-btn').fadeIn();
        endSim();
    })
})

