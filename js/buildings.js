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
let buildingClosestStopsMode = 'active'; // 'all' or 'active'

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
            // $('.building-closest-stops-options .building-closest-stops-option').each(function() {
            //     if ($(this).text().trim().toLowerCase() === 'active') {
            //         $(this).hide();
            //     } else {
            //         $(this).show().addClass('selected only-option').text('All Routes').removeClass('pointer').show();
            //     }
            // });
            // buildingClosestStopsMode = 'all';

            $('.building-closest-stops-options .building-closest-stops-option').each(function() {
                if ($(this).text().trim().toLowerCase() === 'active') {
                    $(this).show().addClass('selected only-option').text('Active Routes').removeClass('pointer').show();
                } else {
                    $(this).hide();
                }
            });
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

// function getAllMainRoutesForStop(stopId) {
//     stopId = Number(stopId);
//     const routes = ['a', 'b', 'bl', 'c', 'ee', 'f', 'h', 'lx', 'rexl', 'rexb'].filter(route => {
//         return stopLists[route].includes(stopId);
//     });
//     return routes;
// }

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
            // routes = getAllMainRoutesForStop(stopId);
            routes = []; // No routes when sim is disabled
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
    const $heading = $('.building-closest-stops-heading');
    $list.empty();

    // Prepare the bottom action wrapper and the Google Maps button (always visible)
    const $showMoreWrapper = $('<div class="flex justify-between"></div>');
    const $openInGoogleMaps = $('<div class="building-open-in-google-maps pointer mt-1rem" style="color:rgb(105, 105, 191); font-size:1.2rem; text-align:left;">Open in Google Maps</div>');
    $openInGoogleMaps.click(function() {
        window.open(`https://www.google.com/maps/search/?api=1&query=${buildingLat},${buildingLng}`, '_blank');
    });

    if (stopsToShow.length === 0) {
        $heading.hide();
        // Only Google Maps button when no stops
        $showMoreWrapper.append($openInGoogleMaps);
        $list.append($showMoreWrapper);
        return;
    } else {
        $heading.show();
    }

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
                <div class="flex align-center pointer">
                    <div class="building-stop-name mr-0p5rem text-1p5rem">${stop.name}</div>
                    <div class="building-stop-dist text-1p2rem" style="color: gray;">${distStr}</div>
                    <div class="text-1p2rem" style="color: gray;">&nbsp;• ${campusShortNamesMappings[stopsData[stop.stopId].campus]}</div>
                </div>
                <div class="building-stop-bus-routes flex gap-x-0p5rem"></div>
            </div>
        `);
        $item.click(async () => {
            // if (buildingClosestStopsMode === 'all') {
            //     await startSim();
            // }
            flyToStop(Number(stop.stopId), true); // true indicates user interaction
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
                // if (buildingClosestStopsMode === 'all') {
                //     await startSim();
                // }
                flyToStop(Number(stop.stopId), true); // true indicates user interaction
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
        const $showMore = $('<div class="building-show-more-stops pointer mt-1rem" style="color:rgb(105, 105, 191); font-size:1.2rem; text-align:left;">Show more stops</div>');
        $showMore.click(function() {
            $('.building-stop-extra').slideDown(200);
            $(this).hide();
            sa_event('btn_press', {
                'btn': 'building_show_more_stops'
            });
        });
        $showMoreWrapper.append($showMore);
    }
    // Always include Google Maps button
    $showMoreWrapper.append($openInGoogleMaps);
    $list.append($showMoreWrapper);

}

function setupBuildingClosestStopsSwitcher() {
    // Only set up once
    if ($('.building-closest-stops-options').data('setup')) return;
    $('.building-closest-stops-options').data('setup', true);

    // $('.building-closest-stops-options').off('click').on('click', function() {
    //     // Toggle to the other option
    //     const newMode = buildingClosestStopsMode === 'all' ? 'active' : 'all';
    //
    //     // Check if the new mode is available (if no active buses, can't switch to active)
    //     if (newMode === 'active' && (!Array.isArray(activeStops) || activeStops.length === 0)) {
    //         return; // Can't switch to active mode
    //     }
    //
    //     buildingClosestStopsMode = newMode;
    //     updateBuildingClosestStopsSwitcher();
    //     populateBuildingClosestStopsList(window._currentBuildingFeatureForStops);
    //     sa_event('btn_press', {
    //         'btn': 'building_closest_stops_switcher',
    //         'mode': newMode
    //     });
    // });
}

function showBuildingInfo(feature) {
    $('.knight-mover, .knight-mover-mini, .campus-switcher').hide();
    hideInfoBoxes(true);
    $('.building-info-popup .building-name').text(feature.name);
    $('.building-info-popup').stop(true, true).show();
    $('.building-closest-stops-heading').hide(); // hide initially to avoid flicker until list populated
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
    // buildingClosestStopsMode = 'all';
    buildingClosestStopsMode = 'active';
    setupBuildingClosestStopsSwitcher();
    updateBuildingClosestStopsSwitcher();
    window._currentBuildingFeatureForStops = feature;
    populateBuildingClosestStopsList(feature);
}

function loadBuildings() {
    // Prevent multiple simultaneous calls
    if ($('.buildings-btn').hasClass('loading')) {
        return Promise.resolve();
    }
    
    if (buildingsLayer) {
        map.removeLayer(buildingsLayer);
        buildingsLayer = null;
    }

    // Disable button and show loading state
    $('.buildings-btn').prop('disabled', true).addClass('loading');
    
    return fetch('lib/buildings-parking.json')
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
            // Ensure button reflects active state when layer is shown
            $('.buildings-btn').addClass('active');
        })
        .catch(error => {
            console.error('Error loading buildings:', error);
            // Re-enable button on error
            $('.buildings-btn').prop('disabled', false).removeClass('loading');
            throw error;
        })
        .finally(() => {
            // Re-enable button after loading completes (success or error)
            $('.buildings-btn').prop('disabled', false).removeClass('loading');
        });
}

// Add click handler for buildings button
$(document).ready(function() {
    $('.buildings-btn').click(function() {
        // Prevent clicks while loading
        if ($(this).prop('disabled')) {
            return;
        }
        
        // Toggle buildings visibility based on layer presence
        if (buildingsLayer) {
            map.removeLayer(buildingsLayer);
            buildingsLayer = null;
            window.buildingsLayer = null;
            highlightedBuildingLayer = null;
            $('.buildings-btn').removeClass('active');
            
            settings['toggle-show-buildings'] = false;
            localStorage.setItem('settings', JSON.stringify(settings));
            
            sa_event('btn_press', {
                'btn': 'buildings_toggle',
                'visible': false
            });
        } else {
            // Check if buildings are currently loading
            if ($('.buildings-btn').hasClass('loading')) {
                return;
            }
            loadBuildings();
            
            // Save state to settings
            settings['toggle-show-buildings'] = true;
            localStorage.setItem('settings', JSON.stringify(settings));
            
            sa_event('btn_press', {
                'btn': 'buildings_toggle',
                'visible': true
            });
        }
    });
    
    // Initial button state reflects current layer
    if (buildingsLayer) { $('.buildings-btn').addClass('active'); } else { $('.buildings-btn').removeClass('active'); }
});

// Function to restore building layer state from settings
function restoreBuildingLayerState() {
    if (settings['toggle-show-buildings'] && !buildingsLayer) {
        loadBuildings();
    } else if (!settings['toggle-show-buildings'] && buildingsLayer) {
        // Hide buildings if they're currently shown but setting is false
        map.removeLayer(buildingsLayer);
        buildingsLayer = null;
        window.buildingsLayer = null;
        highlightedBuildingLayer = null;
        $('.buildings-btn').removeClass('active');
    }
}

// Listen for settings update to restore building state
document.addEventListener('rubus-settings-updated', function() {
    restoreBuildingLayerState();
});