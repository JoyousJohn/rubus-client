// js/centerme.js - extracted verbatim from js/map.js
let userPosition;

function centerme() {
    const $btn = $('.centerme');
    
    // Prevent multiple simultaneous location requests
    if ($btn.data('location-requesting')) {
        return;
    }
    
    // Check if we're already at user location and haven't moved since
    if (userPosition && $btn.hasClass('btn-feedback-active')) {
        // Check if we're still at the same location
        const currentCenter = L.latLng(map.getCenter());
        const userLatLng = L.latLng(userPosition);
        const distance = currentCenter.distanceTo(userLatLng);
        
        // If we're still at the user location, don't allow another press
        if (distance < 1) { // Very small threshold just to prevent exact duplicate presses
            return;
        }
    }
    
    // Clear any existing timeout and restore state
    if ($btn.data('feedback-timeout')) {
        clearTimeout($btn.data('feedback-timeout'));
        $btn.removeData('feedback-timeout');
    }
    
    // Mark that centerme is in progress to prevent clearing feedback during operation
    $btn.data('centerme-in-progress', true);
    
    // Apply feedback state immediately and keep it active until map moves
    $btn.addClass('btn-feedback-active');

    // Set up immediate drag handler to clear feedback if user interrupts animation
    const immediateCentermeDragHandler = () => {
        $btn.removeClass('btn-feedback-active');
        $btn.removeData('centerme-in-progress');
        map.off('dragstart', immediateCentermeDragHandler);
    };
    map.on('dragstart', immediateCentermeDragHandler);

    if (userPosition) {
        // User position already available - fly to location and keep background active
        map.flyTo(userPosition, 16, {
            animate: true,
            duration: 0.3
        });
        hideInfoBoxes(true);
        $('.my-location-popup').show();
        if (typeof hideCenterStops === 'function') hideCenterStops();

        // Clear other location button backgrounds since we're flying to location (force clear to override in-progress states)
        clearPanoutFeedback();
        clearFlyToClosestStopFeedback(true);
        
        // Set up centerme feedback clearing after flyTo animation completes
        const onFlyToComplete = () => {
            // Mark centerme as no longer in progress
            $btn.removeData('centerme-in-progress');
            // Set up drag handler to clear centerme feedback when user manually moves map
            // (only if the immediate handler hasn't already been triggered)
            if ($btn.hasClass('btn-feedback-active')) {
                const centermeDragHandler = () => {
                    clearCentermeFeedback();
                    map.off('dragstart', centermeDragHandler);
                };
                map.on('dragstart', centermeDragHandler);
            }
        };

        // Listen for moveend to know when flyTo animation is complete
        const moveEndHandler = () => {
            map.off('moveend', moveEndHandler);
            onFlyToComplete();
        };
        map.on('moveend', moveEndHandler);
        
        return;
    }

    if (navigator.geolocation) {
        // Mark that we're requesting location
        $btn.data('location-requesting', true);
        
        // Switch from static feedback to pulse animation
        $btn.removeClass('btn-feedback-active').addClass('btn-pulse');

        console.log("Trying to get location...")
        $('.getting-location-popup').fadeIn(300);

        navigator.geolocation.getCurrentPosition((position) => {
            // Location request succeeded - remove feedback state
            $btn.removeClass('btn-pulse');
            $btn.removeData('location-requesting');
            
            const userLat = position.coords.latitude;
            const userLong = position.coords.longitude;
            userPosition = [userLat, userLong];

            // Remove any existing location marker before adding a new one,
            // so both this flow and handleNearestStop share the same global
            if (window.locationMarker) {
                window.locationMarker.remove();
                window.locationMarker = null;
            }

            marker = L.marker(userPosition, 
                { icon: createLocationMarkerIcon() }
            )
            .addTo(map)
            .on('click', function() {
                $('.bus-info-popup, .stop-info-popup').hide();  
                $('.my-location-popup').show();
                if (typeof hideCenterStops === 'function') hideCenterStops();
                sourceStopId = null;
                sourceBusName = null;
            });

            // Check distance before flying and showing nearest stop button
            const closestStop = findClosestStop(userLat, userLong);
            const closestDistance = closestStop.distance / 1000 * 0.621371; // Convert meters to miles
            
            if (closestDistance < maxDistanceMiles || settings['toggle-bypass-max-distance']) {
                // Only fly to location if within distance limit
map.flyTo(userPosition, 16, {
                    animate: true,
                    duration: 0.3
                });

                // Clear panout background since we're flying to location
                clearPanoutFeedback();

                // Set up centerme feedback clearing after flyTo animation completes
                const onFlyToComplete = () => {
                    // Mark centerme as no longer in progress
                    $btn.removeData('centerme-in-progress');
                    // Set up drag handler to clear centerme feedback when user manually moves map
                    // (only if the immediate handler hasn't already been triggered)
                    if ($btn.hasClass('btn-feedback-active')) {
                        const centermeDragHandler = () => {
                            clearCentermeFeedback();
                            map.off('dragstart', centermeDragHandler);
                        };
                        map.on('dragstart', centermeDragHandler);
                    }
                };

                // Listen for moveend to know when flyTo animation is complete
                const moveEndHandler = () => {
                    map.off('moveend', moveEndHandler);
                    onFlyToComplete();
                };
                map.on('moveend', moveEndHandler);

                $('.fly-closest-stop-wrapper').show();
            }

            hideInfoBoxes();

            if(!locationShared) {
                localStorage.setItem('locationShared', true);
                locationShared = true;
            }

            findNearestStop(false);

        }, (error) => {
            // Location request failed - remove feedback state
            $btn.removeClass('btn-pulse');
            $btn.removeData('location-requesting');
            
            console.error('Error getting user location:', error);
            $('.getting-location-popup').slideUp();
        }, {
            enableHighAccuracy: true,
        });
    } else {
        // Geolocation not supported - remove feedback state
        $btn.removeClass('btn-feedback-active');
        console.error('Geolocation is not supported by this browser.');
    }

    sa_event('btn_press', {
        'btn': 'centerme'
    });
}

// Method to calculate Haversine distance between two points in miles
function haversine(lat1, lon1, lat2, lon2) {
    const R = 3958.8; // Radius of Earth in miles
    const toRadians = (degree) => degree * (Math.PI / 180);
    lat1 = toRadians(lat1);
    lon1 = toRadians(lon1);
    lat2 = toRadians(lat2);
    lon2 = toRadians(lon2);
    const dLat = lat2 - lat1;
    const dLon = lon2 - lon1;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}
