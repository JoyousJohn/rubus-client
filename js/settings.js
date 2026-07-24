$('.settings-toggle .toggle-input').on('change', function () {
    const toggleId = $(this).attr('id');
    const isChecked = $(this).prop('checked');

    sa_event('toggle_change', {
        'toggle': toggleId,
        'isChecked': isChecked
    });

    switch (toggleId) {

        case 'toggle-select-closest-stop':
            console.log(`Auto select closest stop ${isChecked ? 'ON' : 'OFF'}`);
            settings['toggle-select-closest-stop'] = isChecked;
            break;

        case 'toggle-show-arrival-times':
            console.log(`Show arrival times now ${isChecked ? 'ON' : 'OFF'}`);
            settings['toggle-show-arrival-times'] = isChecked;
            break;

        case 'toggle-show-bus-speeds':
            console.log(`Show bus speeds now ${isChecked ? 'ON' : 'OFF'}`);
            showBusSpeeds = isChecked;
            settings['toggle-show-bus-speeds'] = isChecked;
            if (!isChecked) {
                $('.info-speed-wrapper').hide();
            } else {
                $('.info-speed-wrapper').show();
            }
            break;

        case 'toggle-stops-above-buses':
            settings['toggle-stops-above-buses'] = isChecked;

            const zOffset = isChecked ? 1000 : 0;
            for (const stopId in busStopMarkers) {
                busStopMarkers[stopId].setZIndexOffset(zOffset);
            }
            break;
        
        // Dev settings

        case 'toggle-pause-update-marker':
            console.log(`Pause update marker positions now ${isChecked ? 'ON' : 'OFF'}`);
            settings['toggle-pause-update-marker'] = isChecked;
            if (isChecked) {
                for (const busName in animationFrames) {
                    cancelAnimationFrame(animationFrames[busName]);
                    delete animationFrames[busName];
                }
                pauseUpdateMarkerPositions = true;
            } else {
                pauseUpdateMarkerPositions = false;
            }

            break;

        case 'toggle-pause-rotation-updating':
            settings['toggle-pause-rotation-updating'] = isChecked;
            console.log(`Pause rotation updating now ${isChecked ? 'ON' : 'OFF'}`);
            pauseRotationUpdating = isChecked;
            break;

        case 'toggle-whole-pixel-positioning':
            console.log(`Whole pixel positioning is now ${isChecked ? 'ON' : 'OFF'}`);
            settings['toggle-whole-pixel-positioning'] = isChecked;
            wholePixelPositioning = isChecked
            break;

        case 'toggle-pause-passio-polling':
            console.log(`Pause Passio Polling is now ${isChecked ? 'ON' : 'OFF'}`);
            settings['toggle-pause-passio-polling'] = isChecked;
            break;

        case 'toggle-disconnect-rubus':
            console.log(`Disconnect from RUBus WSS is now ${isChecked ? 'ON' : 'OFF'}`);
            break;

        case 'toggle-show-stop-polygons':
            console.log(`Show Stop Polygons is now ${isChecked ? 'ON' : 'OFF'}`);

            if (Object.keys(polygons).length === 0) {
                makePolygons();
            }
            togglePolygons(isChecked)
            settings['toggle-show-stop-polygons'] = isChecked;
            break;

        case 'toggle-show-dev-options':
            settings['toggle-show-dev-options'] = isChecked;
            break;

        case 'toggle-show-etas-in-seconds':
            console.log(`Show ETAs in seconds is now ${isChecked ? 'ON' : 'OFF'}`);
            settings['toggle-show-etas-in-seconds'] = isChecked;
            showETAsInSeconds = isChecked;
            if (popupBusName && !busData[popupBusName].overtime) popInfo(popupBusName);

            if (isChecked) {
                countdownInterval = setInterval(() => {

                    if (popupBusName && !busData[popupBusName].overtime) {
                        const step = (window.sim === true) ? Math.max(1, (window.SIM_TIME_MULTIPLIER || 1)) : 1;
                        $('.next-stop-eta').each(function() {
                            let text = $(this).text();
                            // Check for "Xm Xs" format
                            let matchMinutes = text.match(/(\d+)m\s+(\d+)s/);
                            // Check for "Xs" format
                            let matchSeconds = text.match(/^(\d+)s$/);
                            
                            if (matchMinutes) {
                                let minutes = parseInt(matchMinutes[1]);
                                let seconds = parseInt(matchMinutes[2]);
                                let total = minutes * 60 + seconds;
                                total = Math.max(0, total - step);
                                const newM = Math.floor(total / 60);
                                const newS = total % 60;
                                $(this).text(newM > 0 ? `${newM}m ${newS}s` : `${newS}s`);
                            } else if (matchSeconds) {
                                let seconds = parseInt(matchSeconds[1]);
                                const next = Math.max(0, seconds - step);
                                $(this).text(`${next}s`);
                            }
                        });
                    }
 
                }, 1000);
            } else {
                if (countdownInterval) {
                    clearInterval(countdownInterval);
                }
            }

            break;

        case 'toggle-show-bus-progress':
            settings['toggle-show-bus-progress'] = isChecked;
            break;

        case 'toggle-show-bus-overtime-timer':
            settings['toggle-show-bus-overtime-timer'] = isChecked;

            if (!isChecked) {
                stopOvertimeCounter();
            } else if (popupBusName && busData[popupBusName]['overtime']) {
                startOvertimeCounter(popupBusName);
            }

            break;

        case 'toggle-show-bus-names':
            console.log(`Show bus names on map is now ${isChecked ? 'ON' : 'OFF'}`);
            settings['toggle-show-bus-names'] = isChecked;
            updateBusNameTooltips();
            break;

        case 'toggle-show-bus-path':
            settings['toggle-show-bus-path'] = isChecked;

            if (!isChecked) {
                for (const busName in midpointCircle) {
                    midpointCircle[busName].removeFrom(map)
                }
            }

            break;

        case 'toggle-launch-fireworks-button':
            settings['toggle-launch-fireworks-button'] = isChecked;

            if (isChecked) {
                $('.launch-fireworks-wrapper').show();
            } else {
                $('.launch-fireworks-wrapper').hide();
            }
            break;

        case 'toggle-show-campus-switcher':
            settings['toggle-show-campus-switcher'] = isChecked;
            if (isChecked) {
                $('.campus-switcher').show();
            } else {
                $('.campus-switcher').hide();
            }
            break;

        case 'toggle-hide-other-routes':
            settings['toggle-hide-other-routes'] = isChecked;
            updateSegFocusNotice();

            if (!isChecked && popupBusName) {
                // Remove distance line if it was showing
                removeDistanceLineOnFocus();
                showAllPolylines();
                showAllBuses();
                map.flyTo(savedCenter, savedZoom, {animate: false});
                savedCenter = null;
                savedZoom = null;
            } else if (isChecked && popupBusName) {
                focusBus(popupBusName);
            }

            break;

            // implement logic here to hide/show other routes if bus already selected: if (popupBus)...

        case 'toggle-show-bus-log':
            settings['toggle-show-bus-log'] = isChecked;

            if (isChecked) {
                $('.bus-log-wrapper').show();
            } else {
                $('.bus-log-wrapper').hide();
            }
            break;
        
        case 'toggle-show-extra-bus-data':
            settings['toggle-show-extra-bus-data'] = isChecked;

            if (isChecked) {
                $('.bus-data-extra').show();
            } else {
                $('.bus-data-extra').hide();
            }
            break;

        case 'toggle-show-stop-id':
            settings['toggle-show-stop-id'] = isChecked;
            break;

        case 'toggle-show-knight-mover':
            settings['toggle-show-knight-mover'] = isChecked;

            isChecked ? $('.knight-mover').show() : $('.knight-mover').hide();
            break;

        case 'toggle-polyline-padding':
            settings['toggle-polyline-padding'] = isChecked;
            reapplyPolylineRenderers(isChecked
                ? 'settings-toggle-polyline-padding-on'
                : 'settings-toggle-polyline-padding-off');
            break;

        case 'toggle-offscreen-bus-indicators':
            settings['toggle-offscreen-bus-indicators'] = isChecked;
            if (isChecked) {
                $('.offscreen-indicators-dependent').removeClass('disabled');
            } else {
                $('.offscreen-indicators-dependent').addClass('disabled');
            }
            if (typeof requestOffScreenUpdate === 'function') {
                requestOffScreenUpdate();
            }
            break;

        case 'toggle-offscreen-bus-indicators-above-gui':
            settings['toggle-offscreen-bus-indicators-above-gui'] = isChecked;
            if (typeof updateOffScreenContainerZIndex === 'function') {
                updateOffScreenContainerZIndex();
            }
            if (typeof requestOffScreenUpdate === 'function') {
                requestOffScreenUpdate();
            }
            break;

        case 'toggle-offscreen-bus-indicators-select-on-tap':
            settings['toggle-offscreen-bus-indicators-select-on-tap'] = isChecked;
            break;

        case 'toggle-show-invalid-etas':
            settings['toggle-show-invalid-etas'] = isChecked;
            if (isChecked && popupBusName) { // doesn't work for some reason
                $('.info-next-stops, .next-stops-grid').show(); // if a negative eta is already selected (thus hidden) when this setting is being enabled
            }
            break;

        case 'toggle-show-rotation-points':
            settings['toggle-show-rotation-points'] = isChecked;
            for (const busName in busRotationPoints) {
                ['pt1', 'pt2', 'line'].forEach(val => {
                    busRotationPoints[busName][val].setStyle({'opacity': isChecked ? 1 : 0})
                })
            }
            break;

        case 'toggle-allow-iphone-preload':
            settings['toggle-allow-iphone-preload'] = isChecked;

            if (isChecked) {
                $('.toggle-polyline-padding-unavailable').html('Disablement overriden via developer!<br>Enabling this may crash your iPhone.')
                $('#toggle-polyline-padding').parent().css('pointer-events', 'all');
            } else {
                $('.toggle-polyline-padding-unavailable').text('Option unavailable on iPhone');
                $('#toggle-polyline-padding').parent().css('pointer-events', 'none');
                
                if (settings['toggle-polyline-padding']) {
                    $('#toggle-polyline-padding').click();
                }

            }

            break;

        case 'toggle-show-rubus-ai':
            settings['toggle-show-rubus-ai'] = isChecked;

            if (isChecked) {
                $('.rubus-ai-wrapper').show();
            } else {
                $('.rubus-ai-wrapper').hide();
            }
            break;

        case 'toggle-show-bus-quickness-breakdown':
            settings['toggle-show-bus-quickness-breakdown'] = isChecked;

            if (isChecked) {
                $('.bus-quickness-breakdown-wrapper').show();
            } else {
                $('.bus-quickness-breakdown-wrapper').hide();
            }
            break;

        case 'toggle-always-immediate-update':
            settings['toggle-always-immediate-update'] = isChecked;
            break;

        case 'toggle-bypass-max-distance':
            settings['toggle-bypass-max-distance'] = isChecked;
            
            if (isChecked) {
                // Disable maxBounds to allow flying to locations outside bounds
                map.setMaxBounds(null);
                if (popupStopId && Number(closestStopId) === popupStopId && (closestDistance < maxDistanceMiles || settings['toggle-bypass-max-distance'])) {
                    $('.closest-stop').show();
                } else {
                    $('.closest-stop').hide();
                }
                $('.centerme-wrapper').show(); // this not triggering?
                if (closestStopId) {
                    $('.fly-closest-stop-wrapper').show();
                }
            } else {
                // Re-enable maxBounds with the original bounds
                const newBounds = expandBounds(bounds[selectedCampus], 2);
                map.setMaxBounds(newBounds);

                if (popupStopId && Number(closestStopId) === popupStopId && closestDistance < maxDistanceMiles) {
                    $('.closest-stop').show();
                } else {
                    $('.closest-stop').hide();
                }

                if (closestDistance > maxDistanceMiles) {
                    $('.centerme-wrapper').hide();
                    $('.fly-closest-stop-wrapper').hide();
                }
            }
            break;

        case 'toggle-show-sim':
            settings['toggle-show-sim'] = isChecked;
            $('#toggle-hide-sim').prop('checked', !isChecked);

            if (isChecked && !sim && selectedCampus === 'nb') {
                $('.sim-btn').show();
            } else {
                $('.sim-btn').hide();
            }
            break;

        case 'toggle-spoofing':
            settings['toggle-spoofing'] = isChecked;
            spoof = isChecked;
            break;

        case 'toggle-show-chat':
            settings['toggle-show-chat'] = isChecked;
            if (isChecked) {
                $('.chat-btn-wrapper').show();
            } else {
                $('.chat-btn-wrapper').hide();
            }
            break;

        case 'toggle-show-thinking':
            settings['toggle-show-thinking'] = isChecked;
            if (isChecked) {
                $('.chat-thinking-wrapper').show();
            } else {
                $('.chat-thinking-wrapper').hide();
            }
            break;

        

        case 'toggle-always-show-second':
            settings['toggle-always-show-second'] = isChecked;

            // if (isChecked) {
            //     $('.stop-info-show-next-loop').hide();
            //     $('.stop-info-next-loop-wrapper').show();
            // } else {
            //     $('.stop-info-next-loop-wrapper').hide();
            //     $('.always-show-next-loop').hide();
            // }

            break;

        case 'toggle-show-bike-racks':
            settings['toggle-show-bike-racks'] = isChecked;
            if (isChecked) {
                showBikeRacks();
            } else {
                hideBikeRacks();
            }
            break;

        case 'toggle-show-road-network':
            console.log(`Show Road Network is now ${isChecked ? 'ON' : 'OFF'}`);
            settings['toggle-show-road-network'] = isChecked;
            if (isChecked) {
                loadAndDisplayRoadNetwork();
            } else {
                if (roadNetworkLayer) {
                    map.removeLayer(roadNetworkLayer);
                    roadNetworkLayer = null;
                }
                showNavigationMessage('Road network hidden');
            }
            break;

        case 'toggle-distances-line-on-focus':
            console.log(`Distances Line on Focus is now ${isChecked ? 'ON' : 'OFF'}`);
            settings['toggle-distances-line-on-focus'] = isChecked;
            updateSegFocusNotice();
            
            // If the setting is being turned off and a bus is currently focused,
            // remove the distance line and restore the route polyline layer.
            if (!isChecked && popupBusName) {
                removeDistanceLineOnFocus();
                try {
                    const route = busData[popupBusName].route;
                    if (polylines[route] && !map.hasLayer(polylines[route])) {
                        polylines[route].addTo(map);
                    }
                    if (polylines[route]) {
                        polylines[route].setStyle({ opacity: 1 });
                    }
                } catch (_) {}
            }
            // If the setting is being turned on and a bus is currently focused,
            // show the distance line and remove the route polyline layer.
            else if (isChecked && popupBusName) {
                showDistanceLineOnFocus(popupBusName);
                try {
                    const route = busData[popupBusName].route;
                    if (polylines[route] && map.hasLayer(polylines[route])) {
                        logPolylineRemoval(route, 'settings-toggle-distances-line-on-focus');
                        polylines[route].removeFrom(map);
                    }
                } catch (_) {}
            }
            break;

        case 'toggle-disable-fireworks-on-open':
            // console.log(`Disable Fireworks on Open is now ${isChecked ? 'ON' : 'OFF'}`);
            settings['toggle-disable-fireworks-on-open'] = isChecked;
            break;

        case 'toggle-show-depot-poly':
            console.log(`Show Depot Poly is now ${isChecked ? 'ON' : 'OFF'}`);
            settings['toggle-show-depot-poly'] = isChecked;
            if (isChecked) {
                map.addLayer(depotLayer);
            } else {
                map.removeLayer(depotLayer);
            }
            break;

        case 'toggle-pause-stop-eta-updates':
            settings['toggle-pause-stop-eta-updates'] = isChecked;
            break;

        case 'toggle-show-capacity':
            console.log(`Show Capacity is now ${isChecked ? 'ON' : 'OFF'}`);
            settings['toggle-show-capacity'] = isChecked;
            if (isChecked) {
                $('.info-capacity-mid').removeClass('none').show();
            } else {
                $('.info-capacity-mid').hide();
            }
            break;

        case 'toggle-always-show-break-overdue':
            console.log(`Always Show Break Overdue is now ${isChecked ? 'ON' : 'OFF'}`);
            settings['toggle-always-show-break-overdue'] = isChecked;
            break;

        case 'toggle-settings-btn-end':
            console.log(`Settings Button at End is now ${isChecked ? 'ON' : 'OFF'}`);
            settings['toggle-settings-btn-end'] = isChecked;
            // Repopulate route selectors to apply the new position
            populateRouteSelectors(activeRoutes);
            break;

        case 'toggle-show-alerts-other-campuses':
            settings['toggle-show-alerts-other-campuses'] = isChecked;
            refreshAlertsDisplay();
            break;

        case 'toggle-force-show-polylines':
            settings['toggle-force-show-polylines'] = isChecked;
            if (isChecked) {
                $('.force-show-dependent').removeClass('disabled');
                applyForceShowState();
            } else {
                $('.force-show-dependent').addClass('disabled');
                revertForceShowState();
            }
            break;

        case 'toggle-force-show-stops':
            settings['toggle-force-show-stops'] = isChecked;
            if (isChecked) {
                applyForceShowStops();
            } else {
                revertForceShowStops();
            }
            break;

        default:
            console.log(`Unknown toggle changed: ${toggleId}`);
            break;
    }

    localStorage.setItem('settings', JSON.stringify(settings));

});

let countdownInterval;

$(document).ready(function() {

    // Untoggle if the switch is not one that gets saved in settings (like some of the dev ones)
    $('.dev-options-wrapper .toggle-input').each(function() {
        const toggleId = $(this).attr('id');
        if (!(toggleId in defaultSettings) && !toggleId.startsWith('force-show-')) {
            $(this).prop('checked', false);
        }
    });

    if (!settings['toggle-show-bus-speeds']) {
        $('.info-speed-wrapper').hide();
    }

    if (!settings['toggle-show-capacity']) {
        $('.info-capacity-mid').hide();
    } else {
        $('.info-capacity-mid').removeClass('none').show();
    }

    if (settings['toggle-show-depot-poly']) {
        map.addLayer(depotLayer);
    }

    if (settings['toggle-show-stop-polygons']) {
        makePolygons();
        togglePolygons(true);
    }

    if (settings['toggle-show-dev-options']) {
        toggleDevOptions();
    }

    if (settings['toggle-force-show-polylines']) {
        $('.force-show-dependent').removeClass('disabled');
    }

    if (settings['toggle-offscreen-bus-indicators']) {
        $('.offscreen-indicators-dependent').removeClass('disabled');
    } else {
        $('.offscreen-indicators-dependent').addClass('disabled');
    }

    if (settings['toggle-show-etas-in-seconds']) {
        showETAsInSeconds = settings['toggle-show-etas-in-seconds'];

        // Start countdown timer for ETAs
        countdownInterval = setInterval(() => {

            if (popupBusName && !busData[popupBusName].overtime) { // && !busData[popupBusName].at_stop
                const step = (window.sim === true) ? Math.max(1, (window.SIM_TIME_MULTIPLIER || 1)) : 1;
                $('.next-stop-eta').each(function() {
                    let text = $(this).text();
                    // Check for "Xm Xs" format
                    let matchMinutes = text.match(/(\d+)m\s+(\d+)s/);
                    // Check for "Xs" format
                    let matchSeconds = text.match(/^(\d+)s$/);
                    
                    let ETAText;

                    if (matchMinutes) {
                        let minutes = parseInt(matchMinutes[1]);
                        let seconds = parseInt(matchMinutes[2]);
                        let total = minutes * 60 + seconds;
                        total = Math.max(0, total - step);
                        const newM = Math.floor(total / 60);
                        const newS = total % 60;
                        ETAText = (newM > 0 ? `${newM}m ${newS}s` : `${newS}s`);
                    } else if (matchSeconds) {
                        let seconds = parseInt(matchSeconds[1]);
                        const next = Math.max(0, seconds - step);
                        ETAText = (`${next}s`);
                    }

                    $(this).text(ETAText)

                    $(`[stop-eta="${$(this).attr('data-stop-id')}"]`).text(ETAText);

                });
            }

            if ($('.all-stops-inner').is(':visible')) {
                updateTimeToStops(Object.keys(busData));
                populateAllStops();
            }

        }, 1000);

        // Clear interval when setting is turned off
        if (!showETAsInSeconds) {
            clearInterval(countdownInterval);
        }
    }

    if (settings['toggle-launch-fireworks-button']) {
        $('.launch-fireworks-wrapper').show();
    }

    if (settings['toggle-show-bus-log']) {
        $('.bus-log-wrapper').show();
    }

    if (settings['toggle-show-extra-bus-data']) {
        $('.bus-data-extra').show();
    }

    if (settings['toggle-show-knight-mover']) {
        $('.knight-mover').show();
    }

    if (settings['toggle-allow-iphone-preload']) {
        $('.toggle-polyline-padding-unavailable').html('Disablement overriden via developer!<br>Enabling this may crash your app.')
        $('#toggle-polyline-padding').parent().css('pointer-events', 'all');
    }

    if (settings['toggle-show-rubus-ai']) {
        $('.rubus-ai-wrapper').show();
    }

    if (settings['toggle-show-sim'] && !sim && selectedCampus === 'nb') {
        $('.sim-btn').show();
    }

    if (settings['toggle-spoofing']) {
        spoof = true;
    }

    if (settings['toggle-show-chat']) {
        $('.chat-btn-wrapper').show();
    }

    if (settings['toggle-show-campus-switcher']) {
        $('.campus-switcher').show();
    }

    if (settings['toggle-show-bike-racks']) {
        showBikeRacks();
    }

    if (settings['toggle-show-road-network']) {
        loadAndDisplayRoadNetwork();
    }
});

let polygons = {}

function makePolygons() {

    for (const stopId in stopsData) {
        const stop = stopsData[stopId];

        const polygonCoordinates = stop.polygon.map(coord => [
            coord[1],
            coord[0]
        ]);

        const polygon = L.polygon(polygonCoordinates, {
            color: 'blue',
            fillColor: 'blue',
            fillOpacity: 0.5
        })

        polygons[stopId] = polygon;

        // polygon.on('click', () => {
        //     alert(`Stop Name: ${stop.name}`);
        // });
    }
}

function updateSegFocusNotice() {
    const focusEnabled = settings['toggle-hide-other-routes'];
    const notice = document.getElementById('segFocusNotice');
    if (!notice) return;

    // Check if the parent setting row ("Traveling Seg on Focus") is hidden by search filter
    const $parentRow = $('#toggle-distances-line-on-focus').closest('.flex');
    if ($parentRow.length && !$parentRow.is(':visible')) {
        notice.style.display = 'none';
        return;
    }

    notice.style.display = focusEnabled ? 'none' : '';
}

updateSegFocusNotice();

function togglePolygons(show) {

    for (const stopId in polygons) {
        const polygon = polygons[stopId];
        
        if (show) {
            polygon.addTo(map);
        } else {
            polygon.removeFrom(map);
        }
    }
}

// Settings search filter logic
$(function() {
    const $searchInput = $('#settings-search-input');
    const $clearBtn = $('.settings-search-clear');

    window.filterSettings = function(query, isExpanding) {
        query = query.trim().toLowerCase();

        if (query.length > 0) {
            $clearBtn.show();
        } else {
            $clearBtn.hide();
        }

        // Filter sections within settings-list
        $('.settings-list .settings-section-accent').each(function() {
            const $section = $(this);
            const $header = $section.prev('.bold-500');
            let sectionHasMatch = false;

            const children = $section.children().toArray();
            for (let i = 0; i < children.length; i++) {
                const $item = $(children[i]);
                if (!$item.is('div')) continue;

                // Handle nested dependent/explanation containers
                if ($item.hasClass('offscreen-indicators-dependent')) {
                    let depHasMatch = false;
                    const depChildren = $item.children('div').toArray();
                    for (let j = 0; j < depChildren.length; j++) {
                        const $depItem = $(depChildren[j]);
                        const isExplain = $depItem.attr('class') && $depItem.attr('class').includes('explain');
                        const itemText = $depItem.text().toLowerCase();
                        const selfMatches = query !== '' && itemText.includes(query);

                        if (query === '') {
                            if (!isExplain) {
                                $depItem.show();
                            }
                        } else {
                            let nextExplainMatches = false;
                            if (j + 1 < depChildren.length && $(depChildren[j + 1]).is('div')) {
                                const $next = $(depChildren[j + 1]);
                                if ($next.attr('class') && $next.attr('class').includes('explain')) {
                                    if ($next.text().toLowerCase().includes(query)) {
                                        nextExplainMatches = true;
                                    }
                                }
                            }

                            if (isExplain) {
                                if (selfMatches) {
                                    depHasMatch = true;
                                }
                            } else {
                                if (selfMatches || nextExplainMatches) {
                                    $depItem.show();
                                    depHasMatch = true;
                                } else {
                                    $depItem.hide();
                                }
                            }
                        }
                    }

                    if (query === '') {
                        $item.hide();
                    } else if (depHasMatch) {
                        $item.show();
                        sectionHasMatch = true;
                        // Find preceding toggle row (skipping explanation boxes and notice elements)
                        for (let p = i - 1; p >= 0; p--) {
                            const $pElem = $(children[p]);
                            if ($pElem.is('div')) {
                                const pClass = $pElem.attr('class') || '';
                                if (!pClass.includes('explain') && !pClass.includes('unavailable') && !pClass.includes('settings-notice')) {
                                    $pElem.show();
                                    break;
                                }
                            }
                        }
                    } else {
                        $item.hide();
                    }
                    continue;
                }

                const className = $item.attr('class') || '';
                // Skip notices such as "Option unavailable on iPhone" or "settings-notice"
                if (className.includes('unavailable') || className.includes('settings-notice')) {
                    if (query !== '') {
                        $item.hide();
                    }
                    continue;
                }

                // Check if this item is an explanation box (contains 'explain')
                const isExplain = className.includes('explain');
                const itemText = $item.text().toLowerCase();
                const selfMatches = query !== '' && itemText.includes(query);

                if (query === '') {
                    // Reset to default layout visibility (toggles shown, explanations retain CSS/slide state or default hidden if unused)
                    if (!isExplain) {
                        $item.show();
                    }
                } else {
                    let nextExplainMatches = false;

                    // If next element is an explanation box that matches (skipping notice elements)
                    for (let n = i + 1; n < children.length; n++) {
                        const $next = $(children[n]);
                        if (!$next.is('div')) continue;
                        const nClass = $next.attr('class') || '';
                        if (nClass.includes('unavailable') || nClass.includes('settings-notice')) continue;

                        if (nClass.includes('explain')) {
                            if ($next.text().toLowerCase().includes(query)) {
                                nextExplainMatches = true;
                            }
                        }
                        break; // Stop looking after the first non-notice div
                    }

                    if (isExplain) {
                        if (selfMatches) {
                            sectionHasMatch = true;
                        }
                    } else {
                        if (selfMatches || nextExplainMatches) {
                            $item.show();
                            sectionHasMatch = true;
                        } else {
                            $item.hide();
                        }
                    }
                }
            }

            if (query === '' || sectionHasMatch) {
                $section.show();
                if ($header.length) $header.show();
            } else {
                $section.hide();
                if ($header.length) $header.hide();
            }
        });

        // Filter Developer options section
        const $devHead = $('.dev-options-head');
        const $devWrapper = $('.dev-options-wrapper');
        if ($devWrapper.length) {
            $devHead.show();
            const shouldFilterDev = $devWrapper.is(':visible') || isExpanding;
            if (shouldFilterDev) {
                $devWrapper.find('.flex, .settings-map-renderer, .settings-polyline-renderer, .settings-bus-positioning, .settings-reset-settings, .settings-reset-location, .force-show-dependent').each(function() {
                    const $item = $(this);
                    if ($item.hasClass('force-show-dependent')) return; // handled separately below

                    const text = $item.text().toLowerCase();
                    if (query === '' || text.includes(query)) {
                        $item.show();
                    } else {
                        $item.hide();
                    }
                });

                // Special handling for force-show-polylines section
                const $forceShowMainRow = $('#toggle-force-show-polylines').closest('.flex');
                const $forceShowDep = $('.force-show-dependent');
                const $routeOptions = $('.force-show-option');
                let forceRouteMatch = false;

                if (query !== '') {
                    $routeOptions.each(function() {
                        const routeText = $(this).text().toLowerCase();
                        if (routeText.includes(query)) {
                            forceRouteMatch = true;
                        }
                    });
                }

                if (query === '' || forceRouteMatch) {
                    $routeOptions.show();
                    if (forceRouteMatch) {
                        $forceShowMainRow.show();
                        $forceShowDep.show();
                        $forceShowDep.find('.force-show-stops-row').show();
                        $forceShowDep.find('.force-show-polylines-container').show();
                    }
                } else {
                    $routeOptions.show();
                }

                // Update segFocusNotice visibility based on parent toggle row visibility
                updateSegFocusNotice();
            } else {
                // If collapsed and not expanding, restore internal item visibility so they are ready
                $devWrapper.find('.flex, .settings-map-renderer, .settings-polyline-renderer, .settings-bus-positioning, .settings-reset-settings, .settings-reset-location, .force-show-dependent, .force-show-option').show();
            }
        }
    }

    const isDesktopDevice = typeof isDesktop !== 'undefined' ? isDesktop : $(window).width() > 992;
    if (isDesktopDevice) {
        $searchInput.attr('placeholder', 'Search settings... (Ctrl + K)');
    }

    let settingsSearchDebounce = null;
    $searchInput.on('input', function() {
        const query = $(this).val();
        filterSettings(query);

        clearTimeout(settingsSearchDebounce);
        const trimmed = query.trim();
        if (trimmed.length > 0) {
            settingsSearchDebounce = setTimeout(function() {
                sa_event('settings_search', {
                    'query': trimmed
                });
            }, 500);
        }
    }).on('keydown', function(e) {
        if (e.key === 'Enter') {
            $(this).blur();
        }
    });

    $clearBtn.on('click', function() {
        sa_event('btn_press', {
            'btn': 'settings_search_clear'
        });
        $searchInput.val('');
        filterSettings('');
        $searchInput.focus();
    });

    // Mobile keyboard visualViewport handling for floating search bar
    let settingsVvpHandler = null;
    let settingsViewportAttached = false;

    function adjustSettingsFloatingBar() {
        const isMobile = $(window).width() <= 992;
        if (isMobile && window.visualViewport && $('.settings-panel').is(':visible')) {
            const vvp = window.visualViewport;
            const keyboardHeight = Math.max(0, window.innerHeight - vvp.height - vvp.offsetTop);
            $('.settings-floating-bar').css('bottom', (16 + keyboardHeight) + 'px');
            $('.settings-panel').css('padding-bottom', (100 + keyboardHeight) + 'px');
        } else {
            $('.settings-floating-bar').css('bottom', '');
            $('.settings-panel').css('padding-bottom', '');
        }
    }

    window.attachSettingsViewportListeners = function() {
        if (settingsViewportAttached) return;
        settingsViewportAttached = true;
        settingsVvpHandler = () => requestAnimationFrame(adjustSettingsFloatingBar);
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', settingsVvpHandler);
        }
        window.addEventListener('resize', settingsVvpHandler);
    };

    window.detachSettingsViewportListeners = function() {
        if (!settingsViewportAttached) return;
        settingsViewportAttached = false;
        if (window.visualViewport && settingsVvpHandler) {
            window.visualViewport.removeEventListener('resize', settingsVvpHandler);
        }
        if (settingsVvpHandler) {
            window.removeEventListener('resize', settingsVvpHandler);
        }
        settingsVvpHandler = null;
        $('.settings-floating-bar').css('bottom', '');
        $('.settings-panel').css('padding-bottom', '');
    };

    $searchInput.on('focus', function() {
        attachSettingsViewportListeners();
        adjustSettingsFloatingBar();
    }).on('blur', function() {
        detachSettingsViewportListeners();
    });

    // Custom Tile URL settings handler
    if (settings && settings['custom-tile-url']) {
        $('#custom-tile-url-input').val(settings['custom-tile-url']);
    }

    function sanitizeTileUrl(url) {
        if (!url) return '';
        url = url.trim();

        // Check if it's a Mapbox API style URL (preview html, wmts, or style link)
        const mapboxStyleRegex = /mapbox\.com\/styles\/v1\/([^\/]+)\/([^\/?#]+)/i;
        const match = url.match(mapboxStyleRegex);

        if (match) {
            const username = match[1];
            const styleId = match[2];
            
            // Extract access token if present
            const tokenMatch = url.match(/access_token=([^&#]+)/i);
            const tokenParam = tokenMatch ? `?access_token=${tokenMatch[1]}` : '';

            // Return clean Leaflet raster tile URL
            return `https://api.mapbox.com/styles/v1/${username}/${styleId}/tiles/256/{z}/{x}/{y}@2x${tokenParam}`;
        }

        return url;
    }

    function showTileStatus(message, isError) {
        const $status = $('#custom-tile-url-status');
        $status.stop(true, true).css({
            color: isError ? '#ef4444' : '#10b981',
            display: 'block',
            opacity: 1
        }).html(message);

        setTimeout(function() {
            $status.fadeOut(1000);
        }, 3000);
    }

    function applyCustomTileUrl(rawUrl, isClearing) {
        const url = sanitizeTileUrl(rawUrl);

        if (url) {
            settings['custom-tile-url'] = url;
            $('#custom-tile-url-input').val(url);
            
            if (rawUrl && rawUrl !== url) {
                showTileStatus('<i class="fa-solid fa-circle-check mr-0p5rem"></i>Converted & applied Mapbox tile URL!', false);
            } else {
                showTileStatus('<i class="fa-solid fa-circle-check mr-0p5rem"></i>Custom tile URL applied!', false);
            }
        } else {
            delete settings['custom-tile-url'];
            $('#custom-tile-url-input').val('');
            if (isClearing) {
                showTileStatus('<i class="fa-solid fa-rotate-left mr-0p5rem"></i>Reset to default tiles.rubus.live tiles', false);
            } else if (rawUrl) {
                showTileStatus('<i class="fa-solid fa-circle-xmark mr-0p5rem"></i>Invalid tile URL pattern', true);
            }
        }
        localStorage.setItem('settings', JSON.stringify(settings));

        // Animate apply button feedback
        const $btn = $('#apply-custom-tile-url-btn');
        const origText = $btn.text();
        $btn.text('Applied!').css('background', '#10b981');
        setTimeout(function() {
            $btn.text(origText).css('background', '');
        }, 1500);

        if (typeof tileLayer !== 'undefined' && tileLayer && typeof currentTileLayerType !== 'undefined' && currentTileLayerType === 'streets') {
            let theme = settings['theme'] || 'streets-v11';
            if (typeof resolveMapTileStyle === 'function') {
                theme = resolveMapTileStyle(theme);
            }
            if (typeof getTileUrlPattern === 'function') {
                tileLayer.setUrl(getTileUrlPattern(theme));
            }
        }
    }

    $('#apply-custom-tile-url-btn').on('click', function() {
        const val = $('#custom-tile-url-input').val();
        applyCustomTileUrl(val, false);
    });

    $('#clear-custom-tile-url-btn').on('click', function() {
        $('#custom-tile-url-input').val('');
        applyCustomTileUrl('', true);
    });

    $('#custom-tile-url-input').on('keypress', function(e) {
        if (e.which === 13) {
            applyCustomTileUrl($(this).val());
        }
    });
});