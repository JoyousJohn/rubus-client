// js/bus-breaks.js - extracted verbatim from js/map.js

// Build chronological (oldest-first) display list with missed stops interleaved
// in route order. Each break record may carry its own `route` (added by
// rubus-server); when the route changes between records we emit an
// isRouteChange separator row and reset the cursor to the new route's stop
// list — no missed stops are inferred across the boundary (different routes
// have different stop lists, so comparing across them only produces false
// misses). Records without a route (older data / sim) inherit the previous
// segment's route, falling back to the bus's current route.
function buildChronBreakList(busName, breakDataChron) {
    const chronList = [];
    const missedStops = [];
    if (!breakDataChron || breakDataChron.length === 0) {
        return { chronList, missedStops };
    }
    const currentRoute = (busData && busData[busName] && busData[busName].route) ? busData[busName].route : null;

    let activeRoute = null;
    let expectedStops = [];
    let routeLen = 0;
    let cursorIdx = -1;

    const initSegment = (route, firstStopId) => {
        activeRoute = route;
        expectedStops = (route && stopLists[route]) ? stopLists[route] : [];
        routeLen = expectedStops.length;
        cursorIdx = routeLen ? expectedStops.indexOf(firstStopId) : -1;
    };

    for (let k = 0; k < breakDataChron.length; k++) {
        const currItem = breakDataChron[k];
        const prevItem = k > 0 ? breakDataChron[k - 1] : null;
        const currId = currItem.stop_id;
        const currRoute = currItem.route || activeRoute || currentRoute;

        // Route change: separator row, then start the new segment fresh.
        if (activeRoute !== null && currRoute && currRoute !== activeRoute) {
            chronList.push({
                isRouteChange: true,
                oldRoute: activeRoute,
                newRoute: currRoute
            });
            initSegment(currRoute, currId);
            chronList.push({ breakItem: currItem, isMissed: false });
            continue;
        }

        // First record ever: initialize the first segment.
        if (activeRoute === null) {
            initSegment(currRoute, currId);
            chronList.push({ breakItem: currItem, isMissed: false });
            continue;
        }

        // Same route as previous: drive the cursor through its stop list.
        const prevId = prevItem.stop_id;

        // Duplicate consecutive record for the same visit: no travel, no miss.
        if (currId === prevId) {
            chronList.push({ breakItem: currItem, isMissed: false });
            continue;
        }
        // Lost sync (unknown/detour stop): show actual, try to resync on curr.
        if (cursorIdx === -1) {
            chronList.push({ breakItem: currItem, isMissed: false });
            cursorIdx = routeLen ? expectedStops.indexOf(currId) : -1;
            continue;
        }
        if (expectedStops.indexOf(currId) === -1) {
            chronList.push({ breakItem: currItem, isMissed: false });
            cursorIdx = -1;
            continue;
        }
        // Minimal forward walk from cursor to curr (handles wrap + duplicates).
        let foundOffset = -1;
        for (let offset = 1; offset <= routeLen; offset++) {
            if (expectedStops[(cursorIdx + offset) % routeLen] === currId) {
                foundOffset = offset;
                break;
            }
        }
        if (foundOffset === -1) {
            chronList.push({ breakItem: currItem, isMissed: false });
            cursorIdx = expectedStops.indexOf(currId);
            continue;
        }
        for (let o = 1; o < foundOffset; o++) {
            const missedId = expectedStops[(cursorIdx + o) % routeLen];
            chronList.push({ stopId: missedId, isMissed: true });
            missedStops.push(missedId);
        }
        chronList.push({ breakItem: currItem, isMissed: false });
        cursorIdx = (cursorIdx + foundOffset) % routeLen;
    }
    return { chronList, missedStops };
}

// Gate: past breaks stay hidden behind the "Tap to show past breaks" prompt
// until the user reveals them. Tracks which bus the gate was opened for so a
// stale async fetch for a previous bus can't pop the wrapper open.
let breaksRevealedForBus = null;

function isBreaksRevealed(busName) {
    return breaksRevealedForBus !== null && breaksRevealedForBus === busName;
}

// Buses that missed >25% of their recent stops get a warning prefix on the
// prompt, and tapping expands all stops immediately instead of just recent
// breaks.
let frequentSkipperBuses = {};

function updateBreaksPrompt(busName, isFrequentSkipper) {
    if (isBreaksRevealed(busName)) return; // prompt already gone
    const cur = (typeof popupBusName !== 'undefined' && popupBusName) ? popupBusName : null;
    if (cur && cur !== busName) return; // stale fetch for a previous bus
    const $prompt = $('.show-breaks-prompt');
    if (isFrequentSkipper) {
        $prompt.html('<span style="color: #f84949">This bus frequently skips stops:</span> Show past breaks &amp; stops');
    } else {
        $prompt.text('Show past breaks & stops');
    }
}

// Reset to gated state on bus open/switch: prompt visible, wrapper hidden.
// Kicks off a background fetch (wrapper stays hidden) so the prompt can warn
// about frequent skippers before the user taps.
function resetBreaksGate(busName) {
    breaksRevealedForBus = null;
    if (busName) delete frequentSkipperBuses[busName];
    $('.bus-breaks').empty();
    $('.show-more-breaks, .show-all-breaks').hide();
    if (settings['toggle-always-show-breaks']) {
        // Bypass the tap gate: reveal immediately, prompt text never shown.
        breaksRevealedForBus = busName;
        $('.show-breaks-prompt').hide();
        $('.past-breaks-wrapper').removeClass('none').show().css('display', 'flex');
    } else {
        $('.past-breaks-wrapper').hide();
        $('.show-breaks-prompt').text('Show past breaks & stops').css('pointer-events', '').show();
    }
    if (busName) getBusBreaks(busName);
}

// Cache-fresh check mirroring getBusBreaks(): sim buses generate synchronously.
function isBreaksCacheFresh(busName) {
    if (!busName) return false;
    if (busData[busName]?.type === 'sim') return true;
    const entry = busBreaksCache[busName];
    const THREE_MINUTES = 3 * 60 * 1000;
    return !!(entry && entry.data && !entry.data.error && (Date.now() - entry.timestamp) < THREE_MINUTES);
}

// Prompt click (underneath next-stops-grid): "Loading..." only for a real
// network fetch; cache hits populate synchronously so the text goes straight
// away. Slides the wrapper down meanwhile (all stops immediately for
// frequent skippers).
function revealBreaksClicked() {
    const currentBus = (typeof popupBusName !== 'undefined' && popupBusName) ? popupBusName : (typeof sourceBusName !== 'undefined' ? sourceBusName : null);
    if (!currentBus || breaksRevealedForBus === currentBus) return;
    breaksRevealedForBus = currentBus;
    // Paint "Loading..." first: the slideDown + fetch/populate work below can
    // block the main thread for ~a second, and anything queued in the same
    // task would never get painted. rAF + setTimeout yields past the paint.
    $('.show-breaks-prompt').text('Loading...').css('pointer-events', 'none').show();
    requestAnimationFrame(() => setTimeout(() => {
        if (breaksRevealedForBus !== currentBus) return; // bus switched meanwhile
        $('.past-breaks-wrapper').removeClass('none').hide().slideDown('fast', function() {
            $(this).css('display', 'flex');
            updateNextStopsMaxHeight();
        });
        if (frequentSkipperBuses[currentBus]) {
            getBusBreaks(currentBus, false, 'all_stops');
        } else {
            getBusBreaks(currentBus);
        }
    }, 0));
}

function populateBusBreaks(busBreakData, busName) {
    const MAX_INITIAL_BREAKS = 7; // Maximum number of breaks shown initially

    if (!busBreakData || busBreakData.error || (Array.isArray(busBreakData) && busBreakData.length === 0)) {
        $('.bus-breaks').empty();
        if (busName) delete frequentSkipperBuses[busName];
        // $('.bus-breaks').append(`<div class="text-1p2rem" style="grid-column: 1 / span 3; color: #acacac;">This bus hasn't taken any breaks yet.</div>`);
        $('.past-breaks-wrapper, .bus-history, .show-breaks-prompt').hide();
        $('.show-more-breaks, .show-all-breaks').hide();
        $('.info-overdue-break').hide();
        // Update max height since overdue break is now hidden
        updateNextStopsMaxHeight();
        return;
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
        $('.info-overdue-break').html(`<div class="flex align-center justify-center gap-x-0p5rem"><i class="fa-solid fa-clock"></i> <span>${Math.floor(lastBreakMin / 60)}h since break</span></div>`).show();
        updateNextStopsMaxHeight();
    } else if (settings['toggle-always-show-break-overdue'] && lastBreakMin !== null) {
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
        $('.info-overdue-break').html(`<div class="flex align-center justify-center gap-x-0p5rem"><i class="fa-solid fa-clock"></i> <span>Last break ${timeString} ago!</span></div>`).show();
        updateNextStopsMaxHeight();
    } else {
        $('.info-overdue-break').hide();
    }

    // Content is populated on demand; only show the wrapper if the user
    // already pressed the prompt for this bus (stale fetches stay hidden).
    if (isBreaksRevealed(busName)) {
        $('.past-breaks-wrapper').removeClass('none').show().css('display', 'flex');
    } else {
        $('.past-breaks-wrapper').hide();
    }
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

    // busBreakData is oldest-first; detect gaps per consecutive pair within
    // each route segment (splitting segments where the bus changed routes),
    // then display most-recent-first.
    const { chronList, missedStops } = buildChronBreakList(busName, busBreakData);
    const allStopsToShow = [...chronList].reverse();

    if (missedStops.length > 0) {
        console.log(`Bus ${busName} (${busData[busName]?.busName}) missed ${missedStops.length} stops:`, missedStops.map(stopId => stopsData[stopId]?.name || stopId));
    }
    // Frequent-skipper detection uses the most recent N stops (a stop count,
    // not a time window — routes have different times between stops). Only
    // stops from the bus's most recent route segment count toward the sample,
    // so a mid-history route change never lets the prior route's (missing)
    // stops pollute the ratio.
    const FREQUENT_SKIPPER_SAMPLE_STOPS = 30;
    const lastRouteIdx = chronList.map(s => s.isRouteChange ? 1 : 0).lastIndexOf(1);
    const currentSegment = lastRouteIdx === -1 ? chronList : chronList.slice(lastRouteIdx + 1);
    const recentStops = currentSegment.filter(s => !s.isRouteChange).slice(-FREQUENT_SKIPPER_SAMPLE_STOPS);
    const recentMissed = recentStops.filter(s => s.isMissed).length;
    const missedRatio = recentStops.length > 0 ? recentMissed / recentStops.length : 0;
    const isFrequentSkipper = missedRatio > 0.25;
    frequentSkipperBuses[busName] = isFrequentSkipper;
    updateBreaksPrompt(busName, isFrequentSkipper);

    for (const stopData of allStopsToShow) {
        let extraClass = '';

        if (stopData.isRouteChange) {
            // Separator: bus changed routes mid-history. Spans the full grid
            // and stays visible (not hidden like short/missed stops).
            const newCol = (typeof colorMappings !== 'undefined' && stopData.newRoute && colorMappings[stopData.newRoute]) ? colorMappings[stopData.newRoute] : 'var(--theme-color)';
            const sepCol = (typeof colorMappings !== 'undefined' && stopData.oldRoute && colorMappings[stopData.oldRoute]) ? colorMappings[stopData.oldRoute] : newCol;
            breakDiv.append($(`<div class="route-change-sep" style="grid-column: 1 / -1; border-top: 1px solid var(--theme-line-bg); margin: 0.75rem 0; padding-top: 0.75rem; display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;"></div>`)
                .append($('<span class="text-1p2rem" style="color: var(--theme-extra);"></span>').text('Switched to'))
                .append($(`<span class="text-1p3rem bold-600" style="color: ${sepCol};">${String(stopData.oldRoute).toUpperCase()}</span>`))
                .append($('<span class="text-1p2rem" style="color: var(--theme-color-lighter);">→</span>'))
                .append($(`<span class="text-1p3rem bold-600" style="color: ${newCol};">${String(stopData.newRoute).toUpperCase()}</span>`)));
            continue;
        }

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

            const escBB = (typeof escapeHtml === 'function' ? escapeHtml : (s)=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'));
            breakDiv.append($('<div></div>').addClass(extraClass).css('color','#656565').text(formattedTime));
            const _stopLabel = stopsData[breakItem.stop_id].shortName || stopsData[breakItem.stop_id].name;
            breakDiv.append($('<div></div>').addClass(extraClass).css('color','var(--theme-extra)').text(_stopLabel));

            // No baseline yet for this stop (waits rebuild live after a server
            // restart): omit the percent instead of rendering NaN%.
            const baselineWait = waits[breakItem.stop_id];
            const hasBaseline = Number.isFinite(baselineWait);
            let durationDiffInner = '';
            if (hasBaseline) {
                let durationDiffPercent = Math.round(((breakItem.break_duration - baselineWait)/breakItem.break_duration * 100));
                let percentDiffCol = '';
                if (durationDiffPercent > 0) { // slower than average
                    percentDiffCol = '#f84949';
                    durationDiffPercent = '+' + durationDiffPercent;
                } else if (durationDiffPercent < 0) { // faster than average
                    percentDiffCol = 'var(--theme-short-stops-color)';
                }
                durationDiffInner = `<div class="stop-dur-percent none text-1p2rem" style="color: ${percentDiffCol};">${durationDiffPercent}%</div>`;
            }

            breakDiv.append(`<div class="${extraClass}"><div class="flex gap-x-0p5rem justify-between">
                <div class="bold-500">${Math.floor(breakItem.break_duration/60) ? Math.floor(breakItem.break_duration/60) + 'm ' : ''}${Math.round(breakItem.break_duration % 60) ? Math.round(breakItem.break_duration % 60) + 's' : ''}</div>
                ${durationDiffInner}
            </div></div>`);

            if (!consideredStops.has(breakItem.stop_id)) {
                if (hasBaseline) {
                    totalAvgBreakTime += baselineWait;
                    totalBusBreakTime += breakItem.break_duration;
                }
                consideredStops.add(breakItem.stop_id);
            }

            if (breakItem.break_duration > 180) {
                totalBusStopTime += breakItem.break_duration;
            }
        } else {
            // Handle missed stops - these should always be hidden initially
            const stopId = stopData.stopId;
            const stopName = stopsData[stopId]?.shortName || stopsData[stopId]?.name || ('Stop ' + stopId);

            // Missed stops are always hidden initially (shown only when "Show All Stops" is clicked)
            const missedStopExtraClass = ' none';

            breakDiv.append($('<div></div>').addClass(missedStopExtraClass.trim()).css('color','#656565').text('--:--'));
            breakDiv.append($('<div></div>').addClass(missedStopExtraClass.trim()).css('color','var(--theme-extra)').css('text-decoration','line-through').text(stopName));
            breakDiv.append($('<div></div>').addClass(missedStopExtraClass.trim()).append($('<div class="bold-500" style="color: #f84949;"></div>').text('Missed')));
        }
    }


    // totalAvgBreakTime stays 0 when no stop in this history has a network
    // baseline yet (waits rebuild live after a server restart): skip the %
    // comparison instead of rendering NaN%.
    const hasBaselineAvg = totalAvgBreakTime > 0;
    const percentDiff = hasBaselineAvg ? Math.round((totalBusBreakTime - totalAvgBreakTime) / totalAvgBreakTime * 100) : null;

    const timeDiff = Math.round((new Date(busBreakData[busBreakData.length - 1].time_departed.replace(/\.\d+/, '')) - new Date(busBreakData[0].time_arrived.replace(/\.\d+/, ''))) / 1000);
    const breakMinPerHour = (totalBusStopTime / timeDiff * 60).toFixed(1);
    // $('.bus-avg-break-time-per-hour').html(`${breakMinPerHour} min/hr`);

    if (hasBaselineAvg) {
        $('.bus-avg-break-time').html(`Stops <span style="color: ${percentDiff > 0 ? '#f84949' : 'var(--theme-short-stops-color)'};">${Math.abs(percentDiff)}%</span> ${percentDiff > 0 ? 'longer' : 'shorter'} than avg, breaks for <span style="color: var(--theme-breaks-min-color);">${Math.ceil(breakMinPerHour)} min/hr</span>`);
    } else {
        $('.bus-avg-break-time').html(`No network average yet, breaks for <span style="color: var(--theme-breaks-min-color);">${Math.ceil(breakMinPerHour)} min/hr</span>`);
    }

    // Temp disable quickness
    // if ((totalBusBreakTime - totalAvgBreakTime) / totalAvgBreakTime > 0.3) {
    //     $('.info-quickness-mid').html(" | <span class='text-1p2rem' style='color: #fa3c3c;'>Lengthy stops</span>").show();
    // } else if ((totalBusBreakTime - totalAvgBreakTime) / totalAvgBreakTime < -0.2) {
    //     $('.info-quickness-mid').html(" | <span class='text-1p2rem' style='color: var(--theme-short-stops-color);'>Short stops</span>").show();
    // }

    if (settings['toggle-show-bus-quickness-breakdown']) {
        $('.bus-quickness-breakdown-wrapper').html(`<div class="flex flex-col text-1p3rem mt-0p5rem">
            <div>Total bus stop time/loop: ${Math.round(totalBusBreakTime)}s</div>
            <div>Network avg stop time/loop: ${hasBaselineAvg ? Math.round(totalAvgBreakTime) + 's' : 'no data yet'}</div>
            <div>Percent difference: ${hasBaselineAvg ? percentDiff + '%' : '—'}</div>
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
    
    // Show "Show All Stops" button if anything is hidden: short stops,
    // long breaks beyond the initial limit, or missed stops.
    const hiddenShortStops = busBreakData.filter(breakItem => breakItem.break_duration <= 180).length;
    const hiddenLongBeyondLimit = Math.max(0, busBreakData.filter(breakItem => breakItem.break_duration > 180).length - MAX_INITIAL_BREAKS);
    if (hiddenShortStops > 0 || hiddenLongBeyondLimit > 0 || missedStops.length > 0) {
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
        if (hasBaselineAvg) {
            $('.bus-avg-break-time').html(`Stops <span style="color: ${percentDiff > 0 ? '#f84949' : 'var(--theme-short-stops-color)'};">${Math.abs(percentDiff)}%</span> ${percentDiff > 0 ? 'longer' : 'shorter'} than avg`);
        } else {
            $('.bus-avg-break-time').html(`No network average yet`);
        }
    } else {
        $('.show-all-breaks').text("Show All Stops (Slow)");
    }

    // Frequent skippers skip the recent-only view: show all stops immediately.
    if (frequentSkipperBuses[busName] && isBreaksRevealed(busName)) {
        applyBreaksDisplayMode('all_stops');
    }

    // Fetch landed: remove the prompt text (it read "Loading..." since the tap).
    // Background prefetches leave the prompt alone so it stays tappable.
    if (isBreaksRevealed(busName)) {
        $('.show-breaks-prompt').hide();
    }

    updateNextStopsMaxHeight();
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
            
            // Get actual stops from bus break data
            if (busBreaksCache[busName] && busBreaksCache[busName].data && !busBreaksCache[busName].data.error) {
                const busBreakData = busBreaksCache[busName].data;
                // Same per-gap logic as populateBusBreaks (handles loops,
                // duplicates, and route-change segments).
                const { missedStops } = buildChronBreakList(busName, busBreakData);
                
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
            break_duration: dwellSecs,
            route: route
        });

        cursorTime = timeArrived.getTime();
        stopIdx = (stopIdx - 1 + routeStops.length) % routeStops.length;
    }

    return breaks;
}

function applyBreaksDisplayMode(showMode) {
    if (showMode === 'all_stops' || showMode === true) {
        $('.no-breaks').remove();
        $('.bus-breaks div').show();
        $('.show-all-breaks, .show-more-breaks').hide();
    } else if (showMode === 'all_breaks') {
        $('.bus-breaks div.long-break').show();
        $('.show-more-breaks').hide();
    }
}

function showAllBreaksClicked() {
    $('.bus-breaks div.long-break').slideDown();
    $('.show-more-breaks').hide();
    const currentBus = (typeof popupBusName !== 'undefined' && popupBusName) ? popupBusName : (typeof sourceBusName !== 'undefined' ? sourceBusName : null);
    if (currentBus) {
        getBusBreaks(currentBus, true, 'all_breaks');
    }
}

function showAllStopsClicked() {
    $('.no-breaks').remove();
    $('.bus-breaks div').slideDown();
    $('.show-all-breaks, .show-more-breaks').hide();
    const currentBus = (typeof popupBusName !== 'undefined' && popupBusName) ? popupBusName : (typeof sourceBusName !== 'undefined' ? sourceBusName : null);
    if (currentBus) {
        getBusBreaks(currentBus, true, 'all_stops');
    }
}

function getBusBreaks(busName, forceRefresh = false, showMode = null) {
    const currentTime = new Date().getTime();
    const THREE_MINUTES = 3 * 60 * 1000;

    if (!forceRefresh && busBreaksCache[busName] &&
        (currentTime - busBreaksCache[busName].timestamp) < THREE_MINUTES) {
        populateBusBreaks(busBreaksCache[busName].data, busName);
        applyBreaksDisplayMode(showMode);
        return;
    }

    if (busData[busName]?.type === 'sim') {
        const fakeBreaks = generateSimBusBreaks(busName);
        busBreaksCache[busName] = {
            data: fakeBreaks,
            timestamp: currentTime
        };
        populateBusBreaks(fakeBreaks, busName);
        applyBreaksDisplayMode(showMode);
        return;
    }

    const cacheBuster = forceRefresh ? `&_t=${currentTime}` : '';
    fetch(`https://demo.rubus.live/get_breaks?bus_id=${busName}${cacheBuster}`)
        .then(response => response.json())
        .then(data => {
            busBreaksCache[busName] = {
                data: data,
                timestamp: currentTime
            };
            populateBusBreaks(data, busName);
            applyBreaksDisplayMode(showMode);
            updateRubusResponseTime();
        })
        .catch(error => {
            console.error('Error fetching bus breaks:', error);
            markRubusRequestsFailing();
        });
}
