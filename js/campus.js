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
    for (const busName in busMarkers) {
        busMarkers[busName].remove();
        // Clean up WebGL proxy
        if (typeof busLayerManager !== 'undefined') {
            busLayerManager.removeProxy(busName);
        }
    }
    busMarkers = {};

    // Remove any remaining debug path layers (busLines/midpointCircle). This
    // tears down every marker at once (sim exit, campus switch), and
    // updateMarkerPosition won't run again for these buses to clean them up.
    for (const busName in busLines) {
        removeBusPathLayers(busName);
    }
    for (const busName in midpointCircle) {
        removeBusPathLayers(busName);
    }

    // Same for the rotation debug layers (bus-rotation.js).
    for (const busName in busRotationPoints) {
        removeBusRotationPoints(busName);
    }
}

function deleteAllPolylines() {
    for (const polyline in polylines) {
        if (!polylines[polyline]) continue;
        logPolylineRemoval(polyline, 'deleteAllPolylines');
        polylines[polyline].remove();
    }
    polylines = {};
    // Reset the shared polyline bounds cache so panout/next fitBounds always
    // targets the new campus. updatePolylineBoundsIfNeeded() early-returns when
    // the set of routes with polylines is unchanged, which would otherwise leave
    // polylineBounds pointing at the previous campus (route names collide across
    // campuses, e.g. NB and Newark share names).
    polylineBounds = null;
    previousRoutesWithPolylines = new Set();
}


function cleanupOldMap() {
    hideInfoBoxes(true);
    deleteAllStops();
    clearRouteSelectors();
    deleteBusMarkers();
    busData = {};
    console.log(busData)
    // need to delete busData before polylines, otherwise new fetch bus data call would think last bus went OoS and would throw error trying to remove polyline
    deleteAllPolylines();
    hideBikeRacks(); // Clean up bike rack markers when switching campuses

    returningToSavedView = false;
    savedCenter = null;
    savedZoom = null;

    // The focused route (and its cached bounds) no longer exist on the new
    // campus. Clear it so panout/route selectors can't target stale geometry.
    shownRoute = null;
    shownBeforeRoute = null;

    // Reset all nearest-stop state so stop IDs from the previous campus can't be
    // looked up against the new campus's stopsData. `stopsData` is swapped
    // before makeNewMap() rebuilds things, and updateNearestStop() rebuilds
    // closestStopDistances for the new campus — otherwise stale stop IDs persist
    // and crash populateMeClosestStops (gui.js:2887).
    activeStops = [];
    closestStopId = null;
    closestDistance = null;
    closestStopDistances = {};
    sortedClosestStopDistances = {};
    closestStopsMap = undefined;
    $('.closest-stops-list').empty();
}

async function makeNewMap() {
    if (!settings['toggle-bypass-max-distance']) {
        const newBounds = expandBounds(bounds[selectedCampus], 2);
        map.setMaxBounds(newBounds);
    } else {
        map.setMaxBounds(null);
    }
    map.setMinZoom(settings['toggle-bypass-max-distance'] ? bypassMinZoomLevel : defaultMinZoomLevel);
    // Teleport straight to the new campus center instead of flying there.
    const campusView = views[selectedCampus] || [40.5033, -74.4521];
    map.jumpTo({ center: [campusView[1], campusView[0]], zoom: 14 });

    activeRoutes.clear(); // only used to avoid having to call populateRouteSelectors below to trigger const newRoutes = pollActiveRoutes.difference(activeRoutes); in pre.js. doesn't affect addstopstoMap bc we're padding isInitial true to fetchBusData
    await fetchETAs();
	// Precompute route bounds for all campus routes to enable immediate fits even when OOS
	try {
		await precomputeAllRouteBounds();
	} catch (e) {
		console.error('Error precomputing route bounds:', e);
	}
    await fetchBusData(false, true, true);
    fetchWhere();
    addStopsToMap();

    // Set polylines for routes that have in-service buses, then instantly fit
    // to their bounds (animate: false) — no flying across the map on switch.
    const routesWithInServiceBuses = Array.from(activeRoutes).filter(route => routeHasInServiceBuses(route));
    if (routesWithInServiceBuses.length > 0) {
        await setPolylines(new Set(routesWithInServiceBuses), { fitBounds: false });
        updatePolylineBoundsIfNeeded();
        if (polylineBounds && polylineBounds.isValid()) {
            map.fitBounds(polylineBounds, { padding: [10, 10], animate: false });
        } else {
            map.fitBounds(bounds[selectedCampus], { animate: false });
        }
    } else {
        map.fitBounds(bounds[selectedCampus], { animate: false });
    }
}


async function campusChanged() {
    const previousCampus = selectedCampus;
    const newCampus = settings['campus'];
    // True when the live map already represents this campus (e.g. first-run
    // confirm after the map was fully built behind the theme/campus modals).
    const mapAlreadyForCampus = map && previousCampus === newCampus;

    // Only flash the UPDATING toast for a real campus rebuild. campusChanged
    // also runs on every load from updateSettings() before the map exists,
    // which used to show the toast and immediately slide it up.
    if (!mapAlreadyForCampus && map) {
        $('.updating-buses').show();
    }

    selectedCampus = newCampus;
    setSelectedCampusButton(selectedCampus);
    console.log(`campus changed to ${selectedCampus}`)
    stopsData = allStopsData[selectedCampus];

    // Clear building location cache when switching campuses since coordinates are campus-specific
    clearBuildingLocationCache();

    // Re-initialize search index for the selected campus
    window.initSearchIndex();

    if (sim) {
        endSim();
    } else if (settings['toggle-show-sim']) {
        $('.sim-btn').fadeIn();
    } else {
        $('.sim-btn').hide();
    }

    if (selectedCampus === 'nb') {
        // checkMinRoutes();
    } else {
        $('.knight-mover').hide();
    }

    // Map is already populated live behind first-run modals for the default campus.
    // Only tear down stops/buses/polylines when the campus actually changes.
    if (map && !mapAlreadyForCampus) {
        cleanupOldMap();
        try {
            await makeNewMap();
        } finally {
            // Keep the UPDATING toast up until the campus buses and polylines
            // have finished fetching/adding, then hide it.
            $('.updating-buses').stop(true, true).slideUp();
        }
    }

    renderForceShowCheckboxes();

    // Update bike racks if the setting is enabled
    if (settings['toggle-show-bike-racks'] && !mapAlreadyForCampus) {
        // Small delay to ensure map is ready
        setTimeout(() => {
            showBikeRacks();
        }, 100);
    }

}

$(function(){
    function setSelectedCampusButton(campus){
        $('.campus-toggle-btn').removeClass('selected');
        $(`.campus-toggle-btn[data-campus="${campus}"]`).addClass('selected');
    }
    // Initial selection based on current settings (defaults to nb)
    setSelectedCampusButton((settings && settings['campus']) || 'nb');

    // Expose so other code (e.g., campusChanged) can sync UI
    window.setSelectedCampusButton = setSelectedCampusButton;

    $('.campus-toggle-btn').on('click', function(){
        const campus = $(this).data('campus');
        if (settings['campus'] === campus) { return; }
        settings['campus'] = campus;
        saveSettings();
        campusChanged();
    });
});

let selectedCampusModal = (typeof settings !== 'undefined' && settings && settings['campus']) || 'nb';
let _currentActiveCampusPreviewImg = 0;
let _lastPreviewCampusSrc = null;

function resolveCampusThemeMode() {
    const currentTheme = document.documentElement.getAttribute('data-selected-theme') || (typeof selectedTheme !== 'undefined' && selectedTheme) || (typeof settings !== 'undefined' && settings && settings['theme']) || 'beige-coffee';
    const resolvedTheme = (typeof resolveAutoTheme === 'function') ? resolveAutoTheme(currentTheme) : currentTheme;
    return (resolvedTheme === 'light' || (resolvedTheme && resolvedTheme.includes('coffee'))) ? 'light' : 'dark';
}

function getCampusPreviewSrc(campus) {
    const mode = resolveCampusThemeMode();
    return `img/campus-images/${campus}-${mode}.png`;
}

function updateCampusPreviewImage(campus) {
    if (!campus) campus = selectedCampusModal || 'nb';
    const newSrc = getCampusPreviewSrc(campus);

    const img0 = document.getElementById('campus-preview-img');
    const img1 = document.getElementById('campus-preview-img-next');
    if (!img0) return;
    if (!img1) {
        img0.src = newSrc;
        return;
    }

    if (!_lastPreviewCampusSrc) {
        _lastPreviewCampusSrc = img0.getAttribute('src');
    }
    if (_lastPreviewCampusSrc === newSrc) return;
    _lastPreviewCampusSrc = newSrc;

    if (_currentActiveCampusPreviewImg === 0) {
        img1.src = newSrc;
        img1.style.opacity = '1';
        img0.style.opacity = '0';
        _currentActiveCampusPreviewImg = 1;
    } else {
        img0.src = newSrc;
        img0.style.opacity = '1';
        img1.style.opacity = '0';
        _currentActiveCampusPreviewImg = 0;
    }
}

function updateCampusIndicator(campus) {
    if (!campus) {
        campus = selectedCampusModal || (typeof settings !== 'undefined' && settings && settings['campus']) || 'nb';
    }
    const indicator = document.querySelector('.campus-indicator');
    const target = document.querySelector(`.campus-option[data-campus="${campus}"]`);
    const slider = document.querySelector('.campus-slider');
    if (!indicator || !target || !slider) return;

    const options = slider.querySelectorAll('.campus-option');
    const index = Array.from(options).indexOf(target);
    const count = options.length;
    const isColumn = getComputedStyle(slider).flexDirection === 'column';

    if (isColumn) {
        indicator.style.top = `calc(${index} * (100% / ${count}) - 3px)`;
        indicator.style.height = `calc(100% / ${count} + 6px)`;
        indicator.style.left = '-3px';
        indicator.style.width = 'calc(100% + 6px)';
    } else {
        indicator.style.left = `calc(${index} * (100% / ${count}) - 3px)`;
        indicator.style.width = `calc(100% / ${count} + 6px)`;
        indicator.style.top = '-3px';
        indicator.style.height = 'calc(100% + 6px)';
    }

    const currentTheme = document.documentElement.getAttribute('data-selected-theme') || (typeof selectedTheme !== 'undefined' && selectedTheme) || (typeof settings !== 'undefined' && settings && settings['theme']) || 'beige-coffee';
    const resolved = (typeof resolveAutoTheme === 'function') ? resolveAutoTheme(currentTheme) : currentTheme;
    if (typeof themeIndicatorColorMap !== 'undefined' && themeIndicatorColorMap[resolved]) {
        indicator.style.backgroundColor = themeIndicatorColorMap[resolved].bg;
        indicator.style.boxShadow = themeIndicatorColorMap[resolved].shadow;
    }
}

function selectCampusModal(campus) {
    selectedCampusModal = campus;
    document.querySelectorAll('.campus-option').forEach(opt => opt.classList.remove('selected'));
    const target = document.querySelector(`.campus-option[data-campus="${campus}"]`);
    if (target) target.classList.add('selected');
    updateCampusIndicator(campus);
    updateCampusPreviewImage(campus);
}

function updateCampusModalTheme() {
    const campus = selectedCampusModal || (typeof settings !== 'undefined' && settings && settings['campus']) || 'nb';
    updateCampusPreviewImage(campus);
    updateCampusIndicator(campus);
}

window.selectCampusModal = selectCampusModal;
window.updateCampusModalTheme = updateCampusModalTheme;
window.updateCampusIndicator = updateCampusIndicator;

function initCampusSliderDrag() {
    const slider = document.querySelector('.campus-slider');
    const indicator = document.querySelector('.campus-indicator');
    if (!slider || !indicator) return;

    let dragging = false;
    let startX = 0;
    let didDrag = false;
    let holdTimer = null;
    let lastClosestCampus = null;

    function getOptionCenter(option) {
        return option.offsetLeft + option.offsetWidth / 2;
    }

    function getClosestCampus(clientX) {
        const sliderRect = slider.getBoundingClientRect();
        const relativeX = clientX - sliderRect.left;
        const options = slider.querySelectorAll('.campus-option');
        let closest = null;
        let minDist = Infinity;

        options.forEach(opt => {
            const center = getOptionCenter(opt);
            const dist = Math.abs(relativeX - center);
            if (dist < minDist) {
                minDist = dist;
                closest = opt;
            }
        });
        return closest;
    }

    function applyPopup() {
        if (indicator.style.top === '-6px') return;
        indicator.style.transition = 'top 0.1s ease, height 0.1s ease, left 0.1s ease, width 0.1s ease, background-color 0.3s ease, box-shadow 0.3s ease';
        indicator.style.top = '-6px';
        indicator.style.height = 'calc(100% + 12px)';
        const currentLeft = indicator.offsetLeft;
        const currentWidth = indicator.offsetWidth;
        indicator.style.left = (currentLeft - 3) + 'px';
        indicator.style.width = (currentWidth + 6) + 'px';
    }

    function snapToClosest(clientX) {
        const closest = getClosestCampus(clientX);
        if (closest) {
            indicator.style.transition = 'left 0.2s ease, width 0.2s ease, top 0.15s ease, height 0.15s ease, background-color 0.3s ease, box-shadow 0.3s ease';
            indicator.style.top = '-3px';
            indicator.style.height = 'calc(100% + 6px)';
            const campus = closest.getAttribute('data-campus');
            selectCampusModal(campus);
        }
        lastClosestCampus = null;
    }

    function shrinkBack() {
        indicator.style.transition = 'left 0.2s ease, width 0.2s ease, top 0.15s ease, height 0.15s ease, background-color 0.3s ease, box-shadow 0.3s ease';
        indicator.style.top = '-3px';
        indicator.style.height = 'calc(100% + 6px)';
        updateCampusIndicator(selectedCampusModal);
    }

    slider.addEventListener('pointerdown', function(e) {
        if (getComputedStyle(slider).flexDirection === 'column') return;

        dragging = true;
        didDrag = false;
        startX = e.clientX;
        lastClosestCampus = null;
        slider.setPointerCapture(e.pointerId);

        clearTimeout(holdTimer);
        holdTimer = setTimeout(function() {
            if (!dragging || didDrag) return;
            applyPopup();
        }, 400);
    });

    slider.addEventListener('pointermove', function(e) {
        if (!dragging) return;
        const deltaX = e.clientX - startX;
        if (Math.abs(deltaX) > 5) {
            if (!didDrag) {
                clearTimeout(holdTimer);
                applyPopup();
                indicator.style.transition = 'background-color 0.3s ease, box-shadow 0.3s ease';
            }
            didDrag = true;
        }
        if (!didDrag) return;

        const options = slider.querySelectorAll('.campus-option');
        const firstOption = options[0];
        const lastOption = options[options.length - 1];
        const minLeft = firstOption.offsetLeft - 6;
        const maxLeft = lastOption.offsetLeft - 6;

        const sliderRect = slider.getBoundingClientRect();
        const indicatorHalfWidth = indicator.offsetWidth / 2;
        let newLeft = (e.clientX - sliderRect.left) - indicatorHalfWidth;
        newLeft = Math.max(minLeft, Math.min(maxLeft, newLeft));

        indicator.style.left = newLeft + 'px';

        const closest = getClosestCampus(e.clientX);
        if (closest) {
            const campus = closest.getAttribute('data-campus');
            if (campus !== lastClosestCampus) {
                lastClosestCampus = campus;
                slider.querySelectorAll('.campus-option').forEach(opt => opt.classList.remove('selected'));
                closest.classList.add('selected');
                updateCampusPreviewImage(campus);
            }
        }
    });

    slider.addEventListener('pointerup', function(e) {
        if (!dragging) return;
        dragging = false;
        clearTimeout(holdTimer);

        if (didDrag) {
            snapToClosest(e.clientX);
        } else if (indicator.style.top === '-6px') {
            shrinkBack();
        }
    });

    slider.addEventListener('pointercancel', function(e) {
        if (!dragging) return;
        dragging = false;
        clearTimeout(holdTimer);
        if (didDrag) {
            snapToClosest(e.clientX);
        } else if (indicator.style.top === '-6px') {
            shrinkBack();
        }
    });

    slider.querySelectorAll('.campus-option').forEach(opt => {
        opt.addEventListener('pointerdown', function(e) {
            if (getComputedStyle(slider).flexDirection === 'column') return;
            const campus = opt.getAttribute('data-campus');
            if (!campus) return;

            dragging = true;
            didDrag = false;
            startX = e.clientX;
            lastClosestCampus = null;
            slider.setPointerCapture(e.pointerId);

            selectCampusModal(campus);

            const options = slider.querySelectorAll('.campus-option');
            const index = Array.from(options).indexOf(opt);
            const count = options.length;

            indicator.style.transition = 'left 0.3s ease, width 0.3s ease, top 0.15s ease, height 0.15s ease, background-color 0.3s ease, box-shadow 0.3s ease';
            indicator.style.left = `calc(${index} * (100% / ${count}) - 6px)`;
            indicator.style.width = `calc(100% / ${count} + 12px)`;
            indicator.style.top = '-6px';
            indicator.style.height = 'calc(100% + 12px)';

            clearTimeout(holdTimer);
        });
    });

    document.addEventListener('keydown', function(e) {
        const campusModal = document.querySelector('.campus-modal');
        if (!campusModal || campusModal.style.display === 'none') return;

        const isColumn = getComputedStyle(slider).flexDirection === 'column';
        const options = slider.querySelectorAll('.campus-option');
        const selected = slider.querySelector('.campus-option.selected');
        const currentIndex = Array.from(options).indexOf(selected);

        let newIndex = currentIndex;
        if (isColumn) {
            if (e.key === 'ArrowDown') newIndex = Math.min(currentIndex + 1, options.length - 1);
            else if (e.key === 'ArrowUp') newIndex = Math.max(currentIndex - 1, 0);
            else return;
        } else {
            if (e.key === 'ArrowRight') newIndex = Math.min(currentIndex + 1, options.length - 1);
            else if (e.key === 'ArrowLeft') newIndex = Math.max(currentIndex - 1, 0);
            else return;
        }

        if (newIndex === currentIndex) return;

        e.preventDefault();
        const campus = options[newIndex].getAttribute('data-campus');
        indicator.style.transition = 'left 0.2s ease, width 0.2s ease, top 0.2s ease, height 0.2s ease, background-color 0.3s ease, box-shadow 0.3s ease';
        selectCampusModal(campus);
    });
}
window.initCampusSliderDrag = initCampusSliderDrag;

window.backToThemeModal = function() {
    $('.campus-modal').hide();
    $('.theme-modal').css('display', 'flex');
    $('#theme-bg-lights').show();
    document.body.style.overflow = 'hidden';
    if (typeof updateThemeIndicator === 'function') updateThemeIndicator();
};

window.centerCampusCarouselToNBInstant = function() {
    updateCampusIndicator('nb');
};

window.confirmCampusSelection = function() {
    const isFirstTimeVisitor = !(settings && settings['campus']);
    const chosenCampus = selectedCampusModal || (settings && settings['campus']) || 'nb';
    settings['campus'] = chosenCampus;
    saveSettings();

    $('.campus-modal, #theme-bg-lights').fadeOut();
    document.body.style.overflow = '';

    if (settings['campus'] !== selectedCampus) {
        campusChanged();
    } else {
        setSelectedCampusButton(settings['campus'] || 'nb');
    }

    if (isFirstTimeVisitor && !settings['toggle-disable-fireworks-on-open'] && (typeof shouldAutoLaunchFireworks !== 'function' || shouldAutoLaunchFireworks())) {
        if (typeof launchFireworks === 'function') launchFireworks(12);
    }
};

$(function() {
    updateCampusModalTheme();
    const observer = new MutationObserver(updateCampusModalTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['theme', 'data-selected-theme'] });
    initCampusSliderDrag();
});

