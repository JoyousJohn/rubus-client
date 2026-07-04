let favBuses = JSON.parse(localStorage.getItem('favs')) || [];

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

        busMarkers[currentBusName].getElement().querySelector('.bus-icon-inner').style.backgroundColor = 'gold';

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
        busMarkers[currentBusName].getElement().querySelector('.bus-icon-inner').style.backgroundColor = 'var(--theme-bus-icon-inner)';
    
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
            busMarkers[currentBusName].getElement().style.display = 'none';
            
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
                    busMarkers[marker].getElement().style.display = 'none';
                } else {
                    busMarkers[marker].getElement().style.display = '';
                }
            }
            
            $('[stop-eta]').text('').hide();
            
            // Fit map bounds to show remaining favorite polylines
            if (visibleBounds.isValid()) {
                map.fitBounds(visibleBounds);
            } else {
                // No favorite routes left, show campus bounds
                map.fitBounds(bounds[selectedCampus]);
            }
            
            // Hide stops except those belonging to remaining favorite routes
            const stopIdsForExcludedRoutes = Array.from(favRoutes).flatMap(route => stopLists[route] || []);
            for (const polyline in polylines) {
                const stopIdsForRoute = stopLists[polyline];
                stopIdsForRoute.forEach(stopId => {
                    if (!stopIdsForExcludedRoutes.includes(stopId)) {
                        busStopMarkers[stopId].remove();
                    }
                });
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
            $('[stop-eta]').hide();            
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

                busMarkers[favName.toString()].getElement().querySelector('.bus-icon-inner').style.backgroundColor = 'gold';
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

