// Handle Info Panels menu selection and visibility
// Usage: selectInfoPanel('stops'|'routes'|'network', this)

function selectInfoPanel(panel, element) {
    try {
        // Toggle selected menu class
        $('.all-stops-selected-menu').removeClass('all-stops-selected-menu');
        if (element) {
            $(element).addClass('all-stops-selected-menu');
        }

        // Show/hide sections based on selection
        if (panel === 'stops') {
            $('.buses-panel-wrapper').hide();
            $('.route-panel-wrapper').hide();
            $('.all-stops-inner').show();
            $('.bottom').hide();
            $('.route-close').css('display', 'none');
            $('.info-panels-close').show();
        } else if (panel === 'routes') {
            $('.all-stops-inner').hide();
            $('.buses-panel-wrapper').hide();
            $('.route-panel-wrapper').show();
            
            // Show bottom container and only route selectors, hide other buttons that open wrappers
            $('.bottom').show();
            $('.left-btns, .right-btns').hide();
            $('.route-selectors').show();
            $('.settings-btn').hide();
            
            // Show route close button and hide info panels close button
            $('.route-close').css('display', 'flex').css('height', $('.route-selector').innerHeight());
            $('.info-panels-close').hide();
        } else if (panel === 'network') {
            $('.all-stops-inner').hide();
            $('.route-panel-wrapper').hide();
            $('.buses-panel-wrapper').show();
            $('.bottom').hide();
            $('.route-close').css('display', 'none');
            $('.info-panels-close').show();
            // Ensure overview panel is visible and updated
            busesOverview();
        }
    } catch (error) {
        console.error('Error selecting info panel:', error);
    }
}

// Handle closing the info panels wrapper
$('.info-panels-close').click(function() {
    $('.info-panels-wrapper').hide();
    $('.bottom').show();
    // Ensure all buttons are visible when info panels are closed
    $('.left-btns, .right-btns, .route-selectors, .settings-btn').show();
    $('.route-close').css('display', 'none');
    $('.info-panels-close').show();
})

// Handle closing via the route close button
$('.route-close').click(function() {
    closeRouteMenu();
})


