// Handle Info Panels menu selection and visibility
// Usage: selectInfoPanel('stops'|'routes'|'network', this)

// Drag/swipe functionality for subpanels
let dragStartX = 0;
let dragStartY = 0;
let dragEndX = 0;
let dragEndY = 0;
let isDragging = false;
let initialScrollLeft = 0;

// Panel order for swipe navigation (matches HTML order: routes > stops > network)
const panelOrder = ['routes', 'stops', 'network'];
let currentPanelIndex = 1; // Default to stops panel (middle position)

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
    
    isDragging = false;
    e.preventDefault(); // Prevent text selection and scrolling
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
    
    // Only consider it a drag if horizontal movement is greater than vertical
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
        isDragging = true;
        e.preventDefault(); // Prevent scrolling while dragging
        
        // Show visual feedback during drag - calculate from initial position
        const newScrollPosition = initialScrollLeft - deltaX;
        
        $('.info-panels-content').scrollLeft(newScrollPosition);
    }
});

$('.info-panels-content').on('touchend mouseup', function(e) {
    // Check if the drag was happening on route selectors - if so, don't handle subpanel scrolling
    const target = $(e.target);
    if (target.closest('.bottom, .route-selectors, .route-selector').length > 0) {
        // Reset drag state
        dragStartX = dragStartY = dragEndX = dragEndY = 0;
        isDragging = false;
        return; // Let the route selectors handle their own scrolling
    }
    
    if (isDragging && dragStartX && dragStartY) {
        const deltaX = dragEndX - dragStartX;
        const scrollableWidth = $('.info-panels-content')[0].scrollWidth / 3; // Total scroll width divided by 3 panels
        const currentScrollPosition = $('.info-panels-content').scrollLeft();
        
        // Determine which panel is most visible based on scroll position
        let targetPanelIndex = currentPanelIndex;
        
        // Calculate which panel center is closest to the current scroll position
        const panelWidth = scrollableWidth; // Each panel is the calculated scrollable width
        const viewportCenter = $('.info-panels-content').width() / 2; // Center of the visible viewport
        const currentCenter = currentScrollPosition + viewportCenter;

        console.log('=== DRAG DEBUG ===');
        console.log('ScrollableWidth:', scrollableWidth);
        console.log('CurrentScrollPosition:', currentScrollPosition);
        console.log('PanelWidth:', panelWidth);
        console.log('ViewportCenter:', viewportCenter);
        console.log('CurrentCenter:', currentCenter);
        
        // Find the panel whose center is closest to the viewport center
        let closestPanelIndex = 0;
        let minDistance = Infinity;
        
        for (let i = 0; i < panelOrder.length; i++) {
            const panelCenter = (i * panelWidth) + (panelWidth / 2);
            const distance = Math.abs(currentCenter - panelCenter);
            
            if (distance < minDistance) {
                minDistance = distance;
                closestPanelIndex = i;
            }
        }
        
        // Only switch if we've dragged far enough (minimum threshold)
        if (Math.abs(deltaX) > 30) {
            targetPanelIndex = closestPanelIndex;
        }
        
        // Snap to the target panel with smooth animation
        const targetPanel = panelOrder[targetPanelIndex];
        currentPanelIndex = targetPanelIndex;
        
        // Calculate target scroll position using actual panel width
        const actualPanelWidth = Math.floor($('.info-panels-content')[0].scrollWidth / 3);
        const targetScrollPosition = targetPanelIndex * actualPanelWidth;
        
        console.log('=== SNAPPING DEBUG ===');
        console.log('TargetPanelIndex:', targetPanelIndex);
        console.log('ViewportWidth:', viewportWidth);
        console.log('TargetScrollPosition:', targetScrollPosition);
        console.log('Current scrollLeft before animation:', $('.info-panels-content').scrollLeft());
        
        // Animate to the target position
        $('.info-panels-content').animate({
            scrollLeft: targetScrollPosition
        }, 300, 'swing', function() {
            console.log('Animation completed. Final scrollLeft:', $('.info-panels-content').scrollLeft());
            console.log('Animation completed');
            // Update panel position after animation completes
            updatePanelPosition(targetPanel);
        });
        
        // Update the header button selection
        const targetElement = $(`.info-panels-header-buttons [data-panel="${targetPanel}"]`);
        $('.all-stops-selected-menu').removeClass('all-stops-selected-menu');
        if (targetElement.length) {
            targetElement.addClass('all-stops-selected-menu');
        }
        
        // Trigger the panel selection logic
        selectInfoPanel(targetPanel, targetElement[0]);
    }
    
    // Reset values
    dragStartX = 0;
    dragStartY = 0;
    isDragging = false;
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



