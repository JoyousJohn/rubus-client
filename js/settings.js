$('.settings-toggle .toggle-input').on('change', function () {
    const toggleId = $(this).attr('id');
    const isChecked = $(this).prop('checked');

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
                        $('.next-stop-eta').each(function() {
                            let text = $(this).text();
                            // Check for "Xm Xs" format
                            let matchMinutes = text.match(/(\d+)m\s+(\d+)s/);
                            // Check for "Xs" format
                            let matchSeconds = text.match(/^(\d+)s$/);
                            
                            if (matchMinutes) {
                                let minutes = parseInt(matchMinutes[1]);
                                let seconds = parseInt(matchMinutes[2]);
                                
                                if (seconds > 0) {
                                    seconds--;
                                } else if (minutes > 0) {
                                    minutes--;
                                    seconds = 59;
                                }
                                
                                $(this).text(minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`);
                            } else if (matchSeconds) {
                                let seconds = parseInt(matchSeconds[1]);
                                if (seconds > 0) {
                                    $(this).text(`${seconds - 1}s`);
                                }
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
                $('.info-name').text(`${$('.info-name').text()} (${popupBusId}) | `)
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

        case 'toggle-hide-other-routes':
            settings['toggle-hide-other-routes'] = isChecked;
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
                    polyline.setStyle({ opacity: 1 });
                }
            } else {
                for (const routeName in polylines) {
                    const polyline = polylines[routeName];
                    polyline.removeFrom(map);
                    polyline.setStyle({
                        renderer: undefined
                    });
                    polyline.setStyle({ opacity: 1 });
                }
            }
            break;

        case 'toggle-show-invalid-etas':
            settings['toggle-show-invalid-etas'] = isChecked;
            if (isChecked && popupBusId) { // doesn't work for some reason
                $('.info-next-stops, .next-stops-grid').show(); // if a negative eta is already selected (thus hidden) when this setting is being enabled
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
                        
                        if (seconds > 0) {
                            seconds--;
                        } else if (minutes > 0) {
                            minutes--;
                            seconds = 59;
                        }
                        
                        ETAText = (minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`);
                    } else if (matchSeconds) {
                        let seconds = parseInt(matchSeconds[1]);
                        if (seconds > 0) {
                            ETAText = (`${seconds - 1}s`);
                        }
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

})


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