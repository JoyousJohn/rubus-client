// js/map-panout.js - extracted verbatim from js/map.js
// Global flag to track when panout feedback should be active
let panoutFeedbackActive = false;
let panoutDragHandler = null;

function clearPanoutFeedback() {
    if (panoutFeedbackActive) {
        const $btn = $('.panout');
        $btn.removeClass('btn-feedback-active');

        // Remove drag handler if it exists
        if (panoutDragHandler) {
            map.off('dragstart', panoutDragHandler);
            panoutDragHandler = null;
        }

        panoutFeedbackActive = false;
    }

    // Also clear other location button feedbacks when map moves
    clearCentermeFeedback();
    clearFlyToClosestStopFeedback();

    // Also clear fly-to-closest-stop feedback if operation is complete
    const $flyBtn = $('.fly-closest-stop');
    const hasClass = $flyBtn.hasClass('btn-feedback-active');
    const inProgress = $flyBtn.data('fly-to-closest-stop-in-progress');

    if (hasClass && !inProgress) {
        $flyBtn.removeClass('btn-feedback-active');
    }
}

function clearCentermeFeedback(force = false) {
    const $btn = $('.centerme');
    // Clear centerme feedback if we have the class and either we're not in progress OR we're forcing the clear
    if ($btn.hasClass('btn-feedback-active') && (force || (!$btn.data('location-requesting') && !$btn.data('centerme-in-progress')))) {
        $btn.removeClass('btn-feedback-active');
        // If forcing, also clear the in-progress flags
        if (force) {
            $btn.removeData('location-requesting');
            $btn.removeData('centerme-in-progress');
        }
    }
}

function clearFlyToClosestStopFeedback(force = false) {
    const $btn = $('.fly-closest-stop');
    const hasClass = $btn.hasClass('btn-feedback-active');
    const inProgress = $btn.data('fly-to-closest-stop-in-progress');

    // Clear feedback if we have the class and either we're not in progress OR we're forcing the clear
    if (hasClass && (force || !inProgress)) {
        $btn.removeClass('btn-feedback-active');
        // If forcing, also clear the in-progress flag
        if (force) {
            $btn.removeData('fly-to-closest-stop-in-progress');
        }
    }
}

function panout() {
    // Clear any existing panout feedback
    clearPanoutFeedback();
    // Clear other location button backgrounds (force clear to override in-progress states)
    clearCentermeFeedback(true);
    clearFlyToClosestStopFeedback(true);

    // Apply feedback state immediately
    $('.panout').addClass('btn-feedback-active');
    panoutFeedbackActive = true;
    
    // Set up drag handler to detect manual user dragging
    panoutDragHandler = () => {
        clearPanoutFeedback();
    };
    
    // Set up drag handler immediately - it won't interfere with fitBounds
    map.on('dragstart', panoutDragHandler);

    sa_event('btn_press', {
        'btn': 'panout'
    });

    $('[stop-eta]').text('').hide();
    savedCenter = null;
    savedView = null;
    returningToSavedView = false; // not sure if I need this, this will be so hard to trigger within 88ms. drag and then panout...

    // Check if parking permit mode is active
    if ($('body').hasClass('parking-permit-mode')) {
        // Fit map to show all currently visible parking lots
        fitMapToParkingLots();
        return;
    }

    if (shownRoute) {
        map.fitBounds(routeBounds[shownRoute]);
    } else {
        map.fitBounds(polylineBounds);
    }

    hideInfoBoxes();

    if (shownRoute) {
        updateTooltips(shownRoute);
    } else {
        showAllBuses();
        showAllPolylines();
        showAllStops();
    }

    

}

// Map tile style for a UI theme. Light-family themes share streets tiles;
// dark-family themes share dark tiles. UI chrome is handled purely by CSS vars.
function resolveMapTileStyle(theme) {
    if (!theme) return 'streets-v11';
    theme = resolveAutoTheme(theme);
    if (theme.includes('coffee')) return 'coffee';
    if (theme.includes('glamour')) return 'glamour';
    if (theme.includes('forest')) return 'forest';
    if (theme === 'dark') return 'dark-v11';
    return 'streets-v11';
}

function getTileUrlPattern(styleName) {
    if (settings && settings['custom-tile-url']) {
        return settings['custom-tile-url'];
    }
    return `https://tiles.rubus.live/styles/v1/${styleName}/tiles/{z}/{x}/{y}.png`;
}

// MapLibre has no Leaflet-style tileLayer; the raster source's tile URLs are
// updated in place. The old grid stays visible until replacement tiles load,
// and no polyline/bus/stop layers need rebuilding.
window.setMapRasterTiles = function(newUrl) {
    if (!map || typeof map.getSource !== 'function') return;
    const source = map.getSource('raster-tiles');
    if (!source || typeof source.setTiles !== 'function') {
        // Style may still be loading; apply once the source exists.
        if (map.isStyleLoaded && !map.isStyleLoaded()) {
            map.once('style.load', function() {
                window.setMapRasterTiles(newUrl);
            });
        }
        return;
    }
    const currentTiles = source.tiles || [];
    if (currentTiles[0] !== newUrl) {
        source.setTiles([newUrl]);
    }
};

// Apply theme CSS immediately; only touch the tile layer when the map style
// family actually changes. Avoids pan/zoom hacks that rebuild polylines & markers.
function changeMapStyle(newStyle) {
    console.log('changeMapStyle', newStyle);

    document.documentElement.setAttribute('theme', newStyle);

    // WebGL rubus sprites bake --theme-bus-icon-inner into the canvas, so
    // regenerate them when the theme var changes (no-op in custom DOM mode,
    // where the inner dot updates via CSS alone).
    if (typeof busLayerManager !== 'undefined') {
        busLayerManager.regenerateThemeSprites();
    }

    // Satellite mode owns its own tiles
    if (currentTileLayerType === 'satellite' || !map) {
        return;
    }

    const mapStyle = resolveMapTileStyle(newStyle);
    const newUrl = getTileUrlPattern(mapStyle);

    // setTiles keeps the old grid visible until replacement tiles load and is a
    // no-op when the URL is unchanged. Do NOT rebuild the map style — that would
    // tear down every polyline/bus/stop layer.
    setMapRasterTiles(newUrl);
    // Note: changeMapStyle only swaps light/dark streets variants; currentTileLayerType stays 'streets'

    updateBuildingColorsForTheme();
}
