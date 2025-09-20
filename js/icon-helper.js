// Icon helper functions for transitioning from FontAwesome to custom SVGs

/**
 * Replace FontAwesome icons with custom SVG icons
 * Call this function after the page loads to convert existing icons
 */
function replaceFontAwesomeIcons() {
    // Mapping of FontAwesome classes to custom icon classes
    const iconMap = {
        'fa-solid fa-building': 'icon icon-building',
        'fa-solid fa-square-parking': 'icon icon-parking',
        'fa-solid fa-bus-simple': 'icon icon-bus-simple',
        'fa-solid fa-route': 'icon icon-route',
        'fa-solid fa-bolt': 'icon icon-bolt',
        'fa-solid fa-arrow-left': 'icon icon-arrow-left',
        'fa-solid fa-map-pin': 'icon icon-map-pin',
        'fa-regular fa-message': 'icon icon-message',
        'fa-solid fa-clock': 'icon icon-clock',
        'fa-solid fa-share-nodes': 'icon icon-share-nodes',
        'fa-regular fa-star': 'icon icon-star',
        'fa-solid fa-star': 'icon icon-star-solid',
        'fa-solid fa-phone': 'icon icon-phone',
        'fa-solid fa-person-walking': 'icon icon-person-walking',
        'fa-solid fa-diamond-turn-right': 'icon icon-diamond-turn-right',
        'fa-solid fa-location-dot': 'icon icon-location-dot',
        'fa-solid fa-bus': 'icon icon-bus',
        'fa fa-arrow-up': 'icon icon-arrow-up',
        'fa-solid fa-arrow-right-arrow-left': 'icon icon-arrow-right-arrow-left',
        'fa-solid fa-location-pin': 'icon icon-location-pin',
        'fa-solid fa-clock-rotate-left': 'icon icon-clock-rotate-left',
        'fa-solid fa-rocket': 'icon icon-rocket',
        'fa-solid fa-fire-flame-curved': 'icon icon-fire-flame-curved',
        'fa-solid fa-earth-americas': 'icon icon-earth-americas',
        'fa-solid fa-comments': 'icon icon-comments',
        'fa-solid fa-search': 'icon icon-search',
        'fa-solid fa-bahai': 'icon icon-bahai',
        'fa-solid fa-location-arrow': 'icon icon-location-arrow',
        'fa-solid fa-location-crosshairs': 'icon icon-location-crosshairs',
        'fa-solid fa-gear': 'icon icon-gear',
        'fa-solid fa-filter': 'icon icon-filter'
    };

    // Replace all FontAwesome icons
    Object.entries(iconMap).forEach(([faClass, customClass]) => {
        const elements = document.querySelectorAll(`i.${faClass.replace(' ', '.')}`);
        elements.forEach(element => {
            element.className = customClass;
        });
    });
}

/**
 * Create an icon element with custom SVG
 * @param {string} iconName - The name of the icon (without 'icon-' prefix)
 * @param {string} size - Optional size class (sm, lg, xl, 2x)
 * @param {string} color - Optional color class (white, black, gray)
 * @returns {HTMLElement} - The icon element
 */
function createIcon(iconName, size = '', color = '') {
    const icon = document.createElement('span');
    icon.className = `icon icon-${iconName}`;
    
    if (size) icon.classList.add(`icon-${size}`);
    if (color) icon.classList.add(`icon-${color}`);
    
    return icon;
}

// Auto-replace icons when DOM is loaded
document.addEventListener('DOMContentLoaded', replaceFontAwesomeIcons);

// Also replace icons after dynamic content is added
const observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
        if (mutation.type === 'childList') {
            // Check if any new FontAwesome icons were added
            const faIcons = mutation.target.querySelectorAll ? 
                mutation.target.querySelectorAll('i[class*="fa-"]') : [];
            if (faIcons.length > 0) {
                console.log('Found', faIcons.length, 'FontAwesome icons, converting...');
                replaceFontAwesomeIcons();
            }
        }
    });
});

// Start observing
observer.observe(document.body, {
    childList: true,
    subtree: true
});
