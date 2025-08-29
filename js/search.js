let buildingIndex;

$(document).ready(function() {
    const $input = $('.search-wrapper input');
    $input.val('')

    $('.search-btn').click(function() {
        hideInfoBoxes(true);
        $('.knight-mover').hide();
        $('.search-wrapper').show();
        $input.trigger('input').focus();

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

});

function closeSearch() {
    $('.search-wrapper').hide();
}

function openSearch() {
    $('.search-wrapper').show();
}