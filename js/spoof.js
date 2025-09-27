let __spoofHandlerAttached = false;

function initSpoofing() {
    if (__spoofHandlerAttached) { return; }
    if (typeof map === 'undefined' || !map || typeof map.on !== 'function') { return; }
    __spoofHandlerAttached = true;

    map.on('click', function(e) {
        const spoofEnabled = (spoof) || (settings && settings['toggle-spoofing']);
        if (!spoofEnabled) { return; }

        const lat = e.latlng.lat;
        const lng = e.latlng.lng;

        // Check if click is on a building (even if buildings layer is disabled)
        let buildingAtClick = null;
        if (buildingSpatialIndex) {
            // Use spatial index to find buildings near the click point
            const nearbyBuildings = buildingSpatialIndex.getBuildingsNearPoint(lat, lng);
            for (const feature of nearbyBuildings) {
                if (feature.properties && (feature.properties.category === 'building' || feature.properties.category === 'parking')) {
                    // Check if point is actually inside the building polygon
                    if (isPointInPolygon(lat, lng, feature.geometry.coordinates[0])) {
                        buildingAtClick = feature;
                        break;
                    }
                }
            }
        } else if (spoofEnabled) {
            // Buildings not loaded yet, load them for spoofing detection
            loadBuildings().then(() => {
                // Re-trigger the click handler with buildings now loaded
                // This is a bit of a hack, but ensures building detection works
                setTimeout(() => {
                    const clickEvent = { latlng: e.latlng };
                    map.fire('click', clickEvent);
                }, 100);
            });
            return; // Exit early, will re-trigger after buildings load
        }

        if (buildingAtClick) {
            // Spoof to building center coordinates instead of exact click point
            const buildingLat = buildingAtClick.properties.lat;
            const buildingLng = buildingAtClick.properties.lng;
            userPosition = [buildingLat, buildingLng];
        } else {
            // Regular spoofing to exact click point
            userPosition = [lat, lng];
        }

        if (typeof watchPositionId !== 'undefined' && watchPositionId !== null) {
            try { navigator.geolocation.clearWatch(watchPositionId); } catch (_) {}
            watchPositionId = null;
        }

        if (window.marker && typeof window.marker.remove === 'function') {
            try { window.marker.remove(); } catch (_) {}
            window.marker = null;
        }

        let locationMarker = window.locationMarker;
        if (locationMarker && typeof locationMarker.setLatLng === 'function') {
            if (typeof locationMarker.setLatLngPrecise === 'function') {
                locationMarker.setLatLngPrecise([lat, lng]);
            } else {
                locationMarker.setLatLng([lat, lng]);
            }
        } else {
            locationMarker = L.marker([lat, lng], {
                icon: L.icon({
                    iconUrl: 'img/location_marker.png',
                    iconSize: [24, 24],
                    iconAnchor: [12, 12]
                })
            }).addTo(map);
            locationMarker.on('click', function() {
                $('.bus-info-popup, .stop-info-popup, .bus-stopped-for').hide();
                $('.my-location-popup').show();
            });
            window.locationMarker = locationMarker;
        }

        try { updateNearestStop(); } catch (_) {}
        try { populateMeClosestStops(); } catch (_) {}

        $('.fly-closest-stop-wrapper').fadeIn();
        $('.my-location-popup').show();
    });
}
document.addEventListener('rubus-map-created', initSpoofing);