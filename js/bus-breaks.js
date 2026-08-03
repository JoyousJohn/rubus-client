// js/bus-breaks.js - extracted verbatim from js/map.js
function populateBusBreaks(busBreakData, busName) {
    const MAX_INITIAL_BREAKS = 7; // Maximum number of breaks shown initially

    if (!busBreakData || busBreakData.error) {
        $('.bus-breaks').empty();
        // $('.bus-breaks').append(`<div class="text-1p2rem" style="grid-column: 1 / span 3; color: #acacac;">This bus hasn't taken any breaks yet.</div>`);
        $('.past-breaks-wrapper, .bus-history').hide();
        $('.show-more-breaks, .show-all-breaks').hide();
        $('.info-overdue-break').hide();
        // Update max height since overdue break is now hidden
        updateNextStopsMaxHeight();
        return;
    }

    // Get bus route and expected stops for comparison
    const busRoute = busData[busName]?.route;
    let expectedStops = [];
    if (busRoute && stopLists[busRoute] && stopLists[busRoute].length > 0) {
        expectedStops = stopLists[busRoute];
    }
    
    // Calculate time since last long break (duration > 180 seconds)
    const lastBreakMin = (() => {
        if (busBreakData && busBreakData.length > 0) {
            // Filter for long breaks only (duration > 180 seconds)
            const longBreaks = busBreakData.filter(breakItem => breakItem.break_duration > 180);
            
            if (longBreaks.length > 0) {
                // Get the most recent long break
                const lastLongBreak = longBreaks[longBreaks.length - 1];
                if (lastLongBreak && lastLongBreak.time_departed) {
                    const lastBreakTime = new Date(lastLongBreak.time_departed.replace(/\.\d+/, ''));
                    const currentTime = new Date();
                    const diffInMs = currentTime - lastBreakTime;
                    const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
                    // console.log(`Last long break was ${diffInMinutes} minutes ago`);
                    return diffInMinutes;
                }
            } else {
                console.log('No long breaks found in data');
            }
        }
        console.log('No break data available');
        return null;
    })();

    if (lastBreakMin && lastBreakMin > 120) {
        // Only show if actually overdue (more than 2 hours)
        $('.info-overdue-break').html(`<div class="flex align-center justify-center gap-x-0p5rem"><i class="fa-solid fa-clock"></i> <span>${Math.floor(lastBreakMin / 60)} HOURS SINCE BREAK</span></div>`).slideDown(function() {
            // Update max height after slideDown animation completes
            updateNextStopsMaxHeight();
        });
    } else if (settings['toggle-always-show-break-overdue']) {
        const hours = Math.floor(lastBreakMin / 60);
        const minutes = lastBreakMin % 60;
        let timeString = '';
        if (hours > 0) {
            timeString += `${hours} hour${hours !== 1 ? 's' : ''}`;
        }
        if (minutes > 0 || hours === 0) {
            if (hours > 0) timeString += ' ';
            timeString += `${minutes} minute${minutes !== 1 ? 's' : ''}`;
        }
        $('.info-overdue-break').html(`<div class="flex align-center justify-center gap-x-0p5rem"><i class="fa-solid fa-clock"></i> <span>Last break ${timeString} ago!</span></div>`).slideDown(function() {
            // Update max height after slideDown animation completes
            updateNextStopsMaxHeight();
        });
    } else {
        $('.info-overdue-break').hide();
    }

    $('.past-breaks-wrapper').show();
    const breakDiv = $('.bus-breaks');
    breakDiv.empty(); // Clear existing breaks before adding new ones
    
    breakDiv.append(`<div class="mb-0p5rem text-1p2rem">Time</div>`);
    breakDiv.append(`<div class="mb-0p5rem text-1p2rem">Stop</div>`);
    breakDiv.append(`<div class="mb-0p5rem text-1p2rem">Duration</div>`);

    let breakCount = 0;

    let consideredStops = new Set();
    let totalAvgBreakTime = 0;
    let totalBusBreakTime = 0;
    let totalBusStopTime = 0;

    const reversedData = [...busBreakData].reverse();
    const actualStops = new Set(reversedData.map(breakItem => breakItem.stop_id));

    // Create combined list of actual stops + missed stops in chronological order
    const allStopsToShow = [];

    // Add all actual stops in chronological order (most recent first)
    for (const breakItem of reversedData) {
        allStopsToShow.push({ breakItem, isMissed: false });
    }

    // Add missed stops if we have route data
    if (expectedStops && expectedStops.length > 0 && actualStops.size > 0) {
        // Find missed stops by looking at the route sequence
        const missedStops = [];
        
        // Go through the route sequence and find gaps between consecutive actual stops
        for (let i = 0; i < expectedStops.length - 1; i++) {
            const currentStop = expectedStops[i];
            const nextStop = expectedStops[i + 1];
            
            // If both consecutive stops in the route were visited, check for missed stops between them
            if (actualStops.has(currentStop) && actualStops.has(nextStop)) {
                // Find any stops between currentStop and nextStop in the route that were missed
                for (let j = i + 1; j < expectedStops.indexOf(nextStop); j++) {
                    const potentialMissedStop = expectedStops[j];
                    if (!actualStops.has(potentialMissedStop)) {
                        missedStops.push(potentialMissedStop);
                    }
                }
            }
        }
        
        // Log if bus missed stops
        if (missedStops.length > 0) {
            console.log(`Bus ${busName} (${busData[busName]?.busName}) missed ${missedStops.length} stops:`, missedStops.map(stopId => stopsData[stopId]?.name || stopId));
        }
        
        // Add missed stops to the list (these will be hidden initially and shown when "Show All Stops" is clicked)
        for (const missedStopId of missedStops) {
            allStopsToShow.push({ stopId: missedStopId, isMissed: true });
        }
    }

    for (const stopData of allStopsToShow) {
        let extraClass = '';

        if (!stopData.isMissed) {
            const breakItem = stopData.breakItem;
            if (breakItem.break_duration > 180) {
                extraClass = 'long-break';
                breakCount++;
            } else {
                extraClass += 'none';
            }

            if (breakCount >= MAX_INITIAL_BREAKS) {
                extraClass += ' none';
            }

            const timeArrived = new Date(breakItem.time_arrived.replace(/\.\d+/, ''));
            const formattedTime = timeArrived.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            });

            breakDiv.append(`<div class="${extraClass}" style="color:#656565;">${formattedTime}</div>`);
            breakDiv.append(`<div class="${extraClass}" style="color: var(--theme-extra);">${stopsData[breakItem.stop_id].shortName || stopsData[breakItem.stop_id].name}</div>`);

            let durationDiffPercent = Math.round(((breakItem.break_duration - waits[breakItem.stop_id])/breakItem.break_duration * 100));

            let percentDiffCol = ''
            if (durationDiffPercent > 0) { // slower than average
                percentDiffCol = '#f84949';
                durationDiffPercent = '+' + durationDiffPercent;
            } else if (durationDiffPercent < 0) { // faster than average
                percentDiffCol = 'var(--theme-short-stops-color)';
            }

            breakDiv.append(`<div class="${extraClass}"><div class="flex gap-x-0p5rem justify-between">
                <div class="bold-500">${Math.floor(breakItem.break_duration/60) ? Math.floor(breakItem.break_duration/60) + 'm ' : ''}${Math.round(breakItem.break_duration % 60) ? Math.round(breakItem.break_duration % 60) + 's' : ''}</div>
                <div class="stop-dur-percent none text-1p2rem" style="color: ${percentDiffCol};">${durationDiffPercent}%</div>
            </div></div>`);

            if (!consideredStops.has(breakItem.stop_id)) {
                totalAvgBreakTime += waits[breakItem.stop_id];
                totalBusBreakTime += breakItem.break_duration;
                consideredStops.add(breakItem.stop_id);
            }

            if (breakItem.break_duration > 180) {
                totalBusStopTime += breakItem.break_duration;
            }
        } else {
            // Handle missed stops - these should always be hidden initially
            const stopId = stopData.stopId;
            const stopName = stopsData[stopId].shortName || stopsData[stopId].name;

            // Missed stops are always hidden initially (shown only when "Show All Stops" is clicked)
            const missedStopExtraClass = ' none';

            breakDiv.append(`<div class="${missedStopExtraClass}" style="color:#656565;">--:--</div>`);
            breakDiv.append(`<div class="${missedStopExtraClass}" style="color: var(--theme-extra); text-decoration: line-through;">${stopName}</div>`);
            breakDiv.append(`<div class="${missedStopExtraClass}"><div class="bold-500" style="color: #f84949;">Missed</div></div>`);
        }
    }


    const percentDiff = ((totalBusBreakTime - totalAvgBreakTime) / totalAvgBreakTime * 100).toFixed(1);

    const timeDiff = Math.round((new Date(busBreakData[busBreakData.length - 1].time_departed.replace(/\.\d+/, '')) - new Date(busBreakData[0].time_arrived.replace(/\.\d+/, ''))) / 1000);
    const breakMinPerHour = (totalBusStopTime / timeDiff * 60).toFixed(1);
    // $('.bus-avg-break-time-per-hour').html(`${breakMinPerHour} min/hr`);

    $('.bus-avg-break-time').html(`Stops <span style="color: ${percentDiff > 0 ? '#f84949' : 'var(--theme-short-stops-color)'};">${Math.abs(percentDiff)}%</span> ${percentDiff > 0 ? 'longer' : 'shorter'} than avg, breaks for <span style="color: var(--theme-breaks-min-color);">${Math.ceil(breakMinPerHour)} min/hr</span>`);

    // Temp disable quickness
    // if ((totalBusBreakTime - totalAvgBreakTime) / totalAvgBreakTime > 0.3) {
    //     $('.info-quickness-mid').html(" | <span class='text-1p2rem' style='color: #fa3c3c;'>Lengthy stops</span>").show();
    // } else if ((totalBusBreakTime - totalAvgBreakTime) / totalAvgBreakTime < -0.2) {
    //     $('.info-quickness-mid').html(" | <span class='text-1p2rem' style='color: var(--theme-short-stops-color);'>Short stops</span>").show();
    // }

    if (settings['toggle-show-bus-quickness-breakdown']) {
        $('.bus-quickness-breakdown-wrapper').html(`<div class="flex flex-col text-1p3rem mt-0p5rem">
            <div>Total bus stop time/loop: ${Math.round(totalBusBreakTime)}s</div>
            <div>Network avg stop time/loop: ${Math.round(totalAvgBreakTime)}s</div>
            <div>Percent difference: ${percentDiff}%</div>
        </div>`).show();
    } else {
        $('.bus-quickness-breakdown-wrapper').hide();
    }

    // Show "Show All Breaks" button only if there are more long breaks than the limit
    const totalLongBreaks = busBreakData.filter(breakItem => breakItem.break_duration > 180).length;
    if (totalLongBreaks > MAX_INITIAL_BREAKS) {
        $('.show-more-breaks').show();
    } else {
        $('.show-more-breaks').hide();
    }
    
    // Show "Show All Stops" button if there are more stops than just the long breaks shown
    if (breakCount !== busBreakData.length) {
        $('.show-all-breaks').show();
    } else {
        $('.show-all-breaks').hide();
    }

    if (breakCount === 0) {
        $('.bus-breaks').children().slice(0, 3).remove();
        // $('.bus-breaks').append(`<div class="no-breaks text-1p2rem" style="grid-column: 1 / span 3; color: #acacac;">This bus hasn't taken any breaks yet.</div>`);
        $('.show-more-breaks').hide();
        $('.show-all-breaks').click(function() { $('.no-breaks').remove(); });
        $('.show-all-breaks').text("Show Stops");
        $('.bus-avg-break-time').html(`Stops <span style="color: ${percentDiff > 0 ? '#f84949' : 'var(--theme-short-stops-color)'};">${Math.abs(percentDiff)}%</span> ${percentDiff > 0 ? 'longer' : 'shorter'} than avg`);
    } else {
        $('.show-all-breaks').text("Show All Stops (Slow)");
    }
}


let busBreaksCache = {};

function checkAllBusesForMissedStops() {
    console.log('Checking all active buses for missed stops...');
    
    if (!busesByRoutes || !busesByRoutes[selectedCampus]) {
        console.log('No buses data available for campus:', selectedCampus);
        return;
    }
    
    let busesWithMissedStops = 0;
    let totalBuses = 0;
    
    // Loop through all routes
    for (const route in busesByRoutes[selectedCampus]) {
        const routeBuses = busesByRoutes[selectedCampus][route];
        
        for (const busName of routeBuses) {
            totalBuses++;
            
            // Get the bus's route and expected stops
            const busRoute = busData[busName]?.route;
            if (!busRoute || !stopLists[busRoute] || stopLists[busRoute].length === 0) {
                continue;
            }
            
            const expectedStops = stopLists[busRoute];
            
            // Get actual stops from bus break data
            if (busBreaksCache[busName] && busBreaksCache[busName].data && !busBreaksCache[busName].data.error) {
                const busBreakData = busBreaksCache[busName].data;
                const actualStops = new Set(busBreakData.map(breakItem => breakItem.stop_id));
                
                // Find missed stops using the same logic as populateBusBreaks
                const missedStops = [];
                
                for (let i = 0; i < expectedStops.length - 1; i++) {
                    const currentStop = expectedStops[i];
                    const nextStop = expectedStops[i + 1];
                    
                    if (actualStops.has(currentStop) && actualStops.has(nextStop)) {
                        for (let j = i + 1; j < expectedStops.indexOf(nextStop); j++) {
                            const potentialMissedStop = expectedStops[j];
                            if (!actualStops.has(potentialMissedStop)) {
                                missedStops.push(potentialMissedStop);
                            }
                        }
                    }
                }
                
                if (missedStops.length > 0) {
                    busesWithMissedStops++;
                    console.log(`🚌 Bus ${busName} (${busData[busName]?.busName}) on route ${route.toUpperCase()} missed ${missedStops.length} stops:`, 
                        missedStops.map(stopId => stopsData[stopId]?.name || stopId));
                }
            }
        }
    }
    
    console.log(`📊 Summary: ${busesWithMissedStops} out of ${totalBuses} buses have missed stops`);
}

function generateSimBusBreaks(busName) {
    const route = busData[busName]?.route;
    if (!route) return null;

    const routeStops = stopLists[route] || [];
    if (routeStops.length === 0) return [];

    const joinedTime = busData[busName]?.joined_service
        ? new Date(busData[busName].joined_service).getTime()
        : Date.now() - 6 * 60 * 60 * 1000;

    const elapsedMs = Date.now() - joinedTime;
    const campusKey = routesByCampus[route] || selectedCampus || 'nb';

    const avgTimePerStop = 4 * 60 * 1000;
    const totalPossibleStops = Math.max(1, Math.floor(elapsedMs / avgTimePerStop));
    const stopsPerLoop = routeStops.length;
    const totalLoops = Math.ceil(totalPossibleStops / stopsPerLoop);
    const loopsToShow = Math.min(totalLoops, Math.floor(Math.random() * 2) + 1);
    const stopsToShow = Math.min(totalPossibleStops, loopsToShow * stopsPerLoop);

    const breaks = [];
    let cursorTime = Date.now();
    let stopIdx = routeStops.length - 1;

    for (let i = 0; i < stopsToShow; i++) {
        const stopId = routeStops[stopIdx];
        const prevStopId = routeStops[(stopIdx - 1 + routeStops.length) % routeStops.length];

        let travelSecs = 180;
        try {
            const seg = percentageDistances?.[campusKey]?.[String(stopId)]?.from?.[String(prevStopId)];
            if (seg?.properties?.totalMiles) {
                travelSecs = Math.round(seg.properties.totalMiles / 20 * 3600);
            }
        } catch (e) {}
        travelSecs = Math.max(30, Math.min(600, travelSecs + (Math.random() * 60 - 30)));

        const avgWait = waits?.[stopId];
        const dwellSecs = avgWait
            ? Math.max(10, Math.round(avgWait * (0.5 + Math.random() * 1.5)))
            : Math.floor(Math.random() < 0.6 ? Math.random() * 140 + 15 : Math.random() * 420 + 180);

        const timeArrived = new Date(cursorTime - (travelSecs + dwellSecs) * 1000);
        const timeDeparted = new Date(cursorTime - travelSecs * 1000);

        breaks.unshift({
            stop_id: stopId,
            time_arrived: timeArrived.toISOString().replace('Z', ''),
            time_departed: timeDeparted.toISOString().replace('Z', ''),
            break_duration: dwellSecs
        });

        cursorTime = timeArrived.getTime();
        stopIdx = (stopIdx - 1 + routeStops.length) % routeStops.length;
    }

    return breaks;
}

function getBusBreaks(busName) {
    const currentTime = new Date().getTime();
    const THREE_MINUTES = 3 * 60 * 1000;

    if (busBreaksCache[busName] &&
        (currentTime - busBreaksCache[busName].timestamp) < THREE_MINUTES) {
        populateBusBreaks(busBreaksCache[busName].data, busName);
        return;
    }

    if (busData[busName]?.type === 'sim') {
        const fakeBreaks = generateSimBusBreaks(busName);
        busBreaksCache[busName] = {
            data: fakeBreaks,
            timestamp: currentTime
        };
        populateBusBreaks(fakeBreaks, busName);
        return;
    }

    fetch(`https://demo.rubus.live/get_breaks?bus_id=${busName}`)
        .then(response => response.json())
        .then(data => {
            busBreaksCache[busName] = {
                data: data,
                timestamp: currentTime
            };
            populateBusBreaks(data, busName);
            updateRubusResponseTime();
        })
        .catch(error => {
            console.error('Error fetching bus breaks:', error);
            markRubusRequestsFailing();
        });
}
