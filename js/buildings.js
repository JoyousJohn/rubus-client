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

// --- Building Closest Stops Switcher ---
let buildingClosestStopsMode = 'all'; // 'all' or 'active'

function updateBuildingClosestStopsSwitcher() {
    const $options = $('.building-closest-stops-options .building-closest-stops-option');
    $options.removeClass('selected');
    $options.each(function() {
        if ($(this).text().trim().toLowerCase() === buildingClosestStopsMode) {
            $(this).addClass('selected');
        }
    });

    if (sim) {
        $('.building-closest-stops-options').hide();
    } else {
        // Determine if there are any active buses
        const hasActive = Object.keys(busData).length > 0;
        if (!hasActive) {
            // Only show 'All' option, hide 'Active'
            $('.building-closest-stops-options .building-closest-stops-option').each(function() {
                if ($(this).text().trim().toLowerCase() === 'active') {
                    $(this).hide();
                } else {
                    $(this).show().addClass('selected only-option').text('All Routes').removeClass('pointer').show();
                }
            });
            buildingClosestStopsMode = 'all';
        } else {
            $('.building-closest-stops-options .building-closest-stops-option').show().removeClass('only-option');
        }
        $('.building-closest-stops-options').show();
        if (buildingClosestStopsMode === 'all') {
            $('.building-closest-stops-explain').removeClass('none');
        } else {
            $('.building-closest-stops-explain').addClass('none');
        }
    }
}

function getAllMainRoutesForStop(stopId) {
    stopId = Number(stopId);
    const routes = ['a', 'b', 'bl', 'c', 'ee', 'f', 'h', 'lx', 'rexl', 'rexb'].filter(route => {
        return stopLists[route].includes(stopId);
    });
    return routes;
}

async function populateBuildingClosestStopsList(feature) {
    // feature: { name, lat, lng, ... }
    if (!feature || typeof feature.lat !== 'number' || typeof feature.lng !== 'number') return;
    const buildingLat = feature.lat;
    const buildingLng = feature.lng;

    // Use all stops or only active stops
    let stopIds = buildingClosestStopsMode === 'active' ? (activeStops || []) : Object.keys(stopsData || {});
    // If stopsData keys are strings, ensure stopIds are strings
    stopIds = stopIds.map(String);

    // Calculate distances
    const stopsWithDistance = stopIds.map(stopId => {
        const stop = stopsData[stopId];
        if (!stop) return null;
        const dist = haversine(buildingLat, buildingLng, stop.latitude, stop.longitude);
        let routes = [];
        if (buildingClosestStopsMode === 'active') {
            routes = getRoutesServicingStop(Number(stopId));
        } else {
            routes = getAllMainRoutesForStop(stopId);
        }
        return routes.length > 0 ? {
            stopId,
            name: stop.name,
            distance: dist,
            lat: stop.latitude,
            lng: stop.longitude,
            routes
        } : null;
    }).filter(Boolean);

    // Sort by distance
    stopsWithDistance.sort((a, b) => a.distance - b.distance);

    // Only show the closest 3 with at least one route
    const stopsToShow = stopsWithDistance.slice(0, 3);

    // Render
    const $list = $('.building-closest-stops-list');
    $list.empty();

    // Show only the closest stop at first
    stopsToShow.forEach((stop, idx) => {
        // If less than 1,000ft, show in ft, else in mi
        let distStr;
        if (stop.distance < 0.189) { // 1,000ft = 0.189 miles
            distStr = `${Math.round(stop.distance * 5280)} ft`;
        } else {
            distStr = `${stop.distance.toFixed(2)} mi`;
        }
        const extraClass = idx === 0 ? '' : 'building-stop-extra';
        const $item = $(`
            <div class="flex flex-col mb-0p5rem ${extraClass}" style="${idx > 0 ? 'display:none;' : ''}">
                <div class="flex align-center gap-x-0p5rem pointer">
                    <div class="building-stop-name" style="font-size:1.5rem;">${stop.name}</div>
                    <div class="building-stop-dist" style="color:gray; font-size:1.2rem;">${distStr}</div>
                </div>
                <div class="building-stop-bus-routes flex gap-x-0p5rem"></div>
            </div>
        `);
        $item.click(async () => {
            if (buildingClosestStopsMode === 'all') {
                await startSim();
            }
            flyToStop(Number(stop.stopId));
            sa_event('btn_press', {
                'btn': 'building_closest_stop',
                'stop': stop.name
            });
        });
        $list.append($item);
        // Populate bus routes badges
        const $routesDiv = $item.find('.building-stop-bus-routes');
        stop.routes.forEach(route => {
            const color = colorMappings[route];
            const $badge = $(`<div class="building-route-badge pointer" style="background:${color};color:white;padding:0.2rem 0.8rem;border-radius:0.5rem;font-size:1.2rem;">${route.toUpperCase()}</div>`).click(async function(e) {
                e.stopPropagation();
                if (buildingClosestStopsMode === 'all') {
                    await startSim();
                }
                flyToStop(Number(stop.stopId));
                setTimeout(() => {
                    toggleRoute(route);
                }, 1);
                sa_event('btn_press', {
                    'btn': 'building_closest_stop_route',
                    'stop': stop.name,
                    'route': route
                });
            });
            $routesDiv.append($badge);
        });
    });

    // If there are more than 1 stop, add a 'Show more stops' link
    if (stopsToShow.length > 1) {
        const $showMore = $('<div class="building-show-more-stops pointer" style="color:rgb(105, 105, 191);font-size:1.2rem;text-align:left;">Show more stops</div>');
        $showMore.click(function() {
            $('.building-stop-extra').slideDown(200);
            $(this).hide();
            sa_event('btn_press', {
                'btn': 'building_show_more_stops'
            });
        });
        $list.append($showMore);
    }
}

function setupBuildingClosestStopsSwitcher() {
    // Only set up once
    if ($('.building-closest-stops-options').data('setup')) return;
    $('.building-closest-stops-options').data('setup', true);
    
    // Click on the container toggles between options
    $('.building-closest-stops-options').off('click').on('click', function() {
        // Toggle to the other option
        const newMode = buildingClosestStopsMode === 'all' ? 'active' : 'all';
        
        // Check if the new mode is available (if no active buses, can't switch to active)
        if (newMode === 'active' && (!Array.isArray(activeStops) || activeStops.length === 0)) {
            return; // Can't switch to active mode
        }
        
        buildingClosestStopsMode = newMode;
        updateBuildingClosestStopsSwitcher();
        populateBuildingClosestStopsList(window._currentBuildingFeatureForStops);
        sa_event('btn_press', {
            'btn': 'building_closest_stops_switcher',
            'mode': newMode
        });
    });
}

function showBuildingInfo(feature) {
    $('.knight-mover, .campus-switcher').hide();
    hideInfoBoxes(true);
    $('.building-info-popup .building-name').text(feature.name);
    $('.building-info-popup').stop(true, true).show();
    popupBuildingName = feature.name;
    popupBuildingLatLng = feature.lat + ',' + feature.lng;
    console.log(feature)

    // Highlight the polygon if it exists
    if (window.buildingsLayer && window.buildingsLayer.eachLayer) {
        // Remove highlight from previous
        unhighlightBuilding();
        highlightBuilding(feature);
    }

    // Set up and default the switcher
    buildingClosestStopsMode = 'all';
    setupBuildingClosestStopsSwitcher();
    updateBuildingClosestStopsSwitcher();
    window._currentBuildingFeatureForStops = feature;
    populateBuildingClosestStopsList(feature);
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
                                sa_event('building_tap', {
                                    'building': feature.properties.name
                                });
                            }
                        });
                    }
                }).addTo(map);
                window.buildingsLayer = buildingsLayer;
            });
    }
}

document.addEventListener('rubus-map-created', loadBuildings);