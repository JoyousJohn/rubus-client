// js/nav-bike.js - extracted verbatim from js/map.js
function navToStop() {

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isAndroid = /Android/.test(navigator.userAgent);
    let url = '';

    const stopLat = stopsData[popupStopId].latitude
    const stopLng = stopsData[popupStopId].longitude

    if (isIOS) {
        url = `http://maps.apple.com/?daddr=${stopLat},${stopLng}&dirflg=w`;
    } else if (isAndroid) {
        url = `https://www.google.com/maps/dir/?api=1&destination=${stopLat},${stopLng}&travelmode=walking`;
    } else {
        // Fallback, use GM
        url = `https://www.google.com/maps/dir/?api=1&destination=${stopLat},${stopLng}&travelmode=walking`;
    }

    window.open(url, '_blank');

}

function navToBuilding() {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isAndroid = /Android/.test(navigator.userAgent);
    let url = '';

    if (isIOS) {
        url = `http://maps.apple.com/?daddr=${popupBuildingLatLng}&dirflg=w`;
    } else if (isAndroid) {
        url = `https://www.google.com/maps/dir/?api=1&destination=${popupBuildingLatLng}&travelmode=walking`;
    } else {
        // Fallback, use GM
        url = `https://www.google.com/maps/dir/?api=1&destination=${popupBuildingLatLng}&travelmode=walking`;
    }

    window.open(url, '_blank');
}

function showBikeRacks() {
    if (!bikeRacks || !bikeRacks[selectedCampus]) {
        console.log('No bike rack data available for campus:', selectedCampus);
        return;
    }

    // Clear any existing bike rack markers
    hideBikeRacks();

    // Loop through all bike rack locations for the current campus
    for (const category in bikeRacks[selectedCampus]) {
        const locations = bikeRacks[selectedCampus][category];
        for (const location of locations) {
            const [lng, lat] = location; // Note: bike_racks.js uses [lng, lat] format

            const marker = L.marker([lat, lng], {
                icon: L.icon({
                    iconUrl: 'img/bike_rack.png',
                    iconSize: [16, 16],
                    iconAnchor: [8, 8]
                }),
                zIndexOffset: -100
            });

            marker.addTo(map);
            bikeRackMarkers.push(marker);
        }
    }

    console.log(`Added ${bikeRackMarkers.length} bike rack markers for campus: ${selectedCampus}`);
}

function hideBikeRacks() {
    for (const marker of bikeRackMarkers) {
        map.removeLayer(marker);
    }
    bikeRackMarkers = [];
    // console.log('Removed all bike rack markers');
}
