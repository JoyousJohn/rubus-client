let buildingsLayer = null;

function loadBuildings() {
    if (buildingsLayer) {
        map.removeLayer(buildingsLayer);
        buildingsLayer = null;
    }

    if (settings['toggle-show-buildings']) {
        fetch('lib/buildings-parking.json')
            .then(response => response.json())
            .then(data => {
                buildingsLayer = L.geoJSON(data, {
                    style: function(feature) {
                        // You can customize style based on feature properties
                        if (feature.properties && feature.properties.category === 'building') {
                            return {
                                color: '#444',
                                fillColor: '#888',
                                fillOpacity: 0.5,
                                weight: 1
                            };
                        } else if (feature.properties && feature.properties.category === 'parking') {
                            return {
                                color: '#226622',
                                fillColor: '#44cc44',
                                fillOpacity: 0.3,
                                weight: 1
                            };
                        }
                        return {
                            color: '#333',
                            fillColor: '#ccc',
                            fillOpacity: 0.3,
                            weight: 1
                        };
                    },
                    onEachFeature: function(feature, layer) {
                        layer.on('click', function(e) {
                            if (feature.properties && feature.properties.name) {
                                $('.knight-mover, .campus-switcher').hide();
                                hideInfoBoxes();
                                $('.building-info-popup .building-name').text(feature.properties.name);
                                $('.building-info-popup').stop(true, true).show();
                                popupBuildingName = feature.properties.name;
                                popupBuildingLatLng = feature.properties.lat + ',' + feature.properties.lng;
                            }
                        });
                        // Prevent map zoom on double-tap/click for building polygons
                        layer.on('dblclick', function(e) {
                            e.originalEvent.preventDefault();
                            e.originalEvent.stopPropagation();
                            L.DomEvent.stop(e);
                            return false;
                        });
                    }
                }).addTo(map);
            });
    }
}

document.addEventListener('rubus-map-created', loadBuildings);