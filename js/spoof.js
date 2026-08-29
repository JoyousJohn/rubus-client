let __spoofHandlerAttached = false;

function initSpoofing() {
    if (__spoofHandlerAttached) { return; }
    __spoofHandlerAttached = true;

    map.on('click', function(e) {
        const spoofEnabled = spoof || settings['toggle-spoofing'];
        if (!spoofEnabled) { return; }

        const lat = e.latlng.lat;
        const lng = e.latlng.lng;

        // --- Hit detection ---

        // Building at click (via spatial index, works even when fill layer is hidden)
        let buildingAtClick = null;
        if (buildingSpatialIndex) {
            const nearbyBuildings = buildingSpatialIndex.getBuildingsNearPoint(lat, lng);
            for (const feature of nearbyBuildings) {
                if (feature.properties && (feature.properties.category === 'building' || feature.properties.category === 'parking')) {
                    if (isPointInPolygon(lat, lng, feature.geometry.coordinates[0])) {
                        buildingAtClick = feature;
                        break;
                    }
                }
            }
        } else if (spoofEnabled) {
            loadBuildings().then(() => {
                setTimeout(() => {
                    const clickEvent = { latlng: e.latlng };
                    map.fire('click', clickEvent);
                }, 100);
            });
            return;
        }

        // Building hits are handled exclusively by js/buildings.js (first tap
        // shows info, second tap teleports if spoof enabled). Suppress spoof.js
        // for any building hit to avoid teleporting on first selection and to
        // avoid double teleport on second tap.
        if (buildingAtClick) {
            return;
        }

        // Bus / stop hits: check GL symbol layers via queryRenderedFeatures and
        // DOM markers via the event target. Only empty map or a hit on the
        // already-selected feature may teleport; selecting a new bus/stop must
        // not teleport.
        const point = e.point;
        let busHit = null;
        let stopHit = null;

        if (point && map.queryRenderedFeatures) {
            const busLayers = ['bus-markers-layer', 'bus-markers-labels', 'bus-markers-glow', 'bus-markers-selected', 'bus-markers-selected-labels'].filter(function(id) { return map.getLayer(id); });
            if (busLayers.length) {
                const hits = map.queryRenderedFeatures(point, { layers: busLayers });
                if (hits.length) {
                    busHit = hits[0].properties.busName;
                }
            }
            const stopLayers = ['stop-markers-layer', 'stop-markers-labels', 'stop-markers-selected', 'stop-markers-selected-labels'].filter(function(id) { return map.getLayer(id); });
            if (stopLayers.length) {
                const hits = map.queryRenderedFeatures(point, { layers: stopLayers });
                if (hits.length) {
                    stopHit = String(hits[0].properties.stopId);
                }
            }
        }

        // DOM fallback when renderer is 'custom' (maplibregl.Marker HTML)
        const target = e.originalEvent && e.originalEvent.target;
        if (target && target.closest) {
            const markerEl = target.closest('.maplibregl-marker');
            if (markerEl) {
                if (!busHit && !stopHit) {
                    // Determine marker type by inspecting wrapper contents
                    const isBusDom = markerEl.querySelector('.bus-marker-wrapper');
                    const isStopDom = markerEl.querySelector('.custom-stop-icon') || markerEl.querySelector('[stop-marker-id]');
                    if (isBusDom) {
                        for (const name in busMarkers) {
                            const m = busMarkers[name];
                            const el = m.getElement();
                            if (el && (el === markerEl || el.contains(target) || markerEl.contains(el))) {
                                busHit = name;
                                break;
                            }
                        }
                        if (!busHit) busHit = '__dom_bus_hit__';
                    } else if (isStopDom) {
                        let idAttr = null;
                        const inner = markerEl.querySelector('[stop-marker-id]');
                        if (inner) idAttr = inner.getAttribute('stop-marker-id');
                        if (!idAttr) {
                            for (const sid in busStopMarkers) {
                                const m = busStopMarkers[sid];
                                const el = m.getElement();
                                if (el && (el === markerEl || el.contains(target) || markerEl.contains(el))) {
                                    idAttr = String(sid);
                                    break;
                                }
                            }
                        }
                        stopHit = idAttr ? String(idAttr) : '__dom_stop_hit__';
                    }
                }
            }
        }

        // Bus selection click (new bus) must not teleport. Only allow if bus
        // already selected (tap within already-selected feature).
        if (busHit) {
            if (busHit !== popupBusName) {
                return;
            }
            // Same bus second tap: allowed -> fall through to spoof at tap location
        }

        // Stop selection click (new stop) must not teleport. Only allow if stop
        // already selected.
        if (stopHit) {
            if (stopHit !== String(popupStopId)) {
                return;
            }
        }

        // Building case already returned above; empty map falls through.

        userPosition = [lat, lng];

        if (watchPositionId !== null) {
            navigator.geolocation.clearWatch(watchPositionId);
            watchPositionId = null;
        }

        if (window.marker) {
            window.marker.remove();
            window.marker = null;
        }

        let locationMarker = window.locationMarker;
        if (locationMarker) {
            locationMarker.setLatLngPrecise([lat, lng]);
        } else {
            locationMarker = L.marker([lat, lng], {
                icon: createLocationMarkerIcon()
            }).addTo(map);
            locationMarker.on('click', function() {
                $('.bus-info-popup, .stop-info-popup').hide();
                $('.my-location-popup').show();
                hideCenterStops();
            });
            window.locationMarker = locationMarker;
        }

        updateNearestStop();
        populateMeClosestStops();

        $('.fly-closest-stop-wrapper').fadeIn();
        $('.my-location-popup').show();
        hideCenterStops();
    });
}
document.addEventListener('rubus-map-created', initSpoofing);
