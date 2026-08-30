let sharedBusName;

function checkShared() {

    const urlParams = new URLSearchParams(window.location.search);
    const busName = urlParams.get('bus');

    if (busName && busData[busName]) {

        sharedBusName = busName;

        setTimeout(() => { // otherwise Failed to find popup or reach target zoom after multiple attempts
            flyToBus(sharedBusName);

            const $shared = $('.shared');
            $shared.empty();
            $shared.append(document.createTextNode('Shared'));
            const $sharedSpan = $('<span class="bold-500"></span>').text(busData[sharedBusName].route.toUpperCase());
            $shared.append($sharedSpan);
            $shared.click(function() {
                if (shownRoute && shownRoute !== busData[sharedBusName].route) {
                    toggleRoute(busData[sharedBusName].route);
                }
                if (!popupBusName || popupBusName !== sharedBusName) { // kind of pointless because popup wrapper should be covering this button anyway... might ot if I change GUIs later, also have o see what this looks like on desktop/finalize it
                    flyToBus(sharedBusName);
                }
            })
            .css('display', 'flex');
            $shared.find('span').css('color', (typeof escapeCssColor === 'function' ? escapeCssColor(colorMappings[busData[sharedBusName].route] || '#000') : (colorMappings[busData[sharedBusName].route] || '#000')));

        }, 0);

    } else if (busName && !busData[busName]) {
        $('.shared').html(`Shared bus no longer in service!`).css('display', 'flex')
        setTimeout(() => {
            $('.shared').html(`Shared bus no longer in service!`).slideUp();
        }, 5000);
    }

}