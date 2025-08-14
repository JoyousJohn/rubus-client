let stopsData = {};

const bounds = {}

const southWestNB = L.latLng(40.4550081,-74.4957839);
const northEastNB = L.latLng(40.538852,-74.4074799);
bounds['nb'] = L.latLngBounds(southWestNB, northEastNB);

const southWestNewark = L.latLng(40.72830473203244, -74.19679900094992);
const northEastNewark = L.latLng(40.75999587082813, -74.15914562436703);
bounds['newark'] = L.latLngBounds(southWestNewark, northEastNewark);

const southWestCamden = L.latLng(39.9435316360729, -75.12674520209694);
const northEastCamden = L.latLng(39.95393446111752, -75.11690207643721);
bounds['camden'] = L.latLngBounds(southWestCamden, northEastCamden);

const views = {
    'nb': [40.507476,-74.4541267],
    'newark': [40.7416473,-74.1771307],
    'camden': [39.9484037,-75.1401906]
}

function deleteAllStops() {
    for (const stopId in busStopMarkers) {
        busStopMarkers[stopId].remove();
    }
    busStopMarkers = {};
}

function deleteBusMarkers() {
    for (const busId in busMarkers) {
        busMarkers[busId].remove();
    }
    busMarkers = {};
}

function deleteAllPolylines() {
    for (const polyline in polylines) {
        polylines[polyline].remove();
    }
    polylines = {};
}


function cleanupOldMap() {
    deleteAllStops();
    clearRouteSelectors();
    deleteBusMarkers();
    busData = {};
    console.log(busData)
    // need to delete busData before polylines, otherwise new fetch bus data call would think last bus went OoS and would throw error trying to remove polyline
    deleteAllPolylines();
    hideInfoBoxes();

    returningToSavedView = false;
    savedCenter = null;
    savedZoom = null;
}

async function makeNewMap() {
    const newBounds = expandBounds(bounds[selectedCampus], 2)
    map.setMaxBounds(newBounds).setView(views[selectedCampus], 14) 

    activeRoutes.clear(); // only used to avoid having to call populateRouteSelectors below to trigger const newRoutes = pollActiveRoutes.difference(activeRoutes); in pre.js. doesn't affect addstopstoMap bc we're padding isInitial true to fetchBusData
    await fetchETAs();
    await fetchBusData(false, true);
    fetchWhere();
    addStopsToMap();
    // setPolylines(activeRoutes);
}


function campusChanged() {

    $('.updating-buses').show();

    selectedCampus = settings['campus']
    try { if (typeof setSelectedCampusButton === 'function') { setSelectedCampusButton(selectedCampus); } } catch (_) {}
    console.log(`campus changed to ${selectedCampus}`)
    stopsData = allStopsData[selectedCampus];

    if (sim) {
        endSim();
    } else if (settings['toggle-show-sim'] && selectedCampus === 'nb') {
        $('.sim-btn').fadeIn();
    } else {
        $('.sim-btn').hide();
    }

    if (selectedCampus === 'nb') {
        checkMinRoutes();
    } else {
        $('.knight-mover, .knight-mover-mini').hide();
    }

    if (map) {
        cleanupOldMap();
        makeNewMap();
    }

    $('.updating-buses').slideUp();

}

$(function(){
    function setSelectedCampusButton(campus){
        $('.campus-toggle-btn').removeClass('selected');
        $(`.campus-toggle-btn[data-campus="${campus}"]`).addClass('selected');
    }
    // Initial selection based on current settings (defaults to nb)
    setSelectedCampusButton((window.settings && settings['campus']) || 'nb');

    // Expose so other code (e.g., campusChanged) can sync UI
    window.setSelectedCampusButton = setSelectedCampusButton;

    $('.campus-toggle-btn').on('click', function(){
        const campus = $(this).data('campus');
        if (window.settings) {
            if (settings['campus'] === campus) { return; }
            settings['campus'] = campus;
            localStorage.setItem('settings', JSON.stringify(settings));
            campusChanged();
        } else {
            window.settings = window.settings || {};
            settings['campus'] = campus;
            campusChanged();
        }
    });
});