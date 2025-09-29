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
    // No parking lots visible, fall back to campus bounds
    fitMapToCampusBounds();
    
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
    
    // No parking lots active, show empty list
    currentParkingLotNames = [];
    
    // Get the current lot names from the selected time/campus
    let currentLotNames = [];
    if (currentSelectedTime && selectedDayType) {
        const timeParts = currentSelectedTime.split('-');
        const currentHour = parseInt(timeParts[1]);
        const currentCampus = timeParts[2];
        
        currentLotNames = getAllowedParkingLots(currentHour, selectedDayType, currentCampus);
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
    const currentCampus = settings['parking-campus'];
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

        // Recompute parking lot groups for the new campus
        precomputeParkingLotGroups(parkingCampus);

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

// Add all parking campus route selectors for permit mode
function addAllParkingCampusRouteSelectors(selectedCampus) {
    const campuses = ['Busch', 'Livingston', 'College Ave', 'Cook', 'Douglass'];
    const defaultCampus = selectedCampus;

    // Clear existing parking campus selectors (including the single "P" icon)
    $('.parking-campus-selector').remove();

    // Ensure the selected campus appears first (leftmost)
    const orderedCampuses = [defaultCampus, ...campuses.filter(c => c !== defaultCampus)];

    orderedCampuses.forEach((campus) => {
        const isSelected = (campus === defaultCampus);
        addPermitModeCampusSelector(campus, isSelected);
    });
}

// Add individual campus selector for permit mode (with campus parameter)
function addPermitModeCampusSelector(parkingCampus, isSelected = false) {
    // Check if parking campus selector already exists
    if ($(`.route-selector[routeName="parking-${parkingCampus}"]`).length > 0) {
        return;
    }

    const displayName = getCampusDisplayName(parkingCampus);
    const isInPermitMode = $('body').hasClass('parking-permit-mode');
    
    const $routeElm = $(`
        <div class="route-selector parking-campus-selector" routeName="parking-${parkingCampus}" style="background-color: white; color: black; font-weight: bold; ${isInPermitMode ? 'white-space: nowrap; padding-left: 1rem;' : 'display: flex; align-items: center; justify-content: center; padding: 0.5rem; aspect-ratio: 1;'} box-shadow: ${isSelected ? '0 0 10px var(--theme-color)' : 'none'};">
            <i class="fa-regular fa-circle-parking"></i>${isInPermitMode ? ` ${displayName}` : ''}
        </div>
    `);

    // Add click and touch handler for parking campus selector
    $routeElm.on('click touchstart', function(e) {
        e.preventDefault();

        if ($('body').hasClass('parking-permit-mode')) {
            // If clicking the already-selected campus, exit permit mode
            if (settings['parking-campus'] === parkingCampus) {
                exitParkingPermitMode();
                return;
            }
            // In parking permit mode, select this campus and update the display
            selectParkingCampus(parkingCampus);

            // Update styling for all parking campus selectors - keep white background and black text
            $('.parking-campus-selector').css({
                'background-color': 'white',
                'color': 'black',
                'box-shadow': 'none'
            });

            // Highlight the selected one with box-shadow only
            $routeElm.css({
                'box-shadow': '0 0 10px var(--theme-color)'
            });

            // Update parking lots for the selected campus
            if (selectedDayType) {
                const currentHour = parseInt($('.current-time-label').text().split(':')[0]);
                if (currentHour) {
                    updateParkingLotsForTime(currentHour, selectedDayType, parkingCampus);
                    updateParkingLotCount();
                    clearPanoutFeedback();
                }
            }
        } else {
            // Not in parking permit mode, enter it
            enterParkingPermitMode(parkingCampus);
            // Apply selection styling to parking campus selector
            $routeElm.css('box-shadow', '0 0 10px var(--theme-color)');
        }
    });

    // Add to route selectors (at the end, after settings button)
    $('.route-selectors').append($routeElm);
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
    let isTimeScrollDragging = false;
    let startX = 0;
    let scrollLeft = 0;
    let lastX = 0;
    let lastTime = 0;
    let velocity = 0;
    let momentumAnimation = null;

    // Mouse events
    container.on('mousedown', function(e) {
        isTimeScrollDragging = true;
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
        if (!isTimeScrollDragging) return;
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
        isTimeScrollDragging = false;
        container.css('cursor', 'grab');
        
        // Start momentum animation if there's velocity
        if (Math.abs(velocity) > 0.001) {
            startMomentumAnimation();
        }
    });

    // Touch events for mobile
    container.on('touchstart', function(e) {
        isTimeScrollDragging = true;
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
        if (!isTimeScrollDragging) return;
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
        isTimeScrollDragging = false;
        
        // Start momentum animation if there's velocity
        if (Math.abs(velocity) > 0.001) {
            startMomentumAnimation();
        }
    });
    
    // Momentum animation function
    function startMomentumAnimation() {
        const friction = 0.98; // Friction coefficient (0-1, closer to 1 = less friction)
        const minVelocity = 0.001; // Minimum velocity to continue animation
        const velocityScale = 10; // Scale up the velocity for momentum
        
        // Scale the velocity for momentum animation
        let momentumVelocity = velocity * velocityScale;
        
        function animate() {
            if (Math.abs(momentumVelocity) < minVelocity) {
                momentumAnimation = null;
            }
            
            // Apply velocity to scroll position
            const currentScrollLeft = scrollContainer.scrollLeft();
            scrollContainer.scrollLeft(currentScrollLeft - momentumVelocity);
            
            // Update time label during momentum
            updateParkingTimeLabelFromScroll();
            
            // Apply friction
            momentumVelocity *= friction;
            
            // Continue animation
            momentumAnimation = requestAnimationFrame(animate);
        }
        
        momentumAnimation = requestAnimationFrame(animate);
    }

    // Update current time every minute
    setInterval(updateParkingCurrentTimeLabel, 60000);
    
    // Add scroll event listener for wheel scrolling
    scrollContainer.on('scroll', function() {
    parkingTimeScrollUserInteracted = true; // User scrolled with wheel/mouse
        updateParkingTimeLabelFromScroll();
    });
}

function adjustParkingContainerForLabels() {
    // Use cached height if available and skip recompute to avoid incremental growth
    if (parkingContainerHeight !== null) {
        const container = $('.time-ticks-container');
        const scrollContainer = $('.parking-time-scroll');
        container.css('height', parkingContainerHeight + 'px');
        scrollContainer.css('height', parkingContainerHeight + 'px');
        return;
    }

    // Find the first label to measure its height
    const firstLabel = $('.time-tick-label').first();
    // firstLabel should exist and have a valid height
    // Get the actual rendered height of the label
    const labelHeight = firstLabel.outerHeight();

    // Get current container height
    const container = $('.time-ticks-container');
    const currentHeight = container.height();

    // Calculate new height needed (container height + label height + some padding)
    const padding = 4; // Small padding for visual spacing
    const newHeight = currentHeight + labelHeight + padding;

    // Cache the height for future use (only set once)
    parkingContainerHeight = newHeight;

    // Update container height
    container.css('height', newHeight + 'px');

    // Update parent container height to match
    const scrollContainer = $('.parking-time-scroll');
    scrollContainer.css('height', newHeight + 'px');
}

function updateParkingCurrentTimeLabel() {
    // Only update if user hasn't manually interacted with the time scroll
    // Don't update if user has manually selected a time

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
        const previousGroup = window.lastParkingGroup;

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
    // Add parking permit mode class to body
    $('body').addClass('parking-permit-mode');

    // Hide all buses and routes from map
    hideAllBusesFromMap();
    hideAllPolylinesFromMap();

    // Populate all campus route selectors for permit mode
    addAllParkingCampusRouteSelectors(parkingCampus);

    // Disable buildings layer if it exists
    if (window.buildingsLayer) {
        console.log('🚪 Removing buildings layer from map');
        map.removeLayer(window.buildingsLayer);
        console.log('✅ Buildings layer removed');
    }

    // Reset user interaction flag for fresh start
    parkingTimeScrollUserInteracted = false;

    // Load parking data and buildings data
    Promise.all([
        loadParkingLotData(),
        loadBuildings()
    ]).then(() => {
        // Pre-compute parking lot groups for the current campus
        precomputeParkingLotGroups(parkingCampus);

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
        console.log('🏗️ Re-enabling buildings layer in exitParkingPermitMode');
        window.buildingsLayer.addTo(map);
    }

    // Hide parking permit popup
    $('.parking-permit-popup').addClass('none').hide();

    // Re-add the single parking campus selector for normal mode
    const parkingCampus = settings['parking-campus'];
    if (parkingCampus && parkingCampus !== false) {
        addParkingCampusRouteSelector();
    }

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
            // Initialize objects if they don't exist
            if (!timeToGroupMap[dayType]) timeToGroupMap[dayType] = {};
            if (!parkingSchedule[dayType]) parkingSchedule[dayType] = {};

            campuses.forEach(campus => {
                // Initialize campus objects if they don't exist
                if (!parkingSchedule[dayType][campus]) parkingSchedule[dayType][campus] = {};
                if (!timeToGroupMap[dayType][campus]) timeToGroupMap[dayType][campus] = {};

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

function precomputeParkingLotGroups(campus) {
    if (!window.buildingSpatialIndex) {
        throw new Error('Building spatial index not available');
    }

    // Clear existing groups
    parkingLotGroups = {};

    // Use provided campus - fail fast if not provided
    const targetCampus = campus;

    // Get unique combinations for the target campus only
    const campusCombinations = new Map();
    for (const [comboKey, lotNames] of window.parkingUniqueCombinations) {
        if (comboKey.startsWith(`${targetCampus}:`)) {
            campusCombinations.set(comboKey, lotNames);
        }
    }

    // Pre-compute groups for current campus only
    for (const [comboKey, lotNames] of campusCombinations) {
        const groupLayers = findParkingLotsForGroup(lotNames);
        if (groupLayers.length > 0) {
            parkingLotGroups[comboKey] = groupLayers;
            console.log(`Group "${comboKey}": ${groupLayers.length} layers found`);
        } else {
            console.log(`Group "${comboKey}": 0 layers found - SKIPPED (no building layers exist)`);
        }
    }

    console.log(`Total unique groups for ${targetCampus}:`, Object.keys(parkingLotGroups).length);
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
        // Look up the lot in the spatial index

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

    // lotNames should always be provided and non-empty

    // Get the group key for this lot combination
    const campus = settings['parking-campus'];
    const groupKey = `${campus}:${createGroupKey(lotNames)}`;
    const groupLayers = parkingLotGroups[groupKey];

    // groupLayers should always exist for valid groupKey

    // Show all layers in this group
    groupLayers.forEach(layer => {
        if (layer && typeof layer.addTo === 'function') {
            debugLayerAdded(layer, 'showParkingLotsOnMap');
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
    console.log(`🧹 clearParkingFeatures: removing ${currentParkingFeatures.length} tracked features`);
    currentParkingFeatures.forEach(feature => {
        if (feature && typeof feature.remove === 'function') {
            console.log(`🗑️ Removing tracked parking feature: ${feature.feature?.properties?.name || 'unknown'} (ID: ${feature._leaflet_id})`);
            map.removeLayer(feature);
        }
    });
    currentParkingFeatures = [];
    console.log('✅ clearParkingFeatures: cleared all tracked features');
}

// Debug function to track all layer additions to the map
function debugLayerAdded(layer, source = 'unknown') {
    if (layer && layer.feature && layer.feature.properties) {
        const props = layer.feature.properties;
        if (props.name && (
            props.name.toLowerCase().includes('lot') ||
            props.name.toLowerCase().includes('deck') ||
            props.name.toLowerCase().includes('parking')
        )) {
            console.log(`🚨 PARKING LAYER ADDED: "${props.name}" from ${source}`, {
                layer: layer,
                feature: layer.feature,
                properties: props,
                layerId: layer._leaflet_id,
                onMap: map.hasLayer(layer),
                style: layer.options
            });
        }
    }
}

// Reset parking lot styling to default (remove red styling)
function resetParkingLotStyling() {
    console.log('🔄 Resetting parking lot styling...');
    let resetCount = 0;

    // Find all layers that might have red parking styling and reset them
    // Only check layers that are actually on the map to avoid unnecessary work
    const layersToCheck = [];
    map.eachLayer(layer => {
        if (layer && layer.setStyle && layer.feature && layer.feature.properties) {
            layersToCheck.push(layer);
        }
    });

    // Process layers in batch to avoid blocking the main thread
    layersToCheck.forEach(layer => {
        const props = layer.feature.properties;
        // Check if this is a parking lot feature
        if (props.name && (
            props.name.toLowerCase().includes('lot') ||
            props.name.toLowerCase().includes('deck') ||
            props.name.toLowerCase().includes('parking')
        )) {
            const currentStyle = layer.options;
            console.log(`🔄 Resetting parking layer: "${props.name}" (ID: ${layer._leaflet_id})`, {
                currentStyle,
                onMap: map.hasLayer(layer)
            });

            // Reset to default building styling
            layer.setStyle({
                fillColor: '#3388ff',
                color: '#3388ff',
                weight: 2,
                opacity: 0.2,
                fillOpacity: 0.2
            });
            resetCount++;
        }
    });

    console.log(`✅ Reset ${resetCount} parking lot layers`);
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
function updateParkingLotsForTime(hour, dayType, campus) {
    const selectedCampus = campus;

    // Only update if the time or campus has changed
    const currentTimeString = `${dayType}-${hour}-${selectedCampus}`;

    // Only update if the time or campus has changed

    currentSelectedTime = currentTimeString;

    // Get the group key for this time/day/campus combination
    const selectedCampusKey = selectedCampus;
    const groupKey = timeToGroupMap[dayType] && timeToGroupMap[dayType][selectedCampusKey]
        ? timeToGroupMap[dayType][selectedCampusKey][hour]
        : undefined;

    console.log(`updateParkingLotsForTime: ${dayType} ${hour}h ${campus} -> groupKey: "${groupKey}"`);

    // If no mapping exists at all, fail fast
    if (groupKey === undefined) {
        throw new Error(`No group key found for ${dayType} ${hour}`);
    }

    // Empty combination means no lots are available for this time; just clear
    if (groupKey === '') {
        console.log('Clearing parking features - no lots available for this time');
        clearParkingFeatures();
        updateParkingLotList();
        return; // Nothing to show for this time slot
    }

    // Get the pre-computed group layers
    const groupLayers = parkingLotGroups[groupKey];

    console.log(`Group layers for "${groupKey}":`, groupLayers ? groupLayers.length : 'undefined');

    // Gracefully handle missing groups
    if (!groupLayers) {
        console.warn(`No parking lot group found for key "${groupKey}"`);
        clearParkingFeatures();
        updateParkingLotList();
        return;
    }

    // Clear existing and show new group
    clearParkingFeatures();

    groupLayers.forEach(layer => {
        if (layer && typeof layer.addTo === 'function') {
            debugLayerAdded(layer, 'showParkingLotsOnMap');
            layer.addTo(map);
            currentParkingFeatures.push(layer);
        }
    });
    
    console.log(`Added ${groupLayers.length} parking lot layers to map`);
    
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
        const currentCampus = timeParts[2];
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
