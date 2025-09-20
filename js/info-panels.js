// Handle Info Panels menu selection and visibility
// Usage: selectInfoPanel('stops'|'routes'|'network', this)

// Drag/swipe functionality for subpanels
let dragStartX = 0;
let dragStartY = 0;
let dragEndX = 0;
let dragEndY = 0;
let isDragging = false;
let initialScrollLeft = 0;

// Helper function to get the current X translation from a CSS transform matrix
function getTranslateX($element) {
    const transformMatrix = $element.css('transform');
    if (transformMatrix && transformMatrix !== 'none') {
        const matrixValues = transformMatrix.match(/matrix.*\((.+)\)/)[1].split(', ');
        return parseFloat(matrixValues[4]);
    }
    return 0;
}

// Velocity tracking for momentum-based animation
let velocityX = 0;
let lastMoveTime = 0;
let lastMoveX = 0;

// Touch handling state
let touchStartTime = 0;
let lastTouchEndTime = 0;

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
function animateToTargetPanel(initialVelocity, options) {
    const opts = options || {};

    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
    }

    const $content = $('.info-panels-content');
    const $container = $('.subpanels-container');

    // Make sure CSS transitions are off for the JS animation
    $container.css('transition', 'none');

    const startX = getTranslateX($container);
    const panelWidth = $content.width();

    // Determine target panel based on drag direction (user intent) rather than final position
    let targetPanelIndex = currentPanelIndex;

    if (opts.targetIndex === undefined && Math.abs(initialVelocity) > 5) {
        // User was dragging with intent - prioritize direction over final position
        if (initialVelocity < 0) {
            // Dragging left (negative velocity) = moving to right panel (higher index)
            targetPanelIndex = Math.min(currentPanelIndex + 1, panelOrder.length - 1);
        } else {
            // Dragging right (positive velocity) = moving to left panel (lower index)
            targetPanelIndex = Math.max(currentPanelIndex - 1, 0);
        }
    } else if (opts.targetIndex !== undefined) {
        // A specific target index was provided (e.g., from a button click)
        targetPanelIndex = opts.targetIndex;
    } else {
        // Low velocity - use area-based selection as fallback
        // startX is already the translateX value, so we need to find which panel we're closest to
        let closestPanelIndex = 0;
        let minDistance = Infinity;
        
        for (let i = 0; i < panelOrder.length; i++) {
            const panelX = -i * panelWidth; // This is where panel i should be positioned
            const distance = Math.abs(startX - panelX);
            
            if (distance < minDistance) {
                minDistance = distance;
                closestPanelIndex = i;
            }
        }
        
        targetPanelIndex = closestPanelIndex;
    }

    const targetPanel = panelOrder[targetPanelIndex];
    currentPanelIndex = targetPanelIndex;

    const targetX = -1 * targetPanelIndex * panelWidth;

    // Calculate animation duration based on velocity and distance
    const distance = Math.abs(targetX - startX);
    const velocityMagnitude = Math.abs(initialVelocity);

    // Base duration of 125ms (~50% faster), but extend it if we have high velocity
    // This creates a more natural feel where faster swipes take longer to settle
    const baseDuration = 125;
    const velocityDuration = Math.min(velocityMagnitude * 3, 200); // Cap at 200ms
    const totalDuration = Math.max(baseDuration, velocityDuration);

    // Update the header button selection immediately
    const targetElement = $(`.info-panels-header-buttons [data-panel="${targetPanel}"]`);
    $('.all-stops-selected-menu').removeClass('all-stops-selected-menu');
    if (targetElement.length) {
        targetElement.addClass('all-stops-selected-menu');
    }

    const startTime = performance.now();

    function frame(currentTime) {
        const elapsedTime = currentTime - startTime;
        let progress = Math.min(elapsedTime / totalDuration, 1);

        // Apply our custom easing function
        progress = $.easing.momentum(progress);

        const newX = startX + (targetX - startX) * progress;
        $container.css('transform', 'translateX(' + newX + 'px)');

        if (elapsedTime < totalDuration) {
            animationFrameId = requestAnimationFrame(frame);
        } else {
            // Animation complete, ensure it's at the exact final position
            $container.css('transform', 'translateX(' + targetX + 'px)');
            // Remove the class to re-enable CSS transitions for other interactions
            $container.removeClass('is-dragging-or-animating');
            // Update panel classes
            updatePanelPosition(targetPanel, { skipMove: true });
            animationFrameId = null;
        }
    }

    animationFrameId = requestAnimationFrame(frame);
}


function selectInfoPanel(panel, element) {
    try {
        const currentPanel = panelOrder[currentPanelIndex];
        const targetIndex = panelOrder.indexOf(panel);

        // Only animate if the panel is actually changing
        if (panel !== currentPanel) {
            // Use a high, consistent velocity to trigger a fast animation
            const artificialVelocity = 25;
            const options = { targetIndex: targetIndex };
            animateToTargetPanel(artificialVelocity, options);
        }

        // Toggle selected menu class
        $('.all-stops-selected-menu').removeClass('all-stops-selected-menu');
        if (element) {
            $(element).addClass('all-stops-selected-menu');
        }
    } catch (error) {
        console.error('Error selecting info panel:', error);
    }
}

// Handle closing the info panels wrapper
$('.info-panels-close').click(function() {
    $('.info-panels-show-hide-wrapper').hide();
    
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
function updatePanelPosition(panel, options) {
    const opts = options || {};
    const $container = $('.subpanels-container');
    $container.removeClass('panel-stops panel-routes panel-network');
    $container.addClass(`panel-${panel}`);

    if (opts.skipMove) {
        return;
    }

    // Use transform for instant panel switching
    const panelIndex = panelOrder.indexOf(panel);
    const panelWidth = $('.info-panels-content').width();
    const targetX = -1 * panelIndex * panelWidth;

    // Apply transform directly; CSS transition should handle the animation
    $container.css('transform', 'translateX(' + targetX + 'px)');
    
    // Update currentPanelIndex to match
    currentPanelIndex = panelIndex;
}

let initialTransformX = 0;
let animationFrameId = null;

// Unified pointer event handlers for touch and mouse
$('.info-panels-content').on('touchstart mousedown', function(e) {
    // Cancel any ongoing JS animation frame
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }

    const $container = $('.subpanels-container');
    // Stop any ongoing jQuery animation and add class to disable CSS transitions
    $container.stop(true).addClass('is-dragging-or-animating');

    // Get coordinates from touch or mouse event
    if (e.type === 'touchstart') {
        dragStartX = e.originalEvent.touches[0].clientX;
        dragStartY = e.originalEvent.touches[0].clientY;
    } else {
        // Ignore synthetic mouse events that immediately follow a touch
        if (Date.now() - lastTouchEndTime < 400) {
            return;
        }
        dragStartX = e.clientX;
        dragStartY = e.clientY;
    }

    // Store initial transform position
    initialTransformX = getTranslateX($container);

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
    
    const $container = $('.subpanels-container');

    // Check if the drag is happening on route selectors - if so, don't handle subpanel scrolling
    const target = $(e.target);
    if (target.closest('.bottom, .route-selectors, .route-selector, .ridership-chart-wrapper, #ridership-chart, .buses-overview-grid').length > 0) {
        return; // Let these elements handle their own interactions
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
            const newTransformX = initialTransformX + deltaX;
            $container.css('transform', 'translateX(' + newTransformX + 'px)');
        }
    } else if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 15) {
        // This is clearly a vertical scroll - don't interfere
        isDragging = false;
        return;
    }
});

$('.info-panels-content').on('touchend mouseup', function(e) {
    // Ignore synthetic mouseup fired right after touchend
    if (e.type === 'mouseup' && Date.now() - lastTouchEndTime < 400) {
        return;
    }
    if (e.type === 'touchend') {
        lastTouchEndTime = Date.now();
    }
    
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
        // Stop any ongoing animations before starting new momentum animation
        // Removed: $('.info-panels-content').stop(true);

        const deltaX = dragEndX - dragStartX;

        // Convert velocity from pixels per millisecond to a more usable scale
        // Multiply by 20 to approximate 60fps frame time for smoother physics and more responsive feel
        const scaledVelocity = velocityX * 20;

        // Always animate to target panel with momentum-based duration and easing
        animateToTargetPanel(scaledVelocity);
    } else {
        // Removed: console.log('❌ Not processing - isDragging:', isDragging, 'dragStartX:', !!dragStartX);
        // Disable horizontal scrolling since no animation will start
        // Removed: $('.info-panels-content').css('overflow-x', 'hidden');
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

// Monitor for multiple animation calls
let animationCallCount = 0;
const originalAnimateToTargetPanel = animateToTargetPanel;
animateToTargetPanel = function(velocity, options) {
    animationCallCount++;
    return originalAnimateToTargetPanel(velocity, options);
};

// Non-passive touchmove listener removed - was causing interference



