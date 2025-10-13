let appStyle = 'rubus'; // temp
let riderRouteToggles = {}; // Track which routes are toggled on/off in rider mode
let currentViewedRoute = null; // Track the currently viewed single route
let savedRouteViewBounds = null; // Save the map bounds before viewing a single route

function setAppStyle(style) {
    if (style === 'rider') {

        settings['marker-type'] = 'rider';
        updateMarkerType();

        // Disable buildings layer
        if (buildingsLayer) {
            map.removeLayer(buildingsLayer);
        }

        // Update all existing stop markers to use rider style
        setStopMarkersToRider();

        $('.bottom').hide();
        $('.settings-panel, .settings-close').hide();

        $('.rider-top-wrapper').show();

        appStyle = 'rider';
        
        // Initialize rider routes if not done yet
        if (Object.keys(riderRouteToggles).length === 0) {
            populateRiderRoutes();
        }

    } else if (style === 'rubus'){

    }
}

function setStopMarkersToRider() {
    Object.keys(busStopMarkers).forEach(stopId => {
        const img = document.querySelector(`img[stop-marker-id="${stopId}"]`);
        img.src = 'img/rider/rider-stop-marker-white.png';
        img.width = '15';
        img.height = '15';
    });
}

function popRiderInfo(busId) {
    
    // Handle concentric circle animation for selected bus marker
    if (selectedMarkerId && busMarkers[selectedMarkerId]) {
        const prevRiderMarker = $(busMarkers[selectedMarkerId].getElement()).find('.rider-marker');
        prevRiderMarker.removeClass('rider-marker-selected');
    }
    
    // Add animation to newly selected marker
    const riderMarker = $(busMarkers[busId].getElement()).find('.rider-marker');
    riderMarker.addClass('rider-marker-selected');
    
    $('.rider-bus-info-top-route').text(busData[busId].route.toUpperCase()).css('color', colorMappings[busData[busId].route]);

    $('.rider-bus-info-name').text('Bus ' + busData[busId].busName + '(' + busId + ') (' + busData[busId].capacity + '% full)');

    // Clear existing stops
    $('.rider-bus-info-stops').empty();
    setTimeout(() => {
        $('.rider-bus-info-stops').scrollTop(0);
    }, 0);

    // Get bus route and next stop
    const route = busData[busId].route;
    const nextStop = busData[busId].next_stop;

    const routeStops = stopLists[route];
    const nextStopIndex = routeStops.indexOf(nextStop);

    if (nextStopIndex !== -1) {
        const currentStopId = busData[busId]?.stopId;

        let stopsToShow;
        if (busData[busId].at_stop) {
            // Handle array stopIds
            let actualStopId = currentStopId;
            if (Array.isArray(currentStopId)) {
                actualStopId = currentStopId[1]; // Use second element for route lookup
            }
            const currentStopIndex = routeStops.indexOf(actualStopId);
            if (currentStopIndex !== -1) {
                stopsToShow = [currentStopId, ...routeStops.slice(currentStopIndex + 1), ...routeStops.slice(0, currentStopIndex)];
            } else {
                stopsToShow = routeStops.slice(nextStopIndex).concat(routeStops.slice(0, nextStopIndex));
            }
        } else {
            // Bus is not at a stop - use original logic
            stopsToShow = routeStops
                .slice(nextStopIndex)
                .concat(routeStops.slice(0, nextStopIndex));
        }

        stopsToShow.forEach((stopId, index) => {
            const stopName = stopsData[stopId] ? stopsData[stopId].name : 'Unknown Stop';

            // Check if bus is currently at this stop using at_stop property
            const originalStopId = stopId;
            if (Array.isArray(stopId)) {
                stopId = stopId[1];
            }
            // Handle array stopIds (like [20, 19] for special routes)
            let busStopId = busData[busId].stopId;
            if (Array.isArray(busStopId)) {
                busStopId = busStopId[1]; // Use the second element for comparison
            }
            const isAtStop = busData[busId].at_stop && Number(busStopId) === Number(stopId);

            let etaText;

            if (isAtStop) {
                etaText = 'Here';
            } else {
                const eta = getETAForStop(busId, originalStopId);
                const etaMinutes = Math.round(eta / 60);
                etaText = etaMinutes <= 0 ? '<1 min' : etaMinutes + ' min';
            }

            $('.rider-bus-info-stops').append(`
                <div class="rider-stop-circle-wrapper flex flex-col">
                    <div class="rider-stop-circle-line"></div>
                    <div class="rider-stop-circle"></div>
                    <div class="rider-stop-circle-line"></div>
                </div>
                <div class="rider-stop-name">${stopName}</div>
                <div class="rider-stop-eta right">${etaText}</div>
            `);
        });
    }

    popupBusId = busId;

    $('.rider-stop-info-wrapper, .rider-top-wrapper').hide();
    $('.rider-bus-info-wrapper').show();
}

riderRouteMapping = {
    'on1': 'Overnight 1',
    'on2': 'Overnight 2',
    'wknd1': 'Weekend 1',
    'wknd2': 'Weekend 2',
    'winter1': 'Winter 1',
    'winter2': 'Winter 2',
    'summer1': 'Summer 1',
    'summer2': 'Summer 2',
    'all': 'All',
}

function popRiderStopInfo(stopId) {

    // Remove concentric circle animation from any selected bus marker
    if (selectedMarkerId && busMarkers[selectedMarkerId]) {
        const riderMarker = $(busMarkers[selectedMarkerId].getElement()).find('.rider-marker');
        riderMarker.removeClass('rider-marker-selected');
        riderMarker.css('background-color', '');
    }
    
    // Get the stop name
    const stopName = stopsData[stopId].name;
    $('.rider-stop-info-name').text(stopName.toUpperCase());
    
    // Calculate distance from user to stop
    let distance = '';
    if (userPosition) {
        const distanceInMiles = haversine(
            userPosition[0], 
            userPosition[1], 
            stopsData[stopId].latitude, 
            stopsData[stopId].longitude
        );
        distance = distanceInMiles.toFixed(1) + ' miles';
    }
    $('.rider-stop-info-distance').text(distance);

    // Clear existing routes
    $('.rider-stop-info-routes').empty();
    
    // Get all routes that service this stop
    const routes = getRoutesServicingStop(stopId);
    
    // Create a map to store ETAs for each route
    const routeEtas = {};
    
    // Initialize empty arrays for each route
    routes.forEach(route => {
        routeEtas[route] = [];
    });
    
    // Get ETAs for all buses of all routes to this stop
    routes.forEach(route => {
        if (busesByRoutes[selectedCampus] && busesByRoutes[selectedCampus][route]) {
            busesByRoutes[selectedCampus][route].forEach(busId => {
                if (isValid(busId)) {
                    // Handle special case for stop #3 on certain routes
                    if ((route === 'wknd1' || route === 'all' || route === 'winter1' || route === 'on1' || route === 'summer1') && stopId === 3) {
                        // For stop #3 on these routes, we need to handle the special case
                        const viaMap = busETAs[busId] && busETAs[busId][3] && busETAs[busId][3]['via'];
                        if (viaMap && Object.keys(viaMap).length) {
                            Object.entries(viaMap).forEach(([prevIdStr, etaSecs]) => {
                                routeEtas[route].push(etaSecs);
                            });
                            return; // Skip the default entry since we added VIA entries above
                        }
                    }
                    
                    // Get ETA for this bus to this stop
                    const etaSecs = getETAForStop(busId, stopId);
                    if (etaSecs !== undefined && etaSecs > 0) {
                        routeEtas[route].push(etaSecs);
                    }
                }
            });
        }
    });
    
    // Add a row for each route
    routes.forEach(route => {
        // Get the route mapping value
        const routeMappingValue = routeMapping[route] || riderRouteMapping[route];
        
        // Sort ETAs and take up to 3 soonest
        routeEtas[route].sort((a, b) => a - b);
        const soonestEtas = routeEtas[route].slice(0, 3);
        
        // Format ETAs as "x min" strings
        const etaTexts = soonestEtas.map(eta => {
            const etaMinutes = Math.round(eta / 60);
            if (etaMinutes <= 0) {
                return '<1 min';
            } else {
                // Add leading zero for single digit minutes
                const formattedMinutes = etaMinutes < 10 ? `0${etaMinutes}` : etaMinutes;
                return `${formattedMinutes} min`;
            }
        });
        
        $('.rider-stop-info-routes').append(`
            <div class="rider-route-name bold-600 py-2rem px-1p5rem text-2p5rem" style="color: ${colorMappings[route]}; border-left: 5px solid ${colorMappings[route]}">${route.toUpperCase()}</div>
            <div class="rider-route-mapping">${routeMappingValue.toUpperCase()}</div>
            <div class="rider-route-eta flex flex-col justify-center" style="color:rgb(107, 107, 107);">
                ${etaTexts.length > 0 ? etaTexts.map(eta => `<div>${eta}</div>`).join('') : '<div>No buses</div>'}
            </div>
            <div class="rider-route-chevron pr-1rem pl-1rem"><i class="fas fa-chevron-right" style="color: #bebebe;"></i></div>
        `);
    });

    if (popupStopId) {
        // Change previously selected stop icon back to rider-stop-marker-white
        $(`img[stop-marker-id="${popupStopId}"]`).attr('src', 'img/rider/rider-stop-marker-white.png');
        $(`img[stop-marker-id="${popupStopId}"]`).attr('width', '15');
        $(`img[stop-marker-id="${popupStopId}"]`).attr('height', '15');
        busStopMarkers[popupStopId].setZIndexOffset(settings['toggle-stops-above-buses'] ? 1000 : 0);
    }

    popupStopId = stopId;
    
    // Change newly selected stop icon to rider-stops-icon and increase size
    $(`img[stop-marker-id="${stopId}"]`).attr('src', 'img/rider/rider-stops-icon-white.png');
    $(`img[stop-marker-id="${stopId}"]`).attr('width', '30');
    $(`img[stop-marker-id="${stopId}"]`).attr('height', '30');
    busStopMarkers[stopId].setZIndexOffset(2000);
    
    $('.rider-bus-info-wrapper, .rider-top-wrapper').hide();
    $('.rider-stop-info-wrapper').show();
}

document.addEventListener('rubus-map-created', function() {

    map.on('drag', function() {
        
        if (popupBusId) {
            const riderMarker = $(busMarkers[popupBusId].getElement()).find('.rider-marker');
            riderMarker.removeClass('rider-marker-selected');
        }

        $('.rider-bus-info-wrapper, .rider-stop-info-wrapper').fadeOut();
        if (appStyle === 'rider' && !currentViewedRoute) $('.rider-top-wrapper').show();
    });
    
    // Handle click on Map text to unselect bus
    $(document).on('click', '.rider-bus-info-top-map', function() {
        if (selectedMarkerId) {
            // Remove animation from selected marker
            const riderMarker = $(busMarkers[selectedMarkerId].getElement()).find('.rider-marker');
            riderMarker.removeClass('rider-marker-selected');
            
            // Reset selected marker
            selectedMarkerId = null;
            popupBusId = null;
            
            // Hide bus info and show top wrapper
            $('.rider-bus-info-wrapper').fadeOut();
            if (!currentViewedRoute) $('.rider-top-wrapper').show();
        }
    });

    $('.rider-top-routes').click(function() {
        // Only populate if not already initialized
        if (Object.keys(riderRouteToggles).length === 0) {
            populateRiderRoutes();
        }
        $('.rider-routes-wrapper').show();
        $('.rider-bus-info-wrapper, .rider-stop-info-wrapper').hide();
    });

    $('.rider-routes-header-done').click(function() {
        $('.rider-routes-wrapper').hide();
    });

});

// Generate HTML for a route in the rider routes grid
function generateRouteHTML(route) {
    return `
        <div class="rider-route-circle-cell flex align-center" style="border-left: 7px solid ${colorMappings[route]}">
            <div class="rider-route-circle ml-1rem mr-1p5rem flex justify-center align-center clickable" 
                 data-route="${route}" 
                 style="background-color: ${colorMappings[route]};">
                <i class="fa-regular fa-check text-1p1rem white" style="padding: 0.5rem;"></i>
            </div>
        </div>
        <div class="rider-route-name text-2rem py-1rem bold-300">${route.toUpperCase()}</div>
        <div class="rider-route-info pr-1rem flex">
            <i class="fa-light fa-circle-info text-2rem" style="color:rgb(123, 123, 123); align-self: center;"></i>
        </div>
    `;
}

// Initialize visibility of polylines and buses based on toggle states
function initializeRouteVisibility(route) {
    const isVisible = riderRouteToggles[route] !== false; // Default to visible if not set
    
    if (polylines[route]) {
        polylines[route].setStyle({ opacity: isVisible ? 1 : 0 });
    }
    
    // Set visibility for buses of this route
    Object.keys(busMarkers).forEach(busId => {
        if (busData[busId] && busData[busId].route === route) {
            busMarkers[busId].setOpacity(isVisible ? 1 : 0);
        }
    });
}

function populateRiderRoutes() {
    $('.rider-routes-grid').empty();
    activeRoutes.forEach(route => {
        // Initialize toggle state for this route (default to true)
        riderRouteToggles[route] = true;
        
        $('.rider-routes-grid').append(generateRouteHTML(route));
        
        // Initialize visibility for this route
        initializeRouteVisibility(route);
    });
    
    // Initialize the selected routes count
    updateSelectedRoutesCount();
}

// Update rider routes when activeRoutes changes
function updateRiderRoutes() {
    if (Object.keys(riderRouteToggles).length === 0) return;
    
    // Get current routes in the grid
    const currentRoutes = new Set();
    $('.rider-route-circle').each(function() {
        currentRoutes.add($(this).data('route'));
    });
    
    // Convert activeRoutes to Set for easier comparison
    const activeRoutesSet = new Set(activeRoutes);
    
    // Remove routes that are no longer active
    currentRoutes.forEach(route => {
        if (!activeRoutesSet.has(route)) {
            $(`.rider-route-circle[data-route="${route}"]`).parent().parent().remove();
        }
    });
    
    // Add new routes that became active
    activeRoutes.forEach(route => {
        if (!currentRoutes.has(route)) {
            // Initialize toggle state for new route (default to true)
            riderRouteToggles[route] = true;
            
            $('.rider-routes-grid').append(generateRouteHTML(route));
            
            // Initialize visibility for this route
            initializeRouteVisibility(route);
        }
    });
}

// Update the count of selected routes
function updateSelectedRoutesCount() {
    const selectedCount = Object.values(riderRouteToggles).filter(isSelected => isSelected === true).length;
    $('.rider-routes-selected-count').text(`${selectedCount} route${selectedCount !== 1 ? 's' : ''} selected`);
}

// Handle click on rider route cells for toggle functionality
$(document).on('click', '.rider-route-circle-cell', function() {
    const routeCircle = $(this).find('.rider-route-circle');
    const route = routeCircle.data('route');
    const checkIcon = routeCircle.find('i');
    
    if (riderRouteToggles[route]) {
        // Toggle off: change check color to gray, change background to gray, and change border to gray
        checkIcon.css('color', 'gray');
        routeCircle.css('background-color', 'gray');
        $(this).css('border-left-color', 'gray');
        riderRouteToggles[route] = false; // Mark as toggled off
        
        // Hide polylines and buses for this route
        if (polylines[route]) {
            polylines[route].setStyle({ opacity: 0 });
        }
        
        // Hide buses for this route
        Object.keys(busMarkers).forEach(busId => {
            if (busData[busId] && busData[busId].route === route) {
                busMarkers[busId].setOpacity(0);
            }
        });
    } else {
        // Toggle on: restore check color to white, restore route color, and restore border color
        checkIcon.css('color', 'white');
        routeCircle.css('background-color', colorMappings[route]);
        $(this).css('border-left-color', colorMappings[route]);
        riderRouteToggles[route] = true; // Mark as toggled on
        
        // Show polylines and buses for this route
        if (polylines[route]) {
            polylines[route].setStyle({ opacity: 1 });
        }
        
        // Show buses for this route
        Object.keys(busMarkers).forEach(busId => {
            if (busData[busId] && busData[busId].route === route) {
                busMarkers[busId].setOpacity(1);
            }
        });
    }
    
    // Update the selected routes count
    updateSelectedRoutesCount();
});

// Handle click on reset button to check all route circles
$(document).on('click', '.rider-routes-header-reset', function() {
    $('.rider-route-circle-cell').each(function() {
        const routeCircle = $(this).find('.rider-route-circle');
        const route = routeCircle.data('route');
        const checkIcon = routeCircle.find('i');
        
        // Restore check color to white, restore route color, and restore border color
        checkIcon.css('color', 'white');
        routeCircle.css('background-color', colorMappings[route]);
        $(this).css('border-left-color', colorMappings[route]);
        riderRouteToggles[route] = true; // Mark as toggled on
        
        // Show polylines and buses for this route
        if (polylines[route]) {
            polylines[route].setStyle({ opacity: 1 });
        }
        
        // Show buses for this route
        Object.keys(busMarkers).forEach(busId => {
            if (busData[busId] && busData[busId].route === route) {
                busMarkers[busId].setOpacity(1);
            }
        });
    });
    
    // Update the selected routes count
    updateSelectedRoutesCount();
});

// Handle click on route info icon to show only that route
$(document).on('click', '.rider-route-info', function() {
    const routeCircle = $(this).parent().find('.rider-route-circle');
    const route = routeCircle.data('route');
    
    // Store the currently viewed route
    currentViewedRoute = route;
    
    // Save the current map bounds before fitting to the route
    savedRouteViewBounds = {
        center: map.getCenter(),
        zoom: map.getZoom()
    };
    
    // Hide the routes menu
    $('.rider-routes-wrapper, .rider-top-wrapper').hide();
    
    // Hide all routes and buses first
    Object.keys(riderRouteToggles).forEach(r => {
        if (polylines[r]) {
            polylines[r].setStyle({ opacity: 0 });
        }
        
        // Hide buses for this route
        Object.keys(busMarkers).forEach(busId => {
            if (busData[busId] && busData[busId].route === r) {
                busMarkers[busId].setOpacity(0);
            }
        });
    });
    
    // Show only the selected route and its buses
    if (polylines[route]) {
        polylines[route].setStyle({ opacity: 1 });
        
        // Fit the map to the route's bounds with padding
        if (routeBounds[route]) {
            map.fitBounds(routeBounds[route], { padding: [10, 10] });
        }
    }
    
    Object.keys(busMarkers).forEach(busId => {
        if (busData[busId] && busData[busId].route === route) {
            busMarkers[busId].setOpacity(1);
        }
    });
    
    // Show the route info wrapper and set the route name
    $('.rider-route-info-top-route').text(route.toUpperCase());
    $('.rider-route-info-wrapper').show();
});

// Handle click on Map button in route info wrapper to restore previous view
$(document).on('click', '.rider-route-info-top-map', function() {
    // Hide the route info wrapper
    $('.rider-route-info-wrapper').hide();
    
    // Clear the currently viewed route
    currentViewedRoute = null;
    
    // Restore the saved map bounds if they exist
    if (savedRouteViewBounds) {
        map.setView(savedRouteViewBounds.center, savedRouteViewBounds.zoom);
        savedRouteViewBounds = null;
    }
    
    // Show all routes and buses based on their toggle states
    Object.keys(riderRouteToggles).forEach(route => {
        if (riderRouteToggles[route] === true) {
            // Show this route and its buses
            if (polylines[route]) {
                polylines[route].setStyle({ opacity: 1 });
            }
            
            Object.keys(busMarkers).forEach(busId => {
                if (busData[busId] && busData[busId].route === route) {
                    busMarkers[busId].setOpacity(1);
                }
            });
        }
    });

    $('.rider-top-wrapper').show();
});