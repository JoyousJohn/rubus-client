// js/offscreen-indicators.js - extracted verbatim from js/map.js
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
        map.on('moveend zoomend resize', requestOffScreenUpdate);
    }
}

document.addEventListener('rubus-map-created', initOffscreenBusListeners);
$(document).ready(function() {
    if (map) {
        initOffscreenBusListeners();
    }
});
