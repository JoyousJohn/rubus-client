let buildingIndex;

$(document).ready(function() {
    const $input = $('.search-wrapper input');
    const $clearBtn = $('.search-clear-btn');
    $input.val('')

    $('.search-btn').click(function() {
        hideInfoBoxes(true);
        $('.knight-mover').hide();
        $('.search-wrapper').show();
        $input.trigger('input').focus();
        
        const hasInput = $input.val().trim();
        
        if (hasInput) {
            // Hide recommendations and recent searches when there's input
            $('.search-recs-wrapper').hide();
            $('.search-recents-wrapper').hide();
        } else {
            // Populate search recommendations and recent searches when no input
            populateSearchRecommendations();
            populateRecentSearches();
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

    // Load building_index.json and initialize Fuse.js
    fetch('lib/building_index_with_campus.json')
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
        } else {
            $('.search-recs-wrapper').show();
            $('.search-recents-wrapper').show();
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
                closeSearch();
                showBuildingInfo(item);
                map.flyTo([item.lat, item.lng], 17, { duration: 0.3 });
                
                // Save to recent searches
                saveRecentSearch(item);

                sa_event('btn_press', {
                    'btn': 'search_result_selected',
                    'result': item.name,
                    'category': item.category || 'unknown'
                });
            });
            $results.append($elm);
        });

        if (!buildingsLayer) {
            loadBuildings();
        }
    });

    // Handle search button gradient flash after initial bus data fetch completes
    document.addEventListener('rubus-bus-data-loaded', function() {
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
        
        // Remove if already exists (to move to front)
        const filtered = recentSearches.filter(item => 
            !(item.name === searchItem.name && item.category === searchItem.category)
        );
        
        // Add to front
        filtered.unshift(searchItem);
        
        // Keep only last 10 searches (more than we show for better UX)
        const limited = filtered.slice(0, 10);
        
        localStorage.setItem('recentSearches', JSON.stringify(limited));
    }
    
    function getRecentSearches() {
        const stored = localStorage.getItem('recentSearches');
        return stored ? JSON.parse(stored) : [];
    }
    
    function removeRecentSearch(itemToRemove) {
        const recentSearches = getRecentSearches();
        const filtered = recentSearches.filter(item => 
            !(item.name === itemToRemove.name && item.category === itemToRemove.category)
        );
        localStorage.setItem('recentSearches', JSON.stringify(filtered));
    }
    
    function populateRecentSearches() {
        const $searchRecents = $('.search-recents');
        const $searchRecentsWrapper = $('.search-recents-wrapper');
        $searchRecents.empty();
        
        const recentSearches = getRecentSearches().slice(0, 3); // Show only 3 most recent
        
        if (recentSearches.length === 0) {
            $searchRecentsWrapper.hide();
            return;
        }
        
        $searchRecentsWrapper.show();
        
        recentSearches.forEach(item => {
            let icon = '';
            if (item.category === 'building') {
                icon = '<i class="fa-solid fa-building" style="color: var(--theme-hidden-route-col)"></i>';
            } else if (item.category === 'parking') {
                icon = '<i class="fa-solid fa-square-parking" style="color: var(--theme-hidden-route-col)"></i>';
            } else if (item.category === 'stop') {
                icon = '<i class="fa-solid fa-bus-simple" style="color: var(--theme-hidden-route-col)"></i>';
            }
            
            const $recentItem = $(`<div class="search-result-item flex" style="column-gap: 0.3rem !important; position: relative;">
                ${icon}
                <div style="flex: 1;">${item.name}</div>
                <button class="recent-remove-btn" type="button" style="position: absolute; right: 0.5rem; top: 50%; transform: translateY(-50%); background: none; border: none; color: var(--theme-color); font-size: 1.8rem; cursor: pointer; padding: 0.25rem; opacity: 0.7; transition: opacity 0.2s;">×</button>
            </div>`);
            
            // Handle click on the main item (not the remove button)
            $recentItem.click(function(e) {
                if (!$(e.target).hasClass('recent-remove-btn')) {
                    closeSearch();
                    showBuildingInfo(item);
                    map.flyTo([item.lat, item.lng], 17, { duration: 0.3 });

                    sa_event('btn_press', {
                        'btn': 'recent_search_selected',
                        'result': item.name,
                        'category': item.category
                    });
                }
            });
            
            // Handle remove button click
            $recentItem.find('.recent-remove-btn').click(function(e) {
                e.stopPropagation(); // Prevent triggering the main item click
                removeRecentSearch(item);
                populateRecentSearches(); // Refresh the list
                
                sa_event('btn_press', {
                    'btn': 'recent_search_removed',
                    'result': item.name,
                    'category': item.category
                });
            });
            
            // Hover effects for remove button
            $recentItem.find('.recent-remove-btn').hover(
                function() { $(this).css('opacity', '1'); },
                function() { $(this).css('opacity', '0.7'); }
            );
            
            $searchRecents.append($recentItem);
        });
    }

    // Populate search recommendations with 3 random popular buildings
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
        
        // Select 3 random buildings
        const shuffled = uniqueBuildings.sort(() => 0.5 - Math.random());
        const selectedBuildings = shuffled.slice(0, 3);
        
        // Create recommendation elements
        selectedBuildings.forEach(building => {
            const icon = '<i class="fa-solid fa-building" style="color: var(--theme-hidden-route-col)"></i>';
            
            const $recItem = $(`<div class="search-result-item flex" style="column-gap: 0.3rem !important;">${icon}<div>${building.name}</div></div>`);
            $recItem.click(function() {
                closeSearch();
                
                // Find the building in buildingIndex to get coordinates
                const buildingKey = Object.keys(buildingIndex).find(key => 
                    buildingIndex[key].id === building.number.toString()
                );
                
                if (buildingKey) {
                    const buildingData = buildingIndex[buildingKey];
                    showBuildingInfo(buildingData);
                    map.flyTo([buildingData.lat, buildingData.lng], 17, { duration: 0.3 });
                    
                    // Save to recent searches
                    saveRecentSearch(buildingData);
                }

                sa_event('btn_press', {
                    'btn': 'search_recommendation_selected',
                    'result': building.name,
                    'category': 'building'
                });
            });
            $searchRecs.append($recItem);
        });
    }

});

function closeSearch() {
    $('.search-wrapper').hide();
}

function openSearch() {
    $('.search-wrapper').show();
}