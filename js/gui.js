let longPressTimer
let _pendingThemeTimeout

let selectedCampusRoutes = [];

function populateRouteSelectors(allActiveRoutes, stopId = null) {
    // Drag/scroll state must be initialized before the selection-highlight block
    // below calls smoothScrollTo (declaration-before-use; binding is per-invocation,
    // fresh set created on each populate).
    const $selectorsContainer = $('.route-selectors');
    const previousScrollLeft = $selectorsContainer.scrollLeft();
    let isDragging = false;
    let startX = 0;
    let initialScrollLeft = 0;
    let lastX = 0;
    let lastTime = 0;
    let velocity = 0;
    let animationFrame = null;
    $('.route-selectors > div').not('.settings-btn, .sim-btn').not('.parking-campus-selector').remove();

    if (!allActiveRoutes) return;

    let allRoutesArray;

    try {
        allRoutesArray = Array.from(activeRoutes);
    } catch (error) {
        console.error('Error converting activeRoutes to array:', error);
        console.log(allRoutesArray);
        console.log(typeof allRoutesArray);
    }

    let routesArray = allRoutesArray.filter(route => getCampusRoutes(selectedCampus).includes(route));
    
    // If a stop is selected, filter routes to only show those that service this stop
    if (stopId !== null) {
        routesArray = routesArray.filter(route => {
            return stopLists[route] && stopLists[route].includes(stopId);
        });
    }

    routesArray = routesArray.map(route => route || 'undefined');
    
    // Separate routes with in-service buses from those without
    const routesWithInServiceBuses = [];
    const routesWithoutInServiceBuses = [];
    
    routesArray.forEach(route => {
        if (route === 'undefined') {
            routesWithoutInServiceBuses.push(route);
        } else if (routeHasInServiceBuses(route)) {
            routesWithInServiceBuses.push(route);
        } else {
            routesWithoutInServiceBuses.push(route);
        }
    });
    
    // Sort in-service routes: favorited first, then non-favorited (alphabetical)
    const favInService = routesWithInServiceBuses.filter(r => typeof isRouteFavorite === 'function' && isRouteFavorite(r)).sort((a, b) => a.localeCompare(b));
    const nonFavInService = routesWithInServiceBuses.filter(r => !(typeof isRouteFavorite === 'function' && isRouteFavorite(r))).sort((a, b) => a.localeCompare(b));
    const sortedInService = [...favInService, ...nonFavInService];
    
    // Combine arrays: in-service routes first, then out-of-service routes
    if (settings['toggle-show-out-of-service']) {
        const favOutOfService = routesWithoutInServiceBuses.filter(r => typeof isRouteFavorite === 'function' && isRouteFavorite(r)).sort((a, b) => a.localeCompare(b));
        const nonFavOutOfService = routesWithoutInServiceBuses.filter(r => !(typeof isRouteFavorite === 'function' && isRouteFavorite(r))).sort((a, b) => a.localeCompare(b));
        const sortedOutOfService = [...favOutOfService, ...nonFavOutOfService];
        routesArray = [...sortedInService, ...sortedOutOfService];
    } else {
        routesArray = routesArray.filter(route => route === 'undefined' || routeHasValidInServiceBuses(route));
        const favRoutes = routesArray.filter(r => typeof isRouteFavorite === 'function' && isRouteFavorite(r)).sort((a, b) => a.localeCompare(b));
        const nonFavRoutes = routesArray.filter(r => !(typeof isRouteFavorite === 'function' && isRouteFavorite(r))).sort((a, b) => a.localeCompare(b));
        routesArray = [...favRoutes, ...nonFavRoutes];
    }
    
	if (routesArray.includes('on2')) {
		routesArray = routesArray.filter(route => route !== 'on2');
		routesArray.unshift('on2');
	}
	if (routesArray.includes('on1')) {
		routesArray = routesArray.filter(route => route !== 'on1');
		routesArray.unshift('on1');
	}

    if (routesArray.includes('summer2')) {
        routesArray = routesArray.filter(route => route !== 'summer2');
        routesArray.unshift('summer2');
    }
    if (routesArray.includes('summer1')) {
        routesArray = routesArray.filter(route => route !== 'summer1');
        routesArray.unshift('summer1');
    }

    if (routesArray.includes('wknd2')) {
        routesArray = routesArray.filter(route => route !== 'wknd2');
        routesArray.unshift('wknd2');
    }
    if (routesArray.includes('wknd1')) {
        routesArray = routesArray.filter(route => route !== 'wknd1');
        routesArray.unshift('wknd1');
    }

    // Favorited routes should always show up first
    if (typeof isRouteFavorite === 'function') {
        const favRoutesInList = routesArray.filter(r => isRouteFavorite(r));
        if (favRoutesInList.length > 0) {
            routesArray = routesArray.filter(r => !isRouteFavorite(r));
            routesArray.unshift(...favRoutesInList);
        }
    }

    if ($('.favs > div').length) {
        routesArray.unshift('fav');
    }

    if (routesArray.includes('ftbl')) {
        routesArray = routesArray.filter(route => route !== 'ftbl');
        routesArray.push('ftbl');
    }

    if (routesArray.includes('helix') && !isRouteFavorite('helix')) {
        routesArray = routesArray.filter(route => route !== 'helix');
        routesArray.push('helix');
    }

    if (routesArray.includes('kbs') && !isRouteFavorite('kbs')) {
        routesArray = routesArray.filter(route => route !== 'kbs');
        routesArray.push('kbs');
    }

    // This settings toggle reverses the routes somewhere else
	if (!settings['toggle-settings-btn-end']) {
		routesArray.reverse();
	}

    // Add parking campus route selector if campus is selected
    const parkingCampus = settings['parking-campus'];
    if (parkingCampus && parkingCampus !== false) {
        addParkingCampusRouteSelector();
    }

    routesArray.forEach(route => {

        let routeFormatted = route;
        if (route == 'bl') {
            routeFormatted = 'b/l';
        } else if (route == 'helix') {
            routeFormatted = 'hlx';
        }

        let $routeElm;

        if (route === 'fav') {
            $routeElm = $(`<div class="route-selector flex justify-center align-center" routeName="${route}" style="padding: 0.5rem; aspect-ratio: 1;"><i class="fa-solid fa-star"></i></div>`).css('background-color', 'gold')
        } else {
            const isFav = typeof isRouteFavorite === 'function' && isRouteFavorite(route);
            const favStarHtml = isFav ? ` <i class="route-pill-star fa-solid fa-star"></i>` : '';
            $routeElm = $(`<div class="route-selector" routeName="${route}">${routeFormatted.toUpperCase()}${favStarHtml}</div>`);
            if (isFav) {
                $routeElm.addClass('is-favorite-route');
            }
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

            const elem = $routeElm[0];
            const handleTouchStart = function(event) {
                const touch = (event.touches && event.touches[0]) || (event.originalEvent && event.originalEvent.touches && event.originalEvent.touches[0]);
                initialX = event.pageX || (touch ? touch.pageX : 0); // Store initial position

                // Store the original route state BEFORE any click/long-press processing
                if (!routePanelOpenedFromLongPress) {
                    shownBeforeRoute = shownRoute;
                    console.log('Storing shownBeforeRoute before interaction:', shownBeforeRoute);
                }

                longPressTimer = setTimeout(() => {
                    isLongPress = true;
                    console.log('Long press triggered for route:', route);
                    // Remember current map selection state so we can restore it on close
                    routePanelOpenedFromLongPress = true;

                    if (panelRoute !== route && route !== 'fav') {
                        console.log('Calling selectedRoute from long press while in subpanel');
                        selectedRoute(route);
                    }
                }, 500); 
            };

            const handleTouchMove = function(event) {
                const touch = (event.changedTouches && event.changedTouches[0]) || (event.originalEvent && event.originalEvent.changedTouches && event.originalEvent.changedTouches[0]);
                const moved = Math.abs(initialX - (touch ? touch.clientX : 0)) > 10;
                if (!moved) { return; }

                clearTimeout(longPressTimer);
            };

            if (elem) {
                elem.addEventListener('touchstart', handleTouchStart, { passive: true });
                elem.addEventListener('touchmove', handleTouchMove, { passive: true });
            }
            $routeElm.on('mousedown', handleTouchStart);

            $routeElm.on('touchend touchcancel mouseup', function() {
                clearTimeout(longPressTimer);
            });

            $routeElm.on('click', function(event) {

                const moved = Math.abs(initialX - (event.originalEvent.clientX || (event.changedTouches && event.changedTouches[0] ? event.changedTouches[0].clientX : 0))) > 10;

                // Determine if routes subpanel is active BEFORE long-press gating
                const routesTabActive = $('.info-panels-show-hide-wrapper').is(':visible') && $('.route-panel-wrapper').is(':visible');

                // Allow immediate taps inside routes subpanel regardless of prior long-press
                if ((routesTabActive || panelRoute) && !moved) {
                    if (route !== 'fav') {
                        selectedRoute(route);
                    } else if (!panelRoute && route === 'fav') {
                        toggleRouteSelectors('fav');
                        toggleFavorites();
                    }
                    isLongPress = false;
                    return;
                }

                // Otherwise, apply normal gating outside of panels
                if (!isLongPress && !moved) {
                    if (route !== 'fav') {
                        toggleRoute(route);
                    } else if (!panelRoute && route === 'fav') {
                        toggleRouteSelectors('fav');
                        toggleFavorites();
                    }
                }
                isLongPress = false;
            })
        }

        const hasInService = routeHasInServiceBuses(route);
        if (!hasInService) color = 'gray';
        $routeElm.css('background-color', color).css('opacity', hasInService ? '1' : '0.5');
        
        // Check if settings button should be at the end
        if (settings['toggle-settings-btn-end']) {
            $('.settings-btn').before($routeElm);
        } else {
            $('.settings-btn').after($routeElm);
        }
        
        // Convert icons after adding to DOM
        if (route === 'fav' || (typeof isRouteFavorite === 'function' && isRouteFavorite(route))) {
            replaceFontAwesomeIcons();
        }
    });

    // Ensure sim-btn appears after settings button and all route selectors
    $('.route-selectors').append($('.sim-btn'));

    // Apply selection styling to the currently selected route if it exists in the filtered routes
    let didCenterScroll = false;
    if (shownRoute) {
        // Use the existing toggleRouteSelectors logic to select the route
        $('.route-selector').not('.parking-campus-selector').not('.settings-btn').each(function() {
            const rn = $(this).attr('routeName');
            if (rn && rn !== shownRoute) {
                const rnInService = routeHasInServiceBuses(rn);
                $(this).css('background-color', 'gray').css('opacity', rnInService ? '1' : '0.5');
            }
        });

        if (routesArray.includes(shownRoute)) {
            // Always use the route color when selected, regardless of in-service status
            const selectedRouteColor = colorMappings[shownRoute];
            $(`.route-selector[routeName="${shownRoute}"]`).css('background-color', selectedRouteColor).css('box-shadow', `0 0 10px ${selectedRouteColor}`).css('opacity', '1')

            const container = $('.route-selectors');

            if (container[0].scrollWidth > $(document).width()) {
                const element = $(`.route-selector[routeName="${shownRoute}"]`);
                const containerWidth = container.width();
                const elementWidth = element.outerWidth();

                const scrollTo = element.position().left - (containerWidth / 2) + (elementWidth / 2) + container.scrollLeft();
                
                smoothScrollTo(scrollTo, 200);
                didCenterScroll = true;
            }
        }
    }

    if (!didCenterScroll) {
        const containerEl = $selectorsContainer[0];
        if (containerEl) {
            const maxScroll = containerEl.scrollWidth - containerEl.clientWidth;
            const clamped = Math.max(0, Math.min(previousScrollLeft, maxScroll));
            if (Math.abs(containerEl.scrollLeft - clamped) > 0.5) {
                $selectorsContainer.scrollLeft(clamped);
            }
        }
    }

    function stopSelectorAnimation() {
        if (animationFrame) {
            cancelAnimationFrame(animationFrame);
            animationFrame = null;
        }
        $selectorsContainer.stop(true);
    }

    function smoothScrollTo(target, duration = 220) {
        stopSelectorAnimation();
        const containerEl = $selectorsContainer[0];
        if (!containerEl) return;
        const maxScroll = containerEl.scrollWidth - containerEl.clientWidth;
        const clampedTarget = Math.max(0, Math.min(target, maxScroll));
        const start = containerEl.scrollLeft;
        const change = clampedTarget - start;
        if (Math.abs(change) < 0.5) return;

        const startTime = performance.now();

        function step(now) {
            const elapsed = now - startTime;
            const t = Math.min(1, elapsed / duration);
            // Smooth ease-out cubic curve (synced to display refresh rate)
            const ease = 1 - Math.pow(1 - t, 3);
            containerEl.scrollLeft = start + change * ease;

            if (t < 1) {
                animationFrame = requestAnimationFrame(step);
            } else {
                containerEl.scrollLeft = clampedTarget;
                animationFrame = null;
            }
        }
        animationFrame = requestAnimationFrame(step);
    }

    $selectorsContainer
    .off('mousedown mouseleave mouseup mousemove touchstart touchend touchcancel touchmove wheel')
    .on('mousedown touchstart', function(e) {
        stopSelectorAnimation();
        isDragging = true;
        const pageX = e.pageX || (e.originalEvent && e.originalEvent.touches && e.originalEvent.touches[0] ? e.originalEvent.touches[0].pageX : 0);
        startX = pageX;
        lastX = pageX;
        initialScrollLeft = this.scrollLeft;
        lastTime = performance.now();
        velocity = 0;
        
        if (e.type !== 'touchstart') {
            e.preventDefault();
        }
    })
    .on('mousemove touchmove', function(e) {
        if (!isDragging) return;
        
        const pageX = e.pageX || (e.originalEvent && e.originalEvent.touches && e.originalEvent.touches[0] ? e.originalEvent.touches[0].pageX : 0);
        const currentTime = performance.now();
        const timeDiff = currentTime - lastTime;
        
        if (timeDiff > 0) {
            const distance = pageX - lastX;
            const instantVelocity = (distance / timeDiff) * 16.667;
            velocity = velocity ? (velocity * 0.35 + instantVelocity * 0.65) : instantVelocity;
            lastX = pageX;
            lastTime = currentTime;
        }
        
        const walk = pageX - startX;
        this.scrollLeft = initialScrollLeft - walk;
        
        if (e.type === 'touchmove') {
            if (Math.abs(pageX - startX) > 6) {
                e.preventDefault();
            }
        } else {
            e.preventDefault();
        }
    })
    .on('mouseleave mouseup touchend touchcancel', function() {
        if (!isDragging) return;
        isDragging = false;
        
        const containerEl = this;
        const maxScroll = containerEl.scrollWidth - containerEl.clientWidth;
        if (maxScroll <= 0) return;

        const currentTime = performance.now();
        const timeSinceLastMove = currentTime - lastTime;
        const currentScroll = containerEl.scrollLeft;

        // If the finger/mouse paused for more than 60ms before release, clear velocity
        if (timeSinceLastMove > 60) {
            velocity = 0;
        }

        const totalDragDistance = lastX - startX; // negative = dragged left (scrolled right toward end)
        const absVelocity = Math.abs(velocity);

        // Thresholds for snapping to the end/start vs natural momentum
        const SNAP_VELOCITY_THRESHOLD = 12; // Fast flick (pixels per frame at 60fps)
        const SNAP_DISTANCE_THRESHOLD = 50; // Must drag at least 50px to qualify for snap-to-end
        const FLING_MIN_VELOCITY = 2.0;     // Minimum speed for moderate momentum

        // 1. FAST & FAR FLING -> SNAP TO END OR START (smooth ease-out rAF)
        const isFlickToEnd = totalDragDistance < -SNAP_DISTANCE_THRESHOLD && velocity < -SNAP_VELOCITY_THRESHOLD;
        const isFlickToStart = totalDragDistance > SNAP_DISTANCE_THRESHOLD && velocity > SNAP_VELOCITY_THRESHOLD;
        const isNearEnd = currentScroll > (maxScroll - 35) && velocity < 0;
        const isNearStart = currentScroll < 35 && velocity > 0;

        if (isFlickToEnd || isNearEnd) {
            smoothScrollTo(maxScroll, 220);
            return;
        }

        if (isFlickToStart || isNearStart) {
            smoothScrollTo(0, 220);
            return;
        }

        // 2. MODERATE FLING -> NATURAL MOMENTUM (High-precision subpixel float decay)
        if (absVelocity >= FLING_MIN_VELOCITY) {
            let currentScrollPos = currentScroll;
            let currentVelocity = velocity;
            let lastFrameTime = performance.now();

            function animateInertia(now) {
                const dt = Math.min(32, Math.max(1, now - lastFrameTime));
                lastFrameTime = now;
                const dtFactor = dt / 16.667;

                if (Math.abs(currentVelocity) < 0.15) {
                    stopSelectorAnimation();
                    return;
                }

                currentScrollPos -= currentVelocity * dtFactor;
                currentVelocity *= Math.pow(0.92, dtFactor);

                if (currentScrollPos <= 0) {
                    containerEl.scrollLeft = 0;
                    stopSelectorAnimation();
                    return;
                }
                if (currentScrollPos >= maxScroll) {
                    containerEl.scrollLeft = maxScroll;
                    stopSelectorAnimation();
                    return;
                }

                containerEl.scrollLeft = currentScrollPos;
                animationFrame = requestAnimationFrame(animateInertia);
            }

            animationFrame = requestAnimationFrame(animateInertia);
            return;
        }

        // 3. SHORT / SLOW DRAG -> STAYS EXACTLY WHERE RELEASED
    })
    .on('wheel', function(event) {
        event.preventDefault();
        stopSelectorAnimation();
        const newScrollLeft = this.scrollLeft + event.originalEvent.deltaY;
        smoothScrollTo(newScrollLeft, 120);
    });

}

// Get display name for campus
function getCampusDisplayName(campus) {
    // Map full campus names to display names
    const displayNames = {
        'Busch': 'Busch',
        'Livingston': 'Livi',
        'College Ave': 'CA',
        'Cook': 'Cook',
        'Douglass': 'Douglas'
    };
    return displayNames[campus] || campus;
}

function addParkingCampusRouteSelector() {
    // Check if parking campus selector already exists
    if ($('.parking-campus-selector').length > 0) {
        return;
    }

    const isInPermitMode = $('body').hasClass('parking-permit-mode');
    
    const $routeElm = $(`
        <div class="route-selector parking-campus-selector" routeName="parking-permit" style="background-color: white; color: black; font-weight: bold; ${isInPermitMode ? 'white-space: nowrap; padding-left: 1rem;' : 'display: flex; align-items: center; justify-content: center; padding: 0.5rem; aspect-ratio: 1;'} box-shadow: none;">
            <i class="fa-regular fa-circle-parking"></i>${isInPermitMode ? ` ${getCampusDisplayName(settings['parking-campus'])}` : ''}
        </div>
    `);

    // Add click and touch handler for parking campus selector
    $routeElm.on('click touchstart', function(e) {
        e.preventDefault();

        if ($('body').hasClass('parking-permit-mode')) {
            // If clicking the already-selected campus, exit permit mode
            exitParkingPermitMode();
            return;
        } else {
            // Not in parking permit mode, enter it
            enterParkingPermitMode(settings['parking-campus']);
            // Apply selection styling to parking campus selector
            $routeElm.css('box-shadow', '0 0 10px var(--theme-color)');
        }
    });

    // Add to route selectors (at the end, after settings button)
    $('.route-selectors').append($routeElm);
}



function clearRouteSelectors() {
    $('.route-selectors > div').not('.settings-btn, .sim-btn').not('.parking-campus-selector').remove();
}








let shownRoute;  
let shownBeforeRoute;
let routePanelOpenedFromLongPress = false; // Track if routes panel opened via long-press
let originalShownRoute = null; // Preserve map selection before opening panel
let lastMapShownRoute = null; // Tracks current map selection when panels are closed
let isLongPress = false; // Flag to track if a long press occurred

function toggleRouteSelectors(route, wasSelected = false) {
    if (wasSelected) {

        // Restore all route selectors (excluding settings button, sim button, and parking selector) to their colors
        $('.route-selector').not('.settings-btn, .sim-btn, .parking-campus-selector').each(function() {
            const rn = $(this).attr('routeName');
            if (rn !== 'fav') {
                const hasInService = routeHasInServiceBuses(rn);
                const routeColor = hasInService ? colorMappings[rn] : 'gray';
                $(this).css('background-color', routeColor).css('opacity', hasInService ? '1' : '0.5');
            }
        });
        $(`.route-selector[routeName="${route}"]`).css('box-shadow', '');
        shownRoute = null;  
        shownBeforeRoute = null;

        $(`.route-selector[routeName="fav"]`).css('background-color', 'gold').css('opacity', '1');
        $('.sim-btn').css('opacity', '1');

    }

    else {

        // Gray out all route selectors (including those without polylines) except the selected one, parking campus selector, sim button, and settings button
        $('.route-selector').not('.parking-campus-selector, .settings-btn, .sim-btn').each(function() {
            const rn = $(this).attr('routeName');
            if (rn !== route) {
                const rnInService = routeHasInServiceBuses(rn);
                $(this).css('background-color', 'gray').css('box-shadow', '').css('opacity', rnInService ? '1' : '0.5');
            }
        });

        // Always use the route color when selected, regardless of in-service status
        const selectedRouteColor = colorMappings[route];
        $(`.route-selector[routeName="${route}"]`).css('background-color', selectedRouteColor).css('box-shadow', `0 0 10px ${selectedRouteColor}`).css('opacity', '1')
        shownRoute = route;

        const container = $('.route-selectors');
        const containerEl = container[0];

        if (containerEl && containerEl.scrollWidth > $(document).width()) {

            const element = $(`.route-selector[routeName="${route}"]`);
            if (element.length) {
                const containerWidth = container.width();
                const elementWidth = element.outerWidth();

                const scrollTo = element.position().left - (containerWidth / 2) + (elementWidth / 2) + container.scrollLeft();
                const maxScroll = containerEl.scrollWidth - containerEl.clientWidth;
                const clampedScrollTo = Math.max(0, Math.min(scrollTo, maxScroll));
                
                container.stop(true).animate({
                    scrollLeft: clampedScrollTo
                }, 180);
            }
        }

    }

    $('.stop-info-use-route-selectors-notice').slideUp('fast');

    $('.favs').show(); //for when immediately pressing a route selector from entering into the shared bus screen
}


function hideAllStops() {
    // Used to loop (active) polylines and then get stop ids from stopLists, but this didn't hide all stops on the very first bus because there are no polylines.
    for (const stopId in busStopMarkers) {
        if (busStopMarkers[stopId]) {
            busStopMarkers[stopId].remove();
        }
    }
}

function hideStopsExcept(excludedRoute) {
    console.log('hideStopsExcept', excludedRoute);
    const stopIdsForSelectedRoute = stopLists[excludedRoute];
    if (!stopIdsForSelectedRoute) return;
    // Hide stops for all routes except the selected one, even if a route has no polyline
    const campusRoutes = Object.keys(busesByRoutes[selectedCampus] || {});
    campusRoutes.forEach(routeName => {
        const stopIdsForRoute = stopLists[routeName];
        if (stopIdsForRoute) {
            stopIdsForRoute.forEach(stopId => {
                if (!stopIdsForSelectedRoute.includes(stopId)) {
                    if (busStopMarkers[stopId]) {
                        busStopMarkers[stopId].remove();
                    }
                }
            });
        }
    });
    if (typeof window.updateCenterStops === 'function') {
        window.updateCenterStops();
    }
}

function hidePolylinesExcept(route) {
    for (const polyline in polylines) {
        const polyObj = polylines[polyline];
        if (polyline !== route) {
            polyObj.setStyle({ opacity: 0 });
            const pathEl = polyObj.getElement();
            if (pathEl) {
                pathEl.style.opacity = '0';
                pathEl.style.display = 'none';
            }
        } else {
            polyObj.setStyle({ opacity: 1 });
            const pathEl = polyObj.getElement();
            if (pathEl) {
                pathEl.style.opacity = '1';
                pathEl.style.display = '';
            }
        }
    }
}

function showAllStops() {
    for (const stopId in busStopMarkers) {
        // Only add when not already on the map — addTo() makes MapLibre
        // remove + re-append the element and reorder overlapping markers.
        if (!busStopMarkers[stopId]._map) {
            busStopMarkers[stopId].addTo(map);
        }
    }
    updateStopsOpacity();
}

function showAllBuses() {
    for (const marker in busMarkers) {
        if (isBusShownOnMap(marker)) {
            // Only add when not already on the map — addTo() re-appends the
            // element and reorders overlapping markers (see plotBus).
            if (!busMarkers[marker]._isOnMap) {
                busMarkers[marker].addTo(map);
            }
            busMarkers[marker].setVisibility(true);
        } else {
            busMarkers[marker].remove();
        }
    }
}

function hideAllBusesFromMap() {
    for (const marker in busMarkers) {
        busMarkers[marker].remove();
    }
}

function showAllPolylines() {
    prunePolylinesWithoutInService();
}

function hideAllPolylinesFromMap() {
    for (const polyline in polylines) {
        polylines[polyline].setStyle({ opacity: 0 });
    }
}

function showAllBusesFromMap() {
    for (const marker in busMarkers) {
        busMarkers[marker].setVisibility(true);
    }
    // updateBusNameTooltips();
}

function showAllPolylinesFromMap() {
    showAllPolylines();
}

function isRouteBusAtStop(route, stopId) {
    const targetStopId = Number(stopId);
    if (isNaN(targetStopId)) return false;

    const checkBus = (bus) => {
        if (!bus || !bus.at_stop) return false;
        if (bus.oos || bus.atDepot) return false;

        const busStopId = bus.stopId;
        if (busStopId === null || busStopId === undefined) return false;

        const currentStopId = Array.isArray(busStopId) ? busStopId[0] : busStopId;
        return Number(currentStopId) === targetStopId;
    };

    const routeBuses = (busesByRoutes && selectedCampus && busesByRoutes[selectedCampus] && busesByRoutes[selectedCampus][route]) || [];
    for (const busName of routeBuses) {
        if (checkBus(busData && busData[busName])) {
            return true;
        }
    }

    if (typeof busData === 'object' && busData !== null) {
        for (const busName in busData) {
            const bus = busData[busName];
            if (bus && (bus.route === route || (bus.route && bus.route.toLowerCase() === route.toLowerCase())) && checkBus(bus)) {
                return true;
            }
        }
    }

    return false;
}

function updateTooltips(route) {

    const targetRoute = route || shownRoute;
    if (!targetRoute || targetRoute === 'fav' || !stopLists || !stopLists[targetRoute]) return;

    try {
        stopLists[targetRoute].forEach(stopId => {
            if (isRouteBusAtStop(targetRoute, stopId)) {
                setStopEtaLabel(stopId, 'Here', true);
                return;
            }

            const [lowestBusName, lowestETA] = getSoonestBus(stopId, targetRoute);

            if (lowestBusName) {
                const lowestETAMin = Math.ceil(lowestETA / 60);
                const overtime = !!(busData[lowestBusName] && busData[lowestBusName].overtime);
                setStopEtaLabel(stopId, lowestETAMin + ' min', true, overtime);
            } else {
                setStopEtaLabel(stopId, '', false);
            }
        });
    } catch (error) {
        console.error(busesByRoutes);
        console.error(stopLists);
        console.error(`Error updating tooltips for route ${targetRoute}: ${error}`);
    }
}

function updateBusNameTooltips() {
    const showBusNames = settings['toggle-show-bus-names'];
    
    for (const busName in busMarkers) {
        const $busNameLabel = $(busMarkers[busName].getElement()).find('.bus-name-label');
        if (showBusNames) {
            $busNameLabel.removeClass('none');
            $busNameLabel.text(busData[busName].busName);
        } else {
            $busNameLabel.addClass('none');
        }
    }
    // WebGL-mode labels are driven from the GeoJSON features, so re-serialize.
    if (typeof busLayerManager !== 'undefined' && typeof busLayerManager.markAllDirty === 'function') {
        busLayerManager.markAllDirty();
    }
}

async function toggleRoute(route) {
    if (route === 'fav') { toggleFavorites(); return; }

    const isUnselecting = (shownRoute === route);
    shownRoute = isUnselecting ? null : route;

    // Show all polylines and buses
    if (isUnselecting) {
        showAllPolylines();  
        showAllBuses();
        showAllStops();
        // If any route polylines were force-added while selected, remove those that have no in-service buses now
        prunePolylinesWithoutInService();
        
        if (!popupStopId) {
            map.fitBounds(polylineBounds);
            populateRouteSelectors(activeRoutes);
        }
        else {
            // Explicitly show all buses in stop info when unselecting the current route filter
            updateStopBuses(popupStopId, null);
            // Refresh pills so old route loses box-shadow and all show as unselected
            populateRouteSelectors(activeRoutes, popupStopId);
        }

        clearAllStopEtas();

    // Hide other polylines and buses
    } else {
        showAllStops();

        hidePolylinesExcept(route);

        for (const marker in busMarkers) {
            busMarkers[marker].setVisibility(!isBusMarkerHiddenByRoute(marker));
        }

        hideStopsExcept(route);

        try {
            if (!polylines[route]) {
                // If user selects a route with no active buses, ensure its polyline is present
                await addPolylineForRoute(route);
            }
            // The click handler doesn't await toggleRoute, so a second selection
            // can land while this one is awaiting the polyline fetch. A stale
            // call must not re-show its own polyline or fit the map to the
            // wrong route — abort if we're no longer the selected route.
            if (shownRoute !== route) return;
            if (polylines[route]) {
                polylines[route].setStyle({ opacity: 1 }); // show this one if it was prev hidden
            }
        } catch (e) {
            console.error('Error setting style for route:', route, e);
        }

		if (!popupStopId) {
 			
            clearPanoutFeedback();
 			
 			const routePolyline = polylines[route];
 			const routeBuses = (busesByRoutes[selectedCampus][route] || []).filter(busName => isBusInService(busName));
 			let boundsToFit = null;
 			if (routePolyline) {
 				const rb = routePolyline.getBounds();
 				boundsToFit = routeBuses.length
 					? routeBuses.reduce((acc, id) => acc.extend(L.latLng(busData[id].lat, busData[id].long)), L.latLngBounds(rb.getSouthWest(), rb.getNorthEast()))
 					: rb;
 			} else if (routeBuses.length) {
 				// No polyline exists yet, fit to buses of this route
 				const first = routeBuses[0];
 				boundsToFit = routeBuses.reduce((acc, id) => acc.extend(L.latLng(busData[id].lat, busData[id].long)), L.latLngBounds(L.latLng(busData[first].lat, busData[first].long), L.latLng(busData[first].lat, busData[first].long)));
 			}
 			if (boundsToFit) {
 				map.fitBounds(boundsToFit, { padding: [10, 10] });
 			}
 			$('.bus-info-popup, .stop-info-popup').hide();
            populateRouteSelectors(activeRoutes);
 		}
        else {
            updateStopBuses(popupStopId, route);
            // Refresh pills so old route loses box-shadow and new one gains it while stop is open
            populateRouteSelectors(activeRoutes, popupStopId);
        }

        updateTooltips(route);
    }

    if (!popupStopId) {
        // Capture focus state before it is cleared - toggleRoute's earlier
        // setVisibility loop ran while popupBusName was still set, so
        // isBusMarkerHiddenByRoute hid all buses except the focused one
        // even though the polyline for the new route was shown. Re-evaluate
        // after hideInfoBoxes clears popupBusName so the newly selected
        // route's buses become visible immediately instead of on next poll.
        const hadFocusedBus = !!popupBusName;
        hideInfoBoxes();
        if (!isUnselecting && hadFocusedBus) {
            for (const marker in busMarkers) {
                const shouldBeVisible = !isBusMarkerHiddenByRoute(marker);
                // Ensure marker is on map if it should be visible and is allowed by isBusShownOnMap
                if (shouldBeVisible && !busMarkers[marker]._isOnMap && isBusShownOnMap(marker)) {
                    busMarkers[marker].addTo(map);
                }
                busMarkers[marker].setVisibility(shouldBeVisible);
            }
        }
    }

    // Update last known map selection state (panels closed scenario)
    if (!$('.info-panels-show-hide-wrapper').is(':visible')) {
        lastMapShownRoute = shownRoute;
    }

    toggleRouteSelectors(route, isUnselecting);

}

function getBusStopInfo(busName) {
    const bus = busData ? busData[busName] : null;
    if (!bus) return { isStopped: false, stopName: '' };

    // A bus is actively stopped at a stop if and only if bus.at_stop is true
    const isStopped = Boolean(bus.at_stop) && !forceUnstoppedBuses.has(busName);

    let stopId = null;
    if (isStopped) {
        if (bus.stopId != null) {
            stopId = Array.isArray(bus.stopId) ? bus.stopId[0] : bus.stopId;
        } else if (bus.next_stop != null) {
            stopId = bus.next_stop;
        }
    } else {
        if (bus.next_stop != null) {
            stopId = bus.next_stop;
        } else if (bus.stopId != null) {
            stopId = Array.isArray(bus.stopId) ? bus.stopId[0] : bus.stopId;
        }
    }

    const stopObj = stopId != null ? (stopsData[stopId] || stopsData[Number(stopId)] || stopsData[String(stopId)]) : null;
    const stopName = stopObj ? (stopObj.shortName || stopObj.name) : '';

    let etaText = '';
    if (!isStopped && stopId != null) {
        const etaVal = getETAForStop(busName, Number(stopId));
        if (typeof etaVal === 'number' && !isNaN(etaVal)) {
            const etaMin = Math.max(1, Math.ceil(etaVal / 60));
            etaText = `${etaMin}m`;
        }
    }

    return { isStopped, stopName, stopId, etaText };
}

function getBusStopStatusIconHtml(isStopped, stopName) {
    if (!stopName) {
        return '';
    }
    if (isStopped) {
        return '<div class="route-bus-octagon"><div class="flex align-center justify-center">!</div></div>';
    } else {
        return '<i class="fa-solid fa-arrow-right"></i>';
    }
}

function updateRouteBusStatus(busName) {
    if (!panelRoute || !busData[busName] || panelRoute !== busData[busName].route) return;
    const { isStopped, stopName, etaText } = getBusStopInfo(busName);
    const iconHtml = getBusStopStatusIconHtml(isStopped, stopName);
    $(`.route-bus-status-icon[bus-name="${busName}"]`).html(iconHtml);
    const $stopCol = $(`.route-bus-stop[bus-name="${busName}"]`);
    $stopCol.empty().attr('title', stopName ? (etaText ? `${stopName} (${etaText})` : stopName) : '');
    if (stopName) {
        $stopCol.append(document.createTextNode(stopName));
        if (etaText) {
            $stopCol.append($(`<span class="route-bus-eta"></span>`).text(etaText));
        }
    }
}
window.updateRouteBusStatus = updateRouteBusStatus;

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
            $('.route-star').hide();
            $('.route-active-buses').text('');
            $('.active-buses').empty();
            $('.route-stops-grid').empty();
            
            // Show the route selection prompt since no route is selected
            $('#route-selection-prompt').show();
            
            // Reset panelRoute so the route can be selected again
            panelRoute = null;
            
            return;
        } else {
            // We're not in the routes subpanel - close the menu as before
            closeRouteMenu();
            return;
        }
    }

    // Ensure routes subpanel is active and selectors are moved when selecting a route
    const routesTabActive = $('.subpanels-container').hasClass('panel-routes');

    // Always show panels and move selectors when invoked via long-press or when panels are closed
    const infoWasHidden = !$('.info-panels-show-hide-wrapper').is(':visible');
    if (infoWasHidden || isLongPress) {
        $('.info-panels-show-hide-wrapper').show();
        if (infoWasHidden) {
            markPanelOpened('info');
            if (isDesktop && !isTouchDevice) showEscNotice('info');
        }
        busesOverview();
        moveRouteSelectorsToSubpanel();
        // Show all route selectors in subpanel (not filtered by stop selection)
        populateRouteSelectors(activeRoutes);
        populateAllStops();
        // Force switch to routes subpanel (not user explicit selection)
        const $routesHeaderBtn = $(`.info-panels-header-buttons [data-panel="routes"]`);
        selectInfoPanel('routes', $routesHeaderBtn[0], false);
    } else if (!routesTabActive) {
        // Panels are open but on a different subpanel: move selectors and switch to routes (not user explicit selection)
        moveRouteSelectorsToSubpanel();
        // Show all route selectors in subpanel (not filtered by stop selection)
        populateRouteSelectors(activeRoutes);
        const $routesHeaderBtn = $(`.info-panels-header-buttons [data-panel="routes"]`);
        selectInfoPanel('routes', $routesHeaderBtn[0], false);
    } else {
        // Already in routes: ensure selectors are in subpanel if not already there
        if (!$('#route-selectors-container .bottom').length) {
            moveRouteSelectorsToSubpanel();
            populateRouteSelectors(activeRoutes);
        }
    }

    // Now perform route selection after selectors are populated
    if (shownRoute !== route) {
        toggleRouteSelectors(route);
    }

    $('.route-name').text(route.toUpperCase()).css('color', colorMappings[route])
    $('.route-campuses').text(campusMappings[route])
    $('.color-circle').css('background-color', colorMappings[route])
    if (typeof updateRouteStarState === 'function') {
        updateRouteStarState(route);
    }
    const allRouteBuses = (busesByRoutes[selectedCampus] && busesByRoutes[selectedCampus][route]) || [];
    const visibleRouteBuses = allRouteBuses.filter(busName => {
        if (!busData[busName]) return false;
        if (!settings['toggle-show-out-of-service']) {
            return isBusShownOnMap(busName);
        }
        return true;
    });

    const routeStops = (stopLists && stopLists[route]) || [];
    const getBusRouteRank = (busName) => {
        const bus = busData[busName];
        if (!bus) return Infinity;

        const isStopped = Boolean(bus.at_stop) && !forceUnstoppedBuses.has(busName);
        const rawStopId = isStopped ? (bus.stopId ?? bus.next_stop) : (bus.next_stop ?? bus.stopId);
        const stopId = Array.isArray(rawStopId) ? rawStopId[0] : rawStopId;

        let stopIdx = routeStops.indexOf(Number(stopId));
        if (stopIdx === -1) {
            stopIdx = routeStops.indexOf(stopId);
        }
        if (stopIdx === -1) {
            return Infinity;
        }

        if (isStopped) {
            return stopIdx;
        }

        // When en route to next_stop, bus is between (stopIdx - 1) and stopIdx.
        // If progress is known (0 to 1), use (stopIdx - 1 + progress), bounded.
        let prog = progressToNextStop(busName);
        if (typeof prog !== 'number' || isNaN(prog) || prog < 0 || prog > 1) {
            prog = 0.5;
        }
        const prevIdx = (stopIdx - 1 + routeStops.length) % routeStops.length;
        // If moving from last stop to first stop (wrap-around to stop index 0)
        if (stopIdx === 0) {
            return (routeStops.length - 1) + prog;
        }
        return prevIdx + prog;
    };

    visibleRouteBuses.sort((a, b) => {
        const rankA = getBusRouteRank(a);
        const rankB = getBusRouteRank(b);
        if (rankA !== rankB) return rankA - rankB;
        return (busData[a]?.busName || a).localeCompare(busData[b]?.busName || b);
    });

    $('.route-active-buses').text(visibleRouteBuses.length === 1 ? '1 bus running' : visibleRouteBuses.length + ' buses running');

    $('.active-buses').empty();
    visibleRouteBuses.forEach(busName => {

        let speed = '0mph';
        if ('visualSpeed' in busData[busName] && !isNaN(parseInt(busData[busName].visualSpeed))) {
            speed = parseInt(busData[busName].visualSpeed) + 'mph';
        }
        const capacity = (busData[busName].capacity !== undefined && busData[busName].capacity !== null ? busData[busName].capacity : 0) + '% full';

        const { isStopped, stopName, etaText } = getBusStopInfo(busName);
        const iconHtml = getBusStopStatusIconHtml(isStopped, stopName);

        const $nameCol = $(`<div class="route-bus-name flex align-center gap-x-0p5rem">${busData[busName].busName}</div>`);
        const $iconCol = $(`<div class="route-bus-status-icon" bus-name="${busName}">${iconHtml}</div>`);
        const $stopCol = $(`<div class="route-bus-stop" bus-name="${busName}" title="${stopName ? (etaText ? `${stopName} (${etaText})` : stopName) : ''}"></div>`);
        if (stopName) {
            $stopCol.append(document.createTextNode(stopName));
            if (etaText) {
                $stopCol.append($(`<span class="route-bus-eta"></span>`).text(etaText));
            }
        }
        const $speedCol = $(`<div class="route-bus-speed" bus-name="${busName}">${speed}</div>`);
        const $capCol = $(`<div class="route-bus-capacity" bus-name="${busName}">${capacity}</div>`);

        if (busData[busName].oos) {
            $nameCol.append(`<div class="bus-oos white br-0p5rem text-1p4rem">OOS</div>`);
        }

        if (busData[busName].atDepot) {
            $nameCol.append(`<div class="bus-depot white br-0p5rem text-1p4rem">Depot</div>`);
        }
        
        $('.active-buses').append($nameCol, $iconCol, $stopCol, $speedCol, $capCol);
    });
    // Ensure route selectors are visible and nav buttons are hidden in subpanel
    $('.bottom').show();
    $('.left-btns, .right-btns').hide();
    $('.route-selectors').show();
    $('.settings-btn, .parking-campus-selector, .sim-btn').hide();
    
    // Make sure route panel is visible by removing the 'none' class
    $('.route-panel').show();
    
    // Hide the route selection prompt since a route is now selected
    $('#route-selection-prompt').hide();
    
    $('.route-stops-grid').empty();

    let firstCircle;
    let lastCircle;

    let previousStopId = null;
    stopLists[route].forEach((stopId, index) => {

        $('.route-stops-grid').append('<div class="next-stop-circle"></div>')
        const $stopElm = $('<div class="flex flex-col"><div class="route-stop-name"></div><div class="route-buses-for-stop"></div></div>');
        $stopElm.find('.route-stop-name').text(stopsData[stopId].name);

        if (!firstCircle) {
            firstCircle = $('.route-stops-grid .next-stop-circle').last();
            firstCircle.append(`<div class="next-stop-circle" style="z-index: 1; background-color: ${colorMappings[route]}"></div>`)
        }

        let i = 0;

        let positiveBuses = [];
        busesByRoutes[selectedCampus][route].forEach(busName => {
            if (progressToNextStop(busName) < 1) { // have to debug why some stops are missed - prob a passio location issue, right?
                positiveBuses.push(busName);
            }
        })

        // Sort bus IDs based on their ETA
        positiveBuses
            .sort((a, b) => {
                const getETA = (busName) => {
                    if ((route === 'wknd1' || route === 'all' || route === 'winter1' || route === 'on1' || route === 'summer1') && stopId === 3 && previousStopId) {
                        if (busData[busName].at_stop && stopId == busData[busName].stopId[0] && previousStopId == busData[busName].stopId[1]) {
                            return 0;
                        }
                        const val = getETAForStop(busName, stopId, previousStopId);
                        return (val === undefined) ? Infinity : val;
                    } else if (busData[busName].at_stop && (Array.isArray(busData[busName].stopId) ? stopId === busData[busName].stopId[0] : stopId === busData[busName].stopId)) {
                        return 0;
                    }
                    const val = getETAForStop(busName, stopId);
                    return (val === undefined) ? Infinity : val;
                };
                return Math.round(getETA(a) / 60) - Math.round(getETA(b) / 60);
            })
            .forEach(busName => {

                let thisStopIndex = index;
                // console.log(index);
                let busIndex = -1;
                
                if ((route === 'wknd1' || route === 'all' || route === 'winter1' || route === 'on1' || route === 'summer1') && busData[busName].stopId == 3) {
                    
                    for (let j = 1; j < stopLists[route].length; j++) {

                        // console.log('stopLists[route][i]: ', stopLists[route][j]);
                        // console.log('busData[busName].stopId: ', busData[busName].stopId);
                        // console.log('busData[busName].prevStopId: ', busData[busName].prevStopId);
                        // console.log('previousStopId: ', previousStopId);
                        
                        if (
                            stopLists[route][j] === busData[busName].stopId &&
                            stopLists[route][j-1] === busData[busName].prevStopId) {
                            busIndex = j;
                            alert('what is this')
                            break;
                        }
                    }
                    if (busIndex === -1) {
                        busIndex = stopLists[route].indexOf(busData[busName].stopId);
                    }

                } else {
                    busIndex = stopLists[route].indexOf(busData[busName].stopId);
                }

                let stopsAway = thisStopIndex > busIndex 
                    ? thisStopIndex - busIndex - 1
                    : (stopLists[route].length - busIndex) + thisStopIndex - 1;

                // console.log(stopsAway)

                if (busETAs[busName]) {

                    let eta;

                    const $gridElm = $stopElm.find('.route-buses-for-stop');

                    if (busData[busName].at_stop && (Array.isArray(busData[busName].stopId) ? stopId === busData[busName].stopId[0] : stopId === busData[busName].stopId)) {
                        eta = 0;
                        const $bn1 = $('<div class="rbfs-bn"></div>').text(busData[busName].busName).click(function(){ flyToBus(busName); closeRouteMenu(); });
                        $gridElm.append($bn1);
                        $gridElm.append(`<div class="bold">Here</div>`);
                        $gridElm.append(`<div class="align-right">Arrived</div>`);
                        return;
                    } else if (busData[busName].at_stop && stopId == busData[busName].stopId[0] && previousStopId == busData[busName].stopId[1]) { // wknd & all special case at sac nb
                        eta = 0;
                        const $bn2 = $('<div class="rbfs-bn"></div>').text(busData[busName].busName).click(function(){ flyToBus(busName); closeRouteMenu(); });
                        $gridElm.append($bn2);
                        $gridElm.append(`<div class="bold">Here</div>`);
                        $gridElm.append(`<div class="align-right">Arrived</div>`);
                        return;
                    } else {
                        const $bn3 = $('<div class="rbfs-bn"></div>').text(busData[busName].busName).click(function(){ flyToBus(busName); closeRouteMenu(); });
                        $gridElm.append($bn3);
                        if ((route === 'wknd1' || route === 'all' || route === 'winter1' || route === 'on1' || route === 'summer1') && stopId === 3 && previousStopId) {
                            eta = getETAForStop(busName, stopId, previousStopId);
                        } else {
                            eta = getETAForStop(busName, stopId);
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

// The map-side selection (shownRoute) and the Routes subpanel's rendered
// route (panelRoute) are tracked separately. When info panels open (or the
// Routes tab becomes active) with a route already selected on the map, the
// pill is highlighted but the detail area stays empty until that route is
// rendered. This syncs the two. Skipped when the prompt is visible (the
// user intentionally cleared the detail area inside the routes tab), and
// just re-shown when the same route was rendered before but its detail
// area got hidden (e.g. a stop popup hid .route-panel after population).
function ensureRouteSubpanelPopulated() {
    if (!shownRoute) return;
    if ($('#route-selection-prompt').is(':visible')) return;
    if (!$('.info-panels-show-hide-wrapper').is(':visible')) return;
    if (!$('.subpanels-container').hasClass('panel-routes')) return;
    // Same route already rendered for the subpanel — make sure it's showing.
    if (panelRoute === shownRoute) {
        $('.route-panel').show();
        return;
    }
    selectedRoute(shownRoute);
}
window.ensureRouteSubpanelPopulated = ensureRouteSubpanelPopulated;


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
    settings['colorMappings'] = {...(settings['colorMappings'] || {})}
    settings['colorMappings'][shownRoute] = selectedColor
    saveSettings()

    // Update all existing markers for this route through the manager (every
    // marker type, both renderer modes).
    busLayerManager.updateRouteColor(shownRoute, selectedColor);

    // Passio bus icons embed a recolored SVG; regenerate it first, then
    // re-apply so the icon's src is updated.
    if (settings['marker-type'] === 'passio') {
        generateColoredSvgForColor(selectedColor).then(() => {
            busLayerManager.updateRouteColor(shownRoute, selectedColor);
        }).catch(error => {
            console.error(`Failed to regenerate SVG for route ${shownRoute}:`, error);
        });
    }

    // update shown element colors
    $(`.color-circle, .next-stop-circle`).css('background-color', selectedColor)
    $('.route-name').css('color', selectedColor)
    // Always update route selector with the selected color when it's the currently shown route
    $(`.route-selector[routename="${shownRoute}"]`).css('background-color', selectedColor).css('box-shadow', `0 0 10px ${selectedColor}`)

    if (polylines[shownRoute]) {
        polylines[shownRoute].setStyle({ color: selectedColor });
    }

    if (popupStopId) {
        updateStopBuses(popupStopId)
    }

    populateFavs();

    if (sharedBusName && busData[sharedBusName].route === shownRoute) {
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


let overviewSortColumn = 'ridership';
let overviewSortDirection = 'desc';

function updateOverviewSortHeaders(hasRidership = true) {
    const cols = ['route', 'ridership', 'loop'];
    const activeColumn = (!hasRidership && overviewSortColumn === 'ridership') ? 'route' : overviewSortColumn;
    const chevronClass = overviewSortDirection === 'asc' ? 'fa-chevron-up' : 'fa-chevron-down';

    cols.forEach(col => {
        const $heading = $(`.bus-overview-heading-${col}`);
        const $icon = $(`.bus-overview-sort-icon-${col}`);
        if (activeColumn === col) {
            $heading.addClass('active');
            $icon.removeClass('none fa-chevron-up fa-chevron-down').addClass(chevronClass);
        } else {
            $heading.removeClass('active');
            $icon.addClass('none');
        }
    });
}

function toggleOverviewSort(column) {
    if (column === 'ridership' && $('.buses-overview-grid').hasClass('no-ridership')) {
        return;
    }
    if (overviewSortColumn === column) {
        overviewSortDirection = overviewSortDirection === 'desc' ? 'asc' : 'desc';
    } else {
        overviewSortColumn = column;
        overviewSortDirection = column === 'route' ? 'asc' : (column === 'loop' ? 'asc' : 'desc');
    }
    updateBusOverview();
}
window.toggleOverviewSort = toggleOverviewSort;

let routeRiderships = {}
function updateBusOverview(routes) {

    const loopTimes = calculateLoopTimes();

    // Check if busesByRoutes and selectedCampus exist before accessing
    if (!busesByRoutes || !busesByRoutes[selectedCampus]) {
        console.log('No buses data available for campus:', selectedCampus);
        $('.buses-overview-grid').hide().children().not('.bus-overview-heading, .bus-overview-header-divider').remove();
        return;
    }

    routes = Object.keys(busesByRoutes[selectedCampus]);
    if (!routes || routes.length === 0) { 
        $('.buses-overview-grid').hide().children().not('.bus-overview-heading, .bus-overview-header-divider').remove();
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
        busesByRoutes[selectedCampus][route].forEach(busName => {
            const riders = Math.ceil(busData[busName].capacity/100 * 57)
            routeRiderships[route] += riders;
            totalRidership += riders;
        });
        return { route, ridership: routeRiderships[route] };
    });

    const hasRidership = totalRidership > 0;
    const $overviewGrid = $('.buses-overview-grid');

    if (hasRidership) {
        $overviewGrid.removeClass('no-ridership');
    } else {
        $overviewGrid.addClass('no-ridership');
    }

    updateOverviewSortHeaders(hasRidership);

    const sortCol = (!hasRidership && overviewSortColumn === 'ridership') ? 'route' : overviewSortColumn;

    // Sort routes based on selected column and direction
    routeData.sort((a, b) => {
        if (sortCol === 'route') {
            const cmp = String(a.route).localeCompare(String(b.route), undefined, { sensitivity: 'base' });
            if (cmp !== 0) {
                return overviewSortDirection === 'asc' ? cmp : -cmp;
            }
            return b.ridership - a.ridership;
        } else if (sortCol === 'loop') {
            const hasA = typeof loopTimes[a.route] === 'number' && !isNaN(loopTimes[a.route]);
            const hasB = typeof loopTimes[b.route] === 'number' && !isNaN(loopTimes[b.route]);
            const valA = hasA ? loopTimes[a.route] : (overviewSortDirection === 'asc' ? Infinity : -Infinity);
            const valB = hasB ? loopTimes[b.route] : (overviewSortDirection === 'asc' ? Infinity : -Infinity);
            const diff = valA - valB;
            if (diff !== 0) {
                return overviewSortDirection === 'asc' ? diff : -diff;
            }
            return String(a.route).localeCompare(String(b.route), undefined, { sensitivity: 'base' });
        } else {
            // Ridership
            const diff = a.ridership - b.ridership;
            if (diff !== 0) {
                return overviewSortDirection === 'desc' ? -diff : diff;
            }
            return String(a.route).localeCompare(String(b.route), undefined, { sensitivity: 'base' });
        }
    });

    // Create total row if it doesn't exist, or update its ridership value
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
    } else {
        const $totalRidershipElm = $('.buses-overview-grid .bus-overview-ridership.total-row');
        const prevTotal = parseInt($totalRidershipElm.text().split(' ')[0]);
        if (!isNaN(prevTotal) && prevTotal !== totalRidership) {
            const color = totalRidership > prevTotal ? 'lime' : 'red';
            $totalRidershipElm.text(`${totalRidership} riding`).css('color', color).css('transition', 'color 0.25s');
            setTimeout(() => {
                $totalRidershipElm.css('color', 'var(--theme-color-lighter)').css('transition', 'color 1s');
            }, 1000);
        } else {
            $totalRidershipElm.text(`${totalRidership} riding`);
        }
    }

    routeData.forEach(({route}) => {
        const loopMin = loopTimes[route];
        const loopTimeDisplay = (typeof loopMin === 'number' && !isNaN(loopMin)) ? `${loopMin} min` : '--';

        if ($(`.bus-overview-ridership[route="${route}"]`).length === 0) {
            const $busName = $(`<div class="bus-overview-name pointer text-1p6rem" route="${route}">${route.toUpperCase()}</div>`).css('color', colorMappings[route]);
            const $busRidership = $(`<div class="bus-overview-ridership pointer" route="${route}">${routeRiderships[route] === 0 ? '–' : routeRiderships[route] + ' riders'}</div>`);
            const $loopTime = $(`<div class="bus-overview-loop-time pointer" route="${route}">${loopTimeDisplay}</div>`);
            const onRouteClick = function() {
                $('.info-panels-close').trigger('click');
                toggleRoute(route);
            };
            $busName.add($busRidership).add($loopTime).click(onRouteClick);

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
            const $loopTimeElm = $(`.bus-overview-loop-time[route="${route}"]`);
            if ($loopTimeElm.length > 0 && typeof loopMin === 'number' && !isNaN(loopMin)) {
                $loopTimeElm.text(`${loopMin} min`);
            }

            const prevRidersText = $(`.bus-overview-ridership[route="${route}"]`).text().trim();
            const prevRiders = prevRidersText === '–' ? 0 : parseInt(prevRidersText.split(' ')[0]);
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
                    $(`.bus-overview-ridership[route="${route}"]`).text(routeRiderships[route] === 0 ? '–' : `${routeRiderships[route]} riders`).css('color', color).css('transition', 'color 0.25s');

                    setTimeout(() => {
                        $(`.bus-overview-ridership[route="${route}"]`).css('color', 'var(--theme-color-lighter)').css('transition', 'color 1s');
                    }, 1000);
                }, Math.random() * 5000);
            }
        }
    });

    // Reorder routes in DOM based on sorted routeData
    const $grid = $(`.buses-overview-grid`).first();
    const $firstTotalElement = $grid.find('.bus-overview-name:contains("Total")').first();

    routeData.forEach(({route}) => {
        const $busName = $(`.bus-overview-name[route="${route}"]`).not('.total-row').first();
        const $busRidership = $(`.bus-overview-ridership[route="${route}"]`);
        const $loopTime = $(`.bus-overview-loop-time[route="${route}"]`);
        if ($firstTotalElement.length > 0) {
            $busName.insertBefore($firstTotalElement);
            $busRidership.insertBefore($firstTotalElement);
            $loopTime.insertBefore($firstTotalElement);
        }
    });

    // Ensure Total row is always at the very bottom
    const $totalName = $grid.find('.bus-overview-name.total-row');
    const $totalRidership = $grid.find('.bus-overview-ridership.total-row');
    const $totalLoopTime = $grid.find('.bus-overview-loop-time.total-row');
    if ($totalName.length && $totalRidership.length && $totalLoopTime.length) {
        $grid.append($totalName);
        $grid.append($totalRidership);
        $grid.append($totalLoopTime);
    }

    updateAverageWaitByRoute();
    updateBusServiceTime();
    updateRouteChangesMenu();
}


function busesOverview() {

    if (!isDesktop) {
        $('.bottom, .leaflet-control-attribution').hide();
        $('.buses-panel-wrapper').css('margin-left', 0);
    } else {
        // No max-height cap: the wrapper lives inside the pinned subpanel now,
        // which manages its own scrolling (the old floating-overlay cap broke
        // trailing scroll space on desktop).
        $('.buses-panel-wrapper').css('max-height', '');
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
    updateBusServiceTime();
    updateRouteChangesMenu();
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

        updateRubusResponseTime();

        if (!Object.keys(timeRiderships).length) {
            $('.ridership-chart-wrapper, .ridership-stats-row').hide();
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

        const totalRidership = values.reduce((a, b) => a + b, 0);
        const maxRidership = Math.max(...values, 0);

        if (totalRidership === 0 || maxRidership === 0 || !values.some(v => v > 0)) {
            $('.ridership-chart-wrapper, .ridership-stats-row').hide();
            return;
        }

        // Check if chart is initialized before trying to update it
        if (!ridershipChart) {
            console.error('Ridership chart not initialized');
            return;
        }

        ridershipChart.data.labels = labels;
        ridershipChart.data.datasets[0].data = values;
        ridershipChart.update();

        const averageRidership = Math.round(totalRidership / values.length);
        const peakTime = labels[values.indexOf(maxRidership)];
        
        $('.ridership-avg').text(`AVG: ${averageRidership}`);
        $('.ridership-max').text(`PEAK: ${maxRidership.toLocaleString()} at ${peakTime}`);
        $('.ridership-chart-wrapper, .ridership-stats-row').show();
        $('.ridership-super-wrapper').show();
        
    } catch (error) {
        console.error('Error fetching ridership:', error);
        $('.ridership-chart-wrapper, .ridership-stats-row').hide();
        markRubusRequestsFailing();
    }
}


function calculateLoopTimes() {

    let loopTimes = {};
    const routesToCalculate = new Set([
        ...(typeof activeRoutes !== 'undefined' ? activeRoutes : []),
        ...(typeof stopLists !== 'undefined' ? Object.keys(stopLists) : [])
    ]);

    for (const route of routesToCalculate) {

        let eta = 0;
        const stopList = (typeof stopLists !== 'undefined') ? stopLists[route] : null;

        if (!stopList || !Array.isArray(stopList) || stopList.length === 0) { // for unknown bus types (e.g. cc, penn station)
            continue;
        }

        for (let i = 0; i < stopList.length - 1; i++) {
            const thisStop = stopList[i];

            let prevStop;
            if (i === 0) {
                prevStop = stopList[stopList.length - 1];
            } else {
                prevStop = stopList[i - 1];
            }

            if (typeof etas !== 'undefined' && etas[thisStop] && etas[thisStop]['from'] && prevStop in etas[thisStop]['from']) {
                eta += etas[thisStop]['from'][prevStop];
            } else {
                eta += 300;
            }

            if (typeof waits !== 'undefined' && waits[thisStop]) {
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
        'Downtown': [22, 23],
        'Piscataway': [30]
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
    if (!busesByRoutes || !busesByRoutes[selectedCampus] || !busesByRoutes[selectedCampus][route]) {
        return 0;
    }
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

let avgWaitSortColumn = 'route';
let avgWaitSortDirection = 'asc';

function updateAvgWaitSortHeaders() {
    const cols = ['route', 'wait'];
    const chevronClass = avgWaitSortDirection === 'asc' ? 'fa-chevron-up' : 'fa-chevron-down';

    cols.forEach(col => {
        const $heading = $(`.avg-wait-heading-${col}`);
        const $icon = $(`.avg-wait-sort-icon-${col}`);
        if (avgWaitSortColumn === col) {
            $heading.addClass('active');
            $icon.removeClass('none fa-chevron-up fa-chevron-down').addClass(chevronClass);
        } else {
            $heading.removeClass('active');
            $icon.addClass('none');
        }
    });
}

function toggleAvgWaitSort(column) {
    if (avgWaitSortColumn === column) {
        avgWaitSortDirection = avgWaitSortDirection === 'desc' ? 'asc' : 'desc';
    } else {
        avgWaitSortColumn = column;
        avgWaitSortDirection = 'asc';
    }
    updateAverageWaitByRoute();
}
window.toggleAvgWaitSort = toggleAvgWaitSort;

function updateAverageWaitByRoute() {
    const $grid = $('.avg-wait-grid');
    if (!$grid.length) return;

    updateAvgWaitSortHeaders();

    // Clear previous (keep headings and divider)
    $grid.children().not('.avg-wait-heading, .avg-wait-header-divider').remove();

    // Ensure data available
    if (!busesByRoutes || !busesByRoutes[selectedCampus]) {
        $('.avg-wait-wrapper').hide();
        return;
    }

    const waitByRoute = calculateAverageWaitByRoute();
    const routes = Object.keys(waitByRoute)
        .filter(r => r !== 'undefined');

    if (routes.length === 0) {
        $('.avg-wait-wrapper').hide();
        return;
    } else {
        $('.avg-wait-wrapper').show();
    }

    // Sort routes based on selected column and direction
    routes.sort((a, b) => {
        if (avgWaitSortColumn === 'route') {
            const cmp = String(a).localeCompare(String(b), undefined, { sensitivity: 'base' });
            if (cmp !== 0) {
                return avgWaitSortDirection === 'asc' ? cmp : -cmp;
            }
            return (waitByRoute[a] || 0) - (waitByRoute[b] || 0);
        } else {
            const waitA = waitByRoute[a] || 0;
            const waitB = waitByRoute[b] || 0;
            const diff = waitA - waitB;
            if (diff !== 0) {
                return avgWaitSortDirection === 'asc' ? diff : -diff;
            }
            return String(a).localeCompare(String(b), undefined, { sensitivity: 'base' });
        }
    });

    routes.forEach(route => {
        const minutes = waitByRoute[route];
        const text = (minutes >= 1) ? `${Math.round(minutes)}m` : `${Math.max(1, Math.round(minutes * 60))}s`;
        const $name = $(`<div class="avg-wait-name pointer text-1p6rem">${route.toUpperCase()}</div>`).css('color', colorMappings[route]);
        const $val = $(`<div class="avg-wait-value pointer text-2rem">${text}</div>`);
        const onRowClick = function() {
            $('.info-panels-close').trigger('click');
            toggleRoute(route);
        };
        $name.click(onRowClick);
        $val.click(onRowClick);
        $grid.append($name);
        $grid.append($val);
    });
}

let busServiceSortColumn = 'time';
let busServiceSortDirection = 'desc';

function updateBusServiceSortHeaders() {
    const cols = ['bus', 'route', 'time'];
    const chevronClass = busServiceSortDirection === 'asc' ? 'fa-chevron-up' : 'fa-chevron-down';

    cols.forEach(col => {
        const $heading = $(`.bus-service-heading-${col}`);
        const $icon = $(`.bus-service-sort-icon-${col}`);
        if (busServiceSortColumn === col) {
            $heading.addClass('active');
            $icon.removeClass('none fa-chevron-up fa-chevron-down').addClass(chevronClass);
        } else {
            $heading.removeClass('active');
            $icon.addClass('none');
        }
    });
}

function toggleBusServiceSort(column) {
    if (busServiceSortColumn === column) {
        busServiceSortDirection = busServiceSortDirection === 'desc' ? 'asc' : 'desc';
    } else {
        busServiceSortColumn = column;
        busServiceSortDirection = column === 'route' ? 'asc' : 'desc';
    }
    updateBusServiceTime();
}
window.toggleBusServiceSort = toggleBusServiceSort;

function updateBusServiceTime() {
    const $grid = $('.bus-service-grid');

    updateBusServiceSortHeaders();

    // Clear previous (keep headings and divider)
    $grid.children().not('.bus-service-heading, .bus-service-header-divider').remove();

    // Ensure data available
    if (Object.keys(busData).length === 0) {
        $('.bus-service-wrapper').hide();
        return;
    }

    // Create array of all buses with their service times
    const busesWithServiceTime = [];
    
    for (const busName in busData) {
        if (busData[busName].route && busData[busName].busName) {
            const joinedServiceTime = busData[busName].joined_service;
            if (joinedServiceTime) {
                busesWithServiceTime.push({
                    key: busName,
                    busName: busData[busName].busName,
                    route: busData[busName].route,
                    joinedServiceTime: joinedServiceTime
                });
            }
        }
    }

    if (busesWithServiceTime.length === 0) {
        $('.bus-service-wrapper').hide();
        return;
    }

    $('.bus-service-wrapper').show();

    // Sort buses based on selected column and direction
    busesWithServiceTime.sort((a, b) => {
        if (busServiceSortColumn === 'bus') {
            const cmp = String(a.busName).localeCompare(String(b.busName), undefined, { numeric: true, sensitivity: 'base' });
            if (cmp !== 0) {
                return busServiceSortDirection === 'asc' ? cmp : -cmp;
            }
            return String(a.route).localeCompare(String(b.route));
        } else if (busServiceSortColumn === 'route') {
            const cmp = String(a.route).localeCompare(String(b.route), undefined, { sensitivity: 'base' });
            if (cmp !== 0) {
                return busServiceSortDirection === 'asc' ? cmp : -cmp;
            }
            return String(a.busName).localeCompare(String(b.busName), undefined, { numeric: true, sensitivity: 'base' });
        } else {
            const timeA = new Date(a.joinedServiceTime).getTime() || 0;
            const timeB = new Date(b.joinedServiceTime).getTime() || 0;
            // timeA is joined time. Earlier timeA = longer in service (now - timeA).
            // For 'desc' (high to low, longest first): timeA < timeB should be negative, so (timeA - timeB).
            // For 'asc' (low to high, shortest first): timeB < timeA should be negative, so (timeB - timeA).
            const diff = timeA - timeB;
            if (diff !== 0) {
                return busServiceSortDirection === 'desc' ? diff : -diff;
            }
            return String(a.busName).localeCompare(String(b.busName), undefined, { numeric: true, sensitivity: 'base' });
        }
    });

    // Calculate current time
    const now = new Date();

    // Add each bus to the grid
    busesWithServiceTime.forEach(bus => {
        const serviceTime = new Date(bus.joinedServiceTime);
        const diffMs = Math.max(0, now - serviceTime);
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const remainingMins = diffMins % 60;
        
        // Format as "Xh Ym" or "Xm" if less than an hour
        let timeInService;
        if (diffHours > 0) {
            timeInService = `${diffHours}h ${remainingMins}m`;
        } else {
            timeInService = `${diffMins}m`;
        }
        
        const routeColor = (typeof colorMappings !== 'undefined' && colorMappings[bus.route]) ? colorMappings[bus.route] : 'var(--theme-color)';
        const $busCol = $(`<div class="bus-service-busname pointer text-2rem" style="color: ${routeColor}">${bus.busName}</div>`);
        const $routeCol = $(`<div class="bus-service-route pointer text-1p6rem" style="color: ${routeColor}">${bus.route.toUpperCase()}</div>`);
        const $timeCol = $(`<div class="bus-service-value pointer text-2rem">${timeInService}</div>`);
        
        const onRowClick = function() {
            $('.info-panels-close').trigger('click');
            flyToBus(bus.key);
            selectBusMarker(bus.key);
        };
        $busCol.add($routeCol).add($timeCol).click(onRowClick);
        
        $grid.append($busCol);
        $grid.append($routeCol);
        $grid.append($timeCol);
    });
}

// Route Changes menu (network subpanel, under Service Time): fleet-wide list
// of the day's bus route reassignments, newest first. Served by
// GET /get_all_route_changes (rubus-server), fed by back's route_change hook
// events. Cached 60s; hidden when empty/unreachable.
let routeChangesCache = { data: null, timestamp: 0 };
const ROUTE_CHANGES_CACHE_MS = 60 * 1000;

function updateRouteChangesMenu() {
    const now = Date.now();
    if (routeChangesCache.data && (now - routeChangesCache.timestamp) < ROUTE_CHANGES_CACHE_MS) {
        renderRouteChangesMenu(routeChangesCache.data);
        return;
    }
    fetch('https://demo.rubus.live/get_all_route_changes')
        .then(response => response.json())
        .then(data => {
            routeChangesCache = { data: data || {}, timestamp: Date.now() };
            renderRouteChangesMenu(routeChangesCache.data);
        })
        .catch(error => {
            console.warn('Route changes fetch failed:', error);
            $('.route-changes-wrapper').hide();
        });
}

function renderRouteChangesMenu(allChanges) {
    const $grid = $('.route-changes-grid');
    const $wrapper = $('.route-changes-wrapper');
    if (!$grid.length) return;
    $grid.children().not('.route-changes-heading, .route-changes-header-divider').remove();

    const rows = [];
    for (const busName in (allChanges || {})) {
        for (const change of (allChanges[busName] || [])) {
            rows.push({ busName, oldRoute: change.old_route, newRoute: change.new_route, time: change.time });
        }
    }
    if (rows.length === 0) {
        $wrapper.hide();
        return;
    }
    rows.sort((a, b) => new Date(b.time) - new Date(a.time));
    $wrapper.show();

    rows.slice(0, 30).forEach(row => {
        const busLabel = (busData[row.busName] && busData[row.busName].busName)
            ? busData[row.busName].busName : row.busName;
        const routeColor = (row.newRoute && colorMappings[row.newRoute])
            ? colorMappings[row.newRoute] : 'var(--theme-color)';
        const changeTime = new Date(row.time);
        const timeStr = isNaN(changeTime)
            ? ''
            : changeTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        const $busCol = $('<div class="route-changes-bus pointer text-2rem"></div>').css('color', routeColor).text(busLabel);
        const $changeCol = $('<div class="route-changes-change pointer text-1p6rem"></div>').css('color', routeColor)
            .text(`${String(row.oldRoute || '?').toUpperCase()} → ${String(row.newRoute || '?').toUpperCase()}`);
        const $timeCol = $('<div class="route-changes-time pointer text-2rem"></div>').text(timeStr);
        const onRowClick = function() {
            $('.info-panels-close').trigger('click');
            flyToBus(row.busName);
            selectBusMarker(row.busName);
        };
        $busCol.add($changeCol).add($timeCol).click(onRowClick);
        $grid.append($busCol);
        $grid.append($changeCol);
        $grid.append($timeCol);
    });
}

function closeRouteMenu() {
    cancelInfoPanelAnimation();
    $('.subpanels-container').removeClass('is-dragging-or-animating');
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
    $('.left-btns, .right-btns').show();
    
    // Only show settings button if no stop is currently selected
    if (!popupStopId) {
        $('.settings-btn').show();
        showSimBtnIfEligible();
    }
    
    // Show parking campus selector only if user has a campus selected
    if (settings['parking-campus']) {
        $('.parking-campus-selector').show();
    }

    // Show the favorite star icon again if there are favorited buses
    if ($('.favs > div').length > 0) {
        $('.route-selector[routeName="fav"]').show();
    }

    // Store the original route selection before resetting state holders
    // If opened via long-press, use shownBeforeRoute; otherwise use originalShownRoute
    let routeToRestore = routePanelOpenedFromLongPress ? shownBeforeRoute : originalShownRoute;
    console.log('Restoring original route selection (state):', routeToRestore);
    console.log('Using shownBeforeRoute because routePanelOpenedFromLongPress:', routePanelOpenedFromLongPress);

    // Reset state holders
    routePanelOpenedFromLongPress = false;
    originalShownRoute = null;
    // Update last map selection tracker after restore
    lastMapShownRoute = shownRoute;
    shownBeforeRoute = null;
    console.log('shownRoute after restore:', shownRoute);

    console.log('shownRoute after closeRouteMenu:', shownRoute);

    panelRoute = null;
    
    // Update route selectors based on current stop selection
    if (popupStopId) {
        populateRouteSelectors(activeRoutes, popupStopId);
    } else {
        populateRouteSelectors(activeRoutes);
    }
    
    // Now restore the original route selection after selectors are populated
    if (routeToRestore) {
        // Ensure we end with the original single-route filter
        if (shownRoute !== routeToRestore) {
            console.log('Toggling to original route:', routeToRestore);
            toggleRoute(routeToRestore);
        } else {
            console.log('Already on original route:', routeToRestore);
        }
    } else {
        // No original route to restore - clear any active selection to show all routes
        if (shownRoute) {
            console.log('Clearing route selection to show all routes');
            toggleRoute(shownRoute); // This will unselect the current route
        } else {
            console.log('Already showing all buses');
        }
    }
}


let settingsPanelScrollSaveTimer = null;
let settingsPanelRestoreTimer = null;
let settingsPanelRestoreCancelled = false;

function saveSettingsPanelScroll() {
    if (!isDesktop) return;
    const settingsPanelEl = $('.settings-panel')[0];
    if (settingsPanelEl) {
        localStorage.setItem('settingsPanelScroll', String(settingsPanelEl.scrollTop));
    }
}

function restoreSettingsPanelScroll() {
    if (!isDesktop) return;
    const settingsPanelEl = $('.settings-panel')[0];
    if (!settingsPanelEl || !$('.settings-panel').is(':visible') || settingsPanelRestoreCancelled) return;
    const savedScroll = parseInt(localStorage.getItem('settingsPanelScroll'), 10);
    if (isNaN(savedScroll)) return;
    settingsPanelEl.scrollTop = savedScroll;
}

function openSettingsPanel() {
    sa_event('btn_press', {
        'btn': 'settings'
    });
    
    $('.settings-panel').show();
    markPanelOpened('settings');
    // if (!isDesktop) {
    $('.bottom').hide();
    // }
    $('.settings-floating-bar').show();
    if (isDesktop) {
        settingsPanelRestoreCancelled = false;
        // Keep the scroll position persisted while the panel is open so a
        // refresh restores the exact position (previously only saved on close).
        $('.settings-panel')
            .off('.settingsScrollSave .settingsScrollRestore')
            .on('scroll.settingsScrollSave', function() {
            clearTimeout(settingsPanelScrollSaveTimer);
            settingsPanelScrollSaveTimer = setTimeout(saveSettingsPanelScroll, 150);
            })
            .on('wheel.settingsScrollRestore pointerdown.settingsScrollRestore keydown.settingsScrollRestore touchstart.settingsScrollRestore', function() {
                settingsPanelRestoreCancelled = true;
            });
    }
    requestAnimationFrame(() => {
        adjustFontOptionSizes();
        restoreSettingsPanelScroll();
        // Web fonts load asynchronously and grow the panel, clamping an early
        // scrollTop to 0. Re-apply once fonts are ready and after a beat so
        // the restored position survives the late layout.
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(restoreSettingsPanelScroll);
        }
        clearTimeout(settingsPanelRestoreTimer);
        settingsPanelRestoreTimer = setTimeout(restoreSettingsPanelScroll, 250);
    });
    if (isDesktop && $('.buses-panel-wrapper').is(':visible')) {
        $('.buses-panel-wrapper').slideUp();
    }
    if (isDesktop) {
        localStorage.setItem('settingsPanelOpen', 'true');
    }
}

function closeSettingsPanel() {
    if (typeof detachSettingsViewportListeners === 'function') {
        detachSettingsViewportListeners();
    }
    if (isDesktop) {
        $('.settings-panel').off('.settingsScrollSave .settingsScrollRestore');
        clearTimeout(settingsPanelScrollSaveTimer);
        clearTimeout(settingsPanelRestoreTimer);
        settingsPanelRestoreCancelled = true;
        saveSettingsPanelScroll();
    }
    $('.settings-panel').hide();
    $('.bottom').show();
    $('.settings-floating-bar').hide();
    stopStatusUpdates();
    if (isDesktop) {
        localStorage.setItem('settingsPanelOpen', 'false');
    }
}

// Save the current scroll when the page is left with the panel open, since a
// refresh never fires closeSettingsPanel().
window.addEventListener('pagehide', function() {
    if (isDesktop && $('.settings-panel').is(':visible')) {
        saveSettingsPanelScroll();
    }
});

window.restoreSettingsPanelState = function() {
    if (isDesktop && localStorage.getItem('settingsPanelOpen') === 'true') {
        openSettingsPanel();
    }
}

// Open/close bindings for the settings panel (delegated so they survive any
// re-render of the route-selector row that contains the settings button).
$(document).on('click', '.settings-btn', function(e) {
    e.preventDefault();
    openSettingsPanel();
});

$(document).on('click', '.settings-close', function() {
    closeSettingsPanel();
});

const markerSizeMap = {
    'small': '20',
    'medium': '27',
    'big': '35'
};

const innerSizeMap = {
    'small': '8',
    'medium': '13',
    'big': '19'
};

const passioSizeMap = {
    'small': 'small-marker',
    'medium': 'medium-marker',
    'big': 'big-marker'
};

const riderSizeMap = {
    'small': 'small-marker',
    'medium': 'medium-marker',
    'big': 'big-marker'
};

const duckSizeMap = {
    'small': 'small-marker',
    'medium': 'medium-marker',
    'big': 'big-marker'
};

const toggleSettings = [
    'toggle-select-closest-stop',
    'toggle-show-arrival-times',
    'toggle-show-bus-speeds',
    'toggle-stops-above-buses',
    'toggle-always-show-second',
    'toggle-show-bike-racks',
    'toggle-disable-fireworks-on-open',
    'toggle-show-buildings',
    'toggle-show-alerts-other-campuses',
    'toggle-show-out-of-service',
    'toggle-show-bus-btns',
    'toggle-always-show-breaks',

    'toggle-pause-update-marker',
    'toggle-pause-rotation-updating',
    'toggle-pause-tripshot-polling',
    'toggle-show-stop-polygons',
    'toggle-show-dev-options',
    'toggle-show-etas-in-seconds',
    'toggle-dim-on-pan',
    'toggle-allow-landscape',
    'toggle-show-bus-progress',
    'toggle-show-bus-overtime-timer',
    'toggle-show-bus-names',
    'toggle-show-bus-path',
    'toggle-launch-fireworks-button',
    'toggle-show-campus-switcher',
    'toggle-hide-other-routes',
    'toggle-show-bus-log',
    'toggle-show-extra-bus-data',
    'toggle-show-stop-id',
    'toggle-show-knight-mover',
    'toggle-offscreen-bus-indicators',
    'toggle-offscreen-bus-indicators-above-gui',
    'toggle-offscreen-bus-indicators-select-on-tap',
    'toggle-show-invalid-etas',
    'toggle-show-rotation-points',
    'toggle-show-selected-rotation-points',
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
    'toggle-show-depot-poly',
    'toggle-pause-stop-eta-updates',
    'toggle-show-zoom-toast',
    'toggle-show-fps',
    'toggle-hide-sim-popup',
    'toggle-always-show-esc-hint',
    'toggle-pause-bus-markers-on-pan',
    'toggle-cull-offscreen-bus-markers',
    'toggle-always-show-break-overdue',
    'toggle-settings-btn-end',
    'toggle-force-show-polylines',
    'toggle-force-show-stops',
    'toggle-adaptive-pixel-ratio',
    'toggle-low-performance-mode',
    'toggle-disable-bus-rotation-fix-at-stop',
    'toggle-pause-stopped-for-timer',
    'toggle-offscreen-bus-indicators-pan-end-only',
    'toggle-center-stops-main-name',
    'toggle-show-closest-stops',
    'toggle-show-center-stops',
    'toggle-show-etas-in-ms',
]

let colorMappings;

// defaultSettings lives in vars.js (loaded first) so every script sees the
// current defaults; only user overrides are persisted by saveSettings().

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
    'helix': '#db6464',
    'kbs': '#64b374',
    'sim': '#ff6b6b',

    'psx': 'LightSalmon',
    'ps': 'LightGreen',
    'ccx': 'Plum',
    'cc': 'PaleTurquoise',

    'cam': 'navy',
}

function setDefaultSettings () {
    settings = {...defaultSettings, 'colorMappings': {}};
    saveSettings();
    $(`div.settings-option[font-option="PP Neue Montreal"]`).addClass('settings-selected')
    $(`div.settings-option[marker-size-option="medium"]`).addClass('settings-selected')
    $(`div.settings-option[gui-scale-option="normal"]`).addClass('settings-selected')
    $(`div.settings-option[marker-type-option="rubus"]`).addClass('settings-selected')
    $(`div.settings-option[bus-positioning-option="exact"]`).addClass('settings-selected')
    $(`div.settings-option[campus="nb"]`).addClass('settings-selected')
    
    $(`div.settings-option[theme-option="beige-coffee"]`).addClass('settings-selected')
    colorMappings = {...defaultColorMappings, ...settings['colorMappings']}
}

function loadSettingsFromStorage() {
    const raw = localStorage.getItem('settings');
    if (!raw) return null;
    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (e) {
        console.error('[settings] corrupted "settings" in localStorage; resetting to defaults:', e, '(raw: ' + raw + ')');
        localStorage.removeItem('settings');
        return null;
    }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        // Stored settings only contain user overrides (saveSettings prunes
        // defaults), so overlay them on the current defaults to get the full
        // effective settings object.
        const merged = {...defaultSettings, ...parsed};
        if (!('colorMappings' in parsed)) delete merged['colorMappings'];
        if (!('colorMappingsMigrated' in parsed)) delete merged['colorMappingsMigrated'];
        if (!('hideSimMigrated_2026_08_28' in parsed)) delete merged['hideSimMigrated_2026_08_28'];
        return merged;
    }
    console.error('[settings] stored "settings" is not a plain object; resetting to defaults:', parsed);
    localStorage.removeItem('settings');
    return null;
}

// Persist settings to localStorage, keeping only the values the user actually
// changed from the current defaults (same pattern as colorMappings). This
// keeps the stored dict minimal so future default changes in code flow
// through to existing clients automatically.
function saveSettings() {
    const stored = {};
    for (const key in settings) {
        if (key === 'colorMappings') {
            const overrides = {};
            for (const route in (settings[key] || {})) {
                if (settings[key][route] !== defaultColorMappings[route]) {
                    overrides[route] = settings[key][route];
                }
            }
            stored[key] = overrides;
        } else if (key === 'colorMappingsMigrated' || key === 'hideSimMigrated_2026_08_28') {
            // Always persist the migration flag once set so the one-time
            // migration doesn't re-run and wipe overrides.
            stored[key] = settings[key];
        } else if (settings[key] !== defaultSettings[key]) {
            stored[key] = settings[key];
        }
    }
    localStorage.setItem('settings', JSON.stringify(stored));
}

function updateSettings() {
    settings = loadSettingsFromStorage();
    if (settings) {

        // One-time migration: older clients may have a full copy of the default
        // palette stored in 'colorMappings' (even if they never customized any
        // color). Drop it so the current defaults in code take effect; only
        // routes the user directly chose are kept going forward.
        if (settings['colorMappingsMigrated'] !== true) {
            settings['colorMappings'] = {};
            settings['colorMappingsMigrated'] = true;
        }

        // One-time migration (8/28): disable simulator by default for existing users
        if (settings['hideSimMigrated_2026_08_28'] !== true) {
            settings['toggle-show-sim'] = false;
            settings['hideSimMigrated_2026_08_28'] = true;
            localStorage.setItem('simDisabledAt', new Date().toISOString());
        }

        // One-time migration: the old "legacy 10Hz bus animation" toggle is now
        // a three-way rate selector ("off"/"10hz"/"30hz"); map a stored "on"
        // to 10Hz so the previous choice is preserved.
        if (settings['toggle-legacy-bus-animation'] === true) {
            settings['bus-animation-rate'] = '10hz';
        }

        for (let key in defaultSettings) {
            if (!settings.hasOwnProperty(key)) {
                settings[key] = defaultSettings[key];
            }
        }
        for (let key in settings) {
            if (!defaultSettings.hasOwnProperty(key)) {
                delete settings[key];
            }
        }

        // Runtime palette = current defaults (from code) overlaid with stored
        // user overrides. Entries equal to the current default are redundant
        // (the default is applied automatically), so prune them to keep the
        // stored dict minimal and let future default changes flow through.
        const overrides = {};
        for (const key in (settings['colorMappings'] || {})) {
            if (settings['colorMappings'][key] !== defaultColorMappings[key]) {
                overrides[key] = settings['colorMappings'][key];
            }
        }
        settings['colorMappings'] = overrides;
        colorMappings = {...defaultColorMappings, ...overrides};

        saveSettings()

        document.documentElement.style.setProperty('--font-family', settings['font'] + ', sans-serif');

    } else {
        console.log('does this run?')
        // Create a temporary settings object with theme set to 'auto' for display purposes
        // but don't save it to localStorage until user confirms
        // settings = setDefaultSettings();
        settings = {...defaultSettings};
        settings['theme'] = 'beige-coffee';
        
        // Initialize colorMappings to avoid errors
        settings['colorMappings'] = {};
        colorMappings = {...defaultColorMappings};
        
        // Don't save to localStorage here - wait for user confirmation
    }

    selectedCampus = settings['campus'];
    campusChanged();

    $(`div.settings-option[font-option="${settings['font']}"]`).addClass('settings-selected')
    $(`div.settings-option[marker-size-option="${settings['marker-size']}"]`).addClass('settings-selected')
    $(`div.settings-option[gui-scale-option="${settings['gui-scale']}"]`).addClass('settings-selected')
    $(`div.settings-option[marker-type-option="${settings['marker-type']}"]`).addClass('settings-selected')

    updateRubusLogo(settings['rubus-logo'] || 'rubus-favicon-back-to-college.png');

    applyGuiScale(settings['gui-scale']);
    
    // Update marker size examples to match the current marker type
    updateMarkerSizeExamples();
    
    $(`div.settings-option[bus-positioning-option="${settings['bus-positioning']}"]`).addClass('settings-selected')
    $(`div.settings-option[raster-sharpness-option="${settings['raster-sharpness']}"]`).addClass('settings-selected')
    $(`div.settings-option[bus-marker-renderer-option="${settings['bus-marker-renderer']}"]`).addClass('settings-selected')
    $(`div.settings-option[chatbot-model-option="${settings['chatbot-model'] || 'ling'}"]`).addClass('settings-selected')
    $(`div.settings-option[chatbot-provider-option="${settings['chatbot-provider'] || 'auto'}"]`).addClass('settings-selected')
    $(`div.settings-option[bus-animation-rate-option="${settings['bus-animation-rate']}"]`).addClass('settings-selected')
    $(`div.settings-option[campus-option="${settings['campus']}"]`).addClass('settings-selected');

    if (!$('.theme-modal').is(':visible')) {
        $(`div.settings-option[theme-option="${settings['theme']}"]`).addClass('settings-selected')
    }

    // Pre-generate all colored SVGs for better performance
    preGenerateColoredSvgs().catch(error => {
        console.error('Failed to pre-generate colored SVGs:', error);
    });

    // Load parking campus setting
    if (settings['parking-campus']) {
        $('.parking-campus-option').addClass('settings-selected');
    }

    const parkingCampus = settings['parking-campus'];
    if (parkingCampus && parkingCampus !== false) {
        // Update parking button UI to show selected campus
        $('.parking-campus-option').removeClass('selected');
        $(`.parking-campus-option[data-campus="${parkingCampus}"]`).addClass('selected');
        $('.parking-add-btn .mr-0p5rem').text(parkingCampus);
        $('.parking-add-btn .text-1p3rem').hide();
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

        else if (settingsOption === 'gui-scale') {

            $(`div.settings-selected[settings-option="${settingsOption}"]`).removeClass('settings-selected')
            $(this).addClass('settings-selected')
            settings['gui-scale'] = $(this).attr('gui-scale-option')
            applyGuiScale(settings['gui-scale'])

        }

        else if (settingsOption === 'marker-type') {

            $(`div.settings-selected[settings-option="${settingsOption}"]`).removeClass('settings-selected')
            const markerType = $(this).attr('marker-type-option')
            $(`div.settings-option[settings-option="${settingsOption}"][marker-type-option="${markerType}"]`).addClass('settings-selected')
            settings['marker-type'] = markerType
            updateMarkerType()

        }


        else if (settingsOption === 'theme') {
            
            $(`div.settings-selected[settings-option="${settingsOption}"]`).removeClass('settings-selected')
            $(this).addClass('settings-selected')
            settings['theme'] = $(this).attr('theme-option')

            const theme = resolveAutoTheme($(this).attr('theme-option'));

            changeMapStyle(theme)

            sa_event('theme_changed', {
                'theme': $(this).attr('theme-option'),
                'source': 'settings'
            });

        } else if (settingsOption === 'bus-positioning') {
            $(`div.settings-selected[settings-option="${settingsOption}"]`).removeClass('settings-selected')
            $(this).addClass('settings-selected')
            settings['bus-positioning'] = $(this).attr('bus-positioning-option')

        } else if (settingsOption === 'raster-sharpness') {
            $(`div.settings-selected[settings-option="${settingsOption}"]`).removeClass('settings-selected')
            $(this).addClass('settings-selected')
            settings['raster-sharpness'] = $(this).attr('raster-sharpness-option')
            if (typeof applyRasterSharpnessSetting === 'function') {
                applyRasterSharpnessSetting();
            }

        } else if (settingsOption === 'bus-marker-renderer') {
            // Low Performance Mode forces the MapLibre WebGL renderer.
            if (settings && settings['toggle-low-performance-mode'] && $(this).attr('bus-marker-renderer-option') !== 'maplibre') {
                return;
            }
            $(`div.settings-selected[settings-option="${settingsOption}"]`).removeClass('settings-selected')
            $(this).addClass('settings-selected')
            settings['bus-marker-renderer'] = $(this).attr('bus-marker-renderer-option')
            // Recreate markers so the new renderer implementation takes effect.
            recreateAllBusMarkers();
            // Stops switch between DOM markers and GL layers with the renderer.
            if (typeof stopLayerManager !== 'undefined') {
                stopLayerManager.applyRendererMode();
            }

        } else if (settingsOption === 'chatbot-model') {
            $(`div.settings-selected[settings-option="${settingsOption}"]`).removeClass('settings-selected')
            $(this).addClass('settings-selected')
            settings['chatbot-model'] = $(this).attr('chatbot-model-option')

        } else if (settingsOption === 'chatbot-provider') {
            $(`div.settings-selected[settings-option="${settingsOption}"]`).removeClass('settings-selected')
            $(this).addClass('settings-selected')
            settings['chatbot-provider'] = $(this).attr('chatbot-provider-option')

        } else if (settingsOption === 'bus-animation-rate') {
            // Low Performance Mode forces the fixed 10Hz rate.
            if (settings && settings['toggle-low-performance-mode'] && $(this).attr('bus-animation-rate-option') !== '10hz') {
                return;
            }
            $(`div.settings-selected[settings-option="${settingsOption}"]`).removeClass('settings-selected')
            $(this).addClass('settings-selected')
            settings['bus-animation-rate'] = $(this).attr('bus-animation-rate-option')
            // Reapply to in-flight animations (buses already animating).
            applyBusAnimationRate(settings['bus-animation-rate'])

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
            saveSettings()
        }

    })

    toggleSettings.forEach(toggleSetting => {

        const isChecked = settings[toggleSetting]; 
        const $toggleInput = $(`#${toggleSetting}`);

        if ($toggleInput.length) {
            $toggleInput.prop('checked', isChecked);
        }

    });

    $('#toggle-hide-sim').prop('checked', !settings['toggle-show-sim']);

    // Show Closest Stops toggle controls the center-stops chips above the buildings button
    var _csEnabled = (settings['toggle-show-closest-stops'] !== false) && (settings['toggle-show-center-stops'] !== false);
    if (!_csEnabled) {
        $('.center-stops-btns').hide();
        var $csDep = $('#toggle-center-stops-main-name').closest('.flex');
        $csDep.addClass('disabled');
        $('#toggle-center-stops-main-name').prop('disabled', true);
    } else {
        var $csDep2 = $('#toggle-center-stops-main-name').closest('.flex');
        $csDep2.removeClass('disabled');
        $('#toggle-center-stops-main-name').prop('disabled', false);
        // If no popup is open, ensure the widget is visible (updateCenterStops will populate it)
        if (!$('.bus-info-popup').is(':visible') && !$('.stop-info-popup').is(':visible') && !$('.building-info-popup').is(':visible')) {
            window.updateCenterStops();
        }
    }

    // Low Performance Mode forces bus focusing off; enforce at every settings load.
    applyLowPerformanceModeState();

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

    // Sync PostHog Person Profile with persistent uid and user settings
    syncPostHogPersonProfile();

    // Dispatch event to notify other components that settings are updated
    document.dispatchEvent(new CustomEvent('rubus-settings-updated'));

    // The portrait lock depends on the "Allow Landscape" setting that was just
    // loaded above, so re-apply it now that settings are final. (applyOrientationLock
    // also runs on document.ready in settings.js, but at that point the saved
    // value may not be loaded yet, which causes a flicker on startup.)
    if (typeof applyOrientationLock === 'function') {
        applyOrientationLock();
    }
}

function syncPostHogPersonProfile() {
    if (typeof window.posthog === 'undefined' || typeof window.posthog.identify !== 'function') return;

    const uid = localStorage.getItem('uid');
    if (!uid) return;

    const timeJoined = localStorage.getItem('timeJoined') || new Date().toISOString();
    const isPWA = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
    const isTouch = 'ontouchstart' in window || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0);

    let favList = [];
    try {
        if (typeof favBuses !== 'undefined' && Array.isArray(favBuses)) {
            favList = favBuses;
        } else {
            favList = JSON.parse(localStorage.getItem('favs') || '[]');
        }
    } catch (e) {
        favList = [];
    }

    let favRouteList = [];
    try {
        if (typeof favoriteRoutes !== 'undefined' && Array.isArray(favoriteRoutes)) {
            favRouteList = favoriteRoutes;
        } else {
            favRouteList = JSON.parse(localStorage.getItem('favoriteRoutes') || '[]');
        }
    } catch (e) {
        favRouteList = [];
    }

    const currentSettings = (typeof settings !== 'undefined') ? settings : {};

    const personProps = {
        campus: currentSettings['campus'] || 'nb',
        theme: currentSettings['theme'] || 'system',
        chat_enabled: !!currentSettings['toggle-show-chat'],
        chatbot_provider: currentSettings['chatbot-provider'] || 'auto',
        chatbot_model: currentSettings['chatbot-model'] || 'ling',
        buildings_enabled: !!currentSettings['toggle-show-buildings'],
        parking_enabled: !!currentSettings['toggle-show-parking'],
        bike_racks_enabled: !!currentSettings['toggle-show-bike-racks'],
        low_performance_mode: !!currentSettings['toggle-low-performance'],
        spoofing_enabled: !!currentSettings['toggle-spoofing'],
        favorite_buses: favList,
        favorite_routes: favRouteList,
        is_pwa: !!isPWA,
        is_touch_device: !!isTouch
    };

    const setOnceProps = {
        time_joined: timeJoined,
        initial_campus: currentSettings['campus'] || 'nb',
        first_seen_date: timeJoined.slice(0, 10)
    };

    window.posthog.identify(uid, personProps, setOnceProps);
}
window.syncPostHogPersonProfile = syncPostHogPersonProfile;

function updateRubusLogo(logoFilename) {
    if (!logoFilename) logoFilename = 'rubus-favicon-back-to-college.png';
    settings['rubus-logo'] = logoFilename;
    $('.settings-rubus-logo').css('background-image', `url('img/${logoFilename}')`);
    $('link[rel="icon"]').attr('href', `img/${logoFilename}`);
    $('.theme-img, .campus-img').attr('src', `img/${logoFilename}`);
    $('.rubus-logo-option').removeClass('settings-selected');
    $(`.rubus-logo-option[logo-option="${logoFilename}"]`).addClass('settings-selected');
}

function selectRubusLogo(logoFilename) {
    updateRubusLogo(logoFilename);
    saveSettings();
    if (typeof sa_event === 'function') {
        sa_event('settings_change', { setting: 'rubus_logo', value: logoFilename });
    }
}

$(document).ready(function() {

    // updateSettings();

    $('.stop-info-back-wrapper').click(function() {
        // If we arrived here from a navigation waypoint, return to nav
        if (navBackActive) {
            navBackActive = false;
            openNavBack();
            return;
        }
        // If we arrived here from a search result, return to search
        if (typeof searchBackActive !== 'undefined' && searchBackActive && typeof openSearchBack === 'function') {
            $('.stop-info-popup').hide();
            $('.stop-info-hide-oos').hide();
            searchBackActive = false;
            openSearchBack();
            return;
        }
        flyToBus(sourceBusName);
        $('.stop-info-popup').hide();
        $('.stop-info-hide-oos').hide();
        // setting sourceBusName to null breaks stuff
    });

    $('.building-info-back-wrapper').click(function() {
        // If we arrived here from a navigation waypoint, return to nav
        if (navBackActive) {
            navBackActive = false;
            openNavBack();
            return;
        }
        if (typeof searchBackActive !== 'undefined' && searchBackActive && typeof openSearchBack === 'function') {
            $('.building-info-popup').hide();
            searchBackActive = false;
            openSearchBack();
        }
    });

    $('.bus-info-back-wrapper').click(function() {
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
        saveSettings();
    });

    // Handle window resize to adjust font option sizes and theme modal indicator
    $(window).on('resize', function() {
        adjustFontOptionSizes();
        if (typeof updateThemeIndicator === 'function') {
            updateThemeIndicator();
        }
    });

    adjustFontOptionSizes();

})

function toggleDevOptions() {

    const $devWrapper = $('.dev-options-wrapper');
    const $devTitle = $('.dev-options-head');
    const optionsShown = $devWrapper.is(':visible');

    if(!optionsShown) {
        if (typeof filterSettings === 'function') {
            filterSettings($('#settings-search-input').val() || '', true);
        }
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
    const passioSizeClass = passioSizeMap[settings['marker-size']]
    const riderSizeClass = riderSizeMap[settings['marker-size']]

    $('.bus-icon-outer').css('height', outterDimensions + 'px').css('width', outterDimensions + 'px');
    $('.bus-icon-inner').css('height', innerDimensions + 'px').css('width', innerDimensions + 'px');

    // Update Passio marker sizes by changing CSS classes (only map markers, not settings examples)
    $('.bus-marker-wrapper .passio-marker').removeClass('small-marker medium-marker big-marker').addClass(passioSizeClass);

    // Update rider marker sizes by changing CSS classes (only map markers, not settings examples)
    $('.bus-marker-wrapper .rider-marker').removeClass('small-marker medium-marker big-marker').addClass(riderSizeClass);
    
    // Update duck marker sizes by changing CSS classes (only map markers, not settings examples)
    const duckSizeClass = duckSizeMap[settings['marker-size']];
    $('.bus-marker-wrapper .duck-marker').removeClass('small-marker medium-marker big-marker').addClass(duckSizeClass);

    // Update WebGL bus markers
    if (typeof busLayerManager !== 'undefined') {
        busLayerManager.updateAllMarkerStyles();
    }
}

function applyGuiScale(scale) {
    const sizes = { small: '50%', normal: '62.5%', large: '75%', larger: '87.5%' };
    document.documentElement.style.fontSize = sizes[scale] || '62.5%';
    adjustFontOptionSizes();
}

function updateMarkerSizeExamples() {
    const markerType = settings['marker-type'];

    if (markerType === 'passio') {
        // Show Passio markers, hide RUBus, Rider, and Duck markers
        $('.settings-marker-size .passio-marker').show();
        $('.settings-marker-size .marker').hide();
        $('.settings-marker-size .rider-marker').hide();
        $('.settings-marker-size .duck-marker').hide();
    } else if (markerType === 'rider') {
        // Show Rider markers, hide RUBus, Passio, and Duck markers
        $('.settings-marker-size .rider-marker').show();
        $('.settings-marker-size .marker').hide();
        $('.settings-marker-size .passio-marker').hide();
        $('.settings-marker-size .duck-marker').hide();
    } else if (markerType === 'duck') {
        // Show Duck markers, hide RUBus, Passio, and Rider markers
        $('.settings-marker-size .duck-marker').show();
        $('.settings-marker-size .marker').hide();
        $('.settings-marker-size .passio-marker').hide();
        $('.settings-marker-size .rider-marker').hide();
    } else {
        // Show RUBus markers, hide Passio, Rider, and Duck markers (default case)
        $('.settings-marker-size .marker').show();
        $('.settings-marker-size .passio-marker').hide();
        $('.settings-marker-size .rider-marker').hide();
        $('.settings-marker-size .duck-marker').hide();
    }
}

function updateMarkerType() {
    // Update existing markers to use the new marker type
    console.log(`Marker type changed to: ${settings['marker-type']}`);

    // Update marker size examples to match the new marker type
    updateMarkerSizeExamples();

    recreateAllBusMarkers();
}

// Tear down and recreate every bus marker (used when the marker type or the
// marker renderer implementation changes).
function recreateAllBusMarkers() {
    const busNames = Object.keys(busMarkers);
    for (const busName of busNames) {
        // Remove the old marker from the map
        if (busMarkers[busName] && typeof busMarkers[busName].remove === 'function') {
            busMarkers[busName].remove();
        }
        
        // Clean up the proxy
        if (typeof busLayerManager !== 'undefined') {
            busLayerManager.removeProxy(busName);
        }
        
        // Clear the marker from the busMarkers object
        delete busMarkers[busName];

        // Recreate the marker with the new type. On failure, drop the busData
        // entry so the busData ⟺ busMarkers invariant holds (it will be
        // re-fetched on the next poll) instead of leaving a markerless bus.
        try {
            plotBus(busName, true); // true for immediate update
        } catch (e) {
            console.error('[recreateAllBusMarkers] could not recreate marker for', busName, ':', e);
            if (!busMarkers[busName]) {
                delete busETAs[busName];
                delete busData[busName];
            }
        }
    }
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

    const userLat = userPosition[0];
    const userLong = userPosition[1];

    const stopIds = activeStops.length > 0 ? activeStops : Object.keys(stopsData);

    for (const stopId of stopIds) {
        // Only consider stops that are actually shown on the map (the same
        // visible marker pool the center-stop chips draw from). This keeps the
        // closest stop consistent with what's rendered: a stop visible only
        // because "show out of service buses" is on counts, and when no buses
        // are running we fall back to showing all stops, so every one counts.
        // (The old servicedStops filter excluded all stops whenever no buses
        // ran, and never matched OOS-visible stops.)
        const marker = busStopMarkers[stopId];
        if (!marker || !marker._addedToMap) continue;
        const stop = stopsData[stopId];
        if (!stop) continue;
        const distance = haversine(userLat, userLong, stop.latitude, stop.longitude);

        closestStopDistances[stopId] = distance;

        if (distance < thisClosestDistance) {
            thisClosestDistance = distance;
            closestStop = stop;
            thisClosestStopId = Number(stopId);
        }
    }

    closestStopId = thisClosestStopId;

    if (typeof window.refreshCenterStopsClosest === 'function') {
        window.refreshCenterStopsClosest();
    }

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
            window.locationMarker = null;
        }
        if (window.marker) {
            window.marker.remove();
            window.marker = null;
        }

        const locationMarker = L.marker(userPosition, 
            { icon: createLocationMarkerIcon() }
        ).addTo(map);
        
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
            $('.bus-info-popup, .stop-info-popup').hide();  
            $('.my-location-popup').show();
            if (typeof hideCenterStops === 'function') hideCenterStops();
            // map.flyTo(userPosition, 18, {
            //     animate: true,
            //     duration: 0.3
            // });
        })

        $('.fly-closest-stop-wrapper').fadeIn();
        if (settings['toggle-select-closest-stop'] && fly && !panelRoute && !$('.settings-panel').is(':visible') && !mapDragged && closestDistance < 3 && !popupBusName && !popupStopId && !shownRoute) {
            sourceStopId = null;
            sourceBusName = null;
            if (!sharedBusName) {
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
    // Check if navigator and permissions API are available
    if (!navigator || !navigator.permissions || !navigator.permissions.query) {
        const error = new Error('Navigator permissions API not available');
        console.warn('Navigator permissions API not available:', error);
        throw error;
    }

    const permissionStatus = await navigator.permissions.query({ name: 'geolocation' });

    const lsLocationShared = localStorage.getItem('locationShared');
    locationShared = lsLocationShared === 'true';
    
    // console.log("(localStorage) Location shared: ", locationShared)
    // console.log("geolocation permission state: ", permissionStatus.state)
    if (permissionStatus.state === 'granted' || (!isIOSDevice() && locationShared)) {
        findNearestStop(true);
    }
}

function flyToStop(stopId, fromUserInteraction = false) {
    console.log('[DEBUG flyToStop]', { stopId, fromUserInteraction, hasStopData: !!(stopsData && stopsData[stopId]), hasMarker: !!(busStopMarkers && busStopMarkers[stopId]), busStopMarkersKeys: Object.keys(busStopMarkers || {}) });
    const stopData = stopsData[stopId];
    if (!stopData) {
        console.error('[DEBUG flyToStop] Missing stopData for stopId:', stopId);
    }
    const lat = Number(stopData.latitude);
    const long = Number(stopData.longitude);
    const loc = { lat, long };

    // Show the popup first (it is a top-anchored card), then center the stop
    // in the map area that remains visible below it.
    if (appStyle === 'rider') {
        popRiderStopInfo(stopId);
    } else {
        popStopInfo(Number(stopId));
    }
    flyToCenteredBelow([loc.lat, loc.long], 15, document.querySelector('.stop-info-popup .stop-info-popup-inner'), 0.5);

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
            // map.getCenter() returns a plain {lat,lng} under the MapLibre compat
            // layer — wrap it in L.latLng to get .distanceTo (same pattern as
            // centerme.js).
            const currentCenter = L.latLng(map.getCenter());
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

        // Clear other location button backgrounds since we're moving the map (force clear to override in-progress states)
        clearPanoutFeedback();
        clearCentermeFeedback(true);
        
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

    // Check if user is in a building and display building name
    if (userPosition && userPosition.length === 2) {
        const $currentLocationDiv = $('.current-location');
        
        // Update building location cache if user moved significantly
        onUserLocationChanged(userPosition[0], userPosition[1]);

        // Check if buildings are already loaded
        if (window.buildingsLayer && buildingSpatialIndex) {
            // Buildings are loaded, check immediately
            const building = getBuildingAtLocation(userPosition[0], userPosition[1]);
            updateLocationDisplay(building, $currentLocationDiv);
        } else {
            // Buildings not loaded, load them first (data only, won't show on map unless setting enabled)
            loadBuildings().then(() => {
                const building = getBuildingAtLocation(userPosition[0], userPosition[1]);
                updateLocationDisplay(building, $currentLocationDiv);
            }).catch(error => {
                console.error('Error loading buildings for location detection:', error);
                updateLocationDisplay(null, $currentLocationDiv);
            });
        }
    }
    
    // Helper function to update location display
    function updateLocationDisplay(building, $currentLocationDiv) {
        // Try to get nearest road/address
        getNearestAddress(userPosition[0], userPosition[1]).then(nearestAddress => {
            if (building && building.name) {
                // Show building info, and also mention the road if available
                if (nearestAddress && nearestAddress.name) {
                    // Avoid redundant "(near X)" when building name already contains the street (e.g. "allison road classroom building arc" near "allison road")
                    if (building.name.toLowerCase().includes(nearestAddress.name.toLowerCase())) {
                        $currentLocationDiv.text(`You're at ${building.name}`);
                    } else {
                        $currentLocationDiv.empty()
                            .append(document.createTextNode(`You're at ${building.name}`))
                            .append($('<br>'))
                            .append($('<span>').css({ 'font-size': '0.8em', opacity: 0.8 }).text(`(near ${nearestAddress.name})`));
                    }
                } else {
                    $currentLocationDiv.text(`You're at ${building.name}`);
                }
            } else {
                // Not in a building, show nearest road/address
                if (nearestAddress && nearestAddress.name) {
                    $currentLocationDiv.text(`Near ${nearestAddress.name}`);
                } else {
                    $currentLocationDiv.text('You');
                }
            }
        }).catch(error => {
            $currentLocationDiv.text('You');
        });
    }
    
    let count = 0;
    
    for (const [stopId, distance] of closestStopsMap) {

        if (!activeStops.includes(parseInt(stopId))) continue;

        const stop = stopsData[stopId];
        // Skip stop IDs that no longer exist in the current campus's data.
        // This guards against stale closestStopsMap entries that could otherwise
        // crash here by reading `.name` on undefined.
        if (!stop) continue;
        
        const stopNameDiv = $(`<div class="name pointer">${stop.name}</div>`).click(() => { 
            clearPanoutFeedback();
            flyToStop(Number(stopId));
        })
        const stopDistDiv = $(`<div class="center" style="grid-row: span 2; color: var(--theme-color-lighter)">
            <div class="dist bold pointer justify-center">${Math.round((distance*1000*3.28)).toLocaleString()}ft</div>
            <div class="text-1p3rem flex align-center justify-center">
                <i class="fa-solid fa-person-walking text-1rem"></i>
                <div>${Math.round((distance * 1000 * 3.28084) / 220)}m</div>
            </div>
        </div>`).click(() => { 
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
            const soonestBus = getSoonestBus(parseInt(stopId), route);
            const eta = soonestBus[1];
            const hasInService = routeHasInServiceBuses(route);
            const bgCol = hasInService ? colorMappings[route] : 'gray';

            let etaText = '';
            if (eta !== null && eta !== Infinity && typeof eta === 'number') {
                etaText = ` ${Math.ceil(eta % 60)}m`;
            }

            $routesHereDiv.append($(`<div class="route-here route-here-${route} pointer">${route.toUpperCase()}${etaText}</div>`)
            .css('background-color', bgCol)
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


let currentBuildNumber = null;

async function getBuildNumber() {
    // The build number is constant per deploy; fetch it once no matter how many
    // times this is called.
    if (currentBuildNumber !== null) return;
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
            currentBuildNumber = lastPage;
            $('.build-number').html(`Alpha ${lastPage - 473} <span style="color:var(--theme-extra)">//</span> b${lastPage.toLocaleString()} (${commitDate})`);
            // Show the changelog "NEW" badge only when the build has advanced
            // past the one the user last opened the changelog on.
            updateChangelogNewBadge();

            // If the update confirmation toast is currently visible showing the generic label, update it in-place
            const $toast = $('#update-toast');
            if ($toast.length && $toast.is(':visible') && $toast.find('.update-toast-text').text().trim() === 'Installed update') {
                $toast.find('.update-toast-text').html(`<i class="fa-solid fa-circle-check" style="color: #10b981;"></i> Installed update v${lastPage}`);
            }
        }
    });
}


let selectedTheme = document.documentElement.getAttribute('data-selected-theme') || 'beige-coffee';

const themeIndicatorColorMap = {
    light:            { bg: 'black',              shadow: 'none' },
    dark:             { bg: 'rgb(203,203,203)',   shadow: 'none' },
    'y2k-glamour':    { bg: '#ec4899',            shadow: '0 0 12px rgba(236,72,153,0.5)' },
    glamour:          { bg: '#ec4899',            shadow: '0 0 12px rgba(236,72,153,0.5)' },
    'beige-coffee':   { bg: '#a0522d',            shadow: '0 0 10px rgba(160,82,45,0.4)' },
    coffee:           { bg: '#a0522d',            shadow: '0 0 10px rgba(160,82,45,0.4)' },
    forest:           { bg: '#c49a3c',            shadow: '0 0 12px rgba(196,154,60,0.5)' }
};

function updateThemeIndicator(theme) {
    if (!theme) {
        theme = (typeof selectedTheme !== 'undefined' && selectedTheme) || document.documentElement.getAttribute('data-selected-theme') || (typeof settings !== 'undefined' && settings && settings['theme']) || 'beige-coffee';
    }
    const indicator = document.querySelector('.theme-indicator');
    const target = document.querySelector(`[data-theme="${theme}"]`);
    const slider = document.querySelector('.theme-slider');
    if (!indicator || !target || !slider) return;

    const options = slider.querySelectorAll('.theme-option');
    const index = Array.from(options).indexOf(target);
    const count = options.length;
    const isColumn = getComputedStyle(slider).flexDirection === 'column';

    if (isColumn) {
        indicator.style.top = `calc(${index} * (100% / ${count}) - 3px)`;
        indicator.style.height = `calc(100% / ${count} + 6px)`;
        indicator.style.left = '-3px';
        indicator.style.width = 'calc(100% + 6px)';
    } else {
        indicator.style.left = `calc(${index} * (100% / ${count}) - 3px)`;
        indicator.style.width = `calc(100% / ${count} + 6px)`;
        indicator.style.top = '-3px';
        indicator.style.height = 'calc(100% + 6px)';
    }

    const resolved = resolveAutoTheme(theme);
    const colors = themeIndicatorColorMap[resolved];
    if (colors) {
        indicator.style.backgroundColor = colors.bg;
        indicator.style.boxShadow = colors.shadow;
    }
}

let _currentActivePreviewImg = 0;
let _lastPreviewThemeSrc = null;

function updateThemePreviewImage(theme) {
    const previewTheme = resolveAutoTheme(theme);
    const newSrc = `img/theme-select/${previewTheme}.png`;

    const img0 = document.getElementById('theme-preview-img');
    const img1 = document.getElementById('theme-preview-img-next');
    if (!img0) return;
    if (!img1) {
        img0.src = newSrc;
        return;
    }

    if (!_lastPreviewThemeSrc) {
        _lastPreviewThemeSrc = img0.getAttribute('src');
    }
    if (_lastPreviewThemeSrc === newSrc) return;
    _lastPreviewThemeSrc = newSrc;

    if (_currentActivePreviewImg === 0) {
        img1.src = newSrc;
        img1.style.opacity = '1';
        img0.style.opacity = '0';
        _currentActivePreviewImg = 1;
    } else {
        img0.src = newSrc;
        img0.style.opacity = '1';
        img1.style.opacity = '0';
        _currentActivePreviewImg = 0;
    }
}

function initThemeSliderDrag() {
    const slider = document.querySelector('.theme-slider');
    const indicator = document.querySelector('.theme-indicator');
    if (!slider || !indicator) return;

    let dragging = false;
    let startX = 0;
    let didDrag = false;
    let holdTimer = null;
    let lastClosestTheme = null;

    function getOptionCenter(option) {
        return option.offsetLeft + option.offsetWidth / 2;
    }

    function getClosestTheme(clientX) {
        const sliderRect = slider.getBoundingClientRect();
        const relativeX = clientX - sliderRect.left;
        const options = slider.querySelectorAll('.theme-option');
        let closest = null;
        let minDist = Infinity;

        options.forEach(opt => {
            const center = getOptionCenter(opt);
            const dist = Math.abs(relativeX - center);
            if (dist < minDist) {
                minDist = dist;
                closest = opt;
            }
        });
        return closest;
    }

    function applyPopup() {
        if (indicator.style.top === '-6px') return;
        indicator.style.transition = 'top 0.1s ease, height 0.1s ease, left 0.1s ease, width 0.1s ease, background-color 0.3s ease, box-shadow 0.3s ease';
        indicator.style.top = '-6px';
        indicator.style.height = 'calc(100% + 12px)';
        const currentLeft = indicator.offsetLeft;
        const currentWidth = indicator.offsetWidth;
        indicator.style.left = (currentLeft - 3) + 'px';
        indicator.style.width = (currentWidth + 6) + 'px';
    }

    function snapToClosest(clientX) {
        const closest = getClosestTheme(clientX);
        if (closest) {
            indicator.style.transition = 'left 0.2s ease, width 0.2s ease, top 0.15s ease, height 0.15s ease, background-color 0.3s ease, box-shadow 0.3s ease';
            indicator.style.top = '-3px';
            indicator.style.height = 'calc(100% + 6px)';
            const theme = closest.getAttribute('data-theme');
            updateThemeIndicator(theme);
            selectTheme(theme);
        }
        lastClosestTheme = null;
    }

    function shrinkBack() {
        indicator.style.transition = 'left 0.2s ease, width 0.2s ease, top 0.15s ease, height 0.15s ease, background-color 0.3s ease, box-shadow 0.3s ease';
        indicator.style.top = '-3px';
        indicator.style.height = 'calc(100% + 6px)';
        updateThemeIndicator(selectedTheme);
    }

    slider.addEventListener('pointerdown', function(e) {
        if (getComputedStyle(slider).flexDirection === 'column') return;

        dragging = true;
        didDrag = false;
        startX = e.clientX;
        lastClosestTheme = null;
        slider.setPointerCapture(e.pointerId);

        clearTimeout(holdTimer);
        holdTimer = setTimeout(function() {
            if (!dragging || didDrag) return;
            applyPopup();
        }, 400);
    });

    slider.addEventListener('pointermove', function(e) {
        if (!dragging) return;
        const deltaX = e.clientX - startX;
        if (Math.abs(deltaX) > 5) {
            if (!didDrag) {
                clearTimeout(holdTimer);
                applyPopup();
                indicator.style.transition = 'background-color 0.3s ease, box-shadow 0.3s ease';
            }
            didDrag = true;
        }
        if (!didDrag) return;

        const options = slider.querySelectorAll('.theme-option');
        const firstOption = options[0];
        const lastOption = options[options.length - 1];
        const minLeft = firstOption.offsetLeft - 6;
        const maxLeft = lastOption.offsetLeft - 6;

        const sliderRect = slider.getBoundingClientRect();
        const indicatorHalfWidth = indicator.offsetWidth / 2;
        let newLeft = (e.clientX - sliderRect.left) - indicatorHalfWidth;
        newLeft = Math.max(minLeft, Math.min(maxLeft, newLeft));

        indicator.style.left = newLeft + 'px';

        const closest = getClosestTheme(e.clientX);
        if (closest) {
            const theme = closest.getAttribute('data-theme');
            if (theme !== lastClosestTheme) {
                lastClosestTheme = theme;
                slider.querySelectorAll('.theme-option').forEach(opt => opt.classList.remove('selected'));
                closest.classList.add('selected');
                const resolved = resolveAutoTheme(theme);
                const colors = themeIndicatorColorMap[resolved];
                if (colors) {
                    indicator.style.backgroundColor = colors.bg;
                    indicator.style.boxShadow = colors.shadow;
                }
                const previewTheme = resolveAutoTheme(theme);
                document.documentElement.setAttribute('data-selected-theme', theme);
                document.documentElement.setAttribute('theme', previewTheme);
                updateThemePreviewImage(theme);
            }
        }
    });

    slider.addEventListener('pointerup', function(e) {
        if (!dragging) return;
        dragging = false;
        clearTimeout(holdTimer);

        if (didDrag) {
            snapToClosest(e.clientX);
        } else if (indicator.style.top === '-6px') {
            shrinkBack();
        }
    });

    slider.addEventListener('pointercancel', function(e) {
        if (!dragging) return;
        dragging = false;
        clearTimeout(holdTimer);
        if (didDrag) {
            snapToClosest(e.clientX);
        } else if (indicator.style.top === '-6px') {
            shrinkBack();
        }
    });

    slider.querySelectorAll('.theme-option').forEach(opt => {
        opt.addEventListener('pointerdown', function(e) {
            if (getComputedStyle(slider).flexDirection === 'column') return;
            const theme = opt.getAttribute('data-theme');
            if (!theme) return;

            dragging = true;
            didDrag = false;
            startX = e.clientX;
            lastClosestTheme = null;
            slider.setPointerCapture(e.pointerId);

            selectTheme(theme);

            const options = slider.querySelectorAll('.theme-option');
            const index = Array.from(options).indexOf(opt);
            const count = options.length;

            indicator.style.transition = 'left 0.3s ease, width 0.3s ease, top 0.15s ease, height 0.15s ease, background-color 0.3s ease, box-shadow 0.3s ease';
            indicator.style.left = `calc(${index} * (100% / ${count}) - 6px)`;
            indicator.style.width = `calc(100% / ${count} + 12px)`;
            indicator.style.top = '-6px';
            indicator.style.height = 'calc(100% + 12px)';

            clearTimeout(holdTimer);
        });
    });

    document.addEventListener('keydown', function(e) {
        const themeModal = document.querySelector('.theme-modal');
        if (!themeModal || themeModal.style.display === 'none') return;
        if (getComputedStyle(slider).flexDirection !== 'column') return;

        const options = slider.querySelectorAll('.theme-option');
        const selected = slider.querySelector('.theme-option.selected');
        const currentIndex = Array.from(options).indexOf(selected);

        let newIndex = currentIndex;
        if (e.key === 'ArrowDown') {
            newIndex = Math.min(currentIndex + 1, options.length - 1);
        } else if (e.key === 'ArrowUp') {
            newIndex = Math.max(currentIndex - 1, 0);
        } else {
            return;
        }

        if (newIndex === currentIndex) return;

        e.preventDefault();
        const theme = options[newIndex].getAttribute('data-theme');
        indicator.style.transition = 'left 0.2s ease, width 0.2s ease, top 0.2s ease, height 0.2s ease, background-color 0.3s ease, box-shadow 0.3s ease';
        selectTheme(theme);
    });
}

function selectTheme(theme) {

    console.log('selectTheme', theme);

    if (theme !== 'confirm' && theme === selectedTheme) {
        return;
    }

    if (theme === 'confirm') {
        $('.theme-modal').fadeOut();
        settings['theme'] = selectedTheme;
        saveSettings();

        sa_event('theme_changed', {
            'theme': selectedTheme,
            'source': 'modal_confirm'
        });

        const activeTheme = resolveAutoTheme(selectedTheme);

        $(`div.settings-selected[settings-option="theme"]`).removeClass('settings-selected');
        $(`[theme-option="${selectedTheme}"]`).addClass('settings-selected');

        // Theme CSS + tiles were already applied while previewing; flush any
        // pending tile swap and ensure final theme is set (no full map rebuild).
        document.documentElement.setAttribute('data-selected-theme', selectedTheme);
        clearTimeout(_pendingThemeTimeout);
        if (typeof initMap === 'function' && (typeof map === 'undefined' || !map)) {
            initMap();
        } else {
            changeMapStyle(activeTheme);
        }
        // Only launch fireworks here for returning users — first-timers get them after campus confirm
        const isReturningUser = !!(settings && settings['campus']);
        if (isReturningUser && !settings['toggle-disable-fireworks-on-open'] && shouldAutoLaunchFireworks()) {
            launchFireworks(12);
        }
        return;
    }

    // Update slider selection
    document.querySelectorAll('.theme-option').forEach(opt => {
        opt.classList.remove('selected');
    });
    document.querySelector(`[data-theme="${theme}"]`).classList.add('selected');
    updateThemeIndicator(theme);
    
    selectedTheme = theme;

    sa_event('theme_changed', {
        'theme': theme,
        'source': 'modal_preview'
    });

    const previewTheme = resolveAutoTheme(theme);
    updateThemePreviewImage(theme);
    
    // CSS root vars (and bus marker colors via --theme-bus-icon-inner) update immediately.
    // Debounce only the tile-layer swap so rapid clicks don't thrash tile requests.
    document.documentElement.setAttribute('data-selected-theme', theme);
    document.documentElement.setAttribute('theme', previewTheme);
    clearTimeout(_pendingThemeTimeout);
    if (typeof map !== 'undefined' && map) {
        _pendingThemeTimeout = setTimeout(() => changeMapStyle(theme), 50);
    }
}

window.continueToCampusModal = function() {
    if (typeof initMap === 'function' && (typeof map === 'undefined' || !map)) {
        initMap();
    }
    $('.theme-modal').hide();
    $('#theme-bg-lights').show();
    document.body.style.overflow = 'hidden';

    const campus = (typeof selectedCampusModal !== 'undefined' && selectedCampusModal) || (settings && settings['campus']) || 'nb';
    if (typeof selectCampusModal === 'function') {
        selectCampusModal(campus);
    }
    if (typeof updateCampusModalTheme === 'function') {
        updateCampusModalTheme();
    }
    if (typeof updateCampusIndicator === 'function') {
        updateCampusIndicator(campus);
    }

    $('.campus-modal').css('display', 'flex');

    requestAnimationFrame(() => {
        if (typeof updateCampusIndicator === 'function') {
            updateCampusIndicator(campus);
        }
    });
};

// Prevent text wrapping in font options by adjusting font size
function adjustFontOptionSizes() {
    $('.settings-option[settings-option="font"]').each(function() {
        const $option = $(this);

        // Cache the original intended font size once
        if (!$option.data('original-font-size')) {
            $option.data('original-font-size', $option.css('font-size'));
        }
        const originalFontSize = $option.data('original-font-size');

        // Lock current width during measurement so the cell doesn't expand
        const lockedWidth = $option[0].clientWidth;
        if (lockedWidth <= 0) return; // Not visible yet

        // Prepare for single-line measurement
        $option.css({
            'white-space': 'nowrap',
            'overflow': 'hidden',
            'box-sizing': 'border-box',
            'width': lockedWidth + 'px',
            'font-size': originalFontSize
        });

        // Start from original size and shrink until it fits
        let fontSize = parseFloat(originalFontSize);
        while ($option[0].scrollWidth > lockedWidth && fontSize > 8) {
            fontSize -= 0.5;
            $option.css('font-size', fontSize + 'px');
        }

        // Release explicit width after measurement
        $option.css('width', '');
    });
}

// Re-adjust sizes when custom fonts finish loading in the browser
if (document.fonts) {
    document.fonts.ready.then(function() {
        adjustFontOptionSizes();
    });
    if ('onloadingdone' in document.fonts) {
        document.fonts.onloadingdone = function() {
            adjustFontOptionSizes();
        };
    }
}
