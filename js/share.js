let sharedBus;

function checkShared() {

    const urlParams = new URLSearchParams(window.location.search);
    const busId = urlParams.get('bus');

    if (busId && busData[busId]) {

        sharedBus = busId;

        setTimeout(() => { // otherwise Failed to find popup or reach target zoom after multiple attempts
            flyToBus(sharedBus);

            $('.shared').html(`Shared<span class="bold-500">${busData[sharedBus].route.toUpperCase()}</span>`)
            .click(function() {
                if (shownRoute && shownRoute !== busData[sharedBus].route) {
                    toggleRoute(busData[sharedBus].route);
                }
                if (!popupBusId || popupBusId !== sharedBus) { // kind of pointless because popup wrapper should be covering this button anyway... might ot if I change GUIs later, also have o see what this looks like on desktop/finalize it
                    flyToBus(sharedBus);
                }
            })
            .css('display', 'flex')
            .find('span').css('color', colorMappings[busData[sharedBus].route]);

            $('.info-shared-bus').show();

        }, 0);

    }

}