$(document).ready(function() {
    $('.building-directions').click(function() {
        console.log('Building directions clicked, popupBuildingName:', popupBuildingName);

        // Check if we have a building selected BEFORE calling hideInfoBoxes
        if (!popupBuildingName) {
            showNavigationMessage('No building selected. Please click on a building first.');
            return;
        }

        // Store the building name before it gets cleared by hideInfoBoxes
        const currentBuildingName = popupBuildingName;

        hideInfoBoxes();

        // Determine which input to populate based on current focus/context
        const fromInput = $('#nav-from-input');
        const toInput = $('#nav-to-input');

        // If "from" input is empty, use it; otherwise use "to" input
        const targetInput = fromInput.val().trim() === '' ? 'from' : 'to';

        setNavigationFromBuilding(currentBuildingName, targetInput);
        $('.navigate-wrapper').show();

        // Focus on the other input
        if (targetInput === 'from') {
            $('#nav-to-input').focus();
        } else {
            $('#nav-from-input').focus();
        }
    });

    // Handle navigation input functionality
    setupNavigationInputs();
});

function setupNavigationInputs() {
    // Swap button functionality
    $('.nav-swap').click(function() {
        const fromInput = $('#nav-from-input');
        const toInput = $('#nav-to-input');
        const fromValue = fromInput.val();
        const toValue = toInput.val();
        
        fromInput.val(toValue);
        toInput.val(fromValue);
        
        // Trigger change event to update any dependent logic
        fromInput.trigger('change');
        toInput.trigger('change');
    });

    // Handle input changes
    $('#nav-from-input, #nav-to-input').on('input', function() {
        const input = $(this);
        const value = input.val().trim();

        if (value.length > 0) {
            input.addClass('has-value');
        } else {
            input.removeClass('has-value');
        }

        // Clear the selected building variable on manual edits only
        if (!isSettingInputProgrammatically) {
            if (input.attr('id') === 'nav-from-input') {
                selectedFromBuilding = null;
            } else if (input.attr('id') === 'nav-to-input') {
                selectedToBuilding = null;
            }
        }

        // Reset autocomplete index when input changes
        currentAutocompleteIndex = -1;

        // Show autocomplete dropdown
        showNavigationAutocomplete(input, value);
    });

    // Handle focus events to hide dropdowns
    $('#nav-from-input, #nav-to-input').on('focus', function() {
        const input = $(this);
        const value = input.val().trim();
        if (value.length > 0) {
            showNavigationAutocomplete(input, value);
        }
    });

    // Handle blur events to hide dropdowns after a delay
    $('#nav-from-input, #nav-to-input').on('blur', function() {
        // Delay hiding to allow clicks on dropdown items
        setTimeout(() => {
            hideNavigationAutocomplete();
        }, 200);
    });

    // Hide dropdowns when clicking outside
    $(document).on('click', function(e) {
        if (!$(e.target).closest('.nav-from, .nav-to, .nav-from-search-results, .nav-to-search-results').length) {
            hideNavigationAutocomplete();
        }
    });

    // Handle keyboard navigation for inputs
    $('#nav-from-input, #nav-to-input').on('keydown', function(e) {
        const isFromInput = e.target.id === 'nav-from-input';
        const resultsContainer = isFromInput ? $('.nav-from-search-results') : $('.nav-to-search-results');
        const resultItems = resultsContainer.find('.nav-search-result-item');

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
                // Move focus to destination input
                $('#nav-to-input').focus();
            }
        }
    });
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

    $('.navigate-wrapper').show();
    
    // Focus on the appropriate input
    if (navFrom) {
        $('#nav-to-input').focus();
    } else {
        $('#nav-from-input').focus();
    }
}

function calculateRoute(from, to) {
    console.log(`Calculating route from "${from}" to "${to}"`);

    try {
        // Get building data - use selected building if available, otherwise fuzzy search
        let startBuilding = null;
        let endBuilding = null;

        // For start building
        if (selectedFromBuilding) {
            startBuilding = buildingIndex[selectedFromBuilding];
        } else {
            // Try exact match first, then fuzzy search
            startBuilding = buildingIndex[from.toLowerCase()];
            if (!startBuilding) {
                const fuzzyResult = findBuildingFuzzy(from);
                if (fuzzyResult) {
                    startBuilding = fuzzyResult;
                    console.log(`Using fuzzy match for "${from}": "${fuzzyResult.name}"`);
                }
            }
        }

        // For end building
        if (selectedToBuilding) {
            endBuilding = buildingIndex[selectedToBuilding];
        } else {
            // Try exact match first, then fuzzy search
            endBuilding = buildingIndex[to.toLowerCase()];
            if (!endBuilding) {
                const fuzzyResult = findBuildingFuzzy(to);
                if (fuzzyResult) {
                    endBuilding = fuzzyResult;
                    console.log(`Using fuzzy match for "${to}": "${fuzzyResult.name}"`);
                }
            }
        }

        if (!startBuilding || !endBuilding) {
            const missingFrom = !startBuilding ? `"${from}"` : '';
            const missingTo = !endBuilding ? `"${to}"` : '';
            const connector = missingFrom && missingTo ? ' or ' : '';
            showNavigationMessage(`Could not find building data for ${missingFrom}${connector}${missingTo}`);
            return;
        }

        // Determine if start/end are bus stops (vs buildings)
        const startIsStop = String(startBuilding.category || '').toLowerCase() === 'stop';
        const endIsStop = String(endBuilding.category || '').toLowerCase() === 'stop';

        // Resolve boarding/alighting stops
        const startStop = startIsStop ? {
            id: String(startBuilding.id),
            name: startBuilding.name,
            latitude: startBuilding.lat,
            longitude: startBuilding.lng
        } : findClosestStop(startBuilding.lat, startBuilding.lng);
        const endStop = endIsStop ? {
            id: String(endBuilding.id),
            name: endBuilding.name,
            latitude: endBuilding.lat,
            longitude: endBuilding.lng
        } : findClosestStop(endBuilding.lat, endBuilding.lng);

        if (!startStop || !endStop) {
            showNavigationMessage("Could not find nearby bus stops");
            return;
        }

        // Find connecting routes
        const connectingRoutes = findConnectingRoutes(startStop.id, endStop.id);

        if (connectingRoutes.length === 0) {
            showNavigationMessage("No bus routes connect these locations");
            return;
        }

        // Rank routes by desirability (best first)
        const rankedRoutes = selectBestRoute(connectingRoutes, startStop, endStop);
        const hasAlternatives = rankedRoutes.length > 1;

        // Calculate walking distances
        const startWalkDistance = startIsStop ? null : calculateWalkingDistance(
            startBuilding.lat, startBuilding.lng,
            startStop.latitude, startStop.longitude
        );

        const endWalkDistance = endIsStop ? null : calculateWalkingDistance(
            endStop.latitude, endStop.longitude,
            endBuilding.lat, endBuilding.lng
        );

        // Filter out routes with excessive walking unless it's the only choice
        // Using total walking feet threshold (e.g., 2000 ft) – tweakable
        const totalWalkingFeet = (startWalkDistance?.feet || 0) + (endWalkDistance?.feet || 0);
        const WALKING_CUTOFF_FEET = 2000;
        let filteredRankedRoutes = rankedRoutes;
        if (rankedRoutes.length > 1 && totalWalkingFeet > WALKING_CUTOFF_FEET) {
            // Keep only non-WKND/ON routes when walking is too high; if that empties, keep original top
            const nonWeekend = rankedRoutes.filter(r => {
                const n = String(r.name || '').toLowerCase();
                return !(n.startsWith('wknd') || n.startsWith('on'));
            });
            filteredRankedRoutes = nonWeekend.length > 0 ? nonWeekend : rankedRoutes;
        }

        // Ensure we still have routes
        if (filteredRankedRoutes.length === 0) {
            showNavigationMessage("No suitable bus route after filtering");
            return;
        }

        // Get detailed route information for the primary route
        const primaryRoute = filteredRankedRoutes[0];
        const routeDetails = getRouteDetails(primaryRoute, startStop.id, endStop.id);

        // Check if fuzzy matching was used
        const usedFuzzyMatch = {
            from: selectedFromBuilding ? false : buildingIndex[from.toLowerCase()] ? false : findBuildingFuzzy(from) !== null,
            to: selectedToBuilding ? false : buildingIndex[to.toLowerCase()] ? false : findBuildingFuzzy(to) !== null
        };

        // Display the route
        displayRoute({
            startBuilding,
            endBuilding,
            startStop,
            endStop,
            route: routeDetails,
            allRoutes: filteredRankedRoutes,
            selectedRouteIndex: 0,
            startWalkDistance,
            endWalkDistance,
            hasAlternatives,
            alternativeRoutes: hasAlternatives ? filteredRankedRoutes.slice(1) : [],
            usedFuzzyMatch,
            originalInputs: { from, to },
            startIsStop,
            endIsStop
        });

    } catch (error) {
        console.error('Error calculating route:', error);
        showNavigationMessage('Error calculating route. Please try again.');
    }
}

function showNavigationMessage(message) {
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

// Variables to track building selections from map clicks
let selectedFromBuilding = null; // normalized building name from map click for "from" input
let selectedToBuilding = null;   // normalized building name from map click for "to" input
let isSettingInputProgrammatically = false; // prevent clearing on programmatic input

// Variables to track autocomplete navigation
let currentAutocompleteIndex = -1;

// Check if both navigation inputs have valid buildings and trigger route calculation
function checkAndTriggerRouteCalculation() {
    const fromValue = $('#nav-from-input').val().trim();
    const toValue = $('#nav-to-input').val().trim();

    // Only trigger if both inputs have values and both have selected buildings from autocomplete
    if (fromValue && toValue && selectedFromBuilding && selectedToBuilding) {
        // Verify that the current input values match the selected buildings
        const fromBuilding = buildingIndex[selectedFromBuilding];
        const toBuilding = buildingIndex[selectedToBuilding];

        if (fromBuilding && toBuilding &&
            fromBuilding.name.toLowerCase() === fromValue.toLowerCase() &&
            toBuilding.name.toLowerCase() === toValue.toLowerCase()) {

            console.log('Both buildings are valid, triggering route calculation');
            calculateRoute(fromValue, toValue);
        }
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

    // Set the selected building variable
    if (targetInput === 'from') {
        selectedFromBuilding = normalizedName;
        $('#nav-from-input').val(buildingName).trigger('input');
    } else if (targetInput === 'to') {
        selectedToBuilding = normalizedName;
        $('#nav-to-input').val(buildingName).trigger('input');
    }

    // Check if we should trigger route calculation
    checkAndTriggerRouteCalculation();
}

// Fuzzy search for building using Fuse.js
function findBuildingFuzzy(searchTerm) {
    if (!window.fuse || !window.fuseReady) {
        console.warn('Fuse.js not ready for building search');
        return null;
    }

    const results = window.fuse.search(searchTerm);
    if (results.length > 0) {
        return results[0].item; // Return the best match
    }

    return null;
}

// Show autocomplete dropdown for navigation inputs
function showNavigationAutocomplete(inputElement, query) {
    const isFromInput = inputElement.attr('id') === 'nav-from-input';
    const resultsContainer = isFromInput ? $('.nav-from-search-results') : $('.nav-to-search-results');

    resultsContainer.empty();
    currentAutocompleteIndex = -1;

    if (!window.fuseReady || !query.trim()) {
        resultsContainer.addClass('none');
        return;
    }

    // Perform fuzzy search
    const tokens = query.split(/\s+/).filter(Boolean);
    let results;

    if (tokens.length > 1) {
        // Multi-token search
        const extendedQuery = {
            $and: tokens.map(token => ({
                $or: [
                    { name: token },
                    { aliases: token }
                ]
            }))
        };
        results = window.fuse.search(extendedQuery);
    } else {
        results = window.fuse.search(query);
    }

    if (results.length === 0) {
        resultsContainer.html('<div class="nav-search-no-results">No buildings found</div>');
        resultsContainer.removeClass('none');
        return;
    }

    // Create result elements (limit to 5 results)
    const maxResults = 5;
    results.slice(0, maxResults).forEach(({ item }) => {
        let icon = '';
        if (item.category === 'building') {
            icon = '<i class="fa-solid fa-building"></i>';
        } else if (item.category === 'parking') {
            icon = '<i class="fa-solid fa-square-parking"></i>';
        } else if (item.category === 'stop') {
            icon = '<i class="fa-solid fa-bus-simple"></i>';
        }

        const $resultElement = $(`<div class="nav-search-result-item">${icon}<div>${item.name}</div></div>`);

        $resultElement.click(function() {
            // Set the input value
            inputElement.val(item.name);

            // Set the selected building variable
            if (isFromInput) {
                selectedFromBuilding = item.name.toLowerCase();
            } else {
                selectedToBuilding = item.name.toLowerCase();
            }

            // Hide results
            resultsContainer.addClass('none');

            // Trigger input to update styling
            inputElement.trigger('input');

            // Immediately check and trigger route calculation if both are set
            // This ensures calculation happens as soon as both are chosen from autocomplete
            if (selectedFromBuilding && selectedToBuilding) {
                // Get the current values from the inputs
                const fromValue = $('#nav-from-input').val().trim();
                const toValue = $('#nav-to-input').val().trim();
                // Only trigger if both input values match the selected buildings
                const fromBuilding = buildingIndex[selectedFromBuilding];
                const toBuilding = buildingIndex[selectedToBuilding];
                if (fromBuilding && toBuilding &&
                    fromBuilding.name.toLowerCase() === fromValue.toLowerCase() &&
                    toBuilding.name.toLowerCase() === toValue.toLowerCase()) {
                    calculateRoute(fromValue, toValue);
                }
            }
        });

        resultsContainer.append($resultElement);
    });

    resultsContainer.removeClass('none');
}

// Hide autocomplete dropdowns
function hideNavigationAutocomplete() {
    $('.nav-from-search-results, .nav-to-search-results').addClass('none');
    currentAutocompleteIndex = -1;
}

// Highlight/unhighlight autocomplete items
function highlightAutocompleteItem(resultsContainer, index) {
    resultsContainer.find('.nav-search-result-item').removeClass('highlighted');
    if (index >= 0) {
        resultsContainer.find('.nav-search-result-item').eq(index).addClass('highlighted');
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

// Find the closest bus stop to a given latitude and longitude
function findClosestStop(targetLat, targetLng) {
    let closestStop = null;
    let minDistance = Infinity;

    for (const stopId in stopsData) {
        const stop = stopsData[stopId];
        const distance = calculateDistance(
            targetLat, targetLng,
            stop.latitude, stop.longitude
        );

        if (distance < minDistance) {
            minDistance = distance;
            closestStop = {
                id: stopId,
                name: stop.name,
                latitude: stop.latitude,
                longitude: stop.longitude,
                distance: distance
            };
        }
    }

    return closestStop;
}

// Find bus routes that connect two stops
function findConnectingRoutes(startStopId, endStopId) {
    const connectingRoutes = [];

    const possibleRoutes = ['a', 'b', 'bl', 'c', 'ee', 'f', 'h', 'lx', 'rexl', 'rexb', 'wknd1', 'wknd2'];

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

// Calculate walking distance between two points (simple straight-line distance)
function calculateWalkingDistance(lat1, lng1, lat2, lng2) {
    const distance = calculateDistance(lat1, lng1, lat2, lng2);
    return {
        meters: Math.round(distance),
        miles: Math.round(distance * 0.000621371 * 100) / 100,
        feet: Math.round(distance * 3.28084)
    };
}

// Select the best route from available options based on various criteria
function selectBestRoute(routes, startStop, endStop) {
    if (routes.length === 0) return [];
    if (routes.length === 1) return [routes[0]];

    // Score routes based on multiple criteria (treat routes as circular)
    const scoredRoutes = routes.map(route => {
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

        // Strongly deprioritize weekend/overnight variants so they are not chosen by default
        const n = String(route.name || '').toLowerCase();
        if (n.startsWith('wknd') || n.startsWith('on')) {
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
    const stops = [];
    const startIndex = route.startIndex;
    const endIndex = route.endIndex;

    const total = (route.stops || []).length;
    if (total === 0) {
        return { ...route, stopsInOrder: stops, direction: 'forward', totalStops: 0 };
    }

    // Compute circular shortest path direction and range
    const diff = Math.abs(endIndex - startIndex);
    const forwardDistance = (endIndex - startIndex + total) % total; // steps going forward wrapping
    const backwardDistance = (startIndex - endIndex + total) % total; // steps going backward wrapping
    const goForward = forwardDistance <= backwardDistance; // prefer forward on tie
    const steps = Math.min(forwardDistance, backwardDistance);

    // Add stops in circular order
    for (let i = 0; i <= steps; i++) {
        const idx = goForward ? (startIndex + i) % total : (startIndex - i + total) % total;
        const stopId = route.stops[idx];
        if (stopsData[stopId]) {
            stops.push({
                id: stopId,
                name: stopsData[stopId].name,
                isBoardingStop: stopId === startStopId,
                isAlightingStop: stopId === endStopId
            });
        }
    }

    return {
        ...route,
        stopsInOrder: stops,
        direction: goForward ? 'forward' : 'backward',
        totalStops: stops.length
    };
}

async function loadAndDisplayRoadNetwork() {
    try {
        // Check if layer already exists and remove it
        if (roadNetworkLayer) {
            map.removeLayer(roadNetworkLayer);
            roadNetworkLayer = null;
        }

        // Fetch the geojson data
        const response = await fetch('lib/geojson/lines.geojson');
        if (!response.ok) {
            throw new Error(`Failed to load road network data: ${response.statusText}`);
        }

        const geojsonData = await response.json();

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

        console.log('Road network loaded and displayed successfully');
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

// Format a user-facing label for a route, merging WKND/ON variants
function formatRouteLabel(routeName) {
    const n = String(routeName || '').toLowerCase();
    const m = n.match(/^(?:wknd|on)(\d+)/);
    if (m) {
        const v = m[1];
        return `WKND${v}/ON${v}`;
    }
    return String(routeName || '').toUpperCase();
}

// Format route label with per-variant colors when WKND/ON are merged
function formatRouteLabelColored(routeName) {
    const original = String(routeName || '');
    const n = original.toLowerCase();
    const m = n.match(/^(?:wknd|on)(\d+)/);
    if (m) {
        const v = m[1];
        const wkKey = `wknd${v}`;
        const onKey = `on${v}`;
        const wkColor = (typeof colorMappings !== 'undefined' && colorMappings[wkKey]) ? colorMappings[wkKey] : '#111827';
        const onColor = (typeof colorMappings !== 'undefined' && colorMappings[onKey]) ? colorMappings[onKey] : '#111827';
        return `<span style="color: ${wkColor};">WKND${v}</span>/<span style="color: ${onColor};">ON${v}</span>`;
    }
    const color = (typeof colorMappings !== 'undefined' && colorMappings[n]) ? colorMappings[n] : '#111827';
    return `<span style="color: ${color};">${original.toUpperCase()}</span>`;
}

// Display the calculated route in the navigation UI
function displayRoute(routeData) {
    const {
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
        endIsStop = false
    } = routeData;

    // Clear existing route display
    $('.nav-directions-wrapper').removeClass('none').empty();

    const directionsContainer = $('.nav-directions-wrapper');

    // Create route selector header if there are multiple routes
    let routeSelectorHtml = '';
    // Prepare routes for display: exclude winter/summer/all; group WKND/ON together and place at end
    let routesForDisplay = [];
    let selectedRouteDisplayIndex = 0;
    if (allRoutes.length > 1) {
        const isExcluded = (name) => {
            const n = String(name || '').toLowerCase();
            return n.includes('winter') || n.includes('summer') || n === 'all';
        };
        const isWkndOn = (name) => {
            const n = String(name || '').toLowerCase();
            return n.startsWith('wknd') || n.startsWith('on');
        };

        const baseRoutes = allRoutes.filter(r => !isExcluded(r.name) && !isWkndOn(r.name));
        const wkndOnRoutes = allRoutes.filter(r => !isExcluded(r.name) && isWkndOn(r.name));

        // Sort base routes by desirability (fewest stops between start/end, circular)
        const sortedBase = baseRoutes.slice().sort((a, b) => {
            const nA = (a.stops || []).length;
            const nB = (b.stops || []).length;
            const diffA = Math.abs(a.endIndex - a.startIndex);
            const diffB = Math.abs(b.endIndex - b.startIndex);
            const circA = nA > 0 ? Math.min(diffA, nA - diffA) : diffA;
            const circB = nB > 0 ? Math.min(diffB, nB - diffB) : diffB;
            return circA - circB;
        });

        // Build display entries for base routes first
        routesForDisplay = sortedBase.map(r => ({ route: r, displayName: r.name.toUpperCase() }));

        // Group WKND/ON pairs by variant suffix (e.g., 1, 2) and append at end
        if (wkndOnRoutes.length > 0) {
            const getVariant = (name) => {
                const n = String(name || '').toLowerCase();
                const m = n.match(/(?:wknd|on)(\d+)/);
                return m ? m[1] : '';
            };
            const groups = {};
            wkndOnRoutes.forEach(r => {
                const v = getVariant(r.name);
                if (!groups[v]) groups[v] = { wknd: null, on: null };
                if (r.name.toLowerCase().startsWith('wknd')) groups[v].wknd = r;
                if (r.name.toLowerCase().startsWith('on')) groups[v].on = r;
            });
            const variants = Object.keys(groups).sort((a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0));
            variants.forEach(v => {
                const pair = groups[v];
                const representative = pair.wknd || pair.on; // prefer WKND if available
                const label = `WKND${v}/ON${v}`;
                routesForDisplay.push({ route: representative, displayName: label });
            });
        }

        // Map selected route to its index in the display list by actual route name
        selectedRouteDisplayIndex = Math.max(0, routesForDisplay.findIndex(e => e.route.name === route.name));
        // If the selected route is a weekend/overnight variant, default to the first base route if available
        if (selectedRouteDisplayIndex >= 0) {
            const selectedEntry = routesForDisplay[selectedRouteDisplayIndex];
            const n = String(selectedEntry.route.name || '').toLowerCase();
            if ((n.startsWith('wknd') || n.startsWith('on')) && routesForDisplay.length > 0) {
                const firstBaseIndex = routesForDisplay.findIndex(e => {
                    const rn = String(e.route.name || '').toLowerCase();
                    return !(rn.startsWith('wknd') || rn.startsWith('on'));
                });
                if (firstBaseIndex !== -1) {
                    selectedRouteDisplayIndex = firstBaseIndex;
                }
            }
        }

        const routeOptions = routesForDisplay.map((entry, index) => {
            const isSelected = index === selectedRouteDisplayIndex;
            const routeKey = entry.route.name.toLowerCase();
            const label = entry.displayName;

            // Get color from colorMappings only for selected route, fallback to gray
            let backgroundColor = '#f3f4f6'; // Default light gray for unselected
            let textColor = '#6b7280'; // Default gray text for unselected

            if (isSelected) {
                if (typeof colorMappings !== 'undefined' && colorMappings[routeKey]) {
                    backgroundColor = colorMappings[routeKey];
                } else {
                    backgroundColor = '#6b7280';
                }
                textColor = 'white';
            }

            const selectedClass = isSelected ? 'selected' : '';
            const style = `background-color: ${backgroundColor}; color: ${textColor};`;

            return `<div class="route-option ${selectedClass} br-1rem" data-route-index="${index}" style="${style}">
                ${label}
            </div>`;
        }).join('');

        routeSelectorHtml = `
            <div class="nav-route-selector" style="margin-bottom: 1rem;">
                <div class="route-options-container">
                    ${routeOptions}
                </div>
            </div>
        `;
    }

    // Create fuzzy match info if applicable
    let fuzzyMatchHtml = '';
    if (usedFuzzyMatch.from || usedFuzzyMatch.to) {
        const fromMatch = usedFuzzyMatch.from ? `"${originalInputs.from}" → "${startBuilding.name}"` : '';
        const toMatch = usedFuzzyMatch.to ? `"${originalInputs.to}" → "${endBuilding.name}"` : '';
        const connector = fromMatch && toMatch ? ', ' : '';
        fuzzyMatchHtml = `
            <div class="fuzzy-match-info" style="margin-bottom: 0.5rem; padding: 0.5rem; background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 0.25rem;">
                <div style="font-size: 1.1rem; color: #1d4ed8;">
                    🔍 Used smart matching: ${fromMatch}${connector}${toMatch}
                </div>
            </div>
        `;
    }

    // No longer showing alternative routes info since it's clear from the route selector above

    // Create route header
    const headerHtml = (function() {
        let steps = [];
        if (!startIsStop) {
            steps.push(`Walk ${startWalkDistance.feet} ft`);
        }
        steps.push(`Bus <strong>${formatRouteLabelColored(route.name)}</strong>`);
        if (!endIsStop) {
            steps.push(`Walk ${endWalkDistance.feet} ft`);
        }
        const summary = steps.join(' → ');
        return `
        <div class="route-header" style="margin-bottom: 1rem; text-align: center;">
            <h3 style="font-size: 1.35rem; font-weight: normal; margin-bottom: 0;">Route from ${startBuilding.name} to ${endBuilding.name}</h3>
            <div class="route-summary" style="font-size: 1.2rem; color: #4b5563;">
                ${summary}
            </div>
            ${fuzzyMatchHtml}
        </div>
        `;
    })();

    // Create walking segment from start to boarding stop
    const walkingStartHtml = startIsStop ? '' : `
        <div class="route-segment walking-segment" style="margin-bottom: 1rem; padding: 0.75rem; background-color: #eff6ff; border-radius: 0.5rem;">
            <div class="segment-icon" style="margin-bottom: 0.5rem;">
                <span style="color: #2563eb;">🚶</span>
                <span class="segment-type" style="font-weight: 500;">Walk to Bus Stop</span>
            </div>
            <div class="segment-details">
                <div class="segment-distance" style="font-size: 0.875rem; color: #4b5563; margin-bottom: 0.25rem;">
                    ${startWalkDistance.feet} ft
                </div>
                <div class="segment-description">
                    Walk from <strong>${startBuilding.name}</strong> to <strong>${startStop.name}</strong>
                </div>
            </div>
        </div>
    `;

    // Create bus segment with detailed stop information
    let stopsListHtml = '';
    if (route.stopsInOrder && route.stopsInOrder.length > 2) {
        stopsListHtml = `
            <div class="bus-stops-list" style="margin-top: 0.75rem; padding: 0.5rem; background-color: #dcfce7; border-radius: 0.25rem;">
                <div class="stops-sequence" style="font-size: 1.2rem;">
                    ${route.stopsInOrder.map(stop =>
                        `<span style="${stop.isBoardingStop ? 'font-weight: 600; color: #047857;' :
                                     stop.isAlightingStop ? 'font-weight: 600; color: #dc2626;' :
                                     'color: #4b5563;'}">
                            ${stop.name}${stop.isBoardingStop ? ' (board)' :
                                        stop.isAlightingStop ? ' (get off)' : ''}
                        </span>`
                    ).join(' → ')}
                </div>
            </div>
        `;
    }

    const busHtml = `
        <div class="route-segment bus-segment" style="margin-bottom: 1rem; padding: 0.75rem; background-color: #f0fdf4; border-radius: 0.5rem;">
            <div class="segment-icon" style="margin-bottom: 0.5rem;">
                <span style="color: #16a34a;">🚌</span>
                <span class="segment-type" style="font-weight: 500;">Take Bus <span style="font-weight: 700;">${formatRouteLabelColored(route.name)}</span></span>
            </div>
            <div class="segment-details">
                <div class="segment-description" style="margin-bottom: 0.5rem;">
                    Board at <strong>${startStop.name}</strong>
                </div>
                <div class="segment-description" style="margin-bottom: 0.5rem;">
                    Get off at <strong>${endStop.name}</strong>
                </div>
                <div class="bus-route-info" style="font-size: 0.75rem; color: #6b7280;">
                    ${route.totalStops} stops total • ${Math.max(0, route.totalStops - 1)} stops between boarding and alighting
                </div>
                ${stopsListHtml}
            </div>
        </div>
    `;

    // Create walking segment from alighting stop to destination
    const walkingEndHtml = endIsStop ? '' : `
        <div class="route-segment walking-segment" style="margin-bottom: 1rem; padding: 0.75rem; background-color: #eff6ff; border-radius: 0.5rem;">
            <div class="segment-icon" style="margin-bottom: 0.5rem;">
                <span style="color: #2563eb;">🚶</span>
                <span class="segment-type" style="font-weight: 500;">Walk to Destination</span>
            </div>
            <div class="segment-details">
                <div class="segment-distance" style="font-size: 0.875rem; color: #4b5563; margin-bottom: 0.25rem;">
                    ${endWalkDistance.feet} ft
                </div>
                <div class="segment-description">
                    Walk from <strong>${endStop.name}</strong> to <strong>${endBuilding.name}</strong>
                </div>
            </div>
        </div>
    `;

    // Create unified waypoint rows with 4 key waypoints
    const timelineWaypoints = (function() {
        const waypoints = [];
        // Start point
        if (!startIsStop) {
            waypoints.push({ type: 'building', name: startBuilding.name, description: '' });
        }
        // Boarding stop
        waypoints.push({ type: 'stop', name: startStop.name, isBoarding: true, description: startIsStop ? 'Start here' : 'Board bus here' });
        // Alighting stop
        waypoints.push({ type: 'stop', name: endStop.name, isAlighting: true, description: endIsStop ? 'End here' : 'Exit bus here' });
        // End point
        if (!endIsStop) {
            waypoints.push({ type: 'building', name: endBuilding.name, description: 'Final destination' });
        }
        return waypoints;
    })();

    // Create unified waypoint rows combining circle and content
    const waypointRows = timelineWaypoints.map((waypoint, index) => {
        let content = '';
        let connectorText = '';

        if (waypoint.type === 'building' && index === 0) {
            // Start building row
            content = `
                <div class="waypoint-details">
                    <div class="walking-info">
                        Walk ${startWalkDistance.feet} ft to boarding stop
                    </div>
                </div>
            `;
            connectorText = index < timelineWaypoints.length - 1 ? 'Walk to stop' : '';
        } else if (waypoint.isBoarding) {
            // Boarding stop row
            content = `
                <div class="waypoint-details">
                    <div class="bus-route-info flex align-center gap-x-0p5rem">
                        Take Bus <span style="font-weight: 700; font-size: 2rem;">${formatRouteLabelColored(route.name)}</span>
                    </div>
                    <div class="stops-info">
                        ${route.totalStops} stops total • ${Math.max(0, route.totalStops - 1)} stops to destination
                    </div>
                    ${stopsListHtml}
                </div>
            `;
            connectorText = index < timelineWaypoints.length - 1 ? 'Take bus' : '';
        } else if (waypoint.isAlighting) {
            // Alighting stop row
            content = `
                <div class="waypoint-details">
                    <div class="walking-info">
                        Walk ${endWalkDistance.feet} ft to final destination
                    </div>
                </div>
            `;
            connectorText = index < timelineWaypoints.length - 1 ? 'Walk to destination' : '';
        } else if (waypoint.type === 'building' && index === 3) {
            // End building row (no extra arrival message)
            content = '';
        }

        return `
            <div class="waypoint-row ${waypoint.type}-row ${waypoint.isBoarding ? 'boarding' : ''} ${waypoint.isAlighting ? 'alighting' : ''}" data-waypoint-index="${index}">
                <div class="waypoint-circle ${waypoint.type}-circle ${waypoint.isBoarding ? 'boarding-circle' : ''} ${waypoint.isAlighting ? 'alighting-circle' : ''}"></div>
                <div class="waypoint-content">
                    <div class="waypoint-header">
                        <h4 class="waypoint-title">${waypoint.name}</h4>
                        ${waypoint.description ? `<div class="waypoint-description">${waypoint.description}</div>` : ''}
                    </div>
                    ${content}
                </div>
            </div>
        `;
    }).join('');

    // Create main content wrapper
    const contentWrapperHtml = `
        <div class="route-content-wrapper">
            ${routeSelectorHtml}
            ${headerHtml}
            <div class="waypoint-rows-container">
                ${waypointRows}
                <div class="waypoint-connector-global"></div>
            </div>
        </div>
    `;

    // Add content to container
    directionsContainer.html(contentWrapperHtml);

    // Position the single global waypoint connector after render
    positionGlobalWaypointConnector();

    // Add click handlers for route switching
    if (routesForDisplay.length > 1) {
        $('.route-option').click(function() {
            const newRouteIndex = parseInt($(this).attr('data-route-index'));

            if (newRouteIndex !== selectedRouteDisplayIndex) {
                // Update selected route styling (class and inline styles)
                const defaultBg = '#f3f4f6';
                const defaultText = '#6b7280';
                $('.route-option').each(function() {
                    $(this).removeClass('selected');
                    $(this).attr('style', `background-color: ${defaultBg}; color: ${defaultText};`);
                });
                $(this).addClass('selected');
                // Apply selected colors
                const selectedRouteName = routesForDisplay[newRouteIndex].route.name.toLowerCase();
                let selectedBg = '#6b7280';
                if (typeof colorMappings !== 'undefined' && colorMappings[selectedRouteName]) {
                    selectedBg = colorMappings[selectedRouteName];
                }
                $(this).attr('style', `background-color: ${selectedBg}; color: white;`);

                // Track the newly selected route index so we can switch back later
                selectedRouteDisplayIndex = newRouteIndex;

                // Get the new route details
                const newRoute = routesForDisplay[newRouteIndex].route;
                const newRouteDetails = getRouteDetails(newRoute, startStop.id, endStop.id);

                // Update the route display with new route information
                updateRouteDisplay({
                    startBuilding,
                    endBuilding,
                    startStop,
                    endStop,
                    route: newRouteDetails,
                    startWalkDistance,
                    endWalkDistance,
                    originalInputs
                });

                // Reposition connector after content updates
                positionGlobalWaypointConnector();
            }
        });
    }

    // Show navigation wrapper if hidden
    $('.navigate-wrapper').show();

    showNavigationMessage('Route calculated successfully!');
}

// Position a single vertical connector from the first to the last waypoint circle
function positionGlobalWaypointConnector() {
    const container = $('.waypoint-rows-container');
    if (container.length === 0) return;

    const circles = container.find('.waypoint-circle');
    if (circles.length < 2) return;

    const first = $(circles.get(0));
    const last = $(circles.get(circles.length - 1));

    const containerOffset = container.offset();
    const firstOffset = first.offset();
    const lastOffset = last.offset();

    // Position connector starting at the TOP of the first circle
    const firstTop = (firstOffset.top - containerOffset.top);
    const lastBottom = (lastOffset.top - containerOffset.top) + last.outerHeight();

    const firstCenterX = (firstOffset.left - containerOffset.left) + (first.outerWidth() / 2);

    const top = Math.min(firstTop, lastBottom);
    const height = Math.abs(lastBottom - firstTop);

    const connector = container.find('.waypoint-connector-global');
    connector.css({
        top: `${top}px`,
        left: `${firstCenterX - 1}px`,
        height: `${height}px`
    });
}

// Recalculate connector on window resize (layout changes)
$(window).on('resize', function() {
    positionGlobalWaypointConnector();
});

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
        originalInputs = { from: '', to: '' }
    } = routeData;

    // Update route summary in header
    const routeSummaryElement = $('.route-summary');
    if (routeSummaryElement.length > 0) {
        const parts = [];
        if (!startIsStop) parts.push(`Walk ${startWalkDistance.feet} ft`);
        parts.push(`Bus ${formatRouteLabelColored(route.name)}`);
        if (!endIsStop) parts.push(`Walk ${endWalkDistance.feet} ft`);
        routeSummaryElement.html(parts.join(' → '));
    }

    // Update waypoint rows (the UI built in displayRoute) with new route data
    const timelineWaypoints = (function() {
        const waypoints = [];
        if (!startIsStop) {
            waypoints.push({ type: 'building', name: startBuilding.name, description: '' });
        }
        waypoints.push({ type: 'stop', name: startStop.name, isBoarding: true, description: startIsStop ? 'Start here' : 'Board bus here' });
        waypoints.push({ type: 'stop', name: endStop.name, isAlighting: true, description: endIsStop ? 'End here' : 'Exit bus here' });
        if (!endIsStop) {
            waypoints.push({ type: 'building', name: endBuilding.name, description: 'Final destination' });
        }
        return waypoints;
    })();

    const updatedWaypointRows = timelineWaypoints.map((waypoint, index) => {
        let content = '';

        if (waypoint.type === 'building' && index === 0) {
            content = `
                <div class="waypoint-details">
                    <div class="walking-info">
                        Walk ${startWalkDistance.feet} ft to boarding stop
                    </div>
                </div>
            `;
        } else if (waypoint.isBoarding) {
            let innerStopsListHtml = '';
            if (route.stopsInOrder && route.stopsInOrder.length > 2) {
                innerStopsListHtml = `
                    <div class="bus-stops-list" style="margin-top: 0.75rem; padding: 0.5rem; background-color: #dcfce7; border-radius: 0.25rem;">
                        <div class="stops-sequence" style="font-size: 1.2rem;">
                            ${route.stopsInOrder.map(stop =>
                                `<span style="${stop.isBoardingStop ? 'font-weight: 600; color: #047857;' :
                                             stop.isAlightingStop ? 'font-weight: 600; color: #dc2626;' :
                                             'color: #4b5563;'}">
                                    ${stop.name}${stop.isBoardingStop ? ' (board)' : stop.isAlightingStop ? ' (get off)' : ''}
                                </span>`
                            ).join(' → ')}
                        </div>
                    </div>
                `;
            }

            content = `
                <div class="waypoint-details">
                    <div class="bus-route-info flex align-center gap-x-0p5rem">
                        Take Bus <span style="font-weight: 700; font-size: 2rem;">${formatRouteLabelColored(route.name)}</span>
                    </div>
                    <div class="stops-info">
                        ${route.totalStops} stops total • ${Math.abs(route.endIndex - route.startIndex)} stops to destination
                    </div>
                    ${innerStopsListHtml}
                </div>
            `;
        } else if (waypoint.isAlighting) {
            content = `
                <div class="waypoint-details">
                    <div class="walking-info">
                        Walk ${endWalkDistance.feet} ft to final destination
                    </div>
                </div>
            `;
        }

        return `
            <div class="waypoint-row ${waypoint.type}-row ${waypoint.isBoarding ? 'boarding' : ''} ${waypoint.isAlighting ? 'alighting' : ''}" data-waypoint-index="${index}">
                <div class="waypoint-circle ${waypoint.type}-circle ${waypoint.isBoarding ? 'boarding-circle' : ''} ${waypoint.isAlighting ? 'alighting-circle' : ''}"></div>
                <div class="waypoint-content">
                    <div class="waypoint-header">
                        <h4 class="waypoint-title">${waypoint.name}</h4>
                        ${waypoint.description ? `<div class=\"waypoint-description\">${waypoint.description}</div>` : ''}
                    </div>
                    ${content}
                </div>
            </div>
        `;
    }).join('');

    const rowsContainer = $('.waypoint-rows-container');
    if (rowsContainer.length > 0) {
        rowsContainer.html(`${updatedWaypointRows}<div class="waypoint-connector-global"></div>`);
        positionGlobalWaypointConnector();
    }

    // Create updated bus segment
    let stopsListHtml = '';
    if (route.stopsInOrder && route.stopsInOrder.length > 2) {
        stopsListHtml = `
            <div class="bus-stops-list" style="margin-top: 0.75rem; padding: 0.5rem; background-color: #dcfce7; border-radius: 0.25rem;">
                <div class="stops-sequence" style="font-size: 1.2rem;">
                    ${route.stopsInOrder.map(stop =>
                        `<span style="${stop.isBoardingStop ? 'font-weight: 600; color: #047857;' :
                                     stop.isAlightingStop ? 'font-weight: 600; color: #dc2626;' :
                                     'color: #4b5563;'}">
                            ${stop.name}${stop.isBoardingStop ? ' (board)' :
                                        stop.isAlightingStop ? ' (get off)' : ''}
                        </span>`
                    ).join(' → ')}
                </div>
            </div>
        `;
    }

    const updatedBusHtml = `
        <div class="route-segment bus-segment" style="margin-bottom: 1rem; padding: 0.75rem; background-color: #f0fdf4; border-radius: 0.5rem;">
            <div class="segment-icon" style="margin-bottom: 0.5rem;">
                <span style="color: #16a34a;">🚌</span>
                <span class="segment-type" style="font-weight: 500;">Take Bus <span style="font-weight: 700; color: ${typeof colorMappings !== 'undefined' && colorMappings[route.name.toLowerCase()] ? colorMappings[route.name.toLowerCase()] : '#111827'};">${formatRouteLabel(route.name)}</span></span>
            </div>
            <div class="segment-details">
                <div class="segment-description" style="margin-bottom: 0.5rem;">
                    Board at <strong>${startStop.name}</strong>
                </div>
                <div class="segment-description" style="margin-bottom: 0.5rem;">
                    Get off at <strong>${endStop.name}</strong>
                </div>
                <div class="bus-route-info" style="font-size: 0.75rem; color: #6b7280;">
                    ${route.totalStops} stops total • ${Math.max(0, route.totalStops - 1)} stops between boarding and alighting
                </div>
                ${stopsListHtml}
            </div>
        </div>
    `;

    // Update the bus segment
    $('.bus-segment').replaceWith(updatedBusHtml);

    showNavigationMessage(`Switched to ${formatRouteLabel(route.name)} route`);
}

// Clear the current route display
function clearRouteDisplay() {
    $('.nav-directions-wrapper').addClass('none').empty();
    showNavigationMessage('Route cleared');
}

