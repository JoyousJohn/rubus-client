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
        [-74.29775, 40.51355],
        [-74.29673, 40.52337],
        [-74.27937, 40.52303],
        [-74.28267, 40.51048],
        [-74.29775, 40.51355]
    ]]
};

const depotRing = depotPolygon.coordinates[0];

function pointInPolygon(lng, lat, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [lng1, lat1] = ring[i];
        const [lng2, lat2] = ring[j];
        if (((lat1 > lat) !== (lat2 > lat)) &&
            (lng < ((lng2 - lng1) * (lat - lat1)) / (lat2 - lat1) + lng1)) {
            inside = !inside;
        }
    }
    return inside;
}

function isAtDepot(lng, lat) {
    return pointInPolygon(parseFloat(lng), parseFloat(lat), depotRing);
}

// Depot polygon display layer, wired for map.addLayer(depotLayer) /
// map.removeLayer(depotLayer) through the maplibre-compat layer wrapper.
const depotLayer = {
    removed: false,
    _styleLoadBound: false,
    _addHandler: null,
    addTo: function(targetMap) {
        depotLayer.removed = false;
        const doAdd = () => {
            if (depotLayer.removed) return;
            // addSource/addLayer throw until the style JSON is parsed
            // (Style._checkLoaded). The gate is style._loaded, NOT
            // map.isStyleLoaded() or the map 'load' event — those also wait on
            // source tile requests and can stall indefinitely on a hung
            // request, leaving the polygon never added.
            if (!(targetMap.style && targetMap.style._loaded)) return;
            try {
                const sourceId = 'depot-polygon-source';
                const fillId = 'depot-polygon-fill';
                const lineId = 'depot-polygon-line';
                if (!targetMap.getSource(sourceId)) {
                    targetMap.addSource(sourceId, { type: 'geojson', data: depotPolygon });
                }
                if (!targetMap.getLayer(fillId)) {
                    targetMap.addLayer({
                        id: fillId,
                        type: 'fill',
                        source: sourceId,
                        paint: { 'fill-color': '#4444cc', 'fill-opacity': 0.2 }
                    });
                }
                if (!targetMap.getLayer(lineId)) {
                    targetMap.addLayer({
                        id: lineId,
                        type: 'line',
                        source: sourceId,
                        paint: { 'line-color': '#4444cc', 'line-width': 2 }
                    });
                }
            } catch (e) {
                console.error('[depotLayer] failed to add source/layer', e);
            }
        };
        // Retries automatically once the style parses ('style.load' fires as
        // soon as the style JSON is applied) and on any style replacement.
        if (!depotLayer._styleLoadBound) {
            depotLayer._styleLoadBound = true;
            depotLayer._addHandler = doAdd;
            targetMap.on('style.load', doAdd);
        }
        doAdd();
    },
    remove: function() {
        depotLayer.removed = true;
        if (!map) return;
        try {
            if (depotLayer._styleLoadBound && depotLayer._addHandler) {
                map.off('style.load', depotLayer._addHandler);
                depotLayer._styleLoadBound = false;
                depotLayer._addHandler = null;
            }
            if (map.getLayer('depot-polygon-fill')) map.removeLayer('depot-polygon-fill');
            if (map.getLayer('depot-polygon-line')) map.removeLayer('depot-polygon-line');
            if (map.getSource('depot-polygon-source')) map.removeSource('depot-polygon-source');
        } catch (e) {
            console.error('[depotLayer] failed to remove layer', e);
        }
    }
};
  