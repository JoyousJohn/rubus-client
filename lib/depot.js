// center: 40.51865324653369, -74.28917724769421

// Old polygon — Rutgers bus depot:
// const depotPolygon = {
//     type: "Polygon",
//     coordinates: [[
//         [-74.43221, 40.51684], [-74.42922, 40.51806],
//         [-74.4286, 40.51731], [-74.4318, 40.51605],
//         [-74.43221, 40.51684]
//     ]]
// };

// Academy Bus depot:
const depotPolygon = {
    type: "Polygon",
    coordinates: [[
        [-74.29151, 40.52248],
        [-74.29537, 40.51537],
        [-74.28378, 40.5138],
        [-74.28258, 40.52326],
        [-74.29151, 40.52248]
    ]]
};
  
const depotLayer = L.geoJSON(depotPolygon);

function isAtDepot(lng, lat) {
    return leafletPip.pointInLayer([lng, lat], depotLayer).length > 0;
}
  