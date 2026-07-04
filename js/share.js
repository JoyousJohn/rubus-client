let sharedBusName;

function checkShared() {

    const urlParams = new URLSearchParams(window.location.search);
    const busName = urlParams.get('bus');

    if (busName && busData[busName]) {

        sharedBusName = busName;

        setTimeout(() => { // otherwise Failed to find popup or reach target zoom after multiple attempts
            flyToBus(sharedBusName);

            $('.shared').html(`Shared<span class="bold-500">${busData[sharedBusName].route.toUpperCase()}</span>`)
            .click(function() {
                if (shownRoute && shownRoute !== busData[sharedBusName].route) {
                    toggleRoute(busData[sharedBusName].route);
                }
                if (!popupBusName || popupBusName !== sharedBusName) { // kind of pointless because popup wrapper should be covering this button anyway... might ot if I change GUIs later, also have o see what this looks like on desktop/finalize it
                    flyToBus(sharedBusName);
                }
            })
            .css('display', 'flex')
            .find('span').css('color', colorMappings[busData[sharedBusName].route]);

        }, 0);

    } else if (busName && !busData[busName]) {
        $('.shared').html(`Shared bus no longer in service!`).css('display', 'flex')
        setTimeout(() => {
            $('.shared').html(`Shared bus no longer in service!`).slideUp();
        }, 5000);
    }

}