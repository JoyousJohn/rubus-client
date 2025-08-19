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
        // checkMinRoutes();
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

$(function() {
    function updateCampusCarouselTheme() {
        const theme = document.documentElement.getAttribute('theme');
        $('.campus-carousel-img').each(function() {
            const $img = $(this);
            $img.attr('src', $img.data(theme));
        });
    }
    let campusCarouselUserInteracted = false;
    function centerItem($selected) {
        if (typeof isDesktop !== 'undefined' && isDesktop) return; // Do not scroll on desktop
        if (campusCarouselUserInteracted) return; // Skip if user interacted
        const $carousel = $('.campus-carousel');
        const carouselOffset = $carousel.offset().left;
        const currentScroll = $carousel.scrollLeft();
        const itemOffset = $selected.offset().left; // relative to doc
        const itemWidth = $selected.outerWidth();
        const carouselWidth = $carousel.innerWidth();
        const targetScrollLeft = (itemOffset - carouselOffset + currentScroll) + (itemWidth / 2) - (carouselWidth / 2);
        $carousel.stop(true).animate({ scrollLeft: targetScrollLeft }, 150);
    }

    function centerItemInstant($selected) {
        if (typeof isDesktop !== 'undefined' && isDesktop) return; // Do not scroll on desktop
        const $carousel = $('.campus-carousel');
        const carouselOffset = $carousel.offset().left;
        const currentScroll = $carousel.scrollLeft();
        const itemOffset = $selected.offset().left; // relative to doc
        const itemWidth = $selected.outerWidth();
        const carouselWidth = $carousel.innerWidth();
        const targetScrollLeft = (itemOffset - carouselOffset + currentScroll) + (itemWidth / 2) - (carouselWidth / 2);
        const prevBehavior = $carousel.css('scroll-behavior');
        $carousel.css('scroll-behavior', 'auto');
        $carousel.scrollLeft(targetScrollLeft);
        // Restore previous behavior
        if (prevBehavior) { $carousel.css('scroll-behavior', prevBehavior); }
    }

    // Expose centering function globally to be called when modal is shown
    window.centerCampusCarouselToNB = function() {
        if (typeof isDesktop !== 'undefined' && isDesktop) return; // No scroll on desktop
        if (!$('.campus-modal').is(':visible')) return; // Only when modal visible
        if (campusCarouselUserInteracted) return; // Respect user interaction
        const $nb = $(`.campus-carousel-item[data-campus="nb"]`);
        requestAnimationFrame(() => centerItem($nb));
    }

    window.centerCampusCarouselToNBInstant = function() {
        if (typeof isDesktop !== 'undefined' && isDesktop) return; // No scroll on desktop
        campusCarouselUserInteracted = false; // Reset flag before showing
        const $nb = $(`.campus-carousel-item[data-campus="nb"]`);
        const $carousel = $('.campus-carousel');
        const carouselOffset = $carousel.offset().left;
        const currentScroll = $carousel.scrollLeft();
        const itemOffset = $nb.offset().left; // relative to doc
        const itemWidth = $nb.outerWidth();
        const carouselWidth = $carousel.innerWidth();
        const targetScrollLeft = (itemOffset - carouselOffset + currentScroll) + (itemWidth / 2) - (carouselWidth / 2);
        const prevBehavior = $carousel.css('scroll-behavior');
        $carousel.css('scroll-behavior', 'auto');
        $carousel.scrollLeft(targetScrollLeft);
        if (prevBehavior) { $carousel.css('scroll-behavior', prevBehavior); }
    }
    function setCampusHeaderBold(campus) {
        // Unbold all campus labels, then bold only the selected one
        $('.campus-carousel-label').css('font-weight', '');
        $(`.campus-carousel-item[data-campus="${campus}"] .campus-carousel-label`).css('font-weight', 'bold');
    }
    function selectCampusCarousel(campus, animate = true) {
        $('.campus-carousel-item').removeClass('selected');
        const $selected = $(`.campus-carousel-item[data-campus="${campus}"]`).addClass('selected');
        setCampusHeaderBold(campus);
        if (animate && !(typeof isDesktop !== 'undefined' && isDesktop) && !campusCarouselUserInteracted) {
            centerItem($selected);
            const onTransitionEnd = (e) => {
                if (e.target !== $selected[0]) { return; }
                $selected.off('transitionend', onTransitionEnd);
                centerItem($selected);
            };
            $selected.on('transitionend', onTransitionEnd);
            setTimeout(() => {
                $selected.off('transitionend', onTransitionEnd);
                centerItem($selected);
            }, 500);
        }
        if (window.settings) {
            settings['campus'] = campus;
        } else {
            window.settings = window.settings || {};
            settings['campus'] = campus;
        }
    }
    updateCampusCarouselTheme();
    const observer = new MutationObserver(updateCampusCarouselTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['theme'] });
    $('.campus-carousel-item').on('click touchend', function() {
        const campus = $(this).data('campus');
        selectCampusCarousel(campus);
    });
    // Mark when user interacts so auto-centering won't fight scrolling
    $('.campus-carousel').on('mousedown touchstart wheel scroll', function() {
        campusCarouselUserInteracted = true;
    });
    // Default: NB centered perfectly after initial paint
    const initialCampus = (window.settings && settings['campus']) || 'nb';
    const $initialSelected = $(`.campus-carousel-item[data-campus="${initialCampus}"]`);
    $initialSelected.css({
        'transition': 'none',  // Ensure no transition
        'transform': 'scale(1)',  // Directly set to selected scale
        'opacity': '1',
        'z-index': '2'  // Add other selected styles as needed
    });
    selectCampusCarousel(initialCampus, false);  // This will add the class without triggering animation
    // If the modal is already visible (e.g., shown programmatically), center NB now
    if ($('.campus-modal').is(':visible')) {
        window.centerCampusCarouselToNB();
    }
    // Always center NB on initial load
    const $nb = $(`.campus-carousel-item[data-campus="nb"]`);
    if (!isDesktop) {
        requestAnimationFrame(() => {
            centerItem($nb);
            requestAnimationFrame(() => {
                $initialSelected.css('transition', '');  // Re-enable transitions for future interactions
            });
        });
    }
    // On initial load, set the header bold for the initial campus
    setCampusHeaderBold(initialCampus);
    window.confirmCampusSelection = function() {
        localStorage.setItem('settings', JSON.stringify(settings));
        campusChanged();
        // Always center the New Brunswick campus before hiding the modal
        const $nb = $(`.campus-carousel-item[data-campus="nb"]`);
        if (!isDesktop) {
            centerItem($nb);
        }
        $('.campus-modal').fadeOut();
    };
});

