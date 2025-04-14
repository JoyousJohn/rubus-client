let favBuses = JSON.parse(localStorage.getItem('favs')) || [];

$('.bus-star').click(function() {
    const currentBusId = popupBusId;

    if (!favBuses.includes(currentBusId)) {
        favBuses.push(currentBusId);
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
        favBuses = favBuses.filter(busId => busId !== currentBusId);
        $(this).find('i').css('color', 'var(--theme-color)').removeClass('fa-solid').addClass('fa-regular')
        $(`div[data-fav-id="${currentBusId}"]`).remove();
        busMarkers[currentBusId].getElement().querySelector('.bus-icon-inner').style.backgroundColor = 'white';
    
        if ($('.favs > div').length === 0) {
            if (shownRoute) {
                const previousShownRoute = JSON.parse(JSON.stringify(shownRoute));
                populateRouteSelectors(activeRoutes);
                shownRoute = null;
                toggleRouteSelectors(previousShownRoute);
            } else {
                populateRouteSelectors(activeRoutes);
            }
        } else {
            favsShown = false;
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

            busMarkers[favId].getElement().querySelector('.bus-icon-inner').style.backgroundColor = 'gold';

        }
    })

    if ($('.favs > div').length) {
        populateRouteSelectors(activeRoutes);
    }

}

let favsShown = false;

function toggleFavorites() {
    if (!favsShown) {
        let favRoutes = new Set([]);
        favBuses.forEach(busId => {
            if (busData[busId]) {
                favRoutes.add(busData[busId].route);
            }
        });

        const visibleBounds = L.latLngBounds();

        for (const polyline in polylines) {
            if (!favRoutes.has(polyline)) {
                polylines[polyline].remove();
            } else {
                visibleBounds.extend(polylines[polyline].getBounds());
            }
        }
        for (const marker in busMarkers) {
            if (!favBuses.includes(parseInt(marker))) {
                busMarkers[marker].getElement().style.display = 'none';
            }
        }

        hideStopsExcept(Array.from(favRoutes));

        map.fitBounds(visibleBounds);
        $('.bus-info-popup, .stop-info-popup').hide();
        if (selectedMarkerId) {
            busMarkers[selectedMarkerId].getElement().querySelector('.bus-icon-outer').style.boxShadow = '';
        }

    } else {
        for (const polyline in polylines) {
            polylines[polyline].addTo(map);
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

