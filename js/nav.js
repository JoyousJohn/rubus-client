// Global fallback minutes per stop used when ETAs are unavailable
let NAV_FALLBACK_MIN_PER_STOP = 5;

let NAV_DEBUG = true;

// Whether the directions/route panel was visible before the user focused a
// nav input — used to restore it once both inputs lose focus.
let navDirectionsWasVisibleBeforeFocus = false;
let navAnyInputFocused = false;

// Normalized from/to key of the last route that was computed and rendered.
// Lets us reshow an already-rendered (but hidden) route instead of recomputing.
let lastComputedRouteKey = null;
let lastNavFromValueOnFocus = null;
let lastNavToValueOnFocus = null;

// Route-view snapshot + reentry flags for the "<- Back to nav" button shown on
// building/stop popups opened from a navigation waypoint. Mirrors the existing
// searchReentry/searchBackActive pattern, but keeps the full route data so the
// exact same view (same route pill, stops, walks, inputs) can be re-rendered.
let navRouteSession = null; // { routeData, fromVal, toVal, scrollTop, selectedFrom/To... }
let navReentry = false;     // transient: the popup now opening came from a waypoint click
let navBackActive = false;  // persistent: the currently-visible popup offers "Back to nav"

// Pending source selection after pressing a Nav button with recent searches.
// While true, the destination (nav-to) row stays hidden and nav-from autocomplete
// shows recent searches instead of being empty.
window.navPendingSourceSelection = false;
function setNavPendingSourceSelection(pending) {
    window.navPendingSourceSelection = !!pending;
    if (!window.navPendingSourceSelection) {
        $('.nav-search-results').addClass('none').empty();
    }
}
window.setNavPendingSourceSelection = setNavPendingSourceSelection;

// Ensure robust nav-input focus helper exists even if search.js hasn't loaded yet
// (search.js defines window.focusNavInput with the same logic; keep in sync).
if (!window.focusNavInput) {
window.focusNavInput = function(selector) {
  selector = selector || '#nav-from-input';
  const el = document.querySelector(selector);
  if (!el) return;
  try { el.focus({ preventScroll: false }); } catch (e) {}
  if (document.activeElement === el) return;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (document.activeElement === el) return;
      if (el.offsetParent === null || el.disabled) {
        setTimeout(() => {
          if (document.activeElement !== el && el.offsetParent !== null && !el.disabled) {
            try { el.focus({ preventScroll: false }); } catch (e2) {}
          }
        }, 70);
        return;
      }
      try { el.focus({ preventScroll: false }); } catch (e2) {}
      if (document.activeElement !== el) {
        setTimeout(() => {
          if (document.activeElement !== el && el.offsetParent !== null && !el.disabled) {
            try { el.focus({ preventScroll: false }); } catch (e3) {}
          }
        }, 70);
      }
    });
  });
};
window.focusNavFromInput = function() { return window.focusNavInput('#nav-from-input'); };
window.focusNavToInput = function() { return window.focusNavInput('#nav-to-input'); };
}

// Helper function to get pluralized stop count
function getStopCountText(route) {
    if (!route) return 'stops';
    let count = 0;
    if (route.isTransfer) {
        const c1 = route.leg1 && route.leg1.routeDetails && route.leg1.routeDetails.stopsInOrder ? Math.max(0, route.leg1.routeDetails.stopsInOrder.length - 1) : 0;
        const c2 = route.leg2 && route.leg2.routeDetails && route.leg2.routeDetails.stopsInOrder ? Math.max(0, route.leg2.routeDetails.stopsInOrder.length - 1) : 0;
        count = c1 + c2;
    } else {
        count = Math.max(0, (route.stopsInOrder ? route.stopsInOrder.length : route.totalStops) - 1);
    }
    return count === 1 ? 'stop' : 'stops';
}

// Whether a nav route has in-service buses (green dot helper)
// Checks WKND grouped entries against both wknd/on variants and transfer routes.
function navRouteHasLiveBuses(routeName, displayName) {
    try {
        const rn = String(routeName || '').toLowerCase();
        if (rn.includes('-')) {
            const parts = rn.split('-');
            return navRouteHasLiveBuses(parts[0]) && navRouteHasLiveBuses(parts[1]);
        }
        const hasLiveViaFn = (key) => {
            if (typeof routeHasInServiceBuses === 'function') {
                return routeHasInServiceBuses(key);
            }
            // Fallback: inspect busesByRoutes/busData directly
            if (typeof busesByRoutes !== 'undefined' && typeof busData !== 'undefined' && typeof selectedCampus !== 'undefined') {
                const list = busesByRoutes[selectedCampus] && busesByRoutes[selectedCampus][key];
                return !!(list && list.some(b => busData[b] && !busData[b].oos && !busData[b].atDepot));
            }
            if (typeof busData !== 'undefined') {
                const lower = String(key).toLowerCase();
                return Object.values(busData).some(b => b && String(b.route||'').toLowerCase() === lower && !b.oos && !b.atDepot);
            }
            return false;
        };
        const dn = String(displayName || '').toUpperCase();
        if (dn.startsWith('WKND')) {
            const v = dn.replace('WKND', '').trim();
            if (v) {
                const wk = `wknd${v}`.toLowerCase();
                if (hasLiveViaFn(wk)) return true;
            }
            // Fallback to the underlying routeName if variant check found nothing
            if (routeName && hasLiveViaFn(String(routeName).toLowerCase())) return true;
            return false;
        }
        if (routeName) return hasLiveViaFn(String(routeName).toLowerCase());
        return false;
    } catch (e) { return false; }
}

// Helper to save a place to recent searches (buildings, stops, parking)
function saveRecentSearch(searchItem) {
    if (window._suppressRecentSave) return;
    if (!searchItem || !searchItem.name) return;
    if (typeof window.saveRecentSearch === 'function' && window.saveRecentSearch !== saveRecentSearch) {
        window.saveRecentSearch(searchItem);
        return;
    }
    try {
        const stored = localStorage.getItem('recentSearches');
        const recentSearches = stored ? JSON.parse(stored) : [];
        const searchItemWithTimestamp = {
            name: searchItem.name,
            category: searchItem.category || 'building',
            id: searchItem.id || undefined,
            lat: searchItem.lat !== undefined ? searchItem.lat : (searchItem.latitude !== undefined ? searchItem.latitude : undefined),
            lng: searchItem.lng !== undefined ? searchItem.lng : (searchItem.longitude !== undefined ? searchItem.longitude : undefined),
            timestamp: Date.now()
        };
        const filtered = recentSearches.filter(item => 
            !(item && item.name === searchItem.name && item.category === (searchItem.category || 'building'))
        );
        filtered.unshift(searchItemWithTimestamp);
        const limited = filtered.slice(0, 10);
        localStorage.setItem('recentSearches', JSON.stringify(limited));
    } catch(e) {}
}
window.saveRecentSearch = saveRecentSearch;

// ── Pending source selection: show recent searches in nav-from dropdown ──
function getNavRecentSearches() {
    try {
        const raw = localStorage.getItem('recentSearches');
        const arr = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(arr)) return [];
        // Filter to unique building/stop places, most recent first, like search.js
        const seen = new Set();
        const out = [];
        const sorted = arr.slice().sort((a,b)=>(b.timestamp||0)-(a.timestamp||0));
        for (const it of sorted) {
            if (!it || it.type === 'navigation') continue;
            if (!it.name || !it.category) continue;
            const key = `${it.category}:${it.name}`.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(it);
            if (out.length >= 5) break;
        }
        return out;
    } catch(e) { return []; }
}

function renderNavFromRecents() {
    const $container = $('.nav-search-results');
    if ($container.length === 0) return false;
    let recents = getNavRecentSearches();
    // Filter out the current destination (nav-to) so we don't offer navigating from same place
    try {
        const destVal = ($('#nav-to-input').val() || '').trim().toLowerCase();
        const destStopId = (typeof selectedToStop !== 'undefined' && selectedToStop) ? String(selectedToStop) : null;
        const destBuildingKey = (typeof selectedToBuilding !== 'undefined' && selectedToBuilding) ? String(selectedToBuilding).toLowerCase() : null;
        if (destVal || destStopId || destBuildingKey) {
            recents = recents.filter(it => {
                if (!it || !it.name) return false;
                const n = String(it.name).trim().toLowerCase();
                if (destVal && n === destVal) return false;
                if (it.category === 'stop' && it.id && destStopId && String(it.id) === destStopId) return false;
                if (destBuildingKey && n === destBuildingKey) return false;
                // Also compare via buildingIndex name if available
                if (destVal && it.category === 'building' && destBuildingKey && n === destBuildingKey) return false;
                return true;
            });
        }
    } catch(e) {}
    if (recents.length === 0) {
        $container.addClass('none').empty();
        return false;
    }
    $container.empty();
    currentAutocompleteIndex = -1;
    recents.forEach(item => {
        const leftIcon = '<i class="icon icon-clock-rotate-left"></i>';
        let rightTypeIcon = '';
        if (item.category === 'building') rightTypeIcon = 'icon-building';
        else if (item.category === 'parking') rightTypeIcon = 'icon-parking';
        else if (item.category === 'stop') rightTypeIcon = 'icon-bus-simple';
        const $row = $('<div class="search-result-item flex"></div>');
        $row.append(leftIcon);
        $row.append($('<div></div>').text(item.name));
        if (rightTypeIcon) {
            $row.append('<i class="icon ' + rightTypeIcon + '" style="flex-shrink:0; font-size:1.3rem; opacity:0.9;"></i>');
        } else {
            $row.append('<i class="icon icon-location-dot" style="flex-shrink:0; font-size:1.3rem; opacity:0.9;"></i>');
        }
        // TUNED — DO NOT CHANGE: 3.2rem matches main search row with visible Nav pill (see css/search.css). Keeps nav recents gap identical.
        $row.css('min-height', '3.2rem');
        $row.on('click', function(e) {
            if (e && e.stopPropagation) e.stopPropagation();
            // Use existing helpers to set source; they handle selected* vars and route calc
            if (item.category === 'stop' && item.id) {
                setNavigationFromStop(String(item.id), 'from');
            } else {
                setNavigationFromBuilding(item.name, 'from');
            }
            // Reveal destination row and clear pending flag
            window.navPendingSourceSelection = false;
            $('.nav-dest-row').removeClass('none');
            $('.nav-pill-bar').removeClass('nav-collapsed');
            $('.search-wrapper').removeClass('nav-source-hidden');
            sa_event('btn_press', { 'btn': 'nav_from_recent_selected', 'result': item.name, 'category': item.category });
            // If dest already filled, don't focus it – just blur source and let route calc show results
            const _toHasValue = ($('#nav-to-input').val() || '').trim().length > 0 || (typeof selectedToBuilding !== 'undefined' && selectedToBuilding) || (typeof selectedToStop !== 'undefined' && selectedToStop);
            if (_toHasValue) {
                $container.addClass('none').empty();
                try { $('#nav-from-input').blur(); } catch(e){}
                try { document.activeElement && document.activeElement.blur && document.activeElement.blur(); } catch(e){}
            } else {
                window._navSwitchingInputs = true;
                setTimeout(() => { window._navSwitchingInputs = false; }, 350);
                if (window.focusNavToInput) window.focusNavToInput();
                else $('#nav-to-input').focus();
                renderNavToRecents();
            }
        });
        $container.append($row);
    });
    if (typeof replaceFontAwesomeIcons === 'function') replaceFontAwesomeIcons();
    $container.removeClass('none');
    return true;
}

function renderNavToRecents() {
    const $container = $('.nav-search-results');
    if ($container.length === 0) return false;
    let recents = getNavRecentSearches();
    // Filter out the current origin (nav-from) so we don't offer navigating to the same place
    try {
        const fromVal = ($('#nav-from-input').val() || '').trim().toLowerCase();
        const fromStopId = (typeof selectedFromStop !== 'undefined' && selectedFromStop) ? String(selectedFromStop) : null;
        const fromBuildingKey = (typeof selectedFromBuilding !== 'undefined' && selectedFromBuilding) ? String(selectedFromBuilding).toLowerCase() : null;
        if (fromVal || fromStopId || fromBuildingKey) {
            recents = recents.filter(it => {
                if (!it || !it.name) return false;
                const n = String(it.name).trim().toLowerCase();
                if (fromVal && n === fromVal) return false;
                if (it.category === 'stop' && it.id && fromStopId && String(it.id) === fromStopId) return false;
                if (fromBuildingKey && n === fromBuildingKey) return false;
                if (fromVal && it.category === 'building' && fromBuildingKey && n === fromBuildingKey) return false;
                return true;
            });
        }
    } catch(e) {}
    if (recents.length === 0) {
        $container.addClass('none').empty();
        return false;
    }
    $container.empty();
    currentAutocompleteIndex = -1;
    recents.forEach(item => {
        const leftIcon = '<i class="icon icon-clock-rotate-left"></i>';
        let rightTypeIcon = '';
        if (item.category === 'building') rightTypeIcon = 'icon-building';
        else if (item.category === 'parking') rightTypeIcon = 'icon-parking';
        else if (item.category === 'stop') rightTypeIcon = 'icon-bus-simple';
        const $row = $('<div class="search-result-item flex"></div>');
        $row.append(leftIcon);
        $row.append($('<div></div>').text(item.name));
        if (rightTypeIcon) {
            $row.append('<i class="icon ' + rightTypeIcon + '" style="flex-shrink:0; font-size:1.3rem; opacity:0.9;"></i>');
        } else {
            $row.append('<i class="icon icon-location-dot" style="flex-shrink:0; font-size:1.3rem; opacity:0.9;"></i>');
        }
        // TUNED — DO NOT CHANGE: 3.2rem matches main search row with visible Nav pill (see css/search.css). Keeps nav recents gap identical.
        $row.css('min-height', '3.2rem');
        $row.on('click', function(e) {
            if (e && e.stopPropagation) e.stopPropagation();
            // Use existing helpers to set destination; they handle selected* vars and route calc
            if (item.category === 'stop' && item.id) {
                setNavigationFromStop(String(item.id), 'to');
            } else {
                setNavigationFromBuilding(item.name, 'to');
            }
            sa_event('btn_press', { 'btn': 'nav_to_recent_selected', 'result': item.name, 'category': item.category });
            // If origin already filled, don't focus it – just blur dest and let route calc show results
            const _fromHasValue = ($('#nav-from-input').val() || '').trim().length > 0 || (typeof selectedFromBuilding !== 'undefined' && selectedFromBuilding) || (typeof selectedFromStop !== 'undefined' && selectedFromStop);
            if (_fromHasValue) {
                $container.addClass('none').empty();
                try { $('#nav-to-input').blur(); } catch(e){}
                try { document.activeElement && document.activeElement.blur && document.activeElement.blur(); } catch(e){}
            } else {
                window._navSwitchingInputs = true;
                setTimeout(() => { window._navSwitchingInputs = false; }, 350);
                if (window.focusNavFromInput) window.focusNavFromInput();
                else $('#nav-from-input').focus();
                renderNavFromRecents();
            }
        });
        $container.append($row);
    });
    if (typeof replaceFontAwesomeIcons === 'function') replaceFontAwesomeIcons();
    $container.removeClass('none');
    return true;
}

window.getNavRecentSearches = getNavRecentSearches;
window.renderNavFromRecents = renderNavFromRecents;
window.renderNavToRecents = renderNavToRecents;
window.showNavFromRecents = function() {
    if (!window.navPendingSourceSelection) return false;
    return renderNavFromRecents();
};

function prepareNavFromWithRecents() {
    let _hasRecents = false;
    try {
        const _raw = localStorage.getItem('recentSearches');
        const _arr = _raw ? JSON.parse(_raw) : [];
        _hasRecents = Array.isArray(_arr) && _arr.some(it => it && it.type !== 'navigation' && it.name && it.category);
    } catch(e) { _hasRecents = false; }
    if (_hasRecents) {
        selectedFromBuilding = null;
        selectedFromStop = null;
        isSettingInputProgrammatically = true;
        $('#nav-from-input').val('').trigger('input');
        isSettingInputProgrammatically = false;
        $('#nav-from-clear-btn').hide();
        setNavPendingSourceSelection(true);
        renderNavFromRecents();
    } else {
        setNavPendingSourceSelection(false);
    }
}
window.prepareNavFromWithRecents = prepareNavFromWithRecents;

$(document).ready(function() {
    $('.building-directions').click(function(e) {
        if (e) {
            e.stopPropagation();
        }

        // Check if we have a building selected BEFORE calling hideInfoBoxes - needed?
        // if (!popupBuildingName) {
        //     showNavigationMessage('No building selected. Please click on a building first.');
        //     return;
        // }

        // Track building directions button click
        sa_event('btn_press', {
            'btn': 'building_directions',
            'building': popupBuildingName,
            'type': window._currentBuildingFeatureForStops?.category,
            'category': window._currentBuildingFeatureForStops?.category
        });

        // Store the building name before it gets cleared by hideInfoBoxes
        const currentBuildingName = popupBuildingName;

        hideInfoBoxes();
        
        // Always set the selected building as the destination
        setNavigationFromBuilding(currentBuildingName, 'to');
        openDirectionsNav();
        window.errorTracker.trackNavigationWrapperShow('Building directions button');

        prepareNavFromWithRecents();

        // Focus on the from input for user to enter their starting location
        // (programmatic focus — don't pop autocomplete for a pre-filled value).
        window._suppressNavAutocompleteOnFocus = true;
        if (window.focusNavFromInput) window.focusNavFromInput();
        else $('#nav-from-input').focus();
    });

    // Handle navigation input functionality
    setupNavigationInputs();
});

function setupNavigationInputs() {
    // Clear button functionality
    $('#nav-from-clear-btn, #nav-to-clear-btn').click(function() {
        const isFromInput = $(this).attr('id') === 'nav-from-clear-btn';
        const input = isFromInput ? $('#nav-from-input') : $('#nav-to-input');
        
        input.val('').trigger('input').focus();
        
        // Clear the selected building and stop variables
        if (isFromInput) {
            selectedFromBuilding = null;
            selectedFromStop = null;
        } else {
            selectedToBuilding = null;
            selectedToStop = null;
        }

        if (typeof updateSearchHeading === 'function') {
            updateSearchHeading();
        }
        if (typeof updateNavFavoriteStarState === 'function') {
            updateNavFavoriteStarState();
        }
        
        sa_event('btn_press', {
            'btn': isFromInput ? 'nav_from_clear' : 'nav_to_clear'
        });
    });

    // Show/hide clear buttons based on input
    function toggleNavClearButtons() {
        const fromValue = $('#nav-from-input').val().trim();
        const toValue = $('#nav-to-input').val().trim();
        
        if (fromValue) {
            $('#nav-from-clear-btn').fadeIn();
        } else {
            $('#nav-from-clear-btn').fadeOut('fast');
        }
        
        if (toValue) {
            $('#nav-to-clear-btn').fadeIn();
        } else {
            $('#nav-to-clear-btn').fadeOut('fast');
        }
    }

    // Initially hide the clear buttons
    $('#nav-from-clear-btn, #nav-to-clear-btn').hide();

    // Both bars (source + destination) are always visible in nav mode now, so
    // this is a no-op kept for callers that toggle visibility elsewhere.
    function updateNavDestRowVisibility() {
        $('.nav-dest-row').removeClass('none');
    }
    window.updateNavDestRowVisibility = updateNavDestRowVisibility;

    // Handle input changes
    $('#nav-from-input, #nav-to-input').on('input', function() {
        const input = $(this);
        const value = input.val().trim();

        if (value.length > 0) {
            input.addClass('has-value');
        } else {
            input.removeClass('has-value');
        }
        
        // Toggle clear button visibility
        toggleNavClearButtons();

        // Clear the selected building variable on manual edits only
        if (!isSettingInputProgrammatically) {
            // Only clear if the input value doesn't match the selected building (case-insensitive, trimmed)
            const inputValue = input.val().trim().toLowerCase();
            if (input.attr('id') === 'nav-from-input') {
                const b = selectedFromBuilding && typeof buildingIndex !== 'undefined' && (buildingIndex[selectedFromBuilding] || buildingIndex[selectedFromBuilding.toLowerCase()]);
                const buildingName = b ? (b.name || '').toLowerCase() : (selectedFromBuilding || '').toLowerCase();
                const stopName = selectedFromStop && typeof stopsData !== 'undefined' && stopsData[selectedFromStop]?.name?.toLowerCase();
                if (selectedFromBuilding && inputValue !== buildingName && inputValue !== String(selectedFromBuilding).toLowerCase()) {
                    selectedFromBuilding = null;
                }
                if (selectedFromStop && inputValue !== stopName && inputValue !== String(selectedFromStop).toLowerCase()) {
                    selectedFromStop = null;
                }
            } else if (input.attr('id') === 'nav-to-input') {
                const b = selectedToBuilding && typeof buildingIndex !== 'undefined' && (buildingIndex[selectedToBuilding] || buildingIndex[selectedToBuilding.toLowerCase()]);
                const buildingName = b ? (b.name || '').toLowerCase() : (selectedToBuilding || '').toLowerCase();
                const stopName = selectedToStop && typeof stopsData !== 'undefined' && stopsData[selectedToStop]?.name?.toLowerCase();
                if (selectedToBuilding && inputValue !== buildingName && inputValue !== String(selectedToBuilding).toLowerCase()) {
                    selectedToBuilding = null;
                }
                if (selectedToStop && inputValue !== stopName && inputValue !== String(selectedToStop).toLowerCase()) {
                    selectedToStop = null;
                }
            }
        }

        // If either input is empty, clear any prior route display and state
        const curFrom = ($('#nav-from-input').val() || '').trim();
        const curTo = ($('#nav-to-input').val() || '').trim();
        if (!curFrom || !curTo) {
            clearRouteDisplay();
        }

        // Reset autocomplete index when input changes
        currentAutocompleteIndex = -1;

        // Only show the autocomplete dropdown on real user input — programmatic
        // value sets (e.g. pre-filling the destination from a search result's
        // "Directions" button) shouldn't pop results while the input isn't focused.
        if (!isSettingInputProgrammatically) {
            showNavigationAutocomplete(input, value);
        }

        updateNavDestRowVisibility();
        if (typeof updateSearchHeading === 'function') {
            updateSearchHeading();
        }
        if (typeof updateNavFavoriteStarState === 'function') {
            updateNavFavoriteStarState();
        }
    });

    let lastFocusedNavInput = null;
    let _navResultsInteractionActive = false;

    // Prevent blurring the active nav input when clicking/tapping in .nav-search-results
    // (such as row gaps or padding), so results stay open and input remains focused.
    $(document).on('mousedown', '.nav-search-results', function(e) {
        if (!$(e.target).closest('button, input, select, textarea').length) {
            e.preventDefault();
            if (lastFocusedNavInput && document.activeElement !== lastFocusedNavInput) {
                try { lastFocusedNavInput.focus(); } catch (err) {}
            }
        }
    });

    $(document).on('touchstart pointerdown', '.nav-search-results', function(e) {
        if (!$(e.target).closest('.search-result-item').length) {
            _navResultsInteractionActive = true;
            setTimeout(() => { _navResultsInteractionActive = false; }, 400);
        }
    });

    $(document).on('click', '.nav-search-results', function(e) {
        if (!$(e.target).closest('.search-result-item').length) {
            if (lastFocusedNavInput && document.activeElement !== lastFocusedNavInput) {
                try { lastFocusedNavInput.focus(); } catch (err) {}
            }
        }
    });

    // Handle focus events to hide dropdowns
    $('#nav-from-input, #nav-to-input').on('focus', function() {
        lastFocusedNavInput = this;
        const input = $(this);
        const value = input.val().trim();
        const isFromInputFocus = input.attr('id') === 'nav-from-input';
        // Skip showing results for a programmatic focus (e.g. auto-focusing
        // the pre-filled destination after pressing "Directions").
        const suppress = window._suppressNavAutocompleteOnFocus;
        window._suppressNavAutocompleteOnFocus = false;
        if (value.length > 0 && !suppress) {
            showNavigationAutocomplete(input, value);
        } else if (value.length === 0) {
            // Empty input — nothing to match against, so show recent places
            // regardless of the suppress flag: a real user click into an
            // empty nav bar should always surface recents for quick picking.
            if (isFromInputFocus) {
                if (typeof renderNavFromRecents === 'function') renderNavFromRecents();
            } else {
                if (typeof renderNavToRecents === 'function') renderNavToRecents();
            }
        }

        // Remember current input values to detect unfocus without change
        lastNavFromValueOnFocus = ($('#nav-from-input').val() || '').trim();
        lastNavToValueOnFocus = ($('#nav-to-input').val() || '').trim();
        // Remember and hide the directions panel while an input is focused;
        // it's restored once both inputs lose focus. Always hide on focus —
        // the "was visible" flag is only set when the panel is actually shown,
        // so a stale focus state can't skip the hide. Must also remove .flex:
        // it comes after .none in tailwind.css, so leaving it on would override
        // the hide.
        if (!$('.nav-directions-wrapper').hasClass('none')) {
            navDirectionsWasVisibleBeforeFocus = true;
            $('.nav-directions-wrapper').removeClass('flex').addClass('none');
        }
        if ($('.nav-route-selector-container').children().length > 0) {
            $('.nav-route-selector-container').addClass('none');
        }
        $('.nav-transfer-info-banner, .nav-walk-warning-banner').addClass('none');
        $('.navigate-inner').scrollTop(0);
        navAnyInputFocused = true;
        updateNavDestRowVisibility();
    });

    // Handle blur events to hide dropdowns after a delay
    $('#nav-from-input, #nav-to-input').on('blur', function() {
        const input = $(this);

        // Delay hiding to allow clicks on dropdown items
        setTimeout(() => {
            if (window._navSwitchingInputs) {
                return;
            }
            if (_navResultsInteractionActive) {
                _navResultsInteractionActive = false;
                navAnyInputFocused = true;
                if (lastFocusedNavInput && document.activeElement !== lastFocusedNavInput) {
                    try { lastFocusedNavInput.focus(); } catch (err) {}
                }
                updateNavDestRowVisibility();
                return;
            }

            // If either nav input still has focus (e.g. the user jumped from
            // source to destination, or refocused the same input quickly),
            // don't restore the directions panel — keep it hidden while any
            // nav input is focused.
            const anyNavInputFocused = $('#nav-from-input').is(':focus') || $('#nav-to-input').is(':focus');
            if (anyNavInputFocused) {
                navAnyInputFocused = true;
                updateNavDestRowVisibility();
                return;
            }
            navAnyInputFocused = false;
            hideNavigationAutocomplete();
            // If we were pending source selection (recents under nav-from) and user unfocused nav-from without picking, reveal nav-to
            if (input.attr('id') === 'nav-from-input' && window.navPendingSourceSelection) {
                window.navPendingSourceSelection = false;
                $('.nav-dest-row').removeClass('none');
                $('.nav-pill-bar').removeClass('nav-collapsed');
                $('.search-wrapper').removeClass('nav-source-hidden');
            }
            // If inputs unchanged since focus and a route was already computed, just reshow it – don't recompute
            const curFromBlur = ($('#nav-from-input').val() || '').trim();
            const curToBlur = ($('#nav-to-input').val() || '').trim();
            const fromUnchangedBlur = curFromBlur === (lastNavFromValueOnFocus || '');
            const toUnchangedBlur = curToBlur === (lastNavToValueOnFocus || '');
            if (fromUnchangedBlur && toUnchangedBlur && lastComputedRouteKey && $('.nav-directions-wrapper').children().length > 0) {
                window.navPendingSourceSelection = false;
                $('.nav-dest-row').removeClass('none');
                $('.nav-pill-bar').removeClass('nav-collapsed');
                $('.search-wrapper').removeClass('nav-source-hidden');
            }
            updateNavDestRowVisibility();

            // Restore the directions panel only when neither input is focused and both inputs are non-empty
            if (navDirectionsWasVisibleBeforeFocus) {
                if (curFromBlur && curToBlur && $('.nav-directions-wrapper').children().length > 0) {
                    $('.nav-directions-wrapper').removeClass('none').addClass('flex');
                    $('.nav-route-selector-container').removeClass('none');
                    if (typeof updateNavInfoBanners === 'function') {
                        updateNavInfoBanners();
                    } else if (typeof updateNavTransferInfoBanner === 'function') {
                        const curRoute = navRouteSession && navRouteSession.routeData && navRouteSession.routeData.route;
                        updateNavTransferInfoBanner(curRoute);
                    }
                }
                navDirectionsWasVisibleBeforeFocus = false;
            }
        }, 200);
    });

    // Hide dropdowns when clicking outside
    $(document).on('click', function(e) {
        if (!e.target || !e.target.isConnected) return;
        if (!$(e.target).closest('.nav-from, .nav-to, .nav-pill-bar, .nav-search-results, .nav-mid-row, .nav-dest-row, .route-swap-btn').length) {
            hideNavigationAutocomplete();
        }
    });

    // Handle keyboard navigation for inputs
    $('#nav-from-input, #nav-to-input').on('keydown', function(e) {
        const isFromInput = e.target.id === 'nav-from-input';
        const resultsContainer = $('.nav-search-results');
        const resultItems = resultsContainer.find('.search-result-item');

        if (!resultsContainer.hasClass('none') && resultItems.length > 0) {
            switch(e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    currentAutocompleteIndex = Math.min(currentAutocompleteIndex + 1, resultItems.length - 1);
                    highlightAutocompleteItem(resultsContainer, currentAutocompleteIndex);
                    break;

                case 'ArrowUp':
                    e.preventDefault();
                    currentAutocompleteIndex = Math.max(currentAutocompleteIndex - 1, -1);
                    highlightAutocompleteItem(resultsContainer, currentAutocompleteIndex);
                    break;

                case 'Enter':
                    e.preventDefault();
                    if (currentAutocompleteIndex >= 0 && currentAutocompleteIndex < resultItems.length) {
                        resultItems.eq(currentAutocompleteIndex).click();
                        return;
                    } else if (resultItems.length > 0) {
                        // If no item is highlighted, select the first one
                        resultItems.first().click();
                        return;
                    }
                    break;

                case 'Escape':
                    e.preventDefault();
                    hideNavigationAutocomplete();
                    return;
            }
        }

        // Handle Enter key for navigation (only for manual entry without autocomplete selection)
        if (e.key === 'Enter') {
            e.preventDefault();
            const fromValue = $('#nav-from-input').val().trim();
            const toValue = $('#nav-to-input').val().trim();

            if (fromValue && toValue) {
                // Only trigger manually if neither building was selected from autocomplete
                // This allows users to still manually trigger calculation if they prefer
                const shouldTriggerManually =
                    (!selectedFromBuilding || $('#nav-from-input').val().trim() !== buildingIndex[selectedFromBuilding]?.name) ||
                    (!selectedToBuilding || $('#nav-to-input').val().trim() !== buildingIndex[selectedToBuilding]?.name);

                if (shouldTriggerManually) {
                    calculateRoute(fromValue, toValue);
                }
            } else if (e.target.id === 'nav-from-input' && fromValue) {
                // Only move focus to destination input if autocomplete results are visible
                // (meaning no selection was made via Enter on autocomplete)
                const unifiedResultsVisible = !$('.nav-search-results').hasClass('none');

                if (!unifiedResultsVisible) {
                    // Move focus to destination input only if no autocomplete selection was made
                    $('#nav-to-input').focus();
                }
            }
        }
    });

    // Favorite route toggle button handler
    $(document).on('click', '.route-fav-btn', function(e) {
        e.preventDefault();
        e.stopPropagation();
        if (typeof toggleCurrentNavFavorite === 'function') {
            toggleCurrentNavFavorite();
        }
    });

    if (typeof updateNavFavoriteStarState === 'function') {
        updateNavFavoriteStarState();
    }
}

function openNav(navTo, navFrom) {
    const toBuilding = buildingIndex[navTo];

    // Set destination input value if provided
    if (toBuilding) {
        $('#nav-to-input').val(toBuilding.name);
    }

    // Set start location if provided
    if (navFrom) {
        $('#nav-from-input').val(navFrom);
    }

    openDirectionsNav();
    window.errorTracker.trackNavigationWrapperShow('openNav function');
    
    // If both inputs are provided, automatically calculate the route
    if (navFrom && toBuilding) {
        // Set the selected building variables for proper routing
        selectedFromBuilding = navFrom.toLowerCase();
        selectedToBuilding = toBuilding.name.toLowerCase();
        
        // Show clear buttons
        $('#nav-from-clear-btn, #nav-to-clear-btn').fadeIn();
        
        // Calculate and display the route
        calculateRoute(navFrom, toBuilding.name);
    } else {
        // Focus on the appropriate input if not both provided
        if (navFrom) {
            if (window.focusNavInput) window.focusNavInput('#nav-to-input');
            else $('#nav-to-input').focus();
        } else {
            if (window.focusNavFromInput) window.focusNavFromInput();
            else $('#nav-from-input').focus();
        }
    }
    if (typeof updateNavFavoriteStarState === 'function') {
        updateNavFavoriteStarState();
    }
}

function triggerNavButtonFeedback($btn) {
    if (!$btn || !$btn.length) return;
    $btn.addClass('nav-btn-active');
    const existingTimer = $btn.data('_feedbackTimer');
    if (existingTimer) clearTimeout(existingTimer);
    const t = setTimeout(() => {
        $btn.removeClass('nav-btn-active');
        $btn.removeData('_feedbackTimer');
    }, 250);
    $btn.data('_feedbackTimer', t);
}
window.triggerNavButtonFeedback = triggerNavButtonFeedback;

function swapNavLocations(e) {
    if (!e && window.event) e = window.event;
    if (e && e.stopPropagation) {
        e.stopPropagation();
    }
    triggerNavButtonFeedback($('.route-swap-btn, .route-swap-button'));

    const fromInput = $('#nav-from-input');
    const toInput = $('#nav-to-input');
    const fromVal = fromInput.val().trim();
    const toVal = toInput.val().trim();

    // Swap input field values
    fromInput.val(toVal).toggleClass('has-value', !!toVal);
    toInput.val(fromVal).toggleClass('has-value', !!fromVal);

    // Swap building state
    const tempBuilding = selectedFromBuilding;
    selectedFromBuilding = selectedToBuilding;
    selectedToBuilding = tempBuilding;

    // Swap stop state
    const tempStop = selectedFromStop;
    selectedFromStop = selectedToStop;
    selectedToStop = tempStop;

    // Invalidate cached route key to force recalculation
    lastComputedRouteKey = null;

    // Update .search-heading-text
    if (typeof updateSearchHeading === 'function') {
        updateSearchHeading();
    }

    // Update clear buttons visibility
    if (toVal) {
        $('#nav-from-clear-btn').fadeIn();
    } else {
        $('#nav-from-clear-btn').fadeOut('fast');
    }
    if (fromVal) {
        $('#nav-to-clear-btn').fadeIn();
    } else {
        $('#nav-to-clear-btn').fadeOut('fast');
    }

    // Recalculate route if both locations are available
    if (toVal && fromVal) {
        calculateRoute(toVal, fromVal);
    } else {
        if (typeof clearRouteDisplay === 'function') {
            clearRouteDisplay();
        }
        if (toVal) {
            // toVal was non-empty before swap -> now in fromInput.
            // fromVal was empty before swap -> now in toInput.
            // The empty input is toInput (#nav-to-input).
            setNavPendingSourceSelection(false);
            renderNavToRecents();
            window._suppressNavAutocompleteOnFocus = true;
            if (window.focusNavInput) window.focusNavInput('#nav-to-input');
            else $('#nav-to-input').focus();
        } else if (fromVal) {
            // fromVal was non-empty before swap -> now in toInput.
            // toVal was empty before swap -> now in fromInput.
            // The empty input is fromInput (#nav-from-input).
            setNavPendingSourceSelection(true);
            renderNavFromRecents();
            window._suppressNavAutocompleteOnFocus = true;
            if (window.focusNavFromInput) window.focusNavFromInput();
            else $('#nav-from-input').focus();
        }
    }
    if (typeof updateNavFavoriteStarState === 'function') {
        updateNavFavoriteStarState();
    }
}
window.swapNavLocations = swapNavLocations;

let _savedExplicitNav = null;
let _hasRandomizedSinceSave = false;

function randomizeNavLocations(e) {
    if (!e && window.event) e = window.event;
    if (e && e.stopPropagation) {
        e.stopPropagation();
    }
    triggerNavButtonFeedback($('.route-random-btn'));

    if (!_hasRandomizedSinceSave) {
        _savedExplicitNav = {
            fromBuilding: selectedFromBuilding,
            fromStop: selectedFromStop,
            toBuilding: selectedToBuilding,
            toStop: selectedToStop,
            fromVal: $('#nav-from-input').val(),
            toVal: $('#nav-to-input').val()
        };
        _hasRandomizedSinceSave = true;
    }
    $('.route-revert-btn').removeClass('none');
    const buildingNames = Object.keys(typeof buildingIndex !== 'undefined' ? buildingIndex : {});
    const stopIds = Object.keys(typeof stopsData !== 'undefined' ? stopsData : {});
    const allPlaces = [];
    for (const key of buildingNames) {
        const b = buildingIndex[key];
        if (b && b.name) allPlaces.push({ name: b.name, category: b.category || 'building', lat: b.lat, lng: b.lng, id: b.id });
    }
    for (const id of stopIds) {
        const s = stopsData[id];
        if (s && s.name) allPlaces.push({ name: s.name, category: 'stop', lat: s.latitude, lng: s.longitude, id: id });
    }
    if (allPlaces.length < 2) return;
    let fromPlace = allPlaces[Math.floor(Math.random() * allPlaces.length)];
    let toPlace;
    let attempts = 0;
    do {
        toPlace = allPlaces[Math.floor(Math.random() * allPlaces.length)];
        attempts++;
    } while (toPlace.name === fromPlace.name && attempts < 20);
    if (!toPlace || toPlace.name === fromPlace.name) return;
    window._suppressRecentSave = true;
    isSettingInputProgrammatically = true;
    if (fromPlace.category === 'stop') {
        selectedFromStop = String(fromPlace.id);
        selectedFromBuilding = null;
        $('#nav-from-input').val(fromPlace.name);
    } else {
        selectedFromBuilding = fromPlace.name.toLowerCase();
        selectedFromStop = null;
        $('#nav-from-input').val(fromPlace.name);
    }
    if (toPlace.category === 'stop') {
        selectedToStop = String(toPlace.id);
        selectedToBuilding = null;
        $('#nav-to-input').val(toPlace.name);
    } else {
        selectedToBuilding = toPlace.name.toLowerCase();
        selectedToStop = null;
        $('#nav-to-input').val(toPlace.name);
    }
    isSettingInputProgrammatically = false;
    $('#nav-from-clear-btn').toggle(!!fromPlace.name);
    $('#nav-to-clear-btn').toggle(!!toPlace.name);
    if (typeof updateSearchHeading === 'function') {
        updateSearchHeading();
    }
    lastComputedRouteKey = null;
    calculateRoute(fromPlace.name, toPlace.name);
    if (typeof updateNavFavoriteStarState === 'function') {
        updateNavFavoriteStarState();
    }
    setTimeout(() => { window._suppressRecentSave = false; }, 600);
    sa_event('btn_press', { btn: 'randomize_nav', from: fromPlace.name, to: toPlace.name });
}
window.randomizeNavLocations = randomizeNavLocations;

function revertNavLocations() {
    if (!_savedExplicitNav) return;
    window._suppressRecentSave = true;
    isSettingInputProgrammatically = true;
    if (_savedExplicitNav.fromStop) {
        selectedFromStop = _savedExplicitNav.fromStop;
        selectedFromBuilding = null;
        $('#nav-from-input').val(_savedExplicitNav.fromVal);
    } else if (_savedExplicitNav.fromBuilding) {
        selectedFromBuilding = _savedExplicitNav.fromBuilding;
        selectedFromStop = null;
        $('#nav-from-input').val(_savedExplicitNav.fromVal);
    } else {
        selectedFromBuilding = null;
        selectedFromStop = null;
        $('#nav-from-input').val(_savedExplicitNav.fromVal || '');
    }
    if (_savedExplicitNav.toStop) {
        selectedToStop = _savedExplicitNav.toStop;
        selectedToBuilding = null;
        $('#nav-to-input').val(_savedExplicitNav.toVal);
    } else if (_savedExplicitNav.toBuilding) {
        selectedToBuilding = _savedExplicitNav.toBuilding;
        selectedToStop = null;
        $('#nav-to-input').val(_savedExplicitNav.toVal);
    } else {
        selectedToBuilding = null;
        selectedToStop = null;
        $('#nav-to-input').val(_savedExplicitNav.toVal || '');
    }
    isSettingInputProgrammatically = false;
    $('#nav-from-clear-btn').toggle(!!_savedExplicitNav.fromVal);
    $('#nav-to-clear-btn').toggle(!!_savedExplicitNav.toVal);
    if (typeof updateSearchHeading === 'function') {
        updateSearchHeading();
    }
    lastComputedRouteKey = null;
    $('.route-revert-btn').addClass('none');
    const fromName = _savedExplicitNav.fromVal;
    const toName = _savedExplicitNav.toVal;
    _savedExplicitNav = null;
    _hasRandomizedSinceSave = false;
    if (fromName && toName) {
        calculateRoute(fromName, toName);
    } else if (fromName) {
        if (window.focusNavInput) window.focusNavInput('#nav-to-input');
        else $('#nav-to-input').focus();
    } else if (toName) {
        if (window.focusNavFromInput) window.focusNavFromInput();
        else $('#nav-from-input').focus();
    }
    setTimeout(() => { window._suppressRecentSave = false; }, 600);
    if (typeof updateNavFavoriteStarState === 'function') {
        updateNavFavoriteStarState();
    }
    sa_event('btn_press', { btn: 'revert_nav', from: fromName, to: toName });
}
window.revertNavLocations = revertNavLocations;

// ==========================================
// Favorite Navigation Routes
// ==========================================
function getFavoriteNavRoutes() {
    try {
        const stored = localStorage.getItem('favoriteNavRoutes');
        return stored ? JSON.parse(stored) : [];
    } catch (e) {
        console.error('Failed to parse favoriteNavRoutes:', e);
        return [];
    }
}
window.getFavoriteNavRoutes = getFavoriteNavRoutes;

function saveFavoriteNavRoutes(routes) {
    try {
        localStorage.setItem('favoriteNavRoutes', JSON.stringify(routes || []));
    } catch (e) {
        console.error('Failed to save favoriteNavRoutes:', e);
    }
}
window.saveFavoriteNavRoutes = saveFavoriteNavRoutes;

function getNavRouteKey(fromName, toName) {
    if (!fromName || !toName) return '';
    return `${String(fromName).trim().toLowerCase()}:::${String(toName).trim().toLowerCase()}`;
}
window.getNavRouteKey = getNavRouteKey;

function isNavRouteFavorite(fromName, toName) {
    if (!fromName || !toName) return false;
    const targetKey = getNavRouteKey(fromName, toName);
    const favorites = getFavoriteNavRoutes();
    return favorites.some(fav => getNavRouteKey(fav.from, fav.to) === targetKey);
}
window.isNavRouteFavorite = isNavRouteFavorite;

function getCurrentNavPlaces() {
    const fromVal = ($('#nav-from-input').val() || '').trim();
    const toVal = ($('#nav-to-input').val() || '').trim();
    if (!fromVal || !toVal) return null;

    let fromPlace = null;
    if (selectedFromBuilding && typeof buildingIndex !== 'undefined' && buildingIndex) {
        const b = buildingIndex[selectedFromBuilding] || buildingIndex[selectedFromBuilding.toLowerCase()];
        if (b && ((b.name || '').toLowerCase() === fromVal.toLowerCase() || String(selectedFromBuilding).toLowerCase() === fromVal.toLowerCase())) {
            fromPlace = b;
        }
    } else if (selectedFromStop && typeof stopsData !== 'undefined' && stopsData && stopsData[selectedFromStop]) {
        const s = stopsData[selectedFromStop];
        if (s && ((s.name || '').toLowerCase() === fromVal.toLowerCase() || String(selectedFromStop).toLowerCase() === fromVal.toLowerCase())) {
            fromPlace = { name: s.name, lat: s.latitude, lng: s.longitude, id: parseInt(selectedFromStop, 10), category: 'stop' };
        }
    }
    if (!fromPlace && typeof resolvePlaceByName === 'function') {
        fromPlace = resolvePlaceByName(fromVal, false);
    }

    let toPlace = null;
    if (selectedToBuilding && typeof buildingIndex !== 'undefined' && buildingIndex) {
        const b = buildingIndex[selectedToBuilding] || buildingIndex[selectedToBuilding.toLowerCase()];
        if (b && ((b.name || '').toLowerCase() === toVal.toLowerCase() || String(selectedToBuilding).toLowerCase() === toVal.toLowerCase())) {
            toPlace = b;
        }
    } else if (selectedToStop && typeof stopsData !== 'undefined' && stopsData && stopsData[selectedToStop]) {
        const s = stopsData[selectedToStop];
        if (s && ((s.name || '').toLowerCase() === toVal.toLowerCase() || String(selectedToStop).toLowerCase() === toVal.toLowerCase())) {
            toPlace = { name: s.name, lat: s.latitude, lng: s.longitude, id: parseInt(selectedToStop, 10), category: 'stop' };
        }
    }
    if (!toPlace && typeof resolvePlaceByName === 'function') {
        toPlace = resolvePlaceByName(toVal, false);
    }

    if (fromPlace && toPlace) {
        return {
            fromPlace,
            toPlace,
            fromVal: fromPlace.name || fromVal,
            toVal: toPlace.name || toVal
        };
    }
    return null;
}
window.getCurrentNavPlaces = getCurrentNavPlaces;

function updateNavFavoriteStarState() {
    const $starBtn = $('.route-fav-btn');
    if (!$starBtn.length) return;

    const places = getCurrentNavPlaces();
    if (!places) {
        $starBtn.addClass('none').hide();
        return;
    }

    const isFav = isNavRouteFavorite(places.fromVal, places.toVal);
    $starBtn.removeClass('none').show();
    if (isFav) {
        $starBtn.addClass('is-favorite');
        $starBtn.attr('title', 'Remove favorite route');
        $starBtn.attr('aria-label', 'Remove favorite route');
        $starBtn.html('<i class="fa-solid fa-star"></i>');
    } else {
        $starBtn.removeClass('is-favorite');
        $starBtn.attr('title', 'Favorite this route');
        $starBtn.attr('aria-label', 'Favorite this route');
        $starBtn.html('<i class="fa-regular fa-star"></i>');
    }
    if (typeof replaceFontAwesomeIcons === 'function') {
        replaceFontAwesomeIcons();
    }
}
window.updateNavFavoriteStarState = updateNavFavoriteStarState;

function toggleCurrentNavFavorite() {
    const places = getCurrentNavPlaces();
    if (!places) return;

    const fromName = places.fromVal;
    const toName = places.toVal;
    const targetKey = getNavRouteKey(fromName, toName);
    let favorites = getFavoriteNavRoutes();
    const existingIndex = favorites.findIndex(fav => getNavRouteKey(fav.from, fav.to) === targetKey);

    if (existingIndex >= 0) {
        // Remove favorite
        favorites.splice(existingIndex, 1);
        saveFavoriteNavRoutes(favorites);
        sa_event('btn_press', { btn: 'unfavorite_nav_route', from: fromName, to: toName });
    } else {
        // Add favorite to beginning
        const newFav = {
            from: fromName,
            to: toName,
            fromPlace: {
                name: places.fromPlace.name || fromName,
                category: places.fromPlace.category || 'building',
                id: places.fromPlace.id,
                lat: places.fromPlace.lat,
                lng: places.fromPlace.lng
            },
            toPlace: {
                name: places.toPlace.name || toName,
                category: places.toPlace.category || 'building',
                id: places.toPlace.id,
                lat: places.toPlace.lat,
                lng: places.toPlace.lng
            },
            timestamp: Date.now()
        };
        favorites.unshift(newFav);
        saveFavoriteNavRoutes(favorites);
        sa_event('btn_press', { btn: 'favorite_nav_route', from: fromName, to: toName });
    }

    updateNavFavoriteStarState();
    if (typeof populateRecentSearches === 'function') {
        populateRecentSearches();
    }
}
window.toggleCurrentNavFavorite = toggleCurrentNavFavorite;

function openFavoriteNavRoute(fav) {
    if (!fav) return;
    if (typeof setNavPendingSourceSelection === 'function') {
        setNavPendingSourceSelection(false);
    }
    const fromData = fav.fromPlace || { name: fav.from, category: 'building' };
    const toData = fav.toPlace || { name: fav.to, category: 'building' };
    const fromIsStop = String(fromData.category || '').toLowerCase() === 'stop' && fromData.id;
    const toIsStop = String(toData.category || '').toLowerCase() === 'stop' && toData.id;

    if (fromIsStop && typeof setNavigationFromStop === 'function') {
        setNavigationFromStop(String(fromData.id), 'from');
    } else if (fromData.name && typeof setNavigationFromBuilding === 'function') {
        setNavigationFromBuilding(fromData.name, 'from');
    } else {
        $('#nav-from-input').val(fav.from || '');
    }

    if (toIsStop && typeof setNavigationFromStop === 'function') {
        setNavigationFromStop(String(toData.id), 'to');
    } else if (toData.name && typeof setNavigationFromBuilding === 'function') {
        setNavigationFromBuilding(toData.name, 'to');
    } else {
        $('#nav-to-input').val(fav.to || '');
    }

    if (typeof openDirectionsNav === 'function') {
        openDirectionsNav();
    }
    const fName = fromData.name || fav.from;
    const tName = toData.name || fav.to;
    setTimeout(() => {
        if (typeof calculateRoute === 'function') {
            calculateRoute(fName, tName);
        }
        updateNavFavoriteStarState();
    }, 60);
    sa_event('btn_press', { btn: 'favorite_nav_route_selected', from: fName, to: tName });
}
window.openFavoriteNavRoute = openFavoriteNavRoute;

// Find the best combination of start and end stops for routing
function findBestRouteCombination(startStops, endStops, startBuilding, endBuilding, startIsStop, endIsStop) {
    console.log('🔍 findBestRouteCombination called with:', startStops.length, 'start stops,', endStops.length, 'end stops');
    const routeOptions = [];
    const allEvaluatedCombinations = [];


    // Try each combination of start and end stops
    for (const startStop of startStops) {
        for (const endStop of endStops) {
            // Skip if it's the same stop
            if (startStop.id === endStop.id) {
                allEvaluatedCombinations.push({
                    startStop: startStop.name,
                    endStop: endStop.name,
                    status: 'skipped_same_stop',
                    routes: 0,
                    walkingFeet: 0,
                    score: 0
                });
                continue;
            }

            // Find connecting routes between these stops
            const connectingRoutes = findConnectingRoutes(startStop.id, endStop.id);

            // Calculate walking distances for this combination (allow walking to nearby stops even if source/dest is a stop)
            const rawStartWalk = calculateWalkingDistance(
                startBuilding.lat, startBuilding.lng,
                startStop.latitude, startStop.longitude
            );
            const startWalkDistance = (startIsStop && String(startStop.id) === String(startBuilding.id)) || (rawStartWalk && rawStartWalk.feet <= 30) ? null : rawStartWalk;

            const rawEndWalk = calculateWalkingDistance(
                endStop.latitude, endStop.longitude,
                endBuilding.lat, endBuilding.lng
            );
            const endWalkDistance = (endIsStop && String(endStop.id) === String(endBuilding.id)) || (rawEndWalk && rawEndWalk.feet <= 30) ? null : rawEndWalk;

            // Calculate total walking distance in feet
            const totalWalkingFeet = (startWalkDistance?.feet || 0) + (endWalkDistance?.feet || 0);

            if (connectingRoutes.length > 0) {
                
                // Score this route combination
                const score = calculateRouteScore(connectingRoutes, totalWalkingFeet, startStop, endStop);

                routeOptions.push({
                    startStop,
                    endStop,
                    connectingRoutes,
                    startWalkDistance,
                    endWalkDistance,
                    totalWalkingFeet,
                    score
                });


                allEvaluatedCombinations.push({
                    startStop: startStop.name,
                    endStop: endStop.name,
                    status: 'valid',
                    routes: connectingRoutes.length,
                    routeNames: connectingRoutes.map(r => r.name),
                    walkingFeet: totalWalkingFeet,
                    score: score,
                    chosen: false
                });
            } else {

                allEvaluatedCombinations.push({
                    startStop: startStop.name,
                    endStop: endStop.name,
                    status: 'no_routes',
                    routes: 0,
                    walkingFeet: totalWalkingFeet,
                    score: 0
                });
            }

            // Also check for transfer route combinations between startStop and endStop
            const transferRoutes = findTransferRoutes(startStop.id, endStop.id);
            for (const t of transferRoutes) {
                const transferScore = calculateTransferRouteScore(t, totalWalkingFeet, startStop, endStop);
                const transferKey = `${t.route1Name}-${t.route2Name}`.toLowerCase();
                const transferDisplayName = `${t.route1Name.toUpperCase()} → ${t.route2Name.toUpperCase()}`;

                const transferRouteObj = {
                    name: transferKey,
                    displayName: transferDisplayName,
                    isTransfer: true,
                    transferStop: t.transferStop,
                    leg1: {
                        route: { name: t.route1Name, stops: t.route1Stops },
                        startStop: startStop,
                        transferStop: t.transferStop,
                        startIndex: t.leg1StartIndex,
                        endIndex: t.leg1TransferIndex,
                        stops: t.route1Stops
                    },
                    leg2: {
                        route: { name: t.route2Name, stops: t.route2Stops },
                        transferStop: t.transferStop,
                        endStop: endStop,
                        startIndex: t.leg2TransferIndex,
                        endIndex: t.leg2EndIndex,
                        stops: t.route2Stops
                    }
                };

                routeOptions.push({
                    isTransfer: true,
                    name: transferKey,
                    displayName: transferDisplayName,
                    startStop,
                    transferStop: t.transferStop,
                    endStop,
                    connectingRoutes: [transferRouteObj],
                    startWalkDistance,
                    endWalkDistance,
                    totalWalkingFeet,
                    score: transferScore,
                    leg1: transferRouteObj.leg1,
                    leg2: transferRouteObj.leg2
                });

                allEvaluatedCombinations.push({
                    startStop: startStop.name,
                    endStop: endStop.name,
                    status: 'valid_transfer',
                    routes: 1,
                    routeNames: [`${transferDisplayName} (via ${t.transferStop.name})`],
                    walkingFeet: totalWalkingFeet,
                    score: transferScore,
                    chosen: false
                });
            }
        }
    }

    // Sort by score (best first) and return top options
    const sortedOptions = routeOptions
        .sort((a, b) => b.score - a.score)
        .slice(0, 10); // Return top 10 options

    // Find the best combination for each route type
    const bestByRoute = {};
    routeOptions.forEach(option => {
        option.connectingRoutes.forEach(route => {
            const routeName = route.name.toLowerCase();
            if (!bestByRoute[routeName] || option.score > bestByRoute[routeName].score) {
                bestByRoute[routeName] = {
                    combination: option,
                    route: route
                };
            }
        });
    });

    if (NAV_DEBUG) {
        // Display best combination for each route type
        console.log(`\n🏆 Best combination for each route type:`);
        Object.keys(bestByRoute).sort().forEach(routeName => {
            const best = bestByRoute[routeName];
            const combo = best.combination;
            const rLabel = best.route && best.route.displayName ? best.route.displayName : routeName.toUpperCase();
            console.log(`   ${rLabel}: ${combo.startStop.name} → ${combo.endStop.name}`);
            console.log(`      Walking: ${combo.totalWalkingFeet} ft (${combo.startWalkDistance?.feet || 0} + ${combo.endWalkDistance?.feet || 0})`);
            console.log(`      Score: ${combo.score.toFixed(2)}`);
            console.log(`      Other routes available: ${combo.connectingRoutes.map(r => r.displayName || r.name).join(', ')}`);
            console.log('');
        });
    }

    // Mark the chosen combinations (overall best and best for each route)
    if (sortedOptions.length > 0) {
        sortedOptions[0].chosen = true;
        
        if (NAV_DEBUG) {
            const chosenRouteLabel = sortedOptions[0].connectingRoutes[0]?.displayName || sortedOptions[0].connectingRoutes[0]?.name || 'Route';
            console.log(`🎯 Overall best combination selected:`);
            console.log(`   ${sortedOptions[0].startStop.name} → ${sortedOptions[0].endStop.name}`);
            console.log(`   Walking: ${sortedOptions[0].totalWalkingFeet} ft`);
            console.log(`   Score: ${sortedOptions[0].score.toFixed(2)}`);
            console.log(`   Routes: ${sortedOptions[0].connectingRoutes.map(r => r.displayName || r.name).join(', ')}`);
        }

        // Update the allEvaluatedCombinations to mark chosen ones
        allEvaluatedCombinations.forEach(combo => {
            if (combo.startStop === sortedOptions[0].startStop.name &&
                combo.endStop === sortedOptions[0].endStop.name) {
                combo.chosen = true;
                combo.bestOverall = true;
            }
            // Also mark combinations that are best for their route type
            Object.keys(bestByRoute).forEach(routeName => {
                const best = bestByRoute[routeName];
                if (combo.startStop === best.combination.startStop.name &&
                    combo.endStop === best.combination.endStop.name) {
                    combo.bestForRoute = combo.bestForRoute || [];
                    const label = best.route && best.route.displayName ? best.route.displayName : routeName.toUpperCase();
                    if (!combo.bestForRoute.includes(label)) {
                        combo.bestForRoute.push(label);
                    }
                }
            });
        });
    }


    // Show route distribution summary
    const routeDistribution = {};
    routeOptions.forEach(option => {
        option.connectingRoutes.forEach(route => {
            const routeName = route.name.toUpperCase();
            if (!routeDistribution[routeName]) {
                routeDistribution[routeName] = 0;
            }
            routeDistribution[routeName]++;
        });
    });

    if (NAV_DEBUG) {
        console.log(`\n📊 Summary: ${routeOptions.length} valid combinations out of ${startStops.length * endStops.length} tested`);

        console.log(`\n🚌 Route distribution across valid combinations:`);
        Object.keys(routeDistribution).sort().forEach(routeName => {
            const bestCombo = bestByRoute[routeName.toLowerCase()];
            const walking = bestCombo ? bestCombo.combination.totalWalkingFeet : 'N/A';
            console.log(`   ${routeName}: ${routeDistribution[routeName]} combinations (best: ${walking} ft walking)`);
        });
    }

    if (NAV_DEBUG) {
        // Log all combinations in a table format for easy reading
        console.log('\n📋 All evaluated combinations:');
        console.table(allEvaluatedCombinations.map(combo => {
            let status = combo.status.replace('_', ' ').toUpperCase();
            if (combo.bestOverall) {
                status = '🎯 BEST OVERALL';
            } else if (combo.bestForRoute && combo.bestForRoute.length > 0) {
                status = `🏆 BEST FOR ${combo.bestForRoute.join(', ')}`;
            } else if (combo.chosen) {
                status = '✅ CHOSEN';
            }

            return {
                'Start → End': `${combo.startStop} → ${combo.endStop}`,
                'Status': status,
                'Walking (ft)': combo.walkingFeet || 'N/A',
                'Score': combo.bestOverall ? `🎯 ${combo.score.toFixed(2)}` :
                       (combo.bestForRoute ? `🏆 ${combo.score.toFixed(2)}` : combo.score.toFixed(2))
            };
        }));
    }

    // Return both overall best options and best combination per route
    return { sortedOptions, bestByRoute };
}

// Helper function to calculate forward distance on circular route
function calculateForwardDistance(startIndex, endIndex, totalStops) {
    if (endIndex >= startIndex) {
        // Normal forward travel
        return endIndex - startIndex;
    } else {
        // Wrapping around from end to beginning
        return (totalStops - startIndex) + endIndex;
    }
}

// Calculate a score for a route combination (higher is better)
function calculateRouteScore(routes, totalWalkingFeet, startStop, endStop) {
    let score = 0;
    const scoreBreakdown = [];

    // MAJOR BONUS: Direct distance to destination (closer stops get big bonus)
    const endStopDistance = endStop.distance || 0; // Distance from end stop to final destination
    const directDistanceBonus = Math.max(0, 1000 - endStopDistance) * 0.1; // 10 points per 100m closer
    if (directDistanceBonus > 0) {
        score += directDistanceBonus;
        scoreBreakdown.push(`+${directDistanceBonus.toFixed(1)} (direct distance bonus: ${endStopDistance}m)`);
    }

    // Penalize walking distance (every foot of walking reduces score) - INCREASED WEIGHT
    const walkingPenalty = totalWalkingFeet * 0.05; // 5 points penalty per 100 feet of walking (increased from 2)
    score -= walkingPenalty;
    scoreBreakdown.push(`-${walkingPenalty.toFixed(1)} (walking: ${totalWalkingFeet} ft)`);

    // MAJOR FACTOR: Penalize bus travel time heavily (fewer stops = better)
    const bestRoute = routes[0];
    let busTimePenalty = 0;
    if (bestRoute) {
        const total = (bestRoute.stops || []).length;
        
        const circStopsBetween = calculateForwardDistance(bestRoute.startIndex, bestRoute.endIndex, total);
        
        // Heavy penalty for bus stops: 10 points per stop (much more than walking)
        busTimePenalty = circStopsBetween * 10;
        score -= busTimePenalty;
        scoreBreakdown.push(`-${busTimePenalty} (bus stops: ${circStopsBetween} between)`);
        
        // Bonus for very short bus rides (1-2 stops)
        if (circStopsBetween <= 2) {
            const shortRideBonus = (3 - circStopsBetween) * 15;
            score += shortRideBonus;
            scoreBreakdown.push(`+${shortRideBonus} (short ride bonus)`);
        }
    }

    // PRIORITIZE CLOSER STOPS: When bus travel is similar, prefer closer walking distance
    // This ensures that if two stops have similar bus routes/stops, the closer one wins
    const walkingDistanceBonus = Math.max(0, 2000 - totalWalkingFeet) * 0.01; // Bonus for shorter walks
    if (walkingDistanceBonus > 0) {
        score += walkingDistanceBonus;
        scoreBreakdown.push(`+${walkingDistanceBonus.toFixed(1)} (walking distance bonus)`);
    }

    // Prefer non-weekend routes for general use
    const hasRegularRoutes = routes.some(r => {
        const name = String(r.name || '').toLowerCase();
        return !name.startsWith('wknd');
    });
    if (hasRegularRoutes) {
        score += 20;
        scoreBreakdown.push(`+20 (regular routes)`);
    } else {
        scoreBreakdown.push(`+0 (weekend only)`);
    }

    return score;
}

// Calculate a score for a transfer route combination (higher is better)
function calculateTransferRouteScore(t, totalWalkingFeet, startStop, endStop) {
    let score = 0;

    // Direct distance to destination bonus
    const endStopDistance = endStop.distance || 0;
    const directDistanceBonus = Math.max(0, 1000 - endStopDistance) * 0.1;
    if (directDistanceBonus > 0) {
        score += directDistanceBonus;
    }

    // Walking penalty
    const walkingPenalty = totalWalkingFeet * 0.05;
    score -= walkingPenalty;

    // Bus travel time penalty across both legs (10 points per stop)
    const busTimePenalty = t.totalStops * 10;
    score -= busTimePenalty;

    // Moderate transfer penalty (fixed friction cost of switching buses vs single bus)
    // 25 points = equivalent to ~500 ft of walking.
    // If transferring saves >500 ft of walking, the transfer route easily wins.
    score -= 25;

    // Walking distance bonus
    const walkingDistanceBonus = Math.max(0, 2000 - totalWalkingFeet) * 0.01;
    if (walkingDistanceBonus > 0) {
        score += walkingDistanceBonus;
    }

    // Regular routes preference
    const n1 = String(t.route1Name || '').toLowerCase();
    const n2 = String(t.route2Name || '').toLowerCase();
    const isWknd1 = n1.startsWith('wknd') || n1.includes('winter') || n1.includes('summer');
    const isWknd2 = n2.startsWith('wknd') || n2.includes('winter') || n2.includes('summer');
    if (!isWknd1 && !isWknd2) {
        score += 20;
    } else {
        score -= 50;
    }

    return score;
}

// Determine whether pure walking should be included as a route option alongside bus options
function shouldIncludeWalkOption(directWalkMinutes, directWalkFeet, busRoutesForDisplay) {
    if (typeof directWalkMinutes !== 'number' || directWalkMinutes <= 0) return false;
    // Don't show pure walk if start and end are practically the same spot
    if (directWalkFeet <= 30) return false;

    // If there are no bus routes at all, show walking if distance is within 45 minutes (~2 miles)
    if (!busRoutesForDisplay || busRoutesForDisplay.length === 0) {
        return directWalkMinutes <= 45;
    }

    const liveBusRoutes = busRoutesForDisplay.filter(e => !e.isWalk && !e.route?.isWalk && e.hasLive && e.journeyMinutes > 0);
    const minLiveBusTime = liveBusRoutes.length > 0
        ? Math.min(...liveBusRoutes.map(e => e.journeyMinutes))
        : Infinity;
    const allBusRoutes = busRoutesForDisplay.filter(e => !e.isWalk && !e.route?.isWalk);
    const minAnyBusTime = allBusRoutes.length > 0
        ? Math.min(...allBusRoutes.map(e => (typeof e.journeyMinutes === 'number' && e.journeyMinutes > 0) ? e.journeyMinutes : Infinity))
        : Infinity;
    const fastestBusTime = isFinite(minLiveBusTime) ? minLiveBusTime : minAnyBusTime;

    // 1. Shorter and faster than taking any bus (always include)
    if (isFinite(fastestBusTime) && directWalkMinutes <= fastestBusTime) {
        return true;
    }

    // 2. Reasonably short walk on campus (<= 25 minutes or <= 5500 ft / ~1 mile)
    if (directWalkMinutes <= 25 || directWalkFeet <= 5500) {
        return true;
    }

    // 3. Within 30 minutes AND not more than 10 minutes slower than the fastest bus
    if (directWalkMinutes <= 30 && isFinite(fastestBusTime) && directWalkMinutes <= fastestBusTime + 10) {
        return true;
    }

    return false;
}
window.shouldIncludeWalkOption = shouldIncludeWalkOption;

function calculateRoute(from, to) {
    console.log('🚀 calculateRoute called with:', from, '→', to);

    try {
        // Get building data - use selected building if available, otherwise fuzzy search
        let startBuilding = null;
        let endBuilding = null;

        // For start place (building or stop)
        if (selectedFromBuilding) {
            const currentFromInput = $('#nav-from-input').val().trim();
            startBuilding = resolvePlaceByName(currentFromInput || selectedFromBuilding);
        } else if (selectedFromStop) {
            const stopData = stopsData[selectedFromStop];
            startBuilding = {
                name: stopData.name,
                lat: stopData.latitude,
                lng: stopData.longitude,
                category: 'stop',
                id: selectedFromStop
            };
        } else {
            startBuilding = resolvePlaceByName(from);
        }

        // For end place (building or stop)
        if (selectedToBuilding) {
            const currentToInput = $('#nav-to-input').val().trim();
            endBuilding = resolvePlaceByName(currentToInput || selectedToBuilding);
        } else if (selectedToStop) {
            const stopData = stopsData[selectedToStop];
            endBuilding = {
                name: stopData.name,
                lat: stopData.latitude,
                lng: stopData.longitude,
                category: 'stop',
                id: selectedToStop
            };
        } else {
            endBuilding = resolvePlaceByName(to);
        }

        if (!startBuilding) {
            startBuilding = resolvePlaceByName(from, true);
        }
        if (!endBuilding) {
            endBuilding = resolvePlaceByName(to, true);
        }

        if (!startBuilding || !endBuilding) {
            const missingFrom = !startBuilding ? `"${from}"` : '';
            const missingTo = !endBuilding ? `"${to}"` : '';
            const connector = missingFrom && missingTo ? ' or ' : '';
            showNavigationMessage(`Could not find location data for ${missingFrom}${connector}${missingTo}`);
            if (typeof updateNavFavoriteStarState === 'function') {
                updateNavFavoriteStarState();
            }
            return;
        }

        if (typeof updateNavFavoriteStarState === 'function') {
            updateNavFavoriteStarState();
        }

        // If this is the same route that's already computed and rendered (just
        // hidden while an input was focused), reshow it instead of recomputing.
        const routeKey = `${String(startBuilding.name).trim().toLowerCase()}\u0001${String(endBuilding.name).trim().toLowerCase()}`;
        const fromInputVal = ($('#nav-from-input').val() || '').trim().toLowerCase();
        const toInputVal = ($('#nav-to-input').val() || '').trim().toLowerCase();
        const inputKey = `${fromInputVal}\u0001${toInputVal}`;
        const wrapperHasContent = $('.nav-directions-wrapper').children().length > 0;
        if (lastComputedRouteKey && wrapperHasContent && (lastComputedRouteKey === routeKey || lastComputedRouteKey === inputKey)) {
            openDirectionsNav();
            $('.nav-directions-wrapper').removeClass('none').addClass('flex');
            $('.nav-route-selector-container').removeClass('none');
            if (typeof updateNavInfoBanners === 'function') {
                updateNavInfoBanners();
            } else if (typeof updateNavTransferInfoBanner === 'function') {
                const curRoute = navRouteSession && navRouteSession.routeData && navRouteSession.routeData.route;
                updateNavTransferInfoBanner(curRoute);
            }
            navDirectionsWasVisibleBeforeFocus = false;
            $('.nav-directions-wrapper').scrollTop(0);
            $('.navigate-inner').scrollTop(0);
            // Ensure dest row and pills are visible when reshowing
            $('.nav-dest-row').removeClass('none');
            $('.nav-pill-bar').removeClass('nav-collapsed');
            $('.search-wrapper').removeClass('nav-source-hidden');
            // Clear any pending source selection that would keep dest hidden
            window.navPendingSourceSelection = false;
            return;
        }

        // Determine if start/end are bus stops (vs buildings)
        const startIsStop = String(startBuilding.category || '').toLowerCase() === 'stop';
        const endIsStop = String(endBuilding.category || '').toLowerCase() === 'stop';

        // Calculate direct walking distance between start and end locations
        const directWalkDist = calculateWalkingDistance(
            startBuilding.lat, startBuilding.lng,
            endBuilding.lat, endBuilding.lng
        );
        const directWalkFeet = directWalkDist ? directWalkDist.feet : 0;
        const directWalkMinutes = Math.max(1, Math.ceil(directWalkFeet / 220));

        const walkRouteObj = {
            name: 'walk',
            displayName: 'Walk',
            isWalk: true,
            isTransfer: false,
            hasLive: true,
            journeyMinutes: directWalkMinutes,
            walkMinutes: directWalkMinutes,
            totalWalkingFeet: directWalkFeet,
            walkDistance: directWalkDist,
            startBuilding,
            endBuilding
        };

        // Check if fuzzy matching was used
        const fromNormalized = String(from || '').trim().toLowerCase();
        const toNormalized = String(to || '').trim().toLowerCase();
        const startResolvedName = String((startBuilding && startBuilding.name) || '').trim().toLowerCase();
        const endResolvedName = String((endBuilding && endBuilding.name) || '').trim().toLowerCase();

        const usedFuzzyMatch = {
            from: startIsStop
                ? false
                : fromNormalized !== startResolvedName,
            to: endIsStop
                ? false
                : toNormalized !== endResolvedName
        };

        // Resolve boarding/alighting stops - search closest stops even if start/end is a stop,
        // allowing walking to nearby stops when beneficial (e.g. Science Building -> ARC for REXB)
        const startStops = findClosestStops(startBuilding.lat, startBuilding.lng, 5);
        const endStops = findClosestStops(endBuilding.lat, endBuilding.lng, 5);

        if (startStops.length === 0 || endStops.length === 0) {
            if (shouldIncludeWalkOption(directWalkMinutes, directWalkFeet, [])) {
                $('.nav-message').hide();
                if (typeof saveRecentNavigation === 'function') saveRecentNavigation(startBuilding, endBuilding);
                if (startBuilding) saveRecentSearch(startBuilding);
                if (endBuilding) saveRecentSearch(endBuilding);
                displayRoute({
                    startBuilding,
                    endBuilding,
                    startStop: null,
                    endStop: null,
                    route: walkRouteObj,
                    allRoutes: [walkRouteObj],
                    selectedRouteIndex: 0,
                    startWalkDistance: directWalkDist,
                    endWalkDistance: null,
                    hasAlternatives: false,
                    alternativeRoutes: [],
                    usedFuzzyMatch,
                    originalInputs: { from, to },
                    startIsStop,
                    endIsStop,
                    routeCombosMap: {
                        'walk': {
                            startStop: null,
                            endStop: null,
                            startWalkDistance: directWalkDist,
                            endWalkDistance: null,
                            totalWalkingFeet: directWalkFeet,
                            isWalk: true,
                            isTransfer: false
                        }
                    }
                });
                return;
            }
            showNavigationMessage("Could not find nearby bus stops");
            return;
        }

        // Find the best route combination by trying different start/end stop pairs
        const { sortedOptions, bestByRoute } = findBestRouteCombination(startStops, endStops, startBuilding, endBuilding, startIsStop, endIsStop);

        if (!sortedOptions || sortedOptions.length === 0) {
            if (shouldIncludeWalkOption(directWalkMinutes, directWalkFeet, [])) {
                $('.nav-message').hide();
                if (typeof saveRecentNavigation === 'function') saveRecentNavigation(startBuilding, endBuilding);
                if (startBuilding) saveRecentSearch(startBuilding);
                if (endBuilding) saveRecentSearch(endBuilding);
                displayRoute({
                    startBuilding,
                    endBuilding,
                    startStop: null,
                    endStop: null,
                    route: walkRouteObj,
                    allRoutes: [walkRouteObj],
                    selectedRouteIndex: 0,
                    startWalkDistance: directWalkDist,
                    endWalkDistance: null,
                    hasAlternatives: false,
                    alternativeRoutes: [],
                    usedFuzzyMatch,
                    originalInputs: { from, to },
                    startIsStop,
                    endIsStop,
                    routeCombosMap: {
                        'walk': {
                            startStop: null,
                            endStop: null,
                            startWalkDistance: directWalkDist,
                            endWalkDistance: null,
                            totalWalkingFeet: directWalkFeet,
                            isWalk: true,
                            isTransfer: false
                        }
                    }
                });
                return;
            }
            showNavigationMessage("No bus routes connect these locations");
            return;
        }

        // Use the best overall route combination for initial selection
        const bestRoute = sortedOptions[0];
        const startStop = bestRoute.startStop;
        const endStop = bestRoute.endStop;
        const connectingRoutes = bestRoute.connectingRoutes;
        const startWalkDistance = bestRoute.startWalkDistance;
        const endWalkDistance = bestRoute.endWalkDistance;
        const totalWalkingFeet = bestRoute.totalWalkingFeet;

        // Rank routes by desirability (best first)
        const rankedRoutes = selectBestRoute(connectingRoutes, startStop, endStop);
        const hasAlternatives = rankedRoutes.length > 1;

        // Filter out routes with excessive walking unless it's the only choice
        // Using total walking feet threshold (e.g., 2000 ft) – tweakable
        const WALKING_CUTOFF_FEET = 2000;
        let filteredRankedRoutes = rankedRoutes;
        if (rankedRoutes.length > 1 && totalWalkingFeet > WALKING_CUTOFF_FEET) {
            // Keep only non-WKND routes when walking is too high; if that empties, keep original top
            const nonWeekend = rankedRoutes.filter(r => {
                const n = String(r.name || '').toLowerCase();
                return !n.startsWith('wknd');
            });
            filteredRankedRoutes = nonWeekend.length > 0 ? nonWeekend : rankedRoutes;
        }

        // Ensure we still have routes
        if (filteredRankedRoutes.length === 0) {
            if (shouldIncludeWalkOption(directWalkMinutes, directWalkFeet, [])) {
                $('.nav-message').hide();
                if (typeof saveRecentNavigation === 'function') saveRecentNavigation(startBuilding, endBuilding);
                if (startBuilding) saveRecentSearch(startBuilding);
                if (endBuilding) saveRecentSearch(endBuilding);
                displayRoute({
                    startBuilding,
                    endBuilding,
                    startStop: null,
                    endStop: null,
                    route: walkRouteObj,
                    allRoutes: [walkRouteObj],
                    selectedRouteIndex: 0,
                    startWalkDistance: directWalkDist,
                    endWalkDistance: null,
                    hasAlternatives: false,
                    alternativeRoutes: [],
                    usedFuzzyMatch,
                    originalInputs: { from, to },
                    startIsStop,
                    endIsStop,
                    routeCombosMap: {
                        'walk': {
                            startStop: null,
                            endStop: null,
                            startWalkDistance: directWalkDist,
                            endWalkDistance: null,
                            totalWalkingFeet: directWalkFeet,
                            isWalk: true,
                            isTransfer: false
                        }
                    }
                });
                return;
            }
            showNavigationMessage("No suitable bus route after filtering");
            return;
        }

        // Hide any previous nav message when proceeding to display a route
        $('.nav-message').hide(); // remove later?-

        // Get detailed route information for the primary route
        const primaryRoute = filteredRankedRoutes[0];
        let routeDetails;
        if (primaryRoute.isTransfer) {
            const tStop = bestRoute.transferStop || primaryRoute.transferStop;
            routeDetails = {
                ...primaryRoute,
                isTransfer: true,
                transferStop: tStop,
                leg1: {
                    ...primaryRoute.leg1,
                    routeDetails: getRouteDetails(primaryRoute.leg1.route, startStop.id, tStop.id)
                },
                leg2: {
                    ...primaryRoute.leg2,
                    routeDetails: getRouteDetails(primaryRoute.leg2.route, tStop.id, endStop.id)
                }
            };
        } else {
            routeDetails = getRouteDetails(primaryRoute, startStop.id, endStop.id);
        }

        // Build a map of best combination per route for alternate options (route -> start/end stops and walking)
        const routeCombosMap = {};
        const allRoutesAcrossBestCombos = [];
        Object.keys(bestByRoute).forEach(routeNameKey => {
            const best = bestByRoute[routeNameKey];
            if (!best || !best.combination || !best.route) return;
            const combo = best.combination;
            const routeObj = best.route;
            const key = String(routeObj.name || '').toLowerCase();
            routeCombosMap[key] = {
                startStop: combo.startStop,
                transferStop: combo.transferStop,
                endStop: combo.endStop,
                startWalkDistance: combo.startWalkDistance,
                endWalkDistance: combo.endWalkDistance,
                totalWalkingFeet: combo.totalWalkingFeet,
                isTransfer: !!combo.isTransfer,
                leg1: combo.leg1,
                leg2: combo.leg2
            };
            allRoutesAcrossBestCombos.push(routeObj);
        });

        routeCombosMap['walk'] = {
            startStop: null,
            endStop: null,
            startWalkDistance: directWalkDist,
            endWalkDistance: null,
            totalWalkingFeet: directWalkFeet,
            isWalk: true,
            isTransfer: false
        };
        allRoutesAcrossBestCombos.push(walkRouteObj);

        // Ensure primary route is present and comes first in selection order
        const primaryKey = String(primaryRoute.name || '').toLowerCase();
        if (!routeCombosMap[primaryKey]) {
            routeCombosMap[primaryKey] = {
                startStop: bestRoute.startStop,
                transferStop: bestRoute.transferStop || primaryRoute.transferStop,
                endStop: bestRoute.endStop,
                startWalkDistance: bestRoute.startWalkDistance,
                endWalkDistance: bestRoute.endWalkDistance,
                totalWalkingFeet: bestRoute.totalWalkingFeet,
                isTransfer: !!primaryRoute.isTransfer,
                leg1: bestRoute.leg1 || primaryRoute.leg1,
                leg2: bestRoute.leg2 || primaryRoute.leg2
            };
        }
        const dedupedRoutes = [];
        const seen = new Set();
        // Primary first
        if (!seen.has(primaryKey)) {
            dedupedRoutes.push(primaryRoute);
            seen.add(primaryKey);
        }
        // Then others from best-per-route
        allRoutesAcrossBestCombos.forEach(r => {
            const k = String(r.name || '').toLowerCase();
            if (!seen.has(k)) {
                dedupedRoutes.push(r);
                seen.add(k);
            }
        });

        // Save to recent navigations and recent searches
        if (typeof saveRecentNavigation === 'function') saveRecentNavigation(startBuilding, endBuilding);
        if (startBuilding) saveRecentSearch(startBuilding);
        if (endBuilding) saveRecentSearch(endBuilding);

        // Display the route
        displayRoute({
            startBuilding,
            endBuilding,
            startStop,
            transferStop: (primaryRoute.isTransfer ? (bestRoute.transferStop || primaryRoute.transferStop) : null),
            endStop,
            route: routeDetails,
            allRoutes: dedupedRoutes,
            selectedRouteIndex: 0,
            startWalkDistance,
            endWalkDistance,
            hasAlternatives: dedupedRoutes.length > 1,
            alternativeRoutes: dedupedRoutes.length > 1 ? dedupedRoutes.slice(1) : [],
            usedFuzzyMatch,
            originalInputs: { from, to },
            startIsStop,
            endIsStop,
            
            routeCombosMap
        });


    } catch (error) {
        console.error('Error calculating route:', error);
        showNavigationMessage('Error calculating route. Please try again.');
    }
}

function showNavigationMessage(message) {
    if (!message || message === 'Route cleared') return;
    // Create or update navigation message display
    let messageEl = $('.nav-message');
    if (messageEl.length === 0) {
        messageEl = $('<div class="nav-message"></div>');
        $('.navigate-inner').append(messageEl);
    }

    messageEl.text(message).show();

    // Auto-hide after 3 seconds
    setTimeout(() => {
        messageEl.fadeOut();
    }, 3000);
}

let roadNetworkLayer = null; // Global variable to store the road network layer
let roadNetworkData = null; // Cache for road network data for address lookups

// Variables to track building selections from map clicks
let selectedFromBuilding = null; // normalized building name from map click for "from" input
let selectedToBuilding = null;   // normalized building name from map click for "to" input
let selectedFromStop = null;     // stop ID from map click for "from" input
let selectedToStop = null;       // stop ID from map click for "to" input
let isSettingInputProgrammatically = false; // prevent clearing on programmatic input

// Variables to track autocomplete navigation
let currentAutocompleteIndex = -1;

// Check if both navigation inputs have valid buildings and trigger route calculation
function checkAndTriggerRouteCalculation() {
    const fromValue = $('#nav-from-input').val().trim();
    const toValue = $('#nav-to-input').val().trim();

    // Only trigger if both inputs have values and both have selected places from autocomplete
    if (fromValue && toValue && (selectedFromBuilding || selectedFromStop) && (selectedToBuilding || selectedToStop)) {
        let fromMatches = false;
        let toMatches = false;

        // Check if from input matches selected building or stop
        if (selectedFromBuilding) {
            const fromBuilding = buildingIndex[selectedFromBuilding];
            fromMatches = fromBuilding && fromBuilding.name.toLowerCase() === fromValue.toLowerCase();
        } else if (selectedFromStop) {
            const fromStop = stopsData[selectedFromStop];
            fromMatches = fromStop && fromStop.name.toLowerCase() === fromValue.toLowerCase();
        }

        // Check if to input matches selected building or stop
        if (selectedToBuilding) {
            const toBuilding = buildingIndex[selectedToBuilding];
            toMatches = toBuilding && toBuilding.name.toLowerCase() === toValue.toLowerCase();
        } else if (selectedToStop) {
            const toStop = stopsData[selectedToStop];
            toMatches = toStop && toStop.name.toLowerCase() === toValue.toLowerCase();
        }

        if (fromMatches && toMatches) {
            calculateRoute(fromValue, toValue);
        }
    }

    if (typeof updateNavFavoriteStarState === 'function') {
        updateNavFavoriteStarState();
    }
}

// Set navigation input from building click
function setNavigationFromBuilding(buildingName, targetInput = 'from') {
    if (!buildingName) {
        console.error('Building name is null or undefined');
        showNavigationMessage('No building selected. Please click on a building first.');
        return;
    }

    const normalizedName = buildingName.toLowerCase();
    const buildingObj = (typeof buildingIndex !== 'undefined' && buildingIndex[normalizedName]) || (typeof resolvePlaceByName === 'function' ? resolvePlaceByName(buildingName) : null);
    if (buildingObj) {
        saveRecentSearch({
            name: buildingObj.name,
            category: buildingObj.category || 'building',
            lat: buildingObj.lat,
            lng: buildingObj.lng
        });
    } else {
        saveRecentSearch({
            name: buildingName,
            category: 'building'
        });
    }

    // Set the selected building variable
    if (targetInput === 'from') {
        selectedFromBuilding = normalizedName;
        isSettingInputProgrammatically = true;
        $('#nav-from-input').val(buildingName).trigger('input');
        isSettingInputProgrammatically = false;
        // Show clear button
        $('#nav-from-clear-btn').fadeIn();
    } else if (targetInput === 'to') {
        selectedToBuilding = normalizedName;
        isSettingInputProgrammatically = true;
        $('#nav-to-input').val(buildingName).trigger('input');
        isSettingInputProgrammatically = false;
        // Show clear button
        $('#nav-to-clear-btn').fadeIn();
    }

    // Check if we should trigger route calculation
    checkAndTriggerRouteCalculation();
}

// Set navigation input from stop click
function setNavigationFromStop(stopId, targetInput = 'to') {
    if (!stopId || !stopsData[stopId]) {
        console.error('Stop ID is invalid or stop data not found');
        showNavigationMessage('No stop selected. Please click on a stop first.');
        return;
    }

    const stopName = stopsData[stopId].name;
    const stopObj = stopsData[stopId];
    if (stopObj) {
        saveRecentSearch({
            name: stopObj.name,
            category: 'stop',
            id: parseInt(stopId, 10),
            lat: stopObj.latitude,
            lng: stopObj.longitude
        });
    }

    // Set the selected stop variable
    if (targetInput === 'from') {
        selectedFromStop = stopId;
        isSettingInputProgrammatically = true;
        $('#nav-from-input').val(stopName).trigger('input');
        isSettingInputProgrammatically = false;
        // Show clear button
        $('#nav-from-clear-btn').fadeIn();
    } else if (targetInput === 'to') {
        selectedToStop = stopId;
        isSettingInputProgrammatically = true;
        $('#nav-to-input').val(stopName).trigger('input');
        isSettingInputProgrammatically = false;
        // Show clear button
        $('#nav-to-clear-btn').fadeIn();
    }

    // Check if we should trigger route calculation
    checkAndTriggerRouteCalculation();
}

// Fuzzy search for building using Fuse.js
function findBuildingFuzzy(searchTerm) {
    if (!searchTerm || typeof searchTerm !== 'string' || searchTerm.trim().length < 2) {
        return null;
    }
    if (!window.fuse || !window.fuseReady) {
        console.warn('Fuse.js not ready for building search');
        return null;
    }

    const results = window.fuse.search(searchTerm.trim());
    if (results.length > 0) {
        return results[0].item; // Return the best match
    }

    return null;
}

// Show autocomplete dropdown for navigation inputs
function showNavigationAutocomplete(inputElement, query) {
    const isFromInput = inputElement.attr('id') === 'nav-from-input';
    const resultsContainer = $('.nav-search-results');

    resultsContainer.empty();
    currentAutocompleteIndex = -1;

    if (!window.fuseReady || !query.trim()) {
        if (!query.trim()) {
            if (isFromInput) {
                if (typeof renderNavFromRecents === 'function' && renderNavFromRecents()) {
                    return;
                }
            } else {
                if (typeof renderNavToRecents === 'function' && renderNavToRecents()) {
                    return;
                }
            }
        }
        resultsContainer.addClass('none');
        return;
    }

    // Perform fuzzy search with schedule-style sanitization and abbreviation support
    const sanitizedQuery = query.replace(/-[^\s]*/g, '').replace(/\s+/g, ' ').trim();
    const tokens = sanitizedQuery.split(/\s+/).filter(Boolean);
    const queryLower = sanitizedQuery.toLowerCase();
    let results;

    if (tokens.length === 1) {
        // Prefer exact abbreviation matches for single-token queries
        const list = Array.isArray(window.buildingList) ? window.buildingList : [];
        const exactAbbrevMatches = list
            .map(item => {
                const match = (item.abbreviations || []).find(abbr => String(abbr).toLowerCase() === queryLower);
                return match ? { item, matchedAbbreviation: match } : null;
            })
            .filter(Boolean);
        if (exactAbbrevMatches.length > 0) {
            results = exactAbbrevMatches;
        } else {
            results = window.fuse.search(sanitizedQuery);
        }
    } else if (tokens.length > 1) {
        // Multi-token search across name, aliases, and abbreviations
        const extendedQuery = {
            $and: tokens.map(token => ({
                $or: [
                    { name: token },
                    { aliases: token },
                    { abbreviations: token }
                ]
            }))
        };
        results = window.fuse.search(extendedQuery);
        // Annotate results when any token exactly equals an abbreviation
        const tokenSet = new Set(tokens.map(t => t.toLowerCase()));
        results = results.map(r => {
            const item = r.item || r;
            const abbrMatch = (item.abbreviations || []).find(a => tokenSet.has(String(a).toLowerCase()));
            return abbrMatch ? { ...r, matchedAbbreviation: abbrMatch } : r;
        });
    }

    if (results.length === 0) {
        resultsContainer.html('<div class="dimgray">No results found.</div>');
        resultsContainer.removeClass('none');
        return;
    }

    // Force the featured building (if present) to the top of the matches.
    results = window.pinFeaturedResult(results);

    // Create result elements (limit to 5 results), matching the main search's
    // .search-result-item row structure so styling is identical.
    const maxResults = 5;
    results.slice(0, maxResults).forEach(result => {
        const item = result.item ? result.item : result;
        const matchedAbbreviation = result.matchedAbbreviation;
        let icon = '';
        if (item.category === 'building') {
            icon = '<i class="icon icon-building"></i>';
        } else if (item.category === 'parking') {
            icon = '<i class="icon icon-parking"></i>';
        } else if (item.category === 'stop') {
            icon = '<i class="icon icon-bus-simple"></i>';
        }

        const displayText = matchedAbbreviation ? `${item.name} (${matchedAbbreviation})` : item.name;
        // If this result matches the place already set in the active field,
        // mark it as selected (bold name).
        const currentValue = inputElement.val().trim().toLowerCase();
        const isSelected = item.name.toLowerCase() === currentValue;
        const $resultElement = $('<div class="search-result-item flex' + (isSelected ? ' selected' : '') + '"></div>');
        if (icon) $resultElement.append(icon);
        $resultElement.append($('<div' + (isSelected ? ' class="search-result-selected-name"' : '') + '></div>').text(displayText));
        // Right chevron: tapping the row selects the place into the field.
        $resultElement.append('<i class="search-result-map-pin icon icon-chevron-right"></i>');
        // Hidden Nav-button placeholder to match search-row height (which includes a 1rem-padded Nav pill) without changing row-gap – keeps 1.3rem gap visually identical
        $resultElement.append('<span class="search-result-directions-btn" aria-hidden="true" style="visibility:hidden; pointer-events:none; margin-left:0; padding:1rem; font-size:1.3rem; border:1px solid transparent; height:auto; gap:0.4rem; display:flex; align-items:center;"><i class="fa-solid fa-diamond-turn-right"></i>Nav</span>');

        // Use click only (like the main search results) so touch scrolling
        // doesn't trigger selection — click fires only after a tap without scroll.
        const handleSelection = function(e) {
            if (e && e.stopPropagation) e.stopPropagation();
            // Choosing a source clears the pending-recent state
            if (isFromInput && window.navPendingSourceSelection) {
                window.navPendingSourceSelection = false;
            }
            // Set the input value programmatically to avoid clearing selection
            isSettingInputProgrammatically = true;
            inputElement.val(item.name);
            isSettingInputProgrammatically = false;

            // Save selected item to recent searches
            saveRecentSearch(item);

            // Set the selected place variable (may be building or stop by name)
            if (isFromInput) {
                if (item.category === 'stop' && (item.id || item.number)) {
                    selectedFromStop = String(item.id || item.number);
                    selectedFromBuilding = null;
                } else {
                    selectedFromBuilding = item.name.toLowerCase();
                    selectedFromStop = null;
                }
            } else {
                if (item.category === 'stop' && (item.id || item.number)) {
                    selectedToStop = String(item.id || item.number);
                    selectedToBuilding = null;
                } else {
                    selectedToBuilding = item.name.toLowerCase();
                    selectedToStop = null;
                }
            }

            // Track navigation place selection
            sa_event('btn_press', {
                'btn': isFromInput ? 'nav_from_place_selected' : 'nav_to_place_selected',
                'place': item.name,
                'category': item.category || 'unknown'
            });


            // Refresh input styling/state
            inputElement.trigger('input');

            // Try to compute route based on resolvable input values (do not gate on selected* flags)
            const fromValue = $('#nav-from-input').val().trim();
            const toValue = $('#nav-to-input').val().trim();
            if (fromValue && toValue) {
                // Hide results immediately for better UX (before route calculation)
                resultsContainer.addClass('none');
                const fromPlace = resolvePlaceByName(fromValue);
                const toPlace = resolvePlaceByName(toValue);
                if (fromPlace && toPlace) {
                    // Dismiss mobile keyboard to reveal directions
                    try { inputElement.blur(); } catch (err) { /* ignore */ }
                    // Run route calculation in background to prevent blocking UI
                    setTimeout(() => {
                        calculateRoute(fromValue, toValue);
                    }, 0);
                }
            } else if (isFromInput && !toValue) {
                window._navSwitchingInputs = true;
                setTimeout(() => { window._navSwitchingInputs = false; }, 350);
                if (window.focusNavToInput) window.focusNavToInput();
                else $('#nav-to-input').focus();
                renderNavToRecents();
            } else if (!isFromInput && !fromValue) {
                window._navSwitchingInputs = true;
                setTimeout(() => { window._navSwitchingInputs = false; }, 350);
                if (window.focusNavFromInput) window.focusNavFromInput();
                else $('#nav-from-input').focus();
                renderNavFromRecents();
            }
        };

        // Attach click for selection (fires after a tap, not during a scroll)
        $resultElement.on('click', handleSelection);

        // After picking a place, both bars come back (the other input is next).
        const restoreBars = function() {
            if (isFromInput && window.navPendingSourceSelection) {
                window.navPendingSourceSelection = false;
            }
            $('.nav-pill-bar').removeClass('nav-collapsed');
            $('.search-wrapper').removeClass('nav-source-hidden');
            $('.nav-dest-row').removeClass('none');
        };
        $resultElement.on('click', restoreBars);

        resultsContainer.append($resultElement);
    });
    
    // Convert FontAwesome icons to custom icons
    replaceFontAwesomeIcons();

    resultsContainer.removeClass('none');
}

// Hide autocomplete dropdowns
function hideNavigationAutocomplete() {
    $('.nav-search-results').addClass('none');
    currentAutocompleteIndex = -1;
    if (window.updateNavDestRowVisibility) window.updateNavDestRowVisibility();
}

// Highlight/unhighlight autocomplete items
function highlightAutocompleteItem(resultsContainer, index) {
    resultsContainer.find('.search-result-item').removeClass('highlighted');
    if (index >= 0) {
        resultsContainer.find('.search-result-item').eq(index).addClass('highlighted');
    }
}

// Calculate distance between two points using Haversine formula
function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; // Earth's radius in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c * 1000; // Convert to meters
}

// Find the closest bus stops to a given latitude and longitude (returns top 5)
function findClosestStops(targetLat, targetLng, maxStops = 5) {
    const stopsWithDistance = [];

    for (const stopId in stopsData) {
        const stop = stopsData[stopId];
        const distance = calculateDistance(
            targetLat, targetLng,
            stop.latitude, stop.longitude
        );

        stopsWithDistance.push({
            id: stopId,
            name: stop.name,
            latitude: stop.latitude,
            longitude: stop.longitude,
            distance: distance
        });
    }

    // Sort by distance and return top N stops
    return stopsWithDistance
        .sort((a, b) => a.distance - b.distance)
        .slice(0, maxStops);
}

// Keep the original function for backward compatibility (returns only the closest)
function findClosestStop(targetLat, targetLng) {
    const closestStops = findClosestStops(targetLat, targetLng, 1);
    return closestStops.length > 0 ? closestStops[0] : { distance: Infinity };
}

// Resolve an input string to a place object (building or stop)
function resolvePlaceByName(inputName, allowFuzzy = false) {
    if (!inputName) return null;
    const normalized = String(inputName).trim().toLowerCase();
    if (!normalized) return null;

    // 1. Exact building match (by normalized key)
    if (typeof buildingIndex !== 'undefined' && buildingIndex && buildingIndex[normalized]) {
        return buildingIndex[normalized];
    }

    // 2. Exact building match (by building name property)
    if (typeof buildingIndex !== 'undefined' && buildingIndex) {
        for (const key in buildingIndex) {
            const b = buildingIndex[key];
            if (b && b.name && b.name.toLowerCase() === normalized) {
                return b;
            }
        }
    }

    // 3. Exact stop match (case-insensitive by name or stop ID)
    if (typeof stopsData !== 'undefined' && stopsData) {
        for (const stopId in stopsData) {
            const stop = stopsData[stopId];
            if (!stop) continue;
            if (String(stopId).toLowerCase() === normalized ||
                String(stop.name || '').trim().toLowerCase() === normalized ||
                String(stop.shortName || '').trim().toLowerCase() === normalized ||
                String(stop.shorterName || '').trim().toLowerCase() === normalized ||
                String(stop.mainName || '').trim().toLowerCase() === normalized) {
                return {
                    name: stop.name,
                    lat: stop.latitude,
                    lng: stop.longitude,
                    id: parseInt(stopId, 10),
                    category: 'stop'
                };
            }
        }
    }

    // 4. Exact stop match across all campuses stops data
    if (typeof allStopsData !== 'undefined' && allStopsData) {
        for (const campus in allStopsData) {
            const campusStops = allStopsData[campus];
            if (!campusStops) continue;
            for (const stopId in campusStops) {
                const stop = campusStops[stopId];
                if (!stop) continue;
                if (String(stopId).toLowerCase() === normalized ||
                    String(stop.name || '').trim().toLowerCase() === normalized ||
                    String(stop.shortName || '').trim().toLowerCase() === normalized ||
                    String(stop.shorterName || '').trim().toLowerCase() === normalized ||
                    String(stop.mainName || '').trim().toLowerCase() === normalized) {
                    return {
                        name: stop.name,
                        lat: stop.latitude,
                        lng: stop.longitude,
                        id: parseInt(stopId, 10),
                        category: 'stop'
                    };
                }
            }
        }
    }

    // 5. Exact abbreviation lookup via precomputed abbrevMap
    if (typeof abbrevMap !== 'undefined' && abbrevMap && typeof abbrevMap.has === 'function' && abbrevMap.has(normalized)) {
        const matches = abbrevMap.get(normalized);
        if (matches && matches.length > 0 && matches[0].item) {
            return matches[0].item;
        }
    }

    // 6. Exact name, abbreviation, or alias match via buildingList
    const list = (typeof window !== 'undefined' && window.buildingList) || (typeof buildingList !== 'undefined' ? buildingList : null);
    if (list && Array.isArray(list)) {
        for (const item of list) {
            if (!item) continue;
            if (item.name && item.name.toLowerCase() === normalized) {
                return item;
            }
            if (Array.isArray(item.abbreviations) && item.abbreviations.some(a => String(a).toLowerCase() === normalized)) {
                return item;
            }
            if (Array.isArray(item.aliases) && item.aliases.some(a => String(a).toLowerCase() === normalized)) {
                return item;
            }
        }
    }

    // 7. Fuzzy building match via Fuse.js (only when explicitly requested and query is meaningful)
    if (allowFuzzy && normalized.length >= 2) {
        const fuzzyBuilding = findBuildingFuzzy(inputName);
        if (fuzzyBuilding) {
            return fuzzyBuilding;
        }
    }

    return null;
}
window.resolvePlaceByName = resolvePlaceByName;

// Find bus routes that connect two stops
function findConnectingRoutes(startStopId, endStopId) {
    const connectingRoutes = [];

    // Only consider routes that service the currently selected campus. Stop
    // IDs are not globally unique across campuses (NB/Camden/Newark all start
    // at 1), so an unfiltered stop-ID match pulls in routes like CC/CAM that
    // serve a different campus entirely.
    const campus = (typeof selectedCampus !== 'undefined') ? selectedCampus : 'nb';
    const campusRoutes = getCampusRoutes(campus);

    const possibleRoutes = Object.keys(stopLists).filter(r => {
        const lower = String(r || '').toLowerCase();
        return Array.isArray(stopLists[r]) && stopLists[r].length &&
            campusRoutes.includes(r) &&
            lower !== 'on1' && lower !== 'on2' && !lower.startsWith('on');
    });

    for (const routeName of possibleRoutes) {
        const routeStops = stopLists[routeName];

        // Check if both stops are on this route
        const startIndex = routeStops.indexOf(parseInt(startStopId));
        const endIndex = routeStops.indexOf(parseInt(endStopId));

        if (startIndex !== -1 && endIndex !== -1) {
            connectingRoutes.push({
                name: routeName,
                stops: routeStops,
                startIndex: startIndex,
                endIndex: endIndex
            });
        }
    }

    return connectingRoutes;
}

// Find multi-bus transfer routes that connect two stops via an intermediate transfer stop
function findTransferRoutes(startStopId, endStopId) {
    const campus = (typeof selectedCampus !== 'undefined') ? selectedCampus : 'nb';
    const campusRoutes = getCampusRoutes(campus);

    const s1 = parseInt(startStopId);
    const e = parseInt(endStopId);
    if (isNaN(s1) || isNaN(e) || s1 === e) return [];

    const possibleRoutes = Object.keys(stopLists).filter(r => {
        const lower = String(r || '').toLowerCase();
        return Array.isArray(stopLists[r]) && stopLists[r].length &&
            campusRoutes.includes(r) &&
            lower !== 'on1' && lower !== 'on2' && !lower.startsWith('on');
    });

    const transfers = [];
    const seenPairs = new Set();

    for (const r1 of possibleRoutes) {
        const stops1 = stopLists[r1];
        const idx1_start = stops1.indexOf(s1);
        if (idx1_start === -1) continue;

        // Skip if r1 already directly reaches endStopId (direct route already available on r1)
        if (stops1.indexOf(e) !== -1) continue;

        for (const r2 of possibleRoutes) {
            if (r1 === r2) continue;

            // Weekend routes (wknd1 and wknd2) can only transfer with each other (when weekend buses run, no other routes run)
            const isWknd1 = String(r1).toLowerCase().startsWith('wknd');
            const isWknd2 = String(r2).toLowerCase().startsWith('wknd');
            if (isWknd1 !== isWknd2) continue;

            const stops2 = stopLists[r2];
            const idx2_end = stops2.indexOf(e);
            if (idx2_end === -1) continue;

            // Skip if r2 already directly reaches startStopId (rider could just board r2 directly)
            if (stops2.indexOf(s1) !== -1) continue;

            const pairKey = `${r1}-${r2}`;
            if (seenPairs.has(pairKey)) continue;

            // Find all shared transfer stops between r1 and r2
            let bestTransfer = null;
            let minStops = Infinity;

            for (const tId of stops1) {
                if (tId === s1 || tId === e) continue;
                const idx1_t = stops1.indexOf(tId);
                const idx2_t = stops2.indexOf(tId);
                if (idx2_t === -1) continue;

                // Calculate forward distance on both routes
                const fwd1 = calculateForwardDistance(idx1_start, idx1_t, stops1.length);
                const fwd2 = calculateForwardDistance(idx2_t, idx2_end, stops2.length);

                if (fwd1 <= 0 || fwd2 <= 0) continue;
                if (fwd1 >= stops1.length || fwd2 >= stops2.length) continue;

                const totalStops = fwd1 + fwd2;
                if (totalStops < minStops || (totalStops === minStops && fwd2 < (bestTransfer ? bestTransfer.fwd2 : Infinity))) {
                    minStops = totalStops;
                    bestTransfer = {
                        transferStopId: tId,
                        fwd1,
                        fwd2,
                        totalStops,
                        idx1_start,
                        idx1_t,
                        idx2_t,
                        idx2_end
                    };
                }
            }

            if (bestTransfer && minStops <= 14) {
                const tStop = stopsData[bestTransfer.transferStopId];
                if (tStop) {
                    seenPairs.add(pairKey);
                    transfers.push({
                        route1Name: r1,
                        route2Name: r2,
                        route1Stops: stops1,
                        route2Stops: stops2,
                        transferStop: {
                            id: bestTransfer.transferStopId,
                            name: tStop.name,
                            latitude: tStop.latitude,
                            longitude: tStop.longitude,
                            campus: tStop.campus
                        },
                        leg1StartIndex: bestTransfer.idx1_start,
                        leg1TransferIndex: bestTransfer.idx1_t,
                        leg2TransferIndex: bestTransfer.idx2_t,
                        leg2EndIndex: bestTransfer.idx2_end,
                        fwd1: bestTransfer.fwd1,
                        fwd2: bestTransfer.fwd2,
                        totalStops: bestTransfer.totalStops
                    });
                }
            }
        }
    }

    return transfers;
}

// Calculate walking distance between two points (simple straight-line distance)
function calculateWalkingDistance(lat1, lng1, lat2, lng2) {
    const distance = calculateDistance(lat1, lng1, lat2, lng2);
    return {
        meters: Math.round(distance),
        miles: Math.round(distance * 0.000621371 * 100) / 100,
        feet: Math.round(distance * 3.28084)
    };
}

// Helper to generate platform-adaptive walking maps URL and button HTML (Apple Maps on iOS, Google Maps elsewhere)
function getWalkingMapsButtonHtml(startLat, startLng, destLat, destLng) {
    if (startLat === undefined || startLng === undefined || destLat === undefined || destLng === undefined) {
        return '';
    }
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    let url = '';
    let iconHtml = '';

    if (isIOS) {
        url = `http://maps.apple.com/?saddr=${startLat},${startLng}&daddr=${destLat},${destLng}&dirflg=w`;
        iconHtml = '<i class="fa-brands fa-apple"></i>';
    } else {
        url = `https://www.google.com/maps/dir/${startLat},${startLng}/${destLat},${destLng}/data=!3m1!4b1!4m2!4m1!3e2`;
        iconHtml = '<i class="fa-brands fa-google"></i>';
    }

    return `
        <a href="${url}" target="_blank" class="google-maps-link">
            ${iconHtml} Maps
        </a>
    `;
}

// Get road names for walking path using pathfinding
async function getWalkingPathRoadNames(startCoord, endCoord) {
    try {
        if (!window.pathfinder) {
            console.warn('Pathfinder not available');
            return [];
        }

        // Validate coordinates
        if (!startCoord || !endCoord || 
            startCoord.length !== 2 || endCoord.length !== 2 ||
            startCoord.some(coord => coord === undefined || coord === null) ||
            endCoord.some(coord => coord === undefined || coord === null)) {
            console.warn('Invalid coordinates provided:', { startCoord, endCoord });
            return [];
        }

            if (NAV_DEBUG) console.log('Computing pathfinding for coordinates:', { startCoord, endCoord });

        const pathResult = await pathfinder.computePath(startCoord, endCoord);
        
        if (!pathResult.success || !pathResult.path) {
            console.warn('Pathfinding failed or returned no path:', pathResult);
            return [];
        }

        // Extract unique road names from the path
        const roadNames = new Set();
        
        // Go through each segment of the path to find road names
        for (let i = 0; i < pathResult.path.length - 1; i++) {
            const currentNode = pathResult.path[i];
            const nextNode = pathResult.path[i + 1];
            
            // Find the edge between these nodes in the graph
            if (window.pathfinder.graph && window.pathfinder.graph.has(currentNode.nodeId)) {
                const nodeData = window.pathfinder.graph.get(currentNode.nodeId);
                const edgeData = nodeData.neighbors.get(nextNode.nodeId);
                
                if (edgeData && edgeData.properties) {
                    let roadName = null;
                    
                    // Debug: log the properties for the first few edges
                    if (i < 3) {
                        if (NAV_DEBUG) console.log(`Edge ${i} properties:`, {
                            name: edgeData.properties.name,
                            highway: edgeData.properties.highway,
                            other_tags: edgeData.properties.other_tags
                        });
                    }
                    
                    // First try the direct 'name' property
                    if (edgeData.properties.name) {
                        roadName = edgeData.properties.name;
                    } else if (edgeData.properties.other_tags) {
                        // Try to extract name from other_tags
                        const otherTags = edgeData.properties.other_tags;
                        
                        // Look for tiger:name_base and tiger:name_type
                        const nameBaseMatch = otherTags.match(/tiger:name_base"=>"([^"]+)"/);
                        const nameTypeMatch = otherTags.match(/tiger:name_type"=>"([^"]+)"/);
                        
                        if (nameBaseMatch && nameTypeMatch) {
                            roadName = `${nameBaseMatch[1]} ${nameTypeMatch[1]}`;
                        } else if (nameBaseMatch) {
                            roadName = nameBaseMatch[1];
                        }
                        
                        // Also check for ref property
                        if (!roadName) {
                            const refMatch = otherTags.match(/ref"=>"([^"]+)"/);
                            if (refMatch) {
                                roadName = `Route ${refMatch[1]}`;
                            }
                        }
                    }
                    
                    // Add roads and paths that are suitable for walking
                    if (roadName && edgeData.properties.highway) {
                        // Include named roads and paths
                        roadNames.add(roadName);
                                 if (i < 3 && NAV_DEBUG) console.log(`Added road name: ${roadName}`);
                    } else if (edgeData.properties.highway === 'footway' && edgeData.properties.other_tags) {
                        // Handle footways with special types
                        const otherTags = edgeData.properties.other_tags;
                        
                        if (otherTags.includes('footway"=>"sidewalk')) {
                            roadNames.add('Sidewalk');
                        } else if (otherTags.includes('footway"=>"crossing')) {
                            roadNames.add('Crosswalk');
                        } else if (otherTags.includes('footway"=>"path')) {
                            roadNames.add('Path');
                        } else {
                            roadNames.add('Walkway');
                        }
                        
                                 if (i < 3 && NAV_DEBUG) console.log(`Added footway type: ${otherTags}`);
                    } else if (edgeData.properties.highway === 'cycleway') {
                        roadNames.add('Bike Path');
                        if (i < 3 && NAV_DEBUG) console.log(`Added cycleway`);
                    } else if (i < 3) {
                        if (NAV_DEBUG) console.log(`Skipped road: name=${roadName}, highway=${edgeData.properties.highway}`);
                    }
                }
            }
        }

        // Remove consecutive duplicates and format for display
        const roadNamesArray = Array.from(roadNames);
        const filteredRoadNames = [];
        
        for (let i = 0; i < roadNamesArray.length; i++) {
            // Don't add if it's the same as the previous one
            if (i === 0 || roadNamesArray[i] !== roadNamesArray[i - 1]) {
                filteredRoadNames.push(roadNamesArray[i]);
            }
        }
        
        if (NAV_DEBUG) console.log('Extracted road names:', filteredRoadNames);
        return filteredRoadNames;
    } catch (error) {
        console.warn('Error getting road names for walking path:', error);
        return [];
    }
}

// Select the best route from available options based on various criteria
function selectBestRoute(routes, startStop, endStop) {
    const validRoutes = (routes || []).filter(r => {
        const n = String(r.name || '').toLowerCase();
        return n !== 'on1' && n !== 'on2' && !n.startsWith('on');
    });
    if (validRoutes.length === 0) return [];
    if (validRoutes.length === 1) return [validRoutes[0]];

    // Score routes based on multiple criteria (treat routes as circular)
    const scoredRoutes = validRoutes.map(route => {
        let score = 0;

        // Prefer routes with fewer stops between start and end (circular distance, less strict)
        const total = (route.stops || []).length;
        const diff = Math.abs(route.endIndex - route.startIndex);
        const circStopsBetween = total > 0 ? Math.min(diff, total - diff) : diff;
        score -= circStopsBetween * 3; // Softer penalty so longer-but-reasonable routes remain viable alternates

        // Prefer routes that go in the logical direction (start index < end index)
        if (route.startIndex < route.endIndex) {
            score += 5;
        }

        // Prefer shorter route names (might indicate more direct routes)
        score -= route.name.length;

        // Prefer routes that don't require going backwards
        const isForwardDirection = route.startIndex < route.endIndex;
        if (isForwardDirection) {
            score += 3;
        }

        // Strongly deprioritize weekend variants so they are not chosen by default
        const n = String(route.name || '').toLowerCase();
        if (n.startsWith('wknd')) {
            score -= 10000; // effectively never optimal unless only choices
        }

        return {
            route,
            score,
            stopsBetween: circStopsBetween
        };
    });

    // Return all routes sorted by score (best first)
    scoredRoutes.sort((a, b) => b.score - a.score);
    return scoredRoutes.map(r => r.route);
}

// Get detailed route information including stop names and order
function getRouteDetails(route, startStopId, endStopId) {
    if (!route) return null;
    if (route.isTransfer) {
        return route;
    }
    const stops = [];
    const total = (route.stops || []).length;
    if (total === 0) {
        return { ...route, stopsInOrder: stops, direction: 'forward', totalStops: 0 };
    }

    const startIndex = (typeof startStopId !== 'undefined' && startStopId !== null)
        ? (route.stops || []).indexOf(parseInt(startStopId))
        : (typeof route.startIndex === 'number' ? route.startIndex : -1);
    const endIndex = (typeof endStopId !== 'undefined' && endStopId !== null)
        ? (route.stops || []).indexOf(parseInt(endStopId))
        : (typeof route.endIndex === 'number' ? route.endIndex : -1);

    if (startIndex === -1 || endIndex === -1) {
        return { ...route, stopsInOrder: stops, direction: 'forward', totalStops: 0 };
    }

    // Always traverse forward along the route (routes are directional loops)
    const forwardDistance = (endIndex - startIndex + total) % total; // steps going forward wrapping
    const steps = forwardDistance;

    // Add stops in circular order
    for (let i = 0; i <= steps; i++) {
        const idx = (startIndex + i) % total;
        const stopId = route.stops[idx];
        if (stopsData[stopId]) {
            stops.push({
                id: stopId,
                name: stopsData[stopId].name,
                isBoardingStop: String(stopId) === String(startStopId),
                isAlightingStop: String(stopId) === String(endStopId)
            });
        }
    }

    return {
        ...route,
        stopsInOrder: stops,
        direction: 'forward',
        totalStops: stops.length
    };
}

// Compute the bus-leg travel time (minutes) between boarding and alighting
// stops for a route.
//
// stopsInOrder items are objects {id, ...} (from getRouteDetails), so ids are
// extracted before keying into etas/waits — the raw live feed is keyed by stop
// ID, not by the display object. When only some legs have data, the measured
// per-leg average is scaled to all legs so a partially-populated feed doesn't
// silently undercount. Falls back to stop-count × NAV_FALLBACK_MIN_PER_STOP
// using FORWARD (wrap-aware) distance, never the shortest-arc opposite direction.
function computeBusTravelTimeMinutes(route) {
    if (!route) return 0;
    if (route.isTransfer) {
        const t1 = route.leg1 && route.leg1.routeDetails ? computeBusTravelTimeMinutes(route.leg1.routeDetails) : 0;
        const t2 = route.leg2 && route.leg2.routeDetails ? computeBusTravelTimeMinutes(route.leg2.routeDetails) : 0;
        return t1 + t2;
    }

    const stopsInOrder = route.stopsInOrder || [];
    const ids = stopsInOrder.length
        ? stopsInOrder.map(s => (s && typeof s === 'object' && 'id' in s) ? s.id : s)
        : null;

    let legs = 0;
    if (ids && ids.length > 1) {
        legs = ids.length - 1;
    } else if (route.stops && route.stops.length > 0 && typeof route.startIndex === 'number' && typeof route.endIndex === 'number') {
        legs = calculateForwardDistance(route.startIndex, route.endIndex, route.stops.length);
    }
    if (legs <= 0) return 0;

    let etaSum = 0, etaCount = 0, waitSum = 0, waitCount = 0;
    if (ids && ids.length > 1) {
        for (let i = 0; i < ids.length - 1; i++) {
            const fromId = ids[i];
            const toId = ids[i + 1];
            const etaVal = (etas && etas[toId] && etas[toId].from && etas[toId].from[fromId])
                ? etas[toId].from[fromId]
                : null;
            if (typeof etaVal === 'number' && etaVal > 0) {
                etaSum += etaVal;
                etaCount++;
            }
            // Wait time at intermediate stops only (boarding stop has no wait).
            if (i < ids.length - 2 && waits && typeof waits[toId] === 'number' && waits[toId] > 0) {
                waitSum += waits[toId];
                waitCount++;
            }
        }
    }

    if (etaCount > 0 || waitCount > 0) {
        const avgEta = etaCount > 0 ? etaSum / etaCount : 0;
        const avgWait = waitCount > 0 ? waitSum / waitCount : 0;
        const seconds = avgEta * legs + avgWait * Math.max(0, legs - 1);
        return Math.ceil(seconds / 60);
    }

    return Math.ceil(legs * NAV_FALLBACK_MIN_PER_STOP);
}

// Compute door-to-stop walking time (seconds) for the boarding leg from a
// given walking distance object ({feet}), or 0 when there's no walk.
function getStartWalkSeconds(startWalkDist) {
    if (!startWalkDist || startWalkDist.feet <= 30) return 0;
    return Math.ceil(startWalkDist.feet / 220) * 60; // 220 ft/min ≈ 3 mph
}

// Build the HTML for the next 3 buses approaching the boarding stop on the
// selected route. Only buses arriving AFTER the walk to the stop are listed;
// the wait shown subtracts the walking time (so (0m wait) if you'd have to
// sprint).
// Top N buses approaching a given stop for a route, sorted soonest-first.
// Shared by the boarding ("next buses") list and the alighting ("arrival") list
// so both show the exact same buses. When fewer than `limit` buses are found on
// the current loop, merges in the same buses' second loop (first-loop ETA + one
// full route loop time) so the list always has up to `limit` entries when any
// qualifying buses exist.
function getTopApproachingBuses(routeName, stopId, walkSeconds, limit) {
    if (typeof busesByRoutes === 'undefined' || typeof selectedCampus === 'undefined' ||
        !busesByRoutes[selectedCampus]) {
        return [];
    }
    const lowerRouteName = String(routeName || '').toLowerCase();
    const routeKey = busesByRoutes[selectedCampus][lowerRouteName]
        ? lowerRouteName
        : Object.keys(busesByRoutes[selectedCampus]).find(k => k.toLowerCase() === lowerRouteName);
    if (!routeKey || !busesByRoutes[selectedCampus][routeKey]) return [];

    const targetLimit = (typeof limit === 'number' && limit > 0) ? limit : 3;
    const loopTimes = (typeof calculateLoopTimes === 'function') ? calculateLoopTimes() : null;
    let loopTimeSec = (loopTimes && typeof loopTimes[routeKey] === 'number' && isFinite(loopTimes[routeKey]) && loopTimes[routeKey] > 0)
        ? loopTimes[routeKey] * 60
        : null;
    if (!loopTimeSec && typeof NAV_FALLBACK_MIN_PER_STOP === 'number') {
        const stopList = (typeof stopLists !== 'undefined') ? stopLists[routeKey] : null;
        const numStops = (stopList && stopList.length) ? stopList.length : 8;
        loopTimeSec = numStops * NAV_FALLBACK_MIN_PER_STOP * 60;
    }
    if (!loopTimeSec || loopTimeSec <= 0) loopTimeSec = 20 * 60;

    const firstPasses = [];
    busesByRoutes[selectedCampus][routeKey].forEach(busName => {
        try {
            if (!busData[busName]) return;
            if (busData[busName].oos || busData[busName].atDepot) return;
            if (typeof isBusInService === 'function' && !isBusInService(busName)) return;
            if (typeof isBusShownOnMap === 'function' && !isBusShownOnMap(busName)) return;
            // ETA to the boarding stop (seconds) on the current loop
            const eta = (typeof getETAForStop === 'function') ? getETAForStop(busName, stopId) : undefined;
            if (typeof eta !== 'number' || !isFinite(eta) || eta < 0) return;
            // This bus's first catchable pass: walk forward loop by loop until the
            // ETA is late enough that the user can actually reach the stop. A bus
            // whose current-loop ETA is before the walk time is not "gone" — the
            // rider just catches it on a later loop.
            let catchEta = eta;
            let catchLoop = 1;
            while (walkSeconds > 0 && catchEta < walkSeconds && loopTimeSec > 0) {
                catchEta += loopTimeSec;
                catchLoop += 1;
            }
            if (walkSeconds > 0 && catchEta < walkSeconds) return;
            firstPasses.push({ busName, eta: catchEta, loop: catchLoop });
        } catch (e) {}
    });

    if (firstPasses.length === 0) return [];

    // Collect candidate passes: include subsequent loops for each bus so that
    // if fewer physical buses exist than targetLimit (e.g. 2 buses in service),
    // their next loop times are eligible and can populate the list up to targetLimit.
    const candidates = [...firstPasses];
    if (loopTimeSec > 0) {
        for (let nextLoop = 1; nextLoop < targetLimit; nextLoop++) {
            firstPasses.forEach(b => {
                candidates.push({
                    busName: b.busName,
                    eta: b.eta + (nextLoop * loopTimeSec),
                    loop: b.loop + nextLoop
                });
            });
        }
    }

    candidates.sort((a, b) => a.eta - b.eta);
    return candidates.slice(0, targetLimit);
}

function getUpcomingBusesHtml(routeName, stopId, walkSeconds, selectedBusName, selectedBusIndex, listType = 'boarding') {
    try {
        const now = Date.now();
        const top = getTopApproachingBuses(routeName, stopId, walkSeconds, 3);
        if (top.length === 0) return '';

        let selectedIdx = 0;
        if (typeof selectedBusIndex === 'number' && selectedBusIndex >= 0 && selectedBusIndex < top.length) {
            selectedIdx = selectedBusIndex;
        } else if (selectedBusName) {
            const foundIdx = top.findIndex(b => b.busName === selectedBusName);
            if (foundIdx >= 0) selectedIdx = foundIdx;
        }

        const showRadio = top.length > 1;
        const routeColor = getRouteColor(routeName);

        const rows = top.map((b, i) => {
            const arrivalTime = new Date(now + b.eta * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
            const waitMin = Math.max(0, Math.ceil((b.eta - walkSeconds) / 60));
            const busLabel = (busData[b.busName] && busData[b.busName].busName) ? busData[b.busName].busName : b.busName;
            const isSelected = i === selectedIdx;
            const radioHtml = showRadio ? `
                <span class="incoming-bus-radio">
                    <i class="fa-solid ${isSelected ? 'fa-circle-dot' : 'fa-circle'}"></i>
                </span>` : '';
            return {
                busName: b.busName,
                arrivalTime,
                waitMin,
                busLabel,
                routeColor,
                soonest: i === 0,
                isSelected,
                radioHtml,
                index: i
            };
        }).map(b => `
            <div class="incoming-bus-row ${showRadio ? 'selectable-incoming-bus' : ''} ${b.isSelected ? 'selected' : ''}" data-bus-name="${b.busName}" data-bus-index="${b.index}" data-list-type="${listType}" ${showRadio ? 'title="Tap to select this bus"' : ''}>
                ${b.radioHtml}
                <span class="incoming-bus-name" style="color: ${b.routeColor};">${typeof escapeHtml === 'function' ? escapeHtml(b.busLabel) : b.busLabel}</span>
                <span class="incoming-bus-arrival">arrives ${b.arrivalTime}</span>
                <span class="incoming-bus-wait ${b.soonest ? 'soonest' : ''}">${b.waitMin > 0 ? `${b.waitMin}m wait` : 'No wait'}</span>
            </div>
        `).join('');

        return `
            <div class="incoming-buses-list ${showRadio ? 'has-radio' : ''}" data-list-type="${listType}">
                ${rows}
            </div>
        `;
    } catch (e) {
        console.error('[nav] getUpcomingBusesHtml error:', e);
        return '';
    }
}
window.getUpcomingBusesHtml = getUpcomingBusesHtml;

// Arrival list shown under the alighting stop-row: the same buses as the
// boarding list, with two columns: bus name and "<arrival time> arrival time".
function getArrivingBusesHtml(routeName, boardingStopId, alightingStopId, walkSeconds, selectedBusName, selectedBusIndex) {
    try {
        const top = getTopApproachingBuses(routeName, boardingStopId, walkSeconds, 3);
        if (top.length === 0) return '';

        let selectedIdx = 0;
        if (typeof selectedBusIndex === 'number' && selectedBusIndex >= 0 && selectedBusIndex < top.length) {
            selectedIdx = selectedBusIndex;
        } else if (selectedBusName) {
            const foundIdx = top.findIndex(b => b.busName === selectedBusName);
            if (foundIdx >= 0) selectedIdx = foundIdx;
        }

        const now = Date.now();
        const rows = top.map((b, i) => {
            // ETA at the destination/alighting stop
            const etaSeconds = getBusArrivalETAAtStop(b, alightingStopId, routeName, 5);
            const arrivalTime = new Date(now + etaSeconds * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
            const busLabel = (busData[b.busName] && busData[b.busName].busName) ? busData[b.busName].busName : b.busName;
            const routeColor = getRouteColor(routeName);
            const isSelected = i === selectedIdx;
            return `
                <div class="destination-bus-row ${isSelected ? 'selected' : ''}" data-bus-name="${b.busName}">
                    <span class="destination-bus-name" style="color: ${routeColor};">${typeof escapeHtml === 'function' ? escapeHtml(busLabel) : busLabel}</span>
                    <span class="destination-bus-arrival">${arrivalTime} arrival</span>
                </div>
            `;
        }).join('');

        return `
            <div class="destination-buses-list">
                ${rows}
            </div>
        `;
    } catch (e) {
        console.error('[nav] getArrivingBusesHtml error:', e);
        return '';
    }
}
window.getArrivingBusesHtml = getArrivingBusesHtml;

// Calculate the arrival ETA (seconds from now) of approaching bus `b` at `destStopId`.
function getBusArrivalETAAtStop(b, destStopId, routeName, fallbackMin) {
    if (!b) return 0;
    let eta = (typeof getETAForStop === 'function') ? getETAForStop(b.busName, destStopId) : undefined;
    const loopTimes = (typeof calculateLoopTimes === 'function') ? calculateLoopTimes() : null;
    const lower = String(routeName || '').toLowerCase();
    let loopTimeSec = (loopTimes && typeof loopTimes[lower] === 'number' && isFinite(loopTimes[lower]) && loopTimes[lower] > 0)
        ? loopTimes[lower] * 60
        : null;
    if (!loopTimeSec && typeof NAV_FALLBACK_MIN_PER_STOP === 'number') {
        const stopList = (typeof stopLists !== 'undefined') ? stopLists[lower] : null;
        const numStops = (stopList && stopList.length) ? stopList.length : 8;
        loopTimeSec = numStops * NAV_FALLBACK_MIN_PER_STOP * 60;
    }
    if (!loopTimeSec || loopTimeSec <= 0) loopTimeSec = 20 * 60;

    if (typeof eta === 'number' && isFinite(eta) && eta >= 0) {
        if (b.loop && b.loop > 1 && loopTimeSec) {
            eta += (b.loop - 1) * loopTimeSec;
        }
        while (eta < b.eta && loopTimeSec > 0) {
            eta += loopTimeSec;
        }
        return eta;
    }
    return (b.eta || 0) + (Math.max(1, fallbackMin || 5) * 60);
}
window.getBusArrivalETAAtStop = getBusArrivalETAAtStop;

// Build the HTML for the transfer stop containing BOTH:
// 1. Destination buses list (Leg 1): 3 soonest buses from Leg 1 approaching the transfer stop,
//    tappable to select which Leg 1 bus the user is taking (earliest/soonest selected by default).
// 2. Incoming buses list (Leg 2): 3 soonest buses departing the transfer stop towards the alighting stop,
//    filtered to only include buses arriving at or after the selected Leg 1 bus reaches the transfer stop.
function getTransferBusesHtml(leg1RouteName, leg2RouteName, startStopId, transferStopId, walkSeconds, selectedBusName, leg1TravelMin, selectedBusIndex, selectedLeg2BusName, selectedLeg2BusIndex) {
    try {
        // For a route option requiring a transfer, BOTH routes must be in service.
        // If either route is not in service (e.g. options to the right of the vertical line),
        // the transfer cannot be made and we don't know when it should occur, so hide both lists.
        if (typeof navRouteHasLiveBuses === 'function') {
            if (!navRouteHasLiveBuses(leg1RouteName) || !navRouteHasLiveBuses(leg2RouteName)) {
                return '';
            }
        }

        const topLeg1 = getTopApproachingBuses(leg1RouteName, startStopId, walkSeconds, 3);
        const topLeg2Fallback = getTopApproachingBuses(leg2RouteName, transferStopId, walkSeconds + ((leg1TravelMin || 5) * 60), 3);
        if (topLeg1.length === 0 || topLeg2Fallback.length === 0) return '';

        const now = Date.now();
        const leg1Color = getRouteColor(leg1RouteName);
        const leg2Color = getRouteColor(leg2RouteName);

        let destListHtml = '';
        let selectedArrivalSec = walkSeconds + ((leg1TravelMin || 5) * 60);

        if (topLeg1.length > 0) {
            let selectedIndex = 0;
            if (typeof selectedBusIndex === 'number' && selectedBusIndex >= 0 && selectedBusIndex < topLeg1.length) {
                selectedIndex = selectedBusIndex;
            } else if (selectedBusName) {
                const idx = topLeg1.findIndex(b => b.busName === selectedBusName);
                if (idx >= 0) selectedIndex = idx;
            }
            selectedArrivalSec = getBusArrivalETAAtStop(topLeg1[selectedIndex], transferStopId, leg1RouteName, leg1TravelMin);

            const showRadio = topLeg1.length > 1;
            const destRows = topLeg1.map((b, i) => {
                const isSelected = i === selectedIndex;
                const etaTransfer = getBusArrivalETAAtStop(b, transferStopId, leg1RouteName, leg1TravelMin);
                const arrivalTime = new Date(now + etaTransfer * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
                const busLabel = (busData[b.busName] && busData[b.busName].busName) ? busData[b.busName].busName : b.busName;
                const radioHtml = showRadio ? `
                        <span class="transfer-bus-radio">
                            <i class="fa-solid ${isSelected ? 'fa-circle-dot' : 'fa-circle'}"></i>
                        </span>` : '';
                return `
                    <div class="destination-bus-row ${showRadio ? 'selectable-transfer-bus' : ''} ${isSelected ? 'selected' : ''}" data-bus-name="${b.busName}" data-bus-index="${i}" data-eta-transfer="${etaTransfer}" ${showRadio ? 'title="Tap to select this bus"' : ''}>
                        ${radioHtml}
                        <span class="destination-bus-name" style="color: ${leg1Color};">${typeof escapeHtml === 'function' ? escapeHtml(busLabel) : busLabel}</span>
                        <span class="destination-bus-arrival">${arrivalTime} arrival</span>
                    </div>
                `;
            }).join('');

            destListHtml = `
                <div class="destination-buses-list transfer-destination-buses-list ${showRadio ? 'has-radio' : ''}">
                    ${destRows}
                </div>
            `;
        }

        // Connecting Leg 2 buses arriving AT OR AFTER selectedArrivalSec
        const topLeg2 = getTopApproachingBuses(leg2RouteName, transferStopId, selectedArrivalSec, 3);
        if (topLeg2.length === 0) return '';

        let selectedLeg2Idx = 0;
        if (typeof selectedLeg2BusIndex === 'number' && selectedLeg2BusIndex >= 0 && selectedLeg2BusIndex < topLeg2.length) {
            selectedLeg2Idx = selectedLeg2BusIndex;
        } else if (selectedLeg2BusName) {
            const idx = topLeg2.findIndex(b => b.busName === selectedLeg2BusName);
            if (idx >= 0) selectedLeg2Idx = idx;
        }

        const showLeg2Radio = topLeg2.length > 1;

        let incomingRows = topLeg2.map((b, i) => {
            const isSelected = i === selectedLeg2Idx;
            const arrivalTime = new Date(now + b.eta * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
            const waitMin = Math.max(0, Math.ceil((b.eta - selectedArrivalSec) / 60));
            const busLabel = (busData[b.busName] && busData[b.busName].busName) ? busData[b.busName].busName : b.busName;
            const radioHtml = showLeg2Radio ? `
                    <span class="incoming-bus-radio">
                        <i class="fa-solid ${isSelected ? 'fa-circle-dot' : 'fa-circle'}"></i>
                    </span>` : '';
            return `
                <div class="incoming-bus-row ${showLeg2Radio ? 'selectable-incoming-bus' : ''} ${isSelected ? 'selected' : ''}" data-bus-name="${b.busName}" data-bus-index="${i}" data-list-type="transfer_leg2" ${showLeg2Radio ? 'title="Tap to select this bus"' : ''}>
                    ${radioHtml}
                    <span class="incoming-bus-name" style="color: ${leg2Color};">${typeof escapeHtml === 'function' ? escapeHtml(busLabel) : busLabel}</span>
                    <span class="incoming-bus-arrival">arrives ${arrivalTime}</span>
                    <span class="incoming-bus-wait ${i === 0 ? 'soonest' : ''}">${waitMin > 0 ? `${waitMin}m wait` : 'No wait'}</span>
                </div>
            `;
        }).join('');

        const incomingListHtml = `
            <div class="incoming-buses-list transfer-incoming-buses-list ${showLeg2Radio ? 'has-radio' : ''}" data-list-type="transfer_leg2">
                ${incomingRows}
            </div>
        `;

        if (!destListHtml || !incomingListHtml) return '';

        return `
            <div class="transfer-buses-container">
                <div class="transfer-top-bus-wrapper">
                    ${destListHtml}
                    <div class="transfer-buses-connector">
                        <div class="transfer-connector-line"></div>
                        <div class="transfer-connector-triangle"></div>
                    </div>
                </div>
                ${incomingListHtml}
            </div>
        `;
    } catch (e) {
        console.error('[nav] getTransferBusesHtml error:', e);
        return '';
    }
}
window.getTransferBusesHtml = getTransferBusesHtml;

async function loadAndDisplayRoadNetwork() {
    try {
        // Check if layer already exists and remove it
        if (roadNetworkLayer) {
            map.removeLayer(roadNetworkLayer);
            roadNetworkLayer = null;
        }

        // Load road network data (reuses existing data if already loaded)
        const geojsonData = await _loadRoadNetworkData();
        if (!geojsonData) {
            throw new Error('Failed to load road network data');
        }

        // Create the GeoJSON layer with custom styling
        roadNetworkLayer = L.geoJSON(geojsonData, {
            style: function(feature) {
                // Style based on highway type
                const highway = feature.properties.highway;
                let style = {
                    weight: 2,
                    opacity: 0.8,
                    color: '#666666' // Default gray color
                };

                // Customize style based on highway type
                switch(highway) {
                    case 'motorway':
                    case 'motorway_link':
                        style.color = '#ff0000'; // Red for highways
                        style.weight = 4;
                        break;
                    case 'trunk':
                    case 'primary':
                        style.color = '#ff6600'; // Orange for major roads
                        style.weight = 3;
                        break;
                    case 'secondary':
                    case 'tertiary':
                        style.color = '#ffaa00'; // Yellow-orange for secondary roads
                        style.weight = 3;
                        break;
                    case 'residential':
                        style.color = '#ffffff'; // White for residential roads
                        style.weight = 2;
                        break;
                    case 'service':
                        style.color = '#cccccc'; // Light gray for service roads
                        style.weight = 1;
                        style.opacity = 0.6;
                        break;
                    case 'footway':
                    case 'path':
                    case 'cycleway':
                        style.color = '#00ff00'; // Green for pedestrian/cycle paths
                        style.weight = 2;
                        style.dashArray = '5, 5';
                        break;
                    case 'railway':
                        style.color = '#000000'; // Black for railways
                        style.weight = 2;
                        style.dashArray = '10, 10';
                        break;
                    default:
                        // Keep default style
                        break;
                }

                return style;
            },

            onEachFeature: function(feature, layer) {
                // Add popup with road information
                if (feature.properties.name) {
                    layer.bindPopup(`<strong>${feature.properties.name}</strong><br>Type: ${feature.properties.highway}`);
                }
            }
        });

        // Add the layer to the map
        roadNetworkLayer.addTo(map);

        showNavigationMessage('Road network displayed on map');

    } catch (error) {
        console.error('Error loading road network:', error);
        showNavigationMessage('Failed to load road network');
    }
}

function toggleRoadNetwork() {
    if (roadNetworkLayer) {
        // Remove the layer
        map.removeLayer(roadNetworkLayer);
        roadNetworkLayer = null;
        showNavigationMessage('Road network hidden');
    } else {
        // Load and display the layer
        loadAndDisplayRoadNetwork();
    }
}

// Load road network data (internal function)
async function _loadRoadNetworkData() {
    if (roadNetworkData) {
        return roadNetworkData; // Already loaded
    }

    try {
        const response = await fetch('lib/geojson/lines.geojson');
        if (!response.ok) {
            throw new Error(`Failed to load road network data: ${response.statusText}`);
        }

        roadNetworkData = await response.json();
        return roadNetworkData;
    } catch (error) {
        console.error('Error loading road network data:', error);
        return null;
    }
}

// Load road network data for address lookups (without displaying)
async function loadRoadNetworkData() {
    return await _loadRoadNetworkData();
}

// Find the nearest road/address to a given coordinate
async function getNearestAddress(lat, lng) {
    if (!roadNetworkData) {
        await loadRoadNetworkData();
        if (!roadNetworkData) {
            return null;
        }
    }

    let nearestRoad = null;
    let minDistance = Infinity;

    // Check each road segment
    roadNetworkData.features.forEach(feature => {
        if (!feature.geometry || feature.geometry.type !== 'LineString') {
            return;
        }

        const coordinates = feature.geometry.coordinates;
        if (!Array.isArray(coordinates) || coordinates.length === 0) {
            return;
        }

        // Calculate distance to the closest point on this road segment
        let segmentMinDistance = Infinity;

        for (let i = 0; i < coordinates.length - 1; i++) {
            const point1 = coordinates[i];
            const point2 = coordinates[i + 1];

            // Convert to [lat, lng] format if needed
            const roadLat1 = Array.isArray(point1) ? point1[1] : point1.lat;
            const roadLng1 = Array.isArray(point1) ? point1[0] : point1.lng;
            const roadLat2 = Array.isArray(point2) ? point2[1] : point2.lat;
            const roadLng2 = Array.isArray(point2) ? point2[0] : point2.lng;

            // Calculate distance from user point to this line segment
            const distance = distanceToLineSegment(lat, lng, roadLat1, roadLng1, roadLat2, roadLng2);
            segmentMinDistance = Math.min(segmentMinDistance, distance);
        }

        if (segmentMinDistance < minDistance) {
            minDistance = segmentMinDistance;
            nearestRoad = feature;
        }
    });

    if (nearestRoad && nearestRoad.properties) {
        const properties = nearestRoad.properties;

        // Try to get road name in order of preference
        let roadName = null;

        if (properties.name) {
            roadName = properties.name;
        } else if (properties.ref) {
            roadName = `Route ${properties.ref}`;
        } else if (properties.highway) {
            roadName = `Unnamed ${properties.highway} road`;
        }

        // Only return if we're reasonably close (within ~50 meters)
        // Exclude footways and service roads (the main culprits for "Unnamed X road")
        const excludedRoadTypes = ['footway', 'path', 'cycleway', 'track', 'bridleway', 'steps', 'service'];
        // Use the same threshold as other parts of the app (~50 meters)
        const roadDistanceThreshold = 0.00045; // ~50 meters
        if (roadName && minDistance < roadDistanceThreshold && !excludedRoadTypes.includes(properties.highway)) {
            return {
                name: roadName,
                distance: minDistance,
                type: properties.highway || 'road'
            };
        }
    }

    return null;
}

// Calculate distance from a point to a line segment
function distanceToLineSegment(px, py, x1, y1, x2, y2) {
    const A = px - x1;
    const B = py - y1;
    const C = x2 - x1;
    const D = y2 - y1;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;

    if (lenSq !== 0) {
        param = dot / lenSq;
    }

    let xx, yy;

    if (param < 0) {
        xx = x1;
        yy = y1;
    } else if (param > 1) {
        xx = x2;
        yy = y2;
    } else {
        xx = x1 + param * C;
        yy = y1 + param * D;
    }

    const dx = px - xx;
    const dy = py - yy;
    return Math.sqrt(dx * dx + dy * dy);
}

// Format a user-facing label for a route, showing WKND variants on their own
// (overnight ON routes are no longer in service).
function formatRouteLabel(routeName) {
    const n = String(routeName || '').toLowerCase();
    if (n.includes('-')) {
        const parts = n.split('-');
        return `${formatRouteLabel(parts[0])} → ${formatRouteLabel(parts[1])}`;
    }
    const m = n.match(/^(?:wknd|on)(\d+)/);
    if (m) {
        const v = m[1];
        return `WKND${v}`;
    }
    return String(routeName || '').toUpperCase();
}

// Format route label with route color (WKND variants shown on their own)
function getRouteColor(routeName) {
    const n = String(routeName || '').toLowerCase();
    if (n.includes('-')) {
        return getRouteColor(n.split('-')[0]);
    }
    const m = n.match(/^(?:wknd|on)(\d+)/);
    if (m) {
        const wkKey = `wknd${m[1]}`;
        return (typeof colorMappings !== 'undefined' && colorMappings[wkKey]) ? colorMappings[wkKey] : '#111827';
    }
    return (typeof colorMappings !== 'undefined' && colorMappings[n]) ? colorMappings[n] : '#111827';
}

// Decorated route label with WKND/ON variant expansion (used in route badges).
function formatRouteLabelColored(routeName) {
    const original = String(routeName || '');
    const n = original.toLowerCase();
    if (n.includes('-')) {
        const parts = n.split('-');
        return `${formatRouteLabelColored(parts[0])} <span style="opacity: 0.7; font-size: 0.9em; margin: 0 0.2rem;">→</span> ${formatRouteLabelColored(parts[1])}`;
    }
    const m = n.match(/^(?:wknd|on)(\d+)/);
    if (m) {
        return `<span style="color: ${getRouteColor(routeName)};">WKND${m[1]}</span>`;
    }
    return `<span style="color: ${getRouteColor(routeName)};">${original.toUpperCase()}</span>`;
}

// Load road names for walking segments and update the UI (non-blocking)
function loadWalkingRoadNames(startBuilding, endBuilding, startStop, endStop, startIsStop, endIsStop) {
    const isDirectWalk = !startStop && !endStop && startBuilding && endBuilding;
    const hasStartWalk = isDirectWalk || !!(startBuilding && startStop && (!startIsStop || String(startBuilding.id) !== String(startStop.id)));
    const hasEndWalk = !isDirectWalk && !!(endBuilding && endStop && (!endIsStop || String(endBuilding.id) !== String(endStop.id)));

    // Run pathfinding in background without blocking UI
    Promise.all([
        // Start walking segment pathfinding
        hasStartWalk ? 
            (isDirectWalk ? loadStartWalkingRoads(startBuilding, endBuilding) : loadStartWalkingRoads(startBuilding, startStop)) : Promise.resolve(),
        
        // End walking segment pathfinding  
        hasEndWalk ? 
            loadEndWalkingRoads(endBuilding, endStop) : Promise.resolve()
    ]).catch(error => {
        console.warn('Error loading walking road names:', error);
        // Hide the road lists if there's an error
        $('#start-walking-roads, #end-walking-roads').hide();
    });
}

// Helper function to load start walking road names
async function loadStartWalkingRoads(startBuilding, startStop) {
    try {
        const startLng = (typeof startBuilding.lng !== 'undefined') ? startBuilding.lng : startBuilding.longitude;
        const startLat = (typeof startBuilding.lat !== 'undefined') ? startBuilding.lat : startBuilding.latitude;
        const stopLng = (typeof startStop.longitude !== 'undefined') ? startStop.longitude : startStop.lng;
        const stopLat = (typeof startStop.latitude !== 'undefined') ? startStop.latitude : startStop.lat;
        const startCoord = [startLng, startLat];
        const stopCoord = [stopLng, stopLat];
        
        if (NAV_DEBUG) console.log('Start walking path coordinates:', { startCoord, stopCoord });
        
        
        // Show loading indicator
        const startRoadsList = $('#start-walking-roads');
        if (startRoadsList.length > 0) {
            startRoadsList.find('.roads-sequence').html(
                `<span style="color: var(--theme-color-lighter); font-weight: 500; animation: navPulse 1s ease-in-out infinite;">Computing walking path...</span>`
            );
        }
        
        // Yield control to event loop before heavy computation
        await new Promise(resolve => setTimeout(resolve, 0));
        
        const roadNames = await getWalkingPathRoadNames(startCoord, stopCoord);
        if (NAV_DEBUG) console.log('Start roads list found:', startRoadsList.length, 'Road names:', roadNames);
        
        if (startRoadsList.length > 0) {
            if (roadNames.length > 0) {
                const roadText = roadNames.length === 1 && roadNames[0] === 'Sidewalk' 
                    ? 'Use sidewalks and crosswalks'
                    : roadNames.join(' → ');
                
                if (NAV_DEBUG) console.log('Setting start road text:', roadText);
                startRoadsList.find('.roads-sequence').html(
                    `<span style="color: var(--theme-stops-list-text);">${roadText}</span>`
                );
                
                // Elements are already visible, just reposition connector
                positionGlobalWaypointConnector();
                if (NAV_DEBUG) console.log('Start roads list shown');
            } else {
                if (NAV_DEBUG) console.log('Hiding start roads list - no road names');
                startRoadsList.hide();
            }
        } else {
            if (NAV_DEBUG) console.log('Start roads list element not found');
        }
    } catch (error) {
        console.warn('Error loading start walking roads:', error);
        $('#start-walking-roads').hide();
    }
}

// Helper function to load end walking road names
async function loadEndWalkingRoads(endBuilding, endStop) {
    try {
        const stopCoord = [endStop.longitude, endStop.latitude];
        const endCoord = [endBuilding.lng, endBuilding.lat];
        
        if (NAV_DEBUG) console.log('End walking path coordinates:', { stopCoord, endCoord });
        
        
        // Show loading indicator
        const endRoadsList = $('#end-walking-roads');
        if (endRoadsList.length > 0) {
            endRoadsList.find('.roads-sequence').html(
                `<span style="color: var(--theme-color-lighter); font-weight: 500; animation: navPulse 1s ease-in-out infinite;">Computing walking path...</span>`
            );
        }
        
        // Yield control to event loop before heavy computation
        await new Promise(resolve => setTimeout(resolve, 0));
        
        const roadNames = await getWalkingPathRoadNames(stopCoord, endCoord);
        if (NAV_DEBUG) console.log('End roads list found:', endRoadsList.length, 'Road names:', roadNames);
        
        if (endRoadsList.length > 0) {
            if (roadNames.length > 0) {
                const roadText = roadNames.length === 1 && roadNames[0] === 'Sidewalk' 
                    ? 'Use sidewalks and crosswalks'
                    : roadNames.join(' → ');
                
                if (NAV_DEBUG) console.log('Setting end road text:', roadText);
                endRoadsList.find('.roads-sequence').html(
                    `<span style="color: var(--theme-stops-list-text);">${roadText}</span>`
                );
                
                // Elements are already visible, just reposition connector
                positionGlobalWaypointConnector();
                if (NAV_DEBUG) console.log('End roads list shown');
            } else {
                if (NAV_DEBUG) console.log('Hiding end roads list - no road names');
                endRoadsList.hide();
            }
        } else {
            if (NAV_DEBUG) console.log('End roads list element not found');
        }
    } catch (error) {
        console.warn('Error loading end walking roads:', error);
        $('#end-walking-roads').hide();
    }
}

// Calculate total walking minutes for a candidate route option
function calculateOptionWalkMinutes(r, combo, routeData) {
    const rd = routeData || (navRouteSession && navRouteSession.routeData) || null;
    const startBuilding = (rd && rd.startBuilding) || null;
    const endBuilding = (rd && rd.endBuilding) || null;
    const startIsStop = !!(rd && rd.startIsStop);
    const endIsStop = !!(rd && rd.endIsStop);

    const startStop = (combo && combo.startStop) || (r && r.startStop) || (rd && rd.startStop) || null;
    const endStop = (combo && combo.endStop) || (r && r.endStop) || (rd && rd.endStop) || null;

    const rawStartWalk = (combo && typeof combo.startWalkDistance !== 'undefined')
        ? combo.startWalkDistance
        : ((r && typeof r.startWalkDistance !== 'undefined') ? r.startWalkDistance : (rd && rd.startWalkDistance));

    const rawEndWalk = (combo && typeof combo.endWalkDistance !== 'undefined')
        ? combo.endWalkDistance
        : ((r && typeof r.endWalkDistance !== 'undefined') ? r.endWalkDistance : (rd && rd.endWalkDistance));

    const hasStartWalk = !!(rawStartWalk && rawStartWalk.feet > 30 && startStop && startBuilding && (String(startStop.id) !== String(startBuilding.id) || !startIsStop));
    const hasEndWalk = !!(rawEndWalk && rawEndWalk.feet > 30 && endStop && endBuilding && (String(endStop.id) !== String(endBuilding.id) || !endIsStop));

    const startWalkMin = hasStartWalk ? Math.ceil((rawStartWalk.feet || 0) / 220) : 0;
    const endWalkMin = hasEndWalk ? Math.ceil((rawEndWalk.feet || 0) / 220) : 0;
    return startWalkMin + endWalkMin;
}
window.calculateOptionWalkMinutes = calculateOptionWalkMinutes;

// Calculate journey minutes for a candidate route option
function calculateOptionJourneyMinutes(r, combo, routeData) {
    let totalMinutes = calculateOptionWalkMinutes(r, combo, routeData);
    const rd = routeData || (navRouteSession && navRouteSession.routeData) || null;
    const rawStartWalk = (combo && typeof combo.startWalkDistance !== 'undefined')
        ? combo.startWalkDistance
        : ((r && typeof r.startWalkDistance !== 'undefined') ? r.startWalkDistance : (rd && rd.startWalkDistance));
    const startBuilding = (rd && rd.startBuilding) || null;
    const routeStartStop = (combo && combo.startStop) || (r && r.startStop) || (rd && rd.startStop) || null;
    const startIsStop = !!(rd && rd.startIsStop);
    const hasStartWalk = !!(rawStartWalk && rawStartWalk.feet > 30 && routeStartStop && startBuilding && (String(routeStartStop.id) !== String(startBuilding.id) || !startIsStop));
    const startWalkSec = hasStartWalk ? getStartWalkSeconds(rawStartWalk) : 0;

    if (r.isTransfer || (combo && combo.isTransfer)) {
        const leg1 = (combo && combo.leg1) || r.leg1;
        const leg2 = (combo && combo.leg2) || r.leg2;
        const startStop = (combo && combo.startStop) || (leg1 && leg1.startStop) || routeStartStop;
        const transferStop = (combo && combo.transferStop) || (leg1 && leg1.transferStop) || (leg2 && leg2.transferStop) || r.transferStop;
        const endStop = (combo && combo.endStop) || (leg2 && leg2.endStop) || (routeData && routeData.endStop);

        if (leg1 && leg2 && startStop && transferStop && endStop) {
            const leg1Details = leg1.routeDetails || getRouteDetails(leg1.route, startStop.id, transferStop.id);
            const leg1TravelMinutes = computeBusTravelTimeMinutes(leg1Details);
            totalMinutes += leg1TravelMinutes;

            let leg1WaitMinutes = 0;
            if (navRouteHasLiveBuses(leg1.route.name)) {
                const top1 = getTopApproachingBuses(leg1.route.name, startStop.id, startWalkSec, 1);
                if (top1.length > 0) {
                    leg1WaitMinutes = Math.max(0, Math.ceil((top1[0].eta - startWalkSec) / 60));
                    totalMinutes += leg1WaitMinutes;
                }
            }

            const leg2Details = leg2.routeDetails || getRouteDetails(leg2.route, transferStop.id, endStop.id);
            const leg2TravelMinutes = computeBusTravelTimeMinutes(leg2Details);
            totalMinutes += leg2TravelMinutes;

            const arriveAtTransferSec = startWalkSec + (leg1WaitMinutes * 60) + (leg1TravelMinutes * 60);
            if (navRouteHasLiveBuses(leg2.route.name)) {
                const minTransferSec = arriveAtTransferSec + 120; // 2 min transfer buffer
                const top2 = getTopApproachingBuses(leg2.route.name, transferStop.id, minTransferSec, 1);
                if (top2.length > 0) {
                    const leg2WaitMinutes = Math.max(2, Math.ceil((top2[0].eta - arriveAtTransferSec) / 60));
                    totalMinutes += leg2WaitMinutes;
                } else {
                    totalMinutes += 5;
                }
            } else {
                totalMinutes += 5;
            }

            return totalMinutes;
        }
    }

    const endStop = (combo && combo.endStop) || (routeData && routeData.endStop);

    const effectiveRoute = (routeStartStop && endStop)
        ? getRouteDetails(r, routeStartStop.id, endStop.id)
        : r;

    totalMinutes += computeBusTravelTimeMinutes(effectiveRoute);

    // Wait at the boarding stop: the soonest approaching bus you can
    // actually catch (after the walk there). Skipped only if no live
    // data exists yet — then the wait is just unknown, not zero.
    if (routeStartStop && navRouteHasLiveBuses(r.name)) {
        const top = getTopApproachingBuses(r.name, routeStartStop.id, startWalkSec, 1);
        if (top.length > 0) {
            totalMinutes += Math.max(0, Math.ceil((top[0].eta - startWalkSec) / 60));
        }
    }

    return totalMinutes;
}

// Filter transfer route options: only show transfer options that have a shorter
// total time than the slowest direct route, or considerably less walking (saves >= 4 min walk).
function filterTransferRoutesForDisplay(routesForDisplay, routeCombosMap, routeData) {
    if (!routesForDisplay || routesForDisplay.length <= 1) return routesForDisplay;

    const getTotalMinutes = (entry) => {
        if (typeof entry.journeyMinutes === 'number' && entry.journeyMinutes > 0) {
            return entry.journeyMinutes;
        }
        const rKey = entry.route && entry.route.name && String(entry.route.name).toLowerCase();
        const combo = routeCombosMap && routeCombosMap[rKey];
        return calculateOptionJourneyMinutes(entry.route, combo, routeData) || 0;
    };

    const getWalkMinutes = (entry) => {
        if (typeof entry.walkMinutes === 'number' && entry.walkMinutes > 0) {
            return entry.walkMinutes;
        }
        const rKey = entry.route && entry.route.name && String(entry.route.name).toLowerCase();
        const combo = routeCombosMap && routeCombosMap[rKey];
        return calculateOptionWalkMinutes(entry.route, combo, routeData) || 0;
    };

    const isTransferEntry = (entry) => {
        return !!(entry.isTransfer || (entry.route && (entry.route.isTransfer || (entry.route.leg1 && entry.route.leg2))));
    };

    const directRoutes = routesForDisplay.filter(e => !isTransferEntry(e) && !e.isWalk && !(e.route && e.route.isWalk));
    const transferRoutes = routesForDisplay.filter(e => isTransferEntry(e));

    // If there are no direct routes or no transfer routes, nothing to filter
    if (directRoutes.length === 0 || transferRoutes.length === 0) {
        return routesForDisplay;
    }

    // Determine direct routes to compare against (prefer live direct routes if any exist)
    const liveDirectRoutes = directRoutes.filter(e => e.hasLive);
    const comparisonDirects = liveDirectRoutes.length > 0 ? liveDirectRoutes : directRoutes;

    // Slowest direct route's total time (max total time among direct routes)
    const directTotalTimes = comparisonDirects.map(getTotalMinutes);
    const slowestDirectTotalTime = Math.max(...directTotalTimes);

    // Minimum walking time among direct routes
    const directWalkTimes = comparisonDirects.map(getWalkMinutes);
    const minDirectWalk = Math.min(...directWalkTimes);

    // 1. Transfer routes with significantly less walking (always kept, independent of travel time)
    const lowWalkingTransfers = transferRoutes.filter(t => (minDirectWalk - getWalkMinutes(t) >= 4));

    // 2. Remaining transfer routes
    const otherTransfers = transferRoutes.filter(t => !lowWalkingTransfers.includes(t));

    // Faster than the slowest direct route (always kept)
    const fasterTransfers = otherTransfers.filter(t => {
        const tTime = getTotalMinutes(t);
        return tTime > 0 && slowestDirectTotalTime > 0 && tTime < slowestDirectTotalTime;
    });

    // Slower than the slowest direct route (show a maximum of ONE more slower transfer option after the slowest direct route)
    const slowerTransfers = otherTransfers
        .filter(t => !fasterTransfers.includes(t))
        .sort((a, b) => getTotalMinutes(a) - getTotalMinutes(b));

    const maxOneSlowerTransfer = slowerTransfers.slice(0, 1);

    const eligibleTransfers = new Set([
        ...lowWalkingTransfers,
        ...fasterTransfers,
        ...maxOneSlowerTransfer
    ]);

    return routesForDisplay.filter(e => !isTransferEntry(e) || eligibleTransfers.has(e));
}
window.filterTransferRoutesForDisplay = filterTransferRoutesForDisplay;

// Sort route options: live routes first (sorted ascending by journey time), then inactive routes (sorted ascending)
function sortRoutesForDisplay(routesForDisplay) {
    routesForDisplay.sort((a, b) => {
        const aWknd = String(a.displayName || a.route.name || '').toLowerCase().startsWith('wknd');
        const bWknd = String(b.displayName || b.route.name || '').toLowerCase().startsWith('wknd');
        if (a.hasLive && !b.hasLive) return -1;
        if (!a.hasLive && b.hasLive) return 1;
        if (!a.hasLive && !b.hasLive && aWknd !== bWknd) {
            return aWknd ? 1 : -1;
        }
        if (a.journeyMinutes !== b.journeyMinutes) {
            return a.journeyMinutes - b.journeyMinutes;
        }
        const getStops = (entry) => {
            if (entry.isWalk || (entry.route && entry.route.isWalk)) return 0;
            if (entry.route && entry.route.isTransfer) {
                const s1 = (entry.route.leg1?.routeDetails?.stopsInOrder?.length) || (entry.route.leg1?.stops?.length) || 0;
                const s2 = (entry.route.leg2?.routeDetails?.stopsInOrder?.length) || (entry.route.leg2?.stops?.length) || 0;
                return s1 + s2;
            }
            return (entry.route.stopsInOrder ? entry.route.stopsInOrder.length : entry.route.totalStops) || 0;
        };
        return getStops(a) - getStops(b);
    });
}

// Build HTML for route selector pills
function buildRouteSelectorHtml(routesForDisplay, selectedRouteDisplayIndex) {
    if (!routesForDisplay || routesForDisplay.length <= 1) return '';
    let _lastLiveIdx = -1;
    for (let i = 0; i < routesForDisplay.length; i++) {
        if (routesForDisplay[i].hasLive) _lastLiveIdx = i;
    }
    const _hasBoth = _lastLiveIdx >= 0 && _lastLiveIdx < routesForDisplay.length - 1;

    const routeOptions = routesForDisplay.map((entry, index) => {
        const isSelected = index === selectedRouteDisplayIndex;
        const route = entry.route;
        const isTransfer = !!(route.isTransfer || entry.isTransfer);
        const isWalk = !!(route.isWalk || entry.isWalk);
        const routeKey = route.name.toLowerCase();
        const label = entry.displayName;

        let style = '';
        let labelHtml = '';

        if (isWalk) {
            if (isSelected) {
                style = `background-color: var(--theme-accent); color: white; border-color: transparent !important;`;
                labelHtml = `<span class="route-option-label" style="color: white; font-weight: 700;"><i class="fa-solid fa-person-walking" style="margin-right: 0.35rem; color: white;"></i>Walk</span>`;
            } else {
                style = `background-color: var(--theme-unselected-route-bg); color: var(--theme-unselected-route-text); border-color: transparent !important;`;
                labelHtml = `<span class="route-option-label" style="color: var(--theme-unselected-route-text); font-weight: 700;"><i class="fa-solid fa-person-walking" style="margin-right: 0.35rem; color: var(--theme-stops-list-text);"></i>Walk</span>`;
            }
        } else if (isTransfer) {
            const l1 = (route.leg1 && route.leg1.route && route.leg1.route.name) || route.name.split('-')[0] || '';
            const l2 = (route.leg2 && route.leg2.route && route.leg2.route.name) || route.name.split('-')[1] || '';
            const color1 = getRouteColor(l1);
            const color2 = getRouteColor(l2);

            if (isSelected) {
                const gradientBg = (color1 !== color2) ? `linear-gradient(135deg, ${color1}, ${color2})` : color1;
                style = `background: ${gradientBg}; color: white; border-color: transparent !important;`;
                labelHtml = `<span class="route-option-label" style="color: white; font-weight: 700;">${l1.toUpperCase()}<span style="margin: 0 0.25rem; font-size: 0.9em; opacity: 0.9;">→</span>${l2.toUpperCase()}</span>`;
            } else {
                style = `background-color: var(--theme-unselected-route-bg); color: var(--theme-unselected-route-text); border-color: transparent !important;`;
                labelHtml = `<span class="route-option-label"><span style="color: ${color1}; font-weight: 700;">${l1.toUpperCase()}</span><span style="color: var(--theme-stops-list-text); opacity: 0.7; margin: 0 0.25rem; font-size: 0.9em;">→</span><span style="color: ${color2}; font-weight: 700;">${l2.toUpperCase()}</span></span>`;
            }
        } else {
            let routeColor = '#111827';
            const m = label.toLowerCase().match(/^(?:wknd|on)(\d+)/);
            if (m) {
                const wkKey = `wknd${m[1]}`;
                routeColor = (typeof colorMappings !== 'undefined' && colorMappings[wkKey]) ? colorMappings[wkKey] : '#111827';
            } else if (typeof colorMappings !== 'undefined' && colorMappings[routeKey]) {
                routeColor = colorMappings[routeKey];
            }

            let backgroundColor = 'var(--theme-unselected-route-bg)';
            let textColor = 'var(--theme-unselected-route-text)';

            if (isSelected) {
                backgroundColor = routeColor;
                textColor = 'white';
            }

            style = `background-color: ${backgroundColor}; color: ${textColor};`;
            labelHtml = `<span class="route-option-label" style="color: ${isSelected ? 'white' : routeColor}; font-weight: 700;">${label}</span>`;
        }

        const selectedClass = isSelected ? 'selected' : '';
        const transferClass = isTransfer ? 'transfer-route' : (isWalk ? 'route-option-walk' : '');
        const hasLive = entry.hasLive;
        const liveDotHtml = (!isWalk && hasLive) ? `<span class="nav-route-live-dot" aria-label="Buses in service" title="Buses in service"></span>` : ``;

        const journeyMinutes = hasLive ? Math.max(1, entry.journeyMinutes) : 0;
        const timeHtml = (hasLive && journeyMinutes > 0) ? `<span class="route-option-time">${journeyMinutes}m</span>` : ``;

        const pill = `<div class="route-option ${transferClass} ${selectedClass} br-1rem" data-route-index="${index}" style="${style}">${liveDotHtml}${labelHtml}${timeHtml}</div>`;
        if (_hasBoth && index === _lastLiveIdx) {
            return pill + `<div class="route-options-divider" aria-hidden="true" style="width:1px; height:2.2rem; background:var(--theme-line-bg); flex-shrink:0; align-self:center; margin:0 0.25rem; opacity:0.9;"></div>`;
        }
        return pill;
    }).join('');

    return `
        <div class="nav-route-selector" style="margin-bottom: 1rem;">
            <div class="route-options-container">
                ${routeOptions}
            </div>
        </div>
    `;
}

// Bind click handlers to route selector pills
function bindNavRouteOptionClicks(routesForDisplay) {
    if (!routesForDisplay || routesForDisplay.length <= 1) return;
    $('.route-option').off('click').on('click', function() {
        const newRouteIndex = parseInt($(this).attr('data-route-index'), 10);
        const curSelected = (navRouteSession && navRouteSession.routeData && typeof navRouteSession.routeData.selectedRouteDisplayIndex === 'number')
            ? navRouteSession.routeData.selectedRouteDisplayIndex
            : 0;

        if (newRouteIndex !== curSelected && routesForDisplay[newRouteIndex]) {
            const newRoute = routesForDisplay[newRouteIndex].route;
            sa_event('btn_press', {
                'btn': 'nav_alternate_route',
                'route': newRoute.name,
                'from_route': (routesForDisplay[curSelected] && routesForDisplay[curSelected].route) ? routesForDisplay[curSelected].route.name : '',
                'route_index': newRouteIndex
            });

            // Update visual selection across all pills
            const defaultBg = 'var(--theme-unselected-route-bg)';
            const defaultText = 'var(--theme-unselected-route-text)';
            $('.route-option').each(function() {
                const rIdx = parseInt($(this).attr('data-route-index'), 10);
                const rEntry = routesForDisplay[rIdx];
                $(this).removeClass('selected');
                const isItemTransfer = rEntry && (rEntry.isTransfer || (rEntry.route && rEntry.route.isTransfer));
                const isItemWalk = rEntry && (rEntry.isWalk || (rEntry.route && rEntry.route.isWalk));
                const itemBorder = (isItemTransfer || isItemWalk) ? 'border-color: transparent !important;' : '';
                $(this).attr('style', `background-color: ${defaultBg}; color: ${defaultText}; ${itemBorder}`);

                if (isItemWalk) {
                    $(this).find('.route-option-label').html(`<i class="fa-solid fa-person-walking" style="margin-right: 0.35rem; color: var(--theme-stops-list-text);"></i>Walk`);
                } else if (rEntry && (rEntry.isTransfer || (rEntry.route && rEntry.route.isTransfer))) {
                    const l1 = (rEntry.route.leg1 && rEntry.route.leg1.route && rEntry.route.leg1.route.name) || rEntry.route.name.split('-')[0] || '';
                    const l2 = (rEntry.route.leg2 && rEntry.route.leg2.route && rEntry.route.leg2.route.name) || rEntry.route.name.split('-')[1] || '';
                    const c1 = getRouteColor(l1);
                    const c2 = getRouteColor(l2);
                    $(this).find('.route-option-label').html(`<span style="color: ${c1}; font-weight: 700;">${l1.toUpperCase()}</span><span style="color: var(--theme-stops-list-text); opacity: 0.7; margin: 0 0.25rem; font-size: 0.9em;">→</span><span style="color: ${c2}; font-weight: 700;">${l2.toUpperCase()}</span>`);
                } else if (rEntry) {
                    let rColor = '#111827';
                    const rm = rEntry.displayName.toLowerCase().match(/^(?:wknd|on)(\d+)/);
                    if (rm) {
                        const wkKey = `wknd${rm[1]}`;
                        rColor = (typeof colorMappings !== 'undefined' && colorMappings[wkKey]) ? colorMappings[wkKey] : '#111827';
                    } else if (typeof colorMappings !== 'undefined' && colorMappings[rEntry.route.name.toLowerCase()]) {
                        rColor = colorMappings[rEntry.route.name.toLowerCase()];
                    }
                    $(this).find('.route-option-label').css('color', rColor);
                }
            });
            $(this).addClass('selected');

            // Style newly selected pill
            if (newRoute.isWalk) {
                $(this).attr('style', `background-color: var(--theme-accent); color: white; border-color: transparent !important;`);
                $(this).find('.route-option-label').html(`<i class="fa-solid fa-person-walking" style="margin-right: 0.35rem; color: white;"></i>Walk`);
            } else if (newRoute.isTransfer) {
                const l1 = (newRoute.leg1 && newRoute.leg1.route && newRoute.leg1.route.name) || newRoute.name.split('-')[0] || '';
                const l2 = (newRoute.leg2 && newRoute.leg2.route && newRoute.leg2.route.name) || newRoute.name.split('-')[1] || '';
                const c1 = getRouteColor(l1);
                const c2 = getRouteColor(l2);
                const selectedBg = (c1 !== c2) ? `linear-gradient(135deg, ${c1}, ${c2})` : c1;
                $(this).attr('style', `background: ${selectedBg}; color: white; border-color: transparent !important;`);
                $(this).find('.route-option-label').html(`<span style="color: white; font-weight: 700;">${l1.toUpperCase()}<span style="margin: 0 0.25rem; font-size: 0.9em; opacity: 0.9;">→</span>${l2.toUpperCase()}</span>`);
            } else {
                const selectedRouteName = newRoute.name.toLowerCase();
                let selectedBg = '#6b7280';
                const sm = routesForDisplay[newRouteIndex].displayName.toLowerCase().match(/^(?:wknd|on)(\d+)/);
                if (sm) {
                    const wkKey = `wknd${sm[1]}`;
                    selectedBg = (typeof colorMappings !== 'undefined' && colorMappings[wkKey]) ? colorMappings[wkKey] : '#6b7280';
                } else if (typeof colorMappings !== 'undefined' && colorMappings[selectedRouteName]) {
                    selectedBg = colorMappings[selectedRouteName];
                }
                $(this).attr('style', `background-color: ${selectedBg}; color: white;`);
                $(this).find('.route-option-label').css('color', 'white');
            }

            if (navRouteSession && navRouteSession.routeData) {
                navRouteSession.routeData.selectedRouteDisplayIndex = newRouteIndex;
            }

            const routeData = navRouteSession ? navRouteSession.routeData : null;
            if (!routeData) return;

            const newRouteKey = String(newRoute.name || '').toLowerCase();
            const routeCombosMap = routeData.routeCombosMap || {};
            const combo = routeCombosMap[newRouteKey];

            if (newRoute.isWalk) {
                if (navRouteSession && navRouteSession.routeData) {
                    navRouteSession.routeData.route = newRoute;
                    navRouteSession.routeData.startStop = null;
                    navRouteSession.routeData.transferStop = null;
                    navRouteSession.routeData.endStop = null;
                    navRouteSession.routeData.startWalkDistance = (combo && combo.startWalkDistance) || routeData.startWalkDistance;
                    navRouteSession.routeData.endWalkDistance = null;
                    navRouteSession.routeData.restoreRouteName = 'walk';
                    navRouteSession.routeData.selectedTransferLeg1BusName = null;
                    navRouteSession.routeData.selectedTransferLeg1BusIndex = null;
                    navRouteSession.routeData.selectedIncomingBusName = null;
                    navRouteSession.routeData.selectedIncomingBusIndex = null;
                    navRouteSession.routeData.selectedTransferLeg2BusName = null;
                    navRouteSession.routeData.selectedTransferLeg2BusIndex = null;
                }

                setTimeout(() => {
                    updateRouteDisplay({
                        startBuilding: routeData.startBuilding,
                        endBuilding: routeData.endBuilding,
                        startStop: null,
                        transferStop: null,
                        endStop: null,
                        route: newRoute,
                        startWalkDistance: (combo && combo.startWalkDistance) || routeData.startWalkDistance,
                        endWalkDistance: null,
                        originalInputs: routeData.originalInputs,
                        startIsStop: routeData.startIsStop,
                        endIsStop: routeData.endIsStop
                    });

                    positionGlobalWaypointConnector();
                }, 0);
                return;
            }

            const effectiveStartStop = combo && combo.startStop ? combo.startStop : routeData.startStop;
            const effectiveEndStop = combo && combo.endStop ? combo.endStop : routeData.endStop;
            const effectiveStartWalk = (combo && typeof combo.startWalkDistance !== 'undefined') ? combo.startWalkDistance : routeData.startWalkDistance;
            const effectiveEndWalk = (combo && typeof combo.endWalkDistance !== 'undefined') ? combo.endWalkDistance : routeData.endWalkDistance;

            let newRouteDetails;
            if (newRoute.isTransfer || (combo && combo.isTransfer)) {
                const leg1Route = (combo && combo.leg1 && combo.leg1.route) || newRoute.leg1.route;
                const leg2Route = (combo && combo.leg2 && combo.leg2.route) || newRoute.leg2.route;
                const transferStop = (combo && combo.transferStop) || newRoute.transferStop;
                newRouteDetails = {
                    ...newRoute,
                    isTransfer: true,
                    transferStop: transferStop,
                    leg1: {
                        ...(combo && combo.leg1 ? combo.leg1 : newRoute.leg1),
                        routeDetails: getRouteDetails(leg1Route, effectiveStartStop.id, transferStop.id)
                    },
                    leg2: {
                        ...(combo && combo.leg2 ? combo.leg2 : newRoute.leg2),
                        routeDetails: getRouteDetails(leg2Route, transferStop.id, effectiveEndStop.id)
                    }
                };
            } else {
                newRouteDetails = getRouteDetails(newRoute, effectiveStartStop.id, effectiveEndStop.id);
            }

            if (navRouteSession && navRouteSession.routeData) {
                navRouteSession.routeData.route = newRouteDetails;
                navRouteSession.routeData.startStop = effectiveStartStop;
                navRouteSession.routeData.transferStop = (combo && combo.transferStop) || (newRouteDetails && newRouteDetails.transferStop);
                navRouteSession.routeData.endStop = effectiveEndStop;
                navRouteSession.routeData.startWalkDistance = effectiveStartWalk;
                navRouteSession.routeData.endWalkDistance = effectiveEndWalk;
                navRouteSession.routeData.restoreRouteName = newRoute.name;
                navRouteSession.routeData.selectedTransferLeg1BusName = null;
                navRouteSession.routeData.selectedTransferLeg1BusIndex = null;
                navRouteSession.routeData.selectedIncomingBusName = null;
                navRouteSession.routeData.selectedIncomingBusIndex = null;
                navRouteSession.routeData.selectedTransferLeg2BusName = null;
                navRouteSession.routeData.selectedTransferLeg2BusIndex = null;
            }

            setTimeout(() => {
                updateRouteDisplay({
                    startBuilding: routeData.startBuilding,
                    endBuilding: routeData.endBuilding,
                    startStop: effectiveStartStop,
                    transferStop: (combo && combo.transferStop) || (newRouteDetails && newRouteDetails.transferStop),
                    endStop: effectiveEndStop,
                    route: newRouteDetails,
                    startWalkDistance: effectiveStartWalk,
                    endWalkDistance: effectiveEndWalk,
                    originalInputs: routeData.originalInputs,
                    startIsStop: routeData.startIsStop,
                    endIsStop: routeData.endIsStop
                });

                positionGlobalWaypointConnector();
            }, 0);
        }
    });
}

// Render route selector HTML into container and bind events
function renderNavRouteSelector(routesForDisplay, selectedRouteDisplayIndex) {
    const $container = $('.nav-route-selector-container');
    if (!$container.length) return;
    if (!routesForDisplay || routesForDisplay.length <= 1) {
        $container.empty().addClass('none');
        return;
    }

    // Preserve horizontal scroll position across live ETA re-renders
    const $existingScroller = $container.find('.route-options-container');
    const prevScrollLeft = $existingScroller.length ? $existingScroller.scrollLeft() : 0;

    const html = buildRouteSelectorHtml(routesForDisplay, selectedRouteDisplayIndex);
    $container.removeClass('none').html(html);
    bindNavRouteOptionClicks(routesForDisplay);
    if (typeof replaceFontAwesomeIcons === 'function') {
        replaceFontAwesomeIcons();
    }

    // Restore horizontal scroll position
    const $newScroller = $container.find('.route-options-container');
    if ($newScroller.length) {
        if (prevScrollLeft > 0) {
            $newScroller.scrollLeft(prevScrollLeft);
        }
        // Ensure the currently selected route pill remains visible without jarring shifts
        const $selected = $newScroller.find('.route-option.selected');
        if ($selected.length) {
            const scrollerEl = $newScroller[0];
            const selEl = $selected[0];
            const selLeft = selEl.offsetLeft;
            const selRight = selLeft + selEl.offsetWidth;
            const viewLeft = scrollerEl.scrollLeft;
            const viewRight = viewLeft + scrollerEl.clientWidth;

            if (selLeft < viewLeft) {
                scrollerEl.scrollLeft = Math.max(0, selLeft - 12);
            } else if (selRight > viewRight) {
                scrollerEl.scrollLeft = selRight - scrollerEl.clientWidth + 12;
            }
        }
    }
}
window.renderNavRouteSelector = renderNavRouteSelector;

// Calculate expected arrival time at the route destination (arrival at alighting stop + walk to destination)
function computeRouteEndTime(options) {
    if (!options) return null;
    const {
        route,
        startStop,
        transferStop,
        endStop,
        startWalkDistance,
        endWalkDistance,
        hasEndWalk,
        selectedTransferLeg1BusIndex,
        selectedTransferLeg1BusName,
        selectedIncomingBusIndex,
        selectedIncomingBusName,
        selectedTransferLeg2BusIndex,
        selectedTransferLeg2BusName
    } = options;

    if (route && route.isWalk) {
        const walkMin = (typeof route.journeyMinutes === 'number' && route.journeyMinutes > 0)
            ? route.journeyMinutes
            : ((route.walkMinutes) || (startWalkDistance && typeof startWalkDistance.feet === 'number' ? Math.ceil(startWalkDistance.feet / 220) : (typeof startWalkDistance === 'number' ? Math.ceil(startWalkDistance / 220) : 0)));
        const now = Date.now();
        const finalEtaTimestampMs = now + (walkMin * 60 * 1000);
        return new Date(finalEtaTimestampMs).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }

    if (!route || !startStop || !endStop) return null;

    const isTransfer = !!(route.isTransfer || (route.leg1 && route.leg2));
    const leg1 = isTransfer ? route.leg1 : null;
    const leg2 = isTransfer ? route.leg2 : null;
    const effTransferStop = transferStop || (leg1 && leg1.transferStop) || (leg2 && leg2.transferStop) || route.transferStop;

    const startWalkSec = startWalkDistance ? getStartWalkSeconds(startWalkDistance) : 0;
    const endWalkMin = hasEndWalk ? ((endWalkDistance && typeof endWalkDistance.feet === 'number') ? Math.ceil(endWalkDistance.feet / 220) : (typeof endWalkDistance === 'number' ? Math.ceil(endWalkDistance / 220) : 0)) : 0;

    let alightingEtaSec = null;

    const startStopId = (startStop && startStop.id) ? startStop.id : startStop;
    const endStopId = (endStop && endStop.id) ? endStop.id : endStop;
    const transferStopId = (effTransferStop && effTransferStop.id) ? effTransferStop.id : effTransferStop;

    if (isTransfer && leg1 && leg2 && transferStopId) {
        const leg1Route = (leg1 && leg1.route) || leg1;
        const leg2Route = (leg2 && leg2.route) || leg2;
        const leg1RouteName = leg1Route && leg1Route.name;
        const leg2RouteName = leg2Route && leg2Route.name;

        if (!leg1RouteName || !leg2RouteName || !navRouteHasLiveBuses(leg1RouteName) || !navRouteHasLiveBuses(leg2RouteName)) {
            return null;
        }
        const leg1TravelMin = computeBusTravelTimeMinutes(leg1.routeDetails || leg1);
        const topLeg1 = getTopApproachingBuses(leg1RouteName, startStopId, startWalkSec, 3);
        if (topLeg1.length === 0) return null;

        let selBus = topLeg1[0];
        if (typeof selectedTransferLeg1BusIndex === 'number' && selectedTransferLeg1BusIndex >= 0 && selectedTransferLeg1BusIndex < topLeg1.length) {
            selBus = topLeg1[selectedTransferLeg1BusIndex];
        } else if (selectedTransferLeg1BusName) {
            const found = topLeg1.find(b => b.busName === selectedTransferLeg1BusName);
            if (found) selBus = found;
        }

        const arriveAtTransferSec = getBusArrivalETAAtStop(selBus, transferStopId, leg1RouteName, leg1TravelMin);
        const topLeg2 = getTopApproachingBuses(leg2RouteName, transferStopId, arriveAtTransferSec, 3);
        if (topLeg2.length === 0) return null;

        let selLeg2Bus = topLeg2[0];
        if (typeof selectedTransferLeg2BusIndex === 'number' && selectedTransferLeg2BusIndex >= 0 && selectedTransferLeg2BusIndex < topLeg2.length) {
            selLeg2Bus = topLeg2[selectedTransferLeg2BusIndex];
        } else if (selectedTransferLeg2BusName) {
            const found = topLeg2.find(b => b.busName === selectedTransferLeg2BusName);
            if (found) selLeg2Bus = found;
        }

        const leg2TravelMin = computeBusTravelTimeMinutes(leg2.routeDetails || leg2);
        alightingEtaSec = getBusArrivalETAAtStop(selLeg2Bus, endStopId, leg2RouteName, leg2TravelMin);
    } else if (route && (route.name || (route.route && route.route.name))) {
        const rName = route.name || route.route.name;
        if (!navRouteHasLiveBuses(rName)) {
            return null;
        }
        const top = getTopApproachingBuses(rName, startStopId, startWalkSec, 3);
        if (top.length === 0) return null;

        let selBus = top[0];
        if (typeof selectedIncomingBusIndex === 'number' && selectedIncomingBusIndex >= 0 && selectedIncomingBusIndex < top.length) {
            selBus = top[selectedIncomingBusIndex];
        } else if (selectedIncomingBusName) {
            const found = top.find(b => b.busName === selectedIncomingBusName);
            if (found) selBus = found;
        }

        const travelMin = computeBusTravelTimeMinutes(route.routeDetails || route);
        alightingEtaSec = getBusArrivalETAAtStop(selBus, endStopId, rName, travelMin);
    }

    if (typeof alightingEtaSec !== 'number' || isNaN(alightingEtaSec) || alightingEtaSec < 0) {
        return null;
    }

    const now = Date.now();
    const finalEtaTimestampMs = now + (alightingEtaSec * 1000) + (endWalkMin * 60 * 1000);
    return new Date(finalEtaTimestampMs).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
window.computeRouteEndTime = computeRouteEndTime;

// Update upcoming and arriving buses display for the currently active route
function updateNavBusesDisplay() {
    try {
        const session = (typeof navRouteSession !== 'undefined' && navRouteSession) || (typeof window !== 'undefined' && window.navRouteSession);
        if (!session || !session.routeData) return;
        const routeData = session.routeData;
        const route = routeData.route;
        const startStop = routeData.startStop;
        const endStop = routeData.endStop;
        if (!route) return;

        if (route.isWalk) {
            $('.incoming-buses-list').remove();
            $('.destination-buses-list').remove();
            $('.transfer-buses-container').remove();
            const endTimeStr = computeRouteEndTime({
                route,
                startWalkDistance: routeData.startWalkDistance
            });
            const $endRow = $('.waypoint-row[data-waypoint-role="end_building"]');
            if ($endRow.length > 0) {
                const desc = endTimeStr ? `End here at ${endTimeStr}` : 'End here';
                const $desc = $endRow.find('.waypoint-description');
                if ($desc.length > 0) {
                    $desc.text(desc);
                } else {
                    $endRow.find('.waypoint-header').append(`<div class="waypoint-description">${desc}</div>`);
                }
            }
            if (typeof updateNavInfoBanners === 'function') {
                updateNavInfoBanners(route, routeData.selectedRouteDisplayIndex, routeData.routesForDisplay);
            }
            positionGlobalWaypointConnector();
            return;
        }

        if (!startStop || !endStop) return;

        const walkSeconds = routeData.startWalkDistance ? getStartWalkSeconds(routeData.startWalkDistance) : 0;

        const updateEndWaypointDescription = () => {
            const hasEndWalk = !!(routeData.endWalkDistance && routeData.endWalkDistance.feet > 30 && endStop && routeData.endBuilding && (String(endStop.id) !== String(routeData.endBuilding.id) || !routeData.endIsStop));
            const endTimeStr = computeRouteEndTime({
                route,
                startStop,
                transferStop: route.transferStop || routeData.transferStop,
                endStop,
                startWalkDistance: routeData.startWalkDistance,
                endWalkDistance: routeData.endWalkDistance,
                hasEndWalk,
                selectedTransferLeg1BusIndex: routeData.selectedTransferLeg1BusIndex,
                selectedTransferLeg1BusName: routeData.selectedTransferLeg1BusName,
                selectedIncomingBusIndex: routeData.selectedIncomingBusIndex,
                selectedIncomingBusName: routeData.selectedIncomingBusName,
                selectedTransferLeg2BusIndex: routeData.selectedTransferLeg2BusIndex,
                selectedTransferLeg2BusName: routeData.selectedTransferLeg2BusName
            });

            const setWaypointDesc = (selector, text) => {
                const $row = $(selector);
                if ($row.length === 0) return;
                const $desc = $row.find('.waypoint-description');
                if ($desc.length > 0) {
                    $desc.text(text);
                } else {
                    $row.find('.waypoint-header').append(`<div class="waypoint-description">${text}</div>`);
                }
            };

            if (hasEndWalk) {
                const desc = endTimeStr ? `End here at ${endTimeStr}` : 'End here';
                setWaypointDesc('.waypoint-row[data-waypoint-role="end_building"]', desc);
                setWaypointDesc('.waypoint-row[data-waypoint-role="alighting"]', 'Exit bus here');
            } else {
                const desc = routeData.endIsStop
                    ? (endTimeStr ? `Depart bus and end here at ${endTimeStr}` : 'Depart bus and end here')
                    : (endTimeStr ? `End here at ${endTimeStr}` : 'End here');
                setWaypointDesc('.waypoint-row[data-waypoint-role="alighting"]', desc);
            }
        };

        if (route.isTransfer && route.leg1 && route.leg2) {
            const transferStop = route.transferStop || routeData.transferStop;
            const leg1TravelMin = computeBusTravelTimeMinutes(route.leg1.routeDetails || route.leg1);
            const leg2TravelMin = computeBusTravelTimeMinutes(route.leg2.routeDetails || route.leg2);

            const topLeg1 = getTopApproachingBuses(route.leg1.route.name, startStop.id, walkSeconds, 3);
            let selectedLeg1BusName = routeData.selectedTransferLeg1BusName || null;
            let selectedLeg1BusIndex = (typeof routeData.selectedTransferLeg1BusIndex === 'number') ? routeData.selectedTransferLeg1BusIndex : null;
            if (topLeg1.length > 0) {
                if (selectedLeg1BusIndex !== null && selectedLeg1BusIndex >= 0 && selectedLeg1BusIndex < topLeg1.length) {
                    selectedLeg1BusName = topLeg1[selectedLeg1BusIndex].busName;
                    routeData.selectedTransferLeg1BusName = selectedLeg1BusName;
                } else if (selectedLeg1BusName && topLeg1.some(b => b.busName === selectedLeg1BusName)) {
                    selectedLeg1BusIndex = topLeg1.findIndex(b => b.busName === selectedLeg1BusName);
                    routeData.selectedTransferLeg1BusIndex = selectedLeg1BusIndex;
                } else {
                    selectedLeg1BusIndex = 0;
                    selectedLeg1BusName = topLeg1[0].busName;
                    routeData.selectedTransferLeg1BusIndex = 0;
                    routeData.selectedTransferLeg1BusName = selectedLeg1BusName;
                }
            } else {
                selectedLeg1BusName = null;
                selectedLeg1BusIndex = null;
                routeData.selectedTransferLeg1BusName = null;
                routeData.selectedTransferLeg1BusIndex = null;
            }

            // Selected Leg 1 arrival ETA for alighting stop
            let selectedArrivalSec = walkSeconds + (leg1TravelMin * 60);
            if (topLeg1.length > 0) {
                const selBus = (selectedLeg1BusIndex !== null && topLeg1[selectedLeg1BusIndex]) || topLeg1[0];
                selectedArrivalSec = getBusArrivalETAAtStop(selBus, transferStop.id, route.leg1.route.name, leg1TravelMin);
            }

            const topLeg2 = getTopApproachingBuses(route.leg2.route.name, transferStop.id, selectedArrivalSec, 3);
            let selectedLeg2BusName = routeData.selectedTransferLeg2BusName || null;
            let selectedLeg2BusIndex = (typeof routeData.selectedTransferLeg2BusIndex === 'number') ? routeData.selectedTransferLeg2BusIndex : null;
            if (topLeg2.length > 0) {
                if (selectedLeg2BusIndex !== null && selectedLeg2BusIndex >= 0 && selectedLeg2BusIndex < topLeg2.length) {
                    selectedLeg2BusName = topLeg2[selectedLeg2BusIndex].busName;
                    routeData.selectedTransferLeg2BusName = selectedLeg2BusName;
                } else if (selectedLeg2BusName && topLeg2.some(b => b.busName === selectedLeg2BusName)) {
                    selectedLeg2BusIndex = topLeg2.findIndex(b => b.busName === selectedLeg2BusName);
                    routeData.selectedTransferLeg2BusIndex = selectedLeg2BusIndex;
                } else {
                    selectedLeg2BusIndex = 0;
                    selectedLeg2BusName = topLeg2[0].busName;
                    routeData.selectedTransferLeg2BusIndex = 0;
                    routeData.selectedTransferLeg2BusName = selectedLeg2BusName;
                }
            } else {
                selectedLeg2BusName = null;
                selectedLeg2BusIndex = null;
                routeData.selectedTransferLeg2BusName = null;
                routeData.selectedTransferLeg2BusIndex = null;
            }

            const upcomingHtml = getUpcomingBusesHtml(route.leg1.route.name, startStop.id, walkSeconds, selectedLeg1BusName, selectedLeg1BusIndex, 'boarding_leg1');
            const transferBusesHtml = transferStop ? getTransferBusesHtml(
                route.leg1.route.name,
                route.leg2.route.name,
                startStop.id,
                transferStop.id,
                walkSeconds,
                selectedLeg1BusName,
                leg1TravelMin,
                selectedLeg1BusIndex,
                selectedLeg2BusName,
                selectedLeg2BusIndex
            ) : '';

            const arrivingHtml = transferStop ? getArrivingBusesHtml(route.leg2.route.name, transferStop.id, endStop.id, selectedArrivalSec, selectedLeg2BusName, selectedLeg2BusIndex) : '';

            // Update boarding stop incoming list
            const $incomingList = $('.waypoint-row.stop-row.boarding + .incoming-buses-list');
            if ($incomingList.length > 0) {
                if (upcomingHtml) {
                    if ($incomingList[0].outerHTML.trim() !== upcomingHtml.trim()) $incomingList.replaceWith(upcomingHtml);
                } else {
                    $incomingList.remove();
                }
            } else if (upcomingHtml) {
                $('.waypoint-row.stop-row.boarding').after(upcomingHtml);
            }

            // Update transfer stop buses container
            const $transferBuses = $('.waypoint-row.stop-row.transfer').next('.transfer-buses-container, .incoming-buses-list');
            if ($transferBuses.length > 0) {
                if (transferBusesHtml) {
                    if ($transferBuses[0].outerHTML.trim() !== transferBusesHtml.trim()) $transferBuses.replaceWith(transferBusesHtml);
                } else {
                    $transferBuses.remove();
                }
            } else if (transferBusesHtml) {
                $('.waypoint-row.stop-row.transfer').after(transferBusesHtml);
            }

            // Update alighting stop destination list
            const $destList = $('.waypoint-row.stop-row.alighting + .destination-buses-list');
            if ($destList.length > 0) {
                if (arrivingHtml) {
                    if ($destList[0].outerHTML.trim() !== arrivingHtml.trim()) $destList.replaceWith(arrivingHtml);
                } else {
                    $destList.remove();
                }
            } else if (arrivingHtml) {
                $('.waypoint-row.stop-row.alighting').after(arrivingHtml);
            }

            if (navRouteHasLiveBuses(route.leg1.route.name)) {
                $('.waypoint-travel-bus[data-leg="1"] .travel-time').text(`${leg1TravelMin}m`).show();
            } else {
                $('.waypoint-travel-bus[data-leg="1"] .travel-time').hide();
            }
            if (navRouteHasLiveBuses(route.leg2.route.name)) {
                $('.waypoint-travel-bus[data-leg="2"] .travel-time').text(`${leg2TravelMin}m`).show();
            } else {
                $('.waypoint-travel-bus[data-leg="2"] .travel-time').hide();
            }

            updateEndWaypointDescription();
            if (typeof updateNavInfoBanners === 'function') {
                updateNavInfoBanners(route, routeData.selectedRouteDisplayIndex, routeData.routesForDisplay);
            }
            positionGlobalWaypointConnector();
            return;
        }

        const top = getTopApproachingBuses(route.name, startStop.id, walkSeconds, 3);
        let selectedIncomingBusName = routeData.selectedIncomingBusName || null;
        let selectedIncomingBusIndex = (typeof routeData.selectedIncomingBusIndex === 'number') ? routeData.selectedIncomingBusIndex : null;
        if (top.length > 0) {
            if (selectedIncomingBusIndex !== null && selectedIncomingBusIndex >= 0 && selectedIncomingBusIndex < top.length) {
                selectedIncomingBusName = top[selectedIncomingBusIndex].busName;
                routeData.selectedIncomingBusName = selectedIncomingBusName;
            } else if (selectedIncomingBusName && top.some(b => b.busName === selectedIncomingBusName)) {
                selectedIncomingBusIndex = top.findIndex(b => b.busName === selectedIncomingBusName);
                routeData.selectedIncomingBusIndex = selectedIncomingBusIndex;
            } else {
                selectedIncomingBusIndex = 0;
                selectedIncomingBusName = top[0].busName;
                routeData.selectedIncomingBusIndex = 0;
                routeData.selectedIncomingBusName = selectedIncomingBusName;
            }
        } else {
            selectedIncomingBusName = null;
            selectedIncomingBusIndex = null;
            routeData.selectedIncomingBusName = null;
            routeData.selectedIncomingBusIndex = null;
        }

        const upcomingHtml = getUpcomingBusesHtml(route.name, startStop.id, walkSeconds, selectedIncomingBusName, selectedIncomingBusIndex, 'direct_boarding');
        const arrivingHtml = getArrivingBusesHtml(route.name, startStop.id, endStop.id, walkSeconds, selectedIncomingBusName, selectedIncomingBusIndex);

        const $incomingList = $('.incoming-buses-list');
        if ($incomingList.length > 0) {
            if (upcomingHtml) {
                if ($incomingList[0].outerHTML.trim() !== upcomingHtml.trim()) {
                    $incomingList.replaceWith(upcomingHtml);
                }
            } else {
                $incomingList.remove();
            }
        } else if (upcomingHtml) {
            $('.waypoint-row.stop-row.boarding').after(upcomingHtml);
        }

        const $destList = $('.destination-buses-list');
        if ($destList.length > 0) {
            if (arrivingHtml) {
                if ($destList[0].outerHTML.trim() !== arrivingHtml.trim()) {
                    $destList.replaceWith(arrivingHtml);
                }
            } else {
                $destList.remove();
            }
        } else if (arrivingHtml) {
            $('.waypoint-row.stop-row.alighting').after(arrivingHtml);
        }

        const isRouteActive = navRouteHasLiveBuses(route.name);
        if (isRouteActive) {
            const timeMinutes = computeBusTravelTimeMinutes(route);
            $('.waypoint-travel-bus .travel-time').text(`${timeMinutes}m`).show();
        } else {
            $('.waypoint-travel-bus .travel-time').hide();
        }

        updateEndWaypointDescription();

        if (typeof updateNavInfoBanners === 'function') {
            updateNavInfoBanners(route, routeData.selectedRouteDisplayIndex, routeData.routesForDisplay);
        }

        positionGlobalWaypointConnector();
    } catch (e) {
        console.error('[nav] Error in updateNavBusesDisplay:', e);
    }
}
window.updateNavBusesDisplay = updateNavBusesDisplay;

// Remove out-of-service bus from bus lists and move out-of-service routes to out-of-service section
function updateNavOnOutOfService(oosBusNames, emptiedRoutes) {
    try {
        if (!navRouteSession || !navRouteSession.routeData) return;

        const isNavOpen = $('.navigate-wrapper').length > 0 && !$('.navigate-wrapper').hasClass('none');
        if (!isNavOpen) return;

        const wrapper = $('.nav-directions-wrapper');
        const hasContent = wrapper.children().length > 0;
        if (!hasContent && !navDirectionsWasVisibleBeforeFocus) return;

        const routeData = navRouteSession.routeData;
        const currentRoute = routeData.route;
        if (!currentRoute) return;

        const emptiedList = Array.isArray(emptiedRoutes)
            ? emptiedRoutes.map(r => String(r).toLowerCase())
            : [];
        const oosList = Array.isArray(oosBusNames)
            ? oosBusNames.map(b => String(b))
            : [];

        // Instantly remove any OOS bus rows from the DOM
        if (oosList.length > 0) {
            oosList.forEach(busName => {
                $(`.incoming-bus-row[data-bus-name="${busName}"]`).remove();
                $(`.destination-bus-row[data-bus-name="${busName}"]`).remove();
            });
        }

        // Check routes in the navigation result
        let routesForDisplay = routeData.routesForDisplay || [];
        if (routesForDisplay.length === 0 && routeData.allRoutes && routeData.allRoutes.length > 0) {
            routesForDisplay = routeData.allRoutes.map(r => ({
                route: r,
                displayName: r.name.toUpperCase(),
                hasLive: navRouteHasLiveBuses(r.name)
            }));
            routeData.routesForDisplay = routesForDisplay;
        }

        if (routesForDisplay.length > 0) {
            let statusChanged = false;
            let timeChanged = false;
            routesForDisplay.forEach(entry => {
                if (entry.isWalk || (entry.route && entry.route.isWalk)) {
                    entry.hasLive = true;
                    return;
                }
                const rName = String(entry.route.name || '').toLowerCase();
                const dName = entry.displayName;
                const isLive = emptiedList.includes(rName) ? false : navRouteHasLiveBuses(rName, dName);
                const combo = routeData.routeCombosMap && routeData.routeCombosMap[rName];
                const newJourneyMinutes = isLive ? calculateOptionJourneyMinutes(entry.route, combo, routeData) : 0;
                entry.walkMinutes = calculateOptionWalkMinutes(entry.route, combo, routeData);

                if (entry.hasLive !== isLive) {
                    entry.hasLive = isLive;
                    statusChanged = true;
                }
                if (isLive && entry.journeyMinutes !== newJourneyMinutes) {
                    entry.journeyMinutes = newJourneyMinutes;
                    timeChanged = true;
                }
            });

            if (statusChanged || timeChanged) {
                // Only re-sort across the divider if a route's operational status changed (in-service vs out-of-service).
                // During routine ETA fluctuations, maintain stable pill order to avoid UI thrashing and mis-taps.
                if (statusChanged) {
                    routesForDisplay = filterTransferRoutesForDisplay(routesForDisplay, routeData.routeCombosMap, routeData);
                    sortRoutesForDisplay(routesForDisplay);
                    routeData.routesForDisplay = routesForDisplay;
                }

                // Update selectedRouteDisplayIndex to the currently selected route's position
                const currentRouteKey = String(currentRoute.name || '').toLowerCase();
                const newIndex = routesForDisplay.findIndex(e => String(e.route.name || '').toLowerCase() === currentRouteKey);
                routeData.selectedRouteDisplayIndex = newIndex >= 0 ? newIndex : 0;

                // Re-render the route selector pills so times, dots, and divider update with preserved scroll
                renderNavRouteSelector(routesForDisplay, routeData.selectedRouteDisplayIndex);
                if (typeof updateNavInfoBanners === 'function') {
                    updateNavInfoBanners(currentRoute, routeData.selectedRouteDisplayIndex, routesForDisplay);
                }
            }
        }

        // Update live upcoming/destination buses on the active route
        updateNavBusesDisplay();

    } catch (e) {
        console.error('[nav] Error in updateNavOnOutOfService:', e);
    }
}
window.updateNavOnOutOfService = updateNavOnOutOfService;

// Unified generator for timeline waypoint rows HTML (handles both single-bus and multi-bus transfer routes)
function renderTimelineWaypointsHtml(data) {
    const {
        startBuilding,
        endBuilding,
        startStop,
        endStop,
        route,
        startWalkDistance,
        endWalkDistance,
        startIsStop = false,
        endIsStop = false
    } = data;

    if (route && route.isWalk) {
        const walkMin = (typeof route.journeyMinutes === 'number' && route.journeyMinutes > 0)
            ? route.journeyMinutes
            : (route.walkMinutes || (startWalkDistance && typeof startWalkDistance.feet === 'number' ? Math.ceil(startWalkDistance.feet / 220) : (typeof startWalkDistance === 'number' ? Math.ceil(startWalkDistance / 220) : 0)));
        const walkFeet = Math.round((startWalkDistance && typeof startWalkDistance.feet === 'number') ? startWalkDistance.feet : (typeof startWalkDistance === 'number' ? startWalkDistance : (route.totalWalkingFeet || 0)));
        const endTimeStr = computeRouteEndTime({
            route,
            startWalkDistance: startWalkDistance || walkFeet
        });
        const endBuildingDesc = endTimeStr ? `End here at ${endTimeStr}` : 'End here';
        const startLat = startBuilding ? (typeof startBuilding.lat !== 'undefined' ? startBuilding.lat : startBuilding.latitude) : null;
        const startLng = startBuilding ? (typeof startBuilding.lng !== 'undefined' ? startBuilding.lng : startBuilding.longitude) : null;
        const endLat = endBuilding ? (typeof endBuilding.lat !== 'undefined' ? endBuilding.lat : endBuilding.latitude) : null;
        const endLng = endBuilding ? (typeof endBuilding.lng !== 'undefined' ? endBuilding.lng : endBuilding.longitude) : null;
        const mapsBtn = (startLat && startLng && endLat && endLng) ? getWalkingMapsButtonHtml(startLat, startLng, endLat, endLng) : '';

        const startName = (startBuilding && startBuilding.name) || 'Start';
        const endName = (endBuilding && endBuilding.name) || 'End';

        return `
            <div class="waypoint-row clickable-waypoint building-row" data-waypoint-role="start_building" data-waypoint-index="0" data-waypoint-type="${startIsStop ? 'stop' : 'building'}" data-waypoint-name="${startName}" data-is-boarding="false" data-is-transfer="false" data-is-alighting="false">
                <div class="waypoint-circle building-circle">
                    <i class="fa-solid fa-location-dot"></i>
                </div>
                <div class="waypoint-content" style="margin-left: 0.75rem;">
                    <div class="waypoint-header">
                        <h4 class="waypoint-title" style="user-select: none;">${startName} <i class="fa-duotone fa-solid fa-right" style="--fa-primary-color: var(--theme-link); --fa-secondary-color: color-mix(in srgb, var(--theme-link) 70%, white);"></i></h4>
                        <div class="waypoint-description">Start here</div>
                    </div>
                </div>
            </div>
            <div class="waypoint-emoji waypoint-travel-walk">
                <div class="waypoint-travel-row">
                    <div class="waypoint-travel-header">
                        <div class="waypoint-circle"><i class="fa-solid fa-person-walking"></i></div>
                        <span class="travel-time">${walkMin}m</span>
                        <span class="walking-info">Walk ${walkFeet.toLocaleString()} ft to destination</span>
                    </div>
                    ${mapsBtn}
                </div>
                <div class="walking-roads-wrapper">
                    <div class="walking-roads-list" id="start-walking-roads">
                        <div class="roads-sequence" style="font-size: 1.1rem;">
                            <span style="color: var(--theme-color-lighter); font-weight: 500; animation: navPulse 1s ease-in-out infinite;">Loading road names...</span>
                        </div>
                    </div>
                </div>
            </div>
            <div class="waypoint-row clickable-waypoint building-row" data-waypoint-role="end_building" data-waypoint-index="1" data-waypoint-type="${endIsStop ? 'stop' : 'building'}" data-waypoint-name="${endName}" data-is-boarding="false" data-is-transfer="false" data-is-alighting="false">
                <div class="waypoint-circle building-circle">
                    <i class="fa-solid fa-flag-checkered"></i>
                </div>
                <div class="waypoint-content" style="margin-left: 0.75rem;">
                    <div class="waypoint-header">
                        <h4 class="waypoint-title" style="user-select: none;">${endName} <i class="fa-duotone fa-solid fa-right" style="--fa-primary-color: var(--theme-link); --fa-secondary-color: color-mix(in srgb, var(--theme-link) 70%, white);"></i></h4>
                        <div class="waypoint-description">${endBuildingDesc}</div>
                    </div>
                </div>
            </div>
        `;
    }

    const isTransfer = !!(route && route.isTransfer);
    const leg1 = isTransfer ? route.leg1 : null;
    const leg2 = isTransfer ? route.leg2 : null;
    const transferStop = isTransfer ? (route.transferStop || (leg1 && leg1.transferStop) || (leg2 && leg2.transferStop) || data.transferStop) : null;

    const hasStartWalk = !!(startWalkDistance && startWalkDistance.feet > 30 && startStop && startBuilding && (String(startStop.id) !== String(startBuilding.id) || !startIsStop));
    const hasEndWalk = !!(endWalkDistance && endWalkDistance.feet > 30 && endStop && endBuilding && (String(endStop.id) !== String(endBuilding.id) || !endIsStop));

    const endTimeStr = computeRouteEndTime({
        route,
        startStop,
        transferStop,
        endStop,
        startWalkDistance,
        endWalkDistance,
        hasEndWalk,
        selectedIncomingBusIndex: data.selectedIncomingBusIndex,
        selectedIncomingBusName: data.selectedIncomingBusName,
        selectedTransferLeg1BusIndex: data.selectedTransferLeg1BusIndex,
        selectedTransferLeg1BusName: data.selectedTransferLeg1BusName,
        selectedTransferLeg2BusIndex: data.selectedTransferLeg2BusIndex,
        selectedTransferLeg2BusName: data.selectedTransferLeg2BusName
    });

    const alightingDesc = hasEndWalk
        ? 'Exit bus here'
        : (endIsStop
            ? (endTimeStr ? `Depart bus and end here at ${endTimeStr}` : 'Depart bus and end here')
            : (endTimeStr ? `End here at ${endTimeStr}` : 'End here'));

    const endBuildingDesc = endTimeStr ? `End here at ${endTimeStr}` : 'End here';

    const startWalkSec = hasStartWalk ? getStartWalkSeconds(startWalkDistance) : 0;

    // Build timeline waypoints
    const timelineWaypoints = [];
    if (hasStartWalk) {
        timelineWaypoints.push({
            type: startIsStop ? 'stop' : 'building',
            name: startBuilding.name,
            role: 'start_building',
            description: 'Start here'
        });
    }

    if (isTransfer && leg1 && leg2 && transferStop) {
        timelineWaypoints.push({
            type: 'stop',
            name: startStop.name,
            stopId: startStop.id,
            role: 'boarding',
            isBoarding: true,
            leg: leg1,
            description: hasStartWalk
                ? `Board <strong style="font-weight: 700;">${formatRouteLabelColored(leg1.route.name)}</strong> bus here`
                : `Start and board <strong style="font-weight: 700;">${formatRouteLabelColored(leg1.route.name)}</strong> bus here`
        });
        timelineWaypoints.push({
            type: 'stop',
            name: transferStop.name,
            stopId: transferStop.id,
            role: 'transfer',
            isTransfer: true,
            leg1: leg1,
            leg2: leg2,
            description: `Transfer to <strong style="font-weight: 700;">${formatRouteLabelColored(leg2.route.name)}</strong> bus here`
        });
        timelineWaypoints.push({
            type: 'stop',
            name: endStop.name,
            stopId: endStop.id,
            role: 'alighting',
            isAlighting: true,
            leg: leg2,
            description: alightingDesc
        });
    } else {
        timelineWaypoints.push({
            type: 'stop',
            name: startStop.name,
            stopId: startStop.id,
            role: 'boarding',
            isBoarding: true,
            description: hasStartWalk
                ? `Board <strong style="font-weight: 700;">${formatRouteLabelColored(route.name)}</strong> bus here`
                : `Start and board <strong style="font-weight: 700;">${formatRouteLabelColored(route.name)}</strong> bus here`
        });
        timelineWaypoints.push({
            type: 'stop',
            name: endStop.name,
            stopId: endStop.id,
            role: 'alighting',
            isAlighting: true,
            description: alightingDesc
        });
    }

    if (hasEndWalk) {
        timelineWaypoints.push({
            type: endIsStop ? 'stop' : 'building',
            name: endBuilding.name,
            role: 'end_building',
            description: endBuildingDesc
        });
    }

    // Helper for stop sequence HTML
    const buildStopsSeqHtml = (rtDetails, sId, eId) => {
        if (!rtDetails || !rtDetails.stopsInOrder || rtDetails.stopsInOrder.length === 0) return '';
        return `
            <div class="bus-stops-list">
                <div class="stops-sequence" style="font-size: 1.2rem;">
                    ${rtDetails.stopsInOrder.map((stop, index, arr) => {
                        const isFirst = index === 0;
                        const isLast = index === arr.length - 1;
                        const isBoarding = isFirst || (sId && String(stop.id) === String(sId));
                        const isAlighting = (isLast && !isFirst) || (eId && String(stop.id) === String(eId));
                        const isTerminal = isBoarding || isAlighting;
                        const style = isTerminal
                            ? 'color: var(--theme-stops-list-text); opacity: 1;'
                            : 'color: var(--theme-stops-list-text); opacity: 0.8;';
                        const stopHtml = `<span style="${style}">${stop.name}</span>`;
                        if (index < arr.length - 1) {
                            const arrowOpacity = arr.length > 2 ? '0.8' : '1';
                            return `${stopHtml}<span class="stop-arrow" style="color: var(--theme-stops-list-text); opacity: ${arrowOpacity}; text-decoration: none;"> → </span>`;
                        }
                        return stopHtml;
                    }).join('')}
                </div>
            </div>
        `;
    };

    // Calculate times for transfer legs
    let leg1TravelMin = 0;
    let leg2TravelMin = 0;
    let arriveAtTransferSec = 0;
    if (isTransfer && leg1 && leg2) {
        leg1TravelMin = computeBusTravelTimeMinutes(leg1.routeDetails || leg1);
        leg2TravelMin = computeBusTravelTimeMinutes(leg2.routeDetails || leg2);
        arriveAtTransferSec = startWalkSec + (leg1TravelMin * 60);
    }

    return timelineWaypoints.map((waypoint, index) => {
        let waypointIcon = 'fa-solid fa-person-shelter';
        let circleClass = `${waypoint.type}-circle`;
        let rowClass = `${waypoint.type}-row`;

        if (waypoint.role === 'start_building') {
            waypointIcon = 'fa-solid fa-location-dot';
        } else if (waypoint.role === 'boarding') {
            circleClass += ' boarding-circle';
            rowClass += ' boarding';
        } else if (waypoint.role === 'transfer') {
            waypointIcon = 'fa-solid fa-right-left';
            circleClass += ' transfer-circle';
            rowClass += ' transfer';
        } else if (waypoint.role === 'alighting') {
            circleClass += ' alighting-circle';
            rowClass += ' alighting';
        } else if (waypoint.role === 'end_building') {
            waypointIcon = 'fa-solid fa-flag-checkered';
        }

        // Upcoming/arriving bus rows
        let busesHtml = '';
        if (waypoint.role === 'boarding') {
            const rName = isTransfer ? leg1.route.name : route.name;
            const selName = isTransfer ? data.selectedTransferLeg1BusName : data.selectedIncomingBusName;
            const selIdx = isTransfer ? data.selectedTransferLeg1BusIndex : data.selectedIncomingBusIndex;
            const listType = isTransfer ? 'boarding_leg1' : 'direct_boarding';
            busesHtml = getUpcomingBusesHtml(rName, startStop.id, startWalkSec, selName, selIdx, listType);
        } else if (waypoint.role === 'transfer') {
            busesHtml = getTransferBusesHtml(
                leg1.route.name,
                leg2.route.name,
                startStop.id,
                transferStop.id,
                startWalkSec,
                data.selectedTransferLeg1BusName,
                leg1TravelMin,
                data.selectedTransferLeg1BusIndex,
                data.selectedTransferLeg2BusName,
                data.selectedTransferLeg2BusIndex
            );
        } else if (waypoint.role === 'alighting') {
            if (isTransfer) {
                const topLeg1 = getTopApproachingBuses(leg1.route.name, startStop.id, startWalkSec, 3);
                let selectedArrivalSec = arriveAtTransferSec;
                if (topLeg1.length > 0) {
                    let selBus = topLeg1[0];
                    const selIdx = data.selectedTransferLeg1BusIndex;
                    if (typeof selIdx === 'number' && selIdx >= 0 && selIdx < topLeg1.length) {
                        selBus = topLeg1[selIdx];
                    } else if (data.selectedTransferLeg1BusName) {
                        const found = topLeg1.find(b => b.busName === data.selectedTransferLeg1BusName);
                        if (found) selBus = found;
                    }
                    selectedArrivalSec = getBusArrivalETAAtStop(selBus, transferStop.id, leg1.route.name, leg1TravelMin);
                }
                busesHtml = getArrivingBusesHtml(
                    leg2.route.name,
                    transferStop.id,
                    endStop.id,
                    selectedArrivalSec,
                    data.selectedTransferLeg2BusName,
                    data.selectedTransferLeg2BusIndex
                );
            } else {
                busesHtml = getArrivingBusesHtml(
                    route.name,
                    startStop.id,
                    endStop.id,
                    startWalkSec,
                    data.selectedIncomingBusName,
                    data.selectedIncomingBusIndex
                );
            }
        }

        // Travel segment below this waypoint
        let travelHtml = '';
        if (index < timelineWaypoints.length - 1) {
            if (waypoint.role === 'start_building') {
                const mapsBtn = (startBuilding && startStop) ? getWalkingMapsButtonHtml(startBuilding.lat, startBuilding.lng, startStop.latitude, startStop.longitude) : '';
                const walkMin = Math.ceil((startWalkDistance?.feet || 0) / 220);
                travelHtml = `
                    <div class="waypoint-emoji waypoint-travel-walk">
                        <div class="waypoint-travel-row">
                            <div class="waypoint-travel-header">
                                <div class="waypoint-circle"><i class="fa-solid fa-person-walking"></i></div>
                                <span class="travel-time">${walkMin}m</span>
                                <span class="walking-info">Walk ${Math.round(startWalkDistance ? startWalkDistance.feet : 0).toLocaleString()} ft to boarding stop</span>
                            </div>
                            ${mapsBtn}
                        </div>
                        <div class="walking-roads-wrapper">
                            <div class="walking-roads-list" id="start-walking-roads">
                                <div class="roads-sequence" style="font-size: 1.1rem;">
                                    <span style="color: var(--theme-color-lighter); font-weight: 500; animation: navPulse 1s ease-in-out infinite;">Loading road names...</span>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            } else if (waypoint.role === 'boarding') {
                const activeRoute = isTransfer ? leg1.route : route;
                const activeDetails = isTransfer ? (leg1.routeDetails || leg1) : route;
                const rName = activeRoute.name;
                const isLive = navRouteHasLiveBuses(rName);
                const travelMin = isTransfer ? leg1TravelMin : computeBusTravelTimeMinutes(activeDetails);
                const stopsCount = Math.max(0, (activeDetails && activeDetails.stopsInOrder ? activeDetails.stopsInOrder.length : (activeDetails.totalStops || (activeDetails.stops ? activeDetails.stops.length : 0))) - 1);
                const stopsSeq = isTransfer ? buildStopsSeqHtml(leg1.routeDetails, startStop.id, transferStop.id) : (route.stopsInOrder ? buildStopsSeqHtml(route, startStop.id, endStop.id) : '');

                travelHtml = `
                    <div class="waypoint-emoji waypoint-travel-bus" data-leg="1">
                        <div class="waypoint-travel-header">
                            <div class="waypoint-circle"><i class="fa-solid fa-bus"></i></div>
                            <span class="route-badge" style="font-size: 1.4rem; font-weight: bold;">${formatRouteLabelColored(rName)}</span>
                            ${isLive ? `<span class="travel-time">${travelMin}m</span>` : ''}
                            <span class="stops-info">Take bus for ${stopsCount} ${getStopCountText(activeDetails)}</span>
                        </div>
                        ${stopsSeq ? `<div class="bus-stops-list-wrapper">${stopsSeq}</div>` : ''}
                    </div>
                `;
            } else if (waypoint.role === 'transfer') {
                const rName = leg2.route.name;
                const isLive = navRouteHasLiveBuses(rName);
                const activeDetails = leg2.routeDetails || leg2;
                const stopsCount = Math.max(0, (activeDetails && activeDetails.stopsInOrder ? activeDetails.stopsInOrder.length : (activeDetails.totalStops || (activeDetails.stops ? activeDetails.stops.length : 0))) - 1);
                const stopsSeq = buildStopsSeqHtml(leg2.routeDetails, transferStop.id, endStop.id);

                travelHtml = `
                    <div class="waypoint-emoji waypoint-travel-bus" data-leg="2">
                        <div class="waypoint-travel-header">
                            <div class="waypoint-circle"><i class="fa-solid fa-bus"></i></div>
                            <span class="route-badge" style="font-size: 1.4rem; font-weight: bold;">${formatRouteLabelColored(rName)}</span>
                            ${isLive ? `<span class="travel-time">${leg2TravelMin}m</span>` : ''}
                            <span class="stops-info">Take bus for ${stopsCount} ${getStopCountText(activeDetails)}</span>
                        </div>
                        ${stopsSeq ? `<div class="bus-stops-list-wrapper">${stopsSeq}</div>` : ''}
                    </div>
                `;
            } else if (waypoint.role === 'alighting' && hasEndWalk) {
                const mapsBtn = (endStop && endBuilding) ? getWalkingMapsButtonHtml(endStop.latitude, endStop.longitude, endBuilding.lat, endBuilding.lng) : '';
                const walkMin = Math.ceil((endWalkDistance?.feet || 0) / 220);
                travelHtml = `
                    <div class="waypoint-emoji waypoint-travel-walk">
                        <div class="waypoint-travel-row">
                            <div class="waypoint-travel-header">
                                <div class="waypoint-circle"><i class="fa-solid fa-person-walking"></i></div>
                                <span class="travel-time">${walkMin}m</span>
                                <span class="walking-info">Walk ${Math.round(endWalkDistance ? endWalkDistance.feet : 0).toLocaleString()} ft to destination</span>
                            </div>
                            ${mapsBtn}
                        </div>
                        <div class="walking-roads-wrapper">
                            <div class="walking-roads-list" id="end-walking-roads">
                                <div class="roads-sequence" style="font-size: 1.1rem;">
                                    <span style="color: var(--theme-color-lighter); font-weight: 500; animation: navPulse 1s ease-in-out infinite;">Loading road names...</span>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }
        }

        return `
            <div class="waypoint-row clickable-waypoint ${rowClass}" data-waypoint-role="${waypoint.role || ''}" data-waypoint-index="${index}" data-waypoint-type="${waypoint.type}" data-waypoint-name="${waypoint.name}" data-is-boarding="${waypoint.isBoarding || false}" data-is-transfer="${waypoint.isTransfer || false}" data-is-alighting="${waypoint.isAlighting || false}">
                <div class="waypoint-circle ${circleClass}">
                    <i class="${waypointIcon}"></i>
                </div>
                <div class="waypoint-content" style="margin-left: 0.75rem;">
                    <div class="waypoint-header">
                        <h4 class="waypoint-title" style="user-select: none;">${waypoint.name} <i class="fa-duotone fa-solid fa-right" style="--fa-primary-color: var(--theme-link); --fa-secondary-color: color-mix(in srgb, var(--theme-link) 70%, white);"></i></h4>
                        ${waypoint.description ? `<div class="waypoint-description">${waypoint.description}</div>` : ''}
                    </div>
                </div>
            </div>
            ${busesHtml}
            ${travelHtml}
        `;
    }).join('');
}
window.renderTimelineWaypointsHtml = renderTimelineWaypointsHtml;

// Display the calculated route in the navigation UI
function displayRoute(routeData) {
    let {
        startBuilding,
        endBuilding,
        startStop,
        endStop,
        route,
        allRoutes = [],
        selectedRouteIndex = 0,
        startWalkDistance,
        endWalkDistance,
        hasAlternatives = false,
        alternativeRoutes = [],
        usedFuzzyMatch = { from: false, to: false },
        originalInputs = { from: '', to: '' },
        startIsStop = false,
        endIsStop = false,
        
        routeCombosMap = {},
        restoreRouteName = null
    } = routeData;

    // Clear existing route display and ensure flex when shown
    $('.nav-directions-wrapper').removeClass('none').addClass('flex').empty();
    navDirectionsWasVisibleBeforeFocus = false;

    const directionsContainer = $('.nav-directions-wrapper');

    // Create route selector header if there are multiple routes
    let routeSelectorHtml = '';
    // Prepare routes for display: exclude winter/summer/all/on; group WKND together and place at end
    let routesForDisplay = [];
    let selectedRouteDisplayIndex = 0;
    if (allRoutes.length > 1) {
        const isExcluded = (r) => {
            const name = typeof r === 'string' ? r : (r && r.name ? r.name : '');
            const n = String(name || '').toLowerCase();
            if (n.includes('-')) {
                const parts = n.split('-');
                return parts.some(p => p.includes('winter') || p.includes('summer') || p === 'all' || p === 'on1' || p === 'on2' || p.startsWith('on'));
            }
            return n.includes('winter') || n.includes('summer') || n === 'all' || n === 'on1' || n === 'on2' || n.startsWith('on');
        };
        const isWknd = (name) => {
            const n = String(name || '').toLowerCase();
            return n.startsWith('wknd');
        };

        const baseRoutes = allRoutes.filter(r => !isExcluded(r) && (r.isTransfer || r.isWalk || !isWknd(r.name)));
        const wkndRoutes = allRoutes.filter(r => !r.isTransfer && !r.isWalk && !isExcluded(r) && isWknd(r.name));

        // Build display entries for base routes
        routesForDisplay = baseRoutes.map(r => ({
            route: r,
            displayName: r.displayName || r.name.toUpperCase(),
            isTransfer: !!r.isTransfer,
            isWalk: !!r.isWalk
        }));

        // Group weekend variants by suffix (e.g., 1, 2)
        if (wkndRoutes.length > 0) {
            const getVariant = (name) => {
                const n = String(name || '').toLowerCase();
                const m = n.match(/wknd(\d+)/);
                return m ? m[1] : '';
            };
            const groups = {};
            wkndRoutes.forEach(r => {
                const v = getVariant(r.name);
                if (!groups[v]) groups[v] = r;
            });
            const variants = Object.keys(groups).sort((a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0));
            variants.forEach(v => {
                const r = groups[v];
                const label = `WKND${v}`;
                routesForDisplay.push({ route: r, displayName: label, isTransfer: false });
            });
        }

        // Compute journey time and active bus status for each candidate route
        routesForDisplay.forEach(entry => {
            if (entry.isWalk || (entry.route && entry.route.isWalk)) {
                entry.isWalk = true;
                entry.hasLive = true;
                const walkMin = (typeof entry.route.journeyMinutes === 'number' && entry.route.journeyMinutes > 0)
                    ? entry.route.journeyMinutes
                    : (entry.route.walkMinutes || 0);
                entry.journeyMinutes = walkMin;
                entry.walkMinutes = walkMin;
                return;
            }
            const rKey = entry.route.name.toLowerCase();
            const combo = routeCombosMap[rKey];
            const hasLive = navRouteHasLiveBuses(entry.route.name, entry.displayName);
            entry.hasLive = hasLive;
            entry.journeyMinutes = hasLive ? calculateOptionJourneyMinutes(entry.route, combo, routeData) : 0;
            entry.walkMinutes = calculateOptionWalkMinutes(entry.route, combo, routeData);
        });

        // Filter walk option if not appropriate
        const walkEntry = routesForDisplay.find(e => e.isWalk || (e.route && e.route.isWalk));
        if (walkEntry) {
            const busOptions = routesForDisplay.filter(e => !e.isWalk && !(e.route && e.route.isWalk));
            const walkMin = walkEntry.journeyMinutes || walkEntry.walkMinutes;
            const walkDist = (walkEntry.route && walkEntry.route.totalWalkingFeet) || (walkEntry.route && walkEntry.route.walkDistance && walkEntry.route.walkDistance.feet) || (walkMin * 220);
            if (!shouldIncludeWalkOption(walkMin, walkDist, busOptions)) {
                routesForDisplay = routesForDisplay.filter(e => e !== walkEntry);
            }
        }

        // Filter transfer routes: only show transfer options that have a shorter
        // total time than the slowest direct route, or considerably less walking.
        routesForDisplay = filterTransferRoutesForDisplay(routesForDisplay, routeCombosMap, routeData);

        // Sort route options: live routes first (sorted ascending by journey
        // time), then inactive routes (sorted ascending). Inactive WKND/ON
        // variants sort after inactive weekday routes so weekend service
        sortRoutesForDisplay(routesForDisplay);

        // Default to the first (lowest time) route, unless restoring a previous
        // view ("Back to nav") — then keep the route pill the user had selected.
        selectedRouteDisplayIndex = 0;
        if (restoreRouteName) {
            const restoreKey = String(restoreRouteName).trim().toLowerCase();
            const restoreIdx = routesForDisplay.findIndex(e => String(e.route.name).trim().toLowerCase() === restoreKey);
            if (restoreIdx >= 0) selectedRouteDisplayIndex = restoreIdx;
        }
        if (routesForDisplay.length > 0) {
            const primaryEntry = routesForDisplay[selectedRouteDisplayIndex];
            const primaryKey = primaryEntry.route.name.toLowerCase();
            const primaryCombo = routeCombosMap[primaryKey];
            if (primaryEntry.isWalk || (primaryEntry.route && primaryEntry.route.isWalk)) {
                route = primaryEntry.route;
                startStop = null;
                endStop = null;
                startWalkDistance = (primaryCombo && primaryCombo.startWalkDistance) || (primaryEntry.route && primaryEntry.route.walkDistance) || startWalkDistance;
                endWalkDistance = null;
            } else if (primaryCombo) {
                if (primaryEntry.route.isTransfer || primaryCombo.isTransfer) {
                    startStop = primaryCombo.startStop;
                    const transferStop = primaryCombo.transferStop;
                    endStop = primaryCombo.endStop;
                    startWalkDistance = primaryCombo.startWalkDistance;
                    endWalkDistance = primaryCombo.endWalkDistance;
                    const leg1Route = (primaryCombo.leg1 && primaryCombo.leg1.route) || primaryEntry.route.leg1.route;
                    const leg2Route = (primaryCombo.leg2 && primaryCombo.leg2.route) || primaryEntry.route.leg2.route;
                    route = {
                        ...primaryEntry.route,
                        isTransfer: true,
                        transferStop: transferStop,
                        leg1: {
                            ...(primaryCombo.leg1 || primaryEntry.route.leg1),
                            routeDetails: getRouteDetails(leg1Route, startStop.id, transferStop.id)
                        },
                        leg2: {
                            ...(primaryCombo.leg2 || primaryEntry.route.leg2),
                            routeDetails: getRouteDetails(leg2Route, transferStop.id, endStop.id)
                        }
                    };
                } else {
                    route = getRouteDetails(primaryEntry.route, primaryCombo.startStop.id, primaryCombo.endStop.id);
                    startStop = primaryCombo.startStop;
                    endStop = primaryCombo.endStop;
                    startWalkDistance = primaryCombo.startWalkDistance;
                    endWalkDistance = primaryCombo.endWalkDistance;
                }
            } else {
                route = primaryEntry.route;
            }
        }
    } else if (allRoutes.length === 1) {
        if (allRoutes[0].isWalk) {
            routesForDisplay = [{
                route: allRoutes[0],
                displayName: 'Walk',
                isTransfer: false,
                isWalk: true,
                hasLive: true,
                journeyMinutes: allRoutes[0].journeyMinutes || (typeof allRoutes[0].walkMinutes === 'number' ? allRoutes[0].walkMinutes : 0),
                walkMinutes: allRoutes[0].walkMinutes || 0
            }];
            selectedRouteDisplayIndex = 0;
            route = allRoutes[0];
            startStop = null;
            endStop = null;
        } else {
            const rName = String((allRoutes[0] && allRoutes[0].name) || '').toLowerCase();
            if (rName !== 'on1' && rName !== 'on2' && !rName.startsWith('on')) {
                routesForDisplay = [{
                    route: allRoutes[0],
                    displayName: allRoutes[0].displayName || allRoutes[0].name.toUpperCase(),
                    isTransfer: !!allRoutes[0].isTransfer,
                    hasLive: navRouteHasLiveBuses(allRoutes[0].name),
                    journeyMinutes: navRouteHasLiveBuses(allRoutes[0].name) ? calculateOptionJourneyMinutes(allRoutes[0], null, routeData) : 0,
                    walkMinutes: calculateOptionWalkMinutes(allRoutes[0], null, routeData)
                }];
                selectedRouteDisplayIndex = 0;
            }
        }
    }

    routeSelectorHtml = buildRouteSelectorHtml(routesForDisplay, selectedRouteDisplayIndex);

    // Removed multi-stop info UI per request

    // No longer showing alternative routes info since it's clear from the route selector above

    // Walking segment from start to boarding stop removed (routes no longer show
    // Create main content wrapper
    const contentWrapperHtml = `
        <div class="nav-route-stats-bar none">
            <div class="nav-route-stat-col" id="nav-stat-walk" title="Total walking time and distance">
                <div class="nav-route-stat-top">
                    <i class="fa-solid fa-person-walking"></i>
                    <span class="nav-route-stat-val">--</span>
                </div>
                <span class="nav-route-stat-sub">--</span>
            </div>
            <div class="nav-route-stat-col" id="nav-stat-wait" title="Estimated wait time for soonest bus">
                <div class="nav-route-stat-top">
                    <i class="fa-solid fa-person-shelter"></i>
                    <span class="nav-route-stat-val">--</span>
                </div>
                <span class="nav-route-stat-sub">Shortest wait</span>
            </div>
            <div class="nav-route-stat-col" id="nav-stat-bus" title="Total bus travel time and stops">
                <div class="nav-route-stat-top">
                    <i class="fa-solid fa-bus"></i>
                    <span class="nav-route-stat-val">--</span>
                </div>
                <span class="nav-route-stat-sub">--</span>
            </div>
        </div>
        <div class="nav-transfer-info-banner none">
            <i class="fa-solid fa-circle-info"></i>
            <span>This route contains a transfer; arriving to the transfer stop late may make this path slower than a direct route.</span>
        </div>
        <div class="nav-walk-warning-banner none">
            <i class="fa-solid fa-circle-info"></i>
            <span>Although this path may be faster than other routes, it may contain substantially more walking.</span>
        </div>
        <div class="route-content-wrapper">
            <div class="waypoint-rows-container">
                ${renderTimelineWaypointsHtml({
                    startBuilding,
                    endBuilding,
                    startStop,
                    transferStop: route.transferStop || routeData.transferStop,
                    endStop,
                    route,
                    startWalkDistance,
                    endWalkDistance,
                    startIsStop,
                    endIsStop,
                    selectedIncomingBusIndex: routeData.selectedIncomingBusIndex,
                    selectedIncomingBusName: routeData.selectedIncomingBusName,
                    selectedTransferLeg1BusIndex: routeData.selectedTransferLeg1BusIndex,
                    selectedTransferLeg1BusName: routeData.selectedTransferLeg1BusName,
                    selectedTransferLeg2BusIndex: routeData.selectedTransferLeg2BusIndex,
                    selectedTransferLeg2BusName: routeData.selectedTransferLeg2BusName
                })}
                <div class="waypoint-connector-global"></div>
            </div>
        </div>
    `;

    // Add content to container
    directionsContainer.html(contentWrapperHtml);

    // Snapshot this route view for the "<- Back to nav" button on waypoint popups.
    navRouteSession = {
        routeData: {
            startBuilding,
            endBuilding,
            startStop,
            transferStop: route.transferStop || routeData.transferStop,
            endStop,
            route,
            allRoutes,
            routesForDisplay,
            selectedRouteDisplayIndex,
            startWalkDistance,
            endWalkDistance,
            hasAlternatives: allRoutes.length > 1,
            alternativeRoutes: allRoutes.length > 1 ? allRoutes.slice(1) : [],
            usedFuzzyMatch,
            originalInputs,
            startIsStop,
            endIsStop,
            routeCombosMap,
            restoreRouteName: (routesForDisplay[selectedRouteDisplayIndex] && routesForDisplay[selectedRouteDisplayIndex].route.name) || route.name,
            selectedIncomingBusName: routeData.selectedIncomingBusName || null,
            selectedIncomingBusIndex: (typeof routeData.selectedIncomingBusIndex === 'number') ? routeData.selectedIncomingBusIndex : null,
            selectedTransferLeg1BusName: routeData.selectedTransferLeg1BusName || null,
            selectedTransferLeg1BusIndex: (typeof routeData.selectedTransferLeg1BusIndex === 'number') ? routeData.selectedTransferLeg1BusIndex : null,
            selectedTransferLeg2BusName: routeData.selectedTransferLeg2BusName || null,
            selectedTransferLeg2BusIndex: (typeof routeData.selectedTransferLeg2BusIndex === 'number') ? routeData.selectedTransferLeg2BusIndex : null
        },
        fromVal: $('#nav-from-input').val(),
        toVal: $('#nav-to-input').val(),
        scrollTop: 0,
        selectedFromBuilding,
        selectedFromStop,
        selectedToBuilding,
        selectedToStop
    };
    window.navRouteSession = navRouteSession;

    // Render the route selector above the directions wrapper (outside the scrolled content)
    renderNavRouteSelector(routesForDisplay, selectedRouteDisplayIndex);

    // Update transfer and walk info banners
    if (typeof updateNavInfoBanners === 'function') {
        updateNavInfoBanners(route, selectedRouteDisplayIndex, routesForDisplay);
    } else if (typeof updateNavTransferInfoBanner === 'function') {
        updateNavTransferInfoBanner(route);
    }

    directionsContainer.append(`
        <div class="flex justify-center mt-3rem mb-2rem">
            <div class="nav-close-btn py-1rem px-2rem br-4rem text-1p6rem bold-600 w-min" onclick="closeNavigation()">CLOSE</div>
        </div>
    `);

    // Load road names for walking segments asynchronously
    loadWalkingRoadNames(startBuilding, endBuilding, startStop, endStop, startIsStop, endIsStop);

    // Position the single global waypoint connector after render
    positionGlobalWaypointConnector();

    // Add click handlers for selectable transfer destination bus rows.
    // Tapping a Leg 1 bus selects it and updates the Leg 2 incoming buses list.
    if (!window._navTransferBusClickBound) {
        window._navTransferBusClickBound = true;
        $(document).on('click', '.selectable-transfer-bus', function(e) {
            e.stopPropagation();
            const busName = $(this).data('bus-name');
            const busIndex = $(this).data('bus-index');
            if (!busName && typeof busIndex === 'undefined') return;

            if (navRouteSession && navRouteSession.routeData) {
                navRouteSession.routeData.selectedTransferLeg1BusName = String(busName);
                navRouteSession.routeData.selectedTransferLeg1BusIndex = (typeof busIndex !== 'undefined') ? parseInt(busIndex, 10) : 0;
                navRouteSession.routeData.selectedTransferLeg2BusName = null;
                navRouteSession.routeData.selectedTransferLeg2BusIndex = null;
                updateNavBusesDisplay();
            }
        });
    }

    // Add click handlers for selectable incoming bus rows (direct boarding, transfer leg 1 boarding, or transfer leg 2 incoming).
    // Tapping an incoming bus updates selected bus and recalculates destination arrival times.
    if (!window._navIncomingBusClickBound) {
        window._navIncomingBusClickBound = true;
        $(document).on('click', '.selectable-incoming-bus', function(e) {
            e.stopPropagation();
            const busName = $(this).data('bus-name');
            const busIndex = $(this).data('bus-index');
            const listType = $(this).data('list-type') || $(this).closest('.incoming-buses-list').data('list-type');
            if (!busName && typeof busIndex === 'undefined') return;

            if (navRouteSession && navRouteSession.routeData) {
                const parsedIdx = (typeof busIndex !== 'undefined') ? parseInt(busIndex, 10) : 0;
                const busNameStr = String(busName);
                if (listType === 'transfer_leg2') {
                    navRouteSession.routeData.selectedTransferLeg2BusName = busNameStr;
                    navRouteSession.routeData.selectedTransferLeg2BusIndex = parsedIdx;
                } else if (listType === 'boarding_leg1') {
                    navRouteSession.routeData.selectedTransferLeg1BusName = busNameStr;
                    navRouteSession.routeData.selectedTransferLeg1BusIndex = parsedIdx;
                    navRouteSession.routeData.selectedTransferLeg2BusName = null;
                    navRouteSession.routeData.selectedTransferLeg2BusIndex = null;
                } else {
                    navRouteSession.routeData.selectedIncomingBusName = busNameStr;
                    navRouteSession.routeData.selectedIncomingBusIndex = parsedIdx;
                }
                updateNavBusesDisplay();
            }
        });
    }

    // Add click handlers for waypoint titles.
    // Bound once on document (not per render): the handler only reads DOM
    // data-* attributes and module globals, so a single delegated listener
    // serves every re-render without duplicate firings.
    if (!window._navWaypointClickBound) {
        window._navWaypointClickBound = true;
    $(document).on('click', '.clickable-waypoint', function() {
        const waypointType = $(this).data('waypoint-type');
        const waypointName = $(this).data('waypoint-name');
        const isBoarding = $(this).data('is-boarding');
        const isAlighting = $(this).data('is-alighting');

        // Capture the live nav view before it's torn down so the popup opened
        // below can offer "<- Back to nav" and restore this exact view.
        if (navRouteSession) {
            navRouteSession.fromVal = $('#nav-from-input').val();
            navRouteSession.toVal = $('#nav-to-input').val();
            navRouteSession.scrollTop = $('.navigate-inner').scrollTop() || $('.nav-directions-wrapper').scrollTop();
            navRouteSession.selectedFromBuilding = selectedFromBuilding;
            navRouteSession.selectedFromStop = selectedFromStop;
            navRouteSession.selectedToBuilding = selectedToBuilding;
            navRouteSession.selectedToStop = selectedToStop;
        }
        navReentry = true;
        
        if (waypointType === 'building') {
            // Find and select the building on the map
            const buildingKey = Object.keys(buildingIndex).find(key => 
                buildingIndex[key].name.toLowerCase() === waypointName.toLowerCase()
            );
            
            if (buildingKey) {
                const building = buildingIndex[buildingKey];
                
                // Ensure buildings layer is loaded before showing building info
                if (!buildingsLayer) {
                    loadBuildings().then(() => {
                        showBuildingInfo(building);
                        
                        // Fly to the building location
                        if (building && building.lat && building.lng) {
                            flyToCenteredBelow([building.lat, building.lng], 18, document.querySelector('.building-info-popup .br-1rem.p-1rem'), 1.5);
                        }
                    });
                } else {
                    showBuildingInfo(building);
                    
                    // Fly to the building location
                    if (building && building.lat && building.lng) {
                        flyToCenteredBelow([building.lat, building.lng], 18, document.querySelector('.building-info-popup .br-1rem.p-1rem'), 1.5);
                    }
                }
                
                // Close navigation wrapper and hide search
                closeNavigation();
                
                sa_event('btn_press', {
                    'btn': 'nav_waypoint_building_clicked',
                    'building': waypointName,
                    'context': 'navigation'
                });
            }
        } else if (waypointType === 'stop') {
            // Find the stop and show stop info
            const stopId = Object.keys(stopsData).find(id => 
                stopsData[id].name.toLowerCase() === waypointName.toLowerCase()
            );
            
            if (stopId) {
                const stop = stopsData[stopId];
                
                // Show stop info (top-anchored card), then fly the stop into
                // the center of the map area that remains visible below it.
                popStopInfo(parseInt(stopId));
                
                // Fly to the stop location
                if (stop && stop.latitude && stop.longitude) {
                    clearPanoutFeedback();
                    flyToCenteredBelow([stop.latitude, stop.longitude], 18, document.querySelector('.stop-info-popup .stop-info-popup-inner'), 1.5);
                }
                
                // Close navigation
                closeNavigation();
                
                sa_event('btn_press', {
                    'btn': 'nav_waypoint_stop_clicked',
                    'stop': waypointName,
                    'stop_id': stopId,
                    'action': isBoarding ? 'boarding' : 'departing',
                    'context': 'navigation'
                });
            }
        }
    });
    }

    // Show directions tab if hidden
    openDirectionsNav();
    window.errorTracker.trackNavigationWrapperShow('calculateRoute function');
    
    // Ensure directions wrapper uses flex when visible
    $('.nav-directions-wrapper').removeClass('none').addClass('flex');

    // A freshly-calculated route supersedes any focus-hide restore state.
    navDirectionsWasVisibleBeforeFocus = false;

    // Remember this route so a re-selection of the same from/to can reshow
    // the already-rendered panel instead of recomputing it.
    lastComputedRouteKey = `${String(startBuilding.name).trim().toLowerCase()}\u0001${String(endBuilding.name).trim().toLowerCase()}`;

    // Scroll to top of route content wrapper
    $('.nav-directions-wrapper').scrollTop(0);
    $('.navigate-inner').scrollTop(0);
}
window.displayRoute = displayRoute;

// Adjust corner border radii and top border if the attached drawer list is wider/narrower than its parent travel header
function adjustAttachedListCornerRadii() {
    $('.waypoint-travel-walk, .waypoint-travel-bus').each(function() {
        const travelRow = $(this);
        const header = travelRow.find('.waypoint-travel-header');
        const list = travelRow.find('.walking-roads-list, .bus-stops-list');

        if (header.length > 0 && list.length > 0 && list.is(':visible')) {
            const headerOffset = header.offset();
            const listOffset = list.offset();

            if (headerOffset && listOffset) {
                const headerRight = headerOffset.left + header.outerWidth();
                const listRight = listOffset.left + list.outerWidth();

                // If right edge of list is NOT past right edge of header (with 1px buffer for subpixel layout)
                if (listRight <= headerRight + 1) {
                    header.addClass('header-corner-rounded');
                    list.addClass('list-top-right-square');
                    list.removeClass('list-border-top');
                } else {
                    header.removeClass('header-corner-rounded');
                    list.removeClass('list-top-right-square');
                    list.addClass('list-border-top');
                }
            }
        }
    });
}

// Position a single vertical connector from the first to the last waypoint circle
function positionGlobalWaypointConnector() {
    const container = $('.waypoint-rows-container');
    if (container.length === 0) {
        return;
    }

    adjustAttachedListCornerRadii();

    const circles = container.find('.waypoint-circle');
    if (circles.length < 2) {
        return;
    }

    const first = $(circles.get(0));
    const last = $(circles.get(circles.length - 1));

    const containerOffset = container.offset();
    const firstOffset = first.offset();
    const lastOffset = last.offset();

    // Position connector starting at the TOP of the first circle
    const firstTop = (firstOffset.top - containerOffset.top);
    // End at the BOTTOM of the last circle
    const lastBottom = (lastOffset.top - containerOffset.top) + last.outerHeight();

    const firstCenterX = (firstOffset.left - containerOffset.left) + (first.outerWidth() / 2);

    const top = firstTop;
    const height = Math.max(0, lastBottom - firstTop);

    const connector = container.find('.waypoint-connector-global');

    connector.css({
        top: `${top}px`,
        left: `${firstCenterX - 1}px`,
        height: `${height}px`
    });

    // Remove existing directional arrows
    container.find('.waypoint-connector-arrow').remove();

    // Add down arrows/triangles in the gap between consecutive waypoint circles
    for (let i = 0; i < circles.length - 1; i++) {
        const c1 = $(circles.get(i));
        const c2 = $(circles.get(i + 1));
        const c1Offset = c1.offset();
        const c2Offset = c2.offset();

        const fromBottom = (c1Offset.top - containerOffset.top) + c1.outerHeight();
        const toTop = (c2Offset.top - containerOffset.top);

        if (toTop - fromBottom > 10) {
            const midY = (fromBottom + toTop) / 2;
            const arrow = $('<div class="waypoint-connector-arrow"></div>');
            arrow.css({
                top: `${midY}px`,
                left: `${firstCenterX}px`
            });
            container.append(arrow);
        }
    }
}

// Recalculate connector on window resize (layout changes)
$(window).on('resize', function() {
    positionGlobalWaypointConnector();
});

// Soften the hard edge where scrolled content disappears under the route
// selector: add a top fade to the directions wrapper while it is scrolled
// (removed at the top so the resting view is unaffected). The wrapper element
// persists in index.html; only its children are re-rendered, so this binding
// survives route switches and re-opens.
$('.navigate-inner').on('scroll', function() {
    const isStuck = this.scrollTop > 80;
    $('.nav-route-selector-container').toggleClass('nav-stuck', isStuck);
});

$('.nav-directions-wrapper').on('scroll', function() {
    $(this).toggleClass('nav-fade-top', this.scrollTop > 4);
});

// Compute total walk time, total wait time (lowest wait for soonest bus), and total bus travel time
function computeRouteTripStats(r, combo, routeData) {
    const rd = routeData || (navRouteSession && navRouteSession.routeData) || null;
    const startBuilding = (rd && rd.startBuilding) || null;
    const endBuilding = (rd && rd.endBuilding) || null;
    const startIsStop = !!(rd && rd.startIsStop);
    const endIsStop = !!(rd && rd.endIsStop);

    if (r && r.isWalk) {
        const rawWalk = (combo && typeof combo.startWalkDistance !== 'undefined')
            ? combo.startWalkDistance
            : ((r && typeof r.startWalkDistance !== 'undefined') ? r.startWalkDistance : (rd && rd.startWalkDistance));
        const walkMin = (typeof r.journeyMinutes === 'number' && r.journeyMinutes > 0)
            ? r.journeyMinutes
            : (r.walkMinutes || (rawWalk && typeof rawWalk.feet === 'number' ? Math.ceil(rawWalk.feet / 220) : (typeof rawWalk === 'number' ? Math.ceil(rawWalk / 220) : 0)));
        const totalFeet = (rawWalk && typeof rawWalk.feet === 'number') ? rawWalk.feet : (typeof rawWalk === 'number' ? rawWalk : (r.totalWalkingFeet || 0));
        const roundedFeet = totalFeet <= 300 ? Math.round(totalFeet) : Math.ceil(totalFeet / 100) * 100;
        let walkDistanceText = '';
        if (roundedFeet >= 5280) {
            walkDistanceText = `${(roundedFeet / 5280).toFixed(1)} mi`;
        } else {
            walkDistanceText = `${roundedFeet.toLocaleString()} ft`;
        }
        return {
            walkMinutes: walkMin,
            walkDistanceText,
            waitMinutes: 0,
            hasLiveWait: false,
            busMinutes: 0,
            busStopsText: 'Direct walk',
            isTransfer: false,
            isWalk: true
        };
    }

    const startStop = (combo && combo.startStop) || (r && r.startStop) || (rd && rd.startStop) || null;
    const endStop = (combo && combo.endStop) || (r && r.endStop) || (rd && rd.endStop) || null;

    const rawStartWalk = (combo && typeof combo.startWalkDistance !== 'undefined')
        ? combo.startWalkDistance
        : ((r && typeof r.startWalkDistance !== 'undefined') ? r.startWalkDistance : (rd && rd.startWalkDistance));

    const rawEndWalk = (combo && typeof combo.endWalkDistance !== 'undefined')
        ? combo.endWalkDistance
        : ((r && typeof r.endWalkDistance !== 'undefined') ? r.endWalkDistance : (rd && rd.endWalkDistance));

    const hasStartWalk = !!(rawStartWalk && rawStartWalk.feet > 30 && startStop && startBuilding && (String(startStop.id) !== String(startBuilding.id) || !startIsStop));
    const hasEndWalk = !!(rawEndWalk && rawEndWalk.feet > 30 && endStop && endBuilding && (String(endStop.id) !== String(endBuilding.id) || !endIsStop));

    const startWalkFeet = hasStartWalk ? (rawStartWalk.feet || 0) : 0;
    const endWalkFeet = hasEndWalk ? (rawEndWalk.feet || 0) : 0;
    const totalFeet = startWalkFeet + endWalkFeet;

    const startWalkMin = hasStartWalk ? Math.ceil(startWalkFeet / 220) : 0;
    const endWalkMin = hasEndWalk ? Math.ceil(endWalkFeet / 220) : 0;
    const walkMinutes = startWalkMin + endWalkMin;

    const roundedFeet = totalFeet <= 300 ? Math.round(totalFeet) : Math.ceil(totalFeet / 100) * 100;
    let walkDistanceText = '';
    if (roundedFeet >= 5280) {
        walkDistanceText = `${(roundedFeet / 5280).toFixed(1)} mi`;
    } else {
        walkDistanceText = `${roundedFeet.toLocaleString()} ft`;
    }

    let waitMinutes = 0;
    let hasLiveWait = false;
    let busMinutes = 0;
    let totalStops = 0;

    const isTransfer = !!(r && (r.isTransfer || (combo && combo.isTransfer) || (r.leg1 && r.leg2)));

    if (isTransfer) {
        const leg1 = (combo && combo.leg1) || (r && r.leg1);
        const leg2 = (combo && combo.leg2) || (r && r.leg2);
        const startStop = (combo && combo.startStop) || (leg1 && leg1.startStop) || (rd && rd.startStop) || (r && r.startStop);
        const transferStop = (combo && combo.transferStop) || (leg1 && leg1.transferStop) || (leg2 && leg2.transferStop) || (r && r.transferStop) || (rd && rd.transferStop);
        const endStop = (combo && combo.endStop) || (leg2 && leg2.endStop) || (rd && rd.endStop) || (r && r.endStop);

        if (leg1 && leg2 && startStop && transferStop && endStop) {
            const startStopId = startStop.id || startStop;
            const transferStopId = transferStop.id || transferStop;
            const endStopId = endStop.id || endStop;

            const leg1Route = leg1.route || leg1;
            const leg1Details = leg1.routeDetails || (typeof getRouteDetails === 'function' ? getRouteDetails(leg1Route, startStopId, transferStopId) : leg1);
            const leg1TravelMinutes = computeBusTravelTimeMinutes(leg1Details);

            const leg2Route = leg2.route || leg2;
            const leg2Details = leg2.routeDetails || (typeof getRouteDetails === 'function' ? getRouteDetails(leg2Route, transferStopId, endStopId) : leg2);
            const leg2TravelMinutes = computeBusTravelTimeMinutes(leg2Details);
            busMinutes = leg1TravelMinutes + leg2TravelMinutes;

            // Stops on Leg 1 (boarding stop -> transfer stop)
            let c1 = 0;
            const c1Arr = (leg1Details && leg1Details.stopsInOrder) ||
                          (leg1 && leg1.routeDetails && leg1.routeDetails.stopsInOrder) ||
                          (leg1Route && leg1Route.stopsInOrder) || [];
            if (c1Arr.length > 0) {
                c1 = Math.max(0, c1Arr.length - 1);
            } else if (leg1 && typeof leg1.startIndex === 'number' && typeof leg1.endIndex === 'number' && (leg1.stops || leg1Route.stops)) {
                const s1 = leg1.stops || leg1Route.stops;
                c1 = (leg1.endIndex - leg1.startIndex + s1.length) % s1.length;
            } else if (leg1Details && typeof leg1Details.totalStops === 'number' && leg1Details.totalStops > 0) {
                c1 = Math.max(0, leg1Details.totalStops - 1);
            }

            // Stops on Leg 2 (transfer stop -> destination stop)
            let c2 = 0;
            const c2Arr = (leg2Details && leg2Details.stopsInOrder) ||
                          (leg2 && leg2.routeDetails && leg2.routeDetails.stopsInOrder) ||
                          (leg2Route && leg2Route.stopsInOrder) || [];
            if (c2Arr.length > 0) {
                c2 = Math.max(0, c2Arr.length - 1);
            } else if (leg2 && typeof leg2.startIndex === 'number' && typeof leg2.endIndex === 'number' && (leg2.stops || leg2Route.stops)) {
                const s2 = leg2.stops || leg2Route.stops;
                c2 = (leg2.endIndex - leg2.startIndex + s2.length) % s2.length;
            } else if (leg2Details && typeof leg2Details.totalStops === 'number' && leg2Details.totalStops > 0) {
                c2 = Math.max(0, leg2Details.totalStops - 1);
            }

            totalStops = c1 + c2;

            const startWalkSec = hasStartWalk ? getStartWalkSeconds(rawStartWalk) : 0;
            let leg1Wait = 0;
            let leg1Live = false;
            if (leg1.route && navRouteHasLiveBuses(leg1.route.name)) {
                const top1 = getTopApproachingBuses(leg1.route.name, startStop.id, startWalkSec, 1);
                if (top1.length > 0) {
                    leg1Wait = Math.max(0, Math.ceil((top1[0].eta - startWalkSec) / 60));
                    leg1Live = true;
                }
            }

            let leg2Wait = 0;
            let leg2Live = false;
            const arriveAtTransferSec = startWalkSec + (leg1Wait * 60) + (leg1TravelMinutes * 60);
            if (leg2.route && navRouteHasLiveBuses(leg2.route.name)) {
                const minTransferSec = arriveAtTransferSec + 120; // 2 min buffer
                const top2 = getTopApproachingBuses(leg2.route.name, transferStop.id, minTransferSec, 1);
                if (top2.length > 0) {
                    leg2Wait = Math.max(2, Math.ceil((top2[0].eta - arriveAtTransferSec) / 60));
                    leg2Live = true;
                }
            }

            waitMinutes = leg1Wait + leg2Wait;
            hasLiveWait = leg1Live || leg2Live;
        }
    } else if (r) {
        const startStop = (combo && combo.startStop) || (rd && rd.startStop) || (r && r.startStop);
        const endStop = (combo && combo.endStop) || (rd && rd.endStop) || (r && r.endStop);
        const effectiveRoute = (startStop && endStop && typeof getRouteDetails === 'function')
            ? getRouteDetails(r, startStop.id, endStop.id)
            : r;
        busMinutes = computeBusTravelTimeMinutes(effectiveRoute);
        const stopsArr = (effectiveRoute && effectiveRoute.stopsInOrder && effectiveRoute.stopsInOrder.length > 0)
            ? effectiveRoute.stopsInOrder
            : ((r && r.stopsInOrder && r.stopsInOrder.length > 0) ? r.stopsInOrder : ((effectiveRoute && effectiveRoute.stops) || (r && r.stops) || []));
        totalStops = stopsArr.length > 0 ? stopsArr.length - 1 : Math.max(0, ((effectiveRoute && effectiveRoute.totalStops) || (r && r.totalStops) || 1) - 1);

        if (startStop && r.name && navRouteHasLiveBuses(r.name)) {
            const walkSeconds = hasStartWalk ? getStartWalkSeconds(rawStartWalk) : 0;
            const top = getTopApproachingBuses(r.name, startStop.id, walkSeconds, 1);
            if (top.length > 0) {
                waitMinutes = Math.max(0, Math.ceil((top[0].eta - walkSeconds) / 60));
                hasLiveWait = true;
            }
        }
    }

    const busStopsText = `${totalStops} ${totalStops === 1 ? 'stop' : 'stops'}`;

    return {
        walkMinutes,
        walkDistanceText,
        waitMinutes,
        hasLiveWait,
        busMinutes,
        busStopsText,
        isTransfer
    };
}
window.computeRouteTripStats = computeRouteTripStats;

// Toggle the 3-column stats bar, transfer info banner, and substantially-more-walking warning banner
function updateNavInfoBanners(route, selectedIndex, routesForDisplay) {
    const rd = (navRouteSession && navRouteSession.routeData) || null;
    const curRoute = route || (rd && rd.route) || null;
    const curRoutes = routesForDisplay || (rd && rd.routesForDisplay) || null;
    const curIndex = (typeof selectedIndex === 'number')
        ? selectedIndex
        : ((rd && typeof rd.selectedRouteDisplayIndex === 'number') ? rd.selectedRouteDisplayIndex : 0);

    const directionsVisible = !$('.nav-directions-wrapper').hasClass('none');

    // 1. 3-column route trip stats bar (walk time, wait time, bus travel time)
    if (curRoute && directionsVisible) {
        const rKey = curRoute && curRoute.name && String(curRoute.name).toLowerCase();
        let combo = (rd && rd.routeCombosMap && rd.routeCombosMap[rKey]) || null;
        if (!combo && curRoutes && curRoutes[curIndex] && curRoutes[curIndex].route) {
            const entryKey = String(curRoutes[curIndex].route.name || '').toLowerCase();
            combo = (rd && rd.routeCombosMap && rd.routeCombosMap[entryKey]) || null;
        }
        const stats = computeRouteTripStats(curRoute, combo, rd);

        $('#nav-stat-walk .nav-route-stat-val').text(`${stats.walkMinutes}m`);
        $('#nav-stat-walk .nav-route-stat-sub').text(stats.walkDistanceText);

        $('#nav-stat-wait .nav-route-stat-val').text(stats.hasLiveWait ? `${stats.waitMinutes}m` : '--');
        const waitSubText = stats.isWalk
            ? 'No wait'
            : ((stats.isTransfer || (curRoute && (curRoute.isTransfer || (curRoute.leg1 && curRoute.leg2))))
                ? 'Shortest total wait'
                : 'Shortest wait');
        $('#nav-stat-wait .nav-route-stat-sub').text(waitSubText);

        $('#nav-stat-bus .nav-route-stat-val').text(stats.isWalk ? '--' : `${stats.busMinutes}m`);
        $('#nav-stat-bus .nav-route-stat-sub').text(stats.busStopsText);

        $('.nav-route-stats-bar').removeClass('none');
    } else {
        $('.nav-route-stats-bar').addClass('none');
    }

    // 2. Transfer banner ("This route contains a transfer; arriving to the transfer stop late may make this path slower than a direct route." OR "This route contains a transfer")
    // If the transfer option is slower than or equal to the slowest direct route (there is no direct route it is faster than),
    // show "This route contains a transfer". If it is faster than a direct route, only show warning if missing the transfer makes it slower than quickest direct.
    let showTransferWarning = false;
    let transferWarningText = 'This route contains a transfer; arriving to the transfer stop late may make this path slower than a direct route.';
    const hasTransfer = !!(curRoute && (curRoute.isTransfer || (curRoute.leg1 && curRoute.leg2)));
    if (hasTransfer && directionsVisible && curRoutes && curRoutes.length > 0) {
        const isTransferEntry = (e) => !!(e.isTransfer || (e.route && (e.route.isTransfer || (e.route.leg1 && e.route.leg2))));
        const directRoutes = curRoutes.filter(e => !isTransferEntry(e) && !e.isWalk && !(e.route && e.route.isWalk));

        if (directRoutes.length === 0) {
            showTransferWarning = true;
            transferWarningText = 'This route contains a transfer';
        } else {
            const liveDirects = directRoutes.filter(e => e.hasLive);
            const comparisonDirects = liveDirects.length > 0 ? liveDirects : directRoutes;

            const getEntryTotalTime = (e) => {
                if (typeof e.journeyMinutes === 'number' && e.journeyMinutes > 0) return e.journeyMinutes;
                const rKey = e.route && e.route.name && String(e.route.name).toLowerCase();
                const combo = rd && rd.routeCombosMap && rd.routeCombosMap[rKey];
                return calculateOptionJourneyMinutes(e.route, combo, rd) || 0;
            };

            const directTimes = comparisonDirects.map(getEntryTotalTime).filter(t => t > 0);
            const quickestDirectTotalTime = directTimes.length > 0 ? Math.min(...directTimes) : 0;
            const slowestDirectTotalTime = directTimes.length > 0 ? Math.max(...directTimes) : 0;

            const rKey = curRoute && curRoute.name && String(curRoute.name).toLowerCase();
            const combo = (rd && rd.routeCombosMap && rd.routeCombosMap[rKey]) || null;
            const curEntry = (curRoutes && typeof curIndex === 'number' && curRoutes[curIndex]) || null;
            const curTransferTotalTime = (curEntry && typeof curEntry.journeyMinutes === 'number' && curEntry.journeyMinutes > 0)
                ? curEntry.journeyMinutes
                : calculateOptionJourneyMinutes(curRoute, combo, rd);

            // If this transfer option is slower than or equal to the slowest direct route (no direct route it is faster than)
            const isSlowerThanAllDirects = slowestDirectTotalTime > 0 && curTransferTotalTime >= slowestDirectTotalTime;

            if (isSlowerThanAllDirects) {
                showTransferWarning = true;
                transferWarningText = 'This route contains a transfer';
            } else if (quickestDirectTotalTime > 0) {
                const leg1 = (combo && combo.leg1) || curRoute.leg1;
                const leg2 = (combo && combo.leg2) || curRoute.leg2;
                const startStop = (combo && combo.startStop) || (leg1 && leg1.startStop) || (rd && rd.startStop) || curRoute.startStop;
                const transferStop = (combo && combo.transferStop) || (leg1 && leg1.transferStop) || (leg2 && leg2.transferStop) || curRoute.transferStop || (rd && rd.transferStop);
                const endStop = (combo && combo.endStop) || (leg2 && leg2.endStop) || (rd && rd.endStop) || curRoute.endStop;
                const startWalk = (combo && combo.startWalkDistance) || (rd && rd.startWalkDistance) || curRoute.startWalkDistance;

                const walkMinutes = calculateOptionWalkMinutes(curRoute, combo, rd);
                const startWalkSec = startWalk ? getStartWalkSeconds(startWalk) : 0;

                const startStopId = startStop ? (startStop.id || startStop) : null;
                const transferStopId = transferStop ? (transferStop.id || transferStop) : null;
                const endStopId = endStop ? (endStop.id || endStop) : null;

                const leg1Route = (leg1 && leg1.route) || leg1;
                const leg1Details = (leg1 && leg1.routeDetails) || (startStopId && transferStopId && typeof getRouteDetails === 'function' ? getRouteDetails(leg1Route, startStopId, transferStopId) : leg1);
                const leg1TravelMin = computeBusTravelTimeMinutes(leg1Details);

                const leg2Route = (leg2 && leg2.route) || leg2;
                const leg2Details = (leg2 && leg2.routeDetails) || (transferStopId && endStopId && typeof getRouteDetails === 'function' ? getRouteDetails(leg2Route, transferStopId, endStopId) : leg2);
                const leg2TravelMin = computeBusTravelTimeMinutes(leg2Details);

                let leg1WaitSoonest = 0;
                let leg1WaitBackup = 0;

                if (leg1Route && leg1Route.name && navRouteHasLiveBuses(leg1Route.name)) {
                    const top1 = getTopApproachingBuses(leg1Route.name, startStopId, startWalkSec, 3);
                    if (top1.length > 0) {
                        leg1WaitSoonest = Math.max(0, Math.ceil((top1[0].eta - startWalkSec) / 60));
                        if (top1.length > 1) {
                            leg1WaitBackup = Math.max(0, Math.ceil((top1[1].eta - startWalkSec) / 60));
                        } else {
                            leg1WaitBackup = leg1WaitSoonest + 12; // estimated loop headway
                        }
                    }
                }

                const arriveAtTransferSec = startWalkSec + (leg1WaitSoonest * 60) + (leg1TravelMin * 60);
                let leg2WaitSoonest = 0;
                let leg2WaitBackup = 0;

                if (leg2Route && leg2Route.name && navRouteHasLiveBuses(leg2Route.name)) {
                    const minTransferSec = arriveAtTransferSec + 120; // 2 min buffer
                    const top2 = getTopApproachingBuses(leg2Route.name, transferStopId, minTransferSec, 3);
                    if (top2.length > 0) {
                        leg2WaitSoonest = Math.max(2, Math.ceil((top2[0].eta - arriveAtTransferSec) / 60));
                        if (top2.length > 1) {
                            leg2WaitBackup = Math.max(2, Math.ceil((top2[1].eta - arriveAtTransferSec) / 60));
                        } else {
                            leg2WaitBackup = leg2WaitSoonest + 12; // estimated loop headway
                        }
                    }
                }

                const timeWithLeg2Backup = walkMinutes + leg1WaitSoonest + leg1TravelMin + leg2WaitBackup + leg2TravelMin;
                const timeWithLeg1Backup = walkMinutes + leg1WaitBackup + leg1TravelMin + leg2WaitSoonest + leg2TravelMin;
                const backupTransferTime = Math.max(timeWithLeg2Backup, timeWithLeg1Backup);

                if (backupTransferTime > quickestDirectTotalTime) {
                    showTransferWarning = true;
                    transferWarningText = 'This route contains a transfer; arriving to the transfer stop late may make this path slower than a direct route.';
                }
            }
        }
    }

    if (showTransferWarning) {
        $('.nav-transfer-info-banner span').text(transferWarningText);
        $('.nav-transfer-info-banner').removeClass('none');
    } else {
        $('.nav-transfer-info-banner').addClass('none');
    }

    // 3. Substantially more walking banner ("Although this path may be faster than other routes, it may contain substantially more walking.")
    let hasSubstantiallyMoreWalking = false;
    const isCurWalk = !!(curRoute && curRoute.isWalk);
    if (!isCurWalk && curRoutes && curRoutes.length > 1 && directionsVisible) {
        const curEntry = curRoutes[curIndex] || curRoutes.find(e => e.route && curRoute && e.route.name === curRoute.name);
        if (curEntry) {
            let curWalk = (typeof curEntry.walkMinutes === 'number') ? curEntry.walkMinutes : 0;
            if (!curWalk && typeof calculateOptionWalkMinutes === 'function') {
                const rKey = curEntry.route && curEntry.route.name && curEntry.route.name.toLowerCase();
                const combo = rd && rd.routeCombosMap && rd.routeCombosMap[rKey];
                curWalk = calculateOptionWalkMinutes(curEntry.route, combo, rd);
            }

            const isWeekendNavRoute = (entry) => {
                if (!entry) return false;
                const dName = String(entry.displayName || '').toLowerCase();
                if (dName.startsWith('wknd') || dName.startsWith('on') || dName.includes('weekend')) return true;
                const r = entry.route;
                if (r) {
                    const rName = String(r.name || '').toLowerCase();
                    if (rName.startsWith('wknd') || rName.startsWith('on') || rName.includes('weekend')) return true;
                    if (r.isTransfer) {
                        const l1 = String((r.leg1 && r.leg1.route && r.leg1.route.name) || '').toLowerCase();
                        const l2 = String((r.leg2 && r.leg2.route && r.leg2.route.name) || '').toLowerCase();
                        if (l1.startsWith('wknd') || l1.startsWith('on') || l2.startsWith('wknd') || l2.startsWith('on')) return true;
                    }
                }
                return false;
            };

            // Exclude weekend route walking times and pure walking routes from the comparison times
            const otherWalks = curRoutes
                .filter(e => e !== curEntry && !isWeekendNavRoute(e) && !e.isWalk && !(e.route && e.route.isWalk))
                .map(e => {
                    let w = (typeof e.walkMinutes === 'number') ? e.walkMinutes : 0;
                    if (!w && typeof calculateOptionWalkMinutes === 'function') {
                        const rKey = e.route && e.route.name && e.route.name.toLowerCase();
                        const combo = rd && rd.routeCombosMap && rd.routeCombosMap[rKey];
                        w = calculateOptionWalkMinutes(e.route, combo, rd);
                    }
                    return w;
                });

            if (otherWalks.length > 0) {
                const minOtherWalk = Math.min(...otherWalks);
                // Substantially more: at least 5 minutes more walking, at least 1.5x, and total walk >= 7 minutes
                if (curWalk - minOtherWalk >= 5 && curWalk >= minOtherWalk * 1.5 && curWalk >= 7) {
                    hasSubstantiallyMoreWalking = true;
                }
            }
        }
    }

    if (hasSubstantiallyMoreWalking && directionsVisible) {
        $('.nav-walk-warning-banner').removeClass('none');
    } else {
        $('.nav-walk-warning-banner').addClass('none');
    }
}
window.updateNavInfoBanners = updateNavInfoBanners;
function updateNavTransferInfoBanner(route) {
    updateNavInfoBanners(route);
}
window.updateNavTransferInfoBanner = updateNavTransferInfoBanner;

// Update route display when switching routes
function updateRouteDisplay(routeData) {
    const {
        startBuilding,
        endBuilding,
        startStop,
        endStop,
        route,
        startWalkDistance,
        endWalkDistance,
        originalInputs = { from: '', to: '' },
        startIsStop = false,
        endIsStop = false
    } = routeData;

    const rowsContainer = $('.waypoint-rows-container');
    if (rowsContainer.length > 0) {
        rowsContainer.html(`${renderTimelineWaypointsHtml({
            startBuilding,
            endBuilding,
            startStop,
            transferStop: route.transferStop || routeData.transferStop,
            endStop,
            route,
            startWalkDistance,
            endWalkDistance,
            startIsStop,
            endIsStop,
            selectedTransferLeg1BusIndex: (navRouteSession && navRouteSession.routeData && navRouteSession.routeData.selectedTransferLeg1BusIndex),
            selectedTransferLeg1BusName: (navRouteSession && navRouteSession.routeData && navRouteSession.routeData.selectedTransferLeg1BusName) || null
        })}<div class="waypoint-connector-global"></div>`);
        positionGlobalWaypointConnector();
    }

    // Load road names for walking segments when route is updated
    loadWalkingRoadNames(startBuilding, endBuilding, startStop, endStop, startIsStop, endIsStop);

    // Update transfer and walk info banners
    updateNavInfoBanners(route, (navRouteSession && navRouteSession.routeData && navRouteSession.routeData.selectedRouteDisplayIndex), (navRouteSession && navRouteSession.routeData && navRouteSession.routeData.routesForDisplay));
}

// Clear the current route display
function clearRouteDisplay() {
    $('.nav-directions-wrapper').removeClass('flex').addClass('none').empty();
    $('.nav-route-selector-container').empty().removeClass('nav-stuck');
    $('.nav-route-stats-bar, .nav-transfer-info-banner, .nav-walk-warning-banner').addClass('none');
    $('.navigate-inner').scrollTop(0);
    $('.nav-message').remove();
    navDirectionsWasVisibleBeforeFocus = false;
    lastComputedRouteKey = null;
    if (typeof updateNavFavoriteStarState === 'function') {
        updateNavFavoriteStarState();
    }
}

// Reopen the nav menu exactly as it was when a waypoint popup was opened
// (used by the "<- Back to nav" button on building/stop popups).
function openNavBack() {
    navBackActive = false;
    navReentry = false;
    const s = navRouteSession;
    if (!s || !s.routeData) return;

    // Tear down popups (icons, selectors, highlighting) before reopening nav.
    hideInfoBoxes(true);

    // Restore the from/to inputs exactly as the user left them.
    isSettingInputProgrammatically = true;
    $('#nav-from-input').val(s.fromVal || '').toggleClass('has-value', !!s.fromVal);
    $('#nav-to-input').val(s.toVal || '').toggleClass('has-value', !!s.toVal);
    isSettingInputProgrammatically = false;
    if (s.fromVal) $('#nav-from-clear-btn').fadeIn();
    else $('#nav-from-clear-btn').hide();
    if (s.toVal) $('#nav-to-clear-btn').fadeIn();
    else $('#nav-to-clear-btn').hide();

    // Restore the selected place state so future nav edits keep matching.
    selectedFromBuilding = s.selectedFromBuilding || null;
    selectedFromStop = s.selectedFromStop || null;
    selectedToBuilding = s.selectedToBuilding || null;
    selectedToStop = s.selectedToStop || null;

    // No pending source selection when restoring a completed route.
    window.navPendingSourceSelection = false;
    $('.nav-dest-row').removeClass('none');

    // Re-render the exact same route view (same route pill, stops, walks).
    displayRoute(s.routeData);
    if (typeof updateSearchHeading === 'function') {
        updateSearchHeading();
    }
    if (typeof updateNavFavoriteStarState === 'function') {
        updateNavFavoriteStarState();
    }

    // Restore the scroll position the user left from.
    if (s.scrollTop) {
        $('.navigate-inner').scrollTop(s.scrollTop);
        $('.nav-directions-wrapper').scrollTop(s.scrollTop);
    }
}
window.openNavBack = openNavBack;

// Fully close and clear navigation UI and state
function closeNavigation() {
    try {
        // Clear route UI
        $('.nav-directions-wrapper').removeClass('flex').addClass('none').empty();
        $('.nav-route-selector-container').empty().removeClass('nav-stuck');
        $('.nav-route-stats-bar, .nav-transfer-info-banner, .nav-walk-warning-banner').addClass('none');
        $('.navigate-inner').scrollTop(0);
        navDirectionsWasVisibleBeforeFocus = false;
        lastComputedRouteKey = null;
        $('.nav-directions-wtrapper').addClass('none').empty();
        // Clear inputs
        isSettingInputProgrammatically = true;
        $('#nav-from-input').val('').removeClass('has-value');
        $('#nav-to-input').val('').removeClass('has-value');
        isSettingInputProgrammatically = false;
        // Hide clear buttons
        $('#nav-from-clear-btn, #nav-to-clear-btn').hide();
        // Reset selected buildings and stops
        selectedFromBuilding = null;
        selectedToBuilding = null;
        selectedFromStop = null;
        selectedToStop = null;
        if (typeof updateSearchHeading === 'function') {
            updateSearchHeading();
        }
        // Reset pending source state and reveal dest row for next open
        window.navPendingSourceSelection = false;
        $('.nav-dest-row').removeClass('none');
        // Hide autocomplete and messages
        hideNavigationAutocomplete();
        $('.nav-message').hide();
        // Close the search shell (returns to map and resets to the search tab)
        if (typeof applySearchMode === 'function') {
            applySearchMode('search');
        }
        if (typeof closeSearch === 'function') {
            closeSearch();
        } else {
            $('.navigate-wrapper').fadeOut(200);
        }
    } catch (e) {
        console.error('Error closing navigation:', e);
        if (typeof closeSearch === 'function') {
            closeSearch();
        } else {
            $('.navigate-wrapper').fadeOut(200);
        }
    }
}

// Populate navigation examples using popular locations from search recommendations
function populateNavigationExamples() {
    console.log('populateNavigationExamples called');
    
    const $examplesContainer = $('.search-nav-examples');
    const $examplesWrapper = $('.search-nav-examples-wrapper');
    
    if ($examplesContainer.length === 0 || $examplesWrapper.length === 0) {
        console.warn('Navigation examples container not found');
        return;
    }
    
    // Count recent searches
    const recentSearchesCount = $('.search-recents .search-result-item').length;
    const maxExamples = 3;
    const examplesToShow = Math.max(0, maxExamples - recentSearchesCount);
    
    console.log(`Recent searches: ${recentSearchesCount}, Examples to show: ${examplesToShow}`);
    
    // Hide wrapper if no examples to show
    if (examplesToShow === 0) {
        $examplesWrapper.hide();
        return;
    }
    
    // Show wrapper and clear container
    $examplesWrapper.show();
    $examplesContainer.empty();
    
    // Get popular buildings from building abbreviations (same as search recommendations)
    const uniqueBuildings = [];
    const seenNumbers = new Set();
    
    for (const item of buildingAbbreviations) {
        if (!seenNumbers.has(item.number)) {
            seenNumbers.add(item.number);
            uniqueBuildings.push(item);
        }
    }
    
    if (uniqueBuildings.length < examplesToShow * 2) {
        console.warn('Not enough popular buildings for navigation examples');
        return;
    }

    // Shuffle and select buildings (need 2 per example)
    const shuffled = uniqueBuildings.sort(() => 0.5 - Math.random());
    const selectedBuildings = shuffled.slice(0, examplesToShow * 2);
    
    // Create example pairs (start -> destination)
    const examples = [];
    for (let i = 0; i < examplesToShow; i++) {
        const startBuilding = selectedBuildings[i * 2];
        const endBuilding = selectedBuildings[i * 2 + 1];
        
        // Find the building data in buildingIndex
        const startBuildingKey = Object.keys(buildingIndex).find(key => 
            buildingIndex[key].id === startBuilding.number.toString()
        );
        const endBuildingKey = Object.keys(buildingIndex).find(key => 
            buildingIndex[key].id === endBuilding.number.toString()
        );
        
        if (startBuildingKey && endBuildingKey) {
            examples.push({
                start: buildingIndex[startBuildingKey],
                end: buildingIndex[endBuildingKey],
                startName: startBuilding.short_name || startBuilding.name,
                endName: endBuilding.short_name || endBuilding.name
            });
        }
    }
    
    // Create example elements
    examples.forEach(example => {
        const $exampleItem = $(`
            <div class="nav-example-item flex pointer" style="column-gap: 0.3rem !important; align-items: flex-start;">
                <i class="fa-solid fa-route" style="color: var(--theme-hidden-route-col); font-size: 1.7rem; flex-shrink: 0;"></i>
                <div class="nav-example-text" style="color: var(--theme-color);">
                    <span>${example.startName}</span>
                    <span style="color: var(--theme-color-lighter);">→</span>
                    <span>${example.endName}</span>
                </div>
            </div>
        `);
        
        // Add click handler
        $exampleItem.click(function() {
            // Track navigation example click
            sa_event('btn_press', {
                'btn': 'nav_example_selected',
                'from': example.startName,
                'to': example.endName,
                'example_index': examples.indexOf(example)
            });
            
            // Set the navigation inputs
            isSettingInputProgrammatically = true;
            $('#nav-from-input').val(example.startName).trigger('input');
            $('#nav-to-input').val(example.endName).trigger('input');
            isSettingInputProgrammatically = false;
            
            // Set the selected building variables
            selectedFromBuilding = example.start.name.toLowerCase();
            selectedToBuilding = example.end.name.toLowerCase();
            
            // Show clear buttons
            $('#nav-from-clear-btn, #nav-to-clear-btn').fadeIn();
            
            // Hide autocomplete dropdown
            hideNavigationAutocomplete();
            
            // Calculate and display the route (opens the directions tab)
            setTimeout(() => {
                calculateRoute(example.startName, example.endName);
            }, 100);
        });
        
        $examplesContainer.append($exampleItem);
    });
    
    // Convert FontAwesome icons to custom icons
    replaceFontAwesomeIcons();
}