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

    $('.all-stops-inner').empty();

    for (campus in stopsByCampus[selectedCampus]) {

        const stops = stopsByCampus[selectedCampus][campus];

        let campusHasBuses = false;

        const $allStopsGridElm = $('<div class="all-stops-grid mb-2rem"></div>')

        stops.forEach(stopId => {
            if (activeStops.includes(stopId)) {

                campusHasBuses = true;

                const $stopsElm = $(`<div class="pointer incoming-wrapper">
                    <div class="text-1p3rem center mb-0p5rem">${stopsData[stopId].name}</div>
                    <div class="incoming-list grid gap-y-0p5rem align-center" style="grid-template-columns: auto 1fr;"></div>
                </div>`)
                .click(function() {
                    flyToStop(stopId);
                    $('.info-panels-wrapper').hide();
                    $('.bottom').show();
                    $('.left-btns, .right-btns, .settings-btn').show();
                });

                $allStopsGridElm.append($stopsElm);

                const servicingRoutes = getRoutesServicingStop(stopId);

                servicingRoutes.forEach(route => {

                    [busId, eta] = getSoonestBus(stopId, route);

                    if (busData[busId]) {

                        if (eta >= 60) {
                            const minutes = Math.floor(eta / 60);
                            if (settings['toggle-show-etas-in-seconds']) {
                                const seconds = eta % 60;
                                eta = `${minutes}m ${seconds}s`;
                            } else {
                                eta = `${minutes}m`;
                            }
                            
                        } else {
                            eta = `${eta}s`;
                        }
                    
                        //                            <div class="text-1p4rem">${busData[busId].busName}</div>
                        $stopsElm.find('.incoming-list').append(
                            $(`<div class="white text-1p5rem bold-500 br-0p5rem w-auto center" style="background-color: ${colorMappings[busData[busId].route]}; padding: 0.2rem 1rem;">${busData[busId].route.toUpperCase()}</div>`)
                            .click(function() {
                                flyToStop(stopId);
                                toggleRoute(route);
                                $('.info-panels-wrapper').hide();
                                $('.bottom').show();
                            })
                        )
                        $stopsElm.find('.incoming-list').append(`<div class="text-1p6rem bold right">${eta}</div>`)
                    
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


$('.all-stops').click(function() {
    populateAllStops();
    $('.info-panels-wrapper').show().scrollTop(0);
    // Find the routes tab element and pass it to selectInfoPanel
    const routesTab = $('.info-panels-wrapper [data-panel="routes"]')[0];
    selectInfoPanel('routes', routesTab);
})
