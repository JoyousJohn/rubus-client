// Handle Info Panels menu selection and visibility
// Usage: selectInfoPanel('stops'|'routes'|'network', this)

// Drag/swipe functionality for subpanels
let dragStartX = 0;
let dragStartY = 0;
let dragEndX = 0;
let dragEndY = 0;
let isDragging = false;
let initialScrollLeft = 0;

// Velocity tracking for momentum-based animation
let velocityX = 0;
let lastMoveTime = 0;
let lastMoveX = 0;

// Touch handling state
let touchStartTime = 0;

// Panel order for swipe navigation (matches HTML order: routes > stops > network)
const panelOrder = ['routes', 'stops', 'network'];
let currentPanelIndex = 1; // Default to stops panel (middle position)

// Register custom easing function for smooth momentum
$.easing.momentum = function (x) {
    // Custom easing that starts fast and decelerates smoothly
    // x: normalized progress (0 to 1)
    // Returns a value between 0 and 1 representing the easing progress
    
    // Use a subtle ease-out curve that feels more natural than swing
    // This creates a gentle deceleration without the abrupt velocity changes
    return 1 - Math.pow(1 - x, 1.5);
};

// Function to move route selectors into the route subpanel
function moveRouteSelectorsToSubpanel() {
    const bottomElement = $('.bottom');
    const routeSelectorsContainer = $('#route-selectors-container');
    
    if (bottomElement.length && routeSelectorsContainer.length) {
        // Move the bottom element into the route subpanel
        bottomElement.appendTo(routeSelectorsContainer);
    }
}

// Function to move route selectors back to the main page
function moveRouteSelectorsToMain() {
    const bottomElement = $('.bottom');
    
    if (bottomElement.length) {
        // Move the bottom element back to the main page (after the settings panel)
        bottomElement.insertAfter('.settings-panel');
    }
}

// Calculate target panel position and animate there with physics-like momentum
function animateToTargetPanel(initialVelocity) {
    // Ensure any existing animations are stopped before starting new one
    $('.info-panels-content').stop(true);
    
    const currentScrollPosition = $('.info-panels-content').scrollLeft();
    const actualPanelWidth = Math.floor($('.info-panels-content')[0].scrollWidth / 3);
    
    // Determine target panel based on drag direction (user intent) rather than final position
    let targetPanelIndex = currentPanelIndex;
    
    // Check if user was dragging with significant velocity
    if (Math.abs(initialVelocity) > 5) {
        // User was dragging with intent - prioritize direction over final position
        if (initialVelocity < 0) {
            // Dragging left (negative velocity) = moving to right panel (higher index)
            targetPanelIndex = Math.min(currentPanelIndex + 1, panelOrder.length - 1);
        } else {
            // Dragging right (positive velocity) = moving to left panel (lower index)
            targetPanelIndex = Math.max(currentPanelIndex - 1, 0);
        }
        
    } else {
        // Low velocity - use area-based selection as fallback
        const viewportCenter = $('.info-panels-content').width() / 2;
        const currentCenter = currentScrollPosition + viewportCenter;
        
        let closestPanelIndex = 0;
        let minDistance = Infinity;
        
        for (let i = 0; i < panelOrder.length; i++) {
            const panelCenter = (i * actualPanelWidth) + (actualPanelWidth / 2);
            const distance = Math.abs(currentCenter - panelCenter);
            
            if (distance < minDistance) {
                minDistance = distance;
                closestPanelIndex = i;
            }
        }
        
        targetPanelIndex = closestPanelIndex;
        
    }
    
    const targetPanel = panelOrder[targetPanelIndex];
    currentPanelIndex = targetPanelIndex;
    
    // Calculate target scroll position
    const targetScrollPosition = targetPanelIndex * actualPanelWidth;
    
    // Calculate animation duration based on velocity and distance
    const distance = Math.abs(targetScrollPosition - currentScrollPosition);
    const velocityMagnitude = Math.abs(initialVelocity);
    
    // Base duration of 250ms, but extend it if we have high velocity
    // This creates a more natural feel where faster swipes take longer to settle
    const baseDuration = 250;
    const velocityDuration = Math.min(velocityMagnitude * 6, 400); // Cap at 400ms
    const totalDuration = Math.max(baseDuration, velocityDuration);
    
    // Update the header button selection immediately
    const targetElement = $(`.info-panels-header-buttons [data-panel="${targetPanel}"]`);
    $('.all-stops-selected-menu').removeClass('all-stops-selected-menu');
    if (targetElement.length) {
        targetElement.addClass('all-stops-selected-menu');
    }
    
    // Single smooth animation to the target position
    // Use custom 'momentum' easing for natural deceleration without abrupt velocity changes
    $('.info-panels-content').animate({
        scrollLeft: targetScrollPosition
    }, {
        duration: totalDuration,
        easing: 'momentum', // Custom easing for smooth momentum
        complete: function() {
            // Update panel position after animation completes
            updatePanelPosition(targetPanel);
        }
    });
    // Removed the conflicting call to selectInfoPanel.
    // The necessary logic is now handled by the animation's `complete` callback
    // and the code that runs before the animation starts.
}


function selectInfoPanel(panel, element) {
    try {
        // Update current panel index
        currentPanelIndex = panelOrder.indexOf(panel);

        // Update visual panel position
        updatePanelPosition(panel);

        // Toggle selected menu class
        $('.all-stops-selected-menu').removeClass('all-stops-selected-menu');
        if (element) {
            $(element).addClass('all-stops-selected-menu');
        }

        // Initialize panel content based on selected panel
        // if (panel === 'network') {
        //     // Initialize buses overview for network panel
        //     if (typeof busesOverview === 'function') {
        //         busesOverview();
        //     }
        // } else if (panel === 'stops') {
        //     // Initialize stops panel
        //     if (typeof populateAllStops === 'function') {
        //         populateAllStops();
        //     }
        // }
    } catch (error) {
        console.error('Error selecting info panel:', error);
    }
}

// Handle closing the info panels wrapper
$('.info-panels-close').click(function() {
    $('.info-panels-wrapper').hide();
    
    // Move route selectors back to the main page
    moveRouteSelectorsToMain();
    
    $('.bottom').show();
    // Reset bottom position to default
    $('.bottom').css('bottom', '0px');
    // Ensure all buttons are visible when info panels are closed
    $('.left-btns, .right-btns, .route-selectors, .settings-btn').show();
    $('.info-panels-close').show();
})

// Function to update panel position visually
function updatePanelPosition(panel) {
    $('.subpanels-container').removeClass('panel-stops panel-routes panel-network');
    $('.subpanels-container').addClass(`panel-${panel}`);
    
    // Scroll to the correct panel position using actual scrollable content width
    const panelIndex = panelOrder.indexOf(panel);
    const viewportWidth = window.innerWidth;
    const scrollWidth = $('.info-panels-content')[0].scrollWidth;
    const contentWidth = $('.info-panels-content').width();
    const actualPanelWidth = Math.floor(scrollWidth / 3); // Use actual scrollable width divided by 3
    const scrollPosition = panelIndex * actualPanelWidth;

    console.log('=== PANEL POSITIONING DEBUG ===');
    console.log('Panel:', panel);
    console.log('PanelIndex:', panelIndex);
    console.log('ViewportWidth:', viewportWidth);
    console.log('ScrollWidth:', scrollWidth);
    console.log('ContentWidth:', contentWidth);
    console.log('ActualPanelWidth:', actualPanelWidth);
    console.log('Calculated scrollPosition:', scrollPosition);
    console.log('Expected positions: Routes=0, Stops=' + actualPanelWidth + ', Network=' + (actualPanelWidth * 2));
    console.log('Actual scrollLeft before:', $('.info-panels-content').scrollLeft());
    
    // Check for padding/margin issues
    const subpanelsContainer = $('.subpanels-container')[0];
    const computedStyle = window.getComputedStyle(subpanelsContainer);
    console.log('Subpanels container padding:', computedStyle.paddingLeft, computedStyle.paddingRight);
    console.log('Subpanels container margin:', computedStyle.marginLeft, computedStyle.marginRight);
    console.log('Subpanels container width:', computedStyle.width);
    
    // Check individual subpanel styles
    const subpanels = $('.subpanel');
    subpanels.each(function(index) {
        const subpanelStyle = window.getComputedStyle(this);
        console.log(`Subpanel ${index} width:`, subpanelStyle.width);
        console.log(`Subpanel ${index} padding:`, subpanelStyle.paddingLeft, subpanelStyle.paddingRight);
        console.log(`Subpanel ${index} margin:`, subpanelStyle.marginLeft, subpanelStyle.marginRight);
    });
    
    $('.info-panels-content').scrollLeft(scrollPosition);
    
    const finalScrollLeft = $('.info-panels-content').scrollLeft();
    console.log('Actual scrollLeft after:', finalScrollLeft);
    console.log('Difference from expected:', Math.abs(finalScrollLeft - scrollPosition));
    
    // Calculate how far over to the right it is
    const expectedCenter = actualPanelWidth * panelIndex + (actualPanelWidth / 2);
    const actualCenter = finalScrollLeft + (contentWidth / 2);
    const offsetFromCenter = actualCenter - expectedCenter;
    console.log('Expected center position:', expectedCenter);
    console.log('Actual center position:', actualCenter);
    console.log('Offset from center (positive = too far right):', offsetFromCenter);
    console.log('================================');
}

// Unified pointer event handlers for touch and mouse
$('.info-panels-content').on('touchstart mousedown', function(e) {
    // Stop any ongoing animation
    $('.info-panels-content').stop();
    
    // Get coordinates from touch or mouse event
    if (e.type === 'touchstart') {
        dragStartX = e.originalEvent.touches[0].clientX;
        dragStartY = e.originalEvent.touches[0].clientY;
    } else {
        dragStartX = e.clientX;
        dragStartY = e.clientY;
    }
    
    // Store initial scroll position
    initialScrollLeft = $('.info-panels-content').scrollLeft();
    
    // Reset velocity tracking variables
    velocityX = 0;
    lastMoveTime = 0;
    lastMoveX = dragStartX;
    touchStartTime = Date.now();
    
    isDragging = false;
    // Don't prevent default here - let vertical scrolling work normally
    // We'll only prevent default if we detect horizontal movement
});

$('.info-panels-content').on('touchmove mousemove', function(e) {
    if (!dragStartX || !dragStartY) return;
    
    // Check if the drag is happening on route selectors - if so, don't handle subpanel scrolling
    const target = $(e.target);
    if (target.closest('.bottom, .route-selectors, .route-selector').length > 0) {
        return; // Let the route selectors handle their own scrolling
    }
    
    // Get coordinates from touch or mouse event
    if (e.type === 'touchmove') {
        dragEndX = e.originalEvent.touches[0].clientX;
        dragEndY = e.originalEvent.touches[0].clientY;
    } else {
        dragEndX = e.clientX;
        dragEndY = e.clientY;
    }
    
    const deltaX = dragEndX - dragStartX;
    const deltaY = dragEndY - dragStartY;
    
    // Only consider it a horizontal drag if:
    // 1. Horizontal movement is significantly greater than vertical movement
    // 2. We've moved enough to be considered intentional
    // 3. We haven't already determined this is a vertical scroll
    // 4. We've given enough time for the user's intent to be clear (at least 50ms)
    const touchDuration = Date.now() - touchStartTime;
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 15 && touchDuration > 50) {
        // Only prevent default and start dragging if we haven't already determined this is vertical scrolling
        if (!isDragging || Math.abs(deltaX) > Math.abs(deltaY)) {
            isDragging = true;
            e.preventDefault(); // Prevent scrolling while dragging
            
            // Calculate velocity for physics
            const currentTime = Date.now();
            if (lastMoveTime > 0) {
                const timeDelta = currentTime - lastMoveTime;
                const positionDelta = dragEndX - lastMoveX;
                
                // Calculate velocity (pixels per millisecond)
                if (timeDelta > 0) {
                    velocityX = positionDelta / timeDelta;
                }
            }
            
            lastMoveTime = currentTime;
            lastMoveX = dragEndX;
            
            // Show visual feedback during drag - calculate from initial position
            const newScrollPosition = initialScrollLeft - deltaX;
            
            $('.info-panels-content').scrollLeft(newScrollPosition);
        }
    } else if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 15) {
        // This is clearly a vertical scroll - don't interfere
        isDragging = false;
        return;
    }
});

$('.info-panels-content').on('touchend mouseup', function(e) {
    // Check if the drag was happening on route selectors - if so, don't handle subpanel scrolling
    const target = $(e.target);
    if (target.closest('.bottom, .route-selectors, .route-selector').length > 0) {
        // Reset drag state
        dragStartX = dragStartY = dragEndX = dragEndY = 0;
        isDragging = false;
        lastMoveTime = 0;
        lastMoveX = 0;
        return; // Let the route selectors handle their own scrolling
    }
    
    // Only process the drag if we were actually dragging horizontally
    if (isDragging && dragStartX && dragStartY) {
        const deltaX = dragEndX - dragStartX;
        
        // Convert velocity from pixels per millisecond to a more usable scale
        // Multiply by 20 to approximate 60fps frame time for smoother physics and more responsive feel
        const scaledVelocity = velocityX * 20;
        
        // Always animate to target panel with momentum-based duration and easing
        animateToTargetPanel(scaledVelocity);
    }
    
    // Reset drag values
    dragStartX = 0;
    dragStartY = 0;
    isDragging = false;
    lastMoveTime = 0;
    lastMoveX = 0;
    touchStartTime = 0;
});

// Prevent context menu on right click during drag
$('.info-panels-content').on('contextmenu', function(e) {
    if (dragStartX) {
        e.preventDefault();
    }
});

// Handle pointer leave to reset drag state
$('.info-panels-content').on('mouseleave touchcancel', function(e) {
    dragStartX = 0;
    dragStartY = 0;
    isDragging = false;
    lastMoveTime = 0;
    lastMoveX = 0;
    velocityX = 0;
    touchStartTime = 0;
});

function navigateToPanel(direction) {
    const newIndex = currentPanelIndex + direction;
    
    // Check bounds
    if (newIndex < 0 || newIndex >= panelOrder.length) return;
    
    const newPanel = panelOrder[newIndex];
    const newElement = $(`.info-panels-header-buttons [data-panel="${newPanel}"]`);
    
    // Update current panel index
    currentPanelIndex = newIndex;
    
    // Switch to the new panel
    selectInfoPanel(newPanel, newElement[0]);
}



