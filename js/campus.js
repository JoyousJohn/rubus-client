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

    selectedCampus = settings['campus']
    console.log(`campus changed to ${selectedCampus}`)
    stopsData = allStopsData[selectedCampus];

    if (map) {
        cleanupOldMap();
        makeNewMap();
    }

}