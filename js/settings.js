$('.settings-toggle .toggle-input').on('change', function () {
    const toggleId = $(this).attr('id');
    const isChecked = $(this).prop('checked');

    switch (toggleId) {

        case 'toggle-select-closest-stop':
            console.log(`Auto select closest stop ${isChecked ? 'ON' : 'OFF'}`);

            if (isChecked) {
                settings['toggle-select-closest-stop'] = true;
            } else {
                settings['toggle-select-closest-stop'] = false;
            }

            break;

        case 'toggle-show-arrival-times':
            console.log(`Show arrival times now ${isChecked ? 'ON' : 'OFF'}`);

            if (isChecked) {
                settings['toggle-show-arrival-times'] = true;
            } else {
                settings['toggle-show-arrival-times'] = false;
            }
            

        case 'toggle-pause-update-marker':
            console.log(`Pause update marker positions now ${isChecked ? 'ON' : 'OFF'}`);

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
                console.log(`Pause rotation updating now ${isChecked ? 'ON' : 'OFF'}`);
                pauseRotationUpdating = isChecked
                break;

        case 'toggle-pause-passio-polling':
            console.log(`Pause Passio Polling is now ${isChecked ? 'ON' : 'OFF'}`);
            break;

        case 'toggle-disconnect-rubus':
            console.log(`Disconnect from RUBus WSS is now ${isChecked ? 'ON' : 'OFF'}`);
            break;

        case 'toggle-show-stop-polygons':
            console.log(`Show Stop Polygons is now ${isChecked ? 'ON' : 'OFF'}`);
            break;

        default:
            console.log(`Unknown toggle changed: ${toggleId}`);
            break;
    }

    localStorage.setItem('settings', JSON.stringify(settings))

});
