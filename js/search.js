let buildingIndex;
let enableSearchButtonGradientFlash = false;

let searchMode = 'search'; // 'search' | 'directions' — module-scoped for updateSearchPlaceholder
let searchReentry = false; // transient: true for the popup that follows a search result selection
let searchBackActive = false; // persistent: the currently-visible popup offers a "Back to search" button
let searchOpenView = null; // { center, zoom } of the map right before the search button was pressed

let searchViewportListenersAttached = false;
let searchVvpHandler = null;

const SEARCH_PLACEHOLDER_TEMPLATE = 'Search {num} buildings & lots';

// Campus key -> display name for the search menu heading
const SEARCH_CAMPUS_NAMES = {
    'nb': 'New Brunswick',
    'camden': 'Camden',
    'newark': 'Newark'
};

function updateSearchHeading() {
    const $icon = $('.search-heading-icon');
    if (searchMode === 'directions') {
        $('.search-heading-text').text('Navigation');
        $icon.removeClass('icon-search fa-magnifying-glass fa-search').addClass('icon-route');
        return;
    }
    const campusKey = (typeof settings !== 'undefined' && settings && settings['campus']) || 'nb';
    const campusName = SEARCH_CAMPUS_NAMES[campusKey] || SEARCH_CAMPUS_NAMES['nb'];
    $('.search-heading-text').text(`Browse ${campusName}`);
    $icon.removeClass('icon-route fa-route').addClass('icon-search');
}

function adjustSearchHeights() {
  const isMobile = $(window).width() <= 992;
  if (isMobile && window.visualViewport) {
    const vvp = window.visualViewport;
    $('.search-wrapper').css({
      'top': vvp.offsetTop + 'px',
      'left': vvp.offsetLeft + 'px',
      'height': vvp.height + 'px',
      'width': vvp.width + 'px'
    });
  } else {
    $('.search-wrapper').css({
      'position': '',
      'top': '',
      'left': '',
      'height': '',
      'width': ''
    });
  }
}

function attachSearchViewportListeners() {
  if (searchViewportListenersAttached) return;
  searchViewportListenersAttached = true;
  searchVvpHandler = () => requestAnimationFrame(adjustSearchHeights);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', searchVvpHandler);
    window.visualViewport.addEventListener('scroll', searchVvpHandler);
  }
  window.addEventListener('resize', searchVvpHandler);
}

function detachSearchViewportListeners() {
  if (!searchViewportListenersAttached) return;
  searchViewportListenersAttached = false;
  if (window.visualViewport && searchVvpHandler) {
    window.visualViewport.removeEventListener('resize', searchVvpHandler);
    window.visualViewport.removeEventListener('scroll', searchVvpHandler);
  }
  if (searchVvpHandler) {
    window.removeEventListener('resize', searchVvpHandler);
  }
  searchVvpHandler = null;
}

// Robust focus helper for nav inputs — handles display:none -> layout + visualViewport
// timing + iOS user-gesture expiry. Callers should set _suppressNavAutocompleteOnFocus before invoking.
window.focusNavInput = function(selector) {
  selector = selector || '#nav-from-input';
  const el = document.querySelector(selector);
  if (!el) return;
  // Sync attempt preserves user-gesture (keyboard) when called inside click handler
  try { el.focus({ preventScroll: false }); } catch (e) {}
  if (document.activeElement === el) return;
  // Double rAF waits for removeClass('none') + adjustSearchHeights layout to flush
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (document.activeElement === el) return;
      // If still hidden (offsetParent null) retry after transition delay
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

// Function to update search placeholder with building count
function updateSearchPlaceholder(buildingCount) {
    if (searchMode === 'directions') {
        return;
    }
    const $searchInput = $('.search-pill-bar input');
    if ($searchInput.length === 0) {
        return;
    }
    
    const formattedCount = buildingCount.toLocaleString();
    
    const currentPlaceholder = $searchInput.attr('placeholder') || '';
    const originalPlaceholder = currentPlaceholder.includes('{num}')
        ? currentPlaceholder
        : SEARCH_PLACEHOLDER_TEMPLATE;
    const updatedPlaceholder = originalPlaceholder.replace('{num}', formattedCount);
    $searchInput.attr('placeholder', updatedPlaceholder);
}

$(document).ready(function() {
    const $input = $('.search-pill-bar input');
    const $clearBtn = $('.search-clear-btn');
    $input.val('')

    // Return the FINAL custom icon class directly (no FontAwesome swap needed),
    // so rendering search rows does not trigger the global MutationObserver.
    function placeIconClass(item) {
        if (item.category === 'building') {
            return 'icon icon-building';
        } else if (item.category === 'parking') {
            return 'icon icon-parking';
        } else if (item.category === 'stop') {
            return 'icon icon-bus-simple';
        }
        return '';
    }

    // Back button in the directions pill bar returns to the search view
    $('.nav-back-btn-styled').on('click', function() {
        applySearchMode('search');
        $input.focus();
    });

    // Track press and hold state
    let pressAndHoldTimer = null;
    let isPressAndHold = false;

    $('.search-btn').on('mousedown touchstart', function(e) {
        // Only prevent default for mouse events, not touch events
        if (e.type === 'mousedown') {
            e.preventDefault();
        }
        isPressAndHold = false;
        pressAndHoldTimer = setTimeout(() => {
            isPressAndHold = true;
            // Press and hold detected - open navigation in the directions tab
            hideInfoBoxes(true);
            $('.knight-mover').hide();
            closeSearch();

            // Open directions tab in the search shell
            openDirectionsNav();
            window.errorTracker.trackNavigationWrapperShow('Press and hold search button');
            window._suppressNavAutocompleteOnFocus = true;
            window.focusNavFromInput();

            sa_event('btn_press', {
                'btn': 'search_press_hold_nav'
            });
        }, 500);
    });

    $('.search-btn').on('mouseup touchend', function(e) {
        // Only prevent default for mouse events, not touch events
        if (e.type === 'mouseup') {
            e.preventDefault();
        }
        if (pressAndHoldTimer) {
            clearTimeout(pressAndHoldTimer);
            pressAndHoldTimer = null;
        }
    });

    $('.search-btn').click(function(e) {
        // Prevent click if it was a press and hold
        if (isPressAndHold) {
            isPressAndHold = false;
            return;
        }
        
        hideInfoBoxes(true);
        $('.knight-mover').hide();
        $('.bottom').hide();
        if (searchMode !== 'search') {
            setSearchMode('search');
        }
        // Remember where the user was on the map before opening search, so the
        // search bar's back button can return them there (even if a search
        // selection later flew the camera elsewhere).
        searchOpenView = { center: map.getCenter(), zoom: map.getZoom() };
        updateSearchHeading();
        $('.search-wrapper').removeClass('none');
        if (typeof hideCenterStops === 'function') hideCenterStops();
        adjustSearchHeights();
        attachSearchViewportListeners();
        // Fresh search menu: populate recommendations and recent searches
        populateSearchRecommendations();
        populateRecentSearches();

        // Keep the previously typed query so reopening shows results for the
        // last search. Repopulating recs/recents above can re-show their
        // wrappers, so re-running 'input' afterward applies the query's
        // visibility rules: matches when there's a query, recs when it's empty.
        $input.trigger('input').focus();

        sa_event('btn_press', {
            'btn': 'search'
        });
    });

    // Clear button functionality
    $clearBtn.click(function() {
        $input.val('').trigger('input').focus();
        
        sa_event('btn_press', {
            'btn': 'search_clear'
        });
    });

    // Back button returns to the map — restoring the camera to where the user
    // was before they first pressed the search button.
    $('.search-back-btn').click(function() {
        const view = searchOpenView;
        searchOpenView = null;
        if (view && typeof map !== 'undefined') {
            const current = map.getCenter();
            const moved = Math.abs(current.lat - view.center.lat) > 1e-9 ||
                          Math.abs(current.lng - view.center.lng) > 1e-9 ||
                          Math.abs(map.getZoom() - view.zoom) > 1e-9;
            if (moved) {
                map.flyTo(view.center, view.zoom, { duration: 0.3 });
            }
        }
        closeSearch();
    });

    // Nudge layout when search input gains focus (keyboard opening)
    // Height adjustment is handled by visualViewport listeners; focus handler scrolls input into view
    $(document).on('focus', '.search-pill-bar input', function() {
      setTimeout(() => {
        const $container = $('.search-content');
        if ($container.length > 0) {
          $container.scrollTop(0);
        }
      }, 150);
    });
    $(document).on('blur', '.search-pill-bar input', function() {
      setTimeout(adjustSearchHeights, 50);
    });

    // Surprise me functionality
    $('.search-surprise-me').click(function() {
        closeSearch();
        
        // Get all available options (buildings and active stops)
        const allOptions = [];
        
        // Add all buildings from buildingList
        if (buildingList) {
            for (const building of buildingList) {
                allOptions.push({
                    ...building,
                    category: 'building',
                    type: 'building'
                });
            }
        }
        
        if (Array.isArray(activeStops)) {
            for (const stopId of activeStops) {
                const stop = stopsData[stopId];
                if (stop) {
                    allOptions.push({
                        id: stopId,
                        name: stop.name,
                        lat: stop.latitude,
                        lng: stop.longitude,
                        category: 'stop',
                        type: 'stop'
                    });
                }
            }
        }
        
        // Select a random option
        if (allOptions.length > 0) {
            const randomIndex = Math.floor(Math.random() * allOptions.length);
            const selectedItem = allOptions[randomIndex];
            
            // Handle the selected item
            handleSearchItemSelection(selectedItem, {
                'btn': 'surprise_me_selected',
                'result': selectedItem.name,
                'category': selectedItem.category,
            });
        }
    });


    // Show/hide clear button based on input
    function toggleClearButton() {
        if ($input.val().trim()) {
            $clearBtn.show();
        } else {
            $clearBtn.hide();
        }
    }

    // Initially hide the clear button
    $clearBtn.hide();

    let fuse;
    let buildingList = [];
    let fuseReady = false;

    // Make fuse variables globally accessible
    window.fuse = fuse;
    window.fuseReady = fuseReady;
    window.buildingList = buildingList;

    // Alias mapping: main word -> array of aliases
    const aliasMap = {
        'recreation': ['gym', 'rec', 'fitness', 'workout'],
        'library': ['books', 'study', 'reading'],
        'center': ['building', 'complex'],
        'hall': ['building'],
        'athletic': ['gym', 'sports'],
        'college ave': ['ca'],
        'livingston': ['livi']
    };

    // Precomputed lowercase-abbreviation -> matching place entries (built once)
    let abbrevMap = new Map();

    // Load campus-specific building and stop index and initialize Fuse.js
    function initSearchIndex() {
        const campusKey = (settings && settings['campus']) || 'nb';
        const campusToFile = {
            'nb': 'lib/building_index_nb.json',
            'newark': 'lib/building_index_newark.json',
            'camden': 'lib/building_index_camden.json'
        };
        const buildingsJsonPath = campusToFile[campusKey] || campusToFile['nb'];
        fetch(buildingsJsonPath)
            .then(response => response.json())
            .then(data => {
                buildingIndex = data;
                // Convert object to array with name property and inject aliases
                buildingList = Object.keys(data).map(name => {
                    const obj = { name: name, category: data[name].category || 'building', ...data[name] };
                    obj.aliases = obj.aliases || [];
                    obj.abbreviations = obj.abbreviations || [];
                    // Inject aliases based on aliasMap
                    for (const mainWord in aliasMap) {
                        if (obj.name.toLowerCase().includes(mainWord)) {
                            obj.aliases = obj.aliases.concat(aliasMap[mainWord]);
                        }
                    }
                    return obj;
                });

                // Add bus stops for the selected campus
                const campusStops = (typeof allStopsData !== 'undefined' && allStopsData[campusKey]) ? allStopsData[campusKey] : stopsData;
                if (campusStops) {
                    for (const [stopId, stop] of Object.entries(campusStops)) {
                        if (!stop || !stop.name) continue;
                        const stopObj = {
                            id: stopId,
                            name: stop.name,
                            lat: stop.latitude,
                            lng: stop.longitude,
                            category: 'stop',
                            type: 'stop',
                            aliases: [stop.shortName, stop.shorterName, stop.mainName].filter(Boolean),
                            abbreviations: [stop.shorterName, stop.shortName].filter(Boolean)
                        };
                        for (const mainWord in aliasMap) {
                            if (stopObj.name.toLowerCase().includes(mainWord)) {
                                stopObj.aliases = stopObj.aliases.concat(aliasMap[mainWord]);
                            }
                        }
                        buildingList.push(stopObj);
                    }
                }

                // Precompute lowercase-abbreviation -> entries for O(1) lookups
                abbrevMap.clear();
                for (const item of buildingList) {
                    const abbrs = item.abbreviations || [];
                    for (const a of abbrs) {
                        const key = String(a).toLowerCase();
                        if (!abbrevMap.has(key)) {
                            abbrevMap.set(key, []);
                        }
                        abbrevMap.get(key).push({ item: item, matchedAbbreviation: a });
                    }
                }

                fuse = new Fuse(buildingList, {
                    keys: ['name', 'aliases', 'abbreviations'],
                    threshold: 0.3,
                    includeScore: true,
                });
                fuseReady = true;

                // Update global variables
                window.fuse = fuse;
                window.fuseReady = fuseReady;
                window.buildingList = buildingList;
                
                // Update search placeholder with actual count
                updateSearchPlaceholder(buildingList.length);
            });
    }
    window.initSearchIndex = initSearchIndex;
    initSearchIndex();

    // Run the existing fuzzy-search matching (exact abbreviation / Fuse tokens)
    function matchQueryItems(sanitizedQuery, queryLower) {
        const tokens = sanitizedQuery.split(/\s+/).filter(Boolean);
        let results;
        if (tokens.length === 1) {
            // O(1) exact-abbreviation lookup via precomputed map when available
            const exactAbbrevMatches = (abbrevMap.get(queryLower) || []);
            if (exactAbbrevMatches.length > 0) {
                results = exactAbbrevMatches;
            } else {
                results = fuse.search(sanitizedQuery);
            }
        } else if (tokens.length > 1) {
            const extendedQuery = {
                $and: tokens.map(token => ({
                    $or: [
                        { name: token },
                        { aliases: token },
                        { abbreviations: token }
                    ]
                }))
            };
            results = fuse.search(extendedQuery);
            const tokenSet = new Set(tokens.map(t => t.toLowerCase()));
            results = results.map(r => {
                const item = r.item || r;
                const abbrMatch = (item.abbreviations || []).find(a => tokenSet.has(a.toLowerCase()));
                return abbrMatch ? { ...r, matchedAbbreviation: abbrMatch } : r;
            });
        } else {
            results = [];
        }
        return results;
    }

    // Open the from/to form with this place as the destination
    function onRowDirections(item) {
        // Set the place as the destination
        if (item.category === 'stop') {
            setNavigationFromStop(String(item.id), 'to');
        } else {
            setNavigationFromBuilding(item.name, 'to');
        }

        // TEMPORARILY COMMENTED OUT: never auto-populate the source field with
        // the closest stop to the user's location. This was causing confusing
        // prefills (e.g. "RWJMS Research Tower") and out-of-bounds users to get
        // a random closest stop. Intended to be re-enabled later.
        // const hasUserLocation = typeof userPosition !== 'undefined' &&
        //     Array.isArray(userPosition) && userPosition.length === 2 &&
        //     userPosition[0] != null && userPosition[1] != null;
        // if (hasUserLocation) {
        //     const closestStop = findClosestStop(userPosition[0], userPosition[1]);
        //     const distanceMiles = Number.isFinite(closestStop?.distance)
        //         ? closestStop.distance / 1609.34
        //         : Infinity;
        //     const inBounds = distanceMiles <= maxDistanceMiles || settings['toggle-bypass-max-distance'];
        //     if (inBounds && closestStop && closestStop.id != null && stopsData[closestStop.id]) {
        //         setNavigationFromStop(String(closestStop.id), 'from');
        //     }
        // }

        openDirectionsNav();
        window._suppressNavAutocompleteOnFocus = true;
        window.focusNavFromInput();
        sa_event('btn_press', {
            'btn': 'search_result_directions',
            'result': item.name,
            'category': item.category
        });
    }

    // Escape user-provided text for safe HTML insertion
    function escapeHTML(str) {
        return String(str).replace(/[&<>"']/g, function(c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    // Render fuzzy results into the results list with the given pick handler.
    // Built as a single HTML string with FINAL custom icon classes so the
    // MutationObserver / FontAwesome swap never fires per keystroke.
    function renderResults(results, onPick) {
        const $results = $('.search-results');
        const entries = []; // { item, matchedAbbreviation }
        const MAX_ROWS = 30;

        for (const result of results) {
            entries.push({
                item: result.item ? result.item : result,
                matchedAbbreviation: result.matchedAbbreviation
            });
            if (entries.length >= MAX_ROWS) break;
        }

        if (entries.length === 0) {
            $results.html('<div class="dimgray">No results found.</div>');
            return;
        }

        let html = '';
        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            const item = entry.item;
            const iconClass = placeIconClass(item);
            const displayText = entry.matchedAbbreviation ? item.name + ' (' + entry.matchedAbbreviation + ')' : item.name;

            // Mark the result as selected if it's the place currently open on
            // the map (stop popup or building popup).
            let isSelected = false;
            if (item.category === 'stop') {
                isSelected = typeof popupStopId !== 'undefined' && String(popupStopId) === String(item.id);
            } else if (item.category === 'building') {
                isSelected = typeof popupBuildingName !== 'undefined' && String(popupBuildingName).toLowerCase() === String(item.name).toLowerCase();
            }

            html += '<div class="search-result-item flex' + (isSelected ? ' selected' : '') + '" data-result-index="' + i + '">'
                + (iconClass ? '<i class="' + iconClass + '"></i>' : '')
                + '<div' + (isSelected ? ' class="search-result-selected-name"' : '') + '>' + escapeHTML(displayText) + '</div>'
                + '<i class="search-result-map-pin icon icon-location-dot"></i>'
                + '<button class="search-result-directions-btn" type="button" title="Get directions" data-dir-result-index="' + i + '">'
                + '<i class="icon icon-route"></i><span>Navigate</span>'
                + '</button>'
                + '</div>';
        }
        $results.html(html);

        // Delegate clicks once at the container level.
        $results.off('.searchResults').on('click.searchResults', '.search-result-directions-btn', function(e) {
            // The result-row handler is delegated from this same container.
            // Stop it as well as bubbling, otherwise selecting Directions can
            // also select the row and interrupt the nav transition/focus.
            e.stopImmediatePropagation();
            const idx = $(this).attr('data-dir-result-index');
            onRowDirections(entries[idx].item);
        }).on('click.searchResults', '.search-result-item', function() {
            const idx = $(this).attr('data-result-index');
            onPick(entries[idx].item);
        });
    }

    // Expose the shared matcher + renderer so the nav from/to autocomplete can
    // render into the SAME .search-results container with identical styling.
    window.matchSearchItems = function(query) {
        const sanitizedQuery = String(query || '').replace(/-[^\s]*/g, '').replace(/\s+/g, ' ').trim();
        if (!fuseReady || !sanitizedQuery) return [];
        return matchQueryItems(sanitizedQuery, sanitizedQuery.toLowerCase());
    };
    window.renderSearchResults = renderResults;

    $('.search-pill-bar input').on('input', function() {
        const query = $(this).val().trim();
        // Remove schedule-style room suffixes like "AB-101" -> "AB"
        const sanitizedQuery = query.replace(/-[^\s]*/g, '').replace(/\s+/g, ' ').trim();
        const queryLower = sanitizedQuery.toLowerCase();
        const $results = $('.search-results');

        // Toggle clear button visibility
        toggleClearButton();

        $results.empty();

        // Directions mode uses the dedicated from/to inputs; the pill is hidden there.
        if (searchMode === 'directions') {
            return;
        }

        // Hide recommendations and recent searches when user starts typing
        if (sanitizedQuery) {
            $('.search-recs-wrapper').hide();
            $('.search-recents-wrapper').hide();
            $('.search-surprise-me').hide();
        } else {
            $('.search-recs-wrapper').show();
            $('.search-recents-wrapper').show();
            $('.search-surprise-me').show();
            
            // Repopulate the content when showing (in case it was updated)
            populateRecentSearches();
            populateSearchRecommendations();
        }
        
        if (!fuseReady || !sanitizedQuery) {
            $('.search-results-wrapper, .search-results').hide();
            return;
        }
        $('.search-results-wrapper, .search-results').show();

        const results = matchQueryItems(sanitizedQuery, queryLower);
        renderResults(results, function(item) {
            handleSearchItemSelection(item, {
                'btn': 'search_result_selected',
                'result': item.name,
                'category': item.category
            });
        });

        if (!buildingsLayer) {
            loadBuildings().then(() => {
                // Temporarily show buildings layer if setting is disabled but we just loaded it
                showBuildingsTemporarily();
            });
        }
    });

    // Handle search button gradient flash after initial bus data fetch completes
    document.addEventListener('rubus-bus-data-loaded', function() {
        if (!enableSearchButtonGradientFlash) {
            return;
        }
        
        setTimeout(function() {
            const $searchBtn = $('.search-btn');

            $searchBtn.addClass('gradient-active').css('color', 'white');

            setTimeout(function() {
                $searchBtn.removeClass('gradient-active').css('color', 'var(--theme-color)');

                setTimeout(function() {
                    $searchBtn.addClass('gradient-active').css('color', 'white');

                    setTimeout(function() {
                        $searchBtn.removeClass('gradient-active').css('color', 'var(--theme-color)');
                    }, 400);
                }, 200);
            }, 400);
        }, 1000);
    });

    // Keyboard shortcut: 's' key to open search on desktop
    $(document).on('keydown', function(e) {
        // Only trigger on desktop without touch and when 's' key is pressed
        if (isDesktop && !isTouchDevice && e.key.toLowerCase() === 's') {
            // Don't trigger if user is typing in an input field
            if (!$(e.target).is('input, textarea, [contenteditable]')) {
                e.preventDefault();
                $('.search-btn').click();
            }
        }
    });

    // Recent searches functionality
    function saveRecentSearch(searchItem) {
        const recentSearches = getRecentSearches();
        
        // Add timestamp to search item
        const searchItemWithTimestamp = {
            ...searchItem,
            timestamp: Date.now()
        };
        
        // Remove if already exists (to move to front)
        const filtered = recentSearches.filter(item => 
            !(item.name === searchItem.name && item.category === searchItem.category)
        );
        
        // Add to front
        filtered.unshift(searchItemWithTimestamp);
        
        // Keep only last 10 searches (more than we show for better UX)
        const limited = filtered.slice(0, 10);
        
        localStorage.setItem('recentSearches', JSON.stringify(limited));
    }
    
    function getRecentSearches() {
        const stored = localStorage.getItem('recentSearches');
        return stored ? JSON.parse(stored) : [];
    }
    
    function saveRecentNavigation(fromBuilding, toBuilding) {
        const recentNavigations = getRecentNavigations();
        
        // Create navigation entry
        const navigationEntry = {
            type: 'navigation',
            from: fromBuilding.name || fromBuilding,
            to: toBuilding.name || toBuilding,
            fromBuilding: fromBuilding,
            toBuilding: toBuilding,
            timestamp: Date.now()
        };
        
        // Remove if already exists (to move to front)
        const filtered = recentNavigations.filter(item => 
            !(item.from === navigationEntry.from && item.to === navigationEntry.to)
        );
        
        // Add to front and keep only 5 most recent
        filtered.unshift(navigationEntry);
        const recent = filtered.slice(0, 5);
        
        localStorage.setItem('recentNavigations', JSON.stringify(recent));
    }
    
    // Make saveRecentNavigation globally accessible
    window.saveRecentNavigation = saveRecentNavigation;
    
    // Helper function to handle building selection with immediate response and highlighting
    function selectBuilding(buildingData) {
        // Show building info and fly to location immediately
        showBuildingInfo(buildingData);
        flyToCenteredBelow([buildingData.lat, buildingData.lng], 17, document.querySelector('.building-info-popup'), 0.3);
        
        if (!buildingsLayer) {
            loadBuildings().then(() => {
                // Temporarily show buildings layer for this selection
                showBuildingsTemporarily();
                // Highlight the selected building
                highlightBuildingByName(buildingData.name);
            });
        } else {
            // Make sure buildings layer is visible for this selection
            showBuildingsTemporarily();
            // Highlight the selected building
            highlightBuildingByName(buildingData.name);
        }
    }
    
    // Helper function to handle search item selection (stop or building)
    function handleSearchItemSelection(item, eventData) {
        closeSearch();
        searchReentry = item.category === 'stop' || item.category === 'building' || item.category === 'parking';
        
        if (item.category === 'stop') {
            // Handle stop selection
            popStopInfo(Number(item.id));
            flyToCenteredBelow([item.lat, item.lng], 17, document.querySelector('.stop-info-popup'), 0.3);
            saveRecentSearch(item);
        } else {
            // Handle building selection
            selectBuilding(item);
            saveRecentSearch(item);
        }
        
        sa_event('btn_press', eventData);
    }
    
    function getRecentNavigations() {
        const stored = localStorage.getItem('recentNavigations');
        return stored ? JSON.parse(stored) : [];
    }
    
    function removeRecentSearch(itemToRemove) {
        const recentSearches = getRecentSearches();
        const filtered = recentSearches.filter(item => 
            !(item.name === itemToRemove.name && item.category === itemToRemove.category)
        );
        localStorage.setItem('recentSearches', JSON.stringify(filtered));
    }
    
    function removeRecentNavigation(itemToRemove) {
        const recentNavigations = getRecentNavigations();
        const filtered = recentNavigations.filter(item => 
            !(item.from === itemToRemove.from && item.to === itemToRemove.to)
        );
        localStorage.setItem('recentNavigations', JSON.stringify(filtered));
    }
    
    function populateRecentSearches() {
        const $searchRecents = $('.search-recents');
        const $searchRecentsWrapper = $('.search-recents-wrapper');
        $searchRecents.empty();

        const recentSearches = getRecentSearches();
        // Only place items (buildings/stops/parking lots) — navigation entries are no longer shown.
        const uniqueItems = [];
        const seenKeys = new Set();
        const allRecent = recentSearches.slice().sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        for (const item of allRecent) {
            if (item.type === 'navigation') continue;
            const key = `srch:${item.category}:${item.name}`;
            if (!seenKeys.has(key)) {
                seenKeys.add(key);
                uniqueItems.push(item);
            }
        }

        if (uniqueItems.length === 0) {
            $searchRecentsWrapper.hide();
            return;
        }
        $searchRecentsWrapper.show();

        // Show only the 3 most recent
        const recentToShow = uniqueItems.slice(0, 3);
        recentToShow.forEach(item => {
            const $row = $('<div class="search-result-item flex"></div>');
            $row.append('<i class="icon icon-clock-rotate-left"></i>');
            const $name = $('<div style="flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"></div>').text(item.name);
            $row.append($name);

            const $directions = $('<button class="search-result-directions-btn" type="button" title="Get directions"><i class="icon icon-route"></i><span>Navigate</span></button>');
            $directions.on('click', function(e) {
                e.stopPropagation();
                onRowDirections(item);
            });
            $row.append($directions);

            // Temporarily disabled: don't show the remove button for recent searches
            // const $remove = $('<button class="recent-remove-btn" type="button" style="background: none; border: none; color: var(--theme-color); font-size: 1.8rem; cursor: pointer; padding: 0.25rem; line-height: 1; opacity: 0.7; transition: opacity 0.2s; flex-shrink: 0;">×</button>');
            // $row.append($remove);

            $row.click(function(e) {
                if (!$(e.target).hasClass('recent-remove-btn') && !$(e.target).closest('.search-result-directions-btn').length) {
                    handleSearchItemSelection(item, {
                        'btn': 'recent_search_selected',
                        'result': item.name,
                        'category': item.category
                    });
                }
            });

            // $remove.on('click', function(e) {
            //     e.stopPropagation(); // Prevent triggering the main item click
            //     removeRecentSearch(item);
            //     sa_event('btn_press', {
            //         'btn': 'recent_search_removed',
            //         'result': item.name,
            //         'category': item.category
            //     });
            //     populateRecentSearches(); // Repopulate the 3 slots with the actual most recent
            // });

            // // Hover effects for remove button
            // $remove.hover(
            //     function() { $(this).css('opacity', '1'); },
            //     function() { $(this).css('opacity', '0.7'); }
            // );

            $searchRecents.append($row);
        });
    }

    // Populate search recommendations with 3 random popular buildings and active stops
    function populateSearchRecommendations() {
        const $searchRecs = $('.search-recs');
        $searchRecs.empty();
        
        // Get unique buildings from abbreviations
        const uniqueBuildings = [];
        const seenNumbers = new Set();
        
        for (const item of buildingAbbreviations) {
            if (!seenNumbers.has(item.number)) {
                seenNumbers.add(item.number);
                uniqueBuildings.push(item);
            }
        }
        
        let selectedItems = [];
        
        const activeStopItems = [];
        if (Array.isArray(activeStops)) {
            for (const stopId of activeStops) {
                const stop = stopsData[stopId];
                if (stop) {
                    activeStopItems.push({
                        id: stopId,
                        name: stop.name,
                        category: 'stop',
                        lat: stop.latitude,
                        lng: stop.longitude
                    });
                }
            }
        }
        
        if (activeStopItems.length > 0) {
            // Select 1-2 random stops
            const numStopsToShow = Math.min(Math.floor(Math.random() * 2) + 1, activeStopItems.length, 2);
            const shuffledStops = activeStopItems.sort(() => 0.5 - Math.random());
            const selectedStops = shuffledStops.slice(0, numStopsToShow);
            
            // Fill remaining slots with popular buildings
            const numBuildingsToShow = 3 - numStopsToShow;
            const shuffledBuildings = uniqueBuildings.sort(() => 0.5 - Math.random());
            const selectedBuildings = shuffledBuildings.slice(0, numBuildingsToShow).map(building => ({
                ...building,
                category: 'building'
            }));
            
            // Combine and shuffle the final selection
            selectedItems = [...selectedStops, ...selectedBuildings].sort(() => 0.5 - Math.random());
        } else {
            // No active stops available — show 3 random buildings as recommendations (not saved to recents)
            const shuffledBuildings = uniqueBuildings.sort(() => 0.5 - Math.random());
            selectedItems = shuffledBuildings.slice(0, 3).map(building => ({
                ...building,
                category: 'building'
            }));
        }
        
        // Create recommendation elements — all use the fire icon
        const $searchRecsWrapper = $('.search-recs-wrapper');
        if (selectedItems.length === 0) {
            $searchRecsWrapper.hide();
            return;
        }
        $searchRecsWrapper.show();
        selectedItems.forEach(item => {
            const $recItem = $('<div class="search-result-item flex"></div>');
            $recItem.append('<i class="icon icon-fire-flame-curved"></i>');
            const $name = $('<div style="flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"></div>').text(item.name);
            $recItem.append($name);

            const $directions = $('<button class="search-result-directions-btn" type="button" title="Get directions"><i class="icon icon-route"></i><span>Navigate</span></button>');
            $directions.on('click', function(e) {
                e.stopPropagation();
                onRowDirections(item);
            });
            $recItem.append($directions);

            $recItem.click(function() {
                if (item.category === 'stop') {
                    // Handle stop selection directly
                    handleSearchItemSelection(item, {
                        'btn': 'search_recommendation_selected',
                        'result': item.name,
                        'category': item.category
                    });
                } else {
                    // Handle building selection - need to find building data first
                    const buildingKey = Object.keys(buildingIndex).find(key => 
                        buildingIndex[key].id === item.number.toString()
                    );
                    
                    if (buildingKey) {
                        const buildingData = buildingIndex[buildingKey];
                        handleSearchItemSelection(buildingData, {
                            'btn': 'search_recommendation_selected',
                            'result': item.name,
                            'category': item.category
                        });
                    }
                }
            });
            $searchRecs.append($recItem);
        });
    }

});

function closeSearch() {
    $('.search-wrapper').addClass('none');
    if (searchMode !== 'search') {
        applySearchMode('search');
    }
    $('.navigate-wrapper').addClass('none');
    if (!$('.settings-panel').is(':visible') && !$('.feedback-wrapper').is(':visible')) {
        $('.bottom').show();
    }
    if (typeof showCenterStops === 'function') showCenterStops();
    detachSearchViewportListeners();
    $('.search-wrapper').css({
      'position': '',
      'top': '',
      'left': '',
      'height': '',
      'width': ''
    });
}

function applySearchMode(mode) {
    if (searchMode === mode) {
        return;
    }
    searchMode = mode;
    updateSearchHeading();

    if (mode === 'directions') {
        $('.search-pill-bar').addClass('none');
        $('.nav-pill-bar').removeClass('none nav-collapsed');
        $('.search-wrapper').removeClass('nav-source-hidden');
        $('.search-content').addClass('none');
        $('.navigate-wrapper').removeClass('none');
        $('#nav-from-input').attr('placeholder', 'Enter source');
        hideNavigationAutocomplete();
    } else {
        $('.navigate-wrapper').addClass('none');
        $('.search-pill-bar').removeClass('none');
        $('.nav-pill-bar').addClass('none').removeClass('nav-collapsed');
        $('.search-wrapper').removeClass('nav-source-hidden');
        $('.search-content').removeClass('none');
        $('.search-pill-bar input').attr('placeholder', 'Search {num} buildings & lots');
        if (window.buildingList && window.buildingList.length) {
            updateSearchPlaceholder(window.buildingList.length);
        }
        // Re-render the search view: query results if the input still has a
        // query, otherwise the empty-state recents/popular sections. The input
        // handler owns the visibility rules for both. Only the main search
        // input drives this — the nav from/to inputs are separate.
        $('.search-pill-bar input').trigger('input');
    }
}

function setSearchMode(mode) {
    applySearchMode(mode);
    if (mode === 'directions') {
        window._suppressNavAutocompleteOnFocus = true;
        // Use robust helper (sync + double rAF + fallback) instead of plain setTimeout(60)
        window.focusNavFromInput();
    } else {
        $('.search-pill-bar input').trigger('input').focus();
    }
}

function openDirectionsNav() {
    updateSearchHeading();
    $('.search-wrapper').removeClass('none');
    $('.bottom').hide();
    if (typeof hideCenterStops === 'function') hideCenterStops();
    adjustSearchHeights();
    attachSearchViewportListeners();
    applySearchMode('directions');

    // Callers handle their own focus: the building-directions button focuses
    // the source input, openNav() focuses the appropriate input, and
    // calculateRoute() shows the route without refocusing either input.
    // (Previously this auto-focused the source input, which caused a flash
    // of refocus after selecting a source result and computing a route.)
}

function openSearch() {
    updateSearchHeading();
    $('.bottom').hide();
    $('.search-wrapper').removeClass('none');
    if (typeof hideCenterStops === 'function') hideCenterStops();
    adjustSearchHeights();
    attachSearchViewportListeners();
}

// Reopen the search menu (used by the "Back to search" button on building/stop popups
// that were opened from a search result selection).
function openSearchBack() {
    updateSearchHeading();
    searchReentry = false;
    searchBackActive = false;
    $('.search-wrapper').removeClass('none');
    $('.bottom').hide();
    if (typeof hideCenterStops === 'function') hideCenterStops();
    adjustSearchHeights();
    attachSearchViewportListeners();
    $('.search-pill-bar input').trigger('input').focus();
}
