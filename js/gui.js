let longPressTimer

function populateRouteSelectors(activeRoutes) {
    $('.route-selectors > div').not('.settings-btn').remove();

    if (!activeRoutes) return;

    let routesArray;

    try {
        routesArray = Array.from(activeRoutes);
    } catch (error) {
        console.error('Error converting activeRoutes to array:', error);
        console.log(routesArray);
        console.log(typeof routesArray);
    }

    if (routesArray.includes('ftbl')) {
        routesArray = routesArray.filter(route => route !== 'ftbl');
        routesArray.push('ftbl');
    }

    routesArray = routesArray.map(route => route || 'undefined');
    routesArray.sort((a, b) => {
        if (a === 'undefined') return 1;
        if (b === 'undefined') return -1;
        return a.localeCompare(b);
    });

    if ($('.favs > div').length) {
        routesArray.unshift('fav');
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

        const knownRoutes = ['fav', 'a', 'b', 'bhe', 'ee', 'f', 'h', 'lx', 'on1', 'on2', 'rexb', 'rexl', 'wknd1', 'wknd2', 'c', 'ftbl', 'all', 'winter1', 'winter2', 'bl']

        if (knownRoutes.includes(route)) {
            color = colorMappings[route]

            let initialX; // Declare initialX outside to access it later

            $routeElm.on('touchstart mousedown', function(event) {
                event.preventDefault();

                initialX = event.pageX || event.originalEvent.touches[0].pageX; // Store initial position
              
                longPressTimer = setTimeout(() => {
    
                    isLongPress = true;
                    if (shownRoute) {
                        shownBeforeRoute = shownRoute;
                    }

                    if (panelRoute !== route && route !== 'fav') {
                        selectedRoute(route);
                    }
                    
                }, 500); 
            });

            $routeElm.on('touchmove', function(event) {
        
                const moved = Math.abs(initialX - event.changedTouches[0].clientX) > 10;
                if (!moved) { return; }

                clearTimeout(longPressTimer);
            })

            $routeElm.on('touchend touchcancel mouseup', function() {
                clearTimeout(longPressTimer);
            });

            $routeElm.on('click touchend', function(event) {

                const moved = Math.abs(initialX - (event.originalEvent.clientX || event.changedTouches[0].clientX)) > 10;

                if (!isLongPress && !moved) {

                    if (panelRoute && route !== 'fav') {
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
        $('.settings-btn').before($routeElm);
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
        startX = e.pageX || e.originalEvent.touches[0].pageX;
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
        
        const x = e.pageX || e.originalEvent.touches[0].pageX;
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
    });

}

let shownRoute;  
let shownBeforeRoute;
let isLongPress = false; // Flag to track if a long press occurred

function toggleRouteSelectors(route) {

    console.log("Toggline for: " + route);

    if (shownRoute === route) {

        console.log('1');

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

    $('.favs').show(); //for when immediately pressing a route selector from entering into the shared bus screen
}

function hideAllStops() {
    for (const polyline in polylines) {
        const stopIdsForRoute = stopLists[polyline]
        stopIdsForRoute.forEach(stopId => {
            busStopMarkers[stopId].remove();
        })
    }    
}

function hideStopsExcept(excludedRoute) {
    const stopIdsForSelectedRoute = stopLists[excludedRoute]
    for (const polyline in polylines) {
        const stopIdsForRoute = stopLists[polyline]
        stopIdsForRoute.forEach(stopId => {
            if (!(stopIdsForSelectedRoute).includes(stopId)) {
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

    const routeBuses = busesByRoutes[route]

    try {
        stopLists[route].forEach(stopId => {
            let lowestETA = Infinity;
            let lowestBusId;
    
            routeBuses.forEach(busId => {
                if (busETAs[busId]) {
                    const eta = busETAs[busId][stopId]
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
        console.log(`Error updating tooltips for route ${route}: ${error}`)
    }
    
}

function toggleRoute(route) {

    if (route === 'fav') { toggleFavorites(); return; }

    // Show all polylines and buses
    if (shownRoute === route) {
        showAllPolylines();  
        showAllBuses();
        showAllStops();
        
        if (!popupStopId) {
            map.fitBounds(polylineBounds) 
        }
        else {
            updateStopBuses(popupStopId);
        }

        $('[stop-eta]').text('').hide();

    // Hide other polylines and buses
    } else {

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

        console.log(route)
        polylines[route].setStyle({ opacity: 1 }); // show this one if it was prev hidden

        if (!popupStopId) {
            map.fitBounds(polylines[route].getBounds(), { padding: [10, 10] });
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

    toggleRouteSelectors(route)

}

let panelRoute;

function selectedRoute(route) {

    if (panelRoute === route) {
        closeRouteMenu()
        return
    }

    if (shownRoute !== route) {
        toggleRouteSelectors(route)
    }

    $('.route-name').text(route.toUpperCase()).css('color', colorMappings[route])
    $('.route-campuses').text(campusMappings[route])
    $('.color-circle').css('background-color', colorMappings[route])
    $('.route-active-buses').text(busesByRoutes[route].length === 1 ? '1 bus running' : busesByRoutes[route].length + ' buses running')

    $('.active-buses').empty();
    busesByRoutes[route].forEach(busId => {

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

    if (!panelRoute) {
        $('.route-close').css('display', 'flex').css('height', $('.route-selector').innerHeight())
        $('.panout, .buses-btn, .centerme, .fly-closest-stop, .satellite-btn, .shoot-fireworks, .all-stops').fadeOut('fast');
        $('.settings-btn').hide();
        $('.route-panel').slideDown('fast');

        if (isDesktop) {
            const routeSelectorsWidth = $('.route-selectors').width() / parseFloat(getComputedStyle(document.documentElement).fontSize) + 2;
            $('.route-panel').css('padding-left', routeSelectorsWidth + 'rem');
        }

    }


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
        busesByRoutes[route].forEach(busId => {
            if (progressToNextStop(busId) < 1) { // have to debug why some stops are missed - prob a passio location issue, right?
                positiveBuses.push(busId);
            }
        })

        // Sort bus IDs based on their ETA
        positiveBuses
            .sort((a, b) => {
                const getETA = (busId) => {
                    
                    if ((route === 'wknd1' || route === 'all' || route === 'winter1' || route === 'on1') && stopId === 3 && busETAs[busId] && busETAs[busId][stopId] && previousStopId) {
                        if (busData[busId].at_stop && stopId == busData[busId].stopId[0] && previousStopId == busData[busId].stopId[1]) {
                            return 0;
                        }
                        // Use the previous stop to determine which 'via' path to use
                        return busETAs[busId][stopId]['via'][previousStopId] || Infinity;
                    } else if (busData[busId].at_stop && (Array.isArray(busData[busId].stopId) ? stopId === busData[busId].stopId[0] : stopId === busData[busId].stopId)) {
                        return 0;
                    }
                    return busETAs[busId] ? busETAs[busId][stopId] : Infinity;
                };
                return Math.round(getETA(a) / 60) - Math.round(getETA(b) / 60);
            })
            .forEach(busId => {

                let thisStopIndex = index;
                // console.log(index);
                let busIndex = -1;
                
                if ((route === 'wknd1' || route === 'all' || route === 'winter1' || route === 'on1') && busData[busId].stopId == 3) {
                    // For these routes, find where current stop follows the previous stop in the route
                    
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
                    // If not found, fall back to first occurrence
                    if (busIndex === -1) {
                        busIndex = stopLists[route].indexOf(busData[busId].stopId);
                    }

                } else {
                    busIndex = stopLists[route].indexOf(busData[busId].stopId);
                }

                let stopsAway = thisStopIndex > busIndex 
                    ? thisStopIndex - busIndex - 1
                    : (stopLists[route].length - busIndex) + thisStopIndex - 1;

                console.log(stopsAway)

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
                    } else {
                        $gridElm.append(`<div class="rbfs-bn" onclick="(function() { flyToBus(${busId}); closeRouteMenu(); })();">${busData[busId].busName}</div>`);
                        if ((route === 'wknd1' || route === 'all' || route === 'winter1' || route === 'on1') && stopId === 3 && previousStopId && busETAs[busId][stopId]) {
                            // Use the previous stop to determine which 'via' path to use
                            // console.table(busETAs[busId][stopId]['via'])
                            eta = busETAs[busId][stopId]['via'][previousStopId];
                        } else {
                            eta = busETAs[busId][stopId];
                        }
                    }

                    if (eta !== undefined) {
                        $gridElm.append(`<div class="bold">${Math.ceil(eta/60)}m</div>`);

                        let stopsAwayText = '';

                        // if (stopsAway === 0 && !(((route === 'wknd1' || route === 'all') 
                        //     && stopId === 3 
                        //     && previousStopId  == busData[busId].stopId[1])))  {
                        //     stopsAwayText = 'En route';
                        if (!busData[busId].at_stop && stopsAway === 0) {
                            stopsAwayText = "En route";
                        } else if (stopsAway === 1) {
                            stopsAwayText = stopsAway + ' stop away';
                        } else {
                            stopsAwayText = stopsAway + ' stops away';
                        }

                        $gridElm.append(`<div class="align-right">${stopsAwayText}</div>`);
                    }
                }

                prevStopId = stopId;
                i++;
            });

        console.log('---')

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

    busesByRoutes[shownRoute].forEach(busId => {
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

    if (!routes) { 
        routes = Object.keys(busesByRoutes);
        $('.buses-overview-grid').children().not('.bus-overview-heading, .bus-overview-footer').remove();
    }

    if (routes.includes('undefined')) { // Should I even track this?
        routes = routes.filter(route => route !== 'undefined');
    }

    // console.log(`Updating bus overview for routes: ${routes.join(', ')}`)

    let totalRidership = 0;

    const routeData = routes.map(route => {
        routeRiderships[route] = 0;
        busesByRoutes[route].forEach(busId => {
            const riders = Math.ceil(busData[busId].capacity/100 * 57)
            routeRiderships[route] += riders;
            totalRidership += riders;
        });
        return { route, ridership: routeRiderships[route] };
    });

    routeData.sort((a, b) => b.ridership - a.ridership);

    routeData.forEach(({route}) => {
        if ($(`.bus-overview-ridership[route="${route}"]`).length === 0) {
            const $busName = $(`<div class="bus-overview-name bold">${route.toUpperCase()}</div>`).css('color', colorMappings[route]); // (${busesByRoutes[route].length})
            const $busRidership = $(`<div class="bus-overview-ridership" route="${route}">${routeRiderships[route]} riders</div>`);
            const $loopTime = $(`<div class="bus-overview-loop-time" route="${route}">${loopTimes[route]} min</div>`);
            const $footer = $('.buses-overview-grid > .bus-overview-footer').first();
            $footer.before($busName);
            $footer.before($busRidership);
            $footer.before($loopTime);
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
                    const nowTotalRidership = parseInt($('.total-ridership').text().split(' ')[0])
                    $('.total-ridership').text(`${nowTotalRidership + ridersChange} riding`).css('color', color).css('transition', 'color 0.25s');

                    setTimeout(() => {
                        $(`.bus-overview-ridership[route="${route}"], .total-ridership`).css('color', 'var(--theme-color-lighter)').css('transition', 'color 1s');
                    }, 1000);
                }, Math.random() * 5000);
            }
        }
    });

    if (!$('.total-ridership').text().length) {
        $('.total-ridership').text(totalRidership + ' riding');
    } else {
        const textTotalRidership = parseInt($('.total-ridership').text().split(' ')[0])
        if (textTotalRidership !== totalRidership) { // total became unsynced because of
            $('.total-ridership').text(totalRidership + ' riding'); // ^^ the autocomplete for that comment is so funny haha
        }
    }
}


function busesOverview() {

    if (!isDesktop) {
        $('.bottom, .leaflet-control-attribution').hide();
        $('.buses-close').addClass('flex');
        $('.buses-panel-wrapper').css('margin-left', 0);
    } else {
        const routeSelectorsWidth = $('.route-selectors').width() / parseFloat(getComputedStyle(document.documentElement).fontSize) + 2;
        $('.buses-panel-wrapper').css('margin-left', routeSelectorsWidth + 'rem');
        const leftBtnHeight = $('.left-btns').height();
        $('.buses-panel-wrapper').css('max-height', window.innerHeight - leftBtnHeight - 4 * parseFloat(getComputedStyle(document.documentElement).fontSize));
    }

    $('.buses-panel-wrapper').slideDown('fast');
    
    updateBusOverview();
    updateRidershipChart();
    updateWaitTimes();
}

let ridershipChart;

async function makeRidershipChart() {

    // const themeColor = getComputedStyle(document.documentElement).getPropertyValue('--theme-color').trim();

    const ctx = document.getElementById('ridership-chart').getContext('2d');
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
                        color: 'rgba(200, 200, 200, 0.3)'
                    }
                },
                x: {
                    grid: {
                        color: 'rgba(200, 200, 200, 0.3)'
                    },
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
    try {
        const response = await fetch('https://transloc.up.railway.app/ridership');
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
    'College Ave': [1, 2, 3, 4],
    'Busch': [5, 6, 7, 8, 9, 10, 11, 26],
    'Livingston': [12, 13, 14, 15, 24],
    'Cook': [16, 17, 18, 19, 20, 21],
    'Downtown': [22, 23]
}

function updateWaitTimes() {
    $('.wait-times').empty();
    for (const campus in stopsByCampus) {
        let hasStops = false;
        const $waitWrapper = $('<div class="grid grid-cols-2-auto gap-x-1rem gap-y-0p5rem"></div>')
        $waitWrapper.append($(`<div class="mt-1rem center bold-500 text-1p5rem mb-0p5rem" style="grid-column: span 2;">${campus}</div>`))
        const stops = stopsByCampus[campus];
        
        // Sort stops by wait time
        const sortedStops = stops.slice().sort((a, b) => {
            const waitA = waits[a] || Infinity;
            const waitB = waits[b] || Infinity;
            return waitB - waitA;
        });

        sortedStops.forEach(stopId => {
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


function closeRouteMenu() {
    $('.route-panel').slideUp('fast');
    $('.panout, .settings-btn, .buses-btn, .centerme, .fly-closest-stop, .satellite-btn, .shoot-fireworks, .all-stops').show();
    if (userLocation) {
        $('.fly-closest-stop').show();
    }

    $(this).hide();
    $('.route-close').hide();

    if (shownBeforeRoute && shownBeforeRoute !== panelRoute) {
        toggleRoute(shownBeforeRoute);
        shownBeforeRoute = null;
    } else if (!shownBeforeRoute) {
        toggleRouteSelectors(panelRoute);
    }

    panelRoute = null;
}

$('.route-close').click(function() {
    closeRouteMenu();
})

$('.settings-btn').on('touchstart click', function() { // why do i need touchstart here but not below? idk
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

$('.buses-close').click(function() {
    $('.buses-panel-wrapper').slideUp('fast');
    $('.bottom').show();
    $('.buses-close').removeClass('flex');
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
]

let defaultSettings = {
    'font': 'PP Neue Montreal',
    'marker_size': 'medium',
    'theme': 'auto',
    'toggle-show-etas-in-seconds': false,
    'toggle-select-closest-stop': true,
    'toggle-hide-other-routes': true,
    'toggle-stops-above-buses': false,
    'toggle-always-show-second': false,
    
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
    'toggle-show-bus-log': false,
    'toggle-show-extra-bus-data': false,
    'toggle-show-stop-id': false,
    'toggle-show-knight-mover': false,
    'toggle-polyline-padding': false,
    'toggle-show-invalid-etas': false,
    'toggle-show-rotation-points': false,
    'toggle-allow-iphone-preload': false,
    'toggle-show-rubus-ai': false,

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
    // $(`div.settings-option[theme-option="auto"]`).addClass('settings-selected')
    colorMappings = settings['colorMappings']
}

function updateSettings() {
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

        localStorage.setItem('settings', JSON.stringify(settings))

        document.documentElement.style.setProperty('--font-family', settings['font']);

        colorMappings = settings['colorMappings']

    } else {
        setDefaultSettings();
    }

    $(`div.settings-option[font-option="${settings['font']}"]`).addClass('settings-selected')
    $(`div.settings-option[marker-size-option="${settings['marker_size']}"]`).addClass('settings-selected')
    $(`div.settings-option[map-renderer-option="${settings['map-renderer']}"]`).addClass('settings-selected')
    $(`div.settings-option[bus-positioning-option="${settings['bus-positioning']}"]`).addClass('settings-selected')

    if (!$('.theme-modal').is(':visible')) {
        $(`div.settings-option[theme-option="${settings['theme']}"]`).addClass('settings-selected')
    }

    $('.settings-option').click(function() {
        if ($(this).hasClass('settings-selected')) { return; }

        const settingsOption = $(this).attr('settings-option')

        // console.log(settingsOption)
        if (settingsOption === 'font') {
            $(`div.settings-selected[settings-option="${settingsOption}"]`).removeClass('settings-selected')
            $(this).addClass('settings-selected')
            settings['font'] = $(this).attr('font-option')
            document.documentElement.style.setProperty('--font-family', settings['font']);
        }

        else if (settingsOption === 'marker_size') {
            
            $(`div.settings-selected[settings-option="${settingsOption}"]`).removeClass('settings-selected')
            $(this).addClass('settings-selected')
            settings['marker_size'] = $(this).attr('marker-size-option')
            updateMarkerSize()

        }

        else if (settingsOption === 'theme') {
            
            $(`div.settings-selected[settings-option="${settingsOption}"]`).removeClass('settings-selected')
            $(this).addClass('settings-selected')
            settings['theme'] = $(this).attr('theme-option')

            let theme = $(this).attr('theme-option')
            if (theme === 'auto') {
                const currentHour = new Date().getHours();
                theme = (currentHour <= 7 || currentHour >= 18) ? 'dark' : 'streets';
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

    getBuildNumber()
}

$(document).ready(function() {

    updateSettings();

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

    const outterDimensions = markerSizeMap[settings['marker_size']]
    const innerDimensions = innerSizeMap[settings['marker_size']]

    $('.bus-icon-outer').css('height', outterDimensions + 'px').css('width', outterDimensions + 'px');
    $('.bus-icon-inner').css('height', innerDimensions + 'px').css('width', innerDimensions + 'px');
}

let locationShared;
let userLocation;
let closestStopId;
let closestStopDistances = {};
let sortedClosestStopDistances = {};
let closestStopsMap;

function updateNearestStop() {
    let closestStop = null;
    let thisClosestStopId = null;
    let closestDistance = Infinity;

    const stopIds = activeStops.length > 0 ? activeStops : Object.keys(stopsData);

    const userLat = userPosition[0];
    const userLong = userPosition[1];

    for (const stopId of stopIds) {
        const stop = stopsData[stopId];
        const distance = haversine(userLat, userLong, stop.latitude, stop.longitude);

        closestStopDistances[stopId] = distance;

        if (distance < closestDistance) {
            closestDistance = distance;
            closestStop = stop;
            thisClosestStopId = stopId;
        }
    }

    closestStopId = closestStop;

    closestStopsMap = new Map(
        Object.entries(closestStopDistances)
            .sort(([, distanceA], [, distanceB]) => distanceA - distanceB)
    );

    if (popupStopId && popupStopId === thisClosestStopId) {
        $('.closest-stop').show();
    }

    $('.fly-closest-stop').off('click').click(function() { flyToStop(thisClosestStopId) });

    return [closestStop, thisClosestStopId, closestDistance]

}
 
function handleNearestStop(fly) {

    const [closestStop, thisClosestStopId, closestDistance] = updateNearestStop()    

    populateMeClosestStops();

    if (closestStop) {

        console.log(`Closest stop to user is ${closestStop.name} at a distance of ${closestDistance} miles.`);
        closestStopId = thisClosestStopId;

        if (closestDistance > 14) {
            $('.centerme-wrapper').hide();
            return;
        }

        const locationMarker = L.marker(userPosition, 
            { icon: L.icon({
                iconUrl: 'img/location_marker.png',
                iconSize: [24, 24],
                iconAnchor: [12, 12],
            })
        }).addTo(map);

        navigator.geolocation.watchPosition((position) => {
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
                flyToStop(thisClosestStopId);
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
    
    console.log("(localStorage) Location shared: ", locationShared)
    console.log("geolocation permission state: ", permissionStatus.state)
    if (permissionStatus.state === 'granted' || locationShared) {
        findNearestStop(true);
    }
}

function flyToStop(stopId) {
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
}


function populateMeClosestStops() {

    if (!closestStopsMap) { return; }

    $('.closest-stops-list').empty();
    
    let count = 0;
    
    for (const [stopId, distance] of closestStopsMap) {

        if (!activeStops.includes(parseInt(stopId))) continue;
        
        const stopNameDiv = $(`<div class="name pointer">${stopsData[stopId].name}</div>`).click(() => { flyToStop(stopId)})
        const stopDistDiv = $(`<div class="dist bold pointer">${Math.round((distance*1000*3.28)).toLocaleString()}ft</div>`).click(() => { flyToStop(stopId)}) // add meter option later

        if (count >= 3) {
            stopNameDiv.hide();
            stopDistDiv.hide();
        }

        $('.closest-stops-list').append(stopNameDiv);
        $('.closest-stops-list').append(stopDistDiv);

        const $routesHereDiv = $(`<div class="flex gap-x-0p5rem mb-1rem"></div>`)

        // console.log(stopId)
        const busesHere = routesServicing(parseInt(stopId))
        // console.log(busesHere)
        busesHere.forEach(route => {
            $routesHereDiv.append($(`<div class="route-here route-here-${route} pointer">${route.toUpperCase()}</div>`)
            .css('background-color', colorMappings[route])
            .click(function() {
                $('.my-location-popup').hide(); // instead of slow fade out
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
        url: 'https://api.github.com/repos/JoyousJohn/rubus-public/commits?per_page=1', // &page = 1
        type: 'GET',
        success: function(data, textStatus, jqXHR) {

            let commitDate = new Date(data[0]['commit']['committer']['date']);
            let month = commitDate.getMonth() + 1;
            let day = commitDate.getDate();
            commitDate = month + '/' + day;

            const linkHeader = jqXHR.getResponseHeader('Link'); // Get the 'Link' header
            const lastPage = linkHeader.match(/page=(\d+)>; rel="last"/)[1];
            $('.build-number').text('- Version b' + lastPage + ' (' + commitDate + ')');
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
        document.documentElement.setAttribute('theme', activeTheme);
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
    document.documentElement.setAttribute('theme', previewTheme);

    if (!tileLayer.options.id.includes('satellite')) {
        changeMapStyle(previewTheme);
    }
}