let isDragging = false;
let minZoom = 13;
let maxZoom = 20;

const $bar = $('.zoom-scroll-bar');
const $dot = $('.zoom-dot');

// Calculate zoom level based on dot position
function calculateZoom(clientY) {
    const barRect = $bar[0].getBoundingClientRect();
    const barHeight = barRect.height;
    const barTop = barRect.top;
    
    const positionPercentage = 1 - ((clientY - barTop) / barHeight);
    
    // Convert to zoom level
    const zoomRange = maxZoom - minZoom;
    const newZoom = minZoom + (zoomRange * positionPercentage);
    
    return Math.max(minZoom, Math.min(maxZoom, newZoom));
}

// Update dot position to match the finger location exactly
function updateDotPosition(clientY) {
    const barRect = $bar[0].getBoundingClientRect();
    const barTop = barRect.top;
    const barHeight = barRect.height;

    // Calculate the offset from the top of the wrapper to the top of the bar
    const wrapperRect = $('.map-zoom-scroll-wrapper')[0].getBoundingClientRect();
    const offset = barTop - wrapperRect.top;

    // Ensure top position is within the bar's boundaries
    let topPosition = clientY - barTop;
    topPosition = Math.max(0, Math.min(topPosition, barHeight));

    // Adjust topPosition to account for the bar's reduced height
    topPosition = (topPosition / barHeight) * barHeight + offset;

    $dot.css('top', `${topPosition}px`);
}

$bar.on('mousedown touchstart', function(e) {
    e.preventDefault();
    isDragging = true;
    $dot.addClass('active');
    
    // Get initial touch position
    const clientY = e.type === 'mousedown' ? e.clientY : e.touches[0].clientY;
    const newZoom = calculateZoom(clientY);
    map.setZoom(newZoom);  // Set precise zoom level
    updateDotPosition(clientY);
});

$(document).on('mousemove touchmove', function(e) {
    if (!isDragging) return;
    e.preventDefault();
    
    const currentY = e.type === 'mousemove' ? e.clientY : e.touches[0].clientY;
    const newZoom = calculateZoom(currentY);
    
    map.setZoom(newZoom); 
    updateDotPosition(currentY);
});

$(document).on('mouseup touchend', function() {
    isDragging = false;
    $dot.removeClass('active');
});
