$(document).ready(function() {
    $('.building-directions').click(function() {
        const normalizedName = popupBuildingName.toLowerCase();
        hideInfoBoxes();
        openNav(normalizedName, null);
    })
})

function openNav(navTo, navFrom) {

    const toBuilding = buildingIndex[navTo];

    $('.nav-to').text(toBuilding.name)

    $('.navigate-wrapper').show();

}