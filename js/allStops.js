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
        const $allStopsGridElm = $('<div class="all-stops-grid mb-2rem"></div>')
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
                        flyToStop(stopId);
                        $('.info-panels-show-hide-wrapper').hide();
                        $('.bottom').show();
                        $('.left-btns, .right-btns, .settings-btn').show();
                        moveRouteSelectorsToMain();
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
                        $stopsElm.find('.incoming-list').append(
                            $(`<div class="white text-1p5rem bold-500 br-0p5rem w-auto center" style="background-color: ${colorMappings[busData[busId].route]}; padding: 0.2rem 1rem;">${busData[busId].route.toUpperCase()}</div>`)
                        );
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

    // Show and position route selectors immediately when info panels are opened
    $('.bottom').show();
    $('.left-btns, .right-btns').hide();
    $('.route-selectors').show();
    $('.settings-btn').hide();
})
