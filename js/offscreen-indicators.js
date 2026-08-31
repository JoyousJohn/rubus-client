function getVisibleActiveBuses() {
    const activeBuses = [];
    if (typeof busMarkers === 'undefined' || typeof busData === 'undefined' || !map) return activeBuses;
    
    for (const busName in busMarkers) {
        const marker = busMarkers[busName];
        if (!marker) continue;
        const isOnMap = marker._isOnMap ?? (map.hasLayer && map.hasLayer(marker));
        if (!isOnMap) continue;

        const data = busData[busName];
        if (!data || !data.route || data.atDepot) continue;
        
        // Skip hidden elements
        const el = marker.getElement ? marker.getElement() : null;
        if (el && (el.style.display === 'none' || el.style.visibility === 'hidden')) {
            continue;
        }

        // Filter out by selected route if filtering is active
        if (typeof shownRoute !== 'undefined' && shownRoute && data.route !== shownRoute) {
            continue;
        }

        // Filter out if bus focusing is active on another bus
        if (typeof settings !== 'undefined' && settings['toggle-hide-other-routes'] && typeof popupBusName !== 'undefined' && popupBusName && busName.toString() !== popupBusName.toString()) {
            continue;
        }

        const latLng = marker.getLatLng ? marker.getLatLng() : { lat: Number(data.lat), lng: Number(data.long) };
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
            angleRad: angleRad,
            angleDeg: angleDeg,
            arrowRotation: arrowRotation
        });
    }

    const clusteredData = clusterOffscreenIndicators(indicatorsData, minX, maxX, minY, maxY);
    renderOffScreenIndicators(container, clusteredData);
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

function clusterOffscreenIndicators(indicators, minX, maxX, minY, maxY) {
    if (!indicators || indicators.length <= 1) return indicators;
    const CLUSTER_DIST_X = 128; // top/bottom edges (x delta)
    const CLUSTER_DIST_Y = 196; // left/right edges (y delta) - larger threshold
    const CLUSTER_DIST_CORNER = 128; // corner cross-edge
    const hasBounds = typeof minX === 'number' && typeof maxX === 'number';
    function isHorizontal(ind) {
        if (!hasBounds) return false;
        return ind.y === minY || ind.y === maxY;
    }
    function isVertical(ind) {
        if (!hasBounds) return false;
        return ind.x === minX || ind.x === maxX;
    }
    function cornerFor(ind) {
        if (!hasBounds) return null;
        // nearest corner to this edge point
        const nearTop = Math.abs(ind.y - minY) < Math.abs(ind.y - maxY);
        const nearLeft = Math.abs(ind.x - minX) < Math.abs(ind.x - maxX);
        // for edge points, one of these is 0, so corner is (left/right, top/bottom)
        const cx = nearLeft ? minX : maxX;
        const cy = nearTop ? minY : maxY;
        // if ind is on top/bottom, keep its x, use corner y; if on left/right, keep its y, use corner x
        // but for corner detection we just return the corner itself
        return { x: cx, y: cy };
    }
    const byRoute = {};
    for (const ind of indicators) {
        if (!byRoute[ind.route]) byRoute[ind.route] = [];
        byRoute[ind.route].push(ind);
    }
    const clustered = [];
    for (const route in byRoute) {
        const list = byRoute[route];
        const clusters = [];
        for (const ind of list) {
            let targetCluster = null;
            for (const c of clusters) {
                // anisotropic: use X threshold for horizontal edges (same y) and Y threshold for vertical edges (same x)
                let shouldMerge = false;
                for (const m of c.members) {
                    const dx = Math.abs(ind.x - m.x);
                    const dy = Math.abs(ind.y - m.y);
                    const sameY = dy < 1; // same horizontal edge (top/bottom) - y exactly equal
                    const sameX = dx < 1; // same vertical edge (left/right) - x exactly equal
                    if (sameX && dy < CLUSTER_DIST_Y) { shouldMerge = true; break; }
                    if (sameY && dx < CLUSTER_DIST_X) { shouldMerge = true; break; }
                    // cross-edge near same corner (top+right, etc.) - allow merge if both near same corner
                    if (hasBounds && !sameX && !sameY) {
                        const ci = cornerFor(ind);
                        const cm = cornerFor(m);
                        if (ci && cm && ci.x === cm.x && ci.y === cm.y) {
                            const distToCornerI = Math.hypot(ind.x - ci.x, ind.y - ci.y);
                            const distToCornerM = Math.hypot(m.x - cm.x, m.y - cm.y);
                            // both within thresholds of same corner
                            if (distToCornerI < CLUSTER_DIST_CORNER && distToCornerM < CLUSTER_DIST_CORNER) {
                                // also check they are close to each other across corner (hypot)
                                if (Math.hypot(dx, dy) < CLUSTER_DIST_CORNER * 1.5) { shouldMerge = true; break; }
                            }
                        }
                    }
                }
                if (shouldMerge) {
                    targetCluster = c;
                    break;
                }
            }
            if (targetCluster) {
                targetCluster.members.push(ind);
                // update centroid - keep pinned to edge; for mixed-corner clusters pin to corner
                let hasHoriz = false, hasVert = false;
                for (const m of targetCluster.members) {
                    if (isHorizontal(m)) hasHoriz = true;
                    if (isVertical(m)) hasVert = true;
                }
                if (hasHoriz && hasVert && hasBounds) {
                    const corner = cornerFor(targetCluster.members[0]);
                    targetCluster.x = corner.x;
                    targetCluster.y = corner.y;
                } else {
                    let sx = 0, sy = 0;
                    for (const m of targetCluster.members) { sx += m.x; sy += m.y; }
                    targetCluster.x = sx / targetCluster.members.length;
                    targetCluster.y = sy / targetCluster.members.length;
                }
            } else {
                clusters.push({ x: ind.x, y: ind.y, route: route, members: [ind] });
            }
        }
        for (const c of clusters) {
            if (c.members.length === 1) {
                clustered.push(c.members[0]);
            } else {
                // circular mean for angle
                let sinSum = 0, cosSum = 0;
                let latSum = 0, lngSum = 0;
                for (const m of c.members) {
                    const rad = m.angleRad != null ? m.angleRad : m.angleDeg * Math.PI / 180;
                    sinSum += Math.sin(rad);
                    cosSum += Math.cos(rad);
                    if (m.latLng) { latSum += m.latLng.lat; lngSum += m.latLng.lng; }
                }
                const avgRad = Math.atan2(sinSum / c.members.length, cosSum / c.members.length);
                const avgDeg = avgRad * 180 / Math.PI;
                const avgArrow = avgDeg + 90;
                const avgLat = latSum / c.members.length;
                const avgLng = lngSum / c.members.length;
                let avgLatLng = c.members[0].latLng;
                if (typeof L !== 'undefined' && L.latLng) avgLatLng = L.latLng(avgLat, avgLng);
                else if (avgLat && avgLng) avgLatLng = { lat: avgLat, lng: avgLng };
                clustered.push({
                    busName: c.members.map(m => m.busName).join(','),
                    route: route,
                    latLng: avgLatLng,
                    x: c.x,
                    y: c.y,
                    angleRad: avgRad,
                    angleDeg: avgDeg,
                    arrowRotation: avgArrow,
                    isCluster: true,
                    count: c.members.length,
                    members: c.members
                });
            }
        }
    }
    // Keep cross-route indicators as separate (already per-route), sort for stable rendering
    return clustered;
}

function renderOffScreenIndicators(container, indicators) {
    const existingElements = Array.from(container.children);
    const updatedIds = new Set();

    indicators.forEach(ind => {
        let id;
        if (ind.isCluster) {
            const key = ind.members.map(m => m.busName).sort().join('_').replace(/[^a-zA-Z0-9_-]/g, '-');
            id = `offscreen-cluster-${ind.route}-${key}`;
        } else {
            const safeId = ind.busName.replace(/[^a-zA-Z0-9_-]/g, '-');
            id = `offscreen-marker-${safeId}`;
        }
        updatedIds.add(id);

        let el = document.getElementById(id);
        const color = (typeof colorMappings !== 'undefined' && colorMappings[ind.route]) ? colorMappings[ind.route] : '#565fe5';

        if (!el) {
            el = document.createElement('div');
            el.id = id;
            el.className = ind.isCluster ? 'offscreen-bus-marker offscreen-bus-marker-cluster' : 'offscreen-bus-marker';
            if (ind.isCluster) {
                el.innerHTML = `
                <i class="fa-solid fa-arrow-up offscreen-bus-marker-arrow"></i>
                <span class="offscreen-bus-marker-count">${ind.count}</span>
            `;
            } else {
                el.innerHTML = `
                <i class="fa-solid fa-arrow-up offscreen-bus-marker-arrow"></i>
            `;
            }
            // capture current ind for closure - use let binding per iteration
            const captured = ind;
            el.onclick = function(e) {
                e.stopPropagation();
                if (map) {
                    map.flyTo(captured.latLng, Math.max(map.getZoom(), 15), {
                        animate: true,
                        duration: 0.3
                    });
                }
                if (typeof settings !== 'undefined' && settings['toggle-offscreen-bus-indicators-select-on-tap']) {
                    if (typeof popInfo === 'function') {
                        const targetBus = captured.isCluster ? captured.members[0].busName : captured.busName;
                        popInfo(targetBus);
                    }
                }
            };
            container.appendChild(el);
        } else {
            // update cluster count if needed
            if (ind.isCluster) {
                el.className = 'offscreen-bus-marker offscreen-bus-marker-cluster';
                const countEl = el.querySelector('.offscreen-bus-marker-count');
                if (countEl) countEl.textContent = ind.count;
                else {
                    // upgrade single to cluster
                    el.innerHTML = `
                <i class="fa-solid fa-arrow-up offscreen-bus-marker-arrow"></i>
                <span class="offscreen-bus-marker-count">${ind.count}</span>
            `;
                }
                // update click latLng - rebind
                const captured = ind;
                el.onclick = function(e) {
                    e.stopPropagation();
                    if (map) {
                        map.flyTo(captured.latLng, Math.max(map.getZoom(), 15), {
                            animate: true,
                            duration: 0.3
                        });
                    }
                    if (typeof settings !== 'undefined' && settings['toggle-offscreen-bus-indicators-select-on-tap']) {
                        if (typeof popInfo === 'function') {
                            popInfo(captured.members[0].busName);
                        }
                    }
                };
            } else {
                el.className = 'offscreen-bus-marker';
                // downgrade cluster to single if needed
                if (el.querySelector('.offscreen-bus-marker-count')) {
                    el.innerHTML = `<i class="fa-solid fa-arrow-up offscreen-bus-marker-arrow"></i>`;
                    const captured = ind;
                    el.onclick = function(e) {
                        e.stopPropagation();
                        if (map) {
                            map.flyTo(captured.latLng, Math.max(map.getZoom(), 15), {
                                animate: true,
                                duration: 0.3
                            });
                        }
                        if (typeof settings !== 'undefined' && settings['toggle-offscreen-bus-indicators-select-on-tap']) {
                            if (typeof popInfo === 'function') {
                                popInfo(captured.busName);
                            }
                        }
                    };
                }
            }
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
    if (!map) return;
    // Default (off): keep indicator positions live during the pan by refreshing
    // on 'move' (fires every frame while dragging/zooming). The dev setting
    // reverts to pan-end-only updates, matching the behavior after the
    // Leaflet->MapLibre migration (b14dfed) dropped 'move drag zoom'.
    const panEndOnly = typeof settings !== 'undefined' && settings['toggle-offscreen-bus-indicators-pan-end-only'] === true;
    map.off('move drag zoom moveend zoomend resize', requestOffScreenUpdate);
    if (panEndOnly) {
        map.on('moveend zoomend resize', requestOffScreenUpdate);
    } else {
        map.on('move drag zoom moveend zoomend resize', requestOffScreenUpdate);
    }
}

document.addEventListener('rubus-map-created', initOffscreenBusListeners);
$(document).ready(function() {
    if (map) {
        initOffscreenBusListeners();
    }
});
