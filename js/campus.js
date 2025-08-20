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

	function computeCenterScroll($carousel, $item) {
		const pos = $item.position();
		const itemCenter = pos.left + ($item.outerWidth() / 2);
		const viewportCenter = $carousel.innerWidth() / 2;
		const target = itemCenter - viewportCenter;
		console.log('[carousel] computeCenterScroll', { itemLeft: pos.left, itemWidth: $item.outerWidth(), itemCenter, viewportCenter, target });
		return Math.max(0, target);
	}

	let currentCarouselAnimCancel = null;
	function centerToItem($item, instant = false, allowDesktop = false) {
		const isDesk = (typeof isDesktop !== 'undefined' && isDesktop);
		if (isDesk && !allowDesktop) { console.log('[carousel] skip center (desktop)'); return; }
		const $carousel = $('.campus-carousel');
		const carEl = $carousel[0];
		const itemEl = $item && $item[0];
		if (!carEl || !itemEl) { console.log('[carousel] missing elements for centering'); return; }
		// Cancel any prior animations (jQuery or our own)
		$carousel.stop(true);
		if (typeof currentCarouselAnimCancel === 'function') { currentCarouselAnimCancel(); }
		const prevBehavior = $carousel.css('scroll-behavior');
		$carousel.css('scroll-behavior', 'auto');
		// Pre-centering diagnostics
		const preItem = itemEl.getBoundingClientRect();
		const preCar = carEl.getBoundingClientRect();
		const preDelta = (preItem.left + preItem.width / 2) - (preCar.left + preCar.width / 2);
		console.log('[carousel][verify] before', { preScroll: carEl.scrollLeft, preDelta });
		if (instant) {
			const delta = preDelta;
			carEl.scrollLeft += delta;
			// Post verify
			const postItem = itemEl.getBoundingClientRect();
			const postCar = carEl.getBoundingClientRect();
			const postDelta = (postItem.left + postItem.width / 2) - (postCar.left + postCar.width / 2);
			if (prevBehavior) { $carousel.css('scroll-behavior', prevBehavior); }
			console.log('[carousel] centered instantly', { from: carEl.scrollLeft - delta, appliedDelta: delta, finalScroll: carEl.scrollLeft });
			console.log('[carousel][verify] after', { postScroll: carEl.scrollLeft, postDelta, pass: Math.abs(postDelta) <= 0.6 });
			return;
		}
		// Smooth convergence using rect deltas per frame
		const epsilon = 0.6;
		const maxMs = 260;
		const start = performance.now();
		let cancelled = false;
		currentCarouselAnimCancel = () => { cancelled = true; };
		(function step() {
			if (cancelled) { if (prevBehavior) { $carousel.css('scroll-behavior', prevBehavior); } console.log('[carousel] animation cancelled'); return; }
			const now = performance.now();
			const elapsed = now - start;
			const itemRect = itemEl.getBoundingClientRect();
			const carRect = carEl.getBoundingClientRect();
			const delta = (itemRect.left + itemRect.width / 2) - (carRect.left + carRect.width / 2);
			if (Math.abs(delta) <= epsilon || elapsed >= maxMs) {
				carEl.scrollLeft += delta; // snap remaining tiny error
				if (prevBehavior) { $carousel.css('scroll-behavior', prevBehavior); }
				const postItem = itemEl.getBoundingClientRect();
				const postCar = carEl.getBoundingClientRect();
				const postDelta = (postItem.left + postItem.width / 2) - (postCar.left + postCar.width / 2);
				console.log('[carousel] animation done', { elapsed, finalScroll: carEl.scrollLeft, residual: delta });
				console.log('[carousel][verify] after', { postScroll: carEl.scrollLeft, postDelta, pass: Math.abs(postDelta) <= epsilon });
				currentCarouselAnimCancel = null;
				return;
			}
			// Move a fraction of the current delta; ease by time (easeOutCubic)
			const t = Math.min(1, elapsed / maxMs);
			const easeOut = 1 - Math.pow(1 - t, 3);
			const fraction = 0.18 + 0.22 * easeOut; // from 0.18 to ~0.4
			const stepDelta = delta * fraction;
			carEl.scrollLeft += stepDelta;
			console.log('[carousel] animation step', { elapsed, delta, stepDelta, scroll: carEl.scrollLeft });
			requestAnimationFrame(step);
		})();
	}

	// Expose one global helper to center NB instantly (used when opening the modal)
	window.centerCampusCarouselToNBInstant = function(forceDesktop = true) {
		if (forceDesktop) {
			console.log('[carousel] center NB instant trigger (forced)');
		} else if (typeof isDesktop !== 'undefined' && isDesktop) {
			console.log('[carousel] skip NB instant (desktop)');
			return;
		}
		const $nb = $(`.campus-carousel-item[data-campus="nb"]`);
		centerToItem($nb, true, /*allowDesktop*/ forceDesktop);
	}

	function setCampusHeaderBold(campus) {
		// Unbold all campus labels, then bold only the selected one
		$('.campus-carousel-label').css('font-weight', '');
		$(`.campus-carousel-item[data-campus="${campus}"] .campus-carousel-label`).css('font-weight', 'bold');
	}

	function selectCampusCarousel(campus) {
		$('.campus-carousel-item').removeClass('selected');
		const $selected = $(`.campus-carousel-item[data-campus="${campus}"]`).addClass('selected');
		setCampusHeaderBold(campus);
		if (window.settings) {
			settings['campus'] = campus;
		} else {
			window.settings = window.settings || {};
			settings['campus'] = campus;
		}
		return $selected;
	}

	updateCampusCarouselTheme();
	const observer = new MutationObserver(updateCampusCarouselTheme);
	observer.observe(document.documentElement, { attributes: true, attributeFilter: ['theme'] });

	// Prevent accidental selection when user is dragging
	let dragStartX = 0;
	let dragStartY = 0;
	let dragMoved = false;
	$('.campus-carousel')
		.on('mousedown touchstart', function(e){
			const pt = e.originalEvent.touches ? e.originalEvent.touches[0] : e;
			dragStartX = pt.clientX; dragStartY = pt.clientY; dragMoved = false;
			$(this).stop(true); // cancel ongoing jQuery animations
			if (typeof currentCarouselAnimCancel === 'function') { currentCarouselAnimCancel(); }
			console.log('[carousel] interaction start, stop animations');
		})
		.on('mousemove touchmove', function(e){
			const pt = e.originalEvent.touches ? e.originalEvent.touches[0] : e;
			if (Math.abs(pt.clientX - dragStartX) > 8 || Math.abs(pt.clientY - dragStartY) > 8) { dragMoved = true; }
		})
		.on('mouseup touchend', function(){
			console.log('[carousel] interaction end', { dragMoved });
		});

	$('.campus-carousel-item').on('click', function(e) {
		if (dragMoved) { console.log('[carousel] suppress click after drag'); return; }
		const campus = $(this).data('campus');
		const $selected = selectCampusCarousel(campus);
		console.log('[carousel] item selected (click)', campus);
		requestAnimationFrame(() => centerToItem($selected, false, /*allowDesktop*/ false));
	});
	$('.campus-carousel-item').on('touchend', function(e) {
		if (dragMoved) { console.log('[carousel] suppress tap after drag'); dragMoved = false; return; }
		const campus = $(this).data('campus');
		const $selected = selectCampusCarousel(campus);
		console.log('[carousel] item selected (tap)', campus);
		requestAnimationFrame(() => centerToItem($selected, false, /*allowDesktop*/ false));
	});

	// Default selection state
	const initialCampus = (window.settings && settings['campus']) || 'nb';
	const $initialSelected = selectCampusCarousel(initialCampus);
	$initialSelected.css({
		'transition': 'none',
		'transform': 'scale(1)',
		'opacity': '1',
		'z-index': '2'
	});
	// Re-enable transitions for future interactions on next frame
	requestAnimationFrame(() => { $initialSelected.css('transition', ''); });

	// Confirm handler
	window.confirmCampusSelection = function() {
		localStorage.setItem('settings', JSON.stringify(settings));
		campusChanged();
		$('.campus-modal').fadeOut();
	};
});

