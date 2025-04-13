let favBuses = JSON.parse(localStorage.getItem('favs')) || [];

$('.bus-star').click(function() {
    const currentBusId = popupBusId;

    if (!favBuses.includes(currentBusId)) {
        favBuses.push(currentBusId);
        $(this).find('i').css('color', 'gold').removeClass('fa-regular').addClass('fa-solid')
        const $thisFav = $(`<div class="br-1rem" data-fav-id="${currentBusId}"><span class="bold text-1p7rem" style="color: ${colorMappings[busData[currentBusId].route]}">${busData[currentBusId].route.toUpperCase()}</span>${busData[currentBusId].busName}</div>`)
        $thisFav.click(function() {
            if (busData[currentBusId]) {
                const favRoute = busData[currentBusId].route;
                if (shownRoute && shownRoute !== favRoute) {
                    toggleRoute(favRoute);
                }
                flyToBus(currentBusId);
            }
        })
        $('.favs').append($thisFav)

        busMarkers[currentBusId].getElement().querySelector('.bus-icon-inner').style.backgroundColor = 'gold';

    } else {
        favBuses = favBuses.filter(busId => busId !== currentBusId);
        $(this).find('i').css('color', 'var(--theme-color)').removeClass('fa-solid').addClass('fa-regular')
        $(`div[data-fav-id="${currentBusId}"]`).remove();
        busMarkers[currentBusId].getElement().querySelector('.bus-icon-inner').style.backgroundColor = 'white';
    }

    localStorage.setItem('favs', JSON.stringify(favBuses))
})

function populateFavs() {
    favBuses.forEach(favId => {
        if (busData[favId]) {
            const $thisFav = $(`<div class="br-1rem" data-fav-id="${favId}"><span class="bold text-1p7rem" style="color: ${colorMappings[busData[favId].route]}">${busData[favId].route.toUpperCase()}</span>${busData[favId].busName}</div>`)
            $thisFav.click(function() {
                if (busData[favId]) {
                    const favRoute = busData[favId].route;
                    if (shownRoute && shownRoute !== favRoute) {
                        toggleRoute(favRoute);
                    }
                    flyToBus(favId);
                }
            })
            $('.favs').append($thisFav)

            busMarkers[favId].getElement().querySelector('.bus-icon-inner').style.backgroundColor = 'gold';

        }
    })
}