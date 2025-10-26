let buildingIndex;
let enableSearchButtonGradientFlash = false;

// Function to update search placeholder with building count
function updateSearchPlaceholder(buildingCount) {
    const $searchInput = $('.search-wrapper input');
    if ($searchInput.length === 0) {
        return;
    }
    
    const formattedCount = buildingCount.toLocaleString();
    
    const originalPlaceholder = $searchInput.attr('placeholder');
    const updatedPlaceholder = originalPlaceholder.replace('{num}', formattedCount);
    $searchInput.attr('placeholder', updatedPlaceholder);
}

$(document).ready(function() {
    const $input = $('.search-wrapper input');
    const $clearBtn = $('.search-clear-btn');
    $input.val('')

    // Track press and hold state
    let pressAndHoldTimer = null;
    let isPressAndHold = false;

    $('.search-btn').on('mousedown touchstart', function(e) {
        e.preventDefault(); // Prevent default touch behavior
        isPressAndHold = false;
        pressAndHoldTimer = setTimeout(() => {
            isPressAndHold = true;
            // Press and hold detected - open navigation wrapper
            hideInfoBoxes(true);
            $('.knight-mover').hide();
            $('.search-wrapper').hide();

            // Open navigation wrapper
            $('.navigate-wrapper').show();
            window.errorTracker.trackNavigationWrapperShow('Press and hold search button');
            $('#nav-from-input').focus();

            sa_event('btn_press', {
                'btn': 'search_press_hold_nav'
            });
        }, 500);
    });

    $('.search-btn').on('mouseup touchend', function(e) {
        e.preventDefault(); // Prevent default touch behavior
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
        $('.search-wrapper').show();
        $input.trigger('input').focus();
        
        const hasInput = $input.val().trim();
        
        if (hasInput) {
            // Hide recommendations and recent searches when there's input
            $('.search-recs-wrapper').hide();
            $('.search-recents-wrapper').hide();
            $('.search-nav-examples-wrapper').hide();
        } else {
            // Populate search recommendations and recent searches when no input
            populateSearchRecommendations();
            populateRecentSearches();
            // Also populate navigation examples
            populateNavigationExamples();
        }

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

    // Track current rotation for the refresh buttons
    let currentRotation = 0;
    let navCurrentRotation = 0;
    
    // Refresh button functionality for popular places
    $('.search-recs-refresh-btn').click(function() {
        const $btn = $(this);
        const $icon = $btn.find('i');
        
        // Calculate target rotation (current + 360 degrees)
        const targetRotation = currentRotation + 360;
        
        // Set transition and rotate to target
        $icon.css('transition', 'transform 0.5s ease-in-out');
        $icon.css('transform', `rotate(${targetRotation}deg)`);
        
        // Update current rotation
        currentRotation = targetRotation;
        
        // Refresh the recommendations
        populateSearchRecommendations();
        
        sa_event('btn_press', {
            'btn': 'search_recommendations_refresh'
        });
    });

    // Refresh button functionality for navigation examples
    $('.search-nav-examples-refresh-btn').click(function() {
        const $btn = $(this);
        const $icon = $btn.find('i');
        
        // Calculate target rotation (current + 360 degrees)
        const targetRotation = navCurrentRotation + 360;
        
        // Set transition and rotate to target
        $icon.css('transition', 'transform 0.5s ease-in-out');
        $icon.css('transform', `rotate(${targetRotation}deg)`);
        
        // Update current rotation
        navCurrentRotation = targetRotation;
        
        // Refresh the navigation examples
        populateNavigationExamples();
        
        sa_event('btn_press', {
            'btn': 'navigation_examples_refresh'
        });
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
        
        // Add active stops (assume presence; fail fast if missing)
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
            $clearBtn.fadeIn();
        } else {
            $clearBtn.fadeOut('fast');
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

    // Load campus-specific building index and initialize Fuse.js
    const campusKey = (window.settings && settings['campus']);
    const campusToFile = {
        'nb': 'lib/building_index_nb.json',
        'newark': 'lib/building_index_newark.json',
        'camden': 'lib/building_index_camden.json'
    };
    const buildingsJsonPath = campusToFile[campusKey];
    fetch(buildingsJsonPath)
        .then(response => response.json())
        .then(data => {
            buildingIndex = data;
            // Convert object to array with name property and inject aliases
            buildingList = Object.keys(data).map(name => {
                const obj = { name: name, ...data[name] };
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
            
            // Update search placeholder with actual building count
            updateSearchPlaceholder(buildingList.length);
        });

    $('.search-wrapper input').on('input', function() {
        const query = $(this).val().trim();
        // Remove schedule-style room suffixes like "AB-101" -> "AB"
        const sanitizedQuery = query.replace(/-[^\s]*/g, '').replace(/\s+/g, ' ').trim();
        const queryLower = sanitizedQuery.toLowerCase();
        const $results = $('.search-results');
        $results.empty();
        
        // Toggle clear button visibility
        toggleClearButton();
        
        // Hide recommendations and recent searches when user starts typing
        if (sanitizedQuery) {
            $('.search-recs-wrapper').hide();
            $('.search-recents-wrapper').hide();
            $('.search-nav-examples-wrapper').hide();
            $('.search-surprise-me').hide();
        } else {
            $('.search-recs-wrapper').show();
            $('.search-recents-wrapper').show();
            $('.search-nav-examples-wrapper').show();
            $('.search-surprise-me').show();
            
            // Repopulate the content when showing (in case it was updated)
            populateRecentSearches();
        }
        
        if (!fuseReady || !sanitizedQuery) {
            $('.search-results-wrapper, .search-results').hide();
            return;
        }
        $('.search-results-wrapper, .search-results').show();

        // Extended search: require all tokens to match in any field
        const tokens = sanitizedQuery.split(/\s+/).filter(Boolean);
        let results;
        // Exact abbreviation match takes precedence when a single token exactly matches an abbreviation
        if (tokens.length === 1) {
            const exactAbbrevMatches = buildingList
                .map(item => {
                    const match = (item.abbreviations || []).find(abbr => abbr.toLowerCase() === queryLower);
                    if (match) {
                        return { item, matchedAbbreviation: match };
                    }
                    return null;
                })
                .filter(Boolean);

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
            // If any token exactly equals an abbreviation for an item, annotate it
            const tokenSet = new Set(tokens.map(t => t.toLowerCase()));
            results = results.map(r => {
                const item = r.item || r;
                const abbrMatch = (item.abbreviations || []).find(a => tokenSet.has(a.toLowerCase()));
                return abbrMatch ? { ...r, matchedAbbreviation: abbrMatch } : r;
            });
        }

        if (results.length === 0) {
            $results.html('<div class="dimgray">No buildings found.</div>');
            return;
        }
        results.forEach(result => {
            const item = result.item ? result.item : result;
            const matchedAbbreviation = result.matchedAbbreviation;
            let icon = '';
            if (item.category === 'building') {
                icon = '<i class="fa-solid fa-building"></i>';
            } else if (item.category === 'parking') {
                icon = '<i class="fa-solid fa-square-parking"></i>';
            } else if (item.category === 'stop') {
                icon = '<i class="fa-solid fa-bus-simple"></i>';
            }

            const displayText = matchedAbbreviation ? `${item.name} (${matchedAbbreviation})` : item.name;
            $elm = $(`<div class="search-result-item flex">${icon}<div>${displayText}</div></div>`);
            $elm.click(function() {
                handleSearchItemSelection(item, {
                    'btn': 'search_result_selected',
                    'result': item.name,
                    'category': item.category
                });
            });
            $results.append($elm);
        });
        
        // Convert FontAwesome icons to custom icons
        replaceFontAwesomeIcons();

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
        // Only trigger on desktop and when 's' key is pressed
        if (isDesktop && e.key.toLowerCase() === 's') {
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
        map.flyTo([buildingData.lat, buildingData.lng], 17, { duration: 0.3 });
        
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
        
        if (item.category === 'stop') {
            // Handle stop selection
            popStopInfo(Number(item.id));
            map.flyTo([item.lat, item.lng], 17, { duration: 0.3 });
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
        const recentNavigations = getRecentNavigations();
        
        // Combine all items and sort by most recent
        const allRecent = [...recentSearches, ...recentNavigations]
            .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

        // Dedupe by logical identity, keeping the most recent instance
        const seenKeys = new Set();
        const uniqueRecents = [];
        for (const item of allRecent) {
            const key = item.type === 'navigation'
                ? `nav:${item.from}\u2192${item.to}`
                : `srch:${item.category}:${item.name}`;
            if (!seenKeys.has(key)) {
                seenKeys.add(key);
                uniqueRecents.push(item);
            }
        }
        
        if (uniqueRecents.length === 0) {
            $searchRecentsWrapper.hide();
            return;
        }
        
        // Update Recent heading count directly from the deduped list
        const $heading = $('.search-recents-wrapper .text-1p4rem.bold-500').first();
        if ($heading.length) {
            $heading.html(`Recent <span style="color: var(--theme-hidden-route-col)">(${uniqueRecents.length})</span>`);
        }
        
        $searchRecentsWrapper.show();
        
        function tryApplyMarquee($text) {

            const el = $text.get(0);
            const clientWidth = el.clientWidth;
            const scrollWidth = el.scrollWidth;

            const isOverflowing = scrollWidth > clientWidth + 1;

            if (isOverflowing) { // strict width comparison
                // Immediately wrap the text in a container that applies the fade effect
                const $wrapper = $('<div class="overflow-fade"></div>');
                $text.wrap($wrapper);

                // Wait 1.5s before applying the scrolling effect to give user time to read
                setTimeout(function() {
                    // Ensure the element still exists in the DOM before modifying it
                    if (!document.body.contains(el)) return;

                    const original = $text.text();
                    const gap = 48;
                    // Speed up a bit by increasing pixels/second
                    const SPEED_PX_PER_SEC = 50;
                    const travelPx = scrollWidth + gap;
                    const travelSeconds = Math.max(4, Math.round(travelPx / SPEED_PX_PER_SEC));
                    const HOLD_SECONDS = 1.5;
                    const totalSeconds = travelSeconds + HOLD_SECONDS;

                    // Create a per-instance keyframes with an initial hold period
                    const holdPercent = Math.min(40, Math.max(5, (HOLD_SECONDS / totalSeconds) * 100));
                    const animName = `searchMarqueeScrollHold_${Date.now()}_${Math.floor(Math.random()*100000)}`;
                    const styleEl = document.createElement('style');
                    styleEl.type = 'text/css';
                    styleEl.textContent = `@keyframes ${animName} { 0% { transform: translateX(0); } ${holdPercent}% { transform: translateX(0); } 100% { transform: translateX(-50%); } }`;
                    document.head.appendChild(styleEl);

                    const $marqueeContainer = $('<div class="marquee-container" style="width: 100%;"></div>');
                    // Prevent marquee text from sliding underneath the remove button
                    const btnEl = $text.closest('.search-result-item').find('.recent-remove-btn').get(0);
                    if (btnEl) {
                        const btnRect = btnEl.getBoundingClientRect();
                        $marqueeContainer.css('padding-right', Math.ceil(btnRect.width + 12) + 'px');
                    }
                    const $track = $('<div class="marquee-track"></div>');
                    $track.css({
                        animationName: animName,
                        animationDuration: `${totalSeconds}s`,
                        animationTimingFunction: 'linear',
                        animationIterationCount: 'infinite'
                    });
                    const $span1 = $('<span class="marquee-text"></span>').text(original);
                    const $span2 = $('<span class="marquee-text"></span>').text(original);
                    $track.append($span1, $span2);
                    $marqueeContainer.append($track);
                    $text.replaceWith($marqueeContainer);
                }, 1500);
            }
        }

        function appendRecentItem(item) {
            let icon = '';
            let displayText = '';
            let itemData = {};
            
            if (item.type === 'navigation') {
                // Navigation entry
                icon = '<i class="fa-solid fa-route" style="color: var(--theme-hidden-route-col)"></i>';
                displayText = `${item.from} → ${item.to}`;
                itemData = { type: 'navigation', from: item.from, to: item.to, fromBuilding: item.fromBuilding, toBuilding: item.toBuilding };
            } else {
                // Building/parking/stop entry
                if (item.category === 'building') {
                    icon = '<i class="fa-solid fa-building" style="color: var(--theme-hidden-route-col)"></i>';
                } else if (item.category === 'parking') {
                    icon = '<i class="fa-solid fa-square-parking" style="color: var(--theme-hidden-route-col)"></i>';
                } else if (item.category === 'stop') {
                    icon = '<i class="fa-solid fa-bus-simple" style="color: var(--theme-hidden-route-col)"></i>';
                }
                displayText = item.name;
                itemData = item;
            }
            
            const $recentItem = $(`<div class="search-result-item flex" style="column-gap: 0.3rem !important; position: relative;">
                ${icon}
                <div class="recent-text" style="flex: 1; white-space: pre; overflow: hidden;">${displayText}</div>
                <button class="recent-remove-btn" type="button" style="position: absolute; right: 0.5rem; top: 50%; transform: translateY(-50%); background: none; border: none; color: var(--theme-color); font-size: 1.8rem; cursor: pointer; padding: 0.25rem; opacity: 0.7; transition: opacity 0.2s;">×</button>
            </div>`);
            
            // Handle click on the main item (not the remove button)
            $recentItem.click(function(e) {
                if (!$(e.target).hasClass('recent-remove-btn')) {
                    closeSearch();
                    
                    if (item.type === 'navigation') {
                        // Handle navigation selection - open navigation with the saved route
                        const toBuildingKey = Object.keys(buildingIndex).find(key => 
                            buildingIndex[key].name.toLowerCase() === item.to.toLowerCase()
                        );
                        openNav(toBuildingKey, item.from);
                        
                        sa_event('btn_press', {
                            'btn': 'recent_navigation_selected',
                            'from': item.from,
                            'to': item.to
                        });
                    } else {
                        // Handle stop or building selection
                        handleSearchItemSelection(item, {
                            'btn': 'recent_search_selected',
                            'result': item.name,
                            'category': item.category
                        });
                    }
                }
            });
            
            // Handle remove button click
            $recentItem.find('.recent-remove-btn').click(function(e) {
                e.stopPropagation(); // Prevent triggering the main item click
                
                if (item.type === 'navigation') {
                    removeRecentNavigation(item);
                    sa_event('btn_press', {
                        'btn': 'recent_navigation_removed',
                        'from': item.from,
                        'to': item.to
                    });
                } else {
                    removeRecentSearch(item);
                    sa_event('btn_press', {
                        'btn': 'recent_search_removed',
                        'result': item.name,
                        'category': item.category
                    });
                }
                
                populateRecentSearches(); // Refresh the list
                // Repopulate navigation examples based on new recent searches count
                populateNavigationExamples();
            });
            
            // Hover effects for remove button
            $recentItem.find('.recent-remove-btn').hover(
                function() { $(this).css('opacity', '1'); },
                function() { $(this).css('opacity', '0.7'); }
            );
            
            $searchRecents.append($recentItem);

            // After mount, if text overflows, convert to marquee
            tryApplyMarquee($recentItem.find('.recent-text'));
        }

        // Reset container styles before measuring/appending
        $searchRecents.css({ height: '', maxHeight: '', overflowY: '' });

        const total = uniqueRecents.length;
        const firstCount = Math.min(3, total);

        // Append the first three items
        for (let i = 0; i < firstCount; i++) {
            appendRecentItem(uniqueRecents[i]);
        }

        if (total <= 3) {
            // No need to set fixed height or scrolling
            return;
        }

        // Measure using bounding box rect height for the first three rows
        (function measureAndLockThreeRowHeight() {
            const el = $searchRecents.get(0);
            const rect = el ? el.getBoundingClientRect() : null;
            const bboxHeight = rect ? rect.height : 0;
            $searchRecents.css({ height: Math.ceil(bboxHeight) + 'px', overflowY: 'auto' });
            // Debug log removed
        })();

        // Append the remaining items
        for (let i = 3; i < total; i++) {
            appendRecentItem(uniqueRecents[i]);
        }
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
        
        // Get active stops data (assume presence; fail fast if missing)
        const activeStopItems = [];
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
        
        // Create recommendation elements
        selectedItems.forEach(item => {
            let icon = '';
            if (item.category === 'stop') {
                icon = '<i class="fa-solid fa-bus-simple" style="color: var(--theme-hidden-route-col)"></i>';
            } else {
                icon = '<i class="fa-solid fa-building" style="color: var(--theme-hidden-route-col)"></i>';
            }
            
            const $recItem = $(`<div class="search-result-item flex" style="column-gap: 0.3rem !important;">${icon}<div>${item.name}</div></div>`);
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
        
        // Convert FontAwesome icons to custom icons
        replaceFontAwesomeIcons();
    }

});

function closeSearch() {
    $('.search-wrapper').hide();
}

function openSearch() {
    $('.search-wrapper').show();
}