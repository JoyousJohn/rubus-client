let __spoofHandlerAttached = false;

function initSpoofing() {
    if (__spoofHandlerAttached) { return; }
    if (typeof map === 'undefined' || !map || typeof map.on !== 'function') { return; }
    __spoofHandlerAttached = true;

    map.on('click', function(e) {
        // Prevent spoofing if click is on a building or parking lot
        let isOnBuildingOrParking = false;
        if (window.buildingsLayer) {
            window.buildingsLayer.eachLayer(function(layer) {
                if (layer.getBounds && layer.getBounds().contains(e.latlng)) {
                    const category = layer.feature?.properties?.category;
                    if (category === 'building' || category === 'parking') {
                        isOnBuildingOrParking = true;
                    }
                }
            });
        }
        if (isOnBuildingOrParking) { return; }

        const spoofEnabled = (spoof) || (settings && settings['toggle-spoofing']);
        if (!spoofEnabled) { return; }

        const lat = e.latlng.lat;
        const lng = e.latlng.lng;
        userPosition = [lat, lng];

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