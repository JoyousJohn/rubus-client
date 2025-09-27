function getRoutesServicingStop(stopId) {
    let routes = [];
    let routesArray = Array.from(activeRoutes).filter(route => routesByCampusBase[selectedCampus].includes(route));
    routesArray.forEach(route => {
        if (stopLists[route].includes(stopId)) {
            routes.push(route)
        }
    })
    return routes;
}

function getSoonestBus(stopId, route) {
    let lowestETA = Infinity;
    let lowestBusId;

    if (!busesByRoutes) {
        console.log ('busesByRoutes not defined');
        console.log(busesByRoutes);
        return [null, null];
    }

    try { // busesByRoutes[selectedCampus][route] disapears when negative/invalid ETA? have to check if this is why/when it is so

        busesByRoutes[selectedCampus][route].forEach(busId => {

            if (busETAs[busId] && isValid(busId)) {

                const eta = getETAForStop(busId, stopId);
                if (eta < lowestETA) {
                    lowestETA = eta;
                    lowestBusId = busId;
                }
            }
        })
    } catch (error) {
        console.log('error in getSoonestBus');
        console.log(error);
        console.log(route);
        console.log(stopId);
        console.log(busesByRoutes);
    }
    return [lowestBusId, lowestETA];
}

function populateAllStops() {
    if (typeof activeStops === 'undefined') {
        return;
    }

    $('.all-stops-inner').empty();
    for (campus in stopsByCampus[selectedCampus]) {
        const stops = stopsByCampus[selectedCampus][campus];
        let campusHasBuses = false;
        const $allStopsGridElm = $('<div class="all-stops-grid mb-2rem select-none"></div>')
        stops.forEach(stopId => {
            if (activeStops.includes(stopId)) {
                let servicingRoutes = getRoutesServicingStop(stopId);
                if (servicingRoutes.length > 0) {
                    campusHasBuses = true;
                }
                    const $stopsElm = $(`<div class="pointer incoming-wrapper">
                        <div class="text-1p3rem center mb-0p5rem">${stopsData[stopId].name}</div>
                        <div class="incoming-list grid gap-y-0p5rem align-center" style="grid-template-columns: auto 1fr;"></div>
                    </div>`)
                    .click(function() {
                        console.log('Stop clicked, closing info panels');
                        clearPanoutFeedback();
                        
                        flyToStop(stopId, true); // true indicates user interaction
                        $('.info-panels-show-hide-wrapper').hide();
                        $('.bottom').show();
                        $('.left-btns, .right-btns, .settings-btn').show();
                        moveRouteSelectorsToMain();
                        // Restore route selectors based on current stop selection
                        if (popupStopId) {
                            populateRouteSelectors(activeRoutes, popupStopId);
                        } else {
                            populateRouteSelectors(activeRoutes);
                        }
                        // Note: Not calling closeRouteMenu() here as this is switching to stop view
                    });
                $allStopsGridElm.append($stopsElm);
                servicingRoutes.forEach(route => {
                    let [busId, eta] = getSoonestBus(stopId, route);
                    
                    if (busData[busId]) {
                        if (eta >= 60) {
                            const minutes = Math.floor(eta / 60);
                            eta = `${minutes}m`;
                        } else {
                            eta = `${eta}s`;
                        }
                        const $routeChip = $(`<div class="white text-1p5rem bold-500 br-0p5rem w-auto center" style="background-color: ${colorMappings[busData[busId].route]}; padding: 0.2rem 1rem;">${busData[busId].route.toUpperCase()}</div>`)
                            .on('click', function(e) {
                                // Prevent the parent stop click from firing
                                e.stopPropagation();

                                clearPanoutFeedback();

                                // Match parent behavior: close panels and restore main UI
                                $('.info-panels-show-hide-wrapper').hide();
                                $('.bottom').show();
                                moveRouteSelectorsToMain();
                                $('.left-btns, .right-btns, .settings-btn').show();

                                // Set the route filter and then fly to the stop
                                toggleRoute(route);
                                flyToStop(stopId, true);
                            });
                        $stopsElm.find('.incoming-list').append($routeChip);
                        $stopsElm.find('.incoming-list').append(`<div class="text-1p6rem bold right">${eta}</div>`);
                    }
                })
            }
        })
        if (campusHasBuses) {
            const $campusElm = $(`<div class="campus text-1p7rem ml-0p5rem">${campus}</div>`)
            $('.all-stops-inner').append($campusElm);
            $('.all-stops-inner').append($allStopsGridElm);
        }
    }
}


$('.info-panels').click(function() {
    const $btn = $(this);
    
    // Clear any existing timeout and restore state
    if ($btn.data('feedback-timeout')) {
        clearTimeout($btn.data('feedback-timeout'));
        $btn.removeClass('btn-feedback-active');
    }
    
    // Apply feedback state and set timeout
    $btn.addClass('btn-feedback-active');
    
    const timeoutId = setTimeout(() => {
        $btn.removeClass('btn-feedback-active');
        $btn.removeData('feedback-timeout');
    }, 200);
    
    $btn.data('feedback-timeout', timeoutId);
    
    // Hide search wrapper and unfocus search input if it's open
    if ($('.search-wrapper').is(':visible')) {
        closeSearch();
        // $('.search-wrapper input').blur();
    }

    // Store the original route selection from state before opening panels
    originalShownRoute = shownRoute || null;
    console.log('Storing originalShownRoute for restoration (entry):', originalShownRoute);

    $('.info-panels-show-hide-wrapper').show().scrollTop(0);

    // Populate the network panel first to avoid layout shifts affecting positioning
    busesOverview();

    // Don't force a specific panel - let the system remember the last selected panel
    // The panel state is already preserved in currentPanelIndex and header button styling
    // Restore the panel position to match the remembered state
    restorePanelPosition();

    // Populate all stops after positioning is set
    populateAllStops();

    // Move route selectors into the route subpanel
    moveRouteSelectorsToSubpanel();
    
    // Show all route selectors in subpanel (not filtered by stop selection)
    populateRouteSelectors(activeRoutes);
    
    // Select any previously selected route after selectors are populated
    if (shownRoute) {
        toggleRouteSelectors(shownRoute);
        // Hide the route selection prompt since a route is selected
        $('#route-selection-prompt').hide();
    } else {
        // Show the route selection prompt since no route is selected
        $('#route-selection-prompt').show();
    }

    // Show and position route selectors immediately when info panels are opened
    $('.bottom').show();
    $('.left-btns, .right-btns').hide();
    $('.route-selectors').show();
    $('.settings-btn').hide();
})
