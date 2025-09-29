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
let currentParkingLotNames = []; // Store current lot names for count function

// Pre-computed parking schedule: [dayType][campus][hour] -> [lotNames]
let parkingSchedule = {
    weekday: {},
    weekend: {}
};

// Pre-computed parking lot groups: [groupKey] -> [layerObjects]
let parkingLotGroups = {};

// Map from time/day/campus to group key: [dayType][campus][hour] -> groupKey
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
    const count = currentParkingLotNames.length;
    
    // Update the count display
    $('.parking-lot-count')
        .text(`${count} lot${count !== 1 ? 's' : ''}`)
        .css('white-space', 'nowrap');
}

// Function to update the parking lot list display
function updateParkingLotList() {
    const listContainer = $('.parking-lot-list');
    
    // Set up horizontal scrolling styles
    listContainer.css({
        'display': 'flex',
        'overflow-x': 'auto',
        'overflow-y': 'hidden',
        'white-space': 'nowrap',
        'gap': '0.5rem',
        'max-width': '100%',
        'scrollbar-width': 'none', /* Firefox */
        '-ms-overflow-style': 'none' /* IE and Edge */
    });
    
    // Hide scrollbar for WebKit browsers (Chrome, Safari, Edge)
    if (listContainer[0]) {
        listContainer[0].style.setProperty('-webkit-scrollbar', 'none');
        // Add a style tag to hide scrollbar completely
        if (!document.getElementById('parking-list-scrollbar-hide')) {
            const style = document.createElement('style');
            style.id = 'parking-list-scrollbar-hide';
            style.textContent = `
                .parking-lot-list::-webkit-scrollbar {
                    display: none;
                }
            `;
            document.head.appendChild(style);
        }
    }
    
    // Clear existing list items
    listContainer.empty();
    
    if (!currentParkingFeatures || currentParkingFeatures.length === 0) {
        // No parking lots active, show empty list
        currentParkingLotNames = [];
        return;
    }
    
    // Get the current lot names from the selected time/campus
    let currentLotNames = [];
    if (currentSelectedTime && selectedDayType) {
        const timeParts = currentSelectedTime.split('-');
        const currentHour = parseInt(timeParts[1]);
        const currentCampus = timeParts[2] || settings['parking-campus'];
        
        try {
            currentLotNames = getAllowedParkingLots(currentHour, selectedDayType, currentCampus);
        } catch (error) {
            console.warn('Could not get current lot names:', error);
        }
    }
    
    // Store the lot names for the count function to use
    currentParkingLotNames = currentLotNames;
    
    // Sort lot names alphabetically for consistent display
    currentLotNames.sort();
    
    // Create list items for each active parking lot
    currentLotNames.forEach(lotName => {
        const listItem = $('<div>')
            .addClass('parking-lot-item')
            .addClass('text-1p2rem')
            .addClass('py-0p5rem')
            .addClass('px-1rem')
            .addClass('br-1rem')
            .css({
                'background-color': 'var(--theme-bg)',
                'color': 'var(--theme-color)',
                'flex-shrink': '0',
                'white-space': 'nowrap'
            })
            .text(lotName.replace('lot ', '').replace(' nb', ''));
        
        listContainer.append(listItem);
    });
    
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
    
    // Update parking permit route selector based on current campus setting
    const currentCampus = settings['parking-campus'] || 'off';
    updateParkingPermitRouteSelector(currentCampus);
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

    // If we're in parking permit mode, update the selectors
    if ($('body').hasClass('parking-permit-mode')) {
        updateParkingPermitRouteSelector(parkingCampus);

        // Get current time from the time scroll, not from currentSelectedTime
        let currentHour;
        if (parkingTimeScrollUserInteracted) {
            // User has manually scrolled, get the time from the scroll position
            const scrollContainer = $('.parking-time-scroll');
            const metrics = getParkingTimeScrollMetrics();
            const { tickWidth, paddingLeft } = metrics;
            const scrollLeft = scrollContainer.scrollLeft();
            const containerWidth = scrollContainer.width();
            const centerPosition = containerWidth / 2;
            const relativePosition = scrollLeft + centerPosition - paddingLeft;
            const exactHourIndex = relativePosition / tickWidth;
            currentHour = Math.floor(Math.max(0, Math.min(24, exactHourIndex)));
        } else {
            // Use current real time
            currentHour = new Date().getHours();
        }

        // Update parking lots for the new campus with current time
        updateParkingLotsForTime(currentHour, selectedDayType, parkingCampus);
        updateParkingLotCount();
        updateParkingLotList();
    }

    console.log(`Selected parking campus: ${parkingCampus}`);
}

function updateParkingPermitRouteSelector(parkingCampus) {
    if (parkingCampus === 'off') {
        // Remove all parking campus selectors when campus is off
        $('.parking-campus-selector').remove();
        return;
    }

    // Update the styling of all parking campus selectors - keep white background and black text
    $('.parking-campus-selector').css({
        'background-color': 'white',
        'color': 'black',
        'box-shadow': 'none'
    });

    // Highlight the selected campus with box-shadow only
    $(`.parking-campus-selector[routeName="parking-${parkingCampus}"]`).css({
        'box-shadow': '0 0 10px var(--theme-color)'
    });
}

// Add all parking campus route selectors
function addAllParkingCampusRouteSelectors(selectedCampus = null) {
    const campuses = ['Busch', 'Livingston', 'College Ave', 'Cook', 'Douglass'];
    const defaultCampus = selectedCampus || settings['parking-campus'];

    // Clear existing parking campus selectors
    $('.parking-campus-selector').remove();

    campuses.forEach((campus, index) => {
        const isSelected = (campus === defaultCampus);
        addParkingCampusRouteSelector(campus, isSelected, index === 0);
    });
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

    // Remove all parking campus route selectors
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
    let lastX = 0;
    let lastTime = 0;
    let velocity = 0;
    let momentumAnimation = null;

    // Mouse events
    container.on('mousedown', function(e) {
        isDragging = true;
        parkingTimeScrollUserInteracted = true; // User started manual interaction
        startX = e.pageX - scrollContainer.offset().left;
        scrollLeft = scrollContainer.scrollLeft();
        lastX = startX;
        lastTime = Date.now();
        velocity = 0;
        
        // Cancel any existing momentum animation
        if (momentumAnimation) {
            cancelAnimationFrame(momentumAnimation);
            momentumAnimation = null;
        }
        
        container.css('cursor', 'grabbing');
        e.preventDefault();
    });

    $(document).on('mousemove.time-scroll', function(e) {
        if (!isDragging) return;
        e.preventDefault();
        const x = e.pageX - scrollContainer.offset().left;
        const walk = x - startX; // Direct 1:1 movement
        scrollContainer.scrollLeft(scrollLeft - walk);
        
        // Track velocity for momentum
        const currentTime = Date.now();
        const deltaTime = currentTime - lastTime;
        if (deltaTime > 0) {
            velocity = (x - lastX) / deltaTime;
            lastX = x;
            lastTime = currentTime;
        }
        
        updateParkingTimeLabelFromScroll();
    });

    $(document).on('mouseup.time-scroll', function() {
        isDragging = false;
        container.css('cursor', 'grab');
        
        // Start momentum animation if there's velocity
        if (Math.abs(velocity) > 0.1) {
            startMomentumAnimation();
        }
    });

    // Touch events for mobile
    container.on('touchstart', function(e) {
        isDragging = true;
        parkingTimeScrollUserInteracted = true; // User started manual interaction
        const touch = e.touches[0];
        startX = touch.pageX - scrollContainer.offset().left;
        scrollLeft = scrollContainer.scrollLeft();
        lastX = startX;
        lastTime = Date.now();
        velocity = 0;
        
        // Cancel any existing momentum animation
        if (momentumAnimation) {
            cancelAnimationFrame(momentumAnimation);
            momentumAnimation = null;
        }
    });

    $(document).on('touchmove.time-scroll', function(e) {
        if (!isDragging) return;
        e.preventDefault();
        const touch = e.touches[0];
        const x = touch.pageX - scrollContainer.offset().left;
        const walk = x - startX; // Direct 1:1 movement
        scrollContainer.scrollLeft(scrollLeft - walk);
        
        // Track velocity for momentum
        const currentTime = Date.now();
        const deltaTime = currentTime - lastTime;
        if (deltaTime > 0) {
            velocity = (x - lastX) / deltaTime;
            lastX = x;
            lastTime = currentTime;
        }
        
        updateParkingTimeLabelFromScroll();
    });

    $(document).on('touchend.time-scroll', function() {
        isDragging = false;
        
        // Start momentum animation if there's velocity
        if (Math.abs(velocity) > 0.1) {
            startMomentumAnimation();
        }
    });
    
    // Momentum animation function
    function startMomentumAnimation() {
        const friction = 0.98; // Friction coefficient (0-1, closer to 1 = less friction)
        const minVelocity = 0.01; // Minimum velocity to continue animation
        
        function animate() {
            if (Math.abs(velocity) < minVelocity) {
                momentumAnimation = null;
                return;
            }
            
            // Apply velocity to scroll position (doubled for more distance)
            const currentScrollLeft = scrollContainer.scrollLeft();
            scrollContainer.scrollLeft(currentScrollLeft - (velocity * 7));
            
            // Update time label during momentum
            updateParkingTimeLabelFromScroll();
            
            // Apply friction
            velocity *= friction;
            
            // Continue animation
            momentumAnimation = requestAnimationFrame(animate);
        }
        
        momentumAnimation = requestAnimationFrame(animate);
    }

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
        const currentCampus = settings['parking-campus'];
        const currentGroup = getParkingBoundaryGroup(finalHour, selectedDayType);
        const previousGroup = window.lastParkingGroup || -1;

        // Only update if we've crossed a boundary
        if (currentGroup !== previousGroup) {
            window.lastParkingGroup = currentGroup;
            updateParkingLotsForTime(finalHour, selectedDayType, currentCampus);
            updateParkingLotCount();
            updateParkingLotList();

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
    // Use the provided campus or fall back to saved campus
    const selectedCampus = parkingCampus || settings['parking-campus'];

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

    // Add all parking campus route selectors with the selected campus highlighted
    addAllParkingCampusRouteSelectors(selectedCampus);

    // Load parking data and buildings data
    Promise.all([
        loadParkingLotData(),
        loadBuildings()
    ]).then(() => {
        // Pre-compute parking lot groups now that spatial index is ready
        precomputeParkingLotGroups();

        // Initialize time scroll after parking groups are computed
        initializeParkingTimeScroll();

        // Show parking permit popup after time scroll is ready
        $('.parking-permit-popup').removeClass('none').show();

        // Show initial parking lots for current time
        const currentHour = new Date().getHours();
        const selectedCampus = settings['parking-campus'];

        if (selectedDayType) {
            updateParkingLotsForTime(currentHour, selectedDayType, selectedCampus);
            updateParkingLotCount();
            // updateParkingLotList() is called by updateParkingLotsForTime()
        } else {
            // Initialize empty list if no day type selected yet
            updateParkingLotList();
        }
    });

    // Auto-select appropriate day type based on current day
    selectParkingDayType();

    // Add click handlers for day type buttons
    $('.parking-day-type [data-day-type]').on('click touchstart', function(e) {
        e.preventDefault();
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

    // Remove all parking campus selectors
    $('.parking-campus-selector').remove();

    // Clean up time scroll event handlers
    $(document).off('.time-scroll');
    $('.time-ticks-container').off('mousedown touchstart');

    // Clear parking lot features from map
    clearParkingFeatures();
    
    // Clear parking lot list display
    $('.parking-lot-list').empty();

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

// Load parking lot data from JSON files for all campuses
async function loadParkingLotData() {
    if (parkingLotData) {
        return parkingLotData; // Already loaded
    }

    // Load parking data for all campuses
    const campusFiles = {
        'Busch': 'lib/parking/busch_commuter.json',
        'College Ave': 'lib/parking/college_ave_commuter.json',
        'Cook': 'lib/parking/cook_commuter.json',
        'Douglass': 'lib/parking/douglass_commuter.json',
        'Livingston': 'lib/parking/livingston_commuter.json'
    };

    const allCampusData = {};

    for (const [campus, file] of Object.entries(campusFiles)) {
        const response = await fetch(file);
        const campusData = await response.json();
        allCampusData[campus] = campusData;
    }

    parkingLotData = allCampusData;

    // Pre-compute parking schedule for all hours and campuses
    precomputeParkingSchedule();

    return parkingLotData;
}

function precomputeParkingSchedule() {
    // Clear existing data
    parkingSchedule = { weekday: {}, weekend: {} };
    timeToGroupMap = { weekday: {}, weekend: {} };

    // Collect all unique lot combinations
    const uniqueLotCombinations = new Map();

    // Get all available campuses
    const campuses = Object.keys(parkingLotData);

    // Pre-compute for all 24 hours, campuses, and day types
    for (let hour = 0; hour < 24; hour++) {
        for (const dayType of ['weekday', 'weekend']) {
            timeToGroupMap[dayType] = timeToGroupMap[dayType] || {};
            parkingSchedule[dayType] = parkingSchedule[dayType] || {};

            campuses.forEach(campus => {
                parkingSchedule[dayType][campus] = parkingSchedule[dayType][campus] || {};
                timeToGroupMap[dayType][campus] = timeToGroupMap[dayType][campus] || {};

                const campusLots = getAllowedParkingLots(hour, dayType, campus);
                parkingSchedule[dayType][campus][hour] = campusLots;

                const groupKey = createGroupKey(campusLots);
                const campusGroupKey = campusLots.length > 0 ? `${campus}:${groupKey}` : '';
                timeToGroupMap[dayType][campus][hour] = campusGroupKey;

                if (campusLots.length > 0) {
                    uniqueLotCombinations.set(campusGroupKey, campusLots);
                }
            });
        }
    }

    // Store unique combinations for later group creation
    window.parkingUniqueCombinations = uniqueLotCombinations;
}

function precomputeParkingLotGroups() {
    if (!window.buildingSpatialIndex) {
        throw new Error('Building spatial index not available');
    }

    // Clear existing groups
    parkingLotGroups = {};

    // Pre-compute all parking lot groups
    for (const [comboKey, lotNames] of window.parkingUniqueCombinations) {
        const groupLayers = findParkingLotsForGroup(lotNames);
        if (groupLayers.length > 0) {
            parkingLotGroups[comboKey] = groupLayers;
            console.log(`Group "${comboKey}": ${groupLayers.length} layers found`);
        } else {
            console.log(`Group "${comboKey}": 0 layers found - SKIPPED (no building layers exist)`);
        }
    }

    console.log('Total unique groups:', Object.keys(parkingLotGroups).length);
    console.log('Sample groups:', Object.keys(parkingLotGroups).slice(0, 3));
}

function createGroupKey(lotNames) {
    return lotNames.sort().join(',');
}

function findParkingLotsForGroup(lotNames) {
    if (!window.buildingSpatialIndex) {
        throw new Error('Building spatial index not available');
    }

    const layers = [];

    lotNames.forEach(lotName => {
        // Debug: Check if this specific lot exists in spatial index
        if (lotName === 'lot 915/yellow lot') {
            console.log('DEBUG: Looking for lot 915/yellow lot');
            console.log('DEBUG: Spatial index has nameToLayer?', !!window.buildingSpatialIndex?.nameToLayer);
            console.log('DEBUG: Direct lookup (lowercase):', window.buildingSpatialIndex?.nameToLayer?.get('lot 915/yellow lot'));
            console.log('DEBUG: Direct lookup (original):', window.buildingSpatialIndex?.nameToLayer?.get('lot 915/yellow lot'));
            console.log('DEBUG: All keys in spatial index:', Array.from(window.buildingSpatialIndex?.nameToLayer?.keys() || []).filter(k => k.includes('915')));
        }

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

// Get allowed parking lots for a specific time, day type, and campus
function getAllowedParkingLots(hour, dayType, campus) {
    if (!parkingLotData) {
        throw new Error('Parking lot data not loaded');
    }

    if (!parkingLotData[campus]) {
        throw new Error(`No parking data found for campus: ${campus}`);
    }

    if (!parkingLotData[campus][dayType]) {
        throw new Error(`No ${dayType} data found for campus: ${campus}`);
    }

    if (!(hour in parkingLotData[campus][dayType])) {
        throw new Error(`No data found for ${dayType} ${hour}h on campus: ${campus}`);
    }

    return parkingLotData[campus][dayType][hour];
}

// Show parking lots on map using pre-computed groups
function showParkingLotsOnMap(lotNames) {
    // Clear existing parking features
    clearParkingFeatures();

    if (!lotNames || lotNames.length === 0) {
        return;
    }

    // Get the group key for this lot combination
    const campus = settings['parking-campus'];
    const groupKey = `${campus}:${createGroupKey(lotNames)}`;
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
    if (!window.buildingSpatialIndex) {
        throw new Error('Building spatial index not available');
    }

    const matchingFeatures = [];

    // Use existing buildingSpatialIndex for O(1) lookup
    const layer = window.buildingSpatialIndex.getBuildingLayerByName(targetName.toLowerCase());

    if (layer) {
        matchingFeatures.push(layer);
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

// Update parking lots display based on selected time and campus
function updateParkingLotsForTime(hour, dayType, campus = null) {
    // Use the provided campus or get from settings
    const selectedCampus = campus || settings['parking-campus'];

    // Only update if the time or campus has changed
    const currentTimeString = `${dayType}-${hour}-${selectedCampus}`;

    if (currentTimeString === currentSelectedTime) {
        return; // No change needed
    }

    currentSelectedTime = currentTimeString;

    // Get the group key for this time/day/campus combination
    const selectedCampusKey = selectedCampus;
    const groupKey = timeToGroupMap[dayType] && timeToGroupMap[dayType][selectedCampusKey]
        ? timeToGroupMap[dayType][selectedCampusKey][hour]
        : undefined;

    // If no mapping exists at all, fail fast
    if (groupKey === undefined) {
        throw new Error(`No group key found for ${dayType} ${hour}`);
    }

    // Empty combination means no lots are available for this time; just clear
    if (groupKey === '') {
        clearParkingFeatures();
        updateParkingLotList();
        return;
    }

    // Get the pre-computed group layers
    const groupLayers = parkingLotGroups[groupKey];

    if (!groupLayers || groupLayers.length === 0) {
        // Group key exists but has no layers (parking lot names don't match building data)
        console.warn(`No layers found for group: ${groupKey} - clearing parking features`);
        clearParkingFeatures();
        updateParkingLotList();
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
    
    // Update the parking lot list display
    updateParkingLotList();
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
        const timeParts = currentSelectedTime.split('-');
        const currentHour = parseInt(timeParts[1]);
        const currentCampus = timeParts[2] || settings['parking-campus'];
        updateParkingLotsForTime(currentHour, dayType, currentCampus);
        updateParkingLotCount();
        updateParkingLotList();

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
