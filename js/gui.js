let longPressTimer

function populateRouteSelectors(activeRoutes) {
    $('.route-selectors > div').not('.settings-btn').remove();

    // Convert Set to Array if it's not already an array
    let routesArray = Array.from(activeRoutes);

    if (routesArray.includes('ftbl')) {
        routesArray = routesArray.filter(route => route !== 'ftbl');
        routesArray.push('ftbl');
    }

    routesArray = routesArray.map(route => route || 'undefined');
    routesArray.sort((a, b) => a === 'undefined' ? 1 : b === 'undefined' ? -1 : 0);

    routesArray.forEach(route => {
        // console.log(route)

        const $routeElm = $(`<div class="route-selector" routeName="${route}">${route.toUpperCase()}</div>`)  
        
        let color = 'darkgray'

        const knownRoutes = ['a', 'b', 'bhe', 'ee', 'f', 'h', 'lx', 'on1', 'on2', 'rexb', 'rexl', 'wknd1', 'wknd2', 'c']

        if (knownRoutes.includes(route)) {
            color = colorMappings[route]

            let isDraggingTemp = false; // Temporary flag to track dragging state

            let initialX; // Declare initialX outside to access it later

            // let initialScrollLeft; // Declare initialScrollLeft to store the initial scroll position

            $routeElm.on('touchstart mousedown', function(event) {
                event.preventDefault();

                initialX = event.pageX || event.originalEvent.touches[0].pageX; // Store initial position
                // initialScrollLeft = $('.route-selectors').scrollLeft(); // Store initial scroll position
                // isDraggingTemp = false; // Reset temporary dragging flag

                longPressTimer = setTimeout(() => {

                    // console.log('isDraggingTemp: ' , isDraggingTemp)

                    // if (!longPressTimer) { console.log('none ')}

                    // console.log('123')

                    // Check if the user is dragging
                    // if (!isDraggingTemp) {
                        // const currentScrollLeft = $('.route-selectors').scrollLeft(); // Get current scroll position
                        // console.log(currentScrollLeft)
                        // console.log(initialScrollLeft)
                        // console.log(initialX)
                        // console.log(event.pageX || event.originalEvent.touches[0].pageX)
                        // const scrolled = currentScrollLeft !== initialScrollLeft; // Check if the scroll position has changed
                        
                        // if (!scrolled) {

                            console.log('aaa')
                            isLongPress = true;
                            if (shownRoute) {
                                shownBeforeRoute = shownRoute
                            }

                            if (panelRoute !== route) {
                                selectedRoute(route);
                            }
                        // }
                    // }
                }, 500); 
            });

            $routeElm.on('touchmove', function(event) {
                
                // console.log(initialX)
                // console.log(event.changedTouches[0].clientX)
                const moved = Math.abs(initialX - event.changedTouches[0].clientX) > 10
                if (!moved) { return; }
                // console.log(moved)

                clearTimeout(longPressTimer);
                // console.log('cleared timeout')
                // isDraggingTemp = true
            })

            $routeElm.on('touchend touchcancel mouseup', function() {
                clearTimeout(longPressTimer);
                // isDraggingTemp = false
            });

            $routeElm.on('click touchend', function(event) {

                // console.log(event.changedTouches[0].clientX)
                // console.log(initialX)

                // console.log(initialX - event.changedTouches[0].clientX)
                const moved = Math.abs(initialX - (event.originalEvent.clientX || event.changedTouches[0].clientX)) > 10

                if (!isLongPress && !moved) {

                    // const currentScrollLeft = $('.route-selectors').scrollLeft();
                    // if (initialScrollLeft !== currentScrollLeft) { return; }

                    console.log('bbb')

                    if (panelRoute) {
                        selectedRoute(route)
                    } else {
                        toggleRoute(route);
                    }

                }
                isLongPress = false
            })
        }

        $routeElm.css('background-color', color) 
        $('.settings-btn').before($routeElm)
    });

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
        
        // Cancel any ongoing animation
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
                
                function animate() {
                    const now = Date.now();
                    const elapsed = now - startTime;
                    
                    // Deceleration formula
                    const deceleration = 0.95; // Adjust this value to change how quickly it slows down
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
        // isDraggingTemp = true; // Set temporary dragging flag if user moves
        
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

let shownRoute = undefined  
let shownBeforeRoute = undefined
let isLongPress = false; // Flag to track if a long press occurred

function toggleRouteSelectors(route) {
    if (shownRoute === route) {
        for (const polyline in polylines) {
            if (polyline !== route) {
                $(`.route-selector[routeName="${polyline}"]`).css('background-color', colorMappings[polyline])
            }
        }
        $(`.route-selector[routeName="${route}"]`).css('box-shadow', '')
        shownRoute = undefined  
        shownBeforeRoute = undefined
    }

    else {
        for (const polyline in polylines) {
            if (polyline !== route) {
                $(`.route-selector[routeName="${polyline}"]`).css('background-color', 'gray')
            }
        }

        $(`.route-selector[routeName="${route}"]`).css('background-color', colorMappings[route]).css('box-shadow', `0 0 10px ${colorMappings[route]}`)
        $(`.route-selector[routeName="${shownRoute}"]`).css('box-shadow', '')
        shownRoute = route

        // Add scrolling code here
        const container = $('.route-selectors');
        const element = $(`.route-selector[routeName="${route}"]`);
        const containerWidth = container.width();
        const elementWidth = element.outerWidth();
        
        // Calculate scroll position to center the element
        const scrollTo = element.position().left - (containerWidth / 2) + (elementWidth / 2) + container.scrollLeft();
        
        // Smooth scroll to the calculated position
        container.animate({
            scrollLeft: scrollTo
        }, 180);

    }
}

function toggleRoute(route) {

    // Show all polylines and buses
    if (shownRoute === route) {
        for (const polyline in polylines) {
            if (polyline !== route) {
                polylines[polyline].addTo(map)
            }
        }  
        for (const marker in busMarkers) {
            if (busMarkers[marker].options.route !== route) {
                // busMarkers[marker].addTo(map)
                busMarkers[marker].getElement().style.display = '';
            }
        }

        showAllStops();
        map.fitBounds(bounds)

    // Hide other polylines and buses
    } else {

        showAllStops();

        for (const polyline in polylines) {
            if (polyline !== route) {
                polylines[polyline].remove()
            }
        }

        for (const marker in busMarkers) {
            if (busMarkers[marker].options.route !== route) {
                // busMarkers[marker].remove()
                busMarkers[marker].getElement().style.display = 'none';
            } else {
                busMarkers[marker].getElement().style.display = ''; // if switched the one being viewed 
            }
        }

        hideStopsExcept(route)

        polylines[route].addTo(map) // show this one if it was prev hidden

        $('.bus-info-popup, .stop-info-popup').hide();

        map.fitBounds(polylines[route].getBounds(), { padding: [10, 10] });

    }

    toggleRouteSelectors(route)

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

    function showAllStops() {
        for (const stopId in busStopMarkers) {
            busStopMarkers[stopId].addTo(map);
        }
    }
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
    $('.route-active-buses').text(busesByRoutes[route].length + ' buses running')

    $('.active-buses').empty();
    busesByRoutes[route].forEach(busId => {

        let speed = ''
        if ('visualSpeed' in busData[busId]) {
            speed = parseInt(busData[busId].visualSpeed) + 'mph'
        }
        speed += ' | ' + busData[busId].capacity + '% full'

        const $busElm = $(`<div class="flex justify-between">
            <div class="route-bus-name">${busData[busId].busName}</div>
            <div class="route-bus-speed" bus-id="${busId}">${speed}</div>
        </div>`)
        $('.active-buses').append($busElm)
    })

    if (!panelRoute) {
        $('.route-close').css('display', 'flex').css('height', $('.route-selector').innerHeight())
        $('.panout, .buses-btn').fadeOut('fast');
        $('.settings-btn').hide();
        $('.leaflet-control-attribution').hide();
        $('.route-panel').slideDown('fast');

        if (isDesktop) {
            const routeSelectorsWidth = $('.route-selectors').width() / parseFloat(getComputedStyle(document.documentElement).fontSize) + 2;
            $('.route-panel').css('padding-left', routeSelectorsWidth + 'rem');
        }

    }

    panelRoute = route

}

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
                    setTimeout(() => {
                        $(`.bus-overview-ridership[route="${route}"]`).css('color', 'black').css('transition', 'color 1s');
                    }, 1000);
                }, Math.random() * 5000);
            }
        }
    });

    $('.total-ridership').text(totalRidership + ' riding')
}


function busesOverview() {

    if (!isDesktop) {
        $('.bottom, .leaflet-control-attribution').hide();
        $('.buses-close').addClass('flex');
        $('.buses-panel-wrapper').css('margin-left', 0);
    } else {
        const routeSelectorsWidth = $('.route-selectors').width() / parseFloat(getComputedStyle(document.documentElement).fontSize) + 2;
        $('.buses-panel-wrapper').css('margin-left', routeSelectorsWidth + 'rem');
    }

    $('.buses-panel-wrapper').slideDown('fast');
    
    updateBusOverview();
    updateRidershipChart();
}

let ridershipChart;

async function makeRidershipChart() {

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
                        callback: function(val, index) {
                            const time = this.getLabelForValue(val);
                            return time.includes(':00') ? time.split(':')[0] + time.split(' ')[1] : '';
                        }
                    }
                }
            },
            maintainAspectRatio: false
        }
    });

}

async function updateRidershipChart() {

    let timeRiderships

    try {
        const response = await fetch('https://transloc.up.railway.app/ridership');
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        timeRiderships = await response.json();
    } catch (error) {
        console.error('Error fetching ridership:', error);
    }

    const utcOffset = new Date().getTimezoneOffset();

    Object.keys(timeRiderships).forEach(key => {
        let nyMinutes = parseInt(key) - utcOffset;
        if (nyMinutes < 0) {
            nyMinutes += 1440;
        }
        timeRiderships[nyMinutes] = timeRiderships[key];
        delete timeRiderships[key];
    });



    Object.keys(timeRiderships).forEach(key => {

        const totalMinutes = parseInt(key);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        
        // Skip times between 4 AM and 6 PM
        if (hours >= 4 && hours < 6) {
            delete timeRiderships[key];
            return;
        }
        
        const estTime = new Date();
        // If time is between 12am-4am, set to next day
        if (hours < 4) {
            estTime.setDate(estTime.getDate() + 1);
        }
        
        estTime.setHours(hours);
        estTime.setMinutes(minutes);
        const formattedTime = estTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        // Store timestamp for sorting
        timeRiderships[formattedTime] = {
            timestamp: estTime.getTime(),
            value: timeRiderships[key]
        };
        delete timeRiderships[key];
    });


    // Sort by timestamp and convert back to simple value format
    const sortedEntries = Object.entries(timeRiderships)
        .sort(([,a], [,b]) => a.timestamp - b.timestamp);
    timeRiderships = Object.fromEntries(
        sortedEntries.map(([time, data]) => [time, data.value])
    );

    const labels = Object.keys(timeRiderships);
    const values = Object.values(timeRiderships);

    ridershipChart.data.labels = labels;
    ridershipChart.data.datasets[0].data = values;
    ridershipChart.update();
    
}


function calculateLoopTimes() {

    let loopTimes = {}

    for (const route of activeRoutes) {

        let eta = 0
        const stopList = stopLists[route]

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
                eta += 300
            }

            if (waits[thisStop]) {
                eta += waits[thisStop]
            } else {
                eta += 20
            }
        }

        loopTimes[route] = Math.round(eta/60)
    }
    return loopTimes
}


function closeRouteMenu() {
    $('.route-panel').slideUp('fast');
    $('.panout, .settings-btn, .buses-btn').show();
    $(this).hide();
    $('.route-close').hide();

    if (shownBeforeRoute && shownBeforeRoute !== panelRoute) {
        toggleRoute(shownBeforeRoute)
        shownBeforeRoute = undefined
    } else if (!shownBeforeRoute) {
        toggleRouteSelectors(panelRoute)
    }

    panelRoute = undefined
}

$('.route-close').click(function() {
    closeRouteMenu();
})

$('.settings-btn').on('touchstart click', function() { // why do i need touchstart here but not below? idk
    $('.leaflet-control-attribution').hide();
    $('.settings-panel').show();
    if (isDesktop) {
        $('.bottom').hide();
    }
    $('.settings-close').show();
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

$(document).ready(function() {

    let settings = localStorage.getItem('settings');
    if (settings) {
        settings = JSON.parse(settings);
        document.documentElement.style.setProperty('--font-family', settings['font']);
    } else {
        settings = {
            'font': 'yusei magic',
            'bus_marker_size': 'medium'
        };
        localStorage.setItem('settings', JSON.stringify(settings))
        $(`div.settings-option[font-option="yusei magic"]`).addClass('settings-selected')
    }

    $(`div.settings-option[font-option="${settings['font']}"]`).addClass('settings-selected')

    $('.settings-option').click(function() {
        if ($(this).hasClass('settings-selected')) { return; }

        const settingsOption = $(this).attr('settings-option')

        console.log(settingsOption)

        if (settingsOption === 'font') {
            $(`div.settings-selected[settings-option="${settingsOption}"]`).removeClass('settings-selected')
            $(this).addClass('settings-selected')
            settings['font'] = $(this).attr('font-option')
            document.documentElement.style.setProperty('--font-family', settings['font']);
        }

        localStorage.setItem('settings', JSON.stringify(settings))
    })

})