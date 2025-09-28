// Parking dropdown functionality
let dropdownOpen = false;

// Parking time scroll functionality
let parkingTimeScrollUserInteracted = false;

// Track selected day type
let selectedDayType = null;

// Parking lot data and map features
let parkingLotData = null;
let currentParkingFeatures = [];
let currentSelectedTime = null;

// Pre-computed parking schedule: [dayType][hour] -> [lotNames]
let parkingSchedule = {
    weekday: {},
    weekend: {}
};

// Pre-computed parking lot groups: [groupKey] -> [layerObjects]
let parkingLotGroups = {};

// Map from time/day to group key: [dayType][hour] -> groupKey
let timeToGroupMap = {
    weekday: {},
    weekend: {}
};

// Cached height for the time scroll container
let parkingContainerHeight = null;

// Function to fit map to currently visible parking lots
function fitMapToParkingLots() {
    if (!currentParkingFeatures || currentParkingFeatures.length === 0) {
        // No parking lots visible, fall back to campus bounds
        fitMapToCampusBounds();
        return;
    }
    
    // Collect bounds from all visible parking lot features
    const bounds = L.latLngBounds();
    let hasValidBounds = false;
    
    currentParkingFeatures.forEach(feature => {
        if (feature && feature.getBounds) {
            const featureBounds = feature.getBounds();
            if (featureBounds && featureBounds.isValid()) {
                bounds.extend(featureBounds);
                hasValidBounds = true;
            }
        }
    });
    
    // Fit map to parking lot bounds if we have valid bounds
    if (hasValidBounds) {
        map.fitBounds(bounds, {
            padding: [20, 20], // Add some padding around the bounds
            maxZoom: 18 // Don't zoom in too close
        });
    } else {
        // No valid bounds from parking lots, fall back to campus bounds
        fitMapToCampusBounds();
    }
}

// Function to fit map to campus bounds
function fitMapToCampusBounds() {
    // Get the current campus bounds (same logic as regular panout)
    if (typeof bounds !== 'undefined' && bounds[selectedCampus]) {
        map.fitBounds(bounds[selectedCampus]);
    } else {
        // Fallback to polyline bounds if campus bounds not available
        if (typeof polylineBounds !== 'undefined') {
            map.fitBounds(polylineBounds);
        }
    }
}

// Function to update the parking lot count display
function updateParkingLotCount() {
    const count = currentParkingFeatures.length;
    
    // Update the count display
    $('.parking-lot-count').text(`${count} lot${count !== 1 ? 's' : ''}`);
}


$(document).ready(function() {

    // Handle parking add button click
    $('.parking-add-btn').click(function(e) {
        e.stopPropagation();
        toggleParkingDropdown();
    });

    // Handle campus option selection (using event delegation for dynamically added elements)
    $('.parking-campus-dropdown').on('click', '.parking-campus-option', function(e) {
        e.stopPropagation();
        const selectedParkingCampus = $(this).data('campus');
        if (selectedParkingCampus === 'off') {
            resetParkingSelection();
        } else {
            selectParkingCampus(selectedParkingCampus);
        }
        closeParkingDropdown();
    });

    // Close dropdown when clicking outside
    $(document).click(function(e) {
        if (dropdownOpen && !$(e.target).closest('.parking-add-container').length) {
            closeParkingDropdown();
        }
    });

    // Prevent dropdown from closing when clicking inside it
    $('.parking-campus-dropdown').click(function(e) {
        e.stopPropagation();
    });
});

function toggleParkingDropdown() {
    const dropdown = $('.parking-campus-dropdown');
    if (dropdown.hasClass('none')) {
        showParkingDropdown();
    } else {
        closeParkingDropdown();
    }
}

function showParkingDropdown() {
    $('.parking-campus-dropdown').removeClass('none');
    $('.parking-add-btn').addClass('selected');
    
    // Check if a campus is already selected
    const selectedCampus = $('.parking-campus-option.selected').data('campus');
    if (selectedCampus) {
        // Add "Off" option if campus is selected
        addOffOption();
    } else {
        // Remove "Off" option if no campus selected
        removeOffOption();
    }
    
    // Update button text and icon
    $('.parking-add-btn .mr-0p5rem').text('Close');
    $('.parking-add-btn .text-1p3rem').show();
    $('.parking-add-btn .fa-plus').removeClass('fa-plus').addClass('fa-chevron-up');
    
    dropdownOpen = true;
    
    // Track analytics event
    sa_event('btn_press', {
        'btn': 'parking_add_dropdown',
        'action': 'show'
    });
}

function closeParkingDropdown() {
    $('.parking-campus-dropdown').addClass('none');
    $('.parking-add-btn').removeClass('selected');
    
    // Only reset button text if no campus is selected
    const selectedCampus = $('.parking-campus-option.selected').data('campus');
    if (selectedCampus) {
        // Keep the campus name, hide the plus icon
        $('.parking-add-btn .mr-0p5rem').text(selectedCampus);
        $('.parking-add-btn .text-1p3rem').hide();
    } else {
        // No campus selected, reset to default
        $('.parking-add-btn .mr-0p5rem').text('Add');
        $('.parking-add-btn .text-1p3rem').show();
    }
    
    // Reset icon
    $('.parking-add-btn .fa-chevron-up').removeClass('fa-chevron-up').addClass('fa-plus');
    
    dropdownOpen = false;
}

function selectParkingCampus(parkingCampus) {
    // Remove previous selection
    $('.parking-campus-option').removeClass('selected');
    
    // Add selection to clicked option
    $(`.parking-campus-option[data-campus="${parkingCampus}"]`).addClass('selected');
    
    // Update button text to show selected campus
    $('.parking-add-btn .mr-0p5rem').text(parkingCampus);
    
    // Save to settings
    settings['parking-campus'] = parkingCampus;
    localStorage.setItem('settings', JSON.stringify(settings));
    
    // Track analytics event
    sa_event('btn_press', {
        'btn': 'parking_campus_select',
        'campus': parkingCampus
    });
    
    // Here you can add the actual parking permit logic
    console.log(`Selected parking campus: ${parkingCampus}`);
    
    // You could add a toast notification or other feedback here
    // For now, we'll just log the selection
}

function addOffOption() {
    // Check if "Off" option already exists
    if ($('.parking-campus-option[data-campus="off"]').length === 0) {
        $('.parking-campus-dropdown').append('<div class="parking-campus-option" data-campus="off">Off</div>');
    }
}

function removeOffOption() {
    $('.parking-campus-option[data-campus="off"]').remove();
}

function resetParkingSelection() {
    // Remove all selections
    $('.parking-campus-option').removeClass('selected');

    // Reset button text and icon
    $('.parking-add-btn .mr-0p5rem').text('Add');
    $('.parking-add-btn .text-1p3rem').show();

    // Remove parking campus route selector
    $('.parking-campus-selector').remove();

    // Save to settings
    settings['parking-campus'] = false;
    localStorage.setItem('settings', JSON.stringify(settings));

    // Track analytics event
    sa_event('btn_press', {
        'btn': 'parking_campus_reset',
        'action': 'reset'
    });

    console.log('Parking selection reset');
}

// Parking time scroll functions
function initializeParkingTimeScroll() {
    const ticksContainer = $('.time-ticks-container');
    const currentTime = new Date();
    const currentHour = currentTime.getHours();

    // Clear existing ticks
    ticksContainer.empty();

    // Generate 24 hours of ticks (from 12 AM to 11 PM)
    for (let hour = 0; hour < 24; hour++) {
        const isCurrentHour = hour === currentHour;
        const tickDiv = $('<div>')
            .addClass('time-tick')
            .addClass(isCurrentHour ? 'hour-tick' : '')
            .attr('data-hour', hour);

        // Add the tick line
        tickDiv.append($('<div>')
            .addClass('time-tick-line')
            .css('border-left-color', isCurrentHour ? '#dc2626' : 'var(--theme-color-lighter)'));

        // Format time display (12-hour format)
        const displayHour = hour === 0 ? '12 AM' :
                           hour < 12 ? `${hour} AM` :
                           hour === 12 ? '12 PM' :
                           `${hour - 12} PM`;

        // Add label
        tickDiv.append($('<div>')
            .addClass('time-tick-label')
            .text(displayHour)
            .css('color', isCurrentHour ? '#dc2626' : 'var(--theme-color)'));
        ticksContainer.append(tickDiv);
    }

    const extraTickDiv = $('<div>')
        .addClass('time-tick')
        .attr('data-hour', 24)
        .css('width', '1px');

    extraTickDiv.append($('<div>')
        .addClass('time-tick-line')
        .css('border-left', '2px solid var(--theme-color-lighter)')
        .css('border-right', 'none'));

    extraTickDiv.append($('<div>')
        .addClass('time-tick-label')
        .text('12 AM')
        .css('color', 'var(--theme-color)'));

    ticksContainer.append(extraTickDiv);

    // Set current time label
    updateParkingCurrentTimeLabel();

    // Adjust container height to fit labels after they're rendered
    setTimeout(() => {
        adjustParkingContainerForLabels();
        // Scroll to current time after container is adjusted
        scrollParkingToCurrentTime();
    }, 0);

    // Initialize scrolling functionality
    initializeParkingTimeScrollInteractions();
}

function initializeParkingTimeScrollInteractions() {
    const container = $('.time-ticks-container');
    const scrollContainer = $('.parking-time-scroll');
    let isDragging = false;
    let startX = 0;
    let scrollLeft = 0;

    // Mouse events
    container.on('mousedown', function(e) {
        isDragging = true;
        parkingTimeScrollUserInteracted = true; // User started manual interaction
        startX = e.pageX - scrollContainer.offset().left;
        scrollLeft = scrollContainer.scrollLeft();
        container.css('cursor', 'grabbing');
        e.preventDefault();
    });

    $(document).on('mousemove.time-scroll', function(e) {
        if (!isDragging) return;
        e.preventDefault();
        const x = e.pageX - scrollContainer.offset().left;
        const walk = x - startX; // Direct 1:1 movement
        scrollContainer.scrollLeft(scrollLeft - walk);
        updateParkingTimeLabelFromScroll();
    });

    $(document).on('mouseup.time-scroll', function() {
        isDragging = false;
        container.css('cursor', 'grab');
    });

    // Touch events for mobile
    container.on('touchstart', function(e) {
        isDragging = true;
        parkingTimeScrollUserInteracted = true; // User started manual interaction
        const touch = e.touches[0];
        startX = touch.pageX - scrollContainer.offset().left;
        scrollLeft = scrollContainer.scrollLeft();
    });

    $(document).on('touchmove.time-scroll', function(e) {
        if (!isDragging) return;
        e.preventDefault();
        const touch = e.touches[0];
        const x = touch.pageX - scrollContainer.offset().left;
        const walk = x - startX; // Direct 1:1 movement
        scrollContainer.scrollLeft(scrollLeft - walk);
        updateParkingTimeLabelFromScroll();
    });

    $(document).on('touchend.time-scroll', function() {
        isDragging = false;
    });

    // Update current time every minute
    setInterval(updateParkingCurrentTimeLabel, 60000);
    
    // Add scroll event listener for wheel scrolling
    scrollContainer.on('scroll', function() {
        if (!parkingTimeScrollUserInteracted) {
            parkingTimeScrollUserInteracted = true; // User scrolled with wheel/mouse
        }
        updateParkingTimeLabelFromScroll();
    });
}

function adjustParkingContainerForLabels() {
    // Use cached height if available
    if (parkingContainerHeight !== null) {
        const container = $('.time-ticks-container');
        const scrollContainer = $('.parking-time-scroll');
        container.css('height', parkingContainerHeight + 'px');
        scrollContainer.css('height', parkingContainerHeight + 'px');
        return;
    }

    // Find the first label to measure its height
    const firstLabel = $('.time-tick-label').first();
    if (firstLabel.length === 0) return;

    // Get the actual rendered height of the label
    const labelHeight = firstLabel.outerHeight();
    if (labelHeight === 0) return;

    // Get current container height
    const container = $('.time-ticks-container');
    const currentHeight = container.height();

    // Calculate new height needed (container height + label height + some padding)
    const padding = 4; // Small padding for visual spacing
    const newHeight = currentHeight + labelHeight + padding;

    // Cache the height for future use
    parkingContainerHeight = newHeight;

    // Update container height
    container.css('height', newHeight + 'px');

    // Update parent container height to match
    const scrollContainer = $('.parking-time-scroll');
    scrollContainer.css('height', newHeight + 'px');
}

function updateParkingCurrentTimeLabel() {
    // Only update if user hasn't manually interacted with the time scroll
    if (parkingTimeScrollUserInteracted) {
        return; // Don't update - user has manually selected a time
    }

    const currentTime = new Date();
    const hours = currentTime.getHours();
    const minutes = currentTime.getMinutes();

    // Format current time (HH:MM AM/PM)
    const displayHour = hours === 0 ? 12 :
                       hours <= 12 ? hours :
                       hours - 12;
    const ampm = hours < 12 ? 'AM' : 'PM';
    const displayMinutes = minutes.toString().padStart(2, '0');
    const timeString = `${displayHour}:${displayMinutes} ${ampm}`;

    $('.current-time-label').text(timeString);
}

function getParkingTimeScrollMetrics() {
    const ticksContainer = $('.time-ticks-container');
    const firstTick = ticksContainer.find('.time-tick').first();

    const tickWidth = firstTick.outerWidth(true);
    const computedStyle = window.getComputedStyle(ticksContainer[0]);
    const paddingLeft = parseFloat(computedStyle.paddingLeft);
    const paddingRight = parseFloat(computedStyle.paddingRight);

    return {
        tickWidth,
        paddingLeft,
        paddingRight
    };
}

function updateParkingTimeLabelFromScroll() {
    const scrollContainer = $('.parking-time-scroll');
    const metrics = getParkingTimeScrollMetrics();
    const { tickWidth, paddingLeft } = metrics;

    const scrollLeft = scrollContainer.scrollLeft();
    const containerWidth = scrollContainer.width();
    const centerPosition = containerWidth / 2;

    const relativePosition = scrollLeft + centerPosition - paddingLeft;
    const exactHourIndex = relativePosition / tickWidth;
    const clampedHourIndex = Math.max(0, Math.min(24, exactHourIndex));

    const hour = Math.floor(clampedHourIndex);
    const minuteFraction = clampedHourIndex - hour;
    let minutes = Math.round(minuteFraction * 60);

    let finalHour = hour;
    if (minutes === 60) {
        finalHour = hour + 1;
        minutes = 0;
    }
    if (finalHour > 24) {
        finalHour = 24;
        minutes = 0;
    }

    // Handle the 12 AM boundary tick (hour 24)
    if (finalHour === 24) {
        const timeString = `12:00 AM`;
        $('.current-time-label').text(timeString);
        return;
    }

    const displayHour = finalHour === 0 ? 12 :
                       finalHour <= 12 ? finalHour :
                       finalHour - 12;
    const ampm = finalHour < 12 ? 'AM' : 'PM';
    const timeString = `${displayHour}:${minutes.toString().padStart(2, '0')} ${ampm}`;

    $('.current-time-label').text(timeString);

    // Update parking lots display for the new time (only if crossing boundaries)
    if (selectedDayType) {
        const currentGroup = getParkingBoundaryGroup(finalHour, selectedDayType);
        const previousGroup = window.lastParkingGroup || -1;
        
        // Only update if we've crossed a boundary
        if (currentGroup !== previousGroup) {
            window.lastParkingGroup = currentGroup;
            updateParkingLotsForTime(finalHour, selectedDayType);
            updateParkingLotCount();
            
            // Clear panout feedback since bounds have changed
            clearPanoutFeedback();
        }
    }
}

function scrollParkingToCurrentTime() {
    const scrollContainer = $('.parking-time-scroll');
    const metrics = getParkingTimeScrollMetrics();
    const { tickWidth, paddingLeft } = metrics;
    const currentTime = new Date();
    const currentHour = currentTime.getHours();
    const currentMinutes = currentTime.getMinutes();

    const exactHourIndex = currentHour + (currentMinutes / 60);

    const containerWidth = scrollContainer.width();
    const centerPosition = containerWidth / 2;

    // We have 25 ticks (0-24), so the maximum hour index is 24 (12 AM boundary)
    const clampedHourIndex = Math.min(24, exactHourIndex);
    const tickPosition = paddingLeft + (clampedHourIndex * tickWidth);
    const targetScrollLeft = tickPosition - centerPosition;

    const scrollableWidth = scrollContainer[0].scrollWidth;
    const maxScrollLeft = scrollableWidth - containerWidth;
    const clampedScrollLeft = Math.max(0, Math.min(maxScrollLeft, targetScrollLeft));

    scrollContainer.scrollLeft(clampedScrollLeft);
}

// Parking permit mode functions
function enterParkingPermitMode(parkingCampus) {
    // Add parking permit mode class to body
    $('body').addClass('parking-permit-mode');

    // Hide all buses and routes from map
    hideAllBusesFromMap();
    hideAllPolylinesFromMap();

    // Disable buildings layer if it exists
    if (window.buildingsLayer) {
        map.removeLayer(window.buildingsLayer);
    }

    // Reset user interaction flag for fresh start
    parkingTimeScrollUserInteracted = false;

    // Load parking data and buildings data
    Promise.all([
        loadParkingLotData(),
        loadBuildings()
    ]).then(() => {
        // Pre-compute parking lot groups now that spatial index is ready
        precomputeParkingLotGroups();
        
        initializeParkingTimeScroll();

        // Show parking permit popup after time scroll is ready
        $('.parking-permit-popup').removeClass('none').show();

        // Show initial parking lots for current time
        const currentHour = new Date().getHours();

        if (selectedDayType) {
            updateParkingLotsForTime(currentHour, selectedDayType);
            updateParkingLotCount();
        }
    });

    // Auto-select appropriate day type based on current day
    selectParkingDayType();

    // Add click handlers for day type buttons
    $('.parking-day-type [data-day-type]').click(function() {
        const dayType = $(this).data('day-type');
        selectParkingDayType(dayType); // Manual selection
    });

    // Track analytics
    sa_event('btn_press', {
        'btn': 'parking_permit_mode_enter',
        'campus': parkingCampus
    });
}

function exitParkingPermitMode() {
    // Remove parking permit mode class from body
    $('body').removeClass('parking-permit-mode');

    // Remove selection styling from parking campus selector
    $('.parking-campus-selector').css('box-shadow', '');

    // Clean up time scroll event handlers
    $(document).off('.time-scroll');
    $('.time-ticks-container').off('mousedown touchstart');

    // Clear parking lot features from map
    clearParkingFeatures();

    // Show all buses and routes back on map
    showAllBusesFromMap();
    showAllPolylinesFromMap();

    // Re-enable buildings layer if it was enabled
    if (settings['toggle-show-buildings'] && window.buildingsLayer) {
        window.buildingsLayer.addTo(map);
    }

    // Hide parking permit popup
    $('.parking-permit-popup').addClass('none').hide();

    // Track analytics
    sa_event('btn_press', {
        'btn': 'parking_permit_mode_exit'
    });
}

// Load parking lot data from JSON file
async function loadParkingLotData() {
    if (parkingLotData) {
        return parkingLotData; // Already loaded
    }

    try {
        const response = await fetch('lib/parking/busch_commuter_normalized.json');
        parkingLotData = await response.json();

        // Pre-compute parking schedule for all hours
        precomputeParkingSchedule();

        return parkingLotData;
    } catch (error) {
        console.error('Failed to load parking data:', error);
        return null;
    }
}

function precomputeParkingSchedule() {
    if (!parkingLotData) return;
    
    // Clear existing data
    parkingSchedule.weekday = {};
    parkingSchedule.weekend = {};
    timeToGroupMap.weekday = {};
    timeToGroupMap.weekend = {};
    
    // Collect all unique lot combinations
    const uniqueLotCombinations = new Map();
    
    // Pre-compute for all 24 hours and collect unique combinations
    for (let hour = 0; hour < 24; hour++) {
        const weekdayLots = getAllowedParkingLots(hour, 'weekday');
        const weekendLots = getAllowedParkingLots(hour, 'weekend');
        
        parkingSchedule.weekday[hour] = weekdayLots;
        parkingSchedule.weekend[hour] = weekendLots;
        
        // Create group keys for unique combinations
        const weekdayKey = createGroupKey(weekdayLots);
        const weekendKey = createGroupKey(weekendLots);
        
        timeToGroupMap.weekday[hour] = weekdayKey;
        timeToGroupMap.weekend[hour] = weekendKey;
        
        // Store unique combinations
        if (weekdayLots.length > 0) {
            uniqueLotCombinations.set(weekdayKey, weekdayLots);
        }
        if (weekendLots.length > 0) {
            uniqueLotCombinations.set(weekendKey, weekendLots);
        }
    }
    
    
    // Store unique combinations for later group creation
    window.parkingUniqueCombinations = uniqueLotCombinations;
}

function precomputeParkingLotGroups() {
    if (!window.parkingUniqueCombinations || !window.buildingSpatialIndex) {
        console.log('Spatial index or unique combinations not ready yet');
        return;
    }
    
    // Clear existing groups
    parkingLotGroups = {};
    
    // Pre-compute all parking lot groups
    for (const [groupKey, lotNames] of window.parkingUniqueCombinations) {
        parkingLotGroups[groupKey] = findParkingLotsForGroup(lotNames);
        console.log(`Group "${groupKey}": ${parkingLotGroups[groupKey].length} layers found`);
    }
    
    console.log('Total unique groups:', Object.keys(parkingLotGroups).length);
    console.log('Sample groups:', Object.keys(parkingLotGroups).slice(0, 3));
}

function createGroupKey(lotNames) {
    return lotNames.sort().join(',');
}

function findParkingLotsForGroup(lotNames) {
    const layers = [];
    
    if (!window.buildingSpatialIndex) {
        return layers;
    }
    
    lotNames.forEach(lotName => {
        const layer = window.buildingSpatialIndex.getBuildingLayerByName(lotName.toLowerCase());
        if (layer) {
            // Style the layer as a red parking lot
            if (layer.setStyle) {
                layer.setStyle({
                    fillColor: '#ff0000',
                    color: '#ff0000',
                    weight: 2,
                    opacity: 0.8,
                    fillOpacity: 0.3
                });
            }
            layers.push(layer);
        }
    });
    
    return layers;
}

// Get allowed parking lots for a specific time and day type
function getAllowedParkingLots(hour, dayType) {
    if (!parkingLotData) {
        return [];
    }

    if (!parkingLotData[dayType]) {
        return [];
    }

    if (!parkingLotData[dayType][hour]) {
        return [];
    }

    return parkingLotData[dayType][hour];
}

// Show parking lots on map using pre-computed groups
function showParkingLotsOnMap(lotNames) {
    // Clear existing parking features
    clearParkingFeatures();

    if (!lotNames || lotNames.length === 0) {
        return;
    }

    // Get the group key for this lot combination
    const groupKey = createGroupKey(lotNames);
    const groupLayers = parkingLotGroups[groupKey];

    if (!groupLayers) {
        return;
    }

    // Show all layers in this group
    groupLayers.forEach(layer => {
        if (layer && typeof layer.addTo === 'function') {
            layer.addTo(map);
            currentParkingFeatures.push(layer);
        }
    });
}

// Helper function to find building features by name using existing spatial index
function findBuildingFeaturesByName(targetName) {
    const matchingFeatures = [];

    // Use existing buildingSpatialIndex for O(1) lookup
    if (window.buildingSpatialIndex) {
        // Try lowercase lookup first (since parking data uses lowercase)
        const layer = window.buildingSpatialIndex.getBuildingLayerByName(targetName.toLowerCase());
        
        if (layer) {
            matchingFeatures.push(layer);
        }
    }

    return matchingFeatures;
}

// Clear parking features from map
function clearParkingFeatures() {
    currentParkingFeatures.forEach(feature => {
        if (feature && typeof feature.remove === 'function') {
            map.removeLayer(feature);
        }
    });
    currentParkingFeatures = [];
}

// Define parking lot change boundaries
const PARKING_BOUNDARIES = {
    weekday: [0, 6, 17],  // Changes at 0, 6, 17
    weekend: [0, 6]       // Changes at 0, 6
};

function getParkingBoundaryGroup(hour, dayType) {
    const boundaries = PARKING_BOUNDARIES[dayType];
    
    // Find which boundary group this hour belongs to
    for (let i = boundaries.length - 1; i >= 0; i--) {
        if (hour >= boundaries[i]) {
            return i;
        }
    }
    return 0; // Default to first group
}

// Update parking lots display based on selected time
function updateParkingLotsForTime(hour, dayType) {
    // Only update if the time has changed
    const currentTimeString = `${dayType}-${hour}`;

    if (currentTimeString === currentSelectedTime) {
        return; // No change needed
    }

    currentSelectedTime = currentTimeString;

    // Get the group key for this time/day combination
    const groupKey = timeToGroupMap[dayType] && timeToGroupMap[dayType][hour];
    
    if (!groupKey) {
        // No parking lots for this time
        clearParkingFeatures();
        return;
    }

    // Get the pre-computed group layers
    const groupLayers = parkingLotGroups[groupKey];
    
    if (!groupLayers) {
        clearParkingFeatures();
        return;
    }

    // Clear existing and show new group
    clearParkingFeatures();
    
    groupLayers.forEach(layer => {
        if (layer && typeof layer.addTo === 'function') {
            layer.addTo(map);
            currentParkingFeatures.push(layer);
        }
    });
}

function selectParkingDayType(dayType = null) {
    // If no dayType provided, auto-select based on current day
    if (!dayType) {
        const now = new Date();
        const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday

        // Determine if it's a weekday (Monday-Friday) or weekend (Saturday-Sunday)
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        dayType = isWeekend ? 'weekend' : 'weekday';
    }

    // Store the selected day type
    selectedDayType = dayType;

    // Remove selected class from all day type buttons
    $('.parking-day-type [data-day-type]').removeClass('selected');

    // Add selected class to the appropriate button
    $(`.parking-day-type [data-day-type="${dayType}"]`).addClass('selected');

    // Update parking lots for the new day type (if we have a current time)
    if (currentSelectedTime) {
        const currentHour = parseInt(currentSelectedTime.split('-')[1]);
        updateParkingLotsForTime(currentHour, dayType);
        updateParkingLotCount();
        
        // Clear panout feedback since bounds have changed
        clearPanoutFeedback();
    }

    // Track analytics
    const selectionMethod = arguments.length > 0 ? 'manual' : 'auto';
    sa_event('btn_press', {
        'btn': 'parking_day_type_select',
        'day_type': dayType,
        'selection_method': selectionMethod
    });
}
