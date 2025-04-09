let favBuses = JSON.parse(localStorage.getItem('favs')) || [];

$('.bus-star').click(function() {

    if (!favBuses.includes(popupBusId)) {
        favBuses.push(popupBusId);
        $(this).find('i').css('color', 'gold').removeClass('fa-regular').addClass('fa-solid')

        const $thisFav = $(`<div class="br-1rem" data-fav-id="${popupBusId}"><span class="bold text-1p7rem" style="color: ${colorMappings[busData[popupBusId].route]}">${busData[popupBusId].route.toUpperCase()}</span>${busData[popupBusId].busName}</div>`).click(function() { flyToBus(popupBusId); closeRouteMenu(); })
        $('.favs').append($thisFav)

    } else {
        favBuses = favBuses.filter(busId => busId !== popupBusId);
        $(this).find('i').css('color', 'var(--theme-color)').removeClass('fa-solid').addClass('fa-regular')
        $(`div[data-fav-id="${popupBusId}"]`).remove();
    }

    localStorage.setItem('favs', JSON.stringify(favBuses))

})

function populateFavs() {
    const favs = JSON.parse(localStorage.getItem('favs'))
    favs.forEach(favId => {
        const $thisFav = $(`<div class="br-1rem" data-fav-id="${favId}"><span class="bold text-1p7rem" style="color: ${colorMappings[busData[favId].route]}">${busData[favId].route.toUpperCase()}</span>${busData[favId].busName}</div>`).click(function() { flyToBus(favId); closeRouteMenu(); })
        $('.favs').append($thisFav)
    })
}