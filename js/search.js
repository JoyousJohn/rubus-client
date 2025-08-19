$(document).ready(function() {
    const $input = $('.search-wrapper input');
    $input.val('')

    $('.search-btn').click(function() {
        hideInfoBoxes(true);
        $('.knight-mover').hide();
        $('.search-wrapper').show();
        $input.trigger('input').focus();
    });

    let fuse;
    let buildingList = [];
    let fuseReady = false;

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
    fetch('lib/building_index.json')
        .then(response => response.json())
        .then(data => {
            // Convert object to array with name property and inject aliases
            buildingList = Object.keys(data).map(name => {
                const obj = { name: name, ...data[name] };
                obj.aliases = obj.aliases || [];
                // Inject aliases based on aliasMap
                for (const mainWord in aliasMap) {
                    if (obj.name.toLowerCase().includes(mainWord)) {
                        obj.aliases = obj.aliases.concat(aliasMap[mainWord]);
                    }
                }
                return obj;
            });
            fuse = new Fuse(buildingList, {
                keys: ['name', 'aliases'],
                threshold: 0.3,
                includeScore: true,
            });
            fuseReady = true;
        });

    // Remove the funny result rendering function

    $('.search-wrapper input').on('input', function() {
        const query = $(this).val().trim();
        const $results = $('.search-results');
        $results.empty();
        if (!fuseReady || !query) {
            $('.search-results-wrapper, .search-results').hide();
            return;
        }
        $('.search-results-wrapper, .search-results').show();

        // Extended search: require all tokens to match in any field
        const tokens = query.split(/\s+/).filter(Boolean);
        let results;
        if (tokens.length > 1) {
            const extendedQuery = {
                $and: tokens.map(token => ({
                    $or: [
                        { name: token },
                        { aliases: token }
                    ]
                }))
            };
            results = fuse.search(extendedQuery);
        } else {
            results = fuse.search(query);
        }

        if (results.length === 0) {
            $results.html('<div class="dimgray">No buildings found.</div>');
            return;
        }
        results.forEach(({ item }) => {
            let icon = '';
            if (item.category === 'building') {
                icon = '<i class="fa-solid fa-building"></i>';
            } else if (item.category === 'parking') {
                icon = '<i class="fa-solid fa-square-parking"></i>';
            }
            $elm = $(`<div class="search-result-item flex">${icon}<div>${item.name}</div></div>`);
            $elm.click(function() {
                closeSearch();
                showBuildingInfo(item);
                map.flyTo([item.lat, item.lng], 17, { duration: 0.3 });
            });
            $results.append($elm);
        });
    });

    
});

function closeSearch() {
    $('.search-wrapper').hide();
}

function openSearch() {
    $('.search-wrapper').show();
}