let polylineBounds = null;
let routeBounds = {};
let routePointsCache = {};
let previousRoutesWithPolylines = new Set();

const FORCE_SHOW_SETTING = 'force-show-polylines';
const FORCE_SHOW_TOGGLE = 'toggle-force-show-polylines';

function isForceShowEnabled() {
    return settings && settings[FORCE_SHOW_TOGGLE] === true;
}

function isForceShowStopsEnabled() {
    return isForceShowEnabled() && settings['toggle-force-show-stops'] === true;
}

function getForceShowRoutes() {
    const raw = settings[FORCE_SHOW_SETTING] || '';
    return raw ? raw.split(',').filter(Boolean) : [];
}

function setForceShowRoutes(routes) {
    settings[FORCE_SHOW_SETTING] = routes.join(',');
    saveSettings();
}

async function addForceShowPolyline(routeName) {
    if (polylines[routeName]) return;
    if (!getCampusRoutes(selectedCampus).includes(routeName)) return;
    let coordinates = await getPolylineData(routeName);
    if (!coordinates || !coordinates.length) return;
    if (Object.keys(coordinates[0])[0] === 'lat') {
        coordinates = coordinates.map(point => [point.lat, point.lng]);
    } else {
        coordinates = coordinates.map(point => [point[1], point[0]]);
    }
    const polylineOptions = {
        color: colorMappings[routeName] || '#888',
        weight: 4,
        opacity: 1,
        smoothFactor: 1,
    };
    const polyline = L.polyline(coordinates, polylineOptions);
    polyline.addTo(map);
    polylines[routeName] = polyline;
    routeBounds[routeName] = polyline.getBounds();
    routePointsCache[routeName] = polyline.getLatLngs();
}

function removeForceShowPolyline(routeName) {
    if (!polylines[routeName]) return;
    polylines[routeName].remove();
    delete polylines[routeName];
    delete routeBounds[routeName];
}

function applyForceShowState() {
    const forceRoutes = getForceShowRoutes();
    for (const route of Object.keys(polylines)) {
        if (!forceRoutes.includes(route)) {
            try { polylines[route].remove(); } catch (e) { console.warn('[applyForceShowState] failed to remove polyline for route ' + route + ':', e); }
            delete polylines[route];
        }
    }
    for (const route of forceRoutes) {
        addForceShowPolyline(route);
    }
}

function revertForceShowState() {
    for (const route of Object.keys(polylines)) {
        if (!routeHasInServiceBuses(route)) {
            try { polylines[route].remove(); } catch (e) { console.warn('[revertForceShowState] failed to remove polyline for route ' + route + ':', e); }
            delete polylines[route];
        }
    }
    const forceRoutes = getForceShowRoutes();
    for (const campus in busesByRoutes) {
        if (!busesByRoutes[campus]) continue;
        for (const route of Object.keys(busesByRoutes[campus])) {
            if (routeHasInServiceBuses(route) && !polylines[route] && !forceRoutes.includes(route)) {
                addForceShowPolyline(route);
            }
        }
    }
    removePreviouslyActiveStops();
    addStopsToMap();
    // Any polylines that survived the mode switch may have been created with
    // the old buggy beforeId (above buses when stops were above). Re-pin them
    // below the marker layers so buses stay above polylines after the toggle.
    window.updateStopsLayerOrder();
}

function applyForceShowStops() {
    const forceRoutes = getForceShowRoutes();
    const allowedStopIds = new Set();
    for (const route of forceRoutes) {
        if (stopLists[route]) stopLists[route].forEach(s => allowedStopIds.add(Number(s)));
    }
    for (const stopId in busStopMarkers) {
        if (!allowedStopIds.has(Number(stopId))) {
            busStopMarkers[stopId].remove();
            delete busStopMarkers[stopId];
        }
    }
    for (const stopId of allowedStopIds) {
        const id = Number(stopId);
        if (!busStopMarkers[id] && stopsData[id]) {
            const s = stopsData[id];
            const marker = L.marker([s.latitude, s.longitude], {
                icon: L.divIcon({
                    className: 'custom-stop-icon',
                    iconSize: [30, 30],
                    iconAnchor: [15, 15],
                    html: `<div class="marker-wrapper"><img src="img/stop_marker.png" width="18" height="18" stop-marker-id="${id}"/><div class="corner-label none" stop-eta="${id}">xm</div></div>`
                }),
                zIndexOffset: settings['toggle-stops-above-buses'] ? 1000 : 0,
            }).addTo(map).on('click', function() {
                if ($('body').hasClass('parking-permit-mode')) return;
                sourceStopId = null;
                sourceBusName = null;
                clearPanoutFeedback();
                popStopInfo(id);
                if (!shownRoute) {
                    showAllBuses();
                    showAllPolylines();
                }
            });
            busStopMarkers[id] = marker;
        }
    }
    updateStopsOpacity();
}

function revertForceShowStops() {
    addStopsToMap();
}

function renderForceShowCheckboxes() {
    const $container = $('.force-show-polylines-container');
    if (!$container.length) return;
    $container.empty();
    const forceRoutes = getForceShowRoutes();
    const campusRoutes = routesByCampusBase[selectedCampus] || [];
    const allOn = campusRoutes.every(r => forceRoutes.includes(r));

    const $allToggle = $(`
        <label class="force-show-option flex align-center pointer" style="gap:4px;padding:2px 6px;border-radius:4px;">
            <input type="checkbox" class="force-show-all-cb" ${allOn ? 'checked' : ''}>
            <span style="font-size:0.9rem;font-weight:600;">ALL</span>
        </label>
    `);
    $container.append($allToggle);

    for (const route of knownRoutes) {
        if (!campusRoutes.includes(route)) continue;
        const checked = forceRoutes.includes(route);
        const color = colorMappings[route] || '#888';
        $container.append(`
            <label class="force-show-option flex align-center pointer" style="gap:4px;padding:2px 6px;border-radius:4px;">
                <input type="checkbox" class="force-show-cb" data-route="${route}" ${checked ? 'checked' : ''}>
                <span style="color:${color};font-size:0.9rem">● ${route.toUpperCase()}</span>
            </label>
        `);
    }
}

$(document).on('change', '.force-show-cb', function() {
    // Route checkboxes are locked while Force Show Polylines is off — revert
    // the change to the stored selection instead of mutating it.
    if (!isForceShowEnabled()) {
        const route = $(this).data('route');
        $(this).prop('checked', getForceShowRoutes().includes(route));
        return;
    }
    const route = $(this).data('route');
    const show = $(this).prop('checked');
    let forceRoutes = getForceShowRoutes();
    if (show) {
        if (!forceRoutes.includes(route)) forceRoutes.push(route);
        if (isForceShowEnabled()) {
            addForceShowPolyline(route);
        }
    } else {
        forceRoutes = forceRoutes.filter(r => r !== route);
        if (isForceShowEnabled() || !routeHasInServiceBuses(route)) {
            removeForceShowPolyline(route);
        }
    }
    setForceShowRoutes(forceRoutes);
    const campusRoutes = routesByCampusBase[selectedCampus] || [];
    const allOn = campusRoutes.every(r => forceRoutes.includes(r));
    $('.force-show-all-cb').prop('checked', allOn);
    if (isForceShowStopsEnabled()) applyForceShowStops();
});

$(document).on('change', '.force-show-all-cb', function() {
    // ALL checkbox is locked while Force Show Polylines is off — restore the
    // stored selection.
    if (!isForceShowEnabled()) {
        renderForceShowCheckboxes();
        return;
    }
    const selectAll = $(this).prop('checked');
    const campusRoutes = routesByCampusBase[selectedCampus] || [];
    let forceRoutes = getForceShowRoutes();
    if (selectAll) {
        for (const route of campusRoutes) {
            if (!forceRoutes.includes(route)) {
                forceRoutes.push(route);
                if (isForceShowEnabled()) addForceShowPolyline(route);
            }
        }
    } else {
        for (const route of campusRoutes) {
            if (isForceShowEnabled() || !routeHasInServiceBuses(route)) {
                removeForceShowPolyline(route);
            }
        }
        forceRoutes = forceRoutes.filter(r => !campusRoutes.includes(r));
    }
    setForceShowRoutes(forceRoutes);
    renderForceShowCheckboxes();
    if (isForceShowStopsEnabled()) applyForceShowStops();
});

// MapLibre GeoJSON line layer for route polylines
window.createMapLibrePolyline = function(coordinates, options) {
    options = options || {};
    const routeId = 'poly_' + Math.random().toString(36).substring(2, 9);
    const sourceId = `src_${routeId}`;
    const layerId = `layer_${routeId}`;
    
    let geoCoords = [];
    if (coordinates && coordinates.length) {
        geoCoords = coordinates.map(pt => {
            // Number() coercion: some route geometry (e.g. 'bl') is served with
            // string lat/lng values, which MapLibre's GeoJSON validation rejects.
            if (Array.isArray(pt)) {
                return [Number(pt[1]), Number(pt[0])];
            } else if (pt && pt.lat !== undefined && pt.lng !== undefined) {
                return [Number(pt.lng), Number(pt.lat)];
            }
            return pt;
        });
    }

    let isAdded = false;
    let removed = false;
    let styleLoadBound = false;
    let currentColor = options.color || '#888';
    let currentOpacity = options.opacity !== undefined ? options.opacity : 1;
    let currentWeight = options.weight || 4;

    // Layer creation is gated on the style JSON being parsed: Style.addSource /
    // addLayer throw while the style isn't loaded (Style._checkLoaded). The
    // gate is 'style.load' / style._loaded — NOT map.isStyleLoaded() or the map
    // 'load' event, which additionally wait on every source's data requests and
    // can stall indefinitely (e.g. a hung tile request), leaving layers
    // permanently unadded while the polylines registry thinks they exist.
    // 'style.load' fires as soon as the style JSON is applied, and fires again
    // whenever the style is replaced, re-adding any missing layers.
    function add() {
        if (!map) return;
        if (removed) return;
        if (isAdded && map.getSource(sourceId) && map.getLayer(layerId)) return;
        if (!(map.style && map.style._loaded)) return; // retried on style.load
        isAdded = false;
        try {
            if (map.getSource(sourceId)) {
                map.getSource(sourceId).setData({
                    type: 'Feature',
                    geometry: { type: 'LineString', coordinates: geoCoords }
                });
            } else {
                map.addSource(sourceId, {
                    type: 'geojson',
                    data: {
                        type: 'Feature',
                        geometry: { type: 'LineString', coordinates: geoCoords }
                    }
                });
            }

            if (!map.getLayer(layerId)) {
                // Anchor polylines below ALL marker layers. The "Show Stops
                // Above Buses" toggle inverts the stop/bus stacking order, so
                // the correct anchor depends on it: when stops are above buses
                // the bus layers are the lowest marker group, otherwise the
                // stop layers are. Previously this always preferred the stop
                // layer, so when stops were above buses a new polyline was
                // inserted between buses and stops — above the buses — which
                // then persisted via force-show settings (polyline at:243).
                const stopsAbove = !!settings['toggle-stops-above-buses'];
                let beforeId;
                if (stopsAbove) {
                    if (map.getLayer('bus-markers-layer')) beforeId = 'bus-markers-layer';
                    else if (map.getLayer('bus-markers-glow')) beforeId = 'bus-markers-glow';
                    else if (map.getLayer('stop-markers-layer')) beforeId = 'stop-markers-layer';
                } else {
                    if (map.getLayer('stop-markers-layer')) beforeId = 'stop-markers-layer';
                    else if (map.getLayer('bus-markers-layer')) beforeId = 'bus-markers-layer';
                    else if (map.getLayer('bus-markers-glow')) beforeId = 'bus-markers-glow';
                }
                map.addLayer({
                    id: layerId,
                    type: 'line',
                    source: sourceId,
                    layout: {
                        'line-cap': 'round',
                        'line-join': 'round'
                    },
                    paint: {
                        'line-color': currentColor,
                        'line-width': currentWeight,
                        'line-opacity': currentOpacity
                    }
                }, beforeId);
            }
            isAdded = true;
        } catch (e) {
            console.error('[MapLibre Polyline] failed to add source/layer for', layerId, ':', e);
        }
    }

    function onStyleLoad() {
        if (!removed) add();
    }

    // Called from wrapper.addTo: attempts the add now and guarantees a retry
    // once the style parses (and on any future style replacement).
    function ensureAdded() {
        if (!map) return;
        if (!styleLoadBound) {
            styleLoadBound = true;
            map.on('style.load', onStyleLoad);
            // Fail-fast: if the style never parses (bad URL / network / style
            // error), the layer would otherwise never be created and nothing
            // would ever report it.
            setTimeout(function() {
                if (!removed && !isAdded && !(map.style && map.style._loaded)) {
                    console.warn('[MapLibre Polyline] add() for "' + layerId + '" is still waiting for the style to load 15s later; the style may have failed to load. Layer was never added.');
                }
            }, 15000);
        }
        add();
    }

    function remove() {
        if (!map) throw new Error('[MapLibre Polyline] Attempted to remove polyline before map was initialized.');
        removed = true;
        if (styleLoadBound) {
            map.off('style.load', onStyleLoad);
            styleLoadBound = false;
        }
        if (map.getLayer(layerId)) map.removeLayer(layerId);
        if (map.getSource(sourceId)) map.removeSource(sourceId);
        isAdded = false;
    }

    // Replace the line's geometry in place (no remove/add churn), so a debug
    // polyline whose endpoints move each poll doesn't flicker. Coordinates are
    // normalized exactly like the constructor.
    function setLatLngs(coordinates) {
        if (!coordinates || !coordinates.length) return wrapper;
        geoCoords = coordinates.map(pt => {
            if (Array.isArray(pt)) {
                return [Number(pt[1]), Number(pt[0])];
            } else if (pt && pt.lat !== undefined && pt.lng !== undefined) {
                return [Number(pt.lng), Number(pt.lat)];
            }
            return pt;
        });
        if (!removed && map && map.getSource && map.getSource(sourceId)) {
            map.getSource(sourceId).setData({
                type: 'Feature',
                geometry: { type: 'LineString', coordinates: geoCoords }
            });
        } else if (!removed && map) {
            add();
        }
        return wrapper;
    }

    const wrapper = {
        _latlngs: coordinates,
        _mapLibreLayerId: layerId,
        isAdded: function() { return isAdded && !!(map && map.getLayer && map.getLayer(layerId)); },
        addTo: function(targetMap) {
            ensureAdded();
            return wrapper;
        },
        remove: function() {
            remove();
            return wrapper;
        },
        removeFrom: function() {
            remove();
            return wrapper;
        },
        setStyle: function(newStyle) {
            if (newStyle.color) currentColor = newStyle.color;
            if (newStyle.opacity !== undefined) currentOpacity = newStyle.opacity;
            if (newStyle.weight) currentWeight = newStyle.weight;
            if (map && map.getLayer && map.getLayer(layerId)) {
                map.setPaintProperty(layerId, 'line-color', currentColor);
                map.setPaintProperty(layerId, 'line-opacity', currentOpacity);
                map.setPaintProperty(layerId, 'line-width', currentWeight);
            }
            return wrapper;
        },
        getBounds: function() {
            if (!geoCoords.length) return L.latLngBounds([0,0], [0,0]);
            let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
            for (const pt of geoCoords) {
                if (pt[0] < minLng) minLng = pt[0];
                if (pt[0] > maxLng) maxLng = pt[0];
                if (pt[1] < minLat) minLat = pt[1];
                if (pt[1] > maxLat) maxLat = pt[1];
            }
            return L.latLngBounds([minLat, minLng], [maxLat, maxLng]);
        },
        getLatLngs: function() {
            return coordinates;
        },
        setLatLngs: setLatLngs,
        getElement: function() {
            return null;
        },
        options: options
    };

    return wrapper;
};

if (typeof L !== 'undefined') {
    L.polyline = function(coordinates, options) {
        return window.createMapLibrePolyline(coordinates, options);
    };

    function parseMarkerLatLng(latlng) {
        if (!latlng) return { lat: 0, lng: 0 };
        if (Array.isArray(latlng)) return { lat: Number(latlng[0]), lng: Number(latlng[1]) };
        if (typeof latlng === 'object') {
            const lat = latlng.lat !== undefined ? latlng.lat : (latlng.latitude !== undefined ? latlng.latitude : latlng[0]);
            const lng = latlng.lng !== undefined ? latlng.lng : (latlng.longitude !== undefined ? latlng.longitude : (latlng.long !== undefined ? latlng.long : latlng[1]));
            return { lat: Number(lat), lng: Number(lng) };
        }
        return { lat: 0, lng: 0 };
    }

    L.marker = function(latlng, options) {
        options = options || {};
        const pos = parseMarkerLatLng(latlng);
        let icon = options.icon || null;

        function applyIcon(el, iconObj) {
            // maplibre adds the 'maplibregl-marker' class (and any classes the
            // app appended) to this element; preserve them across icon swaps.
            const keepClasses = [];
            el.classList.forEach(c => keepClasses.push(c));
            el.className = '';
            for (const c of keepClasses) el.classList.add(c);
            el.style.width = '';
            el.style.height = '';
            el.style.backgroundImage = '';
            el.style.backgroundSize = '';
            el.style.backgroundRepeat = '';
            el.style.backgroundPosition = '';
            el.innerHTML = '';
            if (!iconObj || !iconObj.options) {
                el.classList.add('custom-default-marker');
                return;
            }
            if (iconObj.options.className) {
                el.classList.add(iconObj.options.className);
            }
            if (iconObj.options.iconSize && Array.isArray(iconObj.options.iconSize)) {
                el.style.width = iconObj.options.iconSize[0] + 'px';
                el.style.height = iconObj.options.iconSize[1] + 'px';
            }
            if (iconObj.options.iconUrl) {
                el.style.backgroundImage = `url('${iconObj.options.iconUrl}')`;
                el.style.backgroundSize = 'contain';
                el.style.backgroundRepeat = 'no-repeat';
                el.style.backgroundPosition = 'center';
            }
            if (iconObj.options.html) {
                el.innerHTML = iconObj.options.html;
            }
        }

        const markerEl = document.createElement('div');
        applyIcon(markerEl, icon);

        const marker = new maplibregl.Marker({
            element: markerEl,
            anchor: 'center'
        }).setLngLat([pos.lng, pos.lat]);

        const originalAddTo = marker.addTo.bind(marker);
        const originalRemove = marker.remove.bind(marker);

        // In WebGL renderer mode stop markers are rendered as GL layers
        // (js/stop-layer.js); their DOM elements must never be attached to
        // the map, since a DOM element always paints above the GL canvas and
        // would defeat the "Show Stops Above Buses" ordering. addTo()/remove()
        // for stops then only flip the registry flag and resync the GL source.
        const isStopMarker = !!(icon && icon.options && icon.options.className === 'custom-stop-icon');
        marker._addedToMap = false;
        marker._originalAddTo = originalAddTo;
        marker._originalRemove = originalRemove;
        marker._addToDom = function(targetMap) {
            originalAddTo(targetMap || map);
            marker._addedToMap = true;
            return marker;
        };
        marker._removeFromDom = function() {
            originalRemove();
            marker._addedToMap = false;
            return marker;
        };

        marker.setLatLng = function(newLatLng) {
            const p = parseMarkerLatLng(newLatLng);
            marker.setLngLat([p.lng, p.lat]);
            return marker;
        };
        marker.setLatLngPrecise = function(newLatLng) {
            return marker.setLatLng(newLatLng);
        };
        marker.setZIndexOffset = function(offset) {
            if (markerEl) {
                // Treat offset as the absolute z-index (floored at 1). Bus
                // markers sit at 500 (selected: 5000); stops pass 1/100 when
                // "stops above buses" is off so they stay BELOW buses, and
                // 900/1100+ when it's on. (A prior `500 + offset` base put
                // serviced stops at 600 — always above buses.)
                const safeZ = Math.max(1, Number(offset || 0));
                markerEl.style.zIndex = String(safeZ);
            }
            return marker;
        };
        marker.getLatLng = function() {
            const ll = marker.getLngLat();
            return { lat: ll.lat, lng: ll.lng };
        };
        marker.remove = function() {
            if (typeof window.stopLayerManager !== 'undefined' && window.stopLayerManager.isActive() && isStopMarker) {
                marker._addedToMap = false;
                window.stopLayerManager.refresh();
                return marker;
            }
            originalRemove();
            marker._addedToMap = false;
            return marker;
        };
        marker.removeFrom = function() {
            return marker.remove();
        };
        marker.addTo = function(targetMap) {
            if (typeof window.stopLayerManager !== 'undefined' && window.stopLayerManager.isActive() && isStopMarker) {
                marker._addedToMap = true;
                window.stopLayerManager.refresh();
                return marker;
            }
            originalAddTo(targetMap || map);
            marker._addedToMap = true;
            return marker;
        };
        marker.on = function(event, handler) {
            markerEl.addEventListener(event, handler);
            return marker;
        };
        marker.getElement = function() {
            return markerEl;
        };
        marker._icon = markerEl;

        marker.getIcon = function() {
            return icon;
        };
        marker.setIcon = function(newIcon) {
            icon = newIcon || null;
            applyIcon(markerEl, icon);
            return marker;
        };
        marker.bindPopup = function(content, popupOptions) {
            const html = typeof content === 'string'
                ? content
                : (content && content.options && content.options.html)
                    ? content.options.html
                    : (content && content._html)
                        ? content._html
                        : (content ? String(content) : '');
            marker.setPopup(new maplibregl.Popup(popupOptions || {}).setHTML(html));
            return marker;
        };
        marker.unbindPopup = function() {
            if (marker.getPopup()) marker.getPopup().remove();
            return marker;
        };
        marker.openPopup = function() {
            const popup = marker.getPopup();
            if (popup) popup.addTo(marker.getMap ? marker.getMap() : map);
            return marker;
        };
        marker.closePopup = function() {
            if (marker.getPopup()) marker.getPopup().remove();
            return marker;
        };

        return marker;
    };
}

// Track polyline removal for debugging race conditions
let polylineRemovalLog = [];
let polylineRemovalCount = {}; // Track how many times each route has been removed

// Track polyline removal with stack trace - only log if double removal occurs
function logPolylineRemoval(routeName, caller) {
    const timestamp = new Date().toISOString();
    const exists = !!polylines[routeName];
    
    // Increment removal count for this route
    if (!polylineRemovalCount[routeName]) {
        polylineRemovalCount[routeName] = 0;
    }
    polylineRemovalCount[routeName]++;
    
    const logEntry = {
        route: routeName,
        caller: caller,
        timestamp: timestamp,
        stack: new Error().stack,
        exists: exists,
        removalCount: polylineRemovalCount[routeName]
    };
    
    polylineRemovalLog.push(logEntry);
    
    // Only log if this is a double removal (count > 1) or if polyline doesn't exist when trying to remove
    if (polylineRemovalCount[routeName] > 1 || !exists) {
        console.warn(`[DOUBLE REMOVAL DETECTED] Route: ${routeName}, Caller: ${caller}, Removal Count: ${polylineRemovalCount[routeName]}, Exists: ${exists}`, logEntry);
        
        // Show previous removals for this route
        const previousRemovals = polylineRemovalLog.filter(entry => entry.route === routeName);
        console.log(`Previous removals for route ${routeName}:`, previousRemovals);
    }
    
    // Keep only last 50 entries to prevent memory bloat
    if (polylineRemovalLog.length > 50) {
        polylineRemovalLog = polylineRemovalLog.slice(-50);
    }
}

// Function to get removal history for debugging
function getPolylineRemovalHistory(routeName = null) {
    if (routeName) {
        return polylineRemovalLog.filter(entry => entry.route === routeName);
    }
    return polylineRemovalLog.slice(); // Return copy
}

// Global debugging functions (accessible from console)
window.debugPolylineRemovals = function(routeName = null) {
    const history = getPolylineRemovalHistory(routeName);
    console.table(history);
    return history;
};

window.debugPolylineState = function(routeName) {
    console.log(`Polyline state for route: ${routeName}`);
    console.log(`Exists in polylines object:`, !!polylines[routeName]);
    console.log(`On map:`, polylines[routeName] && polylines[routeName].isAdded ? polylines[routeName].isAdded() : (polylines[routeName] ? map.hasLayer(polylines[routeName]) : 'N/A'));
    console.log(`Removal count:`, polylineRemovalCount[routeName] || 0);
    console.log(`Removal history:`, getPolylineRemovalHistory(routeName));
    return {
        exists: !!polylines[routeName],
        onMap: polylines[routeName] && polylines[routeName].isAdded ? polylines[routeName].isAdded() : (polylines[routeName] ? map.hasLayer(polylines[routeName]) : false),
        removalCount: polylineRemovalCount[routeName] || 0,
        history: getPolylineRemovalHistory(routeName)
    };
};

function getRouteStyle(routeName) {
    const forceRoutes = getForceShowRoutes();
    const isForce = forceRoutes.includes(routeName);
    const active = routeHasInServiceBuses(routeName) || isForce;
    return {
        color: active ? (colorMappings[routeName] || '#888') : 'rgba(128,128,128,0.7)',
        opacity: active ? 1 : 0.5,
        buttonColor: active ? (colorMappings[routeName] || '#888') : 'gray',
        buttonOpacity: active ? 1 : 0.5
    };
}

function updatePolylineStyle(routeName) {
    if (!polylines[routeName]) return;
    const style = getRouteStyle(routeName);
    let targetOpacity = (shownRoute && shownRoute !== routeName) ? 0 : style.opacity;
    if (settings['toggle-hide-other-routes'] && popupBusName && busData[popupBusName]) {
        const focusedRoute = busData[popupBusName].route;
        if (focusedRoute !== routeName) {
            targetOpacity = 0;
        } else if (settings['toggle-distances-line-on-focus']) {
            targetOpacity = 0;
        }
    }
    if (!settings['toggle-show-out-of-service'] && !routeHasValidInServiceBuses(routeName)) {
        targetOpacity = 0;
    }
    polylines[routeName].setStyle({ color: style.color, opacity: targetOpacity });
    const pathEl = polylines[routeName].getElement();
    if (pathEl) {
        pathEl.style.opacity = String(targetOpacity);
        pathEl.style.display = targetOpacity === 0 ? 'none' : '';
    }
}

async function setPolylines(activeRoutes, opts = {}) {
    await initRoutePointsCache(selectedCampus);
    const forceRoutes = getForceShowRoutes();
    let routesToSet;
    if (isForceShowEnabled()) {
        routesToSet = forceRoutes.filter(r => getCampusRoutes(selectedCampus).includes(r));
        for (const routeName in polylines) {
            if (!routesToSet.includes(routeName)) {
                if (polylines[routeName]) {
                    polylines[routeName].remove();
                    delete polylines[routeName];
                }
            }
        }
    } else {
        routesToSet = Array.from(activeRoutes).filter(route => getCampusRoutes(selectedCampus).includes(route));
        if (!settings['toggle-show-out-of-service']) {
            routesToSet = routesToSet.filter(route => routeHasValidInServiceBuses(route));
        }
    }

    // Fetch all route geometry in parallel, then create every polyline in one
    // synchronous burst so routes appear together instead of one-per-frame
    // (mirrors makeBulkOoS's once-not-per-bus pattern).
    const pendingRoutes = [];

    for (const routeName of routesToSet) {
        if (polylines[routeName]) {
            updatePolylineStyle(routeName);
            continue;
        }
        pendingRoutes.push({ routeName, style: getRouteStyle(routeName) });
    }

    if (pendingRoutes.length === 0) return;

    const fetched = await Promise.all(pendingRoutes.map(({ routeName }) => getPolylineData(routeName)));

    let addedAny = false;
    for (let i = 0; i < pendingRoutes.length; i++) {
        const { routeName, style } = pendingRoutes[i];
        let coordinates = fetched[i];

        if (polylines[routeName]) {
            updatePolylineStyle(routeName);
            continue;
        }
        if (!coordinates) continue;

        try {
        if (Object.keys(coordinates[0])[0] === 'lat') {
            coordinates = coordinates.map(point => [point.lat, point.lng]);
        } else {
            coordinates = coordinates.map(point => [point[1], point[0]]);
        }

        let targetOpacity = (shownRoute && shownRoute !== routeName) ? 0 : style.opacity;
        if (settings['toggle-hide-other-routes'] && popupBusName && busData[popupBusName]) {
            const focusedRoute = busData[popupBusName].route;
            if (focusedRoute !== routeName || settings['toggle-distances-line-on-focus']) {
                targetOpacity = 0;
            }
        }

        const polyline = L.polyline(coordinates, {
            color: style.color,
            weight: 4,
            opacity: targetOpacity,
            smoothFactor: 1,
        });

        polyline.addTo(map);

        polylines[routeName] = polyline;
        const pathEl = polyline.getElement();
        if (pathEl) pathEl.style.opacity = String(targetOpacity);

        // Cache route bounds and points even if layer later gets pruned
        routeBounds[routeName] = polyline.getBounds();
        routePointsCache[routeName] = polyline.getLatLngs();

        addedAny = true;
        } catch (e) {
            // Isolate per-route failures (bad geometry, etc.) so one route can't
            // abort the loop and silently prevent every later route from rendering.
            console.error('Failed to add polyline for route', routeName, ':', e);
        }
    }

    if (addedAny) {
        updatePolylineBoundsIfNeeded();
        if (opts.fitBounds !== false) {
            map.fitBounds(polylineBounds, { padding: [10, 10] });
        }
    }
}

// Coerce coordinate values to numbers, preserving the source format (objects
// stay objects, arrays stay arrays). The /r/{route} endpoints are inconsistent:
// some serve {lat,lng} numbers, some [lng,lat] arrays, and 'bl' serves string
// values — string coordinates are rejected by MapLibre's GeoJSON validation.
function normalizePolylineData(data) {
    if (!Array.isArray(data)) return data;
    return data.map(pt => {
        if (Array.isArray(pt)) {
            return [Number(pt[0]), Number(pt[1])];
        }
        if (pt && typeof pt === 'object' && (pt.lat !== undefined || pt.lng !== undefined)) {
            const out = {};
            if (pt.lat !== undefined) out.lat = Number(pt.lat);
            if (pt.lng !== undefined) out.lng = Number(pt.lng);
            return out;
        }
        return pt;
    });
}

async function getPolylineData(routeName) {
    try {
        if (!knownRoutes.includes(routeName)) return;

        const url = `https://demo.rubus.live/r/${routeName}`;
        const cache = await caches.open('route-polylines');

        const cached = await cache.match(url);
        if (cached) return normalizePolylineData(await cached.json());

        const response = await fetch(url);
        if (response.status === 200) {
            cache.put(url, response.clone());
            return normalizePolylineData(await response.json());
        }

        try {
            const localResp = await fetch(`lib/routes/${routeName}_route.json`);
            if (localResp.status === 200) {
                return normalizePolylineData(await localResp.json());
            }
        } catch (_) {}

        console.error(`Error fetching polyline data for route ${routeName}:`, response.statusText);
    } catch (error) {
        try {
            const localResp = await fetch(`lib/routes/${routeName}_route.json`);
            if (localResp.status === 200) {
                return normalizePolylineData(await localResp.json());
            }
        } catch (_) {}
        console.error(`Error fetching polyline data for route ${routeName}:`, error);
        markRubusRequestsFailing();
    }
} 

function getValidBusesServicingStop(stopId) {
    let validBuses = [];
    const routesServicing = getRoutesServicingStop(stopId);
    routesServicing.forEach(route => {
        busesByRoutes[selectedCampus][route].forEach(busName => {
            if (isValid(busName)) {
                validBuses.push(busName);
            }
        });
    });
    return validBuses;
}

// Force-add a polyline for a specific route regardless of bus in-service state
async function addPolylineForRoute(routeName) {
    try {
        if (polylines[routeName]) return;
        if (!getCampusRoutes(selectedCampus).includes(routeName)) return;

        let coordinates = await getPolylineData(routeName);
        if (polylines[routeName]) return;
        if (!coordinates || !coordinates.length) return;

        if (Object.keys(coordinates[0])[0] === 'lat') {
            coordinates = coordinates.map(point => [point.lat, point.lng]);
        } else {
            coordinates = coordinates.map(point => [point[1], point[0]]);
        }

        const style = getRouteStyle(routeName);
        const targetOpacity = (shownRoute && shownRoute !== routeName) ? 0 : style.opacity;

        const polylineOptions = {
            color: style.color,
            weight: 4,
            opacity: targetOpacity,
            smoothFactor: 1,
        };

        const polyline = L.polyline(coordinates, polylineOptions);
        polyline.addTo(map);
        polylines[routeName] = polyline;
        const pathEl = polyline.getElement();
        if (pathEl) pathEl.style.opacity = String(targetOpacity);
        
        // Reset removal count when polyline is successfully created
        if (polylineRemovalCount[routeName]) {
            delete polylineRemovalCount[routeName];
        }
        const bounds = polyline.getBounds();
        routeBounds[routeName] = bounds;
    } catch (e) {
        console.error('Failed to add polyline for route', routeName, e);
    }
}

// Check if a route has any in-service buses
function routeHasInServiceBuses(route) {
    try {
        const routeBuses = busesByRoutes[selectedCampus] && busesByRoutes[selectedCampus][route];
        return routeBuses && routeBuses.some(busName => 
            busData[busName] && 
            !busData[busName].oos && 
            !busData[busName].atDepot
            // isValid(busName) -- temporarily disabled: requires busETAs which
            // aren't populated until fetchWhere() runs; this caused route selectors
            // and polylines to flash gray for ~2s on initial load because
            // prunePolylinesWithoutInService() was called before ETAs were available.
            // oos + atDepot alone are sufficient to know if a route is active.
        );
    } catch (e) {
        return false;
    }
}

function routeHasValidInServiceBuses(route) {
    try {
        const routeBuses = busesByRoutes[selectedCampus] && busesByRoutes[selectedCampus][route];
        return routeBuses && routeBuses.some(busName => 
            busData[busName] && 
            !busData[busName].oos && 
            !busData[busName].atDepot &&
            !distanceFromLine(busName)
        );
    } catch (e) {
        return false;
    }
}

// Update polylineBounds efficiently - only when polylines actually change
function updatePolylineBoundsIfNeeded() {
    try {
        // Get current routes that have polylines AND have valid in-service buses
        const currentRoutesWithPolylines = new Set(
            Object.keys(polylines).filter(route =>
                routesByCampusBase[selectedCampus]?.includes(route) &&
                routeHasInServiceBuses(route)
            )
        );

        // Quick check: if no routes changed, return early unless polylineBounds is not set
        const currentRoutesArray = Array.from(currentRoutesWithPolylines).sort();
        const previousRoutesArray = Array.from(previousRoutesWithPolylines).sort();

        if (polylineBounds && JSON.stringify(currentRoutesArray) === JSON.stringify(previousRoutesArray)) {
            return; // No changes
        }

        let combinedBounds = null;

        // Compute bounds from current polylines for routes with valid buses
        for (const route of currentRoutesWithPolylines) {
            if (!routeBounds[route] && polylines[route]) {
                routeBounds[route] = polylines[route].getBounds();
            }
            if (routeBounds[route]) {
                if (combinedBounds === null) {
                    combinedBounds = L.latLngBounds(routeBounds[route].getSouthWest(), routeBounds[route].getNorthEast());
                } else {
                    combinedBounds = combinedBounds.extend(routeBounds[route]);
                }
            }
        }

        // If no active routes with valid buses, use campus bounds as default
        if (!combinedBounds && bounds[selectedCampus]) {
            combinedBounds = L.latLngBounds(bounds[selectedCampus].getSouthWest(), bounds[selectedCampus].getNorthEast());
        }

        polylineBounds = combinedBounds;
        previousRoutesWithPolylines = currentRoutesWithPolylines;
    } catch (e) {
        console.error('Error updating polyline bounds', e);
        polylineBounds = null;
        previousRoutesWithPolylines.clear();
    }
}

// Update polyline colors and route selector buttons based on in-service status
function prunePolylinesWithoutInService() {
    try {
        const forceMode = isForceShowEnabled();
        const forceRoutes = getForceShowRoutes();
        const campusRoutes = Object.keys(busesByRoutes[selectedCampus]);
        let activeRoutesChanged = false;

        if (!settings['toggle-show-out-of-service']) {
            for (const routeName of Object.keys(polylines)) {
                if (!routeHasValidInServiceBuses(routeName) && !forceRoutes.includes(routeName)) {
                    try {
                        polylines[routeName].setStyle({ opacity: 0 });
                        const pathEl = polylines[routeName].getElement();
                        if (pathEl) { pathEl.style.opacity = '0'; pathEl.style.display = 'none'; }
                    } catch (e) { console.warn('[prunePolylinesWithoutInService] failed to hide polyline for route ' + routeName + ':', e); }
                }
            }
        }

        // In force mode, the checked routes are the complete polyline set. Do
        // not recreate polylines for routes merely because they have a bus.
        if (forceMode) {
            for (const routeName of Object.keys(polylines)) {
                if (!forceRoutes.includes(routeName)) {
                    try { polylines[routeName].remove(); } catch (e) { console.warn('[prunePolylinesWithoutInService] failed to remove polyline for route ' + routeName + ':', e); }
                    delete polylines[routeName];
                }
            }
        }

        campusRoutes.forEach(routeName => {
            const style = getRouteStyle(routeName);

            if (polylines[routeName]) {
                updatePolylineStyle(routeName);
            } else if ((!forceMode || forceRoutes.includes(routeName)) && getCampusRoutes(selectedCampus).includes(routeName)) {
                if (settings['toggle-show-out-of-service'] || routeHasValidInServiceBuses(routeName)) {
                    addPolylineForRoute(routeName);
                }
            }

            // Update route selector button color on UI
            const $btn = $(`.route-selector[routeName="${routeName}"]`);
            if ($btn.length) {
                if (shownRoute) {
                    if (routeName === shownRoute) {
                        $btn.css({ 'background-color': colorMappings[routeName], 'opacity': '1' });
                    } else {
                        $btn.css({ 'background-color': 'gray', 'opacity': routeHasInServiceBuses(routeName) ? '1' : '0.5' });
                    }
                } else {
                    $btn.css({ 'background-color': style.buttonColor, 'opacity': String(style.buttonOpacity) });
                }
            }

            // Drop routes whose buses are all invalid (off-line / not shown on
            // the map) but still present in busData. The makeBulkOoS /
            // makeBusesByRoutes prune only fires when a route has zero buses,
            // so without this a strayed bus's route selector button lingers
            // even though its marker/polyline were hidden.
            if (!settings['toggle-show-out-of-service'] && !forceRoutes.includes(routeName)) {
                if (!routeHasValidInServiceBuses(routeName) && activeRoutes.delete(routeName)) {
                    activeRoutesChanged = true;
                    if (appStyle === 'rider') updateRiderRoutes();
                    if (shownRoute === routeName) toggleRoute(routeName);
                }
            }
        });
        if (activeRoutesChanged) {
            populateRouteSelectors(activeRoutes);
        }
        updatePolylineBoundsIfNeeded();
        updateStopsOpacity();
    } catch (e) {
        console.error('Error updating polylines without in-service buses', e);
    }
}

function updateStopsOpacity() {
    const servicedStops = new Set();
    const oosStops = new Set();
    const routeKeys = Object.keys(stopLists || {});

    for (const route of routeKeys) {
        // Stop visibility must use the same validity criteria as route
        // pruning. A bus that is still present in busData but is off-route
        // should not keep every stop on that route visible.
        const isInService = routeHasValidInServiceBuses(route);
        const list = stopLists[route];
        if (!list) continue;
        if (isInService) {
            list.forEach(id => servicedStops.add(Number(id)));
        } else if (settings['toggle-show-out-of-service']) {
            list.forEach(id => oosStops.add(Number(id)));
        }
    }

    const baseZ = settings['toggle-stops-above-buses'] ? 1000 : 0;
    const isShowOOS = !!settings['toggle-show-out-of-service'];

    for (const stopId in busStopMarkers) {
        const marker = busStopMarkers[stopId];
        const numId = Number(stopId);
        const isServiced = servicedStops.has(numId);
        const isOOS = oosStops.has(numId);
        const el = marker.getElement();

        let shouldBeOnMap = false;
        let opacity = '1';

        const focusedRoute = (settings['toggle-hide-other-routes'] && popupBusName && busData[popupBusName]) ? busData[popupBusName].route : null;
        const activeFilterRoute = shownRoute || focusedRoute;

        if (servicedStops.size === 0) {
            // No bus services any stop: keep stops visible but dim them to
            // indicate nothing is running (matches the 0.5 used for OOS stops).
            shouldBeOnMap = true;
            opacity = '0.5';
        } else if (isServiced) {
            shouldBeOnMap = true;
            opacity = '1';
        } else if (isOOS && isShowOOS) {
            shouldBeOnMap = true;
            opacity = '0.5';
        } else {
            shouldBeOnMap = false;
        }

        if (activeFilterRoute) {
            const allowedStops = (stopLists[activeFilterRoute] || []).map(Number);
            if (!allowedStops.includes(numId)) {
                shouldBeOnMap = false;
            }
        }

        if (shouldBeOnMap) {
            marker.addTo(map);
            if (el) {
                el.style.opacity = opacity;
                el.querySelectorAll('.marker-wrapper, .marker-wrapper img, .corner-label').forEach(child => {
                    child.style.opacity = opacity;
                });
                el.style.display = '';
                el.style.pointerEvents = '';
            }
        } else {
            marker.remove();
        }
        if (popupStopId && String(popupStopId) === String(stopId)) {
            marker.setZIndexOffset(2000);
        } else {
            marker.setZIndexOffset(isServiced ? baseZ + 100 : baseZ - 100);
        }
    }
    if (typeof window.updateStopsLayerOrder === 'function') {
        window.updateStopsLayerOrder();
    }
    if (typeof window.updateCenterStops === 'function') {
        window.updateCenterStops();
    }
}

async function preloadRoutePolylines(campus) {
    const versionResp = await fetch('https://demo.rubus.live/r/version');
    const { hash } = await versionResp.json();

    const prevHash = localStorage.getItem('route-polylines-version');
    if (prevHash === hash) return;

    const cache = await caches.open('route-polylines');
    const keys = await cache.keys();
    await Promise.all(keys.map(key => cache.delete(key)));

    localStorage.setItem('route-polylines-version', hash);

    const campusRoutes = routesByCampusBase[campus || selectedCampus] || [];
    await Promise.all(campusRoutes.map(routeName => getPolylineData(routeName)));
}

// Precompute and cache bounds and points for all campus routes without adding layers
async function initRoutePointsCache(campus) {
    await preloadRoutePolylines(campus);

    const campusRoutes = routesByCampusBase[campus || selectedCampus] || [];
    const fetches = campusRoutes.map(async (routeName) => {
        if (routeBounds[routeName] && routePointsCache[routeName]) return;
        const coords = await getPolylineData(routeName);
        if (!coords || !coords.length) return;

        let coordinates;
        if (Object.keys(coords[0])[0] === 'lat') {
            coordinates = coords.map(point => [point.lat, point.lng]);
        } else {
            coordinates = coords.map(point => [point[1], point[0]]);
        }
        const tmp = L.polyline(coordinates, { opacity: 0 });
        routeBounds[routeName] = tmp.getBounds();
        routePointsCache[routeName] = tmp.getLatLngs();
    });
    await Promise.all(fetches);
}

async function precomputeAllRouteBounds() {
    await initRoutePointsCache(selectedCampus);
}


let busStopMarkers = {};

function getNextStopId(route, stopId) {
    if (!route || !stopLists[route] || stopId === null || stopId === undefined || Number.isNaN(Number(stopId))) {
        return null;
    }
    const routeStops = stopLists[route];
    let idx = routeStops.indexOf(stopId);
    if (idx === -1) {
        const asNum = Number(stopId);
        if (!Number.isNaN(asNum)) idx = routeStops.indexOf(asNum);
        if (idx === -1) idx = routeStops.indexOf(String(stopId));
    }
    if (idx === -1) {
        console.warn(`[getNextStopId] stopId ${stopId} not in route ${route} (${routeStops.length} stops)`);
        return routeStops[0];
    }
    return routeStops[(idx + 1) % routeStops.length];
}

// Given a route with potentially duplicated stopIds (e.g., SAC NB appears twice),
// determine the stop that comes immediately after currentStopId when approaching
// from prevStopId along that route's sequence.
function getNextStopAfterCurrentGivenPrev(route, prevStopId, currentStopId) {
    try {
        const routeStops = stopLists[route] || [];
        if (!routeStops.length) return getNextStopId(route, currentStopId);
        const len = routeStops.length;
        for (let i = 0; i < len; i++) {
            if (routeStops[i] === prevStopId && routeStops[(i + 1) % len] === currentStopId) {
                return routeStops[(i + 2) % len];
            }
        }
        // Fallback if pattern not found
        return getNextStopId(route, currentStopId);
    } catch (e) {
        return getNextStopId(route, currentStopId);
    }
}

function updateStopBuses(stopId, actuallyShownRoute) {

    if (settings['toggle-pause-stop-eta-updates']) return;

    // Determine which route (if any) should be visibly filtered in the stop info
    // - If caller passed undefined: use current shownRoute (maintains filter during async refreshes)
    // - If caller passed null/false/empty: show all (explicit override)
    // - If caller passed a route string: use it (unless 'fav')
    const visibleRoute = (typeof actuallyShownRoute === 'undefined')
        ? (shownRoute && shownRoute !== 'fav' ? shownRoute : undefined)
        : (actuallyShownRoute && actuallyShownRoute !== 'fav' ? actuallyShownRoute : undefined);

    let servicingEntries = []

    $('.info-stop-servicing').empty();

    const servicedRoutes = routesServicing(stopId)

    // Sort routes so that routes with in-service buses are at the end
    const sortedServicedRoutes = [...servicedRoutes].sort((a, b) => {
        const aHasInService = !routeHasInServiceBuses(a);
        const bHasInService = !routeHasInServiceBuses(b);
        
        // Routes with in-service buses should come after routes without
        if (aHasInService && !bHasInService) return 1;
        if (!aHasInService && bHasInService) return -1;
        return 0; // Keep original order for routes with same status
    });

    // console.log('servicedRoutes:', servicedRoutes)

    if (!servicedRoutes.length) {

        let stopNoBusesMsg

        if (!jQuery.isEmptyObject(busData)) {
            stopNoBusesMsg = 'NOT SERVICED BY ACTIVE ROUTES' /* when would this ever even be shown? */
        } else {
            stopNoBusesMsg = 'NO BUSES ACTIVE'
        }

        const $noneRouteElm = $(`<div class="no-buses">${stopNoBusesMsg}</div>`)
        $('.info-stop-servicing').append($noneRouteElm)
    }

    sortedServicedRoutes.forEach(servicedRoute => {
        
        const $serviedRouteElm = $(`<div>${servicedRoute.toUpperCase()}</div>`);
        if ((visibleRoute && visibleRoute !== servicedRoute) || !routeHasInServiceBuses(servicedRoute)) {
            $serviedRouteElm.css('color', 'var(--theme-hidden-route-col)');
        } else {
            $serviedRouteElm.css('color', colorMappings[servicedRoute]);
        }
        
        $('.info-stop-servicing').append($serviedRouteElm)
        // busIdsServicing = busIdsServicing.concat(busesByRoutes[servicedRoute]);
        busesByRoutes[selectedCampus][servicedRoute].forEach(busName => {

            let busStopId = busData[busName]['stopId']
            if (Array.isArray(busStopId)) {
                busStopId = busStopId[0];
            }

            // Add all buses on routes that service this stop
            let entry = {
                busName: busName,
                route: servicedRoute,
                eta: undefined // Will be set to 0 or actual ETA below
            };

            if (busData[busName]['at_stop'] && busStopId === stopId) {
                entry.eta = 0;
            } else if (busETAs[busName]) {
                if ((servicedRoute === 'wknd1' || servicedRoute === 'all' || servicedRoute === 'winter1' || servicedRoute === 'on1' || servicedRoute === 'summer1') && stopId === 3) { // special case: show both VIA paths
                    const viaMap = busETAs[busName] && busETAs[busName][3] && busETAs[busName][3]['via'];
                    if (viaMap && Object.keys(viaMap).length) {
                        const approachPrev = busData[busName] && busData[busName]['prevStopId'];
                        Object.entries(viaMap).forEach(([prevIdStr, etaSecs]) => {
                            const prevId = Number(prevIdStr);
                            const etaMins = Math.ceil(etaSecs / 60);
                            const nextStopId = getNextStopAfterCurrentGivenPrev(servicedRoute, prevId, 3);
                            const nextStop = stopsData[nextStopId];
                            const nextStopName = nextStop ? (nextStop.shorterName || nextStop.shortName || nextStop.mainName || nextStop.name) : '';

                            // Only show the current approach leg when the bus is still approaching SAC NB.
                            if (!busData[busName] || busData[busName]['next_stop'] !== 3 || !approachPrev || approachPrev === prevId) {
                                servicingEntries.push({
                                    busName: busName,
                                    route: servicedRoute,
                                    eta: etaMins,
                                    nextStopId: nextStopId,
                                    nextStopName: nextStopName,
                                    viaPrevStopId: prevId
                                });
                            }
                        });
                        // Skip the default entry since we added VIA entries above
                        return;
                    }
                } else {
                    const etaSecs = getETAForStop(busName, stopId)
                    if (etaSecs !== undefined) {
                        entry.eta = Math.ceil(etaSecs/60);
                    }
                }
            }

            // Add all buses on routes that service this stop
            servicingEntries.push(entry);
        })
    })

    const sortedEntries = servicingEntries
        .sort((a, b) => {
            const aDepot = busData[a.busName]?.atDepot;
            const bDepot = busData[b.busName]?.atDepot;
            if (aDepot && !bDepot) return 1;
            if (!aDepot && bDepot) return -1;

            const aInvalid = !isValid(a.busName);
            const bInvalid = !isValid(b.busName);
            if (aInvalid && !bInvalid) return 1;
            if (!aInvalid && bInvalid) return -1;

            const aDistanceFromLine = distanceFromLine(a.busName);
            const bDistanceFromLine = distanceFromLine(b.busName);
            if (aDistanceFromLine && !bDistanceFromLine) return 1;
            if (!aDistanceFromLine && bDistanceFromLine) return -1;

            // Keep 0 min at top relative ordering otherwise sort by ETA
            return a.eta - b.eta;
        });

    $('.stop-info-buses-grid, .stop-info-buses-grid-next, .stop-info-buses-grid-post-cutoff, .stop-info-buses-grid-deferred').empty();

    function isPostCutoffEntry(entry, refTime) {
        const cutoffHr = entry.route === 'summer1' ? 24 : entry.route === 'summer2' ? 23 : null;
        if (cutoffHr !== null) {
            const arrival = new Date(refTime.getTime() + entry.eta * 60000);
            const cutoff = new Date(refTime);
            cutoff.setHours(cutoffHr, 0, 0, 0);
            return arrival > cutoff;
        }
        return false;
    }

    const now = new Date();
    const firstLoopEntries = [];
    const deferredEntries = [];
    const postCutoffEntries = [];

    for (const entry of sortedEntries) {
        if (busData[entry.busName]?.atDepot || !isValid(entry.busName)) {
            if (!settings['toggle-show-out-of-service'] || hideOutOfServiceBuses) {
                continue;
            }
            deferredEntries.push(entry);
        } else if (isPostCutoffEntry(entry, now)) {
            postCutoffEntries.push(entry);
        } else {
            firstLoopEntries.push(entry);
        }
    }

    // const infoNextStopsScrollPosition = $('.info-next-stops').scrollTop();
    // alert(infoNextStopsScrollPosition)

    firstLoopEntries.forEach(data => {

        // Skip out of service buses if the setting is off or session-hide is active
        if ((!settings['toggle-show-out-of-service'] || hideOutOfServiceBuses) && busData[data.busName].oos) {
            return;
        }

        const currentTime = new Date();
        currentTime.setMinutes(currentTime.getMinutes() + data.eta);
        const formattedTime = currentTime.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });

        const $routeCell = $('<div class="stop-bus-route user-no-select"></div>');
        $routeCell.append(`<div>${data.route.toUpperCase()}</div>`);
        $('.stop-info-buses-grid').append($routeCell);

        let stopOctaconVisibilityClass = 'none'
        if (busData[data.busName].overtime) {
            stopOctaconVisibilityClass = ''
        }

        let stopOoSVisibilityClass = 'none';
        if (busData[data.busName].oos) {
            stopOoSVisibilityClass = '';
        }

        let stopDepotVisibilityClass = 'none';
        if (busData[data.busName].atDepot) {
            stopDepotVisibilityClass = '';
        }

        let busContainerStyle = '';
        if (data.eta === undefined || busData[data.busName].atDepot || distanceFromLine(data.busName) || !isValid(data.busName)) {
            busContainerStyle = ' style="grid-column: span 3;"';
        }

        const $stopBusElm = $(`<div class="flex justify-between align-center pointer user-no-select"${busContainerStyle}><div class="flex gap-x-0p5rem"><div class="stop-bus-name"></div><div class="stop-oos ${stopOoSVisibilityClass}">OOS</div><div class="stop-depot ${stopDepotVisibilityClass}">Depot</div></div><div class="stop-octagon ${stopOctaconVisibilityClass}"><div>!</div></div></div>`);
        $stopBusElm.find('.stop-bus-name').text(busData[data.busName].busName);
        $('.stop-info-buses-grid').append($stopBusElm);

        if (visibleRoute && visibleRoute !== data.route) {
            $('.stop-octagon').last().css('background-color', 'var(--theme-hidden-route-col)').find('div').css('color', 'gray');
        }

        if (Object.is(data.eta, -0)) {
            $('.stop-info-buses-grid').append(`<div class="stop-bus-eta pointer">Detour</div>`);
            $('.stop-info-buses-grid').append(`<div class="pointer"></div>`);
        } else if (Object.is(data.eta, 0)) {
            $('.stop-info-buses-grid').append(`<div class="stop-bus-eta pointer">Here</div>`);
            $('.stop-info-buses-grid').append(`<div class="pointer"></div>`);
        } else if (data.eta === undefined || busData[data.busName].atDepot || distanceFromLine(data.busName) || !isValid(data.busName)) {
            // For invalid buses, the bus container already spans the remaining columns
            // Print the condition that led to
            let reason = '';
            if (data.eta === undefined) {
                reason += '[no ETA data] ';
            }
            if (busData[data.busName].atDepot) {
                reason += '[atDepot] ';
            }
            if (distanceFromLine(data.busName)) {
                reason += '[distanceFromLine] ';
            }
            if (!isValid(data.busName)) {
                reason += '[!isValid] ';
                // Add detailed reason why validation failed
                if (!busETAs[data.busName]) {
                    reason += '(no busETAs) ';
                } else {
                    // Check for negative ETA values
                    const route = busData[data.busName].route;
                    const invalidStops = [];
                    for (const stopId of stopLists[route]) {
                        const etaVal = getETAForStop(data.busName, stopId);
                        if (typeof etaVal === 'number' && etaVal < 0) {
                            invalidStops.push(`stop${stopId}:${etaVal}`);
                        }
                    }
                    if (invalidStops.length > 0) {
                        reason += `(negative ETAs: ${invalidStops.join(', ')}) `;
                    }
                }
            }
            // console.log(`[${data.busName}] xx:xx due to: ${reason.trim()}`);
        } else {
            $('.stop-info-buses-grid').append(`<div class="stop-bus-eta pointer">${data.eta >= 60 ? (data.eta%60 === 0 ? Math.floor(data.eta/60) + 'h' : Math.floor(data.eta/60) + 'h ' + data.eta%60 + 'm') : data.eta + 'm'}</div>`);
            $('.stop-info-buses-grid').append(`<div class="stop-bus-time pointer">${formattedTime}</div>`);
        }

        if (busData[data.busName]?.atDepot) {
            $('.stop-bus-route').last().css('color', 'gray');
            $('.stop-bus-eta').last().css('color', 'gray');
            $('.stop-info-buses-grid').children().slice(-4).removeClass('pointer');
        } else if (visibleRoute && visibleRoute !== data.route) {
            $('.stop-bus-route').last().css('color', 'var(--theme-hidden-route-col)');
            $('.stop-bus-eta').last().css('color', 'var(--theme-hidden-route-col)');
            $('.stop-info-buses-grid').children().slice(-4).removeClass('pointer');
        } else if (visibleRoute) {
            $('.stop-bus-route').last().css('color', colorMappings[data.route]);
            $('.stop-info-buses-grid').children().slice(-4).click(function() {
                sourceStopId = stopId;
                flyToBus(data.busName);
                $('.stop-info-popup').hide();
            });
        } else {
            $('.stop-bus-route').last().css('color', colorMappings[data.route]);
            $('.stop-info-buses-grid').children().slice(-4).click(function() {
                sourceStopId = stopId;
                flyToBus(data.busName);
                $('.stop-info-popup').hide();
            });
        }

        if (data.nextStopName) {
            $('.stop-info-buses-grid').append(`<div class="stop-bus-next-stop" style="font-weight: 500; font-size: 1.2rem; margin-top: -0.3rem; line-height: 1; grid-column: span 4; color: ${colorMappings[data.route]}">To ${data.nextStopName}</div>`);
        }
             
    });

    if ($('.stop-info-buses-grid').children().length > 0) {
        $('.stop-info-buses-grid').show();
    } else {
        $('.stop-info-buses-grid').hide();
    }
    

    const loopTimes = calculateLoopTimes();
    let allNextLoopEntries = servicingEntries
        .filter(entry => !busData[entry.busName].oos && !busData[entry.busName].atDepot && !distanceFromLine(entry.busName) && !isPostCutoffEntry(entry, now))
        .map(entry => ({
            ...entry,
            eta: entry.eta + loopTimes[entry.route]
        }));

    const nextLoopEntries = [];

    allNextLoopEntries.forEach(entry => {
        if (isPostCutoffEntry(entry, now)) {
            postCutoffEntries.push(entry);
        } else {
            nextLoopEntries.push(entry);
        }
    });

    nextLoopEntries.sort((a, b) => a.eta - b.eta);
    postCutoffEntries.sort((a, b) => a.eta - b.eta);

    nextLoopEntries.forEach(data => {

        const currentTime = new Date();
        currentTime.setMinutes(currentTime.getMinutes() + data.eta);
        const formattedTime = currentTime.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true

        });


        if (!busData[data.busName].overtime && !busData[data.busName].oos && !busData[data.busName].atDepot && isValid(data.busName)) {

            const $routeCellNext = $('<div class="stop-bus-route user-no-select"></div>');
            $routeCellNext.append(`<div>${data.route.toUpperCase()}</div>`);
            $('.stop-info-buses-grid-next').append($routeCellNext);

            const $stopBusElm = $(`<div class="flex justify-between align-center pointer user-no-select">
                <div class="flex gap-x-0p5rem">
                    <div class="stop-bus-name">${busData[data.busName].busName}</div>
                </div>
            </div>`)
            $('.stop-info-buses-grid-next').append($stopBusElm);

            if (data.eta === 0) {
                // $('.stop-info-buses-grid').append(`<div></div>`)
                $('.stop-info-buses-grid-next').append(`<div class="stop-bus-eta pointer user-no-select">Here</div>`);
                $('.stop-info-buses-grid-next').append(`<div class="pointer user-no-select"></div>`);
            } else if (!busData[data.busName].atDepot) {
                $('.stop-info-buses-grid-next').append(`<div class="stop-bus-eta pointer right user-no-select">${data.eta >= 60 ? (data.eta%60 === 0 ? Math.floor(data.eta/60) + 'h' : Math.floor(data.eta/60) + 'h ' + data.eta%60 + 'm') : data.eta + 'm'}</div>`);
                $('.stop-info-buses-grid-next').append(`<div class="stop-bus-time pointer user-no-select">${formattedTime}</div>`);
            } else if (busData[data.busName].atDepot || distanceFromLine(data.busName)) {
                $('.stop-info-buses-grid-next').append(`<div class="stop-bus-eta pointer user-no-select"></div>`);
                $('.stop-info-buses-grid-next').append(`<div class="stop-bus-time pointer user-no-select"></div>`);
            }

            if (busData[data.busName]?.atDepot) {
                $('.stop-bus-route').last().css('color', 'gray');
                $('.stop-info-buses-grid-next').children().slice(-4).removeClass('pointer');
            } else if (visibleRoute && visibleRoute !== data.route) {
                $('.stop-bus-route').last().css('color', 'var(--theme-hidden-route-col)');
                $('.stop-bus-eta').last().css('color', 'var(--theme-hidden-route-col)');
                $('.stop-info-buses-grid-next').children().slice(-4).removeClass('pointer');
            } else if (visibleRoute) {
                $('.stop-bus-route').last().css('color', colorMappings[data.route]);
                $('.stop-info-buses-grid-next').children().slice(-4).click(function() {
                    sourceStopId = stopId;
                    flyToBus(data.busName);
                    $('.stop-info-popup').hide();
                });
            } else {
                $('.stop-bus-route').last().css('color', colorMappings[data.route]);
                $('.stop-info-buses-grid-next').children().slice(-4).click(function() {
                    sourceStopId = stopId;
                    flyToBus(data.busName);
                    $('.stop-info-popup').hide();
                });
            }

            if (data.nextStopName) {
                $('.stop-info-buses-grid-next').append(`<div class="stop-bus-next-stop user-no-select" style="font-weight: 500; font-size: 1.2rem; margin-top: -0.3rem; line-height: 1; grid-column: span 4; color: ${colorMappings[data.route]}">To ${data.nextStopName}</div>`);
            }
        }    
    })

    // Render post-cutoff entries (buses that may go out of service before arriving)
    $('.stop-info-buses-grid-post-cutoff').empty();
    if (postCutoffEntries.length > 0) {
        $('.stop-info-post-cutoff-wrapper').show();
        postCutoffEntries.forEach(data => {
            const ct = new Date();
            ct.setMinutes(ct.getMinutes() + data.eta);
            const ft = ct.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            });

            const $routeCell = $('<div class="stop-bus-route user-no-select"></div>');
            $routeCell.append(`<div>${data.route.toUpperCase()}</div>`);
            $('.stop-info-buses-grid-post-cutoff').append($routeCell);

            const $stopBusElm = $(`<div class="flex justify-between align-center pointer user-no-select">
                <div class="flex gap-x-0p5rem">
                    <div class="stop-bus-name">${busData[data.busName].busName}</div>
                </div>
            </div>`)
            $('.stop-info-buses-grid-post-cutoff').append($stopBusElm);

            const etaText = data.eta >= 60 ? (data.eta%60 === 0 ? Math.floor(data.eta/60) + 'h' : Math.floor(data.eta/60) + 'h ' + data.eta%60 + 'm') : data.eta + 'm';
            $('.stop-info-buses-grid-post-cutoff').append(`<div class="stop-bus-eta pointer right user-no-select">${etaText}</div>`);
            $('.stop-info-buses-grid-post-cutoff').append(`<div class="stop-bus-time pointer user-no-select">${ft}</div>`);

            if (visibleRoute && visibleRoute !== data.route) {
                $('.stop-bus-route').last().css('color', 'var(--theme-hidden-route-col)');
                $('.stop-bus-eta').last().css('color', 'var(--theme-hidden-route-col)');
                $('.stop-info-buses-grid-post-cutoff').children().slice(-4).removeClass('pointer');
            } else if (visibleRoute) {
                $('.stop-bus-route').last().css('color', colorMappings[data.route]);
                $('.stop-info-buses-grid-post-cutoff').children().slice(-4).click(function() {
                    sourceStopId = stopId;
                    flyToBus(data.busName);
                    $('.stop-info-popup').hide();
                });
            } else {
                $('.stop-bus-route').last().css('color', colorMappings[data.route]);
                $('.stop-info-buses-grid-post-cutoff').children().slice(-4).click(function() {
                    sourceStopId = stopId;
                    flyToBus(data.busName);
                    $('.stop-info-popup').hide();
                });
            }

            if (data.nextStopName) {
                $('.stop-info-buses-grid-post-cutoff').append(`<div class="stop-bus-next-stop user-no-select" style="font-weight: 500; font-size: 1.2rem; margin-top: -0.3rem; line-height: 1; grid-column: span 4; color: ${colorMappings[data.route]}">To ${data.nextStopName}</div>`);
            }
        })
    } else {
        $('.stop-info-post-cutoff-wrapper').hide();
    }

    // Render 3rd section: deferred entries (buses at depot or with invalid ETAs)
    $('.stop-info-buses-grid-deferred').empty();
    if (deferredEntries.length > 0) {
        $('.stop-info-deferred-wrapper').show();
        deferredEntries.forEach(data => {
            const $routeCellNext = $('<div class="stop-bus-route user-no-select" style="grid-column: 1; align-self: center;"></div>');
            $routeCellNext.append(`<div>${data.route.toUpperCase()}</div>`);
            $('.stop-info-buses-grid-deferred').append($routeCellNext);

            let stopDepotVisibilityClass = 'none';
            if (busData[data.busName]?.atDepot) {
                stopDepotVisibilityClass = '';
            }

            let stopOoSVisibilityClass = 'none';
            if (busData[data.busName]?.oos) {
                stopOoSVisibilityClass = '';
            }

            const $stopBusElm = $(`<div class="flex justify-between align-center pointer user-no-select" style="grid-column: 2 / span 3; align-self: center;">
                <div class="flex gap-x-0p5rem align-center">
                    <div class="stop-bus-name">${busData[data.busName].busName}</div>
                    <div class="stop-oos ${stopOoSVisibilityClass}">OOS</div>
                    <div class="stop-depot ${stopDepotVisibilityClass}">Depot</div>
                </div>
            </div>`);
            $('.stop-info-buses-grid-deferred').append($stopBusElm);

            $('.stop-bus-route').last().css('color', 'gray');
            const $deferredItems = $('.stop-info-buses-grid-deferred').children().slice(-2);
            $deferredItems.addClass('pointer').click(function() {
                sourceStopId = stopId;
                flyToBus(data.busName);
                $('.stop-info-popup').hide();
            });

            if (data.nextStopName) {
                const $nextStopEl = $(`<div class="stop-bus-next-stop pointer user-no-select" style="font-weight: 500; font-size: 1.2rem; margin-top: -0.3rem; line-height: 1; grid-column: span 4; color: gray">To ${data.nextStopName}</div>`);
                $nextStopEl.click(function() {
                    sourceStopId = stopId;
                    flyToBus(data.busName);
                    $('.stop-info-popup').hide();
                });
                $('.stop-info-buses-grid-deferred').append($nextStopEl);
            }
        });
    } else {
        $('.stop-info-deferred-wrapper').hide();
    }

    if (waits[stopId]) {
        const avgWait = waits[stopId];
        const mins = Math.floor(avgWait / 60);
        const secs = avgWait % 60;
        let waitStr = '';
        if (mins >= 1) {
            if (secs === 0) {
                waitStr = `${mins}m`;
            } else {
                waitStr = `${mins}m ${secs}s`;
            }
        } else {
            waitStr = `${secs}s`;
        }

        if (!jQuery.isEmptyObject(busData)) {
            $('.stop-info-avg-wait').text(`Buses stop here for ${waitStr} on average.`).show();
        }
    } else {
        $('.stop-info-avg-wait').hide();
    }
    
}

let sourceBusName = null;
let sourceStopId = null;

// Config object mapping stopId to its switch pair and direction info
const stopSwitchConfig = {
    'nb': {
        6: { // Hill North
            pair: 7,
            directions: [
                { label: 'NB', active: true, switch: 1 },
                { label: 'SB', active: false, switch: 2 }
            ]
        },
        7: { // Hill South
            pair: 6,
            directions: [
                { label: 'NB', active: false, switch: 1 },
                { label: 'SB', active: true, switch: 2 }
            ]
        },
        22: { // SoCam North
            pair: 23,
            directions: [
                { label: 'NB', active: true, switch: 1 },
                { label: 'SB', active: false, switch: 2 }
            ]
        },
        23: { // SoCam South
            pair: 22,
            directions: [
                { label: 'NB', active: false, switch: 1 },
                { label: 'SB', active: true, switch: 2 }
            ]
        },
        3: { // SAC North
            pair: 4,
            directions: [
                { label: 'NB', active: true, switch: 1 },
                { label: 'SB', active: false, switch: 2 }
            ]
        },
        4: { // SAC South
            pair: 3,
            directions: [
                { label: 'NB', active: false, switch: 1 },
                { label: 'SB', active: true, switch: 2 }
            ]
        },
        11: { // Werblin North
            pair: 27,
            directions: [
                { label: 'NB', active: true, switch: 1 },
                { label: 'SB', active: false, switch: 2 }
            ]
        },
        27: { // Werblin South
            pair: 11,
            directions: [
                { label: 'NB', active: false, switch: 1 },
                { label: 'SB', active: true, switch: 2 }
            ]
        },
        8: { // Allison Road Classrooms
            pair: 9,
            directions: [
                { label: 'ARC', active: true, switch: 1 },
                { label: 'Sci', active: false, switch: 2 }
            ]
        },
        9: { // Science Building
            pair: 8,
            directions: [
                { label: 'ARC', active: false, switch: 1 },
                { label: 'Sci', active: true, switch: 2 }
            ]
        }
    },
    'newark': {
        2: { // NJIT North
            pair: 3,
            directions: [
                { label: 'NB', active: true, switch: 1 },
                { label: 'SB', active: false, switch: 2 }
            ]
        },
        3: { // NJIT South
            pair: 2,
            directions: [
                { label: 'NB', active: false, switch: 1 },
                { label: 'SB', active: true, switch: 2 }
            ]
        },
        4: { // ICPH North
            pair: 5,
            directions: [
                { label: 'NB', active: true, switch: 1 },
                { label: 'SB', active: false, switch: 2 }
            ]
        },
        5: { // ICPH South
            pair: 4,
            directions: [
                { label: 'NB', active: false, switch: 1 },
                { label: 'SB', active: true, switch: 2 }
            ]
        },
        6: { // Bergen Building Front
            pair: 7,
            directions: [
                { label: 'Front', active: true, switch: 1 },
                { label: 'Back', active: false, switch: 2 }
            ]
        },
        7: { // Bergen Building Back
            pair: 6,
            directions: [
                { label: 'Front', active: false, switch: 1 },
                { label: 'Back', active: true, switch: 2 }
            ]
        },
    }
};

$(window).resize(function() {
    updateStopBusesMaxHeight();
});


function updateStopBusesMaxHeight() {
    const stopBuses = $('.stop-info-popup-inner');
    // if (stopBuses.length === 0) return; not sur ei need this
    const maxHeight = window.innerHeight - stopBuses.offset().top - $('.stop-btns').innerHeight() - $('.bottom').innerHeight();
    // console.log(maxHeight);
    $('.stop-info-popup-inner').css('max-height', maxHeight - 75);
}

async function popStopInfo(stopId) {
    const cameFromSearch = typeof searchReentry !== 'undefined' && searchReentry;
    searchReentry = false; // one-shot: only the popup directly following a search selection shows the back button
    searchBackActive = cameFromSearch; // persist for the back-button click handler
    // console.log('popStopInfo', stopId);
    
    if (!sim) {
        sa_event('stop_view_test', {
            'stop_id': stopId,
            'stop_name': stopsData[stopId].name
        });
        sa_event('view_stop', {
            'stop_id': stopId,
            'stop_name': stopsData[stopId].name
        });
    } else {
        sa_event('stop_view_test', {
            'stop_id': 'sim-' + stopId,
            'stop_name': 'sim-' + stopsData[stopId].name
        });
        sa_event('view_stop', {
            'stop_id': 'sim-' + stopId,
            'stop_name': 'sim-' + stopsData[stopId].name
        });
    }

    if (appStyle === 'rider') {
        popRiderStopInfo(stopId);
        return;
    }

    // Don't show stop info when in parking permit mode
    if ($('body').hasClass('parking-permit-mode')) {
        return;
    }
    if (typeof closeSearch === 'function') closeSearch();
    if (popupStopId) {
        $(`img[stop-marker-id="${popupStopId}"]`).attr('src', 'img/stop_marker.png');
        busStopMarkers[popupStopId].setZIndexOffset(settings['toggle-stops-above-buses'] ? 1000 : 0);
        if (typeof stopLayerManager !== 'undefined') {
            stopLayerManager.setSelected(null);
        }
        
        // If we have an active route filter, and it doesn't service the previous stop, hide it
        if (shownRoute && shownRoute !== 'fav' && stopLists[shownRoute]) {
            const isServiced = stopLists[shownRoute].some(id => Number(id) === Number(popupStopId));
            if (!isServiced) {
                busStopMarkers[popupStopId].remove();
            }
        }
    }

    console.log('[DEBUG popStopInfo]', { stopId, hasStopData: !!(stopsData && stopsData[stopId]), hasMarker: !!(busStopMarkers && busStopMarkers[stopId]), popupStopId, shownRoute });
    if (!busStopMarkers[stopId]) {
        console.error('[DEBUG popStopInfo] Missing busStopMarkers entry for stopId:', stopId, 'existing markers:', Object.keys(busStopMarkers));
    }

    // Ensure the newly selected stop marker is added to the map in case it was hidden by the route filter
    if (busStopMarkers[stopId]) {
        busStopMarkers[stopId].addTo(map);
    }

    $(`img[stop-marker-id="${stopId}"]`).attr('src', 'img/stop_marker_selected.png');
    busStopMarkers[stopId].setZIndexOffset(2000);
    if (typeof stopLayerManager !== 'undefined') {
        stopLayerManager.setSelected(stopId);
    }

    if (Number(closestStopId) === stopId && (closestDistance < maxDistanceMiles || settings['toggle-bypass-max-distance'])) {
        $('.closest-stop').show();
    } else {
        $('.closest-stop').hide();
    }

    let stopName = stopsData[stopId].name;

    if (stopsData[stopId].mainName) {
        stopName = stopsData[stopId].mainName;
        const config = stopSwitchConfig[selectedCampus][stopId];
        if (config) {
            $('.info-stop-switch').css('display', 'inline-block');
            config.directions.forEach((dir, idx) => {
                const sel = `.info-stop-switch-${dir.switch}`;
                $(sel).text(dir.label);
                if (dir.active) {
                    $(sel).css('color', 'var(--theme-bg)').css('background-color', 'var(--theme-color)');
                } else {
                    $(sel).css('color', '').css('background-color', '');
                }
            });
            // Handle switch visibility and click
            config.directions.forEach((dir, idx) => {
                const sel = `.info-stop-switch-${dir.switch}`;
                // The "other" direction is the one that switches to the pair stop
                if (dir.active) return; // skip the active one
                if (!activeStops.includes(config.pair)) {
                    $(sel).hide();
                } else {
                    $(sel).show();
                    $('.stop-name-wrapper').parent().one('click', function() {popStopInfo(config.pair)});
                }
            });
        } else {
            $('.info-stop-switch').hide();
            $('.stop-name-wrapper').parent().off('click');
        }
    } else {
        $('.info-stop-switch').hide();
        $('.stop-name-wrapper').parent().off('click');
    }

    if (shownRoute && popupBusName) {
        busesByRoutes[selectedCampus][shownRoute].forEach(busName => {
            busMarkers[busName].setVisibility(true);
        })
        updateTooltips(shownRoute);
    } else {
        clearAllStopEtas();
    }

    // Save original map filter before opening stop (for restore on close via pan)
    if (!popupStopId && originalStopShownRoute === undefined) {
        originalStopShownRoute = shownRoute || null;
    }

    popupStopId = stopId;

    // If we just unfocused a bus, check if its route has no in-service buses and prune polylines if needed
    if (popupBusName) {
        const route = busData[popupBusName].route;
        if (!routeHasInServiceBuses(route) && polylines[route]) {
            logPolylineRemoval(route, 'popStopInfo');
            try { polylines[route].remove(); } catch (e) { console.warn('[popStopInfo] failed to remove polyline for route ' + route + ':', e); }
            delete polylines[route];
            // Keep routeBounds cached; recompute global polyline bounds via shared helper
            updatePolylineBoundsIfNeeded();
        }

        popupBusName = null;
    }

    if (!shownRoute) { // if we had a bus focused, stops not in its route would be hidden, e.g. tapping ARC from a wknd1 bus selected would have science building still hidden, and tapping the "Sci" mapping on top would fly to an invisible stop marker. Must show all.
        showAllStops();
    }

    if (selectedMarkerId && busMarkers[selectedMarkerId] ) { 
        const rotationElement = getMarkerRotationElement(busMarkers[selectedMarkerId]);
        if (rotationElement) {
            rotationElement.style.boxShadow = '';
        }
        selectedMarkerId = null;
    }

    $('.bus-info-popup, .route-panel, .my-location-popup, .knight-mover').hide();
    
    // Update route selectors to only show routes that service this stop
    populateRouteSelectors(activeRoutes, stopId);
    
    $('.settings-btn, .sim-btn').hide();

    // return;

    $('.info-stop-name-text').text(settings['toggle-show-stop-id'] ? `${stopName} (#${stopId})` : stopName);

    // Compute second loop entries to check if we should show the shw next loop button
    const routesServicing = getRoutesServicingStop(stopId);
    let servicingEntries = [];
    routesServicing.forEach(route => {
        busesByRoutes[selectedCampus][route].forEach(busName => {
            if (isValid(busName)) {
                const eta = getETAForStop(busName, stopId);
                if (eta >= 0) {
                    servicingEntries.push({
                        busName: busName,
                        eta: eta,
                        route: route
                    });
                }
            }
        });
    });
    
    const loopTimes = calculateLoopTimes();
    const nextLoopEntries = servicingEntries.reduce((acc, entry) => {
        if (!busData[entry.busName].oos && !busData[entry.busName].atDepot && !distanceFromLine(entry.busName)) {
            acc.push({
                ...entry,
                eta: entry.eta + loopTimes[entry.route]
            });
        }
        return acc;
    }, []).sort((a, b) => a.eta - b.eta);

    const onlySpecialActive = activeRoutes.size > 0 && Array.from(activeRoutes).every(route => route === 'all' || route === 'helix' || route.endsWith('1') || route.endsWith('2'));
    const showSecondLoop = settings['toggle-always-show-second'] || onlySpecialActive;

    if (!showSecondLoop) {
        $('.stop-info-next-loop-wrapper').hide();
        $('.always-show-next-loop').hide(); // Hide always show button when wrapper is closed

        if (nextLoopEntries.length > 0) {
            $('.stop-info-show-next-loop').show();
        } else {
            $('.stop-info-show-next-loop').hide();
        }
    } else {
        $('.stop-info-next-loop-wrapper').show();
        $('.stop-info-show-next-loop').hide();
    }
    updateStopBuses(stopId, shownRoute);

    // Check if there are out of service buses and show hide button if not already hidden
    let hasOutOfServiceBuses = false;
    routesServicing.forEach(route => {
        busesByRoutes[selectedCampus][route].forEach(busName => {
            if (busData[busName].oos) {
                hasOutOfServiceBuses = true;
            }
        });
    });
    
    if (hasOutOfServiceBuses && !hideOutOfServiceBuses && settings['toggle-show-out-of-service']) {
        $('.stop-info-hide-oos').show();
    } else {
        $('.stop-info-hide-oos').hide();
    }

    if (sourceBusName && !sourceStopId) { // !sourceStopId kind a hack, have to look into how/why this is being set
        $('.stop-info-back .flex div').text('BACK');
        $('.stop-info-back, .stop-info-back-wrapper').stop(true, true).show();
        $('.stop-info-back-wrapper').css('display', 'flex');
    } else if (cameFromSearch) {
        $('.stop-info-back .flex div').text('Back to search');
        $('.stop-info-back, .stop-info-back-wrapper').stop(true, true).show();
        $('.stop-info-back-wrapper').css('display', 'flex');
    } else {
        $('.stop-info-back, .stop-info-back-wrapper').stop(true, true).hide();
    }

    $('.stop-info-use-route-selectors-notice').hide();

    $('.stop-info-popup').stop(true, true).show();
    if (typeof hideCenterStops === 'function') hideCenterStops();
    if (typeof isDesktop !== 'undefined' && isDesktop && !isTouchDevice) showEscNotice('stop');

    $('.stop-info-popup-inner').scrollTop(0);

    setTimeout(updateStopBusesMaxHeight, 0);

    $('.bus-log-wrapper').hide();

    $('.building-info-popup').hide();
    unhighlightBuilding();
}

async function addStopsToMap() {

    activeStops = []

    if (isForceShowStopsEnabled()) {
        const forceRoutes = getForceShowRoutes();
        for (const route of forceRoutes) {
            if (stopLists[route]) {
                activeStops = [...activeStops, ...stopLists[route]];
            }
        }
        activeStops = [...new Set(activeStops)];
    } else {
        for (const activeRoute in busesByRoutes[selectedCampus]) {
            if (!settings['toggle-show-out-of-service'] && !routeHasInServiceBuses(activeRoute)) continue;
            if (!(activeRoute in stopLists)) { console.log('does this actually happen?'); continue; }
            activeStops = [...activeStops, ...stopLists[activeRoute]];
            activeStops = [...new Set(activeStops)];
        }
    }

    if (!activeStops.length && !isForceShowStopsEnabled()) {
        console.log('no buses running, showing all stops');
        activeStops = Object.keys(stopsData || {}).map(Number);
    }

    checkIfLocationShared();

    // console.log(activeStops)
    activeStops.forEach(stopId => {

        if (!busStopMarkers[stopId]) { // Adding stops from new buses, need to exclude existing stops
            const thisStop = stopsData[stopId];
            if (!thisStop) {
                console.error('[DEBUG addStopsToMap] Attempted to load undefined stop in stopsData:', { stopId, type: typeof stopId, stopsDataKeys: Object.keys(stopsData) });
            }
            const lat = thisStop['latitude'];
            const long = thisStop['longitude'];

            const marker = L.marker([lat, long], { 
                icon: L.divIcon({
                    className: 'custom-stop-icon',
                    iconSize: [30, 30],
                    iconAnchor: [15, 15],
                    html: `
                        <div class="marker-wrapper">
                            <img src="img/stop_marker.png" width="18" height="18" stop-marker-id="${stopId}"/>
                            <div class="corner-label none" stop-eta="${stopId}">xm</div>
                        </div>
                    `
                }),
                zIndexOffset: settings['toggle-stops-above-buses'] ? 1000 : 0,
            })
            .addTo(map)
            .on('click', function() {
                // Don't process stop clicks when in parking permit mode
                if ($('body').hasClass('parking-permit-mode')) {
                    return;
                }

                sourceStopId = null;
                sourceBusName = null;
                clearPanoutFeedback();
                popStopInfo(stopId);
                if (!shownRoute) {
                    showAllBuses();
                    showAllPolylines();
                }
            });
            
            busStopMarkers[stopId] = marker;
        }
    });
    updateStopsOpacity();
}



function removePreviouslyActiveStops() {
    let newActiveStops = [];

    if (isForceShowStopsEnabled()) {
        const forceRoutes = getForceShowRoutes();
        for (const route of forceRoutes) {
            if (stopLists[route]) {
                newActiveStops = [...newActiveStops, ...stopLists[route]];
            }
        }
    } else if (busesByRoutes && busesByRoutes[selectedCampus]) {
        for (const route in busesByRoutes[selectedCampus]) {
            if (route in stopLists) {
                newActiveStops = [...newActiveStops, ...stopLists[route]];
            }
        }
    }

    newActiveStops = [...new Set(newActiveStops)];

    if (newActiveStops.length === 0 && !isForceShowStopsEnabled()) {
        newActiveStops = Array.from({ length: Object.keys(stopsData).length }, (_, i) => i + 1);
    }

    for (const stopId in busStopMarkers) {
        if (!newActiveStops.includes(Number(stopId))) {
            map.removeLayer(busStopMarkers[stopId]);
            delete busStopMarkers[stopId];

            if (popupStopId === stopId) {
                popupStopId = null;
                hideInfoBoxes();
                sourceStopId = null;
            }
        }
    }

    activeStops = newActiveStops;

    if (typeof window.updateCenterStops === 'function') {
        window.updateCenterStops();
    }
}



function routesServicing(stopId) {
    let routesServicing = []  
    let routesArray = Array.from(activeRoutes).filter(route => getCampusRoutes(selectedCampus).includes(route));
    routesArray.forEach(activeRoute => {
        if (stopLists[activeRoute].includes(stopId)) { // remove activeRoute in stopLists check after adding football routes + stops
            routesServicing.push(activeRoute);
        }
    })
    return routesServicing;
}


function progressToNextStop(busName) {
    if (!busData[busName]['next_stop']) {
        return 0;
    }

    const campusPercentages = percentageDistances[selectedCampus];

    const nextStopId = String(busData[busName]['next_stop']);
    if (!campusPercentages[nextStopId]) {
        return 0;
    }

    const prevStopId = String(busData[busName]['stopId']);
    if (!campusPercentages[nextStopId]['from'][prevStopId]) {
        return 0;
    }

    const nextStopDistances = campusPercentages[nextStopId]['from'][prevStopId]['geometry']['coordinates'];
    const percentages = campusPercentages[nextStopId]['from'][prevStopId]['properties']['percentages'];

    const busLat = busData[busName]['lat'];
    const busLng = busData[busName]['long'];

    // Step 1: Find the closest point
    let closestIndex = -1;
    let minDistance = Infinity;

    for (let i = 0; i < nextStopDistances.length; i++) {
        const pointLat = nextStopDistances[i][1];
        const pointLng = nextStopDistances[i][0];
        const dist = Math.sqrt(
            Math.pow(busLat - pointLat, 2) +
            Math.pow(busLng - pointLng, 2)
        );

        if (dist < minDistance) {
            minDistance = dist;
            closestIndex = i;
        }
    }

    // Step 2: Determine if the closest point is previous or future
    let previousPointIndex, nextPointIndex;

    if (closestIndex === 0) {
        previousPointIndex = 0;
        nextPointIndex = 1;
    } else if (closestIndex === nextStopDistances.length - 1) {
        previousPointIndex = nextStopDistances.length - 2;
        nextPointIndex = nextStopDistances.length - 1;
    } else {
        const previousPoint = nextStopDistances[closestIndex - 1];
        const nextPoint = nextStopDistances[closestIndex + 1];

        const distToPrevious = Math.sqrt(
            Math.pow(busLat - previousPoint[1], 2) +
            Math.pow(busLng - previousPoint[0], 2)
        );

        const distToNext = Math.sqrt(
            Math.pow(busLat - nextPoint[1], 2) +
            Math.pow(busLng - nextPoint[0], 2)
        );

        if (distToPrevious < distToNext) {
            previousPointIndex = closestIndex - 1;
            nextPointIndex = closestIndex;
        } else {
            previousPointIndex = closestIndex;
            nextPointIndex = closestIndex + 1;
        }
    }

    const previousPoint = nextStopDistances[previousPointIndex];
    const nextPoint = nextStopDistances[nextPointIndex];
    const previousPercentage = percentages[previousPointIndex];
    const nextPercentage = percentages[nextPointIndex];

    const distanceBetweenPoints = Math.sqrt(
        Math.pow(nextPoint[1] - previousPoint[1], 2) +
        Math.pow(nextPoint[0] - previousPoint[0], 2)
    );

    const distanceFromBusToPrevious = Math.sqrt(
        Math.pow(busLat - previousPoint[1], 2) +
        Math.pow(busLng - previousPoint[0], 2)
    );

    const progressBetweenPoints = distanceFromBusToPrevious / distanceBetweenPoints;
    const interpolatedPercentage = previousPercentage + (nextPercentage - previousPercentage) * progressBetweenPoints;

    return interpolatedPercentage;
}
