let favBuses = [];
try {
    favBuses = JSON.parse(localStorage.getItem('favs')) || [];
    if (!Array.isArray(favBuses)) throw new Error('stored favs is not an array');
} catch (e) {
    console.error('[fav] corrupted "favs" in localStorage, starting empty', e);
    favBuses = [];
    localStorage.removeItem('favs');
}

$('.bus-star').click(function() {
    const currentBusName = popupBusName; // don't know why I need to parse sometimes

    if (!favBuses.includes(currentBusName)) {

        console.log('hmm')

        favBuses.push(currentBusName); 
        $(this).find('i').css('color', 'gold').removeClass('icon-star').addClass('icon-star-solid')
        const $thisFav = $(`<div class="br-1rem" data-fav-name="${currentBusName}"><span class="bold text-1p7rem" style="color: ${colorMappings[busData[currentBusName].route]}">${busData[currentBusName].route.toUpperCase()}</span>${busData[currentBusName].busName}</div>`)
        $thisFav.click(function() {
            if (busData[currentBusName]) {
                const favRoute = busData[currentBusName].route;
                if (shownRoute && shownRoute !== favRoute) {
                    toggleRoute(favRoute);
                }
                flyToBus(currentBusName);
            }
        })
        $('.favs').append($thisFav)

        busMarkers[currentBusName].setFavorite(true);

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

        favBuses = favBuses.filter(busName => busName !== currentBusName);
        $(this).find('i').css('color', 'var(--theme-color)').removeClass('icon-star-solid').addClass('icon-star')
        $(`div[data-fav-name="${currentBusName}"]`).remove();
        busMarkers[currentBusName].setFavorite(false);
    
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
        favBuses.forEach(favName => {
            if (busData[favName]) {
                // Only include favorites from the current campus
                const favRoute = busData[favName].route;
                const favCampus = routesByCampus[favRoute];
                if (favCampus === selectedCampus) {
                    favRoutes.add(favRoute);
                }
            }
        });

        console.log('1')
        console.log(favRoutes)

        if (shownRoute && shownRoute === 'fav') {
            busMarkers[currentBusName].setVisibility(false);
            
            hideInfoBoxes();
            
            // Show only the remaining favorited buses and their polylines
            const visibleBounds = L.latLngBounds();
            
            for (const polyline in polylines) {
                if (!favRoutes.has(polyline)) {
                    polylines[polyline].setStyle({ opacity: 0});
                } else {
                    if (!map.hasLayer(polylines[polyline])) {
                        polylines[polyline].addTo(map);
                    }
                    polylines[polyline].setStyle({ opacity: 1 });
                    visibleBounds.extend(polylines[polyline].getBounds());
                }
            }
            for (const marker in busMarkers) {
                const busName = marker;
                const isFav = favBuses.includes(busName);
                const isCurrentCampus = routesByCampus[busData[busName].route] === selectedCampus;
                
                if (!isFav || !isCurrentCampus) {
                    busMarkers[marker].setVisibility(false);
                } else {
                    busMarkers[marker].setVisibility(true);
                }
            }
            
            clearAllStopEtas();
            
            // Fit map bounds to show remaining favorite polylines
            if (visibleBounds.isValid()) {
                map.fitBounds(visibleBounds);
            } else {
                // No favorite routes left, show campus bounds
                map.fitBounds(bounds[selectedCampus]);
            }
            
            // Hide stops except those belonging to remaining favorite routes
            const keepStops = new Set();
            for (const route of favRoutes) {
                const routeStops = stopLists[route];
                if (!routeStops) {
                    console.warn(`[fav] Route ${route} missing from stopLists — cannot keep its stops`);
                    continue;
                }
                for (const stopId of routeStops) {
                    keepStops.add(Number(stopId));
                }
            }
            for (const stopId in busStopMarkers) {
                if (!keepStops.has(Number(stopId))) {
                    busStopMarkers[stopId].remove();
                }
            }
        }

        if (favRoutes.size === 0) {
            showAllPolylines();
            showAllBuses();
    
            for (const stopId in busStopMarkers) {
                busStopMarkers[stopId].addTo(map);
            }

            map.fitBounds(polylineBounds);
            $('.favs').show();
            $('.bus-info-popup').hide();
            const rotationElement = getMarkerRotationElement(busMarkers[popupBusName]);
            if (rotationElement) {
                rotationElement.style.boxShadow = '';
            }
            popupBusName = null;
            showAllPolylines();
            clearAllStopEtas();            
        }
    }

    localStorage.setItem('favs', JSON.stringify(favBuses))
})

async function populateFavs(popSelectors = true) {

    $('.favs').empty();

    favBuses.forEach(favName => {
        if (busData[favName]) { // RACE CONDITION SOMEWHERE!!!
            
            // Only show favorites that belong to the current campus
            const favRoute = busData[favName].route;
            const favCampus = routesByCampus[favRoute];
            if (favCampus !== selectedCampus) {
                return; // Skip this favorite as it doesn't belong to current campus
            }

            // console.log(`${favName} in `)
            // console.log(busData[favName])
            // console.log(busMarkers[favName])

            const $thisFav = $(`<div class="br-1rem" data-fav-name="${favName}"><span class="bold text-1p7rem" style="color: ${colorMappings[busData[favName].route]}">${busData[favName].route.toUpperCase()}</span>${busData[favName].busName}</div>`)
            $thisFav.click(function() {
                if (busData[favName]) {
                    const favRoute = busData[favName].route;
                    if (shownRoute && shownRoute !== favRoute) {
                        toggleRoute(favRoute);
                    }
                    flyToBus(favName);
                }
            })
            $('.favs').append($thisFav)

            setTimeout(() => {

                // console.log(Object.keys(busMarkers))
                // console.log(favName.toString())

                // The marker may have been removed since this was scheduled
                // (a poll could take the bus out of service in between).
                if (busMarkers[favName.toString()]) {
                    busMarkers[favName.toString()].setFavorite(true);
                }
            }, 0);

        }
    })

    if ($('.favs > div').length && popSelectors) {
        populateRouteSelectors(activeRoutes);
    }

}

let favsShown = false;

function toggleFavorites() {

    console.log(shownRoute)

    if (shownRoute === 'fav') {

        hideInfoBoxes(); // or just hide the bus info box and set popupBusName to undefined

        let favRoutes = new Set([]);
        favBuses.forEach(busName => {
            if (busData[busName]) {
                // Only include favorites from the current campus
                const favRoute = busData[busName].route;
                const favCampus = routesByCampus[favRoute];
                if (favCampus === selectedCampus) {
                    favRoutes.add(favRoute);
                }
            }
        });

        console.log(favRoutes)

        const visibleBounds = L.latLngBounds();

        for (const polyline in polylines) {
            if (!favRoutes.has(polyline)) {
                polylines[polyline].setStyle({ opacity: 0});
            } else {
                if (!map.hasLayer(polylines[polyline])) {
                    polylines[polyline].setStyle({ opacity: 1 });
                }
                visibleBounds.extend(polylines[polyline].getBounds());
            }
        }
        for (const marker in busMarkers) {
            const busName = marker;
            const isFav = favBuses.includes(busName);
            const isCurrentCampus = routesByCampus[busData[busName].route] === selectedCampus; // don't think we need busData[busName] && 
            
            if (!isFav || !isCurrentCampus) {
                busMarkers[marker].setVisibility(false);
            } else {
                busMarkers[marker].setVisibility(true);
            }
        }

        hideStopsExcept(Array.from(favRoutes));

        if (visibleBounds.isValid()) {
            console.log('has bound');
            map.fitBounds(visibleBounds);
        } else { // last fav bus was removed
            map.fitBounds(bounds[selectedCampus]);
        }
        
        $('.bus-info-popup, .stop-info-popup').hide();
        if (selectedMarkerId) {
            const rotationElement = getMarkerRotationElement(busMarkers[selectedMarkerId]);
            if (rotationElement) {
                rotationElement.style.boxShadow = '';
            }
        }

    } else {
        for (const polyline in polylines) {
            polylines[polyline].setStyle({ opacity: 1 });
        }
        for (const stopId in busStopMarkers) {
            busStopMarkers[stopId].addTo(map);
        }
        for (const marker in busMarkers) {
            busMarkers[marker].setVisibility(true);
        }
    }

    function hideStopsExcept(excludedRoutes) {
        const keepStops = new Set();
        for (const route of excludedRoutes) {
            const routeStops = stopLists[route];
            if (!routeStops) {
                console.warn(`[fav] Route ${route} missing from stopLists — cannot keep its stops`);
                continue;
            }
            for (const stopId of routeStops) {
                keepStops.add(Number(stopId));
            }
        }
        for (const stopId in busStopMarkers) {
            if (!keepStops.has(Number(stopId))) {
                busStopMarkers[stopId].remove();
            }
        }
    }

    favsShown = !favsShown;
}

