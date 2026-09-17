function getRoutesServicingStop(stopId) {
    let routes = [];
    let routesArray = Array.from(activeRoutes).filter(route => getCampusRoutes(selectedCampus).includes(route));
    routesArray.forEach(route => {
        if (stopLists[route].includes(stopId)) {
            routes.push(route)
        }
    })
    return routes;
}

function getSoonestBus(stopId, route, validCache) {
    let lowestETA = Infinity;
    let lowestBusName;

    if (!busesByRoutes) {
        console.log ('busesByRoutes not defined');
        console.log(busesByRoutes);
        return [null, null];
    }

    // Optional per-run memo: isValid() runs route geometry per bus and the
    // closest-stops refresh re-hits the same buses across chips.
    const checkValid = validCache
        ? (name) => {
            let v = validCache.get(name);
            if (v === undefined) {
                v = isValid(name);
                validCache.set(name, v);
            }
            return v;
        }
        : isValid;

    try { // busesByRoutes[selectedCampus][route] disapears when negative/invalid ETA? have to check if this is why/when it is so

        busesByRoutes[selectedCampus][route].forEach(busName => {

            if (busETAs[busName] && checkValid(busName)) {

                const eta = getETAForStop(busName, stopId);
                if (eta < lowestETA) {
                    lowestETA = eta;
                    lowestBusName = busName;
                }
            }
        })
    } catch (error) {
        console.error('error in getSoonestBus');
        console.error(error);
        console.error(route);
        console.error(stopId);
        console.error(busesByRoutes);
    }
    return [lowestBusName, lowestETA];
}

// Stops-subpanel ETA rows carry an absolute arrival stamp (data-eta-abs) and the
// 1s ticker derives `ceil((abs - now)/1000)` from it, i.e. "the stamped whole
// seconds minus the whole seconds elapsed". Stamping a *quantized* value is what
// keeps a freshly-set ETA on screen for a full second: tied to the raw fractional
// ETA, the value would hit its next second boundary part-way through the ticker's
// interval and appear to drop a second immediately after refreshing.
let incomingEtaTicker = null;

function formatIncomingEta(seconds) {
    const s = Math.max(0, Math.ceil(seconds));
    return s >= 60 ? `${Math.floor(s / 60)}m` : `${s}s`;
}

// Whole seconds remaining, plus the absolute stamp that matches it.
function incomingEtaStamp(eta, now) {
    const secs = Math.round(eta);
    return { secs, abs: now + secs * 1000 };
}

function tickIncomingEtas() {
    const $panel = $('.all-stops-inner');
    if (!$panel.is(':visible')) return;
    const now = Date.now();
    $panel.find('.incoming-eta[data-eta-abs]').each(function() {
        const $el = $(this);
        const abs = Number($el.attr('data-eta-abs'));
        const text = formatIncomingEta((abs - now) / 1000);
        if ($el.text() !== text) $el.text(text);
    });
}

function startIncomingEtaTicker() {
    if (incomingEtaTicker === null) {
        incomingEtaTicker = setInterval(tickIncomingEtas, 1000);
    }
}

// In-place ETA refresh for the stops subpanel, driven from the updateTimeToStops
// cycle. Unlike a full populateAllStops() rebuild this leaves the list's scroll
// position and hover state alone, so it's throttled to poll cadence; the 1s
// ticker covers the countdown between refreshes.
let _lastAllStopsEtaRefresh = 0;
function refreshAllStopsEtas() {
    if (!$('.all-stops-inner').is(':visible')) return;
    const now = Date.now();
    if (now - _lastAllStopsEtaRefresh < 4000) return;
    _lastAllStopsEtaRefresh = now;

    // Rows are collected per stop, because each stop's list is re-sorted by
    // soonest arrival once its ETAs have been refreshed.
    const stops = new Map();
    $('.all-stops-inner .incoming-eta[data-stop-id][data-route]').each(function() {
        const $eta = $(this);
        const gridEl = $eta.parent().get(0);
        let entry = stops.get(gridEl);
        if (!entry) {
            entry = { $grid: $(gridEl), etas: [] };
            stops.set(gridEl, entry);
        }
        entry.etas.push($eta);
    });

    // Share the isValid() geometry across every row's buses for this pass.
    const validCache = new Map();
    stops.forEach(({ $grid, etas }) => {
        const rows = [];
        etas.forEach($eta => {
            // The render appends a row's chip and ETA as consecutive siblings, so
            // the chip is the ETA's previous sibling. Captured before any moving.
            const $chip = $eta.prev('.incoming-route-chip');
            const stopId = parseInt($eta.attr('data-stop-id'));
            const route = $eta.attr('data-route');

            if (isRouteBusAtStop(route, stopId)) {
                $eta.removeAttr('data-eta-abs');
                if ($eta.text() !== 'Here') $eta.text('Here');
                rows.push({ $chip, $eta, secs: 0 });
                return;
            }

            const [busName, eta] = getSoonestBus(stopId, route, validCache);
            if (!busData[busName]) {
                // No inbound bus left on this route (went OOS / changed route).
                // Drop the whole row: leaving the chip behind with a blank ETA
                // reads worse than the row simply going away. (A route that later
                // regains a bus is picked up by the next full rebuild, which the
                // new/changed-bus fetchWhere path triggers.)
                $chip.remove();
                $eta.remove();
                return;
            }

            const { secs, abs } = incomingEtaStamp(eta, now);
            $eta.attr('data-eta-abs', String(abs));
            const text = formatIncomingEta(secs);
            if ($eta.text() !== text) $eta.text(text);
            rows.push({ $chip, $eta, secs });
        });

        // Soonest first ("Here" leads), moving each chip with its ETA, and only
        // when the order actually changed so idle passes don't reflow the list.
        if (rows.length < 2) return;
        const sorted = rows.slice().sort((a, b) => a.secs - b.secs);
        if (sorted.every((row, i) => row.$eta.get(0) === rows[i].$eta.get(0))) return;

        sorted.forEach(({ $chip, $eta }) => {
            $grid.append($chip).append($eta);
        });
    });
}

function populateAllStops() {
    if (typeof activeStops === 'undefined') {
        return;
    }

    $('.all-stops-inner').empty();
    for (const campus in stopsByCampus[selectedCampus]) {
        const stops = stopsByCampus[selectedCampus][campus];
        let campusHasBuses = false;
        const $allStopsGridElm = $('<div class="all-stops-grid mb-2rem select-none"></div>')
        stops.forEach(stopId => {
            if (activeStops.includes(stopId)) {
                let servicingRoutes = getRoutesServicingStop(stopId);
                if (servicingRoutes.length > 0) {
                    campusHasBuses = true;
                }
                    const $stopsElm = $('<div class="pointer incoming-wrapper"><div class="text-1p3rem center mb-0p5rem"></div><div class="incoming-list grid gap-y-0p5rem align-center" style="grid-template-columns: auto 1fr;"></div></div>');
                    $stopsElm.find('.text-1p3rem').text(stopsData[stopId].name);
                    $stopsElm.click(function() {
                        cancelInfoPanelAnimation();
                        $('.subpanels-container').removeClass('is-dragging-or-animating');
                        clearPanoutFeedback();
                        flyToStop(stopId, true); // true indicates user interaction
                        saveInfoSubpanelScrollPositions();
                        $('.info-panels-show-hide-wrapper').hide();
                        delete window._panelOpenedAt['info'];
                        $('.bottom').show();
                        $('.left-btns, .right-btns, .settings-btn').show();
                        showSimBtnIfEligible();
                        
                        // Show parking campus selector only if user has a campus selected
                        if (settings['parking-campus']) {
                            $('.parking-campus-selector').show();
                        }
                        updateDirectFeedbackBtnVisibility();
                        moveRouteSelectorsToMain();
                        // Restore route selectors based on current stop selection
                        if (popupStopId) {
                            populateRouteSelectors(activeRoutes, popupStopId);
                        } else {
                            populateRouteSelectors(activeRoutes);
                        }
                        // Note: Not calling closeRouteMenu() here as this is switching to stop view
                    });
                $allStopsGridElm.append($stopsElm);
                // Soonest arrival first; a bus at the stop ("Here") leads.
                servicingRoutes
                    .map(route => {
                        const busAtStop = isRouteBusAtStop(route, stopId);
                        const [busName, eta] = busAtStop ? [null, null] : getSoonestBus(stopId, route);
                        return { route, busAtStop, busName, eta };
                    })
                    .filter(row => row.busAtStop || busData[row.busName])
                    .sort((a, b) => (a.busAtStop ? 0 : a.eta) - (b.busAtStop ? 0 : b.eta))
                    .forEach(({ route, busAtStop, busName, eta }) => {
                        const _rc = (typeof escapeCssColor === 'function' ? escapeCssColor(colorMappings[busData[busName]?.route] || colorMappings[route] || '#000') : (colorMappings[busData[busName]?.route] || colorMappings[route] || '#000'));
                        const $routeChip = $('<div class="incoming-route-chip white text-1p5rem bold-500 br-0p5rem w-auto center" style="padding: 0.2rem 1rem;"></div>')
                            .attr('data-stop-id', String(stopId))
                            .attr('data-route', route)
                            .css('background-color', _rc).text((busData[busName]?.route || route).toUpperCase())
                            .on('click', function(e) {
                                cancelInfoPanelAnimation();
                                $('.subpanels-container').removeClass('is-dragging-or-animating');
                                // Prevent the parent stop click from firing
                                e.stopPropagation();

                                clearPanoutFeedback();

                                // Match parent behavior: close panels and restore main UI
                                saveInfoSubpanelScrollPositions();
                                $('.info-panels-show-hide-wrapper').hide();
                                delete window._panelOpenedAt['info'];
                                $('.bottom').show();
                                moveRouteSelectorsToMain();
                        $('.left-btns, .right-btns, .settings-btn').show();
                        showSimBtnIfEligible();
                        
                                // Show parking campus selector only if user has a campus selected
                                if (settings['parking-campus']) {
                                    $('.parking-campus-selector').show();
                                }
                                updateDirectFeedbackBtnVisibility();

                                // Set the route filter and then fly to the stop
                                toggleRoute(route);
                                flyToStop(stopId, true);
                            });
                        $stopsElm.find('.incoming-list').append($routeChip);

                        const $etaElm = $('<div class="incoming-eta text-1p6rem bold right"></div>')
                            .attr('data-stop-id', String(stopId))
                            .attr('data-route', route);
                        if (busAtStop) {
                            $etaElm.text('Here');
                        } else {
                            const { secs, abs } = incomingEtaStamp(eta, Date.now());
                            $etaElm.attr('data-eta-abs', String(abs)).text(formatIncomingEta(secs));
                        }
                        $stopsElm.find('.incoming-list').append($etaElm);
                    });
            }
        })
        if (campusHasBuses) {
            const $campusElm = $('<div class="campus text-1p7rem ml-0p5rem"></div>').text(campus)
            $('.all-stops-inner').append($campusElm);
            $('.all-stops-inner').append($allStopsGridElm);
        }
    }

    startIncomingEtaTicker();
}


$('.info-panels').click(function(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    window._lastInfoPanelsOpenTime = Date.now();
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
    
    // Hide search wrapper and unfocus search input if it's open
    if ($('.search-wrapper').is(':visible')) {
        closeSearch();
        // $('.search-wrapper input').blur();
    }

    // Store the original route selection from state before opening panels
    originalShownRoute = shownRoute || null;

    // NOTE: do NOT reset scroll here — each subpanel (routes/stops/network)
    // restores its own remembered position at the end of this open flow.
    $('.info-panels-show-hide-wrapper').show();
    capturePostHog('info_panels_opened', {
        subpanel: (typeof panelOrder !== 'undefined' && panelOrder[lastUserSelectedPanelIndex]) || 'stops',
        source: 'info_button',
        campus: settings['campus'] || 'nb'
    });
    // Guard the remembered positions while repopulation collapses/rebuilds
    // content (empty() clamps scrollTop to 0 and must not overwrite memory).
    pauseInfoSubpanelScrollSaving();
    markPanelOpened('info');
    if (isDesktop && !isTouchDevice) showEscNotice('info');

    // Populate the network panel first to avoid layout shifts affecting positioning
    busesOverview();

    // Don't force a specific panel - let the system remember the last selected panel
    // The panel state is already preserved in currentPanelIndex and header button styling
    // Restore the panel position to match the remembered state
    restorePanelPosition();

    // Populate all stops after positioning is set
    populateAllStops();

    // If any active bus is missing stopId or ETAs, trigger fetchWhere() to compute and refresh
    const hasBusesNeedingWhere = Object.keys(busData).some(b => !busData[b].stopId || !busETAs || !busETAs[b]);
    if (hasBusesNeedingWhere && typeof fetchWhere === 'function' && !sim) {
        fetchWhere();
    }

    // Move route selectors into the route subpanel
    moveRouteSelectorsToSubpanel();
    
    // Show all route selectors in subpanel (not filtered by stop selection)
    populateRouteSelectors(activeRoutes);
    
    // Select any previously selected route after selectors are populated
    if (shownRoute) {
        toggleRouteSelectors(shownRoute);
        // Hide the route selection prompt since a route is selected
        $('#route-selection-prompt').hide();
    } else if (lastPanelRoute) {
        // No map filter, but the subpanel remembers a route from a previous
        // panels session: render it again. If already on the routes tab do it
        // now; otherwise hide the prompt so ensureRouteSubpanelPopulated
        // renders it on arrival instead of switching tabs here.
        if ($('.subpanels-container').hasClass('panel-routes')) {
            selectedRoute(lastPanelRoute);
        } else {
            $('#route-selection-prompt').hide();
            $('.route-panel-wrapper .route-panel').hide();
        }
    } else {
        // Show the route selection prompt since no route is selected
        $('#route-selection-prompt').show();
        $('.route-panel-wrapper .route-panel').hide();
    }

    // If the restored panel is Routes and a route was already selected on the
    // map, render its details (the pill highlight above is not enough).
    ensureRouteSubpanelPopulated();

    // Restore each subpanel's remembered scroll position now that content
    // height is back (handles its own rAF/deferred re-apply internally).
    restoreInfoSubpanelScrollPositions();

    // Show and position route selectors immediately when info panels are opened
    $('.bottom').show();
    $('.left-btns, .right-btns').hide();
    $('.route-selectors').show();
    $('.settings-btn, .parking-campus-selector, .sim-btn, .direct-feedback-btn').hide();
})
