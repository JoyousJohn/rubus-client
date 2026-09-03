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

        // Any bus/stop selection must not teleport while spoofing is enabled.
        // This mirrors building handling (first tap selects, second tap
        // teleport is handled inside buildings.js for buildings; for stops/buses
        // we just select and never spoof-teleport from the marker hit.
        // The generic map click is still allowed to teleport on empty map.
        if (busHit) {
            return;
        }

        if (stopHit) {
            return;
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

let spoofToastHideTimeout = null;

function showSpoofEnabledToast() {
    $('.spoof-toast-wrapper').removeClass('none').show();
    $('.spoof-toast-enabled').removeClass('none').show();
    $('.spoof-toast-disabled').addClass('none').hide();
    clearTimeout(spoofToastHideTimeout);
    spoofToastHideTimeout = setTimeout(() => {
        $('.spoof-toast-wrapper').fadeOut(() => {
            $('.spoof-toast-wrapper').addClass('none');
        });
    }, 5000);
}

function showSpoofDisabledToast() {
    $('.spoof-toast-enabled').addClass('none').hide();
    $('.spoof-toast-disabled').removeClass('none').show();
    $('.spoof-toast-wrapper').removeClass('none').show();
    clearTimeout(spoofToastHideTimeout);
    spoofToastHideTimeout = setTimeout(() => {
        $('.spoof-toast-wrapper').fadeOut(() => {
            $('.spoof-toast-wrapper').addClass('none');
            $('.spoof-toast-enabled').removeClass('none').show();
            $('.spoof-toast-disabled').addClass('none').hide();
        });
    }, 3000);
}

function shouldShowSpoofToast() {
    const lastShow = localStorage.getItem('last-spoof-toast-show');
    if (lastShow) {
        const elapsed = Date.now() - parseInt(lastShow);
        if (elapsed < 8 * 60 * 60 * 1000) return false;
    }
    localStorage.setItem('last-spoof-toast-show', Date.now().toString());
    return true;
}

let animationRateToastHideTimeout = null;

function showAnimationRateThrottledToast() {
    const $wrapper = $('.animation-rate-toast-wrapper');
    if ($('.spoof-toast-wrapper').is(':visible')) {
        $wrapper.css('top', '6rem');
    } else {
        $wrapper.css('top', '1rem');
    }
    $wrapper.removeClass('none').show();
    $('.animation-rate-toast-enabled').removeClass('none').show();
    $('.animation-rate-toast-disabled').addClass('none').hide();
    clearTimeout(animationRateToastHideTimeout);
    animationRateToastHideTimeout = setTimeout(() => {
        $wrapper.fadeOut(() => {
            $wrapper.addClass('none');
            $wrapper.css('top', '1rem');
        });
    }, 10000);
}

function showAnimationRateRestoredToast() {
    const $wrapper = $('.animation-rate-toast-wrapper');
    $wrapper.css('top', '1rem');
    $('.animation-rate-toast-enabled').addClass('none').hide();
    $('.animation-rate-toast-disabled').removeClass('none').show();
    $wrapper.removeClass('none').show();
    clearTimeout(animationRateToastHideTimeout);
    animationRateToastHideTimeout = setTimeout(() => {
        $wrapper.fadeOut(() => {
            $wrapper.addClass('none');
            $('.animation-rate-toast-enabled').removeClass('none').show();
            $('.animation-rate-toast-disabled').addClass('none').hide();
        });
    }, 3000);
}

function shouldShowAnimationRateToast() {
    const lastShow = localStorage.getItem('last-animation-rate-toast-show');
    if (lastShow) {
        const elapsed = Date.now() - parseInt(lastShow);
        if (elapsed < 8 * 60 * 60 * 1000) return false;
    }
    localStorage.setItem('last-animation-rate-toast-show', Date.now().toString());
    return true;
}

$(document).ready(function() {
    if (settings['toggle-spoofing'] && shouldShowSpoofToast()) {
        showSpoofEnabledToast();
    }
    const isAnimationThrottled = !settings['toggle-low-performance-mode'] && settings['bus-animation-rate'] && settings['bus-animation-rate'] !== 'off';
    if (isAnimationThrottled && shouldShowAnimationRateToast()) {
        showAnimationRateThrottledToast();
    }
    $(document).on('click', '.spoof-disable-btn', function() {
        settings['toggle-spoofing'] = false;
        spoof = false;
        $('#toggle-spoofing').prop('checked', false);
        saveSettings();
        showSpoofDisabledToast();
    });
    $(document).on('click', '.animation-rate-disable-btn', function() {
        settings['bus-animation-rate'] = 'off';
        $('.settings-bus-animation .settings-option').removeClass('settings-selected');
        $('.settings-bus-animation .settings-option[bus-animation-rate-option="off"]').addClass('settings-selected');
        if (typeof applyBusAnimationRate === 'function') {
            applyBusAnimationRate('off');
        }
        saveSettings();
        showAnimationRateRestoredToast();
    });
});
