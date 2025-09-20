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
            
            // Set bottom position to be above the info-panels-header-buttons
            const headerButtonsHeight = $('.info-panels-header-buttons').height();
            $('.bottom').css('bottom', headerButtonsHeight + 'px');
            
            // Hide the favorite star icon when routes menu opens
            $('.route-selector[routeName="fav"]').hide();
            
            // Hide info panels close button
            $('.info-panels-close').hide();
        } else if (panel === 'network') {
            $('.all-stops-inner').hide();
            $('.route-panel-wrapper').hide();
            $('.buses-panel-wrapper').show();
            $('.bottom').hide();
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
    // Reset bottom position to default
    $('.bottom').css('bottom', '0px');
    // Ensure all buttons are visible when info panels are closed
    $('.left-btns, .right-btns, .route-selectors, .settings-btn').show();
    $('.info-panels-close').show();
})



