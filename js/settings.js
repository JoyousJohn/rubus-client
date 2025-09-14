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
                for (const busId in animationFrames) {
                    cancelAnimationFrame(animationFrames[busId]);
                    delete animationFrames[busId];
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

            if (isChecked) {
                countdownInterval = setInterval(() => {

                    if (popupBusId && !busData[popupBusId].overtime) {
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

        case 'toggle-show-bus-id':
            console.log(`Show Bus IDs is now ${isChecked ? 'ON' : 'OFF'}`);
            settings['toggle-show-bus-id'] = isChecked;
            showBusId = isChecked;
            
            if (showBusId && popupBusId) {
                $('.info-name-mid').text(`${$('.info-name-mid').text()} (${popupBusId}) | `)
            }

            break;

        case 'toggle-show-bus-progress':
            settings['toggle-show-bus-progress'] = isChecked;
            break;

        case 'toggle-show-bus-overtime-timer':
            settings['toggle-show-bus-overtime-timer'] = isChecked;

            if (!isChecked) {
                stopOvertimeCounter();
            } else if (popupBusId && busData[popupBusId]['overtime']) {
                startOvertimeCounter(popupBusId);
            }

            break;

        case 'toggle-show-bus-path':
            settings['toggle-show-bus-path'] = isChecked;

            if (!isChecked) {
                for (const busId in midpointCircle) {
                    midpointCircle[busId].removeFrom(map)
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

            if (!isChecked && popupBusId) {
                // Remove distance line if it was showing
                removeDistanceLineOnFocus();
                showAllPolylines();
                showAllBuses();
                map.flyTo(savedCenter, savedZoom, {animate: false});
                savedCenter = null;
                savedZoom = null;
            } else if (isChecked && popupBusId) {
                focusBus(popupBusId);
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

            if (isChecked) {
                for (const routeName in polylines) {
                    const polyline = polylines[routeName];
                    polyline.removeFrom(map);
                    polyline.setStyle({
                        renderer: L.svg({ padding: 1.0 })
                    });
                    polyline.addTo(map);
                }
            } else {
                for (const routeName in polylines) {
                    const polyline = polylines[routeName];
                    polyline.removeFrom(map);
                    polyline.setStyle({
                        renderer: undefined
                    });
                    polyline.addTo(map);
                }
            }
            break;

        case 'toggle-show-invalid-etas':
            settings['toggle-show-invalid-etas'] = isChecked;
            if (isChecked && popupBusId) { // doesn't work for some reason
                $('.info-next-stops, .next-stops-grid').show(); // if a negative eta is already selected (thus hidden) when this setting is being enabled
            }
            break;

        case 'toggle-show-rotation-points':
            settings['toggle-show-rotation-points'] = isChecked;
            for (const busId in busRotationPoints) {
                ['pt1', 'pt2', 'line'].forEach(val => {
                    busRotationPoints[busId][val].setStyle({'opacity': isChecked ? 1 : 0})
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

        // case 'toggle-show-sim':
        //     settings['toggle-show-sim'] = isChecked;

        //     if (isChecked && !sim && selectedCampus === 'nb') {
        //         $('.sim-btn').show();
        //     } else {
        //         $('.sim-btn').hide();
        //     }
        //     break;

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

            if (isChecked) {
                $('.stop-info-show-next-loop').hide();
                $('.stop-info-next-loop-wrapper').show();
            } else {
                $('.stop-info-show-next-loop').show();
            }

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
            
            // If the setting is being turned off and a bus is currently focused,
            // remove the distance line and restore the route polyline layer.
            if (!isChecked && popupBusId) {
                removeDistanceLineOnFocus();
                try {
                    const route = busData[popupBusId].route;
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
            else if (isChecked && popupBusId) {
                showDistanceLineOnFocus(popupBusId);
                try {
                    const route = busData[popupBusId].route;
                    if (polylines[route] && map.hasLayer(polylines[route])) {
                        polylines[route].removeFrom(map);
                    }
                } catch (_) {}
            }
            break;

        case 'toggle-disable-fireworks-on-open':
            // console.log(`Disable Fireworks on Open is now ${isChecked ? 'ON' : 'OFF'}`);
            settings['toggle-disable-fireworks-on-open'] = isChecked;
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
        if (!(toggleId in defaultSettings)) {
            $(this).prop('checked', false);
        }
    });

    if (!settings['toggle-show-bus-speeds']) {
        $('.info-speed-wrapper').hide();
    }

    if (settings['toggle-show-stop-polygons']) {
        makePolygons();
        togglePolygons(true);
    }

    if (settings['toggle-show-dev-options']) {
        toggleDevOptions();
    }

    if (settings['toggle-show-etas-in-seconds']) {
        showETAsInSeconds = settings['toggle-show-etas-in-seconds'];

        // Start countdown timer for ETAs
        countdownInterval = setInterval(() => {

            if (popupBusId && !busData[popupBusId].overtime) { // && !busData[popupBusId].at_stop
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

    if (settings['toggle-show-bus-id']) {
        showBusId = settings['toggle-show-bus-id'];
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

    // if (settings['toggle-show-sim'] && selectedCampus === 'nb') {
    //     $('.sim-btn').show();
    // }

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