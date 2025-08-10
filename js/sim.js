const SIM_ROUTES = ['lx', 'ee', 'f', 'c', 'bl', 'b', 'h', 'a', 'rexl', 'rexb']
const SC_STOPS = [1, 10, 13, 17]

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
                            const minSec = isStudentCenter ? 60 : 30;   // 1 min vs 30s
                            const maxSec = isStudentCenter ? 600 : 180; // 10 min vs 3 min
                            const secsAgo = Math.floor(Math.random() * (maxSec - minSec + 1)) + minSec;
                            busData[busId].timeArrived = new Date(Date.now() - secsAgo * 1000);
                        } catch {}
                    }
                } catch (e) {
                    console.error('Error setting seeded stop context', e);
                }
            }

            // If within 15 meters of any stop on its route, mark as at_stop
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
                            const minSec = isStudentCenter ? 60 : 30;   // 1 min vs 30s
                            const maxSec = isStudentCenter ? 600 : 180; // 10 min vs 3 min
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
                    const minSec2 = isStudentCenter2 ? 60 : 30;
                    const maxSec2 = isStudentCenter2 ? 600 : 180;
                    const secsAgo2 = Math.floor(Math.random() * (maxSec2 - minSec2 + 1)) + minSec2;
                    busData[busId].timeArrived = new Date(Date.now() - secsAgo2 * 1000);
                }
            } catch {}

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

async function startSim() {
    sim = true;
    for (const busId in busData) {
        makeOoS(busId);
    }
    await generateSimBusData();
    makeBusesByRoutes();
    addStopsToMap();
    setPolylines(SIM_ROUTES);
    populateRouteSelectors(activeRoutes);
    try { updateTimeToStops(Object.keys(busData)); } catch (e) {}
}

function endSim() {
    for (const busId in busData) {
        makeOoS(busId);
    }
    addStopsToMap();
    deleteAllPolylines();
    sim = false;
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

