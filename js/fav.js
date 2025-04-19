let favBuses = JSON.parse(localStorage.getItem('favs')) || [];

$('.bus-star').click(function() {
    const currentBusId = parseInt(popupBusId); // don't know why I need to parse sometimes

    if (!favBuses.includes(currentBusId)) {

        console.log('hmm')

        favBuses.push(parseInt(currentBusId)); 
        $(this).find('i').css('color', 'gold').removeClass('fa-regular').addClass('fa-solid')
        const $thisFav = $(`<div class="br-1rem" data-fav-id="${currentBusId}"><span class="bold text-1p7rem" style="color: ${colorMappings[busData[currentBusId].route]}">${busData[currentBusId].route.toUpperCase()}</span>${busData[currentBusId].busName}</div>`)
        $thisFav.click(function() {
            if (busData[currentBusId]) {
                const favRoute = busData[currentBusId].route;
                if (shownRoute && shownRoute !== favRoute) {
                    toggleRoute(favRoute);
                }
                flyToBus(currentBusId);
            }
        })
        $('.favs').append($thisFav)

        busMarkers[currentBusId].getElement().querySelector('.bus-icon-inner').style.backgroundColor = 'gold';

        if (shownRoute) {
            const previousShownRoute = JSON.parse(JSON.stringify(shownRoute));
            populateRouteSelectors(activeRoutes);
            shownRoute = null;
            toggleRouteSelectors(previousShownRoute);
        } else {
            populateRouteSelectors(activeRoutes);
        }


    } else {

        console.log('hmm2')

        favBuses = favBuses.filter(busId => busId !== currentBusId);
        $(this).find('i').css('color', 'var(--theme-color)').removeClass('fa-solid').addClass('fa-regular')
        $(`div[data-fav-id="${currentBusId}"]`).remove();
        busMarkers[currentBusId].getElement().querySelector('.bus-icon-inner').style.backgroundColor = 'var(--theme-bus-icon-inner)';
    
        if ($('.favs > div').length === 0) {
            if (shownRoute) {
                const previousShownRoute = JSON.parse(JSON.stringify(shownRoute));
                populateRouteSelectors(activeRoutes);
                shownRoute = null;
                console.log(previousShownRoute)
                // toggleRouteSelectors(previousShownRoute);
            } else {
                populateRouteSelectors(activeRoutes);
                showAllPolylines();
            }
        } else {
            favsShown = false;
        }

        let favRoutes = new Set([]);
        favBuses.forEach(favId => {
            if (busData[favId]) {
                favRoutes.add(busData[favId].route);
            }
        });

        console.log('1')
        console.log(favRoutes)

        if (shownRoute && shownRoute === 'fav') {
            busMarkers[currentBusId].getElement().style.display = 'none';
            $('.bus-info-popup').hide();
            popupBusId = null;
            if (!favRoutes.has(busData[currentBusId].route)) {
                polylines[busData[currentBusId].route].setStyle({ opacity: 0 });
            }
        }

        if (favRoutes.size === 0) {
            for (const polyline in polylines) {
                if (!map.hasLayer(polylines[polyline])) { // needed?
                    polylines[polyline].setStyle({ opacity: 1 });
                }
            }  
            for (const marker in busMarkers) {
                busMarkers[marker].getElement().style.display = '';
            }
    
            for (const stopId in busStopMarkers) {
                busStopMarkers[stopId].addTo(map);
            }

            map.fitBounds(polylineBounds);
            $('.favs').show();
            $('.bus-info-popup').hide();
            busMarkers[popupBusId].getElement().querySelector('.bus-icon-outer').style.boxShadow = '';
            popupBusId = null;
            showAllPolylines();
            $('[stop-eta]').hide();            
        }
    }

    localStorage.setItem('favs', JSON.stringify(favBuses))
})

function populateFavs() {

    $('.favs').empty();

    favBuses.forEach(favId => {
        if (busData[favId]) {
            const $thisFav = $(`<div class="br-1rem" data-fav-id="${favId}"><span class="bold text-1p7rem" style="color: ${colorMappings[busData[favId].route]}">${busData[favId].route.toUpperCase()}</span>${busData[favId].busName}</div>`)
            $thisFav.click(function() {
                if (busData[favId]) {
                    const favRoute = busData[favId].route;
                    if (shownRoute && shownRoute !== favRoute) {
                        toggleRoute(favRoute);
                    }
                    flyToBus(favId);
                }
            })
            $('.favs').append($thisFav)

            setTimeout(() => {
                busMarkers[favId].getElement().querySelector('.bus-icon-inner').style.backgroundColor = 'gold';
            }, 0);

        }
    })

    if ($('.favs > div').length) {
        populateRouteSelectors(activeRoutes);
    }

}

let favsShown = false;

function toggleFavorites() {

    console.log(shownRoute)

    if (shownRoute === 'fav') {

        hideInfoBoxes(); // or just hide the bus info box and set popupBusId to undefined

        let favRoutes = new Set([]);
        favBuses.forEach(busId => {
            if (busData[busId]) {
                favRoutes.add(busData[busId].route);
            }
        });

        console.log(favRoutes)

        const visibleBounds = L.latLngBounds();

        for (const polyline in polylines) {
            if (!favRoutes.has(polyline)) {
                polylines[polyline].remove();
            } else {
                if (!map.hasLayer(polylines[polyline])) {
                    polylines[polyline].setStyle({ opacity: 1 });
                }
                visibleBounds.extend(polylines[polyline].getBounds());
            }
        }
        for (const marker in busMarkers) {
            if (!favBuses.includes(parseInt(marker))) {
                busMarkers[marker].getElement().style.display = 'none';
            } else {
                busMarkers[marker].getElement().style.display = '';
            }
        }

        hideStopsExcept(Array.from(favRoutes));

        if (visibleBounds.isValid()) {
            console.log('has bound');
            map.fitBounds(visibleBounds);
        } else { // last fav bus was removed
            console.log('no buses left')
            console.log(bounds)
            map.fitBounds(bounds);
            
        }
        
        $('.bus-info-popup, .stop-info-popup').hide();
        if (selectedMarkerId) {
            busMarkers[selectedMarkerId].getElement().querySelector('.bus-icon-outer').style.boxShadow = '';
        }

    } else {
        for (const polyline in polylines) {
            polylines[polyline].setStyle({ opacity: 1 });
        }
        for (const stopId in busStopMarkers) {
            busStopMarkers[stopId].addTo(map);
        }
        for (const marker in busMarkers) {
            busMarkers[marker].getElement().style.display = '';
        }
    }

    function hideStopsExcept(excludedRoutes) {
        const stopIdsForExcludedRoutes = excludedRoutes.flatMap(route => stopLists[route] || []);
        for (const polyline in polylines) {
            const stopIdsForRoute = stopLists[polyline];
            stopIdsForRoute.forEach(stopId => {
                if (!stopIdsForExcludedRoutes.includes(stopId)) {
                    busStopMarkers[stopId].remove();
                }
            });
        }    
    }

    favsShown = !favsShown;
}

