$(document).ready(function() {
    const $input = $('.search-wrapper input');
    $input.val('')

    $('.search-btn').click(function() {
        $('.search-wrapper').show();
        $input.trigger('input').focus();
    });

    let fuse;
    let buildingList = [];
    let fuseReady = false;

    // Load building_index.json and initialize Fuse.js
    fetch('lib/building_index.json')
        .then(response => response.json())
        .then(data => {
            // Convert object to array with name property
            buildingList = Object.keys(data).map(name => ({
                name: name,
                ...data[name]
            }));
            fuse = new Fuse(buildingList, {
                keys: ['name'],
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
        const results = fuse.search(query);
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
                console.log('item', item);
                showBuildingInfo(item);

                map.flyTo([item.lat, item.lng], 17, {
                    duration: 0.3
                });
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