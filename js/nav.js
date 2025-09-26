// Global fallback minutes per stop used when ETAs are unavailable
let NAV_FALLBACK_MIN_PER_STOP = 5;

let NAV_DEBUG = true;

// Helper function to get pluralized stop count
function getStopCountText(route) {
    const count = Math.max(0, (route.stopsInOrder ? route.stopsInOrder.length : route.totalStops) - 1);
    return count === 1 ? 'stop' : 'stops';
}

$(document).ready(function() {
    $('.building-directions').click(function() {

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
        $('.navigate-wrapper').show();

        // Focus on the from input for user to enter their starting location
        $('#nav-from-input').focus();
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

        // Swap the selected building variables as well
        const tempFromBuilding = selectedFromBuilding;
        const tempToBuilding = selectedToBuilding;
        selectedFromBuilding = tempToBuilding;
        selectedToBuilding = tempFromBuilding;

        // Recalculate route if both inputs have values
        const newFromValue = fromInput.val().trim();
        const newToValue = toInput.val().trim();

        if (newFromValue && newToValue) {
            // Run route calculation in background to prevent blocking UI
            setTimeout(() => {
            calculateRoute(newFromValue, newToValue);
            }, 0);
        }
    });

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
                const buildingName = selectedFromBuilding && buildingIndex[selectedFromBuilding]?.name?.toLowerCase();
                const stopName = selectedFromStop && stopsData[selectedFromStop]?.name?.toLowerCase();
                if (buildingName && inputValue !== buildingName) {
                    selectedFromBuilding = null;
                }
                if (stopName && inputValue !== stopName) {
                    selectedFromStop = null;
                }
            } else if (input.attr('id') === 'nav-to-input') {
                const buildingName = selectedToBuilding && buildingIndex[selectedToBuilding]?.name?.toLowerCase();
                const stopName = selectedToStop && stopsData[selectedToStop]?.name?.toLowerCase();
                if (buildingName && inputValue !== buildingName) {
                    selectedToBuilding = null;
                }
                if (stopName && inputValue !== stopName) {
                    selectedToStop = null;
                }
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

        // Add styling to .from-circle when from-input is focused and has search results
        if (input.attr('id') === 'nav-from-input') {
            const hasResults = !$('.nav-from-search-results').hasClass('none');
            if (hasResults) {
                $('.from-circle').css({
                    'align-self': 'start',
                    'margin-top': '0.7rem'
                });
            }
        }
    });

    // Handle blur events to hide dropdowns after a delay
    $('#nav-from-input, #nav-to-input').on('blur', function() {
        const input = $(this);

        // Delay hiding to allow clicks on dropdown items
        setTimeout(() => {
            hideNavigationAutocomplete();

            // Remove styling from .from-circle when from-input loses focus
            if (input.attr('id') === 'nav-from-input') {
                $('.from-circle').css({
                    'align-self': '',
                    'margin-top': ''
                });
            }
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
                // Only move focus to destination input if autocomplete results are visible
                // (meaning no selection was made via Enter on autocomplete)
                const fromResultsVisible = !$('.nav-from-search-results').hasClass('none');
                const toResultsVisible = !$('.nav-to-search-results').hasClass('none');
                
                if (!fromResultsVisible && !toResultsVisible) {
                    // Move focus to destination input only if no autocomplete selection was made
                    $('#nav-to-input').focus();
                }
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
            $('#nav-to-input').focus();
        } else {
            $('#nav-from-input').focus();
        }
    }
}

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

            // Calculate walking distances for this combination
            const startWalkDistance = startIsStop ? null : calculateWalkingDistance(
                startBuilding.lat, startBuilding.lng,
                startStop.latitude, startStop.longitude
            );

            const endWalkDistance = endIsStop ? null : calculateWalkingDistance(
                endStop.latitude, endStop.longitude,
                endBuilding.lat, endBuilding.lng
            );

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
        }
    }

    // Sort by score (best first) and return top options
    const sortedOptions = routeOptions
        .sort((a, b) => b.score - a.score)
        .slice(0, 5); // Return top 5 options

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
            console.log(`   ${routeName.toUpperCase()}: ${combo.startStop.name} → ${combo.endStop.name}`);
            console.log(`      Walking: ${combo.totalWalkingFeet} ft (${combo.startWalkDistance?.feet || 0} + ${combo.endWalkDistance?.feet || 0})`);
            console.log(`      Score: ${combo.score.toFixed(2)}`);
            console.log(`      Other routes available: ${combo.connectingRoutes.map(r => r.name).join(', ')}`);
            console.log('');
        });
    }

    // Mark the chosen combinations (overall best and best for each route)
    if (sortedOptions.length > 0) {
        sortedOptions[0].chosen = true;
        
        if (NAV_DEBUG) {
            console.log(`🎯 Overall best combination selected:`);
            console.log(`   ${sortedOptions[0].startStop.name} → ${sortedOptions[0].endStop.name}`);
            console.log(`   Walking: ${sortedOptions[0].totalWalkingFeet} ft`);
            console.log(`   Score: ${sortedOptions[0].score.toFixed(2)}`);
            console.log(`   Routes: ${sortedOptions[0].connectingRoutes.map(r => r.name).join(', ')}`);
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
                    combo.bestForRoute.push(routeName.toUpperCase());
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

    // Prefer non-weekend/overnight routes for general use
    const hasRegularRoutes = routes.some(r => {
        const name = String(r.name || '').toLowerCase();
        return !name.startsWith('wknd') && !name.startsWith('on');
    });
    if (hasRegularRoutes) {
        score += 20;
        scoreBreakdown.push(`+20 (regular routes)`);
    } else {
        scoreBreakdown.push(`+0 (weekend/overnight only)`);
    }

    return score;
}

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

        if (!startBuilding || !endBuilding) {
            const missingFrom = !startBuilding ? `"${from}"` : '';
            const missingTo = !endBuilding ? `"${to}"` : '';
            const connector = missingFrom && missingTo ? ' or ' : '';
            showNavigationMessage(`Could not find location data for ${missingFrom}${connector}${missingTo}`);
            return;
        }

        // Determine if start/end are bus stops (vs buildings)
        const startIsStop = String(startBuilding.category || '').toLowerCase() === 'stop';
        const endIsStop = String(endBuilding.category || '').toLowerCase() === 'stop';

        // Resolve boarding/alighting stops - consider multiple options for better routing
        const startStops = startIsStop ? [{
            id: String(startBuilding.id),
            name: startBuilding.name,
            latitude: startBuilding.lat,
            longitude: startBuilding.lng,
            distance: 0
        }] : findClosestStops(startBuilding.lat, startBuilding.lng, 5);

        const endStops = endIsStop ? [{
            id: String(endBuilding.id),
            name: endBuilding.name,
            latitude: endBuilding.lat,
            longitude: endBuilding.lng,
            distance: 0
        }] : findClosestStops(endBuilding.lat, endBuilding.lng, 5);

        if (startStops.length === 0 || endStops.length === 0) {
            showNavigationMessage("Could not find nearby bus stops");
            return;
        }

        // Find the best route combination by trying different start/end stop pairs
        const { sortedOptions, bestByRoute } = findBestRouteCombination(startStops, endStops, startBuilding, endBuilding, startIsStop, endIsStop);

        if (!sortedOptions || sortedOptions.length === 0) {
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

        // Hide any previous nav message when proceeding to display a route
        $('.nav-message').hide(); // remove later?-

        // Get detailed route information for the primary route
        const primaryRoute = filteredRankedRoutes[0];
        const routeDetails = getRouteDetails(primaryRoute, startStop.id, endStop.id);

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
                endStop: combo.endStop,
                startWalkDistance: combo.startWalkDistance,
                endWalkDistance: combo.endWalkDistance,
                totalWalkingFeet: combo.totalWalkingFeet
            };
            allRoutesAcrossBestCombos.push(routeObj);
        });

        // Ensure primary route is present and comes first in selection order
        const primaryKey = String(primaryRoute.name || '').toLowerCase();
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

        // Save to recent navigations
        saveRecentNavigation(startBuilding, endBuilding);

        // Display the route
        displayRoute({
            startBuilding,
            endBuilding,
            startStop,
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
        resultsContainer.html('<div class="nav-search-no-results">No buildings found</div>');
        resultsContainer.removeClass('none');
        return;
    }

    // Create result elements (limit to 5 results)
    const maxResults = 5;
    results.slice(0, maxResults).forEach(result => {
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
        const $resultElement = $(`<div class="nav-search-result-item">${icon}<div>${displayText}</div></div>`);

        // Use a more robust event handling approach for touchpad compatibility
        const handleSelection = function(e) {
            // Prevent default only for touch events to avoid interfering with mouse clicks
            if (e && e.type === 'touchstart') {
                e.preventDefault();
                e.stopPropagation();
            }

            // Set the input value programmatically to avoid clearing selection
            isSettingInputProgrammatically = true;
            inputElement.val(item.name);
            isSettingInputProgrammatically = false;

            // Hide results immediately for better UX (before route calculation)
            resultsContainer.addClass('none');

            // Set the selected place variable (may be building or stop by name)
            if (isFromInput) {
                selectedFromBuilding = item.name.toLowerCase();
            } else {
                selectedToBuilding = item.name.toLowerCase();
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
            }
        };

        // Attach multiple event handlers for better touchpad support
        $resultElement.on('click', handleSelection);
        $resultElement.on('touchstart', handleSelection);
        $resultElement.on('pointerdown', function(e) {
            // For pointer events, handle immediately
            if (e.pointerType === 'touch' || e.pointerType === 'pen') {
                handleSelection(e);
            }
        });



        resultsContainer.append($resultElement);
    });
    
    // Convert FontAwesome icons to custom icons
    replaceFontAwesomeIcons();

    resultsContainer.removeClass('none');

    // Add styling to .from-circle when from-input search results are shown
    if (isFromInput && results.length > 0) {
        $('.from-circle').css({
            'align-self': 'start',
            'margin-top': '0.7rem'
        });
    }
}

// Hide autocomplete dropdowns
function hideNavigationAutocomplete() {
    $('.nav-from-search-results, .nav-to-search-results').addClass('none');
    currentAutocompleteIndex = -1;

    // Remove styling from .from-circle when search results are hidden
    $('.from-circle').css({
        'align-self': '',
        'margin-top': ''
    });
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
function resolvePlaceByName(inputName) {
    if (!inputName) return null;
    const normalized = String(inputName).trim().toLowerCase();

    // Exact building match (by normalized key)
    if (buildingIndex[normalized]) {
        return buildingIndex[normalized];
    }

    // Exact stop match (case-insensitive by name)
    for (const stopId in stopsData) {
        const stop = stopsData[stopId];
        if (String(stop.name || '').trim().toLowerCase() === normalized) {
            return {
                name: stop.name,
                lat: stop.latitude,
                lng: stop.longitude,
                id: parseInt(stopId, 10),
                category: 'stop'
            };
        }
    }

    // Fuzzy building match via Fuse.js
    const fuzzyBuilding = findBuildingFuzzy(inputName);
    if (fuzzyBuilding) {
        return fuzzyBuilding;
    }

    return null;
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
                isBoardingStop: stopId === startStopId,
                isAlightingStop: stopId === endStopId
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

// Load road names for walking segments and update the UI (non-blocking)
function loadWalkingRoadNames(startBuilding, endBuilding, startStop, endStop, startIsStop, endIsStop) {
    // Run pathfinding in background without blocking UI
    Promise.all([
        // Start walking segment pathfinding
        (!startIsStop && startBuilding && startStop) ? 
            loadStartWalkingRoads(startBuilding, startStop) : Promise.resolve(),
        
        // End walking segment pathfinding  
        (!endIsStop && endBuilding && endStop) ? 
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
        const startCoord = [startBuilding.lng, startBuilding.lat];
        const stopCoord = [startStop.longitude, startStop.latitude];
        
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
                // Add green background styling and update text
                startRoadsList.css({
                    'padding': '0.5rem',
                    'background-color': 'var(--theme-stops-list-bg)',
                    'border-radius': '0.25rem'
                });
                startRoadsList.find('.roads-sequence').html(
                    `<span style="color: var(--theme-stops-list-text);">${roadText}</span>`
                );
                
                // Add Google Maps link
                const googleMapsUrl = `https://www.google.com/maps/dir/${startCoord[1]},${startCoord[0]}/${stopCoord[1]},${stopCoord[0]}/data=!3m1!4b1!4m2!4m1!3e2`;
                startRoadsList.after(`
                    <div class="google-maps-link" style="text-align: left;">
                        <a href="${googleMapsUrl}" target="_blank" style="color: var(--theme-link); text-decoration: none; font-size: 1.2rem; font-weight: 500;">
                            <i class="fa-solid fa-arrows-turn-right"></i> Open in Google Maps
                        </a>
                    </div>
                `);
                
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
                // Add green background styling and update text
                endRoadsList.css({
                    'padding': '0.5rem',
                    'background-color': 'var(--theme-stops-list-bg)',
                    'border-radius': '0.25rem'
                });
                endRoadsList.find('.roads-sequence').html(
                    `<span style="color: var(--theme-stops-list-text);">${roadText}</span>`
                );
                
                // Add Google Maps link
                const googleMapsUrl = `https://www.google.com/maps/dir/${stopCoord[1]},${stopCoord[0]}/${endCoord[1]},${endCoord[0]}/data=!3m1!4b1!4m2!4m1!3e2`;
                endRoadsList.after(`
                    <div class="google-maps-link" style="text-align: left;">
                        <a href="${googleMapsUrl}" target="_blank" style="color: var(--theme-link); text-decoration: none; font-size: 1.2rem; font-weight: 500;">
                            <i class="fa-solid fa-arrows-turn-right"></i> Open in Google Maps
                        </a>
                    </div>
                `);
                
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
        endIsStop = false,
        
        routeCombosMap = {}
    } = routeData;

    // Clear existing route display and ensure flex when shown
    $('.nav-directions-wrapper').removeClass('none').addClass('flex').empty();

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

            // Get color from colorMappings only for selected route, fallback to CSS variables
            backgroundColor = 'var(--theme-unselected-route-bg)';
            textColor = 'var(--theme-unselected-route-text)';

            if (isSelected) {
                if (typeof colorMappings !== 'undefined' && colorMappings[routeKey]) {
                    backgroundColor = colorMappings[routeKey];
                } else {
                    backgroundColor = 'var(--theme-unselected-route-bg)';
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
        const fromMatch = usedFuzzyMatch.from ? `"${originalInputs.from}" as "${startBuilding.name}"` : '';
        const toMatch = usedFuzzyMatch.to ? `"${originalInputs.to}" as "${endBuilding.name}"` : '';
        const connector = fromMatch && toMatch ? ' and ' : '';
        fuzzyMatchHtml = `
            <div class="fuzzy-match-info" style="margin-bottom: 0.5rem; padding: 0.5rem; background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 0.25rem;">
                <div style="font-size: 1.1rem; color: #1d4ed8;">
                    Matched ${fromMatch}${connector}${toMatch}
                </div>
            </div>
        `;
    }

    // Removed multi-stop info UI per request

    // No longer showing alternative routes info since it's clear from the route selector above

    // Create route header
    const headerHtml = (function() {
        let steps = [];
        if (!startIsStop && startWalkDistance) {
            const startWalkMinutes = Math.ceil(startWalkDistance.feet / 220); // 220 ft/min = ~3 mph
            steps.push(`Walk ${startWalkMinutes}m`);
        }
        steps.push(`Bus <strong>${formatRouteLabelColored(route.name)}</strong>`);
        if (!endIsStop && endWalkDistance) {
            const endWalkMinutes = Math.ceil(endWalkDistance.feet / 220); // 220 ft/min = ~3 mph
            steps.push(`Walk ${endWalkMinutes}m`);
        }
        const summary = steps.join(' → ');
        
        // Calculate total travel time
        let totalMinutes = 0;
        if (startWalkDistance) {
            totalMinutes += Math.ceil(startWalkDistance.feet / 220); // Walking time to first stop
        }
        if (endWalkDistance) {
            totalMinutes += Math.ceil(endWalkDistance.feet / 220); // Walking time to destination
        }

        // Add bus travel time using average etas and waits
        let busTimeMinutes = 0;
        if (route.stopsInOrder && route.stopsInOrder.length > 1) {
            let totalSeconds = 0;
            let etaCount = 0;
            let waitCount = 0;

            for (let i = 0; i < route.stopsInOrder.length - 1; i++) {
                const fromStopId = route.stopsInOrder[i];
                const toStopId = route.stopsInOrder[i + 1];

                // Add travel time from 'from' stop to 'to' stop
                if (etas && etas[toStopId] && etas[toStopId].from && etas[toStopId].from[fromStopId]) {
                    totalSeconds += etas[toStopId].from[fromStopId];
                    etaCount++;
                }

                // Add wait time at the 'to' stop (except for the last stop)
                if (i < route.stopsInOrder.length - 2 && waits && waits[toStopId]) {
                    totalSeconds += waits[toStopId];
                    waitCount++;
                }
            }

            if (totalSeconds > 0) {
                busTimeMinutes = Math.ceil(totalSeconds / 60);
                totalMinutes += busTimeMinutes;
            } else {
                // Fallback: calculate based on route stops array if stopsInOrder is not available or no ETA data
                const stopsToDestination = Math.abs(route.endIndex - route.startIndex);
                const estimatedMinutes = Math.ceil(stopsToDestination * NAV_FALLBACK_MIN_PER_STOP);
                busTimeMinutes = estimatedMinutes;
                totalMinutes += busTimeMinutes;
            }

        } else if (route.stops && route.stops.length > 0) {
            // Final fallback: calculate based on route stops array if stopsInOrder is not available
            const startIndex = route.startIndex || 0;
            const endIndex = route.endIndex || 0;
            const total = route.stops.length;
            const stopsToDestination = Math.abs(endIndex - startIndex);
            const circStopsBetween = total > 0 ? Math.min(stopsToDestination, total - stopsToDestination) : stopsToDestination;
            const estimatedMinutes = Math.ceil(circStopsBetween * NAV_FALLBACK_MIN_PER_STOP);
            busTimeMinutes = estimatedMinutes;
            totalMinutes += busTimeMinutes;
        }
        
        return `
        <div class="route-header" style="margin-bottom: 1rem; text-align: center;">
            <h3 style="font-size: 1.35rem; font-weight: normal; margin-bottom: 0;">${startBuilding.name} to ${endBuilding.name}</h3>
            <div class="route-summary" style="font-size: 1.2rem; color: var(--theme-color);">
                ${summary}
            </div>
            <div class="total-travel-time" style="font-size: 1.5rem; color: var(--theme-color); margin-top: 0.5rem;">
                Total travel time: <strong>${totalMinutes}m</strong>
            </div>
            ${fuzzyMatchHtml}
            
        </div>
        `;
    })();

    // Create walking segment from start to boarding stop
    const walkingStartHtml = (startIsStop || !startWalkDistance) ? '' : `
        <div class="route-segment walking-segment" id="walking-start-segment" style="margin-bottom: 1rem; padding: 0.75rem; background-color: #eff6ff; border-radius: 0.5rem;">
            <div class="segment-icon" style="margin-bottom: 0.5rem;">
                <span style="color: #2563eb;">🚶</span>
                <span class="segment-type" style="font-weight: 500;">Walk to Bus Stop</span>
            </div>
            <div class="segment-details">
                <div class="segment-distance" style="font-size: 0.875rem; color: #4b5563; margin-bottom: 0.25rem;">
                    ${startWalkDistance ? startWalkDistance.feet : 0} ft
                </div>
                <div class="segment-description">
                    Walk from <strong>${startBuilding.name}</strong> to <strong>${startStop.name}</strong>
                </div>
                <div class="walking-roads-list" style="margin-top: 0.75rem;">
                    <div class="roads-sequence" style="font-size: 1.2rem;">
                        <span style="color: var(--theme-color-lighter); font-weight: 500; animation: navPulse 1s ease-in-out infinite;">Loading road names...</span>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Create bus segment with detailed stop information
    let stopsListHtml = '';
    if (route.stopsInOrder && route.stopsInOrder.length > 0) {
        stopsListHtml = `
            <div class="bus-stops-list" style="margin-top: 0.75rem; padding: 0.5rem; background-color: var(--theme-stops-list-bg); border-radius: 0.25rem;">
                <div class="stops-sequence" style="font-size: 1.2rem;">
                    ${route.stopsInOrder.map(stop =>
                        `<span style="color: var(--theme-stops-list-text); ${stop.id === startStop.id || stop.id === endStop.id ? 'font-weight: bold;' : ''}">
                            ${stop.name}${stop.id === startStop.id ? ' (board)' : stop.id === endStop.id ? ' (get off)' : ''}
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
                    Take bus ${formatRouteLabelColored(route.name)} for ${Math.max(0, (route.stopsInOrder ? route.stopsInOrder.length : route.totalStops) - 1)} ${getStopCountText(route)}
                </div>
                ${stopsListHtml}
            </div>
        </div>
    `;

    // Create walking segment from alighting stop to destination
    const walkingEndHtml = (endIsStop || !endWalkDistance) ? '' : `
        <div class="route-segment walking-segment" id="walking-end-segment" style="margin-bottom: 1rem; padding: 0.75rem; background-color: #eff6ff; border-radius: 0.5rem;">
            <div class="segment-icon" style="margin-bottom: 0.5rem;">
                <span style="color: #2563eb;">🚶</span>
                <span class="segment-type" style="font-weight: 500;">Walk to Destination</span>
            </div>
            <div class="segment-details">
                <div class="segment-distance" style="font-size: 0.875rem; color: #4b5563; margin-bottom: 0.25rem;">
                    ${endWalkDistance ? endWalkDistance.feet : 0} ft
                </div>
                <div class="segment-description">
                    Walk from <strong>${endStop.name}</strong> to <strong>${endBuilding.name}</strong>
                </div>
                <div class="walking-roads-list" style="margin-top: 0.75rem;">
                    <div class="roads-sequence" style="font-size: 1.2rem;">
                        <span style="color: var(--theme-color-lighter); font-weight: 500; animation: navPulse 1s ease-in-out infinite;">Loading road names...</span>
                    </div>
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
                        Walk ${startWalkDistance ? startWalkDistance.feet : 0} ft to boarding stop
                    </div>
                    <div class="walking-roads-list" id="start-walking-roads" style="margin-top: 0.75rem;">
                        <div class="roads-sequence" style="font-size: 1.2rem;">
                            <span style="color: var(--theme-color-lighter); font-weight: 500; animation: navPulse 1s ease-in-out infinite;">Loading road names...</span>
                        </div>
                    </div>
                </div>
            `;
            connectorText = index < timelineWaypoints.length - 1 ? 'Walk to stop' : '';
        } else if (waypoint.isBoarding) {
            // Boarding stop row
            content = `
                <div class="waypoint-details">
                    <div class="stops-info">
                        Take bus <strong>${formatRouteLabelColored(route.name)}</strong> for ${Math.max(0, (route.stopsInOrder ? route.stopsInOrder.length : route.totalStops) - 1)} ${getStopCountText(route)}
                    </div>
                    ${stopsListHtml}
                </div>
            `;
            connectorText = index < timelineWaypoints.length - 1 ? 'Take bus' : '';
        } else if (waypoint.isAlighting) {
            // Alighting stop row
            content = `
                <div class="waypoint-details">
                    ${endWalkDistance ? `<div class="walking-info">Walk ${endWalkDistance.feet} ft to final destination</div>` : ''}
                    ${endWalkDistance ? `
                        <div class="walking-roads-list" id="end-walking-roads" style="margin-top: 0.75rem;">
                            <div class="roads-sequence" style="font-size: 1.2rem;">
                                <span style="color: var(--theme-color-lighter); font-weight: 500; animation: navPulse 1s ease-in-out infinite;">Loading road names...</span>
                            </div>
                        </div>
                    ` : ''}
                </div>
            `;
            connectorText = index < timelineWaypoints.length - 1 ? 'Walk to destination' : '';
        } else if (waypoint.type === 'building' && index === timelineWaypoints.length - 1) {
            // End building row (no extra arrival message)
            content = '';
        }

        // Determine emoji based on waypoint type and context
        let travelEmoji = '';
        let walkingTime = '';
        let busTime = '';
        if (waypoint.type === 'building' && index === 0) {
            // Start building - walking to first stop
            travelEmoji = '🚶';
            if (startWalkDistance) {
                const timeMinutes = Math.ceil(startWalkDistance.feet / 220); // 220 ft/min = ~3 mph
                walkingTime = `<div style="font-size: 1rem; color: var(--theme-color); text-align: center; margin-top: 0.2rem;">${timeMinutes}m</div>`;
            }
        } else if (waypoint.isBoarding) {
            // Boarding stop - about to ride bus
            travelEmoji = '🚌';
            // Calculate bus travel time using average etas and waits
            let totalSeconds = 0;
            const routeStops = route.stopsInOrder || [];
            
            if (routeStops.length > 1) {
                // Sum up travel times between consecutive stops
                for (let i = 0; i < routeStops.length - 1; i++) {
                    const fromStopId = routeStops[i];
                    const toStopId = routeStops[i + 1];
                    
                    // Add travel time from 'from' stop to 'to' stop
                    if (etas && etas[toStopId] && etas[toStopId].from && etas[toStopId].from[fromStopId]) {
                        totalSeconds += etas[toStopId].from[fromStopId];
                    }
                    
                    // Add wait time at the 'to' stop (except for the last stop)
                    if (i < routeStops.length - 2 && waits && waits[toStopId]) {
                        totalSeconds += waits[toStopId];
                    }
                }
            }
            
            if (totalSeconds > 0) {
                const timeMinutes = Math.ceil(totalSeconds / 60);
                busTime = `<div style="font-size: 1rem; color: var(--theme-color); text-align: center; margin-top: 0.2rem;">${timeMinutes}m</div>`;
            } else {
                // Fallback to estimated time if no average data available
                const stopsToDestination = Math.abs(route.endIndex - route.startIndex);
                const estimatedMinutes = Math.ceil(stopsToDestination * NAV_FALLBACK_MIN_PER_STOP);
                busTime = `<div style="font-size: 1rem; color: var(--theme-color); text-align: center; margin-top: 0.2rem;">${estimatedMinutes}m</div>`;
            }
        } else if (index === timelineWaypoints.length - 1) {
            // Final destination - no travel needed
            travelEmoji = '🏁';
        } else if (waypoint.isAlighting) {
            // Alighting stop - about to walk to destination
            travelEmoji = '🚶';
            if (endWalkDistance) {
                const timeMinutes = Math.ceil(endWalkDistance.feet / 220); // 220 ft/min = ~3 mph
                walkingTime = `<div style="font-size: 1rem; color: var(--theme-color); text-align: center; margin-top: 0.2rem;">${timeMinutes}m</div>`;
            }
        }

        return `
            <div class="waypoint-row ${waypoint.type}-row ${waypoint.isBoarding ? 'boarding' : ''} ${waypoint.isAlighting ? 'alighting' : ''}" data-waypoint-index="${index}">
                <div class="waypoint-emoji" style="font-size: 1.5rem; margin-right: 0.75rem; display: flex; flex-direction: column; align-items: center; justify-content: center; width: 2rem;">
                    ${travelEmoji}
                    ${walkingTime || busTime}
                </div>
                <div class="waypoint-circle ${waypoint.type}-circle ${waypoint.isBoarding ? 'boarding-circle' : ''} ${waypoint.isAlighting ? 'alighting-circle' : ''}"></div>
                <div class="waypoint-content" style="margin-left: 0.75rem;">
                    <div class="waypoint-header">
                        <h4 class="waypoint-title clickable-waypoint" data-waypoint-type="${waypoint.type}" data-waypoint-name="${waypoint.name}" data-is-boarding="${waypoint.isBoarding || false}" data-is-alighting="${waypoint.isAlighting || false}" style="cursor: pointer; user-select: none;">${waypoint.name} <i class="fa-duotone fa-solid fa-right" style="--fa-primary-color: var(--theme-link); --fa-secondary-color: color-mix(in srgb, var(--theme-link) 70%, white);"></i></h4>
                        ${waypoint.description ? `<div class="waypoint-description">${waypoint.description}</div>` : ''}
                    </div>
                    ${content}
                </div>
            </div>
        `;
    }).join('');

    // After rendering, adjust emoji connector heights
    // REMOVED: moved to positionEmojiConnectors() and invoked after DOM render
    
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

    directionsContainer.append(`
        <div class="flex justify-center mb-2rem">
            <div class="py-1rem px-2rem br-4rem text-1p6rem white bold-600 w-min" style="background-color: #4444f4;" onclick="closeNavigation()">CLOSE</div>
        </div>
    `);

    // Load road names for walking segments asynchronously
    loadWalkingRoadNames(startBuilding, endBuilding, startStop, endStop, startIsStop, endIsStop);

    // Position the single global waypoint connector after render
    positionGlobalWaypointConnector();

    // Add click handlers for waypoint titles
    $(document).on('click', '.clickable-waypoint', function() {
        const waypointType = $(this).data('waypoint-type');
        const waypointName = $(this).data('waypoint-name');
        const isBoarding = $(this).data('is-boarding');
        const isAlighting = $(this).data('is-alighting');
        
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
                            map.flyTo([building.lat, building.lng], 18, {
                                duration: 1.5
                            });
                        }
                    });
                } else {
                    showBuildingInfo(building);
                    
                    // Fly to the building location
                    if (building && building.lat && building.lng) {
                        map.flyTo([building.lat, building.lng], 18, {
                            duration: 1.5
                        });
                    }
                }
                
                // Close navigation wrapper and hide search
                closeNavigation();
                $('.search-wrapper').hide();
                
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
            
            if (stopId && typeof popStopInfo === 'function') {
                const stop = stopsData[stopId];
                
                // Fly to the stop location
                if (stop && stop.latitude && stop.longitude) {
                    clearPanoutFeedback();
                    map.flyTo([stop.latitude, stop.longitude], 18, {
                        duration: 1.5
                    });
                }
                
                // Show stop info and close navigation
                popStopInfo(parseInt(stopId));
                closeNavigation();
                $('.search-wrapper').hide();
                
                sa_event('btn_press', {
                    'btn': 'nav_waypoint_stop_clicked',
                    'stop': waypointName,
                    'stop_id': stopId,
                    'is_boarding': isBoarding,
                    'is_alighting': isAlighting,
                    'context': 'navigation'
                });
            }
        }
    });

    // Add click handlers for route switching
    if (routesForDisplay.length > 1) {
        $('.route-option').click(function() {
            const newRouteIndex = parseInt($(this).attr('data-route-index'));

            if (newRouteIndex !== selectedRouteDisplayIndex) {
                // Track alternate route selection
                const newRoute = routesForDisplay[newRouteIndex].route;
                sa_event('btn_press', {
                    'btn': 'nav_alternate_route',
                    'route': newRoute.name,
                    'from_route': routesForDisplay[selectedRouteDisplayIndex].route.name,
                    'route_index': newRouteIndex
                });

                // Update selected route styling (class and inline styles)
                const defaultBg = 'var(--theme-unselected-route-bg)';
                const defaultText = 'var(--theme-unselected-route-text)';
                $('.route-option').each(function() {
                    $(this).removeClass('selected');
                    $(this).attr('style', `background-color: ${defaultBg}; color: ${defaultText};`);
                });
                $(this).addClass('selected');
                // Apply selected colors
                const selectedRouteName = newRoute.name.toLowerCase();
                let selectedBg = '#6b7280';
                if (typeof colorMappings !== 'undefined' && colorMappings[selectedRouteName]) {
                    selectedBg = colorMappings[selectedRouteName];
                }
                $(this).attr('style', `background-color: ${selectedBg}; color: white;`);

                // Track the newly selected route index so we can switch back later
                selectedRouteDisplayIndex = newRouteIndex;

                // Get the new route details using best combo per route (start/end stops may differ)
                const newRouteKey = String(newRoute.name || '').toLowerCase();
                const combo = routeCombosMap[newRouteKey];

                // Fallback to current stops if no combo found (shouldn't happen)
                const effectiveStartStop = combo && combo.startStop ? combo.startStop : startStop;
                const effectiveEndStop = combo && combo.endStop ? combo.endStop : endStop;
                const effectiveStartWalk = combo && combo.startWalkDistance ? combo.startWalkDistance : startWalkDistance;
                const effectiveEndWalk = combo && combo.endWalkDistance ? combo.endWalkDistance : endWalkDistance;

                // Get detailed route information for the new route with proper stop indices
                const newRouteDetails = getRouteDetails(newRoute, effectiveStartStop.id, effectiveEndStop.id);
                

                // Update the route display with new route information
                
                // Run route display update in background to prevent blocking UI
                setTimeout(() => {
                updateRouteDisplay({
                    startBuilding,
                    endBuilding,
                    startStop: effectiveStartStop,
                    endStop: effectiveEndStop,
                    route: newRouteDetails,
                    startWalkDistance: effectiveStartWalk,
                    endWalkDistance: effectiveEndWalk,
                    originalInputs,
                    startIsStop,
                    endIsStop
                });

                // Reposition connector after content updates
                positionGlobalWaypointConnector();
                }, 0);
            }
        });
    }

    // Show navigation wrapper if hidden
    $('.navigate-wrapper').show();
    
    // Ensure directions wrapper uses flex when visible
    $('.nav-directions-wrapper').removeClass('none').addClass('flex');

    // Scroll to top of route content wrapper
    $('.nav-directions-wrapper').scrollTop(0);
    
}

// Position a single vertical connector from the first to the last waypoint circle
function positionGlobalWaypointConnector() {
    const container = $('.waypoint-rows-container');
    if (container.length === 0) {
        return;
    }

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
        originalInputs = { from: '', to: '' },
        startIsStop = false,
        endIsStop = false
    } = routeData;

    // Update route summary in header
    const routeSummaryElement = $('.route-summary');
    if (routeSummaryElement.length > 0) {
        const parts = [];
        if (!startIsStop && startWalkDistance) {
            const startWalkMinutes = Math.ceil(startWalkDistance.feet / 220); // 220 ft/min = ~3 mph
            parts.push(`Walk ${startWalkMinutes}m`);
        }
        parts.push(`Bus <strong>${formatRouteLabelColored(route.name)}</strong>`);
        if (!endIsStop && endWalkDistance) {
            const endWalkMinutes = Math.ceil(endWalkDistance.feet / 220); // 220 ft/min = ~3 mph
            parts.push(`Walk ${endWalkMinutes}m`);
        }
        const summary = parts.join(' → ');
        
        // Update only the route summary text
        routeSummaryElement.html(summary);
        
        // Update or create the total travel time element separately
        let totalTravelTimeElement = $('.total-travel-time');
        if (totalTravelTimeElement.length === 0) {
            // Create the total travel time element if it doesn't exist
            routeSummaryElement.after(`
                <div class="total-travel-time" style="font-size: 1.5rem; color: var(--theme-color); margin-top: 0.5rem;">
                    Total travel time: <strong>0m</strong>
                </div>
            `);
            totalTravelTimeElement = $('.total-travel-time');
        }
        
        // Calculate total travel time for the new route
        let totalMinutes = 0;
        let walkingTime = 0;
        let busTime = 0;
        
        if (startWalkDistance) {
            const startWalkMinutes = Math.ceil(startWalkDistance.feet / 220); // Walking time to first stop
            totalMinutes += startWalkMinutes;
            walkingTime += startWalkMinutes;
        }
        if (endWalkDistance) {
            const endWalkMinutes = Math.ceil(endWalkDistance.feet / 220); // Walking time to destination
            totalMinutes += endWalkMinutes;
            walkingTime += endWalkMinutes;
        }
        
        
        // Add bus travel time using average etas and waits for the new route
        if (route.stopsInOrder && route.stopsInOrder.length > 1) {
            let totalSeconds = 0;
            let etaCount = 0;
            let waitCount = 0;
            
            for (let i = 0; i < route.stopsInOrder.length - 1; i++) {
                const fromStopId = route.stopsInOrder[i];
                const toStopId = route.stopsInOrder[i + 1];
                
                // Add travel time from 'from' stop to 'to' stop
                if (etas && etas[toStopId] && etas[toStopId].from && etas[toStopId].from[fromStopId]) {
                    totalSeconds += etas[toStopId].from[fromStopId];
                    etaCount++;
                }
                
                // Add wait time at the 'to' stop (except for the last stop)
                if (i < route.stopsInOrder.length - 2 && waits && waits[toStopId]) {
                    totalSeconds += waits[toStopId];
                    waitCount++;
                }
            }
            
            if (totalSeconds > 0) {
                const busMinutes = Math.ceil(totalSeconds / 60);
                totalMinutes += busMinutes;
                busTime = busMinutes;
                
            } else {
                // Fallback: use number of stops * NAV_FALLBACK_MIN_PER_STOP minutes when no ETA data
                const stopsToDestination = Math.abs(route.endIndex - route.startIndex);
                const estimatedMinutes = Math.ceil(stopsToDestination * NAV_FALLBACK_MIN_PER_STOP);
                totalMinutes += estimatedMinutes;
                busTime = estimatedMinutes;
                
            }
            
        } else if (route.stops && route.stops.length > 0) {
            // Fallback: calculate based on route stops array if stopsInOrder is not available
            const startIndex = route.startIndex || 0;
            const endIndex = route.endIndex || 0;
            const total = route.stops.length;
            const stopsToDestination = Math.abs(endIndex - startIndex);
            const circStopsBetween = total > 0 ? Math.min(stopsToDestination, total - stopsToDestination) : stopsToDestination;
            const estimatedMinutes = Math.ceil(circStopsBetween * NAV_FALLBACK_MIN_PER_STOP);
            totalMinutes += estimatedMinutes;
            busTime = estimatedMinutes;
            
            
        } else {
            // Final fallback: use route indices directly
            const stopsToDestination = Math.abs(route.endIndex - route.startIndex);
            const estimatedMinutes = Math.ceil(stopsToDestination * NAV_FALLBACK_MIN_PER_STOP);
            totalMinutes += estimatedMinutes;
            busTime = estimatedMinutes;
            
        }
        
        
        // Update the total travel time with the new calculation
        totalTravelTimeElement.html(`Total travel time: <strong>${totalMinutes}m</strong>`);
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
                        Walk ${startWalkDistance ? startWalkDistance.feet : 0} ft to boarding stop
                    </div>
                    <div class="walking-roads-list" id="start-walking-roads" style="margin-top: 0.75rem;">
                        <div class="roads-sequence" style="font-size: 1.2rem;">
                            <span style="color: var(--theme-color-lighter); font-weight: 500; animation: navPulse 1s ease-in-out infinite;">Loading road names...</span>
                        </div>
                    </div>
                </div>
            `;
        } else if (waypoint.isBoarding) {
            let innerStopsListHtml = '';
            if (route.stopsInOrder && route.stopsInOrder.length > 0) {
                innerStopsListHtml = `
                    <div class="bus-stops-list" style="margin-top: 0.75rem; padding: 0.5rem; background-color: var(--theme-stops-list-bg); border-radius: 0.25rem;">
                        <div class="stops-sequence" style="font-size: 1.2rem;">
                            ${route.stopsInOrder.map(stop =>
                                `<span style="color: var(--theme-stops-list-text); ${stop.id === startStop.id || stop.id === endStop.id ? 'font-weight: bold;' : ''}">
                                    ${stop.name}${stop.id === startStop.id ? ' (board)' : stop.id === endStop.id ? ' (get off)' : ''}
                                </span>`
                            ).join(' → ')}
                        </div>
                    </div>
                `;
            }

            content = `
                <div class="waypoint-details">
                    <div class="stops-info">
                        Take bus <strong>${formatRouteLabelColored(route.name)}</strong> for ${Math.max(0, (route.stopsInOrder ? route.stopsInOrder.length : route.totalStops) - 1)} ${getStopCountText(route)}
                    </div>
                    ${innerStopsListHtml}
                </div>
            `;
        } else if (waypoint.isAlighting) {
            content = `
                <div class="waypoint-details">
                    ${endWalkDistance ? `<div class="walking-info">Walk ${endWalkDistance.feet} ft to final destination</div>` : ''}
                    ${endWalkDistance ? `
                        <div class="walking-roads-list" id="end-walking-roads" style="margin-top: 0.75rem;">
                            <div class="roads-sequence" style="font-size: 1.2rem;">
                                <span style="color: var(--theme-color-lighter); font-weight: 500; animation: navPulse 1s ease-in-out infinite;">Loading road names...</span>
                            </div>
                        </div>
                    ` : ''}
                </div>
            `;
        }

        // Determine emoji based on waypoint type and context
        let travelEmoji = '';
        let walkingTime = '';
        let busTime = '';
        if (waypoint.type === 'building' && index === 0) {
            // Start building - walking to first stop
            travelEmoji = '🚶';
            if (startWalkDistance) {
                const timeMinutes = Math.ceil(startWalkDistance.feet / 220); // 220 ft/min = ~3 mph
                walkingTime = `<div style="font-size: 1rem; color: var(--theme-color); text-align: center; margin-top: 0.2rem;">${timeMinutes}m</div>`;
            }
        } else if (waypoint.isBoarding) {
            // Boarding stop - about to ride bus
            travelEmoji = '🚌';
            // Calculate bus travel time using average etas and waits
            let totalSeconds = 0;
            const routeStops = route.stopsInOrder || [];
            
            if (routeStops.length > 1) {
                // Sum up travel times between consecutive stops
                for (let i = 0; i < routeStops.length - 1; i++) {
                    const fromStopId = routeStops[i];
                    const toStopId = routeStops[i + 1];
                    
                    // Add travel time from 'from' stop to 'to' stop
                    if (etas && etas[toStopId] && etas[toStopId].from && etas[toStopId].from[fromStopId]) {
                        totalSeconds += etas[toStopId].from[fromStopId];
                    }
                    
                    // Add wait time at the 'to' stop (except for the last stop)
                    if (i < routeStops.length - 2 && waits && waits[toStopId]) {
                        totalSeconds += waits[toStopId];
                    }
                }
            }
            
            if (totalSeconds > 0) {
                const timeMinutes = Math.ceil(totalSeconds / 60);
                busTime = `<div style="font-size: 1rem; color: var(--theme-color); text-align: center; margin-top: 0.2rem;">${timeMinutes}m</div>`;
            } else {
                // Fallback to estimated time if no average data available
                const stopsToDestination = Math.abs(route.endIndex - route.startIndex);
                const estimatedMinutes = Math.ceil(stopsToDestination * NAV_FALLBACK_MIN_PER_STOP);
                busTime = `<div style="font-size: 1rem; color: var(--theme-color); text-align: center; margin-top: 0.2rem;">${estimatedMinutes}m</div>`;
            }
        } else if (index === timelineWaypoints.length - 1) {
            // Final destination - no travel needed
            travelEmoji = '🏁';
        } else if (waypoint.isAlighting) {
            // Alighting stop - about to walk to destination
            travelEmoji = '🚶';
            if (endWalkDistance) {
                const timeMinutes = Math.ceil(endWalkDistance.feet / 220); // 220 ft/min = ~3 mph
                walkingTime = `<div style="font-size: 1rem; color: var(--theme-color); text-align: center; margin-top: 0.2rem;">${timeMinutes}m</div>`;
            }
        }

        return `
            <div class="waypoint-row ${waypoint.type}-row ${waypoint.isBoarding ? 'boarding' : ''} ${waypoint.isAlighting ? 'alighting' : ''}" data-waypoint-index="${index}">
                <div class="waypoint-emoji" style="font-size: 1.5rem; margin-right: 0.75rem; display: flex; flex-direction: column; align-items: center; justify-content: center; width: 2rem;">
                    ${travelEmoji}
                    ${walkingTime || busTime}
                </div>
                <div class="waypoint-circle ${waypoint.type}-circle ${waypoint.isBoarding ? 'boarding-circle' : ''} ${waypoint.isAlighting ? 'alighting-circle' : ''}"></div>
                <div class="waypoint-content" style="margin-left: 0.75rem;">
                    <div class="waypoint-header">
                        <h4 class="waypoint-title clickable-waypoint" data-waypoint-type="${waypoint.type}" data-waypoint-name="${waypoint.name}" data-is-boarding="${waypoint.isBoarding || false}" data-is-alighting="${waypoint.isAlighting || false}" style="cursor: pointer; user-select: none;">${waypoint.name} <i class="fa-duotone fa-solid fa-right" style="--fa-primary-color: var(--theme-link); --fa-secondary-color: color-mix(in srgb, var(--theme-link) 70%, white);"></i></h4>
                        ${waypoint.description ? `<div class="waypoint-description">${waypoint.description}</div>` : ''}
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
            <div class="bus-stops-list" style="margin-top: 0.75rem; padding: 0.5rem; background-color: var(--theme-stops-list-bg); border-radius: 0.25rem;">
                <div class="stops-sequence" style="font-size: 1.2rem;">
                    ${route.stopsInOrder.map(stop =>
                        `<span style="color: var(--theme-stops-list-text); ${stop.id === startStop.id || stop.id === endStop.id ? 'font-weight: bold;' : ''}">
                            ${stop.name}${stop.id === startStop.id ? ' (board)' : stop.id === endStop.id ? ' (get off)' : ''}
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
                    Take bus ${formatRouteLabelColored(route.name)} for ${Math.max(0, (route.stopsInOrder ? route.stopsInOrder.length : route.totalStops) - 1)} ${getStopCountText(route)}
                </div>
                ${stopsListHtml}
            </div>
        </div>
    `;

    // Update the bus segment
    $('.bus-segment').replaceWith(updatedBusHtml);

    // Load road names for walking segments when route is updated
    loadWalkingRoadNames(startBuilding, endBuilding, startStop, endStop, startIsStop, endIsStop);


    // showNavigationMessage(`Switched to ${formatRouteLabel(route.name)} route`);
}

// Clear the current route display
function clearRouteDisplay() {
    $('.nav-directions-wrapper').removeClass('flex').addClass('none').empty();
    showNavigationMessage('Route cleared');
}

// Fully close and clear navigation UI and state
function closeNavigation() {
    try {
        // Clear route UI
        $('.nav-directions-wrapper').removeClass('flex').addClass('none').empty();
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
        // Hide autocomplete and messages
        hideNavigationAutocomplete();
        $('.nav-message').hide();
        // Fade out wrapper
        $('.navigate-wrapper').fadeOut(200);
    } catch (e) {
        console.error('Error closing navigation:', e);
        $('.navigate-wrapper').fadeOut(200);
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
            
            // Hide autocomplete dropdowns and search wrapper
            hideNavigationAutocomplete();
            $('.search-wrapper').hide();
            
            // Calculate and display the route
            setTimeout(() => {
                calculateRoute(example.startName, example.endName);
            }, 100);
        });
        
        $examplesContainer.append($exampleItem);
    });
    
    // Convert FontAwesome icons to custom icons
    replaceFontAwesomeIcons();
}