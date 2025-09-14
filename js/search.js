let buildingIndex;

$(document).ready(function() {
    const $input = $('.search-wrapper input');
    $input.val('')

    $('.search-btn').click(function() {
        hideInfoBoxes(true);
        $('.knight-mover').hide();
        $('.search-wrapper').show();
        $input.trigger('input').focus();
        
        // Populate search recommendations
        populateSearchRecommendations();

        sa_event('btn_press', {
            'btn': 'search'
        });
    });

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
        
        // Hide recommendations when user starts typing
        if (sanitizedQuery) {
            $('.search-recs-wrapper').hide();
        } else {
            $('.search-recs-wrapper').show();
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

    // Populate search recommendations with 5 random popular buildings
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
        
        // Select 5 random buildings
        const shuffled = uniqueBuildings.sort(() => 0.5 - Math.random());
        const selectedBuildings = shuffled.slice(0, 5);
        
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