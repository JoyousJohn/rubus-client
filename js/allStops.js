function getRoutesServicingStop(stopId) {
    let routes = [];
    activeRoutes.forEach(route => {
        if (stopLists[route].includes(stopId)) {
            routes.push(route)
        }
    })
    return routes;
}

function getSoonestBus(stopId, route) {
    let lowestETA = Infinity;
    let lowestBusId;

    busesByRoutes[route].forEach(busId => {
        if (busETAs[busId]) {
            const eta = busETAs[busId][stopId]
            if (eta < lowestETA) {
                lowestETA = eta;
                lowestBusId = busId;
            }
        }
    })
    return [lowestBusId, lowestETA]
}

function populateAllStops() {

    $('.all-stops-inner').empty();

    for (campus in stopsByCampus) {

        const stops = stopsByCampus[campus];

        let campusHasBuses = false;

        const $allStopsGridElm = $('<div class="all-stops-grid mb-2rem"></div>')

        stops.forEach(stopId => {
            if (activeStops.includes(stopId)) {

                campusHasBuses = true;

                const $stopsElm = $(`<div>
                    <div class="text-1p3rem center mb-0p5rem">${stopsData[stopId].name}</div>
                    <div class="incoming-list grid gap-y-0p5rem align-center" style="grid-template-columns: auto 1fr;"></div>
                </div>`);

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

                        console.log(busData)
                        console.log(busId)
                        $stopsElm.find('.incoming-list').append(`
                                <div class="white text-1p5rem bold-500 br-0p5rem w-auto center" style="background-color: ${colorMappings[busData[busId].route]}; padding: 0.2rem 1rem;">${busData[busId].route.toUpperCase()}</div>
                            `)
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
    $('.all-stops-wrapper').show().scrollTop(0);
    $('.bottom').hide();
})

$('.all-stops-close').click(function() {
    $('.all-stops-wrapper').hide();
    $('.bottom').show();
})