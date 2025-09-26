let longPressTimer

let selectedCampusRoutes = [];

function populateRouteSelectors(allActiveRoutes) {
    $('.route-selectors > div').not('.settings-btn, .sim-btn').remove();

    if (!allActiveRoutes) return;

    let allRoutesArray;

    try {
        allRoutesArray = Array.from(activeRoutes);
    } catch (error) {
        console.error('Error converting activeRoutes to array:', error);
        console.log(allRoutesArray);
        console.log(typeof allRoutesArray);
    }

    let routesArray = allRoutesArray.filter(route => routesByCampusBase[selectedCampus].includes(route));

    routesArray = routesArray.map(route => route || 'undefined');
    routesArray.sort((a, b) => {
        if (a === 'undefined') return 1;
        if (b === 'undefined') return -1;
        return a.localeCompare(b);
    });
    
	if (routesArray.includes('on2')) {
		routesArray = routesArray.filter(route => route !== 'on2');
		routesArray.unshift('on2');
	}
	if (routesArray.includes('on1')) {
		routesArray = routesArray.filter(route => route !== 'on1');
		routesArray.unshift('on1');
	}

    if (routesArray.includes('wknd2')) {
        routesArray = routesArray.filter(route => route !== 'wknd2');
        routesArray.unshift('wknd2');
    }
    if (routesArray.includes('wknd1')) {
        routesArray = routesArray.filter(route => route !== 'wknd1');
        routesArray.unshift('wknd1');
    }

    if ($('.favs > div').length) {
        routesArray.unshift('fav');
    }

    if (routesArray.includes('ftbl')) {
        routesArray = routesArray.filter(route => route !== 'ftbl');
        routesArray.push('ftbl');
    }

    routesArray.forEach(route => {

        let routeFormatted = route;
        if (route == 'bl') {
            routeFormatted = 'b/l';
        }

        let $routeElm;

        if (route === 'fav') {
            $routeElm = $(`<div class="route-selector flex justify-center align-center" routeName="${route}" style="padding: 0.5rem; aspect-ratio: 1;"><i class="fa-solid fa-star"></i></div>`).css('background-color', 'gold')
        } else {
            $routeElm = $(`<div class="route-selector" routeName="${route}">${routeFormatted.toUpperCase()}</div>`)  
        }

        let color = 'darkgray'

        if (route === 'fav') {
            color = 'gold'; // Keep fav route selector gold
            
            // Bind minimal handler for favorites selector using existing logic
            $routeElm.on('click touchend', function(event) {
                event.preventDefault();
                if (!panelRoute) {
                    toggleRouteSelectors('fav');
                    toggleFavorites();
                }
            });
        } else if (knownRoutes.includes(route)) {
            color = colorMappings[route]

            let initialX; // Declare initialX outside to access it later

            $routeElm.on('touchstart mousedown', function(event) {
                event.preventDefault();

                initialX = event.pageX || (event.originalEvent && event.originalEvent.touches && event.originalEvent.touches[0] ? event.originalEvent.touches[0].pageX : 0); // Store initial position
              
                longPressTimer = setTimeout(() => {

                    isLongPress = true;
                    console.log('Long press triggered for route:', route);
                    // Remember current map selection state so we can restore it on close
                    routePanelOpenedFromLongPress = true;
                    // Note: originalShownRoute is now stored in selectedRoute function when first opening panel
                    if (shownRoute) {
                        shownBeforeRoute = shownRoute;
                        console.log('Storing shownBeforeRoute:', shownBeforeRoute);
                    }

                    if (panelRoute !== route && route !== 'fav') {
                        console.log('Calling selectedRoute from long press while in subpanel');
                        selectedRoute(route);
                    }

                }, 500); 
            });

            $routeElm.on('touchmove', function(event) {
        
                const moved = Math.abs(initialX - (event.changedTouches && event.changedTouches[0] ? event.changedTouches[0].clientX : 0)) > 10;
                if (!moved) { return; }

                clearTimeout(longPressTimer);
            })

            $routeElm.on('touchend touchcancel mouseup', function() {
                clearTimeout(longPressTimer);
            });

            $routeElm.on('click touchend', function(event) {

                const moved = Math.abs(initialX - (event.originalEvent.clientX || (event.changedTouches && event.changedTouches[0] ? event.changedTouches[0].clientX : 0))) > 10;

                if (!isLongPress && !moved) {
                    // Check if we're in the Routes tab of info panels
                    const routesTabActive = $('.info-panels-show-hide-wrapper').is(':visible') && $('.route-panel-wrapper').is(':visible');

                    if ((panelRoute || routesTabActive) && route !== 'fav') {
                        selectedRoute(route)
                    } else if (route !== 'fav') {
                        toggleRoute(route);
                    } else if (!panelRoute && route === 'fav') {
                        toggleRouteSelectors('fav');
                        toggleFavorites();
                    }

                }
                isLongPress = false;
            })
        }
        $routeElm.css('background-color', color);
        
        // Check if settings button should be at the end
        if (settings['toggle-settings-btn-end']) {
            $('.settings-btn').before($routeElm);
        } else {
            $('.settings-btn').after($routeElm);
        }
        
        // Convert icons after adding to DOM
        if (route === 'fav') {
            replaceFontAwesomeIcons();
        }
    });

    $('.route-selectors').scrollLeft(0);

    let isDragging = false;
    let startX, scrollLeft;
    let velocity = 0;
    let lastX = 0;
    let lastTime = 0;
    let animationFrame = null;

    $('.route-selectors')
    .on('mousedown touchstart', function(e) {
        isDragging = true;
        startX = e.pageX || (e.originalEvent && e.originalEvent.touches && e.originalEvent.touches[0] ? e.originalEvent.touches[0].pageX : 0);
        scrollLeft = $(this).scrollLeft();
        lastX = startX;
        lastTime = Date.now();
        velocity = 0;
        
        if (animationFrame) {
            cancelAnimationFrame(animationFrame);
            animationFrame = null;
        }
        
        e.preventDefault();
    })
    .on('mouseleave mouseup touchend', function() {
        if (!isDragging) return;
        isDragging = false;
        
        const currentTime = Date.now();
        const timeDiff = currentTime - lastTime;
        if (timeDiff > 0) {
            // Apply inertia only if the last movement wasn't too long ago
            if (timeDiff < 50) {
                const container = $(this);
                const startVelocity = velocity;
                const startTime = currentTime;

                const distanceMoved = Math.abs(scrollLeft - $(this).scrollLeft());
                // Inverse relationship for deceleration
                const deceleration = Math.max(0.1, 1 - (distanceMoved / 500));

                function animate() {
                    const now = Date.now();
                    const elapsed = now - startTime;
                    
                    const currentVelocity = startVelocity * Math.pow(deceleration, elapsed / 16);
                    
                    // Stop animation when velocity is very low
                    if (Math.abs(currentVelocity) < 0.1) {
                        cancelAnimationFrame(animationFrame);
                        animationFrame = null;
                        return;
                    }
                    
                    container.scrollLeft(container.scrollLeft() - currentVelocity);
                    animationFrame = requestAnimationFrame(animate);
                }
                
                animate();
            }
        }
    })
    .on('mousemove touchmove', function(e) {
        if (!isDragging) return;
        
        const x = e.pageX || (e.originalEvent && e.originalEvent.touches && e.originalEvent.touches[0] ? e.originalEvent.touches[0].pageX : 0);
        const walk = x - startX; // Calculate the distance moved
        const currentTime = Date.now();
        
        // Calculate velocity (pixels per millisecond)
        const timeDiff = currentTime - lastTime;
        if (timeDiff > 0) {  // Avoid division by zero
            const distance = x - lastX;
            velocity = distance / timeDiff * 16; // Convert to pixels per frame (assuming 60fps)
        }
        
        $(this).scrollLeft(scrollLeft - walk);
        
        // Update last position and time
        lastX = x;
        lastTime = currentTime;
        
        e.preventDefault();
    })
    .on('wheel', function(event) {
        event.preventDefault();
        const $el = $(this);
        const newScrollLeft = $el.scrollLeft() + event.originalEvent.deltaY;
        $el.stop().animate({ scrollLeft: newScrollLeft }, 100);
    });

}

function clearRouteSelectors() {
    $('.route-selectors > div').not('.settings-btn, .sim-btn').remove();
}

let shownRoute;  
let shownBeforeRoute;
let routePanelOpenedFromLongPress = false; // Track if routes panel opened via long-press
let originalShownRoute = null; // Preserve map selection before opening panel
let lastMapShownRoute = null; // Tracks current map selection when panels are closed
let isLongPress = false; // Flag to track if a long press occurred

function toggleRouteSelectors(route) {
    console.log("toggleRouteSelectors called with:", route);
    console.log("shownRoute before toggleRouteSelectors:", shownRoute);

    if (shownRoute === route) {

        for (const polyline in polylines) {
            if (polyline !== route) {
                $(`.route-selector[routeName="${polyline}"]`).css('background-color', colorMappings[polyline]);
            }
        }
        $(`.route-selector[routeName="${route}"]`).css('box-shadow', '');
        shownRoute = null;  
        shownBeforeRoute = null;

        $(`.route-selector[routeName="fav"]`).css('background-color', 'gold');

    }

    else {

        for (const polyline in polylines) {
            if (polyline !== route) {
                $(`.route-selector[routeName="${polyline}"]`).css('background-color', 'gray');
            }
        }
        $(`.route-selector[routeName="fav"]`).css('background-color', 'gray');

        $(`.route-selector[routeName="${route}"]`).css('background-color', colorMappings[route]).css('box-shadow', `0 0 10px ${colorMappings[route]}`)
        $(`.route-selector[routeName="${shownRoute}"]`).css('box-shadow', '');
        shownRoute = route;

        const container = $('.route-selectors');

        if (container[0].scrollWidth > $(document).width()) {

            const element = $(`.route-selector[routeName="${route}"]`);
            const containerWidth = container.width();
            const elementWidth = element.outerWidth();

            const scrollTo = element.position().left - (containerWidth / 2) + (elementWidth / 2) + container.scrollLeft();
            
            container.animate({
                scrollLeft: scrollTo
            }, 180);
        }

    }

    $('.stop-info-use-route-selectors-notice').slideUp('fast');
    console.log("shownRoute after toggleRouteSelectors:", shownRoute);

    $('.favs').show(); //for when immediately pressing a route selector from entering into the shared bus screen
}


function hideAllStops() {
    // Used to loop (active) polylines and then get stop ids from stopLists, but this didn't hide all stops on the very first bus because there are no polylines.
    for (const stopId in busStopMarkers) {
        busStopMarkers[stopId].remove();
    }
}

function hideStopsExcept(excludedRoute) {
    console.log('hideStopsExcept', excludedRoute)
    const stopIdsForSelectedRoute = stopLists[excludedRoute]
    for (const polyline in polylines) {
        const stopIdsForRoute = stopLists[polyline]
        stopIdsForRoute.forEach(stopId => {
            if (!(stopIdsForSelectedRoute).includes(stopId)) {
                // console.log(stopId)
                busStopMarkers[stopId].remove();
            }
        })
    }    
}

function hidePolylinesExcept(route) {
    for (const polyline in polylines) {
        if (polyline !== route) {
            polylines[polyline].setStyle({ opacity: 0 });
        }
    }
}

function showAllStops() {
    for (const stopId in busStopMarkers) {
        busStopMarkers[stopId].addTo(map);
    }
}

function showAllBuses() {
    for (const marker in busMarkers) {
        busMarkers[marker].getElement().style.display = '';
    }
}

function showAllPolylines() {
    for (const polyline in polylines) {
        polylines[polyline].setStyle({ opacity: 1 });
    }
}

function updateTooltips(route) {

    if (route === 'fav') return;

    const routeBuses = busesByRoutes[selectedCampus][route]

    try {
        stopLists[route].forEach(stopId => {
            let lowestETA = Infinity;
            let lowestBusId;
    
            routeBuses.forEach(busId => {
                if (busETAs[busId]) {
                    const eta = getETAForStop(busId, stopId)
                    if (eta < lowestETA) {
                        lowestETA = eta;
                        lowestBusId = busId;
                    }
                }
            })
    
            if (lowestBusId) {
                const lowestETAMin = Math.ceil(lowestETA/60)
                $(`[stop-eta="${stopId}"]`).text(lowestETAMin + ' min').show();
            }
        })
    } catch (error) {
        console.log(busesByRoutes);
        console.log(routeBuses);
        console.log(stopLists);
        console.log(`Error updating tooltips for route ${route}: ${error}`)
    }
    
}

function toggleRoute(route) {
    console.log('toggleRoute called with:', route);
    console.log('shownRoute before toggle:', shownRoute);

    if (route === 'fav') { toggleFavorites(); return; }

    // Show all polylines and buses
    if (shownRoute === route) {
        console.log('Toggling off route:', route);
        showAllPolylines();  
        showAllBuses();
        showAllStops();
        
        if (!popupStopId) {
            map.fitBounds(polylineBounds) 
        }
        else {
            // Explicitly show all buses in stop info when unselecting the current route filter
            updateStopBuses(popupStopId, null);
        }

        $('[stop-eta]').text('').hide();

    // Hide other polylines and buses
    } else {
        console.log('Selecting route:', route);

        showAllStops();

        hidePolylinesExcept(route);

        for (const marker in busMarkers) {
            if (busData[marker].route !== route) {
                // busMarkers[marker].remove()
                busMarkers[marker].getElement().style.display = 'none';
            } else {
                busMarkers[marker].getElement().style.display = ''; // if switched the one being viewed 
            }
        }

        hideStopsExcept(route);

        // console.log(route)
        try {
            polylines[route].setStyle({ opacity: 1 }); // show this one if it was prev hidden
        } catch (e) {
            console.log('Error setting style for route:', route, e);
        }

		if (!popupStopId) {
			
            clearPanoutFeedback();
			
			const routePolyline = polylines[route];
			const routeBounds = routePolyline.getBounds();
			const routeBuses = busesByRoutes[selectedCampus][route];
			const hasInService = routeBuses.some(id => !busData[id].oos);
			const boundsToFit = hasInService
				? routeBounds
				: routeBuses.reduce((acc, id) => acc.extend(L.latLng(busData[id].lat, busData[id].long)), L.latLngBounds(routeBounds));
			map.fitBounds(boundsToFit, { padding: [10, 10] });
			$('.bus-info-popup, .stop-info-popup').hide();
		}
        else {
            updateStopBuses(popupStopId, route);
        }

        updateTooltips(route);
    }

    if (!popupStopId) {
        hideInfoBoxes();
    }

    // Update last known map selection state (panels closed scenario)
    if (!$('.info-panels-show-hide-wrapper').is(':visible')) {
        lastMapShownRoute = (shownRoute === route) ? null : route;
        console.log('Updated lastMapShownRoute:', lastMapShownRoute);
    }

    console.log('About to call toggleRouteSelectors with:', route);
    toggleRouteSelectors(route);
    console.log('shownRoute after toggleRoute:', shownRoute);

}

let panelRoute;

function selectedRoute(route) {
    console.log('selectedRoute called with:', route);
    console.log('panelRoute:', panelRoute);
    console.log('isLongPress:', isLongPress);
    console.log('routePanelOpenedFromLongPress:', routePanelOpenedFromLongPress);

    // Store the current map selection exactly once when entering panels
    if (!$('.info-panels-show-hide-wrapper').is(':visible')) {
        // Prefer lastMapShownRoute if available (accurate map state), otherwise shownRoute
        originalShownRoute = (lastMapShownRoute !== null && lastMapShownRoute !== undefined)
            ? lastMapShownRoute
            : (shownRoute || null);
        console.log('Storing originalShownRoute for restoration (entry):', originalShownRoute);
    }

    if (panelRoute === route) {
        // Determine if routes subpanel is currently active
        const routesTabActive = $('.subpanels-container').hasClass('panel-routes');
        
        if (routesTabActive) {
            // We're in the routes subpanel - just unselect the route and stay in the panel
            toggleRouteSelectors(route);
            
            // Clear the route panel data since no route is selected
            $('.route-name').text('').css('color', '');
            $('.route-campuses').text('');
            $('.color-circle').css('background-color', '');
            $('.route-active-buses').text('');
            $('.active-buses').empty();
            $('.route-stops-grid').empty();
            
            // Reset panelRoute so the route can be selected again
            panelRoute = null;
            
            return;
        } else {
            // We're not in the routes subpanel - close the menu as before
            closeRouteMenu();
            return;
        }
    }

    if (shownRoute !== route) {
        toggleRouteSelectors(route);
    }

    $('.route-name').text(route.toUpperCase()).css('color', colorMappings[route])
    $('.route-campuses').text(campusMappings[route])
    $('.color-circle').css('background-color', colorMappings[route])
    $('.route-active-buses').text(busesByRoutes[selectedCampus][route].length === 1 ? '1 bus running' : busesByRoutes[selectedCampus][route].length + ' buses running')

    $('.active-buses').empty();
    busesByRoutes[selectedCampus][route].forEach(busId => {

        let speed = ''
        if ('visualSpeed' in busData[busId]) {
            speed = parseInt(busData[busId].visualSpeed) + 'mph'
        }
        speed += ' | ' + busData[busId].capacity + '% full'

        const $busElm = $(`<div class="flex justify-between">
            <div class="route-bus-name flex align-center gap-x-0p5rem">${busData[busId].busName}</div>
            <div class="route-bus-speed" bus-id="${busId}">${speed}</div>
        </div>`)

        if (busData[busId].oos) {
            $busElm.find('.route-bus-name').append(`<div class="bus-oos white br-0p5rem text-1p4rem">OOS</div>`)
        }

        if (busData[busId].atDepot) {
            $busElm.find('.route-bus-name').append(`<div class="bus-depot white br-0p5rem text-1p4rem">Depot</div>`)
        }
        
        $('.active-buses').append($busElm)
    })

    // Ensure routes subpanel is active and selectors are moved when selecting a route
    const routesTabActive = $('.subpanels-container').hasClass('panel-routes');

    // Always show panels and move selectors when invoked via long-press or when panels are closed
    if (!$('.info-panels-show-hide-wrapper').is(':visible') || isLongPress) {
        $('.info-panels-show-hide-wrapper').show();
        busesOverview();
        moveRouteSelectorsToSubpanel();
        // Force switch to routes subpanel (not user explicit selection)
        const $routesHeaderBtn = $(`.info-panels-header-buttons [data-panel="routes"]`);
        selectInfoPanel('routes', $routesHeaderBtn[0], false);
    } else if (!routesTabActive) {
        // Panels are open but on a different subpanel: move selectors and switch to routes (not user explicit selection)
        moveRouteSelectorsToSubpanel();
        const $routesHeaderBtn = $(`.info-panels-header-buttons [data-panel="routes"]`);
        selectInfoPanel('routes', $routesHeaderBtn[0], false);
    } else {
        // Already in routes: ensure selectors are in subpanel
        moveRouteSelectorsToSubpanel();
    }
    // Ensure route selectors are visible and nav buttons are hidden in subpanel
    $('.bottom').show();
    $('.left-btns, .right-btns').hide();
    $('.route-selectors').show();
    $('.settings-btn').hide();
    
    // Make sure route panel is visible by removing the 'none' class
    $('.route-panel').show();
    
    $('.route-stops-grid').empty();

    let firstCircle;
    let lastCircle;

    let previousStopId = null;
    stopLists[route].forEach((stopId, index) => {

        $('.route-stops-grid').append('<div class="next-stop-circle"></div>')
        const $stopElm = $(`<div class="flex flex-col">
            <div class="route-stop-name">${stopsData[stopId].name}</div>
            <div class="route-buses-for-stop"></div>
        </div>`)

        if (!firstCircle) {
            firstCircle = $('.route-stops-grid .next-stop-circle').last();
            firstCircle.append(`<div class="next-stop-circle" style="z-index: 1; background-color: ${colorMappings[route]}"></div>`)
        }

        let i = 0;

        let positiveBuses = [];
        busesByRoutes[selectedCampus][route].forEach(busId => {
            if (progressToNextStop(busId) < 1) { // have to debug why some stops are missed - prob a passio location issue, right?
                positiveBuses.push(busId);
            }
        })

        // Sort bus IDs based on their ETA
        positiveBuses
            .sort((a, b) => {
                const getETA = (busId) => {
                    if ((route === 'wknd1' || route === 'all' || route === 'winter1' || route === 'on1' || route === 'summer1') && stopId === 3 && previousStopId) {
                        if (busData[busId].at_stop && stopId == busData[busId].stopId[0] && previousStopId == busData[busId].stopId[1]) {
                            return 0;
                        }
                        const val = getETAForStop(busId, stopId, previousStopId);
                        return (val === undefined) ? Infinity : val;
                    } else if (busData[busId].at_stop && (Array.isArray(busData[busId].stopId) ? stopId === busData[busId].stopId[0] : stopId === busData[busId].stopId)) {
                        return 0;
                    }
                    const val = getETAForStop(busId, stopId);
                    return (val === undefined) ? Infinity : val;
                };
                return Math.round(getETA(a) / 60) - Math.round(getETA(b) / 60);
            })
            .forEach(busId => {

                let thisStopIndex = index;
                // console.log(index);
                let busIndex = -1;
                
                if ((route === 'wknd1' || route === 'all' || route === 'winter1' || route === 'on1' || route === 'summer1') && busData[busId].stopId == 3) {
                    
                    for (let j = 1; j < stopLists[route].length; j++) {

                        // console.log('stopLists[route][i]: ', stopLists[route][j]);
                        // console.log('busData[busId].stopId: ', busData[busId].stopId);
                        // console.log('busData[busId].prevStopId: ', busData[busId].prevStopId);
                        // console.log('previousStopId: ', previousStopId);
                        
                        if (
                            stopLists[route][j] === busData[busId].stopId &&
                            stopLists[route][j-1] === busData[busId].prevStopId) {
                            busIndex = j;
                            alert('what is this')
                            break;
                        }
                    }
                    if (busIndex === -1) {
                        busIndex = stopLists[route].indexOf(busData[busId].stopId);
                    }

                } else {
                    busIndex = stopLists[route].indexOf(busData[busId].stopId);
                }

                let stopsAway = thisStopIndex > busIndex 
                    ? thisStopIndex - busIndex - 1
                    : (stopLists[route].length - busIndex) + thisStopIndex - 1;

                // console.log(stopsAway)

                if (busETAs[busId]) {

                    let eta;

                    const $gridElm = $stopElm.find('.route-buses-for-stop');

                    if (busData[busId].at_stop && (Array.isArray(busData[busId].stopId) ? stopId === busData[busId].stopId[0] : stopId === busData[busId].stopId)) {
                        eta = 0;
                        $gridElm.append(`<div class="rbfs-bn" onclick="(function() { flyToBus(${busId}); closeRouteMenu(); })();">${busData[busId].busName}</div>`);
                        $gridElm.append(`<div class="bold">Here</div>`);
                        $gridElm.append(`<div class="align-right">Arrived</div>`);
                        return;
                    } else if (busData[busId].at_stop && stopId == busData[busId].stopId[0] && previousStopId == busData[busId].stopId[1]) { // wknd & all special case at sac nb
                        eta = 0;
                        $gridElm.append(`<div class="rbfs-bn" onclick="(function() { flyToBus(${busId}); closeRouteMenu(); })();">${busData[busId].busName}</div>`);
                        $gridElm.append(`<div class="bold">Here</div>`);
                        $gridElm.append(`<div class="align-right">Arrived</div>`);
                        return;
                    } else {
                        $gridElm.append(`<div class="rbfs-bn" onclick="(function() { flyToBus(${busId}); closeRouteMenu(); })();">${busData[busId].busName}</div>`);
                        if ((route === 'wknd1' || route === 'all' || route === 'winter1' || route === 'on1' || route === 'summer1') && stopId === 3 && previousStopId) {
                            eta = getETAForStop(busId, stopId, previousStopId);
                        } else {
                            eta = getETAForStop(busId, stopId);
                        }
                    }

                    if (eta !== undefined) {
                        $gridElm.append(`<div class="bold">${Math.ceil(eta/60)}m</div>`);

                        let stopsAwayText = '';

                        if (stopsAway === 0) {
                            stopsAwayText = "En route";
                        } else if (stopsAway === 1) {
                            stopsAwayText = stopsAway + ' stop away';
                        } else {
                            stopsAwayText = stopsAway + ' stops away';
                        }

                        $gridElm.append(`<div class="align-right">${stopsAwayText}</div>`);
                    }

                }

                i++;
                previousStopId = stopId;

            });

        // console.log('---')

        $('.route-stops-grid').append($stopElm);
        previousStopId = stopId;
    });

    $('.route-stops-grid .next-stop-circle').css('background-color', colorMappings[route])

    lastCircle = $('.route-stops-grid .next-stop-circle').last();

    setTimeout(() => {
        const firstRect = firstCircle[0].getBoundingClientRect();
        const lastRect = lastCircle[0].getBoundingClientRect();
        const heightDiff = Math.abs(lastRect.top - firstRect.top);
        console.log(heightDiff)
        firstCircle.addClass('connecting-line');
        firstCircle[0].style.setProperty('--connecting-line-height', `${heightDiff}px`);
    }, 0);

    panelRoute = route

}


$('.color-circle').click(function() {
    $('.color-select-route').text(shownRoute.toUpperCase()).css('color', colorMappings[shownRoute]);
    
    $('.color-circle-select-default').css('background-color', defaultColorMappings[shownRoute])

    let colorValue = colorMappings[shownRoute];
    let colorMappingRGB;

    if (colorValue.startsWith('rgb')) {
        colorMappingRGB = colorValue;
    } else {
        const tempElement = document.createElement('div');
        tempElement.style.color = colorValue;
        document.body.appendChild(tempElement);
        colorMappingRGB = window.getComputedStyle(tempElement).color;
        document.body.removeChild(tempElement);
    }

    $('.color-circle-select').each(function() {
        const color = $(this).css('background-color');
        if (color === colorMappingRGB) {
            $(this).addClass('selected-color-choice').text('✔');
        } else {
            $(this).text('');
        }
    });

    if (colorMappings[shownRoute] === defaultColorMappings[shownRoute]) {
        $('.color-reset').css('background-color', 'gray')
    }
    
    $('.color-selection-modal').css('display', 'flex');
})

$('.color-circle-select').click(function() {
    const color = $(this).css('background-color')
    $('.color-select-route').css('color', color);
    $('.selected-color-choice').text('').removeClass('selected-color-choice')
    $(this).text('✔').addClass('selected-color-choice')
    $('.color-reset').css('background-color', '#f98d1a')
})

function updateColorMappingsSelection(selectedColor) {
    colorMappings[shownRoute] = selectedColor
    settings['colorMappings'] = colorMappings
    localStorage.setItem('settings', JSON.stringify(settings))

    // update shown element colors
    $(`.color-circle, .next-stop-circle, .route-selector[routename="${shownRoute}"]`).css('background-color', selectedColor)
    $('.route-name').css('color', selectedColor)
    $(`.route-selector[routename="${shownRoute}"]`).css('box-shadow', `0 0 10px ${selectedColor}`)

    busesByRoutes[selectedCampus][shownRoute].forEach(busId => {
        busMarkers[busId].getElement().querySelector('.bus-icon-outer').style.backgroundColor = selectedColor;
        polylines[shownRoute].setStyle({ color: selectedColor });
    })

    if (popupStopId) {
        updateStopBuses(popupStopId)
    }

    populateFavs();

    if (sharedBus && busData[sharedBus].route === shownRoute) {
        $('.shared > span').css('color', selectedColor)
    }

    $('.route-here').each(function() {
        if ($(this).hasClass('route-here-' + shownRoute)) {
            $(this).css('background-color', colorMappings[shownRoute]);
        }
    })
}

$('.color-reset').click(function() {
    $('.color-circle-select-default').click();
    $('.color-reset').css('background-color', 'gray')
})

$('.color-confirm').click(function() {
    if ($('.selected-color-choice').length) {
        const selectedColor = $('.selected-color-choice').css('background-color');
        updateColorMappingsSelection(selectedColor)
    }
    $('.color-selection-modal').css('display', 'none')
})


let routeRiderships = {}
function updateBusOverview(routes) {

    const loopTimes = calculateLoopTimes();

    // Check if busesByRoutes and selectedCampus exist before accessing
    if (!busesByRoutes || !busesByRoutes[selectedCampus]) {
        console.log('No buses data available for campus:', selectedCampus);
        $('.buses-overview-grid').hide().children().not('.bus-overview-heading').remove();
        return;
    }

    routes = Object.keys(busesByRoutes[selectedCampus]);
    if (!routes || routes.length === 0) { 
        $('.buses-overview-grid').hide().children().not('.bus-overview-heading').remove();
    } else {
        $('.buses-overview-grid').show();
    }

    if (routes.includes('undefined')) { // Should I even track this?
        routes = routes.filter(route => route !== 'undefined');
    }

    // console.log(`Updating bus overview for routes: ${routes.join(', ')}`)

    let totalRidership = 0;

    const routeData = routes.map(route => {
        routeRiderships[route] = 0;
        busesByRoutes[selectedCampus][route].forEach(busId => {
            const riders = Math.ceil(busData[busId].capacity/100 * 57)
            routeRiderships[route] += riders;
            totalRidership += riders;
        });
        return { route, ridership: routeRiderships[route] };
    });

    routeData.sort((a, b) => b.ridership - a.ridership);

    // Create total row if it doesn't exist (only once at the bottom after all routes)
    let $totalRowExists = $('.buses-overview-grid .bus-overview-name:contains("Total")').length > 0;
    if (!($totalRowExists)) {
        const $grid = $('.buses-overview-grid').first();
        const $totalName = $(`<div class="bus-overview-name bold total-row">Total</div>`);
        const $totalRidership = $(`<div class="bus-overview-ridership total-row">${totalRidership} riding</div>`);
        const $totalLoopTime = $(`<div class="bus-overview-loop-time total-row"></div>`);

        // Insert total row elements directly into the main grid
        $grid.append($totalName);
        $grid.append($totalRidership);
        $grid.append($totalLoopTime);
    }

    routeData.forEach(({route}) => {
        if ($(`.bus-overview-ridership[route="${route}"]`).length === 0) {
            const $busName = $(`<div class="bus-overview-name bold">${route.toUpperCase()}</div>`).css('color', colorMappings[route]); // (${busesByRoutes[selectedCampus][route].length})
            const $busRidership = $(`<div class="bus-overview-ridership" route="${route}">${routeRiderships[route]} riders</div>`);
            const $loopTime = $(`<div class="bus-overview-loop-time" route="${route}">${loopTimes[route]} min</div>`);
            const $grid = $('.buses-overview-grid').first();
            // Insert new routes before the total row in correct order
            const $firstTotalElement = $grid.find('.bus-overview-name:contains("Total")').first();

            if ($firstTotalElement.length > 0) {
                // Insert elements in the correct DOM order for grid: Route | Ridership | Loop Time
                // before() method inserts in reverse, so we insert Route last to make it first
                $firstTotalElement.before($busName);      // Route (becomes first in DOM)
                $firstTotalElement.before($busRidership); // Ridership (becomes second in DOM)
                $firstTotalElement.before($loopTime);     // Loop Time (becomes third in DOM)
            } else {
                // No total row yet, insert in correct DOM order
                $grid.append($busName);      // Route (first in DOM)
                $grid.append($busRidership); // Ridership (second in DOM)
                $grid.append($loopTime);     // Loop Time (third in DOM)
            }
        } else {
            const prevRiders = parseInt($(`.bus-overview-ridership[route="${route}"]`).text().split(' ')[0]);
            const newRiders = (routeRiderships[route])


            if (prevRiders !== newRiders) {
                // console.log(`'prevriders: ${prevRiders}, newriders: ${newRiders} `)
                let color = ''
                if (prevRiders > newRiders) {
                    color = 'red'
                } else if (prevRiders < newRiders) {
                    color = 'lime'
                }

                setTimeout(() => {
                    $(`.bus-overview-ridership[route="${route}"]`).text(`${routeRiderships[route]} riders`).css('color', color).css('transition', 'color 0.25s');

                    const ridersChange = newRiders - prevRiders;

                    // Update total ridership at the same time as route update for real-time appearance
                    const $totalRidershipElement = $('.buses-overview-grid .bus-overview-name:contains("Total")').next('.bus-overview-ridership');
                    if ($totalRidershipElement.length > 0) {
                        const nowTotalRidership = parseInt($totalRidershipElement.text().split(' ')[0]);
                        $totalRidershipElement.text(`${nowTotalRidership + ridersChange} riding`).css('color', color).css('transition', 'color 0.25s');
                    }

                    setTimeout(() => {
                        $(`.bus-overview-ridership[route="${route}"]`).css('color', 'var(--theme-color-lighter)').css('transition', 'color 1s');

                        // Fade total color back to normal after route animation completes
                        $('.buses-overview-grid .bus-overview-name:contains("Total")').next('.bus-overview-ridership').css('color', 'var(--theme-color-lighter)').css('transition', 'color 1s');
                    }, 1000);
                }, Math.random() * 5000);
            }
        }
    });

    updateAverageWaitByRoute();
}


function busesOverview() {

    if (!isDesktop) {
        $('.bottom, .leaflet-control-attribution').hide();
        $('.buses-panel-wrapper').css('margin-left', 0);
    } else {
        const routeSelectorsWidth = $('.route-selectors').width() / parseFloat(getComputedStyle(document.documentElement).fontSize) + 3;
        $('.buses-panel-wrapper').css('margin-left', routeSelectorsWidth + 'rem');
        const leftBtnHeight = $('.left-btns').height();
        $('.buses-panel-wrapper').css('max-height', window.innerHeight - leftBtnHeight - 4 * parseFloat(getComputedStyle(document.documentElement).fontSize));
    }

    $('.buses-panel-wrapper').slideDown('fast');

    updateBusOverview();

    // Ensure chart is initialized before updating
    if (!ridershipChart) {
        makeRidershipChart();
    }

    updateRidershipChart();
    updateWaitTimes();
    updateAverageWaitByRoute();
}

let ridershipChart;

async function makeRidershipChart() {
   
    const canvas = document.getElementById('ridership-chart');
    const ctx = canvas.getContext('2d');

    // Destroy existing chart if it exists
    if (ridershipChart) {
        ridershipChart.destroy();
        ridershipChart = null;
    }

    // const themeColor = getComputedStyle(document.documentElement).getPropertyValue('--theme-color').trim();
    ridershipChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                data: [],
                borderColor: 'rgb(75, 192, 192)',
                backgroundColor: 'rgba(75, 192, 192, 0.2)',
                tension: 0.5,
                pointRadius: 0,
                fill: true
            }]
        },
        options: {
            responsive: true,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            plugins: {
                tooltip: {
                    enabled: true,
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function(context) {
                            return `${context.parsed.y} riders`;
                        },
                        title: function(tooltipItems) {
                            return tooltipItems[0].label;
                        }
                    }
                },
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    ticks: {
                        display: false,
                    },
                    grid: {
                        display: false
                    },
                    border: {
                        display: false
                    }
                },
                x: {
                    grid: {
                        display: false
                    },
                    // border: {
                    //     display: false
                    // },
                    ticks: {
                        autoSkip: false,
                        maxRotation: 45,
                        // color: themeColor,
                        callback: function(val, index) {
                            const time = this.getLabelForValue(val);
                            const hour = parseInt(time.split(':')[0]); 
                            
                            const totalDataPoints = this.chart.data.labels.length;
                            if (totalDataPoints > 150) { // check if the 150 num should be changed later
                                // Skip odd-hour labels if there are more than 150 data points
                                return hour % 2 !== 0 || !time.includes(':00') ? '' : hour + time.split(' ')[1];
                            } else {
                                return time.includes(':00') ? hour + time.split(' ')[1] : '';
                            }
                        }
                    }
                }
            },
            maintainAspectRatio: false
        }
    });
}

async function updateRidershipChart() {
    // Only update if the buses panel is visible
    if (!$('.buses-panel-wrapper').is(':visible')) {
        return;
    }
    
    try {
        const response = await fetch('https://demo.rubus.live/ridership');
        if (!response.ok) throw new Error('Network response was not ok');
        
        const timeRiderships = await response.json();

        if (!Object.keys(timeRiderships).length) {
            return; // Don't show chart if no ridership data
        }

        const utcOffset = new Date().getTimezoneOffset();

        // Prepare entries for sorting and formatting
        const entries = Object.entries(timeRiderships).map(([key, value]) => {
            let localMinutes = parseInt(key) - utcOffset;
            if (localMinutes < 0) localMinutes += 1440; // Handle day wraparound

            // Add 24 hours (1440 mins) to early morning times to sort them at the end
            const sortMinutes = localMinutes < 300 ? localMinutes + 1440 : localMinutes;

            const hours = Math.floor(localMinutes / 60);
            const minutes = localMinutes % 60;
            const time = new Date();
            time.setHours(hours, minutes, 0, 0);

            const formattedTime = time.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit'
            });

            return [formattedTime, value, sortMinutes];
        });

        // Sort and convert to chart format
        const sortedData = Object.fromEntries(
            entries.sort(([, , a], [, , b]) => a - b)
        );

        const labels = Object.keys(sortedData);
        const values = Object.values(sortedData);

        // Check if chart is initialized before trying to update it
        if (!ridershipChart) {
            console.error('Ridership chart not initialized');
            return;
        }

        ridershipChart.data.labels = labels;
        ridershipChart.data.datasets[0].data = values;
        ridershipChart.update();

        const totalRidership = values.reduce((a, b) => a + b, 0);
        const averageRidership = Math.round(totalRidership / values.length);
        const maxRidership = Math.max(...values);
        const peakTime = labels[values.indexOf(maxRidership)];
        
        $('.ridership-avg').text(`AVG: ${averageRidership}`);
        $('.ridership-max').text(`PEAK: ${maxRidership.toLocaleString()} at ${peakTime}`);
        $('.ridership-super-wrapper').show();
        
    } catch (error) {
        console.error('Error fetching ridership:', error);
    }
}


function calculateLoopTimes() {

    let loopTimes = {}

    for (const route of activeRoutes) {

        let eta = 0
        const stopList = stopLists[route]

        if (!stopList) { // for unkwown bus types (e.g. cc, penn station, have to remove adding these to bus data sometime, or add option in dev settings to show unknown bus routes.)
            continue;
        }

        for (let i = 0; i < stopList.length - 1; i++) {
            const thisStop = stopList[i]

            let prevStop
            if (i === 0) {
                prevStop = stopList[stopList.length - 1]
            } else {
                prevStop = stopList[i - 1]
            }

            if (etas[thisStop] && prevStop in etas[thisStop]['from']) { // investigate why I need the first condition
                eta += etas[thisStop]['from'][prevStop]
            } else {
                eta += 300;
            }

            if (waits[thisStop]) {
                eta += waits[thisStop];
            } else {
                eta += 20;
            }
        }

        loopTimes[route] = Math.round(eta/60);
    }
    return loopTimes;
}


const stopsByCampus = {
    "nb": {
        'College Ave': [1, 2, 3, 4],
        'Busch': [5, 6, 7, 8, 9, 10, 11, 26],
        'Livingston': [12, 13, 14, 15, 24],
        'Cook': [16, 17, 18, 19, 20, 21],
        'Downtown': [22, 23]
    },
    "newark": {
        "Newark": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]
    },
    "camden": {
        "Camden": [1, 2, 3, 4, 5, 6]
    }
    
}

function updateWaitTimes() {
    $('.wait-times').empty();
    for (const campus in stopsByCampus[selectedCampus]) {
        let hasStops = false;
        const $waitWrapper = $('<div class="grid grid-cols-2-auto gap-x-1rem gap-y-0p5rem"></div>')
        $waitWrapper.append($(`<div class="mt-1rem center bold-500 text-1p5rem mb-0p5rem" style="grid-column: span 2;">${campus}</div>`))
        const stops = stopsByCampus[selectedCampus][campus];
        
        // Sort stops by wait time
        const sortedStops = stops.slice().sort((a, b) => {
            const waitA = waits[a] || Infinity;
            const waitB = waits[b] || Infinity;
            return waitB - waitA;
        });

        sortedStops.forEach(stopId => {
            // console.log(stopId)
            let waitSeconds = waits[stopId];
            if (waitSeconds) {
                if (waitSeconds > 60) {
                    const minutes = Math.floor(waitSeconds / 60);
                    const seconds = waitSeconds % 60;
                    waitSeconds = seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
                } else {
                    waitSeconds += 's'
                }
                $waitWrapper.append(`</div>${stopsData[stopId].name}</div>`).append(`<div class="width-max flex align-center">${waitSeconds}</div}`)
                hasStops = true;
            }
        })

        $('.wait-times').append($waitWrapper)
    }

    if ($('.wait-times').children().length === 0) {
        $('.wait-title').hide();
    } else {
        $('.wait-title').show(); 
    }
}


function getActiveBusCount(route) {
    return busesByRoutes[selectedCampus][route].length;
}

function calculateAverageWaitByRoute() {
    // Average wait ~= loop time / active buses
    const loopTimes = calculateLoopTimes();
    const waitByRoute = {};
    for (const route in loopTimes) {
        const buses = getActiveBusCount(route);
        if (buses > 0 && loopTimes[route] !== undefined && loopTimes[route] !== null) {
            waitByRoute[route] = loopTimes[route] / buses; // minutes
        }
    }
    return waitByRoute;
}

function updateAverageWaitByRoute() {
    const $grid = $('.avg-wait-grid');
    if (!$grid.length) return;

    // Clear previous (keep headings)
    $grid.children().not('.avg-wait-heading').remove();

    // Ensure data available
    if (!busesByRoutes || !busesByRoutes[selectedCampus]) {
        $('.avg-wait-wrapper').hide();
        return;
    }

    const waitByRoute = calculateAverageWaitByRoute();
    const routes = Object.keys(waitByRoute)
        .filter(r => r !== 'undefined')
        .sort((a, b) => a.localeCompare(b));

    if (routes.length === 0) {
        $('.avg-wait-wrapper').hide();
        return;
    } else {
        $('.avg-wait-wrapper').show();
    }

    routes.forEach(route => {
        const minutes = waitByRoute[route];
        const text = (minutes >= 1) ? `${Math.round(minutes)}m` : `${Math.max(1, Math.round(minutes * 60))}s`;
        const $name = $(`<div class="avg-wait-name bold">${route.toUpperCase()}</div>`).css('color', colorMappings[route]);
        const $val = $(`<div class="avg-wait-value">${text}</div>`);
        $grid.append($name);
        $grid.append($val);
    });
}


function closeRouteMenu() {
    console.log('closeRouteMenu called');
    console.log('routePanelOpenedFromLongPress:', routePanelOpenedFromLongPress);
    console.log('originalShownRoute:', originalShownRoute);
    console.log('shownRoute before close:', shownRoute);
    console.log('panelRoute before close:', panelRoute);
    console.log('shownBeforeRoute before close:', shownBeforeRoute);

    // Hide info panels and show bottom controls
    $('.info-panels-show-hide-wrapper').hide();
    // Move selectors back to main UI
    moveRouteSelectorsToMain();
    $('.bottom').show();

    // Reset bottom position to default
    $('.bottom').css('bottom', '0px');

    // Show all other buttons
    $('.left-btns, .right-btns, .settings-btn').show();

    // Show the favorite star icon again if there are favorited buses
    if ($('.favs > div').length > 0) {
        $('.route-selector[routeName="fav"]').show();
    }

    // Restore original map route selection strictly from state
    let routeToRestore = originalShownRoute;
    console.log('Restoring original route selection (state):', routeToRestore);

    if (routeToRestore) {
        // Ensure we end with the original single-route filter
        if (shownRoute !== routeToRestore) {
            console.log('Toggling to original route:', routeToRestore);
            toggleRoute(routeToRestore);
        } else {
            console.log('Already on original route:', routeToRestore);
        }
    } else {
        // Ensure we end with the "all buses" view (no single route selected)
        if (shownRoute) {
            console.log('Toggling off current route to show all buses');
            toggleRoute(shownRoute);
        } else {
            console.log('Already showing all buses');
        }
    }
    // Reset state holders
    routePanelOpenedFromLongPress = false;
    originalShownRoute = null;
    // Update last map selection tracker after restore
    lastMapShownRoute = shownRoute;
    shownBeforeRoute = null;
    console.log('shownRoute after restore:', shownRoute);

    console.log('shownRoute after closeRouteMenu:', shownRoute);

    panelRoute = null;
}


$('.settings-btn').on('touchstart click', function() { // why do i need touchstart here but not below? idk
    sa_event('btn_press', {
        'btn': 'settings'
    });
    
    $('.leaflet-control-attribution').hide();
    $('.settings-panel').show();
    // if (!isDesktop) {
    $('.bottom').hide();
    // }
    $('.settings-close').show();
    if (isDesktop && $('.buses-panel-wrapper').is(':visible')) {
        $('.buses-panel-wrapper').slideUp();
    }
})

$('.settings-close').click(function() {
    $('.settings-panel').hide();
    $('.bottom').show();
    $(this).hide();
})


const markerSizeMap = {
    'small': '20',
    'medium': '27',
    'big': '35'
}

const innerSizeMap = {
    'small': '8',
    'medium': '13',
    'big': '19'
}

let settings = {}

const toggleSettings = [
    'toggle-select-closest-stop',
    'toggle-show-arrival-times',
    'toggle-show-bus-speeds',
    'toggle-stops-above-buses',
    'toggle-always-show-second',
    'toggle-show-bike-racks',
    'toggle-disable-fireworks-on-open',
    'toggle-show-buildings',

    'toggle-pause-update-marker',
    'toggle-pause-rotation-updating',
    'toggle-whole-pixel-positioning',
    'toggle-pause-passio-polling',
    'toggle-show-stop-polygons',
    'toggle-show-dev-options',
    'toggle-show-etas-in-seconds',
    'toggle-show-bus-id',
    'toggle-show-bus-progress',
    'toggle-show-bus-overtime-timer',
    'toggle-show-bus-path',
    'toggle-launch-fireworks-button',
    'toggle-show-campus-switcher',
    'toggle-hide-other-routes',
    'toggle-show-bus-log',
    'toggle-show-extra-bus-data',
    'toggle-show-stop-id',
    'toggle-show-knight-mover',
    'toggle-polyline-padding',
    'toggle-show-invalid-etas',
    'toggle-show-rotation-points',
    'toggle-allow-iphone-preload',
    'toggle-show-rubus-ai',
    'toggle-show-bus-quickness-breakdown',
    'toggle-always-immediate-update',
    'toggle-bypass-max-distance',
    'toggle-show-sim',
    'toggle-spoofing',
    'toggle-show-chat',
    'toggle-show-thinking',
    'toggle-show-road-network',
    'toggle-distances-line-on-focus',
    'toggle-always-show-break-overdue',
    'toggle-settings-btn-end'

]

let colorMappings;

const defaultColorMappings = {
    'ee': '#fd0000', // bc red is also a color in color circle select, checkmark will appear double
    'f': 'IndianRed',
    'h': 'RoyalBlue',
    'a': 'Orchid',
    'lx': 'Gold',
    'b': 'LimeGreen',
    'rexb': 'LightSeaGreen',
    'rexl': 'Coral',
    'bhe': 'SlateBlue',
    'bl': 'SlateBlue',
    'on1': 'BlueViolet',
    'on2': 'MediumTurquoise',
    'wknd1': 'HotPink',
    'wknd2': 'RebeccaPurple',
    'ftbl': '#a63939',
    'none': 'lightgray',
    'c': 'MediumVioletRed',
    'all': 'MediumSpringGreen',
    'winter1': 'SpringGreen',
    'winter2': 'crimson',
    'fav': 'gold',
    'summer1': 'Plum',
    'summer2': '#2bd6ec',
    'commencement': 'LightSalmon',

    'psx': 'LightSalmon',
    'ps': 'LightGreen',
    'ccx': 'Plum',
    'cc': 'PaleTurquoise',

    'cam': 'navy',
}

let defaultSettings = {
    'font': 'PP Neue Montreal',
    'marker-size': 'medium',
    'theme': 'auto',
    'toggle-show-etas-in-seconds': false,
    'toggle-select-closest-stop': true,
    'toggle-hide-other-routes': true,
    'toggle-stops-above-buses': false,
    'toggle-always-show-second': false,
    'toggle-show-bike-racks': false,
    'toggle-disable-fireworks-on-open': false,
    'toggle-settings-btn-end': false,
    'toggle-show-buildings': true,
    'campus': 'nb',
    
    // dev settings
    'map-renderer': 'svg',
    'bus-positioning': 'exact',
    'toggle-pause-update-marker': false,
    'toggle-whole-pixel-positioning': false, /* this might not be needed? */
    'toggle-pause-passio-polling': false,
    'toggle-show-stop-polygons': false,
    'toggle-show-dev-options': false,
    'toggle-show-bus-id': false,
    'toggle-show-bus-progress': false,
    'toggle-show-bus-overtime-timer': false,
    'toggle-show-bus-path': false,
    'toggle-launch-fireworks-button': false,
    'toggle-show-campus-switcher': false,
    'toggle-show-bus-log': false,
    'toggle-show-extra-bus-data': false,
    'toggle-show-stop-id': false,
    'toggle-show-knight-mover': false,
    'toggle-polyline-padding': false,
    'toggle-show-invalid-etas': false,
    'toggle-show-rotation-points': false,
    'toggle-allow-iphone-preload': false,
    'toggle-show-rubus-ai': false,
    'toggle-show-bus-quickness-breakdown': false,
    'toggle-always-immediate-update': false,
    'toggle-bypass-max-distance': false,
    'toggle-show-sim': true,
    'toggle-spoofing': false,
    'toggle-show-chat': false,
    'toggle-show-thinking': false,
    'toggle-show-road-network': false,
    'toggle-distances-line-on-focus': false,
    'toggle-always-show-break-overdue': false,
    
    // going to remove
    'toggle-show-arrival-times': true,
    'toggle-show-bus-speeds': true,

    'colorMappings': JSON.parse(JSON.stringify(defaultColorMappings))

};

function setDefaultSettings () {
    delete defaultSettings['theme'];
    settings = defaultSettings;
    localStorage.setItem('settings', JSON.stringify(settings));
    $(`div.settings-option[font-option="PP Neue Montreal"]`).addClass('settings-selected')
    $(`div.settings-option[marker-size-option="medium"]`).addClass('settings-selected')
    $(`div.settings-option[map-renderer-option="svg"]`).addClass('settings-selected')
    $(`div.settings-option[bus-positioning-option="exact"]`).addClass('settings-selected')
    $(`div.settings-option[campus="nb"]`).addClass('settings-selected')
    
    // $(`div.settings-option[theme-option="auto"]`).addClass('settings-selected')
    colorMappings = settings['colorMappings']
}

function updateSettings() {
    console.log('updating settings')
    settings = localStorage.getItem('settings');
    // console.log(settings)
    if (settings) {

        settings = JSON.parse(settings);
        for (let key in defaultSettings) {
            if (!settings.hasOwnProperty(key) && key !== 'theme') {
                settings[key] = defaultSettings[key];
            }
        }
        for (let key in settings) {
            if (!defaultSettings.hasOwnProperty(key)) {
                delete settings[key];
            }
        }

        colorMappings = settings['colorMappings']
        for (const key in defaultColorMappings) {
            if (!colorMappings.hasOwnProperty(key)) {
                colorMappings[key] = defaultColorMappings[key];
            }
        }

        localStorage.setItem('settings', JSON.stringify(settings))

        document.documentElement.style.setProperty('--font-family', settings['font'] + ', sans-serif');

    } else {
        console.log('does this run?')
        setDefaultSettings();
    }

    selectedCampus = settings['campus'];
    campusChanged();

    $(`div.settings-option[font-option="${settings['font']}"]`).addClass('settings-selected')
    $(`div.settings-option[marker-size-option="${settings['marker-size']}"]`).addClass('settings-selected')
    $(`div.settings-option[map-renderer-option="${settings['map-renderer']}"]`).addClass('settings-selected')
    $(`div.settings-option[bus-positioning-option="${settings['bus-positioning']}"]`).addClass('settings-selected')
    $(`div.settings-option[campus-option="${settings['campus']}"]`).addClass('settings-selected');

    if (!$('.theme-modal').is(':visible')) {
        $(`div.settings-option[theme-option="${settings['theme']}"]`).addClass('settings-selected')
    }

    $('.settings-option').click(function() {
        if ($(this).hasClass('settings-selected')) { return; }

        const settingsOption = $(this).attr('settings-option')

        sa_event('settings_change', {
            'setting': settingsOption,
            'value': $(this).attr(settingsOption + '-option')
        });

        // console.log(settingsOption)
        if (settingsOption === 'font') {
            $(`div.settings-selected[settings-option="${settingsOption}"]`).removeClass('settings-selected')
            $(this).addClass('settings-selected')
            settings['font'] = $(this).attr('font-option')
            document.documentElement.style.setProperty('--font-family', settings['font'] + ', sans-serif');
        }

        else if (settingsOption === 'marker-size') {
            
            $(`div.settings-selected[settings-option="${settingsOption}"]`).removeClass('settings-selected')
            $(this).addClass('settings-selected')
            settings['marker-size'] = $(this).attr('marker-size-option')
            updateMarkerSize()

        }

        else if (settingsOption === 'theme') {
            
            $(`div.settings-selected[settings-option="${settingsOption}"]`).removeClass('settings-selected')
            $(this).addClass('settings-selected')
            settings['theme'] = $(this).attr('theme-option')

            let theme = $(this).attr('theme-option')
            if (theme === 'auto') {
                const currentHour = new Date().getHours();
                theme = (currentHour <= 7 || currentHour >= 18) ? 'dark' : 'light';
            }

            changeMapStyle(theme)

        } else if (settingsOption === 'map-renderer') {
            $(`div.settings-selected[settings-option="${settingsOption}"]`).removeClass('settings-selected')
            $(this).addClass('settings-selected')
            settings['map-renderer'] = $(this).attr('map-renderer-option')
            
            // Set preferCanvas based on renderer choice
            map.options.preferCanvas = settings['map-renderer'] === 'canvas'
            
            // Force map to refresh with new renderer
            const center = map.getCenter();
            const zoom = map.getZoom();
            map.setView(center, zoom);
            
        } else if (settingsOption === 'bus-positioning') {
            $(`div.settings-selected[settings-option="${settingsOption}"]`).removeClass('settings-selected')
            $(this).addClass('settings-selected')
            settings['bus-positioning'] = $(this).attr('bus-positioning-option')

        } else if (settingsOption === 'campus') {
            $(`div.settings-selected[settings-option="${settingsOption}"]`).removeClass('settings-selected')
            $(this).addClass('settings-selected')
            settings['campus'] = $(this).attr('campus-option')
            campusChanged();
        } else if (settingsOption === undefined) {
            // Toggle switches
            const id = $(this).find('input[type="checkbox"]').attr('id');
            if (!id) return;
            const checked = $(`#${id}`).is(':checked');

            settings[id] = checked;
            
            if (id === 'toggle-show-campus-switcher') {
                if (checked) {
                    $('.campus-switcher').show();
                } else {
                    $('.campus-switcher').hide();
                }
            }
        }

        if (settingsOption) { // don't reset ls if ls was cleared (that option doesn't currently have settingsOption). add some sort of attribute later as this will be in analytics
            localStorage.setItem('settings', JSON.stringify(settings))
        }

    })

    toggleSettings.forEach(toggleSetting => {

        const isChecked = settings[toggleSetting]; 
        const $toggleInput = $(`#${toggleSetting}`);

        if ($toggleInput.length) {
            $toggleInput.prop('checked', isChecked);
        }

    });

    if (!localStorage.getItem('uid')) {
        function genUid() {
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
        }
        localStorage.setItem('uid', genUid());
        sa_event('uid_generated', {
            'uid': localStorage.getItem('uid')
        });
    }
    if (!localStorage.getItem('timeJoined')) {
        localStorage.setItem('timeJoined', new Date().toISOString());
    }

    // Dispatch event to notify other components that settings are updated
    document.dispatchEvent(new CustomEvent('rubus-settings-updated'));

    getBuildNumber()
}

$(document).ready(function() {

    // updateSettings();

    $('.stop-info-back').click(function() {
        flyToBus(sourceBusId);
        $('.stop-info-popup').hide();
        // setting sourceBusId to null breaks stuff
    });

    $('.bus-info-back').click(function() {
        flyToStop(sourceStopId);
        if (!shownRoute) {
            showAllBuses();
            showAllPolylines();
        }
    });

    // Handle disable bus log button click
    $('.disable-bus-log-btn').click(function() {
        $('#toggle-show-bus-log').prop('checked', false);
        $('.bus-log-wrapper').hide();
        settings['toggle-show-bus-log'] = false;
        localStorage.setItem('settings', JSON.stringify(settings));
    });

})

function toggleDevOptions() {

    const $devWrapper = $('.dev-options-wrapper');
    const $devTitle = $('.dev-options-head');
    const optionsShown = $devWrapper.is(':visible');

    if(!optionsShown) {
        $devWrapper.slideDown();
        $devTitle.text('Hide Developer Options ▲');
    } else {
        $devWrapper.slideUp();
        $devTitle.text('Show Developer Options ▼');
    }

}

function updateMarkerSize() {

    const outterDimensions = markerSizeMap[settings['marker-size']]
    const innerDimensions = innerSizeMap[settings['marker-size']]

    $('.bus-icon-outer').css('height', outterDimensions + 'px').css('width', outterDimensions + 'px');
    $('.bus-icon-inner').css('height', innerDimensions + 'px').css('width', innerDimensions + 'px');
}

let locationShared;
let userLocation;
let closestStopId;
let closestStopDistances = {};
let sortedClosestStopDistances = {};
let closestStopsMap;
let closestDistance;
let watchPositionId = null;

function updateNearestStop() {
    let closestStop = null;
    let thisClosestStopId = null;
    let thisClosestDistance = Infinity;

    const stopIds = activeStops.length > 0 ? activeStops : Object.keys(stopsData);

    const userLat = userPosition[0];
    const userLong = userPosition[1];

    for (const stopId of stopIds) {
        const stop = stopsData[stopId];
        const distance = haversine(userLat, userLong, stop.latitude, stop.longitude);

        closestStopDistances[stopId] = distance;

        if (distance < thisClosestDistance) {
            thisClosestDistance = distance;
            closestStop = stop;
            thisClosestStopId = stopId;
        }
    }

    closestStopId = thisClosestStopId;

    closestStopsMap = new Map(
        Object.entries(closestStopDistances)
            .sort(([, distanceA], [, distanceB]) => distanceA - distanceB)
    );

    if (popupStopId && popupStopId === thisClosestStopId && (closestDistance < maxDistanceMiles || settings['toggle-bypass-max-distance'])) {
        $('.closest-stop').show();
    }

    // OLD CONFLICTING HANDLER - COMMENTED OUT
    /* $('.fly-closest-stop').off('click').click(function() {
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

        flyToStop(thisClosestStopId);
        const stopName = stopsData[thisClosestStopId]?.name;
        sa_event('btn_press', {
            'btn': 'fly_closest_stop',
            'stop_name': stopName
        });
    }); */

    closestDistance = thisClosestDistance;

    // Show buttons when user enters campus bounds (distance becomes acceptable)
    if (thisClosestDistance <= maxDistanceMiles || settings['toggle-bypass-max-distance']) {
        $('.centerme-wrapper').show();
        if (thisClosestStopId) {
            $('.fly-closest-stop-wrapper').show();
        }
    } else {
        // Hide buttons when user goes outside campus bounds
        $('.centerme-wrapper').hide();
        $('.fly-closest-stop-wrapper').hide();
    }

    return [closestStop, thisClosestStopId, thisClosestDistance]

}
 
function handleNearestStop(fly) {

    const [closestStop, thisClosestStopId, closestDistance] = updateNearestStop()    

    populateMeClosestStops();

    if (closestStop) {

        console.log(`Closest stop to user is ${closestStop.name} at a distance of ${closestDistance} miles.`);
        closestStopId = thisClosestStopId;

        if (closestDistance > maxDistanceMiles && !settings['toggle-bypass-max-distance']) {
            $('.centerme-wrapper').hide();
            return;
        }

        // Clear any existing watchPosition handler
        if (watchPositionId !== null) {
            navigator.geolocation.clearWatch(watchPositionId);
            watchPositionId = null;
        }

        // Remove any existing location marker
        if (window.locationMarker) {
            window.locationMarker.remove();
        }

        const locationMarker = L.marker(userPosition, 
            { icon: L.icon({
                iconUrl: 'img/location_marker.png',
                iconSize: [24, 24],
                iconAnchor: [12, 12],
            })
        }).addTo(map);
        
        // Store reference to location marker globally
        window.locationMarker = locationMarker;

        watchPositionId = navigator.geolocation.watchPosition((position) => {
            const newPosition = [position.coords.latitude, position.coords.longitude];
            
            const duration = 500;
            const steps = 60;
            const interval = duration / steps;
            let stepCount = 0;

            const animateMarker = () => {
                stepCount++;
                const lat = userPosition[0] + (newPosition[0] - userPosition[0]) * (stepCount / steps);
                const lng = userPosition[1] + (newPosition[1] - userPosition[1]) * (stepCount / steps);
                locationMarker.setLatLngPrecise([lat, lng]);

                if (stepCount < steps) {
                    setTimeout(animateMarker, interval);
                } else {
                    userPosition = newPosition; // Update the userPosition after animation completes
                    updateNearestStop();
                }
            };

            animateMarker(); // Start the animation
        });

        locationMarker.on('click', function() {
            $('.bus-info-popup, .stop-info-popup, .bus-stopped-for').hide();  
            $('.my-location-popup').show();
            // map.flyTo(userPosition, 18, {
            //     animate: true,
            //     duration: 0.3
            // });
        })

        $('.fly-closest-stop-wrapper').fadeIn();
        if (settings['toggle-select-closest-stop'] && fly && !panelRoute && !$('.settings-panel').is(':visible') && !mapDragged && closestDistance < 3 && !popupBusId && !popupStopId && !shownRoute) {
            sourceStopId = null;
            sourceBusId = null;
            if (!sharedBus) {
                flyToStop(thisClosestStopId, false); // false indicates automatic navigation, no analytics event
                console.log("Flying to closest stop");
            }    
        } else {
            console.log("Not flying to closest stop");
        }

        // console.log(popupStopId)
        // console.log(thisClosestStopId)
        // console.log(popupStopId === thisClosestStopId)

    } else {
        console.log('No stops found within the given data.');
    }
}


function findNearestStop(fly) {
    
    console.log("Trying to find nearest stop...");

    if (userPosition) {
        console.log("User position already exists");
        $('.getting-location-popup').fadeOut(300);
        handleNearestStop(fly);
        return;
    }

    console.log("Trying getCurrentPosition");
    $('.getting-location-popup').fadeIn(300);

    navigator.geolocation.getCurrentPosition((position) => {

        console.log("Got position!");

        $('.getting-location-popup').fadeOut(300);

        const userLat = position.coords.latitude;
        const userLong = position.coords.longitude;
        userPosition = [userLat, userLong];

        handleNearestStop(fly);

        localStorage.setItem('locationShared', 'true');

        // generate closestStopDistances object where the keys are stop ids and values are distances

    }, (error) => {
        $('.getting-location-popup').fadeOut(300);
        console.error('Error getting user location:', error);
        console.log(error.code)
        if (error.code === 1) {
            localStorage.setItem('locationShared', 'false')
        }
    }, {
        enableHighAccuracy: true,
    });
}

async function checkIfLocationShared() {
    const permissionStatus = await navigator.permissions.query({ name: 'geolocation' });

    const lsLocationShared = localStorage.getItem('locationShared');
    locationShared = lsLocationShared === 'true';
    
    // console.log("(localStorage) Location shared: ", locationShared)
    // console.log("geolocation permission state: ", permissionStatus.state)
    if (permissionStatus.state === 'granted' || locationShared) {
        findNearestStop(true);
    }
}

function flyToStop(stopId, fromUserInteraction = false) {
    const stopData = stopsData[stopId];
    const lat = Number(stopData.latitude);
    const long = Number(stopData.longitude);
    const loc = { lat, long };

    map.flyTo(
        [loc.lat, loc.long],
        15,
        {
            animate: true,
            duration: 0.5
        }
    );

    popStopInfo(Number(stopId));

    // Only send analytics event if this was from explicit user interaction
    if (fromUserInteraction) {
        const stopName = stopsData[stopId]?.name;
        sa_event('btn_press', {
            'btn': 'fly_closest_stop',
            'stop_name': stopName
        });
    }
}

function flyToClosestStop() {
    if (closestStopId) {
        const $btn = $('.fly-closest-stop');

        // Check if we're already at closest stop and haven't moved since
        if ($btn.hasClass('btn-feedback-active')) {
            const stopData = stopsData[closestStopId];
            const currentCenter = map.getCenter();
            const stopLatLng = L.latLng(stopData.latitude, stopData.longitude);
            const distance = currentCenter.distanceTo(stopLatLng);

            // If we're still at the closest stop (within ~1 meter), don't allow another press
            if (distance < 1) {
                return;
            }
        }

        // Mark that fly-to-closest-stop is in progress to prevent clearing feedback during operation
        $btn.data('fly-to-closest-stop-in-progress', true);

        // Apply feedback state immediately and keep it active until map moves
        $btn.addClass('btn-feedback-active');

        // Set up immediate drag handler to clear feedback if user interrupts animation
        const immediateDragHandler = () => {
            $btn.removeClass('btn-feedback-active');
            $btn.removeData('fly-to-closest-stop-in-progress');
            map.off('dragstart', immediateDragHandler);
        };
        map.on('dragstart', immediateDragHandler);

        // Clear panout background since we're moving the map
        clearPanoutFeedback();
        
        // Set up fly-to-closest-stop feedback clearing after flyTo animation completes
        const onFlyToComplete = () => {
            // Mark fly-to-closest-stop as no longer in progress
            $btn.removeData('fly-to-closest-stop-in-progress');
            // Set up drag handler to clear fly-to-closest-stop feedback when user manually moves map
            // (only if the immediate handler hasn't already been triggered)
            if ($btn.hasClass('btn-feedback-active')) {
                const flyToClosestStopDragHandler = () => {
                    // Clear feedback directly since we know the operation is complete
                    $btn.removeClass('btn-feedback-active');
                    map.off('dragstart', flyToClosestStopDragHandler);
                };
                map.on('dragstart', flyToClosestStopDragHandler);
            }
        };

        // Use a timeout to ensure feedback stays active for the animation duration
        setTimeout(() => {
            onFlyToComplete();
        }, 600); // Slightly longer than the 0.5s animation duration
        
        flyToStop(closestStopId, true); // true indicates this is from user interaction
    }
}


function populateMeClosestStops() {

    if (!closestStopsMap) { return; }

    $('.closest-stops-list').empty();
    
    let count = 0;
    
    for (const [stopId, distance] of closestStopsMap) {

        if (!activeStops.includes(parseInt(stopId))) continue;
        
        const stopNameDiv = $(`<div class="name pointer">${stopsData[stopId].name}</div>`).click(() => { 
            clearPanoutFeedback();
            flyToStop(stopId);
        })
        const stopDistDiv = $(`<div class="dist bold pointer">${Math.round((distance*1000*3.28)).toLocaleString()}ft</div>`).click(() => { 
            clearPanoutFeedback();
            flyToStop(stopId);
        }) // add meter option later

        if (count >= 3) {
            stopNameDiv.hide();
            stopDistDiv.hide();
        }

        $('.closest-stops-list').append(stopNameDiv);
        $('.closest-stops-list').append(stopDistDiv);

        const $routesHereDiv = $(`<div class="flex gap-0p5rem mb-1rem" style="flex-wrap: wrap;"></div>`)

        // console.log(stopId)
        const busesHere = routesServicing(parseInt(stopId))
        // console.log(busesHere)
        busesHere.forEach(route => {
            $routesHereDiv.append($(`<div class="route-here route-here-${route} pointer">${route.toUpperCase()} ${Math.ceil(getSoonestBus(parseInt(stopId), route)[1] % 60)}m</div>`)
            .css('background-color', colorMappings[route])
            .click(function() {
                $('.my-location-popup').hide(); // instead of slow fade out
                clearPanoutFeedback();
                toggleRoute(route);
                flyToStop(stopId);
            }))
        })

        if (count >= 3) {
            $routesHereDiv.hide();
        }

        $('.closest-stops-list').append($routesHereDiv)

        count++;
    }

    const $showAllStops = $(`<div class="center m-1rem text-1p3rem pointer" style="grid-column: span 2; color: var(--theme-color)">▼ Show All Stops</div>`)
    .click(function() {
        const $allDivs = $('.closest-stops-list > div:not(:last-child)');
        const $hiddenDivs = $allDivs.filter(':hidden');
        
        if ($hiddenDivs.length > 0) {
            $allDivs.slideDown();
            $(this).text('▲ Hide Extra Stops');
        } else {
            $allDivs.slice(9).slideUp();
            $(this).text('▼ Show Closest Stops');
        }
    })

    $('.closest-stops-list').append($showAllStops);

}


async function getBuildNumber() {
    $.ajax({
        url: 'https://api.github.com/repos/JoyousJohn/rubus-client/commits?per_page=1', // &page = 1
        type: 'GET',
        success: function(data, textStatus, jqXHR) {

            let commitDate = new Date(data[0]['commit']['committer']['date']);
            let month = commitDate.getMonth() + 1;
            let day = commitDate.getDate();
            commitDate = month + '/' + day;

            const linkHeader = jqXHR.getResponseHeader('Link'); // Get the 'Link' header
            const lastPage = parseInt(linkHeader.match(/page=(\d+)>; rel="last"/)[1]);
            $('.build-number').text(`- Version a${lastPage - 473} (${commitDate}) - b${lastPage}`);
            // $('.build-number').text('- V' + (lastPage - 473) + ' | Build' + lastPage + ' (' + commitDate + ')');
        }
    });
}


let selectedTheme = 'auto';

function selectTheme(theme) {

    if (theme !== 'confirm' && theme === selectedTheme) {
        return;
    }

    if (theme === 'confirm') {
        $('.theme-modal').fadeOut();
        setDefaultSettings();
        settings['theme'] = selectedTheme;
        localStorage.setItem('settings', JSON.stringify(settings));

        let activeTheme = selectedTheme;
        if (selectedTheme === 'auto') {
            const currentHour = new Date().getHours();
            activeTheme = (currentHour <= 7 || currentHour >= 18) ? 'dark' : 'light';
        }

        $(`[theme-option="${selectedTheme}"]`).addClass('settings-selected');

        // Update the global attributes on confirm
        document.documentElement.setAttribute('data-selected-theme', selectedTheme);
        changeMapStyle(activeTheme);
        launchFireworks(12);
        return;
    }

    // Update slider selection
    document.querySelectorAll('.theme-option').forEach(opt => {
        opt.classList.remove('selected');
    });
    document.querySelector(`[data-theme="${theme}"]`).classList.add('selected');
    
    selectedTheme = theme;
    let previewTheme = theme;
    if (theme === 'auto') {
        const currentHour = new Date().getHours();
        previewTheme = (currentHour <= 7 || currentHour >= 18) ? 'dark' : 'light';
    }
    document.getElementById('theme-preview-img').src = `img/theme-select/${previewTheme}.png`;
    
    // Immediately update the global theme attributes and styles.
    document.documentElement.setAttribute('data-selected-theme', theme);
    changeMapStyle(previewTheme);
}

window.continueToCampusModal = function() {
    $('.theme-modal').hide();
    $('.campus-modal').css('display', 'flex');
    requestAnimationFrame(() => {
        window.centerCampusCarouselToNBInstant(true);
    });
};