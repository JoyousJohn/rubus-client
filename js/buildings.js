let buildingsLayer = null;
let highlightedBuildingLayer = null;

function unhighlightBuilding() {
    if (highlightedBuildingLayer) {
        const category = highlightedBuildingLayer.feature?.properties?.category;
        if (category === 'building') {
            highlightedBuildingLayer.setStyle({
                color: '#444',
                fillColor: '#888',
                fillOpacity: 0.5,
                weight: 1
            });
        } else if (category === 'parking') {
            highlightedBuildingLayer.setStyle({
                color: '#226622',
                fillColor: '#44cc44',
                fillOpacity: 0.3,
                weight: 1
            });
        } else {
            highlightedBuildingLayer.setStyle({
                color: '#333',
                fillColor: '#ccc',
                fillOpacity: 0.3,
                weight: 1
            });
        }
    }
    highlightedBuildingLayer = null;
}

function highlightBuilding(feature) {
    if (highlightedBuildingLayer) {
        unhighlightBuilding();
    }

    if (window.buildingsLayer && window.buildingsLayer.eachLayer) {
        window.buildingsLayer.eachLayer(function(layer) {
            if (layer.feature && layer.feature.properties) {
                const layerName = layer.feature.properties.name;
                const featureName = feature.name;
                const layerNameNorm = layerName ? layerName.trim().toLowerCase() : '';
                const featureNameNorm = featureName ? featureName.trim().toLowerCase() : '';
                if (layerNameNorm === featureNameNorm) {
                    layer.setStyle({
                        color: '#2255ff',
                        fillColor: '#66aaff',
                        fillOpacity: 0.5,
                        weight: 1
                    });
                    highlightedBuildingLayer = layer;
                }
            }
        });
    }
}

function showBuildingInfo(feature) {
    $('.knight-mover, .campus-switcher').hide();
    hideInfoBoxes();
    $('.building-info-popup .building-name').text(feature.name);
    $('.building-info-popup').stop(true, true).show();
    popupBuildingName = feature.name;
    popupBuildingLatLng = feature.lat + ',' + feature.lng;

    // Highlight the polygon if it exists
    if (window.buildingsLayer && window.buildingsLayer.eachLayer) {
        // Remove highlight from previous
        unhighlightBuilding();
        highlightBuilding(feature);
    }
}

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
                                showBuildingInfo(feature.properties);
                            }
                        });
                    }
                }).addTo(map);
                window.buildingsLayer = buildingsLayer;
            });
    }
}

document.addEventListener('rubus-map-created', loadBuildings);