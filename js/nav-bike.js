// js/nav-bike.js - extracted verbatim from js/map.js
function navToStop() {

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isAndroid = /Android/.test(navigator.userAgent);
    let url = '';

    const stopLat = stopsData[popupStopId].latitude
    const stopLng = stopsData[popupStopId].longitude

    if (isIOS) {
        url = `http://maps.apple.com/?daddr=${stopLat},${stopLng}&dirflg=w`;
    } else if (isAndroid) {
        url = `https://www.google.com/maps/dir/?api=1&destination=${stopLat},${stopLng}&travelmode=walking`;
    } else {
        // Fallback, use GM
        url = `https://www.google.com/maps/dir/?api=1&destination=${stopLat},${stopLng}&travelmode=walking`;
    }

    window.open(url, '_blank');

}

function navToBuilding() {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isAndroid = /Android/.test(navigator.userAgent);
    let url = '';

    if (isIOS) {
        url = `http://maps.apple.com/?daddr=${popupBuildingLatLng}&dirflg=w`;
    } else if (isAndroid) {
        url = `https://www.google.com/maps/dir/?api=1&destination=${popupBuildingLatLng}&travelmode=walking`;
    } else {
        // Fallback, use GM
        url = `https://www.google.com/maps/dir/?api=1&destination=${popupBuildingLatLng}&travelmode=walking`;
    }

    window.open(url, '_blank');
}

const BIKE_RACK_IMAGE_ID = 'bike-rack-icon';
const BIKE_RACK_SOURCE_ID = 'bike-racks-source';
const BIKE_RACK_LAYER_ID = 'bike-racks-layer';

// Raw SVG of a pink dot with a white border (and subtle shadow for contrast)
const RAW_BIKE_RACK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 11 11" width="11" height="11">`
    + `<circle cx="5.5" cy="5.8" r="4" fill="rgba(0,0,0,0.18)"/>`
    + `<circle cx="5.5" cy="5.5" r="3.5" fill="#FF4081" stroke="#FFFFFF" stroke-width="1"/>`
    + `</svg>`;

let bikeRackSpriteData = null;
let bikeRackSpriteDPR = 2;
let bikeRackSpriteLoading = false;
const bikeRackSpriteCallbacks = [];

function isBikeRacksEnabled() {
    if (typeof settings !== 'undefined' && settings && settings['toggle-show-bike-racks'] !== undefined) {
        return !!settings['toggle-show-bike-racks'];
    }
    try {
        const stored = JSON.parse(localStorage.getItem('settings') || '{}');
        return !!stored['toggle-show-bike-racks'];
    } catch (e) {
        return false;
    }
}

function prebuildBikeRackSprite() {
    if (bikeRackSpriteData || bikeRackSpriteLoading) return;
    bikeRackSpriteLoading = true;

    const img = new Image();
    img.onload = () => {
        try {
            const dpr = Math.max(2, window.devicePixelRatio || 2);
            bikeRackSpriteDPR = dpr;
            const size = 11;
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(size * dpr);
            canvas.height = Math.round(size * dpr);
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            bikeRackSpriteData = ctx.getImageData(0, 0, canvas.width, canvas.height);

            if (map && map.style && map.style._loaded && !map.hasImage(BIKE_RACK_IMAGE_ID)) {
                map.addImage(BIKE_RACK_IMAGE_ID, bikeRackSpriteData, { pixelRatio: dpr });
            }
        } catch (err) {
            console.error('[nav-bike] Failed to rasterize bike rack SVG sprite:', err);
        } finally {
            bikeRackSpriteLoading = false;
            while (bikeRackSpriteCallbacks.length > 0) {
                const cb = bikeRackSpriteCallbacks.shift();
                try { cb(); } catch (e) {}
            }
        }
    };
    img.onerror = (err) => {
        bikeRackSpriteLoading = false;
        console.error('[nav-bike] Failed to load bike rack SVG:', err);
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(RAW_BIKE_RACK_SVG);
}

// Start rasterizing immediately
prebuildBikeRackSprite();

function ensureBikeRackSprite(targetMap, callback) {
    if (!targetMap) return;

    if (targetMap.hasImage(BIKE_RACK_IMAGE_ID)) {
        if (callback) callback();
        return;
    }

    if (bikeRackSpriteData) {
        try {
            targetMap.addImage(BIKE_RACK_IMAGE_ID, bikeRackSpriteData, { pixelRatio: bikeRackSpriteDPR });
            if (callback) callback();
        } catch (e) {
            console.error('[nav-bike] addImage failed:', e);
        }
        return;
    }

    if (callback) {
        bikeRackSpriteCallbacks.push(callback);
    }

    prebuildBikeRackSprite();
}

function getBikeRacksGeoJSON(campus) {
    const features = [];
    if (bikeRacks && bikeRacks[campus]) {
        for (const category in bikeRacks[campus]) {
            const locations = bikeRacks[campus][category];
            for (let i = 0; i < locations.length; i++) {
                const loc = locations[i];
                if (Array.isArray(loc) && loc.length >= 2) {
                    features.push({
                        type: 'Feature',
                        geometry: {
                            type: 'Point',
                            coordinates: [Number(loc[0]), Number(loc[1])]
                        },
                        properties: {
                            campus: campus,
                            category: category
                        }
                    });
                }
            }
        }
    }
    return {
        type: 'FeatureCollection',
        features: features
    };
}

function hookBikeRackMapEvents(targetMap) {
    if (!targetMap || targetMap.__bikeRackEventsHooked) return;
    targetMap.__bikeRackEventsHooked = true;

    targetMap.on('style.load', () => {
        if (isBikeRacksEnabled()) {
            showBikeRacks();
        }
    });
}

function initBikeRacksOnLoad() {
    if (map) {
        hookBikeRackMapEvents(map);
        if (isBikeRacksEnabled()) {
            showBikeRacks();
        }
    }
}

// Map lifecycle listeners to ensure bike racks are added on initial load
if (typeof map !== 'undefined' && map) {
    initBikeRacksOnLoad();
} else {
    document.addEventListener('rubus-map-created', () => {
        initBikeRacksOnLoad();
    });
}

if (typeof $ !== 'undefined') {
    $(document).ready(() => {
        initBikeRacksOnLoad();
    });
}

function showBikeRacks() {
    const campus = selectedCampus || (typeof settings !== 'undefined' && settings && settings['campus']) || 'nb';

    if (!map) {
        return;
    }

    hookBikeRackMapEvents(map);

    // Layer/source creation requires style._loaded (style JSON parsed),
    // NOT map.isStyleLoaded() which also waits on external tile requests.
    if (!(map.style && map.style._loaded)) {
        map.once('style.load', () => {
            showBikeRacks();
        });
        return;
    }

    ensureBikeRackSprite(map, () => {
        if (!isBikeRacksEnabled()) {
            return;
        }

        try {
            const geojson = getBikeRacksGeoJSON(campus);
            const source = map.getSource(BIKE_RACK_SOURCE_ID);
            if (source) {
                source.setData(geojson);
            } else {
                map.addSource(BIKE_RACK_SOURCE_ID, {
                    type: 'geojson',
                    data: geojson
                });
            }

            if (map.getLayer(BIKE_RACK_LAYER_ID)) {
                map.setLayoutProperty(BIKE_RACK_LAYER_ID, 'visibility', 'visible');
                map.setPaintProperty(BIKE_RACK_LAYER_ID, 'icon-opacity', 0.7);
            } else {
                let beforeId;
                if (map.getLayer('stop-markers-layer')) {
                    beforeId = 'stop-markers-layer';
                } else if (map.getLayer('bus-markers-layer')) {
                    beforeId = 'bus-markers-layer';
                }
                map.addLayer({
                    id: BIKE_RACK_LAYER_ID,
                    type: 'symbol',
                    source: BIKE_RACK_SOURCE_ID,
                    layout: {
                        'icon-image': BIKE_RACK_IMAGE_ID,
                        'icon-size': 1,
                        'icon-allow-overlap': true,
                        'icon-ignore-placement': true,
                        'visibility': 'visible'
                    },
                    paint: {
                        'icon-opacity': 0.7
                    }
                }, beforeId);
            }

            // Clean up any legacy DOM markers if present
            if (typeof bikeRackMarkers !== 'undefined' && bikeRackMarkers && bikeRackMarkers.length > 0) {
                for (const marker of bikeRackMarkers) {
                    try { map.removeLayer(marker); } catch (e) {}
                }
                bikeRackMarkers = [];
            }

            console.log(`Added ${geojson.features.length} bike rack markers for campus: ${campus}`);
        } catch (e) {
            console.error('[nav-bike] Error showing bike racks:', e);
        }
    });
}

function hideBikeRacks() {
    if (map && map.style && map.style._loaded) {
        try {
            if (map.getLayer(BIKE_RACK_LAYER_ID)) {
                map.setLayoutProperty(BIKE_RACK_LAYER_ID, 'visibility', 'none');
            }
            const source = map.getSource(BIKE_RACK_SOURCE_ID);
            if (source) {
                source.setData({
                    type: 'FeatureCollection',
                    features: []
                });
            }
        } catch (e) {
            console.error('[nav-bike] Error hiding bike racks:', e);
        }
    }

    if (typeof bikeRackMarkers !== 'undefined' && bikeRackMarkers && bikeRackMarkers.length > 0) {
        for (const marker of bikeRackMarkers) {
            try { map.removeLayer(marker); } catch (e) {}
        }
        bikeRackMarkers = [];
    }
}

window.showBikeRacks = showBikeRacks;
window.hideBikeRacks = hideBikeRacks;
