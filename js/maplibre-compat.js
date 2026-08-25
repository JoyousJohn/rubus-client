// js/maplibre-compat.js - extracted verbatim from js/map.js
function getMapLibreStyleSpec(tileUrl) {
    if (tilesDisabledForTest) {
        return {
            version: 8,
            glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
            sources: {},
            layers: [{
                id: 'test-background',
                type: 'background',
                paint: { 'background-color': '#dcd7d0' }
            }]
        };
    }
    return {
        version: 8,
        glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
        sources: {
            'raster-tiles': {
                type: 'raster',
                tiles: [tileUrl],
                tileSize: 256
            }
        },
        layers: [{
            id: 'simple-tiles',
            type: 'raster',
            source: 'raster-tiles',
            minzoom: 0,
            maxzoom: 22,
            paint: {
                // Skip the default 300ms fade-in blit when tiles load during a pan
                'raster-fade-duration': 0
            }
        }]
    };
}

function initMapLibreCompatibility(mapInstance) {
    mapInstance.setView = function(center, zoom, options) {
        let lng, lat;
        if (Array.isArray(center)) {
            lat = center[0]; lng = center[1];
        } else if (center && center.lat !== undefined) {
            lat = center.lat; lng = center.lng;
        }
        if (lng !== undefined && lat !== undefined) {
            mapInstance.jumpTo({ center: [lng, lat], zoom: zoom !== undefined ? zoom : mapInstance.getZoom() });
        }
        return mapInstance;
    };

    mapInstance.flyToView = mapInstance.flyTo.bind(mapInstance);
    mapInstance.flyTo = function(centerOrOptions, zoom, options) {
        if (centerOrOptions && (Array.isArray(centerOrOptions) || centerOrOptions.lat !== undefined)) {
            let lat = Array.isArray(centerOrOptions) ? centerOrOptions[0] : centerOrOptions.lat;
            let lng = Array.isArray(centerOrOptions) ? centerOrOptions[1] : centerOrOptions.lng;
            options = options || {};
            // Leaflet's flyTo duration option is in SECONDS; MapLibre's is in
            // milliseconds, so multiply by 1000. Default 1200ms matches
            // MapLibre's native default. Only numeric values are accepted so
            // duration:0 (instant) is honored while null/strings fall back to
            // the default instead of silently becoming 0ms.
            let duration = 1200;
            if (typeof options.duration === 'number') {
                duration = options.duration * 1000;
            } else if (options.duration !== undefined) {
                console.warn('[L.flyTo] non-numeric duration passed (' + options.duration + '); using default 1200ms.');
            }
            mapInstance.flyToView({ center: [lng, lat], zoom: zoom !== undefined ? zoom : mapInstance.getZoom(), duration: duration });
        } else if (centerOrOptions && centerOrOptions.center) {
            mapInstance.flyToView(centerOrOptions);
        }
        return mapInstance;
    };

    const originalFitBounds = mapInstance.fitBounds.bind(mapInstance);
    mapInstance.fitBounds = function(bounds, options) {
        if (!bounds) return mapInstance;
        let bbox;
        if (Array.isArray(bounds)) {
            if (Array.isArray(bounds[0])) {
                bbox = [[bounds[0][1], bounds[0][0]], [bounds[1][1], bounds[1][0]]];
            } else {
                bbox = bounds;
            }
        } else if (bounds.getSouthWest && bounds.getNorthEast) {
            const sw = bounds.getSouthWest();
            const ne = bounds.getNorthEast();
            bbox = [[sw.lng, sw.lat], [ne.lng, ne.lat]];
        } else if (bounds._southWest) {
            bbox = [[bounds._southWest.lng, bounds._southWest.lat], [bounds._northEast.lng, bounds._northEast.lat]];
        }
        if (bbox) {
            options = options || {};
            let mapLibreOptions = {};
            if (options.paddingTopLeft || options.paddingBottomRight) {
                const pTL = options.paddingTopLeft || [0, 0];
                const pBR = options.paddingBottomRight || [0, 0];
                mapLibreOptions.padding = {
                    left: pTL[0],
                    top: pTL[1],
                    right: pBR[0],
                    bottom: pBR[1]
                };
            } else if (options.padding) {
                if (Array.isArray(options.padding)) {
                    mapLibreOptions.padding = { top: options.padding[0], bottom: options.padding[0], left: options.padding[1], right: options.padding[1] };
                } else if (typeof options.padding === 'number') {
                    mapLibreOptions.padding = options.padding;
                } else {
                    mapLibreOptions.padding = options.padding;
                }
            }
            if (options.animate !== undefined) mapLibreOptions.animate = options.animate;
            if (options.bearing !== undefined) mapLibreOptions.bearing = options.bearing;
            if (!bbox || isNaN(bbox[0][0]) || isNaN(bbox[0][1]) || isNaN(bbox[1][0]) || isNaN(bbox[1][1])) {
                throw new Error('[MapLibre] Invalid bbox provided to fitBounds: ' + JSON.stringify(bounds));
            }
            originalFitBounds(bbox, mapLibreOptions);
        }
        return mapInstance;
    };

    const originalSetMaxBounds = mapInstance.setMaxBounds.bind(mapInstance);
    mapInstance.setMaxBounds = function(bounds) {
        if (!bounds) {
            originalSetMaxBounds(null);
            return mapInstance;
        }
        let bbox;
        if (Array.isArray(bounds)) {
            if (Array.isArray(bounds[0])) {
                bbox = [[bounds[0][1], bounds[0][0]], [bounds[1][1], bounds[1][0]]];
            } else {
                bbox = bounds;
            }
        } else if (bounds.getSouthWest && bounds.getNorthEast) {
            const sw = bounds.getSouthWest();
            const ne = bounds.getNorthEast();
            bbox = [[sw.lng, sw.lat], [ne.lng, ne.lat]];
        } else if (bounds._southWest) {
            bbox = [[bounds._southWest.lng, bounds._southWest.lat], [bounds._northEast.lng, bounds._northEast.lat]];
        }
        if (bbox) {
            originalSetMaxBounds(bbox);
        }
        return mapInstance;
    };

    const originalGetBounds = mapInstance.getBounds.bind(mapInstance);
    mapInstance.getBounds = function() {
        const b = originalGetBounds();
        return {
            getSouthWest: () => ({ lat: b.getSouth(), lng: b.getWest() }),
            getNorthEast: () => ({ lat: b.getNorth(), lng: b.getEast() }),
            pad: function(ratio) {
                const latDiff = (b.getNorth() - b.getSouth()) * ratio;
                const lngDiff = (b.getEast() - b.getWest()) * ratio;
                return {
                    getSouthWest: () => ({ lat: b.getSouth() - latDiff, lng: b.getWest() - lngDiff }),
                    getNorthEast: () => ({ lat: b.getNorth() + latDiff, lng: b.getEast() + lngDiff })
                };
            },
            contains: function(latlng) {
                const lat = Array.isArray(latlng) ? latlng[0] : latlng.lat;
                const lng = Array.isArray(latlng) ? latlng[1] : (latlng.lng !== undefined ? latlng.lng : (latlng.longitude !== undefined ? latlng.longitude : latlng.long));
                return lat >= b.getSouth() && lat <= b.getNorth() && lng >= b.getWest() && lng <= b.getEast();
            }
        };
    };

    const originalGetCenter = mapInstance.getCenter.bind(mapInstance);
    mapInstance.getCenter = function() {
        const c = originalGetCenter();
        return { lat: c.lat, lng: c.lng };
    };

    mapInstance.createPane = function(name) { return document.getElementById('map'); };
    mapInstance.getPane = function(name) { return { style: {} }; };

    mapInstance.getSize = function() {
        const container = mapInstance.getContainer ? mapInstance.getContainer() : null;
        const w = container ? container.clientWidth : window.innerWidth;
        const h = container ? container.clientHeight : window.innerHeight;
        return { x: w, y: h, width: w, height: h };
    };

    // Leaflet latLngToContainerPoint → MapLibre project(): both return a point
    // in CSS pixels measured from the map container's top-left, y-down.
    mapInstance.latLngToContainerPoint = function(latlng) {
        let lng, lat;
        if (Array.isArray(latlng)) {
            lat = latlng[0]; lng = latlng[1];
        } else if (latlng && latlng.lat !== undefined) {
            lat = latlng.lat;
            lng = latlng.lng !== undefined ? latlng.lng : (latlng.long !== undefined ? latlng.long : latlng.lon);
        }
        return mapInstance.project([lng, lat]);
    };
    mapInstance.containerPointToLatLng = function(point) {
        const ll = mapInstance.unproject(point);
        return { lat: ll.lat, lng: ll.lng };
    };

    mapInstance.hasLayer = function(layer) {
        if (!layer) return false;
        if (layer._isOnMap || layer._addedToMap) return true;
        if (layer._mapLibreLayerId) return !!mapInstance.getLayer(layer._mapLibreLayerId);
        if (layer.getElement) {
            const el = layer.getElement();
            return !!(el && el.parentNode);
        }
        return false;
    };

    const originalAddLayer = mapInstance.addLayer.bind(mapInstance);
    const originalRemoveLayer = mapInstance.removeLayer.bind(mapInstance);

    mapInstance.addLayer = function(layer, beforeId) {
        if (!layer) return mapInstance;
        if (typeof layer === 'object' && layer.id && layer.type) {
            originalAddLayer(layer, beforeId);
        } else {
            if (layer._addedToMap) return mapInstance;
            layer._addedToMap = true;
            if (layer.addTo) {
                layer.addTo(mapInstance);
            }
        }
        return mapInstance;
    };

    mapInstance.removeLayer = function(layerOrId) {
        if (!layerOrId) return mapInstance;
        if (typeof layerOrId === 'string') {
            originalRemoveLayer(layerOrId);
        } else if (typeof layerOrId === 'object') {
            layerOrId._addedToMap = false;
            if (layerOrId.remove) {
                layerOrId.remove();
            } else if (layerOrId.removeFrom) {
                layerOrId.removeFrom(mapInstance);
            }
        }
        return mapInstance;
    };

    mapInstance.scrollWheelZoom = {
        enable: function() { if (mapInstance.scrollZoom) mapInstance.scrollZoom.enable(); },
        disable: function() { if (mapInstance.scrollZoom) mapInstance.scrollZoom.disable(); },
        _map: mapInstance
    };

    const originalOn = mapInstance.on.bind(mapInstance);
    const originalOff = mapInstance.off.bind(mapInstance);

    // Registry of every anonymous wrapper installed via the compat map.on,
    // keyed by the original handler it wraps. MapLibre's native off() removes
    // listeners by function identity, so without this mapping off() could never
    // find the wrapper and every on/off pair would leak a listener
    // (centerme.js, map-panout.js, gui.js).
    const handlerWrappers = new Map(); // originalFn -> [{ event, layerId, wrapper }]

    function trackWrapper(originalFn, event, layerId, wrapper) {
        let entries = handlerWrappers.get(originalFn);
        if (!entries) {
            entries = [];
            handlerWrappers.set(originalFn, entries);
        }
        entries.push({ event, layerId, wrapper });
    }

    function makeWrapper(handler) {
        return function(e) {
            if (e && e.lngLat && !e.latlng) {
                e.latlng = { lat: e.lngLat.lat, lng: e.lngLat.lng };
            }
            if (typeof handler === 'function') handler.call(mapInstance, e);
        };
    }

    function unwrapAndRemove(originalFn, event, layerId) {
        const entries = handlerWrappers.get(originalFn);
        let removed = false;
        if (entries) {
            for (let i = entries.length - 1; i >= 0; i--) {
                const entry = entries[i];
                if (entry.event === event && entry.layerId === layerId) {
                    if (layerId !== null) {
                        originalOff(event, layerId, entry.wrapper);
                    } else {
                        originalOff(event, entry.wrapper);
                    }
                    entries.splice(i, 1);
                    removed = true;
                }
            }
            if (entries.length === 0) {
                handlerWrappers.delete(originalFn);
            }
        }
        if (!removed) {
            // Fail fast: an off() that couldn't unwrap a registered wrapper is a
            // bug in the on/off pairing and must not be silently swallowed.
            // Still attempt native removal so pre-install native listeners don't
            // leak — but note MapLibre's off() is a silent no-op when the given
            // listener isn't the one registered, so for a WRAPPED handler this
            // fallback cannot detach it.
            if (layerId !== null) {
                originalOff(event, layerId, originalFn);
            } else {
                originalOff(event, originalFn);
            }
            if (entries) {
                console.error(
                    `[MapLibre compat] map.off('${event}', ...) found no matching wrapper for this handler (wrong event/layerId, or already removed). ` +
                    `The wrapped listener is STILL ATTACHED — native fallback could not remove it.`,
                    originalFn, new Error().stack
                );
            }
            // Handler never registered through the compat map.on: silent no-op,
            // matching native MapLibre off() semantics. MapLibre's own internal
            // code (e.g. Marker.addTo -> setDraggable(false)) routinely calls
            // off() for listeners it never attached, so logging here floods the
            // console on every marker add. The native fallback above already
            // detached any pre-install native listener (or no-ops harmlessly).
        }
    }

    mapInstance.on = function(events, layerOrFn, fn) {
        if (typeof layerOrFn === 'string') {
            const eventList = typeof events === 'string' ? events.split(' ') : events;
            for (const ev of eventList) {
                const wrapper = makeWrapper(fn);
                if (typeof fn === 'function') {
                    trackWrapper(fn, ev, layerOrFn, wrapper);
                }
                originalOn(ev, layerOrFn, wrapper);
            }
            return mapInstance;
        }
        const eventList = typeof events === 'string' ? events.split(' ') : events;
        for (const ev of eventList) {
            const wrapper = makeWrapper(layerOrFn);
            if (typeof layerOrFn === 'function') {
                trackWrapper(layerOrFn, ev, null, wrapper);
            }
            originalOn(ev, wrapper);
        }
        return mapInstance;
    };

    mapInstance.off = function(events, layerOrFn, fn) {
        const isLayerForm = typeof layerOrFn === 'string' && typeof fn === 'function';
        const eventList = typeof events === 'string' ? events.split(' ') : events;

        for (const ev of eventList) {
            if (isLayerForm) {
                unwrapAndRemove(fn, ev, layerOrFn);
            } else if (typeof layerOrFn === 'function') {
                unwrapAndRemove(layerOrFn, ev, null);
            } else {
                // No handler provided: remove every listener for this event.
                originalOff(ev);
                for (const [originalFn, entries] of handlerWrappers) {
                    const remaining = entries.filter(entry => entry.event !== ev);
                    if (remaining.length !== entries.length) {
                        if (remaining.length) handlerWrappers.set(originalFn, remaining);
                        else handlerWrappers.delete(originalFn);
                    }
                }
            }
        }
        return mapInstance;
    };
}

if (typeof L !== 'undefined') {
    L.latLng = function(a, b) {
        if (a === null || a === undefined) return { lat: 0, lng: 0, distanceTo: () => 0 };
        let lat, lng;
        if (Array.isArray(a)) {
            lat = Number(a[0]); lng = Number(a[1]);
        } else if (typeof a === 'object' && a.lat !== undefined) {
            lat = Number(a.lat); lng = Number(a.long !== undefined ? a.long : a.lng);
        } else {
            lat = Number(a); lng = Number(b);
        }
        return {
            lat: lat,
            lng: lng,
            long: lng,
            distanceTo: function(other) {
                const oLat = Array.isArray(other) ? other[0] : other.lat;
                const oLng = Array.isArray(other) ? other[1] : (other.lng !== undefined ? other.lng : other.long);
                const R = 6371000;
                const dLat = (oLat - lat) * Math.PI / 180;
                const dLng = (oLng - lng) * Math.PI / 180;
                const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat * Math.PI / 180) * Math.cos(oLat * Math.PI / 180) * Math.sin(dLng/2) * Math.sin(dLng/2);
                return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
            }
        };
    };

    L.latLngBounds = function(a, b) {
        let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;

        function extendPoint(pt) {
            if (!pt) return;
            const l = L.latLng(pt);
            if (isNaN(l.lat) || isNaN(l.lng)) return;
            if (l.lat < minLat) minLat = l.lat;
            if (l.lat > maxLat) maxLat = l.lat;
            if (l.lng < minLng) minLng = l.lng;
            if (l.lng > maxLng) maxLng = l.lng;
        }

        if (a) {
            if (a.getSouthWest && a.getNorthEast) {
                extendPoint(a.getSouthWest());
                extendPoint(a.getNorthEast());
            } else if (Array.isArray(a) && Array.isArray(a[0])) {
                extendPoint(a[0]);
                extendPoint(a[1]);
            } else {
                extendPoint(a);
            }
        }
        if (b) extendPoint(b);

        const boundsObj = {
            extend: function(other) {
                if (other) {
                    if (other.getSouthWest && other.getNorthEast) {
                        extendPoint(other.getSouthWest());
                        extendPoint(other.getNorthEast());
                    } else {
                        extendPoint(other);
                    }
                }
                return boundsObj;
            },
            getSouthWest: function() {
                return L.latLng(minLat === Infinity ? 0 : minLat, minLng === Infinity ? 0 : minLng);
            },
            getNorthEast: function() {
                return L.latLng(maxLat === -Infinity ? 0 : maxLat, maxLng === -Infinity ? 0 : maxLng);
            },
            getSouth: function() { return minLat === Infinity ? 0 : minLat; },
            getWest: function() { return minLng === Infinity ? 0 : minLng; },
            getNorth: function() { return maxLat === -Infinity ? 0 : maxLat; },
            getEast: function() { return maxLng === -Infinity ? 0 : maxLng; },
            getCenter: function() {
                return L.latLng((minLat + maxLat) / 2, (minLng + maxLng) / 2);
            },
            pad: function(ratio) {
                if (minLat === Infinity) return boundsObj;
                const latDiff = (maxLat - minLat) * ratio;
                const lngDiff = (maxLng - minLng) * ratio;
                return L.latLngBounds([minLat - latDiff, minLng - lngDiff], [maxLat + latDiff, maxLng + lngDiff]);
            },
            contains: function(pt) {
                if (!pt || minLat === Infinity) return false;
                const l = L.latLng(pt);
                return l.lat >= minLat && l.lat <= maxLat && l.lng >= minLng && l.lng <= maxLng;
            },
            isValid: function() {
                return minLat !== Infinity && maxLat !== -Infinity;
            }
        };

        return boundsObj;
    };

    if (!L.circleMarker) {
        L.circleMarker = function(latlng, options) {
            return L.marker(latlng, options);
        };
    }

    L.geoJSON = function(data, options) {
            options = options || {};
            const geoId = 'geojson_' + Math.random().toString(36).substring(2, 9);
            const sourceId = `src_${geoId}`;
            const fillLayerId = `fill_${geoId}`;
            const lineLayerId = `line_${geoId}`;
            // Per-feature highlight overlay: one shared fill/line layer pair per
            // source can't express per-feature colors, so a highlighted feature is
            // re-served through a tiny dedicated source and painted on top.
            const highlightSourceId = `hlsrc_${geoId}`;
            const highlightFillLayerId = `hlfill_${geoId}`;
            const highlightLineLayerId = `hlline_${geoId}`;
            const EMPTY_FEATURE_COLLECTION = { type: 'FeatureCollection', features: [] };

            const layersList = [];
            const subLayerSetStyleWarned = new Set();
            let styleLoadBound = false;
            let highlightedFeature = null;

            function onStyleLoad() {
                add();
            }

            function getPaintColors() {
                if (options.colors) return options.colors;
                const colors = typeof getBuildingColors === 'function' ? getBuildingColors() : {
                    building: { color: '#444', fillColor: '#888', fillOpacity: 0.5 },
                    parking:  { color: '#226622', fillColor: '#44cc44', fillOpacity: 0.3 },
                    fallback: { color: '#333', fillColor: '#ccc', fillOpacity: 0.3 }
                };
                return colors;
            }

            function add() {
                if (!map) return;
                // addSource/addLayer throw until the style JSON is parsed
                // (Style._checkLoaded); retried on style.load (see addTo). The
                // gate is style._loaded, NOT map.isStyleLoaded()/the map 'load'
                // event, which additionally wait on source data requests and can
                // stall indefinitely (hung tile requests), leaving layers
                // permanently unadded.
                if (!(map.style && map.style._loaded)) return;
                try {
                    if (!map.getSource(sourceId)) {
                        map.addSource(sourceId, { type: 'geojson', data: data });
                    }
                    // Insert the base building layers just below the lowest existing
                    // marker layer so stops/buses always render above buildings —
                    // even when buildings are hidden and re-enabled after markers
                    // already exist (without an anchor, addLayer appends on top).
                    const baseAnchor = ['stop-markers-layer', 'stop-markers-labels',
                        'bus-markers-glow', 'bus-markers-layer', 'bus-markers-labels',
                        'stop-markers-selected', 'stop-markers-selected-labels'].find(function(id) {
                        return map.getLayer(id);
                    });
                    if (!map.getLayer(fillLayerId)) {
                        const colors = getPaintColors();
                        const minZoom = options.minzoom || options.minZoom || 0;
                        map.addLayer({
                            id: fillLayerId,
                            type: 'fill',
                            source: sourceId,
                            minzoom: minZoom,
                            paint: {
                                'fill-color': [
                                    'match',
                                    ['get', 'category'],
                                    'parking', colors.parking.fillColor,
                                    'building', colors.building.fillColor,
                                    colors.fallback.fillColor
                                ],
                                'fill-opacity': [
                                    'match',
                                    ['get', 'category'],
                                    'parking', colors.parking.fillOpacity,
                                    'building', colors.building.fillOpacity,
                                    colors.fallback.fillOpacity
                                ]
                            }
                        }, baseAnchor);
                        map.addLayer({
                            id: lineLayerId,
                            type: 'line',
                            source: sourceId,
                            minzoom: minZoom,
                            paint: {
                                'line-color': [
                                    'match',
                                    ['get', 'category'],
                                    'parking', colors.parking.color,
                                    'building', colors.building.color,
                                    colors.fallback.color
                                ],
                                'line-width': 1
                            }
                        }, baseAnchor);
                    }
                    // Highlight overlay: a dedicated source+layers holding only the
                    // currently-highlighted feature. Painted above the base building
                    // fill/line but below bus/stop markers (DOM parity: markers stay
                    // clickable/visible above polygons).
                    //   fill → inserted between base fill and base line (before the
                    //          base line id)
                    //   line → inserted right after the base line in the current
                    //          style, so it outlines the highlight above the fill.
                    // If no markers exist yet (buildings toggled on before any
                    // buses/stops), they land wherever the base line sits; marker
                    // layers get re-pinned above by updateStopsLayerOrder later.
                    if (!map.getSource(highlightSourceId)) {
                        map.addSource(highlightSourceId, { type: 'geojson', data: EMPTY_FEATURE_COLLECTION });
                    }
                    if (!map.getLayer(highlightFillLayerId)) {
                        map.addLayer({
                            id: highlightFillLayerId,
                            type: 'fill',
                            source: highlightSourceId,
                            minzoom: 0,
                            paint: {
                                'fill-color': 'transparent',
                                'fill-opacity': 0
                            }
                        }, lineLayerId);
                    }
                    if (!map.getLayer(highlightLineLayerId)) {
                        let afterLineId;
                        try {
                            const styleLayers = (map.getStyle && map.getStyle().layers) || [];
                            const lineIdx = styleLayers.findIndex(function(l) { return l.id === lineLayerId; });
                            if (lineIdx >= 0 && lineIdx + 1 < styleLayers.length) {
                                afterLineId = styleLayers[lineIdx + 1].id;
                            }
                        } catch (e) {}
                        map.addLayer({
                            id: highlightLineLayerId,
                            type: 'line',
                            source: highlightSourceId,
                            minzoom: 0,
                            paint: {
                                'line-color': 'transparent',
                                'line-width': 1
                            }
                        }, afterLineId);
                    }
                } catch (e) {
                    console.error('[L.geoJSON] failed to add source/layer for', fillLayerId, ':', e);
                }
            }

            function remove() {
                if (!map) return;
                try {
                    if (styleLoadBound) {
                        map.off('style.load', onStyleLoad);
                        styleLoadBound = false;
                    }
                    if (map.getLayer(fillLayerId)) map.removeLayer(fillLayerId);
                    if (map.getLayer(lineLayerId)) map.removeLayer(lineLayerId);
                    if (map.getSource(sourceId)) map.removeSource(sourceId);
                    if (map.getLayer(highlightFillLayerId)) map.removeLayer(highlightFillLayerId);
                    if (map.getLayer(highlightLineLayerId)) map.removeLayer(highlightLineLayerId);
                    if (map.getSource(highlightSourceId)) map.removeSource(highlightSourceId);
                    highlightedFeature = null;
                } catch (e) {
                    console.error('[L.geoJSON remove] failed to remove layer', { sourceId, fillLayerId, lineLayerId }, e);
                }
            }

            if (data && data.features) {
                data.features.forEach((feat, idx) => {
                    const subLayer = {
                        feature: feat,
                        _leaflet_id: geoId + '_' + idx,
                        on: function(event, handler) {
                            if (event === 'click' && map) {
                                map.on('click', fillLayerId, (e) => {
                                    if (e.features && e.features.length) {
                                        // Bus/stop markers render above polygon
                                        // fills, so a click on a marker must not
                                        // also select the building/lot below it
                                        // (DOM parity: the topmost element owns
                                        // the click). Layer-scoped click
                                        // handlers fire for every layer hit at
                                        // the point regardless of stacking, so
                                        // check for markers explicitly.
                                        const markerLayers = [
                                            'bus-markers-layer', 'bus-markers-labels',
                                            'stop-markers-layer', 'stop-markers-labels',
                                            'stop-markers-selected', 'stop-markers-selected-labels'
                                        ].filter(id => map.getLayer(id));
                                        const glMarkerHit = e.point && markerLayers.length &&
                                            map.queryRenderedFeatures(e.point, { layers: markerLayers }).length;
                                        const target = e.originalEvent && e.originalEvent.target;
                                        const domMarkerHit = target && typeof target.closest === 'function' &&
                                            !!target.closest('.maplibregl-marker');
                                        if (glMarkerHit || domMarkerHit) return;
                                        const clickedFeat = e.features[0];
                                        if (clickedFeat.properties && feat.properties && clickedFeat.properties.name === feat.properties.name) {
                                            handler({
                                                stopPropagation: () => {},
                                                latlng: e.lngLat,
                                                target: subLayer
                                            });
                                        }
                                    }
                                });
                            }
                            return subLayer;
                        },
                        setStyle: function(newStyle) {
                            const stack = (new Error().stack || '').split('\n').slice(0, 3).join(' | ');
                            if (!subLayerSetStyleWarned.has(stack)) {
                                subLayerSetStyleWarned.add(stack);
                                console.error('[L.geoJSON] subLayer.setStyle is a no-op in the MapLibre compat layer (one shared fill/line layer per source); per-feature restyling is not applied. Use setHighlight()/clearHighlight() instead. First caller: ' + stack);
                            }
                            return subLayer;
                        },
                        setHighlight: function(style) {
                            style = style || {};
                            try {
                                if (!map || !map.getSource(highlightSourceId)) return subLayer;
                                if (highlightedFeature && highlightedFeature !== feat) {
                                    map.getSource(highlightSourceId).setData(EMPTY_FEATURE_COLLECTION);
                                }
                                highlightedFeature = feat;
                                map.getSource(highlightSourceId).setData({ type: 'FeatureCollection', features: [feat] });
                                if (map.getLayer(highlightFillLayerId)) {
                                    map.setPaintProperty(highlightFillLayerId, 'fill-color', style.fillColor || style.color || 'transparent');
                                    map.setPaintProperty(highlightFillLayerId, 'fill-opacity', style.fillOpacity !== undefined ? style.fillOpacity : 1);
                                }
                                if (map.getLayer(highlightLineLayerId)) {
                                    map.setPaintProperty(highlightLineLayerId, 'line-color', style.color || style.fillColor || 'transparent');
                                    map.setPaintProperty(highlightLineLayerId, 'line-width', style.weight !== undefined ? style.weight : 1);
                                }
                            } catch (e) {
                                console.error('[L.geoJSON] setHighlight failed:', e);
                            }
                            return subLayer;
                        },
                        clearHighlight: function() {
                            try {
                                if (highlightedFeature === feat && map && map.getSource(highlightSourceId)) {
                                    map.getSource(highlightSourceId).setData(EMPTY_FEATURE_COLLECTION);
                                }
                                highlightedFeature = null;
                            } catch (e) {
                                console.error('[L.geoJSON] clearHighlight failed:', e);
                            }
                            return subLayer;
                        },
                        bindPopup: function(content, popupOptions) {
                            subLayer._popupContent = typeof content === 'string'
                                ? content
                                : (content && content.options && content.options.html)
                                    ? content.options.html
                                    : (content && content._html)
                                        ? content._html
                                        : (content ? String(content) : '');
                            subLayer._popupOptions = popupOptions || {};
                            subLayer.on('click', function(e) {
                                const latlng = e && (e.latlng || e.lngLat);
                                const lngLat = Array.isArray(latlng)
                                    ? latlng
                                    : [latlng.lng !== undefined ? latlng.lng : latlng[0], latlng.lat !== undefined ? latlng.lat : latlng[1]];
                                const opts = subLayer._popupOptions;
                                new maplibregl.Popup({
                                    offset: opts.offset !== undefined ? opts.offset : 8,
                                    closeButton: opts.closeButton !== false
                                })
                                    .setLngLat(lngLat)
                                    .setHTML(subLayer._popupContent)
                                    .addTo(map);
                            });
                            return subLayer;
                        }
                    };
                    if (options.onEachFeature) {
                        options.onEachFeature(feat, subLayer);
                    }
                    layersList.push(subLayer);
                });
            }

            const wrapper = {
                addTo: function(targetMap) {
                    if (!map) return wrapper;
                    if (!styleLoadBound) {
                        styleLoadBound = true;
                        map.on('style.load', onStyleLoad);
                        // Fail-fast: if the style never parses (bad URL /
                        // network / style error), the layer would otherwise never
                        // be created and nothing would ever report it.
                        setTimeout(function() {
                            if (!map.getLayer(fillLayerId) && !(map.style && map.style._loaded)) {
                                console.warn('[L.geoJSON] add() for "' + fillLayerId + '" is still waiting for the style to load 15s later; the style may have failed to load. Layer was never added.');
                            }
                        }, 15000);
                    }
                    add();
                    return wrapper;
                },
                remove: function() { remove(); return wrapper; },
                removeFrom: function() { remove(); return wrapper; },
                clearLayers: function() { remove(); return wrapper; },
                getLayers: function() { return layersList; },
                eachLayer: function(fn) { layersList.forEach(fn); return wrapper; },
                setStyle: function(newStyle) {
                    if (!map || !map.getLayer(fillLayerId)) {
                        console.error('[L.geoJSON] setStyle called but layer "' + fillLayerId + '" is not on the map (was add() deferred on style load, or was it removed?); style NOT applied.', new Error().stack);
                        return wrapper;
                    }
                    const colors = getPaintColors();
                    map.setPaintProperty(fillLayerId, 'fill-color', [
                        'match',
                        ['get', 'category'],
                        'parking', colors.parking.fillColor,
                        'building', colors.building.fillColor,
                        colors.fallback.fillColor
                    ]);
                    map.setPaintProperty(fillLayerId, 'fill-opacity', [
                        'match',
                        ['get', 'category'],
                        'parking', colors.parking.fillOpacity,
                        'building', colors.building.fillOpacity,
                        colors.fallback.fillOpacity
                    ]);
                    map.setPaintProperty(lineLayerId, 'line-color', [
                        'match',
                        ['get', 'category'],
                        'parking', colors.parking.color,
                        'building', colors.building.color,
                        colors.fallback.color
                    ]);
                    return wrapper;
                }
            };

            return wrapper;
        };
}

// ---------------------------------------------------------------------------
// Raster sharpness fix. See the long header inside installMapLibreRasterSharpnessFix
// for the full root-cause analysis, prior failed approaches, and the current
// solution (Catmull-Rom bicubic via gl.shaderSource hook).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Raster sharpness fix: Catmull-Rom bicubic raster shader via gl.shaderSource
// hook (MapLibre GL JS 4.7.1 CDN, client-side only)
//
// Proven-out prior attempts (kept here as a record so we don't revisit):
//   - texParameteri to force MIN=LINEAR: visual no-op. At ρ=1.48 (z=14),
//     LINEAR_MIPMAP_NEAREST picks mip 0 and bilinear-samples it; same image.
//   - raster-resampling:'nearest': no-op. That property only flips MAG,
//     irrelevant during minification.
//   - texImage2D pre-downscale (Option C, 2D-canvas Lanczos 512→347): no-op
//     vs baseline. Empirically confirmed via setTarget(128)/347 A/B that the
//     hook engages, yet 347 ≈ baseline. Conclusion: at a 1.48× downscale,
//     Canvas-Lanczos and WebGL-bilinear converge perceptually. The filter
//     TAPS are not the bottleneck — no neutral resample choice sharpens.
//
// The one lever left that genuinely alters perceived sharpness is a
// negative-lobe kernel (Catmull-Rom / Lanczos2/3). Such kernels produce
// edge overshoot — a high-pass PSF — that no neutral bilinear/Lanczos
// resampler can produce. It ACTIVELY sharpens rather than just resampling
// more cleanly. This is the standard "make texture look crisper" trick
// (GPU vendors call it "bicubic sharp").
//
// Implementation: hook gl.shaderSource. When MapLibre compiles a fragment
// shader whose source contains the raster-signature uniforms (u_image0 +
// u_image1 + u_fade_t + u_brightness_low), substitute a bicubic variant
// that preserves every input/output contract of the original shader:
//   - same varyings: v_pos0, v_pos1
//   - same uniforms (so the existing program.bind still finds every location)
//   - same fragColor output convention
//   - same crossfade of u_image0/u_image1 by u_fade_t
//   - same brightness/saturation/contrast/spin post-process
//   - ONLY the sampling kernel on u_image0 changes: 1 tap -> 16 tap Catmull-Rom
//
// Replacing at shaderSource time (before linkProgram) means uniform location
// lookup still works after link — no relinking, no LocationCache invalidation.
// This is structurally simpler than the earlier re-link attempt (which
// fought the program-cache invalidation MapLibre does on relink).
//
// Performance on N100 (24-EU UHD iGPU): 16 texture() calls per fragment
// instead of 1. At ~1M tile-covered fragments/frame, expect ~20-25 fps pan
// (down from ~30). Acceptable for a single A/B run; revisit if too costly.
//
// A/B stats: window.__rubusRasterShaderStats(). restore() undoes the hook.
//
// Probe phase (disambiguating "shader runs but is invisible at z=14" vs
// "u_rubus_sharpen never reaches the drawing program"):
//   window.__rubusRasterProbe()       — gl.getUniform readbacks of u_rubus_*
//                                       from every live bicubic program + hook
//                                       call counters. Definitive.
//   window.__rubusRasterDebug(1|0)    — magenta-tile canary; if the base tiles
//                                       tint, the substituted shader provably
//                                       draws them.
//   window.__rubusRasterMipEstimate() — ρ/λ geometry at the current zoom and
//                                       which mip LINEAR_MIPMAP_NEAREST picks
//                                       (at integer zooms it picks mip 1, NOT
//                                       the native 512² texels — see function).
// Uniforms reach programs via BOTH a useProgram hook and a drawElements hook
// (MapLibre's Context caches the current program; belt + suspenders), and
// setSharpen/setDebug push to all live programs immediately with readback.
//
// Mip mechanism (CONFIRMED 2026-07 by GPU readback probes + geometry math):
// the shader/uniform path provably works (u_rubus_sharpen readback = desired
// on every activation), yet z=14 stayed soft — because at integer zooms
// ρ≈1.48 → λ≈0.56 → LINEAR_MIPMAP_NEAREST selects mip 1, a 2×2-box-
// prefiltered 256² version of the tile. The prefilter destroys the highest
// frequencies BEFORE the shader runs, and the 512-calibrated kernel taps
// land at half-texel offsets on that mip, partially cancelling the negative
// lobes. Prior dead-end #1 (MIN=LINEAR) tested mip 0 with BILINEAR only;
// mip 0 + Catmull-Rom was never tried as a combination. That is what
// u_rubus_lodbias now does: texture2D(..., −2.0) forces mip 0 at every zoom
// in this deployment, so the kernel samples native 512² texels with correct
// offsets. Console (window-level; the raw GL context is NOT a global):
//   __rubusRasterSharpen(s) / __rubusRasterLodBias(b) / __rubusRasterDebug(0|1)
//   __rubusRasterFix.<full API>  — or map.painter.context.gl.__rubusRasterSharpnessFix
// Trade-off vs Leaflet's Lanczos: no
// prefiltering ⇒ mild alias/shimmer during pans is expected; if that proves
// objectionable, the queued next step is a ρ-scaled decimation kernel.
// ---------------------------------------------------------------------------

function installMapLibreRasterSharpnessFix(mapInstance) {
    const gl = mapInstance.painter && mapInstance.painter.context && mapInstance.painter.context.gl;
    if (!gl || gl.__rubusRasterSharpnessFix) return;

    // Signature that uniquely identifies MapLibre's raster.fragment.glsl,
    // post-preprocessing, in the source string handed to gl.shaderSource.
    // None of MapLibre's other shaders combine u_image0 + u_image1 +
    // u_fade_t with u_brightness_low — they are raster-only uniforms.
    function isRasterFrag(src) {
        if (typeof src !== 'string') return false;
        // Avoid matching the parent/crossfade-only variants in unrelated
        // shaders; the conjunction is highly specific. All four are present
        // in raster.fragment.glsl (verified at maplibre-gl@4.7.1).
        return src.indexOf('u_image0') !== -1
            && src.indexOf('u_image1') !== -1
            && src.indexOf('u_fade_t') !== -1
            && src.indexOf('u_brightness_low') !== -1;
    }

    // Catmull-Rom bicubic, GLSL ES 1.00 (so it links against MapLibre's ES 1.00
// raster vertex shader — verified by the "Fragment shader version does not
// match" link failure on the ES 3.00 attempt). textureSize() is ES 3.00-only,
// so the source-tile size is passed as a uniform u_rubus_tile_size set from
// JS before each draw, defaulting to 512×512 (the only source size shipped
// by this deployment). 16 taps with negative-lobe weights — produces edge
// overshoot = perceptual crispness.
const BICUBIC_RASTER_FRAG = [
    'precision highp float;',
    '',
    'uniform sampler2D u_image0;',
    'uniform sampler2D u_image1;',
    'uniform float u_fade_t;',
    'uniform float u_opacity;',
    'uniform float u_brightness_low;',
    'uniform float u_brightness_high;',
    'uniform float u_saturation_factor;',
    'uniform float u_contrast_factor;',
    'uniform vec3 u_spin_weights;',
    '// Set from JS before each draw.',
    'uniform vec2 u_rubus_tile_size;',
    '// Sharpening multiplier: 1.0 = neutral Catmull-Rom resample (subtle edge',
    '// overshoot). 2.0..4.0 = unsharp-mask style amplification of the high',
    '// frequencies bicubic recovers beyond bilinear. 0.0 = bilinear baseline.',
    'uniform float u_rubus_sharpen;',
    '// [rubus] debug canary: >0.5 tints tiles magenta — proves this shader is',
    '// the one actually drawing the base tiles (window.__rubusRasterDebug).',
    'uniform float u_rubus_debug;',
    '// [rubus] LOD bias: pulls the mip selector to mip 0 (native 512² texels).',
    '// At integer zooms λ≈0.56 → LINEAR_MIPMAP_NEAREST would otherwise pick',
    '// mip 1 (2×2-box-prefiltered 256²) = the z=14 softness. −2.0 ⇒ mip 0 for',
    '// every λ<1.5, covering the whole zoom geometry of this deployment.',
    'uniform float u_rubus_lodbias;',
    '// [rubus] kernel mode: 0 = bicubic sharpen (mix vs bilinear), 1 = rho-scaled',
    '// decimation (area-weighted, alias-free). Set from JS per program switch.',
    'uniform float u_rubus_mode;',
    '// [rubus] source texels per device pixel (~1.48 at z=14) — drives the',
    '// decimation kernel footprint. Recomputed from the transform per draw.',
    'uniform float u_rubus_rho;',
    '',
    'varying vec2 v_pos0;',
    'varying vec2 v_pos1;',
    '',
    '// Catmull-Rom (B = 0, C = 0.5) cubic kernel with negative lobes.',
    '// Produces edge overshoot -> perceptual sharpness; the whole point.',
    'float catmullRom(float x) {',
    '    float ax = abs(x);',
    '    if (ax < 1.0) return (1.5 * ax - 2.5) * ax * ax + 1.0;',
    '    if (ax < 2.0) return ((-0.5 * ax + 2.5) * ax - 4.0) * ax + 2.0;',
    '    return 0.0;',
    '}',
    '',
    '// 16-tap Catmull-Rom sample. u_rubus_lodbias pulls the mip selector to',
    '// mip 0 so taps land on native 512² texels (not a box-prefiltered mip),',
    '// which also makes the 1/512 tap offsets correct again.',
    'vec4 sampleBicubic(sampler2D tex, vec2 uv) {',
    '    vec2 texSize = u_rubus_tile_size;',
    '    vec2 texelSize = 1.0 / texSize;',
    '    vec2 st = uv * texSize - 0.5;',
    '    vec2 f = fract(st);',
    '    vec2 t = (floor(st) + 0.5) * texelSize;',
    '    vec4 xw = vec4(catmullRom(f.x + 1.0), catmullRom(f.x),',
    '                   catmullRom(1.0 - f.x), catmullRom(2.0 - f.x));',
    '    vec4 yw = vec4(catmullRom(f.y + 1.0), catmullRom(f.y),',
    '                   catmullRom(1.0 - f.y), catmullRom(2.0 - f.y));',
    '    vec4 result = vec4(0.0);',
    '    for (int j = 0; j < 4; j++) {',
    '        for (int i = 0; i < 4; i++) {',
    '            vec2 offset = vec2(float(i - 1), float(j - 1)) * texelSize;',
    '            result += texture2D(tex, t + offset, u_rubus_lodbias) * xw[i] * yw[j];',
    '        }',
    '    }',
    '    return result;',
    '}',
    '',
    '// rho-scaled decimating Catmull-Rom (kernel mode 1): the kernel footprint',
    '// is widened by rho (source texels per device px) so each output pixel',
    '// area-averages its source footprint — Lanczos-like decimation with NO',
    '// mip-box prefiltering and NO point-sample aliasing. 6x6 = 36 taps;',
    '// heavier than the 16-tap bicubic — this is the quality-first option.',
    'vec4 sampleDecimateCR(sampler2D tex, vec2 uv) {',
    '    vec2 texSize = u_rubus_tile_size;',
    '    vec2 texelSize = 1.0 / texSize;',
    '    vec2 st = uv * texSize - 0.5;',
    '    vec2 base = floor(st);',
    '    vec2 f = st - base;',
    '    float rho = max(u_rubus_rho, 1.0);',
    '    float wx[6];',
    '    float wy[6];',
    '    float sx = 0.0;',
    '    float sy = 0.0;',
    '    for (int k = 0; k < 6; k++) {',
    '        float dk = float(k - 2);',
    '        wx[k] = catmullRom((dk - f.x) / rho);',
    '        wy[k] = catmullRom((dk - f.y) / rho);',
    '        sx += wx[k];',
    '        sy += wy[k];',
    '    }',
    '    vec2 t = (base + 0.5) * texelSize;',
    '    vec4 result = vec4(0.0);',
    '    for (int j = 0; j < 6; j++) {',
    '        for (int i = 0; i < 6; i++) {',
    '            vec2 offset = vec2(float(i - 2), float(j - 2)) * texelSize;',
    '            result += texture2D(tex, t + offset, u_rubus_lodbias) * wx[i] * wy[j];',
    '        }',
    '    }',
    '    return result / (sx * sy);',
    '}',
    '',
    'void main() {',
    '    vec4 color0;',
    '    if (u_rubus_mode > 0.5) {',
    '        // rho-scaled decimation: alias-free, faithful (Leaflet-like).',
    '        color0 = sampleDecimateCR(u_image0, v_pos0);',
    '    } else {',
    '        // Bicubic sharpen: u_rubus_sharpen 1.0 = neutral Catmull-Rom',
    '        // resample; >1.0 = unsharp-mask amplification of the (bicubic -',
    '        // bilinear) high-frequency residual; 0.0 = bilinear baseline.',
    '        vec4 bicubic = sampleBicubic(u_image0, v_pos0);',
    '        vec4 bilinear = texture2D(u_image0, v_pos0, u_rubus_lodbias);',
    '        color0 = mix(bilinear, bicubic, u_rubus_sharpen);',
    '    }',
    '    vec4 color1 = texture2D(u_image1, v_pos1);',
    '    if (color0.a > 0.0) color0.rgb = color0.rgb / color0.a;',
    '    if (color1.a > 0.0) color1.rgb = color1.rgb / color1.a;',
    '    vec4 color = mix(color0, color1, u_fade_t);',
    '    color.a *= u_opacity;',
    '    vec3 rgb = color.rgb;',
    '',
    '    // spin (hue-rotate) -- identical to MapLibre stock',
    '    rgb = vec3(',
    '        dot(rgb, u_spin_weights.xyz),',
    '        dot(rgb, u_spin_weights.zxy),',
    '        dot(rgb, u_spin_weights.yzx));',
    '',
    '    // saturation',
    '    float average = (color.r + color.g + color.b) / 3.0;',
    '    rgb += (average - rgb) * u_saturation_factor;',
    '',
    '    // contrast',
    '    rgb = (rgb - 0.5) * u_contrast_factor + 0.5;',
    '',
    '    // brightness',
    '    vec3 u_high_vec = vec3(u_brightness_low, u_brightness_low, u_brightness_low);',
    '    vec3 u_low_vec = vec3(u_brightness_high, u_brightness_high, u_brightness_high);',
    '',
    '    vec4 rubusOut = vec4(mix(u_high_vec, u_low_vec, rgb) * color.a, color.a);',
    '    // [rubus] debug canary (see u_rubus_debug above). gl_FragColor is',
    '    // write-only per spec, so composite into a local first.',
    '    if (u_rubus_debug > 0.5) {',
    '        rubusOut.rgb = mix(rubusOut.rgb, vec3(1.0, 0.0, 1.0) * color.a, 0.5);',
    '    }',
    '    gl_FragColor = rubusOut;',
    '}'
].join('\n');

    let replaced = 0, inspected = 0, compileFailed = 0;
    window.__rubusRasterShaderStats = function() {
        return {
            shadersReplaced: replaced,
            shadersInspected: inspected,
            compileFailures: compileFailed
        };
    };

    const originalShaderSource = gl.shaderSource.bind(gl);
    const originalCompileShader = gl.compileShader.bind(gl);

    // Standalone compile validation: compile the bicubic source as a throwaway
    // fragment shader. If it fails, return the info log so the caller can fall
    // back to the original source AND we can see the actual GLSL error instead
    // of staring at a blank white map.
    function validateFragment(src) {
        const probe = gl.createShader(gl.FRAGMENT_SHADER);
        try {
            originalShaderSource(probe, src);
            originalCompileShader(probe);
            if (gl.getShaderParameter(probe, gl.COMPILE_STATUS)) {
                gl.deleteShader(probe);
                return { ok: true, log: null };
            }
            const log = gl.getShaderInfoLog(probe) || '(no info log)';
            gl.deleteShader(probe);
            return { ok: false, log: log };
        } catch (e) {
            try { gl.deleteShader(probe); } catch (_) {}
            return { ok: false, log: 'exception: ' + e };
        }
    }

    let bicubicValidated = false, bicubicValid = false, bicubicError = null;
    function ensureValidated() {
        if (bicubicValidated) return bicubicValid;
        bicubicValidated = true;
        const r = validateFragment(BICUBIC_RASTER_FRAG);
        bicubicValid = r.ok;
        bicubicError = r.log;
        if (!bicubicValid) {
            console.error('[rubus] bicubic raster shader failed to compile.\nInfo log:\n' + r.log);
        } else {
            console.log('[rubus] bicubic raster shader validated OK — substitution active');
        }
        return bicubicValid;
    }

    // Track which programs/shaders contain our bicubic substitution so we can
    // correlate link failures and inject the u_rubus_tile_size / u_rubus_sharpen
    // uniforms.
    const bicubicPrograms = new WeakMap();      // program -> original frag source (diag)
    const bicubicUniformLocs = new WeakMap();   // program -> {tile, sharpen, debug} locations
    const bicubicShaderOrigins = new WeakMap(); // shader  -> original frag source (diag)
    const bicubicProgramSet = new Set();        // live bicubic-linked programs (probe + immediate apply)
    let linkFailures = 0;
    let firstLinkFailureLogged = false;
    // Probe counters (see window.__rubusRasterProbe below).
    let useProgramHookCalls = 0, useProgramBicubicCalls = 0;
    let drawElementsHookCalls = 0, drawElementsBicubicSets = 0;
    let debugCanary = 0;                        // 1 = tint base tiles magenta
    let firstApplyLogs = 0;                     // cap one-time activation logs
    // Sharpening strength. 1.0 = neutral Catmull-Rom (weights sum to 1, only
    // subtle edge overshoot). >1.0 = unsharp-mask style amplification of the
    // high frequencies bicubic recovers beyond bilinear. The shader mixes:
    //   color = mix(bilinear, bicubic, u_rubus_sharpen)
    // so 2.0 doubles the (bicubic - bilinear) high-frequency residual.
    let sharpenStrength = 1.5;
    // LOD bias fed to texture2D(..., bias) in the shader. −2.0 forces mip 0
    // (native 512² texels) across the whole zoom geometry here (λ ≤ ~1.06).
    // 0 restores the stock mip-chain behavior (mip 1 at integer zooms).
    // NOTE: the parent-tile sampler u_image1 is deliberately left unbiased —
    // raster-fade-duration is 0 in this deployment so u_fade_t is always 0.
    let lodBias = -2.0;
    // Kernel mode: 0 = bicubic sharpen (default, fast), 1 = ρ-scaled
    // decimation (alias-free, quality-first, ~2.25× the texture samples).
    let kernelMode = 0;
    // ρ (source texels per device px) feeds the decimation kernel footprint.
    // Recomputed only when zoom or pixelRatio changes (cheap per-draw read).
    let rhoCache = { z: -1, pr: -1, rho: 1.5 };
    function computeRho() {
        try {
            const t = mapInstance.painter.transform;
            const z = t.zoom;
            const pr = (mapInstance.getPixelRatio && mapInstance.getPixelRatio()) || window.devicePixelRatio || 1;
            if (z === rhoCache.z && pr === rhoCache.pr) return rhoCache.rho;
            let cz;
            if (typeof t.coveringZoomLevel === 'function') {
                cz = t.coveringZoomLevel({ tileSize: 256, roundZoom: true });
            } else {
                cz = Math.round(z) + 1;
            }
            const devPerTile = 512 * Math.pow(2, z - cz) * pr;
            let rho = devPerTile > 0 ? 512 / devPerTile : 1.5;
            // Clamp: <1 = magnification (kernel becomes plain CR interp),
            // >4 = heavy overzoom (kernel support would need >6 taps).
            rho = Math.max(1.0, Math.min(4.0, rho));
            rhoCache = { z: z, pr: pr, rho: rho };
            return rho;
        } catch (e) { return 1.5; }
    }

    // Toggle: when true, the hook substitutes the bicubic shader; when false,
    // it passes the stock source through unmodified. Toggling requires forcing
    // MapLibre to recompile the raster program — changeTogglingState() does
    // that by clearing the program cache + style state.
    let substituteEnabled = true;
    window.__rubusRasterSharpnessEnabled = function() { return substituteEnabled; };

    function forceRecompile() {
        // MapLibre v4.7.1 caches Program objects on painter.cache (a plain
        // object keyed 'raster' [+ '/overdraw' | '/terrain' variants]) — see
        // painter.ts useProgram(): `this.cache[key] || (this.cache[key] = new
        // Program(...))`. It is NOT painter._programCache / context._programs,
        // which earlier versions of this function cleared and which DO NOT
        // EXIST in v4.7.1 — that made every toggle a silent no-op (the old
        // program kept drawing). Do it for real: gl.deleteProgram frees the
        // GL program (and keeps the probe registry truthful via the
        // deleteProgram hook); removing the key forces the next
        // useProgram('raster') to recompile with whatever source the
        // shaderSource hook now emits.
        try {
            const painter = mapInstance.painter;
            const cache = painter && painter.cache;
            if (cache) {
                const dropEntry = (entry) => {
                    try {
                        const glProg = entry && entry.program;
                        if (glProg) gl.deleteProgram(glProg);
                    } catch (e) {}
                };
                if (cache instanceof Map) {
                    cache.forEach((entry, key) => {
                        if (String(key).indexOf('raster') === 0) { dropEntry(entry); cache.delete(key); }
                    });
                } else {
                    Object.keys(cache).forEach((key) => {
                        if (key.indexOf('raster') === 0) { dropEntry(cache[key]); delete cache[key]; }
                    });
                }
            }
            // Defensive: legacy cache locations used by other MapLibre versions.
            if (painter && painter._programCache && typeof painter._programCache.clear === 'function') {
                painter._programCache.clear();
            }
            const ctx = painter && painter.context;
            if (ctx && ctx._programs && typeof ctx._programs.clear === 'function') {
                ctx._programs.clear();
            }
        } catch (e) { /* best-effort */ }
        try { mapInstance._render(); } catch (e) {}
        try { mapInstance.style && (mapInstance.style._layers = mapInstance.style._layers); } catch (e) {}
    }

    window.__rubusRasterSharpnessToggle = function(enabled) {
        if (enabled === undefined) enabled = !substituteEnabled;
        substituteEnabled = !!enabled;
        forceRecompile();
        // Temporarily disabled: console.log('[rubus] bicubic sharpness', substituteEnabled ? 'ON' : 'OFF',
        //     '— forcing recompile. Tiles will re-render next frame.');
        return substituteEnabled;
    };

    gl.shaderSource = function(shader, source) {
        inspected++;
        if (substituteEnabled
            && gl.getShaderParameter(shader, gl.SHADER_TYPE) === gl.FRAGMENT_SHADER
            && isRasterFrag(source)) {
            if (ensureValidated()) {
                replaced++;
                window.__rubusLastRasterFragSource = BICUBIC_RASTER_FRAG;
                bicubicShaderOrigins.set(shader, source);
                return originalShaderSource(shader, BICUBIC_RASTER_FRAG);
            } else {
                compileFailed++;
                return originalShaderSource(shader, source);
            }
        }
        if (gl.getShaderParameter(shader, gl.SHADER_TYPE) === gl.VERTEX_SHADER
            && typeof source === 'string'
            && source.indexOf('u_buffer_scale') !== -1
            && source.indexOf('v_pos0') !== -1) {
            window.__rubusOrigRasterVertSource = source;
        }
        return originalShaderSource(shader, source);
    };

    const originalLinkProgram = gl.linkProgram.bind(gl);
    gl.linkProgram = function(program) {
        originalLinkProgram(program);
        const attached = gl.getAttachedShaders(program);
        let hasBicubic = false, originalFragSrc = null;
        for (let i = 0; i < attached.length; i++) {
            if (bicubicShaderOrigins.has(attached[i])) {
                hasBicubic = true;
                originalFragSrc = bicubicShaderOrigins.get(attached[i]);
                break;
            }
        }
        if (!hasBicubic) return;
        bicubicPrograms.set(program, originalFragSrc);
        if (gl.getProgramParameter(program, gl.LINK_STATUS)) {
            // Cache the uniform location once after successful link so the
            // useProgram hook can set it cheaply without per-frame lookups.
            const loc = gl.getUniformLocation(program, 'u_rubus_tile_size');
            const sharpLoc = gl.getUniformLocation(program, 'u_rubus_sharpen');
            const debugLoc = gl.getUniformLocation(program, 'u_rubus_debug');
            const biasLoc = gl.getUniformLocation(program, 'u_rubus_lodbias');
            const modeLoc = gl.getUniformLocation(program, 'u_rubus_mode');
            const rhoLoc = gl.getUniformLocation(program, 'u_rubus_rho');
            bicubicUniformLocs.set(program, { tile: loc, sharpen: sharpLoc, debug: debugLoc, bias: biasLoc, mode: modeLoc, rho: rhoLoc });
            bicubicProgramSet.add(program);
        } else {
            linkFailures++;
            if (!firstLinkFailureLogged) {
                firstLinkFailureLogged = true;
                const log = gl.getProgramInfoLog(program) || '(no info log)';
                console.error('[rubus] bicubic PROGRAM failed to LINK against the raster vertex shader.\n' +
                    'Link info log:\n' + log +
                    '\n\nOriginal (stock) raster fragment shader source:\n' + originalFragSrc +
                    '\n\nBicubic replacement source:\n' + BICUBIC_RASTER_FRAG +
                    '\n\nRaster vertex shader source (captured):\n' + (window.__rubusOrigRasterVertSource || '(not captured yet)'));
            }
        }
    };

    // ------------------------------------------------------------------
    // Uniform injection + liveness probe (added to disambiguate "shader
    // running but invisible at z=14" vs "uniform never reaches the program").
    //
    // Why TWO injection paths:
    //   1) gl.useProgram hook — fires whenever MapLibre's Context actually
    //      switches programs. MapLibre v4.7.1 caches the current program
    //      (ProgramValue.set skips redundant gl.useProgram calls), BUT
    //      Map._render() calls context.setDirty() every frame, so in practice
    //      this hook fires at least once per frame per active program.
    //   2) gl.drawElements hook — belt-and-suspenders: right before any
    //      indexed draw, if the CURRENT program is a bicubic-linked one,
    //      (re)apply our uniforms. This defeats ANY caching layer that could
    //      skip path 1, at the cost of one getParameter(CURRENT_PROGRAM) per
    //      draw call (client-side context state — cheap even on the N100).
    //
    // Probe: window.__rubusRasterProbe() reads the uniform values back out of
    // the GPU program objects with gl.getUniform — the definitive check that
    // the values MapLibre draws with are the values we think we set.
    // Canary: window.__rubusRasterDebug(1) tints every base tile magenta via
    // a uniform in the substituted shader; if the map visibly tints, the
    // substituted shader is 100% the one drawing the tiles.
    // ------------------------------------------------------------------
    function applyRubusUniforms(program, locs) {
        // 512×512 = the only source size shipped by this deployment. If a
        // future non-512 source is added, compute the size from the bound
        // texture here instead.
        if (locs.tile) gl.uniform2f(locs.tile, 512.0, 512.0);
        // Sharpening strength: drives the unsharp-mask mix in the shader.
        if (locs.sharpen) gl.uniform1f(locs.sharpen, sharpenStrength);
        if (locs.debug) gl.uniform1f(locs.debug, debugCanary);
        // LOD bias: forces mip-0 sampling in the shader (see u_rubus_lodbias).
        if (locs.bias) gl.uniform1f(locs.bias, lodBias);
        // Kernel mode (0 = bicubic sharpen, 1 = ρ-scaled decimation) and the
        // live ρ driving the decimation kernel footprint.
        if (locs.mode) gl.uniform1f(locs.mode, kernelMode);
        if (locs.rho) gl.uniform1f(locs.rho, computeRho());
    }

    const originalUseProgram = gl.useProgram.bind(gl);
    gl.useProgram = function(program) {
        originalUseProgram(program);
        useProgramHookCalls++;
        if (program && bicubicUniformLocs.has(program)) {
            useProgramBicubicCalls++;
            const locs = bicubicUniformLocs.get(program);
            applyRubusUniforms(program, locs);
            if (firstApplyLogs < 3) {
                firstApplyLogs++;
                const rb = locs.sharpen ? gl.getUniform(program, locs.sharpen) : '(no loc)';
                const tb = locs.tile ? gl.getUniform(program, locs.tile) : '(no loc)';
                console.log('[rubus] bicubic raster program activated (useProgram bicubic call #' +
                    useProgramBicubicCalls + ') — u_rubus_sharpen readback =', rb,
                    '(desired', sharpenStrength + '), u_rubus_tile_size readback =', tb);
            }
        }
    };

    // Keep the probe's program registry truthful across recompiles/theme swaps.
    const originalDeleteProgram = gl.deleteProgram.bind(gl);
    gl.deleteProgram = function(program) {
        if (program) bicubicProgramSet.delete(program);
        originalDeleteProgram(program);
    };

    const originalDrawElements = gl.drawElements.bind(gl);
    gl.drawElements = function(mode, count, type, offset) {
        drawElementsHookCalls++;
        const cur = gl.getParameter(gl.CURRENT_PROGRAM);
        if (cur && bicubicUniformLocs.has(cur)) {
            drawElementsBicubicSets++;
            applyRubusUniforms(cur, bicubicUniformLocs.get(cur));
        }
        originalDrawElements(mode, count, type, offset);
    };

    // Push the current uniform values into every live bicubic program NOW, so
    // setSharpen/setDebug take effect immediately rather than "whenever the
    // next program switch happens". Restores the previously current program
    // afterwards so MapLibre's cached-program bookkeeping stays coherent.
    function applyRubusUniformsToAllPrograms() {
        const prev = gl.getParameter(gl.CURRENT_PROGRAM);
        bicubicProgramSet.forEach(function(p) {
            if (!gl.isProgram(p)) { bicubicProgramSet.delete(p); return; }
            const locs = bicubicUniformLocs.get(p);
            if (!locs) return;
            originalUseProgram(p);
            applyRubusUniforms(p, locs);
        });
        originalUseProgram(prev || null);
    }

    // Read back a u_rubus_* uniform from every live bicubic program — returns
    // an array of the values the GPU actually holds. locKey is one of
    // 'sharpen' | 'bias' | 'debug' | 'tile'.
    function readbackValues(locKey) {
        const readbacks = [];
        bicubicProgramSet.forEach(function(p) {
            const locs = bicubicUniformLocs.get(p);
            if (locs && locs[locKey] && gl.isProgram(p)) {
                try { readbacks.push(gl.getUniform(p, locs[locKey])); } catch (e) { readbacks.push('err'); }
            }
        });
        return readbacks;
    }

    window.__rubusRasterShaderStats = function() {
        return {
            shadersReplaced: replaced,
            shadersInspected: inspected,
            compileFailures: compileFailed,
            linkFailures: linkFailures,
            bicubicValid: bicubicValid,
            useProgramHookCalls: useProgramHookCalls,
            useProgramBicubicCalls: useProgramBicubicCalls,
            drawElementsHookCalls: drawElementsHookCalls,
            drawElementsBicubicSets: drawElementsBicubicSets,
            liveBicubicPrograms: bicubicProgramSet.size
        };
    };

    gl.__rubusRasterSharpnessFix = {
        restore: function() {
            gl.shaderSource = originalShaderSource;
            gl.linkProgram = originalLinkProgram;
            gl.useProgram = originalUseProgram;
            gl.deleteProgram = originalDeleteProgram;
            gl.drawElements = originalDrawElements;
            delete gl.__rubusRasterSharpnessFix;
            delete window.__rubusRasterShaderStats;
            delete window.__rubusRasterProbe;
            delete window.__rubusRasterDebug;
            delete window.__rubusRasterLodBias;
            delete window.__rubusRasterSharpen;
            delete window.__rubusRasterFix;
            delete window.__rubusRasterMode;
            delete window.__rubusRasterMipEstimate;
            delete window.__rubusLastRasterFragSource;
            delete window.__rubusOrigRasterVertSource;
        },
        getLastValidationError: function() { return bicubicError; },
        revalidate: function() {
            bicubicValidated = false;
            return ensureValidated();
        },
        // Sharpening strength setter. Values below 1.0 dampen the high-pass
        // residual; 1.0 = neutral Catmull-Rom; 1.5..3.0 = progressively
        // stronger unsharp-mask style amplification. Applies immediately to
        // every live bicubic program and logs a gl.getUniform readback — if
        // the readback doesn't match, something else owns the uniform.
        setSharpen: function(s) {
            sharpenStrength = Math.max(0.0, Number(s) || 0);
            applyRubusUniformsToAllPrograms();
            const readbacks = readbackValues('sharpen');
            console.log('[rubus] sharpenStrength =', sharpenStrength,
                '| GPU readback on', readbacks.length, 'bicubic program(s):',
                readbacks.length ? readbacks.join(', ') : '(none — no live bicubic program! substitution lost?)');
            try { mapInstance._render(); } catch (e) {}
            return sharpenStrength;
        },
        getSharpen: function() { return sharpenStrength; },
        // LOD bias fed to texture2D(..., bias) in the shader. −2.0 forces
        // mip 0 (native 512² texels) — the z=14 softness fix candidate:
        // without the box-prefiltered mip, the Catmull-Rom kernel samples
        // native texels with correct offsets. 0 restores stock mip-chain
        // sampling. Applies immediately and logs a gl.getUniform readback.
        setLodBias: function(b) {
            lodBias = Math.max(-8.0, Math.min(8.0, Number(b) || 0));
            applyRubusUniformsToAllPrograms();
            const readbacks = readbackValues('bias');
            console.log('[rubus] lodBias =', lodBias,
                '| GPU readback on', readbacks.length, 'bicubic program(s):',
                readbacks.length ? readbacks.join(', ') : '(none — no live bicubic program! substitution lost?)');
            try { mapInstance._render(); } catch (e) {}
            return lodBias;
        },
        getLodBias: function() { return lodBias; },
        // Sharpness mode for the 3-option dev setting:
        //   'off'      — stock MapLibre raster rendering (substitution off)
        //   'bicubic'  — 16-tap Catmull-Rom sharpen on mip 0 (fast; default)
        //   'decimate' — 36-tap ρ-scaled decimation (alias-free; quality-first,
        //                costs ~2.25× the texture samples of bicubic)
        setMode: function(mode) {
            if (mode !== 'off' && mode !== 'bicubic' && mode !== 'decimate') mode = 'bicubic';
            kernelMode = (mode === 'decimate') ? 1 : 0;
            const wantEnabled = mode !== 'off';
            if (substituteEnabled !== wantEnabled) {
                window.__rubusRasterSharpnessToggle(wantEnabled);
            }
            applyRubusUniformsToAllPrograms();
            const modeReadbacks = readbackValues('mode');
            // Temporarily disabled: console.log('[rubus] raster sharpness mode =', mode, '(kernelMode =', kernelMode + ')',
            //     '| substitution', substituteEnabled ? 'ON' : 'OFF',
            //     '| GPU mode readback:', modeReadbacks.length ? modeReadbacks.join(', ') : '(none — stock shader active)');
            try { mapInstance._render(); } catch (e) {}
            return mode;
        },
        getMode: function() { return kernelMode === 1 ? 'decimate' : (substituteEnabled ? 'bicubic' : 'off'); },
        // Debug canary: 1 tints base tiles magenta via the substituted shader,
        // 0 restores. If the tint shows, the substituted shader provably draws
        // the tiles; if not, the draw path is using some other program.
        setDebug: function(on) {
            debugCanary = on ? 1 : 0;
            applyRubusUniformsToAllPrograms();
            console.log('[rubus] debug canary', debugCanary ? 'ON — base tiles should render MAGENTA-tinted now' : 'OFF');
            try { mapInstance._render(); } catch (e) {}
            return debugCanary;
        },
        getDebug: function() { return debugCanary; },
        // Recompile-style toggle of the substitution itself.
        setEnabled: window.__rubusRasterSharpnessToggle
    };

    // Console shortcut for the debug canary.
    window.__rubusRasterDebug = function(on) {
        return gl.__rubusRasterSharpnessFix.setDebug(on);
    };

    // Console shortcut for the LOD bias (mip-0 forcing).
    window.__rubusRasterLodBias = function(b) {
        return gl.__rubusRasterSharpnessFix.setLodBias(b);
    };

    // Console shortcut for sharpening strength.
    window.__rubusRasterSharpen = function(s) {
        return gl.__rubusRasterSharpnessFix.setSharpen(s);
    };

    // Object alias so the console can reach the full API without touching
    // the GL context handle: __rubusRasterFix.setSharpen(...), .setDebug(...),
    // .setLodBias(...), .getSharpen(), .setEnabled(...), .restore().
    window.__rubusRasterFix = gl.__rubusRasterSharpnessFix;

    // Console shortcut for the 3-option sharpness mode.
    window.__rubusRasterMode = function(m) {
        return gl.__rubusRasterSharpnessFix.setMode(m);
    };

    // Full liveness probe — answers "is u_rubus_sharpen actually applied to
    // the program that draws the tiles?" with GPU-side readbacks.
    window.__rubusRasterProbe = function() {
        const programs = [];
        bicubicProgramSet.forEach(function(p) {
            const locs = bicubicUniformLocs.get(p) || {};
            let alive = false, sharpen = null, tile = null, dbg = null, bias = null, mode = null, rho = null;
            try { alive = gl.isProgram(p); } catch (e) {}
            if (alive) {
                try { if (locs.sharpen) sharpen = gl.getUniform(p, locs.sharpen); } catch (e) { sharpen = 'err: ' + e; }
                try { if (locs.tile) tile = gl.getUniform(p, locs.tile); } catch (e) { tile = 'err: ' + e; }
                try { if (locs.debug) dbg = gl.getUniform(p, locs.debug); } catch (e) { dbg = 'err: ' + e; }
                try { if (locs.bias) bias = gl.getUniform(p, locs.bias); } catch (e) { bias = 'err: ' + e; }
                try { if (locs.mode) mode = gl.getUniform(p, locs.mode); } catch (e) { mode = 'err: ' + e; }
                try { if (locs.rho) rho = gl.getUniform(p, locs.rho); } catch (e) { rho = 'err: ' + e; }
            }
            programs.push({
                alive: alive,
                sharpenLocFound: !!locs.sharpen,
                tileLocFound: !!locs.tile,
                debugLocFound: !!locs.debug,
                biasLocFound: !!locs.bias,
                modeLocFound: !!locs.mode,
                rhoLocFound: !!locs.rho,
                u_rubus_sharpen_in_GPU: sharpen,
                u_rubus_tile_size_in_GPU: tile,
                u_rubus_debug_in_GPU: dbg,
                u_rubus_lodbias_in_GPU: bias,
                u_rubus_mode_in_GPU: mode,
                u_rubus_rho_in_GPU: rho
            });
        });
        let curIsBicubic = false;
        try {
            const cur = gl.getParameter(gl.CURRENT_PROGRAM);
            curIsBicubic = !!(cur && bicubicUniformLocs.has(cur));
        } catch (e) {}
        const report = {
            substitutionEnabled: substituteEnabled,
            desiredSharpen: sharpenStrength,
            desiredDebugCanary: debugCanary,
            desiredLodBias: lodBias,
            desiredMode: kernelMode === 1 ? 'decimate' : 'bicubic',
            useProgramHookCalls: useProgramHookCalls,
            useProgramBicubicCalls: useProgramBicubicCalls,
            drawElementsHookCalls: drawElementsHookCalls,
            drawElementsBicubicSets: drawElementsBicubicSets,
            currentProgramIsBicubic: curIsBicubic,
            liveBicubicPrograms: programs
        };
        console.log('[rubus] raster probe:', report);
        return report;
    };

    // Geometry/mip estimator for the current view. The tiles are 512×512 PNGs
    // overzoomed one level (coveringZ = round(zoom)+1), so at integer zooms
    // ρ≈1.48 → λ≈0.56 → LINEAR_MIPMAP_NEAREST selects mip 1, i.e. BOTH the
    // stock shader and our bicubic kernel sample a 2×2-box-prefiltered 256²
    // mip — never the original 512² texels. nearestMipSelected >= 1 while
    // probing means "the bicubic kernel is sampling a prefiltered mip with
    // half-texel-offset taps", which mutes the (bicubic − bilinear) residual.
    window.__rubusRasterMipEstimate = function() {
        try {
            const t = mapInstance.painter.transform;
            const z = t.zoom;
            let cz;
            if (typeof t.coveringZoomLevel === 'function') {
                cz = t.coveringZoomLevel({ tileSize: 256, roundZoom: true });
            } else if (typeof t.coveringZoom === 'number') {
                cz = t.coveringZoom;
            } else {
                cz = Math.round(z) + 1;
            }
            const pr = (mapInstance.getPixelRatio && mapInstance.getPixelRatio()) || window.devicePixelRatio || 1;
            const cssPerTile = 512 * Math.pow(2, z - cz);
            const devPerTile = cssPerTile * pr;
            const rho = 512 / devPerTile; // >1 = minification of the 512² source
            const lambda = rho > 0 ? Math.log(rho) / Math.LN2 : 0;
            const est = {
                zoom: Math.round(z * 1000) / 1000,
                coveringZ: cz,
                pixelRatio: pr,
                cssPerTile: Math.round(cssPerTile * 100) / 100,
                devicePerTile: Math.round(devPerTile * 100) / 100,
                minifyFactorRho: Math.round(rho * 1000) / 1000,
                lodLambda: Math.round(lambda * 1000) / 1000,
                nearestMipSelected: Math.max(0, Math.floor(lambda + 0.5))
            };
            console.log('[rubus] raster mip estimate:', est);
            return est;
        } catch (e) {
            return 'error: ' + e;
        }
    };
}
