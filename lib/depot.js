const depotPolygon = {
    type: "Polygon",
    coordinates: [[
        [-74.43221, 40.51684], [-74.42922, 40.51806],
        [-74.4286, 40.51731], [-74.4318, 40.51605],
        [-74.43221, 40.51684]
    ]]
};
  
const depotLayer = L.geoJSON(depotPolygon);

function isAtDepot(lng, lat) {
    return leafletPip.pointInLayer([lng, lat], depotLayer).length > 0;
}
  