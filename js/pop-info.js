// js/pop-info.js - extracted verbatim from js/map.js
let stoppedForInterval;
let stoppedForHideTimeout;
let stoppedOctagonHideTimeout;

// Build the ordered list of campuses the bus's route services, starting from
// the bus's current/next stop so the sequence reflects where it's going next.
// Consecutive stops on the same campus collapse into one entry (e.g. an LX at
// the College Ave Student Center -> "CA -> Livi"). Since routes are loops, a
// trailing campus that matches the first is dropped (the bus wraps back to it).
// Returns { campuses, approachingNewCampus } where approachingNewCampus is true
// when the bus is moving between stops into a different campus than the one it
// just left.
function getBusServicedCampuses(busName) {
    const data = busData[busName];
    if (!data || !data.route) return { campuses: [], approachingNewCampus: false };
    const routeStops = stopLists[data.route];
    if (!routeStops || routeStops.length === 0 || typeof stopsData === 'undefined') return { campuses: [], approachingNewCampus: false };

    let startStopId = data.next_stop;
    if (data.at_stop && data.stopId != null) {
        let current = data.stopId;
        if (Array.isArray(current)) {
            current = routeStops.indexOf(current[1]) !== -1 ? current[1] : current[0];
        }
        startStopId = current;
    }
    if (startStopId == null) return { campuses: [], approachingNewCampus: false };

    let startIndex = routeStops.indexOf(startStopId);
    if (startIndex === -1) startIndex = routeStops.indexOf(Number(startStopId));
    if (startIndex === -1) startIndex = 0;

    // Local copy so 'Douglas' is shortened to 'Doug' here only; the shared
    // campusShortNamesMappings used elsewhere keeps 'Douglas'.
    const campusNames = { ...campusShortNamesMappings, 'douglas': 'Doug' };

    let approachingNewCampus = false;
    if (!data.at_stop && data.prevStopId != null) {
        const prevStop = stopsData[data.prevStopId];
        const nextStop = stopsData[data.next_stop];
        if (prevStop && nextStop && campusNames[prevStop.campus] && campusNames[nextStop.campus]) {
            approachingNewCampus = campusNames[prevStop.campus] !== campusNames[nextStop.campus];
        }
    }

    const campuses = [];
    let lastCampus = null;
    for (let i = 0; i < routeStops.length; i++) {
        const stop = stopsData[routeStops[(startIndex + i) % routeStops.length]];
        if (!stop) continue;
        const short = campusNames[stop.campus];
        if (!short) continue;
        if (short !== lastCampus) {
            campuses.push(short);
            lastCampus = short;
        }
    }

    if (campuses.length > 1 && campuses[campuses.length - 1] === campuses[0]) {
        campuses.pop();
    }
    return { campuses, approachingNewCampus };
}

const busNameInkCache = new Map();

// Vertically nudge the bus number so its rendered ink (not its em/line box) is
// pixel-centered against the route. The ink is measured by pixel-scanning the
// rendered glyphs on an offscreen canvas, since the browser doesn't expose ink
// bounds through the DOM. Digits share metrics, so the correction is cached
// per (text, font).
function centerBusNameInk() {
    const $name = $('.info-name-mid');
    const text = $name.text();
    if (!$name.length || !text) return;
    const style = getComputedStyle($name[0]);
    const font = style.font || `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const key = text + '\u0000' + font;
    let offset = busNameInkCache.get(key);
    if (offset === undefined) {
        // Measure against the real font; the fallback font has different
        // metrics and would cache a wrong correction. popInfo re-runs on the
        // poll cycle, so this resolves itself once the font is loaded.
        if (typeof document.fonts !== 'undefined' && document.fonts.check && !document.fonts.check(font)) {
            return;
        }
        offset = computeInkCenteringOffset(text, font, parseFloat(style.fontSize));
        busNameInkCache.set(key, offset);
    }
    $name.css('transform', offset ? `translateY(${Math.round(offset)}px)` : '');
}

function computeInkCenteringOffset(text, fontShorthand, fontSizePx) {
    const canvas = computeInkCenteringOffset._canvas || (computeInkCenteringOffset._canvas = document.createElement('canvas'));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.font = fontShorthand;
    const m = ctx.measureText(text);

    const fbAscent = (typeof m.fontBoundingBoxAscent === 'number' && m.fontBoundingBoxAscent) ? m.fontBoundingBoxAscent : m.actualBoundingBoxAscent;
    const fbDescent = (typeof m.fontBoundingBoxDescent === 'number' && m.fontBoundingBoxDescent) ? m.fontBoundingBoxDescent : m.actualBoundingBoxDescent;

    // Pixel-scan the rendered ink instead of trusting measureText() ink bounds,
    // which can disagree with actual rendering (hinting/subpixel AA). Draw with
    // a known baseline so the ink's top/bottom rows map straight to
    // ascent/descent.
    const pad = 10;
    const baselineY = Math.ceil(fbAscent) + pad;
    const width = Math.ceil(m.width) + pad * 2 + 4;
    const height = Math.ceil(fbAscent + fbDescent) + pad * 2 + 4;
    canvas.width = width;
    canvas.height = height;
    ctx.font = fontShorthand; // resizing the canvas resets its context state
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#000';
    ctx.fillText(text, pad, baselineY);

    const data = ctx.getImageData(0, 0, width, height).data;
    let inkTop = -1;
    let inkBottom = -1;
    outer: for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (data[(y * width + x) * 4 + 3] !== 0) { inkTop = y; break outer; }
        }
    }
    outer2: for (let y = height - 1; y >= 0; y--) {
        for (let x = 0; x < width; x++) {
            if (data[(y * width + x) * 4 + 3] !== 0) { inkBottom = y; break outer2; }
        }
    }
    if (inkTop === -1) return 0; // nothing rendered — shouldn't happen

    const inkAscent = baselineY - inkTop;
    const inkDescent = inkBottom - baselineY;

    // With line-height: 1 the line box is exactly font-size tall, and the
    // browser centers the font's content box (ascent + descent) in it via
    // half-leading.
    const lineBoxHeight = fontSizePx;
    const halfLeading = (lineBoxHeight - (fbAscent + fbDescent)) / 2;
    const baselineFromTop = halfLeading + fbAscent;
    // Ink box center measured from the top of the line box.
    const inkCenterFromTop = baselineFromTop + (inkDescent - inkAscent) / 2;
    // Flex centers the line box in the element, so centering the ink only needs
    // this line-box-relative correction.
    return lineBoxHeight / 2 - inkCenterFromTop;
}

// Re-measure once the real font finishes loading — the cached entries may have
// been measured against a fallback (or not applied at all yet).
if (typeof document.fonts !== 'undefined' && document.fonts.ready) {
    document.fonts.ready.then(function() {
        busNameInkCache.clear();
        centerBusNameInk();
    });
}

let savedCenter;
let savedZoom;

function popInfo(busName, resetCampusFontSize) {

    const data = busData[busName]
    let dataRoute = data.route

    if (!sim) {
        sa_event('bus_view_test', {
            'bus_id': busName,
            'route': data.route,
        });
        sa_event('view_bus', {
            'bus_id': busName,
            'route': data.route,
        });
    } else {
        sa_event('bus_view_test', {
            'route': 'sim-' + data.route,
        });
        sa_event('view_bus', {
            'route': 'sim-' + data.route,
        });
    }

    if (appStyle === 'rider') {
        popRiderInfo(busName);
        return;
    }

    $('.bus-ridership-wrapper').show();
    // Only destroy charts if showing a different bus
    if (currentRidershipChartBusId !== busName) {
        for (const existingBusId in busRidershipCharts) {
            busRidershipCharts[existingBusId].destroy();
            delete busRidershipCharts[existingBusId];
        }
        $('.bus-historical-capacity').empty();
    }

    let secondsDivisor = 60;
    if (showETAsInSeconds) {
        secondsDivisor = 1;
    }
    
    if (popupStopId) {
        if (appStyle === 'rider') {
            $(`img[stop-marker-id="${popupStopId}"]`).attr('src', 'img/rider/rider-stop-marker.png');
            $(`img[stop-marker-id="${popupStopId}"]`).attr('width', '15');
            $(`img[stop-marker-id="${popupStopId}"]`).attr('height', '15');
        } else {
            $(`img[stop-marker-id="${popupStopId}"]`).attr('src', 'img/stop_marker.png');
        }
        if (busStopMarkers[popupStopId]) {
            busStopMarkers[popupStopId].setZIndexOffset(settings['toggle-stops-above-buses'] ? 1000 : 0);
        }
        if (typeof stopLayerManager !== 'undefined') {
            stopLayerManager.setSelected(null);
        }
        popupStopId = null;
        thisClosestStopId = null;
        $('.stop-info-popup').hide();
        $('.settings-btn').show();
        showSimBtnIfEligible();
        populateRouteSelectors(activeRoutes);
    }

    if (busData[busName]['overtime'] && !forceUnstoppedBuses.has(busName)) {
        // Stopped overtime: red text + red octagon to the right of the
        // "Stopped Xm Xs" label.
        $('.info-stopped-for').addClass('overtime');
        showStoppedOctagon();
        if (settings['toggle-show-bus-overtime-timer']) {
            startOvertimeCounter(busName);
        }
    } else {
        stopOvertimeCounter();
        $('.info-stopped-for').removeClass('overtime');
        hideStoppedOctagon();
    }

    let displayRoute;
    if (dataRoute === 'wknd1' || dataRoute === 'wknd2') {
        dataRoute = 'Weekend ' + dataRoute.slice(-1);
        displayRoute = dataRoute.charAt(0).toUpperCase() + dataRoute.slice(1).toLowerCase();
    } else if (dataRoute === 'on1' || dataRoute === 'on2') {
        dataRoute = 'Overnight ' + dataRoute.slice(-1);
        displayRoute = dataRoute;
    } else if (dataRoute === 'summer1' || dataRoute === 'summer2') {
        dataRoute = dataRoute.charAt(0).toUpperCase() + dataRoute.slice(1, -1) + ' ' + dataRoute.slice(-1);
        displayRoute = dataRoute;
    } else if (dataRoute === 'all') {
        displayRoute = 'All Campus';
    } else {
        displayRoute = dataRoute.toUpperCase();
    }
    $('.info-route-mid').text(displayRoute).parent().css('color', colorMappings[data.route])
    if (data.busName.slice(-1) === "E") {
        $('.info-bolt').show();
    } else {
        $('.info-bolt').hide();
    }
    
    let busNameElmText = data.busName
    
    const campusesElement = $('.info-campuses-mid');
    const campusText = campusMappings[data.route];
    if (resetCampusFontSize === true || campusText) {
        campusesElement.css('font-size', '2.5rem');
    }
    // Hide when there's no campus mapping so the empty element's flex gap
    // doesn't shift the route letter off-center.
    campusesElement.text(campusText).toggle(!!campusText);
    
    if (campusText) {
        setTimeout(() => {
            while (campusesElement[0].scrollWidth > campusesElement[0].clientWidth && parseInt(campusesElement.css('font-size')) > 12) {
                campusesElement.css('font-size', (parseInt(campusesElement.css('font-size')) - 1) + 'px');
            }  
        }, 0);    
    }

    if (showBusSpeeds && !Number.isNaN(parseInt(data.visualSpeed))) {
        $('.info-speed-mid').text(parseInt(data.visualSpeed));
        $('.info-mph-mid').text('mph');
        $('.info-speed-wrapper').css('visibility', 'visible');
    } else {
        $('.info-speed-wrapper').css('visibility', 'hidden');
    }
    $('.info-name-mid').text(busNameElmText);
    centerBusNameInk();
    const serviced = getBusServicedCampuses(busName);
    const servicedCampuses = serviced.campuses;
    // Two campuses means the bus shuttles back and forth between them, so use
    // a left-right arrow; otherwise chain the sequence with a right arrow.
    const campusesArrow = servicedCampuses.length === 2 ? ' \u2194 ' : ' \u2192 ';
    // Crossing into a new campus: prepend a bold approach arrow and leave the
    // campuses regular weight; otherwise bold the first campus abbreviation.
    let campusesHtml;
    if (serviced.approachingNewCampus && servicedCampuses.length) {
        campusesHtml = '<b>\u2192</b> ' + servicedCampuses.join(campusesArrow);
    } else {
        campusesHtml = servicedCampuses.map((seg, i) => i === 0 ? `<b>${seg}</b>` : seg).join(campusesArrow);
    }
    $('.info-campuses-serviced').html(campusesHtml).toggle(servicedCampuses.length > 0);
    $('.info-capacity-mid').html(' | <span class="info-capacity-val">' + data.capacity + '%</span> capacity');

    if (busData[busName].oos) {
        $('.bus-oos-mid').show();
    } else {
        $('.bus-oos-mid').hide();
    }

    if (busData[busName].atDepot) {
        $('.bus-depot-mid').show();
    } else {
        $('.bus-depot-mid').hide();
    }

    if (sharedBusName && sharedBusName === busName) {
        $('.info-shared-bus-mid').show();
    }

    if (joined_service[busName]) {
        const serviceDate = new Date(joined_service[busName]);
        const today = new Date();
        const isToday = serviceDate.getDate() === today.getDate() && 
                        serviceDate.getMonth() === today.getMonth() &&
                        serviceDate.getFullYear() === today.getFullYear();

        const formattedTime = serviceDate.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: undefined,
            hour12: true
        });

        const displayTime = isToday ? formattedTime : 
            `${formattedTime} on ${(serviceDate.getMonth() + 1).toString().padStart(2, '0')}/${serviceDate.getDate().toString().padStart(2, '0')}`;
        
        const timeInService = Math.floor((today - serviceDate) / 1000);
        const hours = Math.floor(timeInService / 3600);
        const minutes = Math.floor((timeInService % 3600) / 60);
        const timeInServiceText = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

        $('.bus-joined-service').text('Joined service at ' + displayTime + ' (' + timeInServiceText + ' ago)');
    
    }

    $('.info-next-stops').show();
        
    $('.bus-data-extra').empty();
    let extraDataHtml = `<div class="center mb-0p5rem">Bus ID: ${busName}</div>`;
    for (const [key, value] of Object.entries(busData[busName])) {
        // Format all values including arrays
        if (value !== null) {
            let extraDataVal = value
            if (key === 'isKnown') {
                extraDataVal = value ? 'Yes' : 'No';
                extraDataHtml += `<div>${key}: <span style="opacity: 0.7; color: ${value ? '#4CAF50' : '#f44336'}">${extraDataVal}</span></div>`;
                const validityResult = getBusValidityInfo(busName);
                const validityText = validityResult.valid ? 'Yes' : `No (${validityResult.reason})`;
                extraDataHtml += `<div>isValid: <span style="opacity: 0.7; color: ${validityResult.valid ? '#4CAF50' : '#f44336'}">${validityText}</span></div>`;

                const distInfo = distanceFromLine(busName, true);
                const distText = distInfo.isOffLine ? `true (${distInfo.feet.toLocaleString()} ft away)` : `false (${distInfo.feet.toLocaleString()} ft away)`;
                extraDataHtml += `<div>distanceFromLine validity: <span style="opacity: 0.7; color: ${distInfo.isOffLine ? '#f44336' : '#4CAF50'}">${distText}</span></div>`;

                continue; // Skip processing isKnown again in the normal flow
            } else if (key === 'stopId') {
                if (Array.isArray(value)) {
                    const formattedStops = [];
                    for (const id of value) {
                        const stopName = stopsData[id] ? stopsData[id].name : 'Unknown';
                        formattedStops.push(`${id} (${stopName})`);
                    }
                    extraDataVal = formattedStops.join(', ');
                } else {
                    extraDataVal += ' (' + (stopsData[value] ? stopsData[value].name : 'Unknown') + ')';
                }
            } else if (key === 'prevStopId' || key === 'next_stop') {
                extraDataVal += ' (' + (stopsData[value] ? stopsData[value].name : 'Unknown') + ')';
            } else if (key === 'route_change' && typeof value === 'object') {
                // Format route_change object to show readable information
                const routeChangeData = value;
                const oldRoute = routeChangeData.old_route || 'Unknown';
                const changeTime = routeChangeData.route_change_time ? 
                    new Date(routeChangeData.route_change_time).toLocaleString() : 'Unknown time';
                extraDataVal = `From: ${oldRoute} at ${changeTime}`;
            } else if (typeof value === 'object' && value !== null) {
                // For any other objects, display as JSON
                extraDataVal = JSON.stringify(value, null, 2);
            }
            extraDataHtml += `<div>${key}: <span style="opacity: 0.7">${extraDataVal}</span></div>`;
        }
    }
    $('.bus-data-extra').html(extraDataHtml);

    if ('at_stop' in busData[busName] && busData[busName].at_stop === true) {
        startStoppedForTimer(busName)
    } else {
        hideStoppedFor();
    }

    // console.log('data: ', data)
    // console.log('next_stop' in data)

    $('.next-stop-circle').remove(); // remaining .next-stop-circles rom rote menu messes this up

    // Stop-marker ETA tooltips (setStopEtaLabel) are collected here and applied
    // after the popup is shown: each call does a synchronous WebGL feature
    // update (and possibly a sprite texture upload), which would otherwise delay
    // the popup's first paint by ~18 pushes per render.
    const etaLabelsToSet = [];

    if ('next_stop' in data && busETAs[busName] && !busData[busName].atDepot) { // Hide next stops when bus is at depot
        $('.next-stops-grid > div').empty();
        
        // Track whether we should show the closest stop section
        const shouldShowClosestStop = closestStopId && routesServicing(closestStopId).includes(data.route) && 
            (userPosition ? (closestDistance < maxDistanceMiles || settings['toggle-bypass-max-distance']) : true);
        
        if (shouldShowClosestStop) {
            const $circle = $('<div class="closest-stop-circle closest-stop-bg" style="margin-right: 1rem;"></div>').css('background-color', colorMappings[data.route])
            $('.next-stops-grid > div').append($(`<div class="flex justify-center align-center closest-stop-bg h-100" style="margin-right: -2rem; margin-left: -1rem; border-radius: 0.8rem 0 0 0.8rem;"></div>`).append($circle))
            $('.next-stops-grid > div').append($(`<div class="flex flex-col pointer closest-stop-bg" style="margin-right: -2rem; padding: 1rem 0;">
                <div class="next-stop-closest closest-stop">Closest Stop</div>
                <div class="next-stop-name flex">${stopsData[closestStopId].name}</div>
            </div>`).click(() => {
                flyToStop(closestStopId, true); // true indicates user interaction
            }));
            $('.next-stops-grid > div').append($(`<div class="flex flex-col center pointer closest-stop-bg h-100 justify-center" style="margin-right: -1rem; border-radius: 0 0.8rem 0.8rem 0; padding-right: 1rem;">
                <div class="next-stop-eta closest-stop-eta" data-stop-id="${closestStopId}">temp</div>
                <div class="next-stop-time closest-stop-time">temp:temp</div>
            </div>`).click(() => {
                flyToStop(closestStopId, true); // true indicates user interaction
            }));
            $('.next-stops-grid > .grid').css('margin-top', '-0.5rem')
            // $('.next-stops-grid > div').append('<div class="closest-stop-divider"><hr></div>')
        }

        let firstCircle = null;
        let lastCircle = null;

        const nextStop = data.next_stop
        let routeStops = stopLists[data.route]
        let sortedStops = []

        const nextStopIndex = routeStops.indexOf(nextStop);

        if (nextStopIndex !== -1) {
            sortedStops = routeStops
                .slice(nextStopIndex)
                .concat(routeStops.slice(0, nextStopIndex));
        }

        // Check if closest stop is the next stop (first in route)
        const closestStopIsNextStop = closestStopId && closestStopId === sortedStops[0] && routesServicing(closestStopId).includes(data.route);

        // Special-case ordering for SAC NB (stop 3) approach legs on weekend/all-style routes
        let approachPrev = null;
        if ((busData[busName]['route'] === 'wknd1' || busData[busName]['route'] === 'all' || busData[busName]['route'] === 'winter1' || busData[busName]['route'] === 'on1' || busData[busName]['route'] === 'summer1') && nextStop === 3) {
            approachPrev = busData[busName]['prevStopId'];
            if (!approachPrev) {
                const viaMap = busETAs && busETAs[busName] && busETAs[busName][3] && busETAs[busName][3]['via'];
                const via22 = viaMap && (viaMap['22'] ?? viaMap[22]);
                const via2 = viaMap && (viaMap['2'] ?? viaMap[2]);
                if (typeof via22 === 'number' && typeof via2 === 'number') {
                    approachPrev = via22 <= via2 ? 22 : 2;
                }
            }
            if (approachPrev === 2) {
                // Base is [3, ..., 22, 1, 2]; insert second 3 between 22 and 1
                const idx22 = sortedStops.indexOf(22);
                if (idx22 !== -1) {
                    const head = sortedStops.slice(0, idx22 + 1); // includes 22
                    const tail = sortedStops.slice(idx22 + 1);     // typically [1,2]
                    sortedStops = head.concat([3]).concat(tail);
                }
            } else if (approachPrev === 22) {
                // Move [1,2] right after first 3 and add a second 3 before continuing
                const afterFirst3 = sortedStops.slice(1).filter(s => s !== 1 && s !== 2);
                sortedStops = [3, 1, 2, 3].concat(afterFirst3);
            }
        }

        if (busData[busName].at_stop && !(closestStopId && closestStopId === busData[busName].stopId)) {

            let stopId = busData[busName].stopId
            if (Array.isArray(stopId)) {
                stopId = stopId[0];
            }

            let stopName = stopsData[stopId].name;
            let campusName = '';
            if (selectedCampus === 'nb') {
                campusName = campusShortNamesMappings[stopsData[stopId].campus];
            }

            $('.next-stops-grid > div').append($('<div class="next-stop-circle"></div>').css('background-color', colorMappings[data.route]))
            $('.next-stops-grid > div').append($(`<div class="flex flex-col pointer">
                    <div class="next-stop-campus">${campusName}</div>
                    <div class="next-stop-name flex">${stopName}</div>
                </div>`).click(() => { 
                    flyToStop(stopId); 
                }));
            $('.next-stops-grid > div').append($(`<div class="flex flex-col center pointer">
                <div class="next-stop-eta" data-stop-id="${stopId}">Here</div>
            </div>`).click(() => { 
                flyToStop(stopId);  
            }));

            if (!firstCircle) {
                // If closest stop is the next stop, use closest stop circle as first circle
                if (closestStopIsNextStop) {
                    firstCircle = $('.closest-stop-circle').css('background-color', 'red').addClass('next-stop-circle');
                    firstCircle.append(`<div class="next-stop-circle" style="z-index: 1; background-color: ${colorMappings[data.route]}"></div>`)
                } else {
                    firstCircle = $('.next-stops-grid .next-stop-circle').last().css('background-color', 'red');
                    firstCircle.append(`<div class="next-stop-circle" style="z-index: 1; background-color: ${colorMappings[data.route]}"></div>`)
                }
            }

        }

        let negativeETA = false;

        for (let i = 0; i < sortedStops.length; i++) {

            let eta;

            if ((busData[busName]['route'] === 'wknd1' || busData[busName]['route'] === 'all' || busData[busName]['route'] === 'winter1' || busData[busName]['route'] === 'on1' || busData[busName]['route'] === 'summer1') && sortedStops[i] === 3) { // special case
                if (nextStop === 3 && busData[busName]['stopId'] && !approachPrev) { // very rare case when bus added to server data where next stop is sac nb and there is no previous data yet, accurate eta cannot be known // only triggers if just passed socam sb or yard (at least for current 2024 routes [wknd1, all])
                    delete busETAs[busName];
                    console.log("I'm amazed this actually happened, wow"); // encountered this 4/19/2025 six:38 pm at livi dining
                    return;
                }
                // Use correct approach prev stop for ETA calculation for each SAC NB visit
                let etaPrevStopId;
                if (i === 0) {
                    // First SAC NB - use the actual approach previous stop
                    etaPrevStopId = approachPrev;
                } else {
                    // Second SAC NB - use the previous stop in the current sorted sequence
                    etaPrevStopId = sortedStops[i-1];
                }
                const etaSecs = getETAForStop(busName, 3, etaPrevStopId);
                eta = Math.round(((etaSecs || 0) + 10)/secondsDivisor);
            } else {
                const etaSecs = getETAForStop(busName, sortedStops[i]);
                eta = Math.round(((etaSecs || 0) + 10)/secondsDivisor); // Turns out our ETAs are so accurate that they've been exactly 20 seconds too late, i.e. the exact buffer time I was adding! Wow!
            }

            if (eta < 0 && !settings['toggle-show-invalid-etas']) {
                negativeETA = true;
                break;
            }

            const currentTime = new Date();

            let formattedTime;
            if (showETAsInSeconds && (eta < 600 || i === 0)) {
                currentTime.setSeconds(currentTime.getSeconds() + eta);
                formattedTime = currentTime.toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: true
                });

                let hours = Math.floor(eta / 3600);
                let minutes = Math.floor((eta % 3600) / 60);
                let seconds = eta % 60;
                eta = hours > 0 ? `${hours}h ${minutes}m ${seconds}s` : 
                      minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

            } else if (showETAsInSeconds && eta >= 600) {
                currentTime.setMinutes(currentTime.getMinutes() + Math.floor(eta / 60));
                formattedTime = currentTime.toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                });

                let hours = Math.floor(eta / 3600);
                let minutes = Math.floor((eta % 3600) / 60);
                eta = hours > 0 ? (minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`) : `${minutes}m`;

            } else {
                currentTime.setMinutes(currentTime.getMinutes() + eta);
                formattedTime = currentTime.toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                });

                if (eta === 0) { eta = 1 }
                eta += 'm'
            }

            let stopName = stopsData[sortedStops[i]].name
            let campusName = '';
            if (selectedCampus === 'nb') {
                campusName = campusShortNamesMappings[stopsData[sortedStops[i]].campus];
            }

            if (i === 0 && settings['toggle-show-bus-progress']) {
                stopName += `<div class="ml-0p5rem" style="color: #00abff;">(${Math.round(busData[busName].progress*100)}%)</div>`
            }

            if (closestStopId && closestStopId === sortedStops[i] && routesServicing(closestStopId).includes(data.route)) {
                if (busData[busName].at_stop && closestStopId === busData[busName].stopId) {
                    $('.closest-stop-eta').text('Here')
                    $('.closest-stop-time').hide();
                } else {
                    $('.closest-stop-eta').text(eta)
                    $('.closest-stop-time').text(formattedTime)
                    etaLabelsToSet.push([sortedStops[i], eta]);
                }
            }

            if (i === 0 && shouldShowClosestStop && closestStopId === sortedStops[i] && !busData[busName].at_stop) { continue; } // don't show duplicates if next bus stop is closest stop. Has to be down here because eta still needs to be calculated.

            $('.next-stops-grid > div').append($('<div class="next-stop-circle"></div>').css('background-color', colorMappings[data.route]))
            $('.next-stops-grid > div').append($(`<div class="flex flex-col pointer">
                    <div class="next-stop-campus">${campusName}</div>
                    <div class="next-stop-name flex">${stopName}</div>
                </div>`).click(() => { 
                    flyToStop(sortedStops[i]); 
                }));
            $('.next-stops-grid > div').append($(`<div class="flex flex-col center pointer">
                <div class="next-stop-eta" data-stop-id="${sortedStops[i]}">${eta}</div>
                <div class="next-stop-time">${formattedTime}</div>
            </div>`).click(() => { 
                flyToStop(sortedStops[i]);  
            }));
            etaLabelsToSet.push([sortedStops[i], eta]);

            if (!firstCircle) {
                // If closest stop is the next stop and we're showing the closest stop section, use it as first circle
                if (closestStopIsNextStop && shouldShowClosestStop) {
                    firstCircle = $('.closest-stop-circle').addClass('next-stop-circle');
                    firstCircle.append(`<div class="next-stop-circle" style="z-index: 1; background-color: ${colorMappings[data.route]}"></div>`)
                } else {
                    firstCircle = $('.next-stops-grid .next-stop-circle').last();
                    firstCircle.append(`<div class="next-stop-circle" style="z-index: 1; background-color: ${colorMappings[data.route]}"></div>`)
                }
            }

            // Always set lastCircle to the most recently added circle in the next-stops-grid
            lastCircle = $('.next-stops-grid .next-stop-circle').last();

        }

        if (busData[busName].oos) {
            distanceFromLine(busName);
        }

        if (!negativeETA) {

            $('.info-next-stops, .next-stops-grid').show(); // remove .show after adding message saying stops unavailable in the else statement above <-- ??

            if (popupBusName !== busName) {
                setTimeout(() => { // absolutely no idea why it doesn't reset scroll without a timeout
                    $('.info-next-stops').scrollTop(0)
                }, 0);
            }  

            setTimeout(() => {
                const firstRect = firstCircle[0].getBoundingClientRect();
                const lastRect = lastCircle[0].getBoundingClientRect();
                const heightDiff = Math.abs(lastRect.top - firstRect.top);
                firstCircle.addClass('connecting-line');
                firstCircle[0].style.setProperty('--connecting-line-height', `${heightDiff}px`);
            }, 0);
            
        } else {
            $('.next-stops-grid').hide(); // For some reason *only* the closest stop at top of next stops remains visible if negative ETA, and only if negative ETA happens while site was open. Investigate why, unsure if this fixes. The closest stop should be part of the element, so I'm confused...
            setTimeout(() => {
                $('.info-next-stops').scrollTop(0)
            }, 0);
        }
    }

    else {
        $('.next-stops-grid').hide();
        $('.next-stops-grid > div').empty();
    }

    updateHistoricalCapacity(busName);

    if (sourceBusName !== busName) { // kinda a hack to repopulating bus breaks when already shown, fixes hiding the shown more breaks each time... needed some way to check if it was already shown, can probably find a better way to check later (set a separate var, or hide/clear/empty some element on hide info boxes/pop info bus change...)
        $('.bus-history').show();
        $('.info-quickness-mid').hide();
        getBusBreaks(busName);
        $('.show-more-breaks, .show-all-breaks').show();
    }
    
    if (sourceStopId) {
        $('.bus-info-back-wrapper').css('display', 'flex');
    } else {
        $('.bus-info-back-wrapper').hide();
    }
    sourceBusName = busName;

    if (favBuses.includes(busName)) {
        $('.bus-star > i').css('color', 'gold').removeClass('icon-star').addClass('icon-star-solid')
    } else {
        $('.bus-star > i').css('color', 'var(--theme-color)').removeClass('icon-star-solid').addClass('icon-star')
    }

    if (!isDesktop) {
        if (!settings['toggle-bypass-max-distance']) {
            const expandedBounds = expandBounds(bounds[selectedCampus], 2.8);
            map.setMaxBounds(expandedBounds);
        }
        map.setMinZoom(9);
    }

    $('.my-location-popup').hide(); // investigate why I don't have to hide the other info boxes
    $('.stop-info-popup').hide(); // nvm I changed something somewhere to make me need to hide this one too
    
    $('.building-info-popup').hide();
    unhighlightBuilding();

    $('.bus-info-popup').stop(true, true).show();
    if (isDesktop) showEscNotice('bus');

    // Apply the collected stop-marker ETA tooltips after the popup has painted
    // (next frame), so the per-stop WebGL feature updates don't delay it.
    if (etaLabelsToSet.length) {
        requestAnimationFrame(() => {
            etaLabelsToSet.forEach(([stopId, eta]) => setStopEtaLabel(stopId, eta, true));
        });
    }

    updateNextStopsMaxHeight();

    if (!popupBusName && settings['toggle-hide-other-routes']) {
        focusBus(busName);
    }

    updateRidingBadgeUI();
}

function updateNextStopsMaxHeight() {
    const nextStops = $('.info-next-stops');
    if (nextStops.length === 0) return;
    
    // Account for the overdue break element if it's visible
    let overdueBreakHeight = 0;
    const overdueBreak = $('.info-overdue-break');
    if (overdueBreak.is(':visible')) {
        const marginTop = parseFloat(overdueBreak.css('margin-top')) || 0;
        overdueBreakHeight = overdueBreak.outerHeight() + marginTop;
    }
    
    // 1.5rem*2 = vertical padding on .info-next-stops, plus xrem gap to be above .bottom <-- no longer acccrate 8/19
    const maxHeight = window.innerHeight - nextStops.offset().top - $('.bus-info-bottom').innerHeight() - $('.bottom').innerHeight() - overdueBreakHeight;
    // console.log(maxHeight);
    nextStops.css('max-height', maxHeight - 75);
}
