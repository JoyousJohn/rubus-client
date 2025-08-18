$(document).ready(function() {
    $('.search-btn').click(function() {
        $('.search-wrapper').show();
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
            $results.html('');
            return;
        }
        const results = fuse.search(query, { limit: 10 });
        if (results.length === 0) {
            $results.html('<div class="dimgray">No buildings found.</div>');
            return;
        }
        results.forEach(({ item }) => {
            $results.append(`<div class="search-result-item">${item.name}</div>`);
        });
    });

    
});

function closeSearch() {
    $('.search-wrapper').hide();
}

function openSearch() {
    $('.search-wrapper').show();
}