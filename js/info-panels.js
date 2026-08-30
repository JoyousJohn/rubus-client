// Handle Info Panels menu selection and visibility
// Usage: selectInfoPanel('stops'|'routes'|'network', this)

// Drag/swipe functionality for subpanels
let dragStartX = 0;
let dragStartY = 0;
let dragEndX = 0;
let dragEndY = 0;
let isDragging = false;
let suppressSubpanelClick = false;
let lastSubpanelDragEndTime = 0;
let initialScrollLeft = 0;

// Debug counters for gesture analysis
let ipCounters = {
	starts: 0,
	moves: 0,
	handledMoves: 0,
	ignoredInteractive: 0,
	verticalSkips: 0,
	preventDefaults: 0,
	dragBegins: 0,
	ends: 0
};

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
let lastUserSelectedPanelIndex = 1; // Track user's last explicitly selected panel

// Register custom easing function for smooth momentum
$.easing.momentum = function (x) {
	return 1 - Math.pow(1 - x, 1.5);
};

// Function to move route selectors into the route subpanel
function moveRouteSelectorsToSubpanel() {
    const bottomElement = $('.bottom');
    const routeSelectorsContainer = $('#route-selectors-container');
    window._detachedSimBtn = $('.sim-btn').detach();
    bottomElement.appendTo(routeSelectorsContainer);
}

// Function to move route selectors back to the main page
function moveRouteSelectorsToMain() {
    const bottomElement = $('.bottom');
    bottomElement.insertAfter($('.settings-panel').parent());
    if (window._detachedSimBtn && window._detachedSimBtn.length) {
        $('.route-selectors').append(window._detachedSimBtn);
        window._detachedSimBtn = null;
    }
}

// Function to restore the last selected panel position when opening info panels
function restorePanelPosition() {
	const currentPanel = panelOrder[lastUserSelectedPanelIndex];
	const panelIndex = lastUserSelectedPanelIndex;
	const targetX = -100 * panelIndex * (window.innerWidth / 100);

	// Ensure all subpanel wrappers are visible and enforce DOM order
	const $container = $('.subpanels-container');
	const $allSubpanels = $container.children('.subpanel');
	$allSubpanels.css('display', 'flex');
	const $route = $container.children('.route-panel');
	const $stops = $container.children('.all-stops-panel');
	const $network = $container.children('.buses-panel');
	$container.append($route, $stops, $network);

	// Set widths BEFORE transform
	$container.width(3 * window.innerWidth);
	$allSubpanels.width(window.innerWidth);

	// Disable transitions and apply transform
	$container.css({
		'transition': 'none',
		'transform': 'translateX(' + targetX + 'px)'
	});

	// Update panel classes
	$container.removeClass('panel-stops panel-routes panel-network');
	$container.addClass(`panel-${currentPanel}`);

	// Update currentPanelIndex to match the restored position
	currentPanelIndex = panelIndex;

	// Update header button styling to match the restored panel
	$('.all-stops-selected-menu').removeClass('all-stops-selected-menu');
	const $targetHeaderBtn = $(`.info-panels-header-buttons [data-panel="${currentPanel}"]`);
	if ($targetHeaderBtn.length) {
		$targetHeaderBtn.addClass('all-stops-selected-menu');
	}

	// Re-enable transitions after positioning is complete (only if not dragging)
	setTimeout(() => {
		if (!$container.hasClass('is-dragging-or-animating')) {
			$container.css('transition', 'transform 0.3s ease');
		}
	}, 0);
}

// Calculate target panel position and animate there with physics-like momentum
function animateToTargetPanel(initialVelocity, options) {
	const opts = options || {};

	if (animationFrameId) {
		cancelAnimationFrame(animationFrameId);
		animationFrameId = null;
	}

	const $container = $('.subpanels-container');
	$container.css('transition', 'none');

	const startX = getTranslateX($container);
	let targetPanelIndex = currentPanelIndex;

	// Determine user intent by velocity or displacement direction
	const VELOCITY_INTENT_THRESHOLD = 3; // lowered from 5 to better capture intent
	const DISPLACEMENT_INTENT_THRESHOLD = 40; // px of finger travel to indicate intent

	if (opts.targetIndex === undefined) {
		const visualProgress = -startX / window.innerWidth;
		const hasVelocityIntent = Math.abs(initialVelocity) > VELOCITY_INTENT_THRESHOLD;
		const hasDisplacementIntent = typeof opts.dragDeltaX === 'number' && Math.abs(opts.dragDeltaX) > DISPLACEMENT_INTENT_THRESHOLD;
		if (hasVelocityIntent || hasDisplacementIntent) {
			const directionNegative = hasVelocityIntent ? (initialVelocity < 0) : (opts.dragDeltaX < 0);
			if (directionNegative) {
				// Dragging left (negative) -> move to right panel
				targetPanelIndex = Math.min(panelOrder.length - 1, Math.floor(visualProgress + 0.05) + 1);
			} else {
				// Dragging right (positive) -> move to left panel
				targetPanelIndex = Math.max(0, Math.ceil(visualProgress - 0.05) - 1);
			}
		} else {
			// Low intent: select closest by distance from current visual translation
			targetPanelIndex = Math.max(0, Math.min(panelOrder.length - 1, Math.round(visualProgress)));
		}
	} else {
		// A specific target panel was requested (e.g., header button)
		if (opts.targetIndex < 0 || opts.targetIndex >= panelOrder.length) {
			throw new Error(`[info-panels] Target panel index out of bounds: ${opts.targetIndex}`);
		}
		targetPanelIndex = opts.targetIndex;
	}

	const targetPanel = panelOrder[targetPanelIndex];
	currentPanelIndex = targetPanelIndex;
	lastUserSelectedPanelIndex = targetPanelIndex;
	const targetX = -100 * targetPanelIndex * (window.innerWidth / 100);

	const distance = Math.abs(targetX - startX);
	const velocityMagnitude = Math.abs(initialVelocity);
	const baseDuration = 125;
	const velocityDuration = Math.min(velocityMagnitude * 3, 200);
	const totalDuration = Math.max(baseDuration, velocityDuration);

	const targetElement = $(`.info-panels-header-buttons [data-panel="${targetPanel}"]`);
	$('.all-stops-selected-menu').removeClass('all-stops-selected-menu');
	if (targetElement.length) {
		targetElement.addClass('all-stops-selected-menu');
	}

	const startTime = performance.now();
	function frame(currentTime) {
		const elapsedTime = currentTime - startTime;
		let progress = Math.min(elapsedTime / totalDuration, 1);
		progress = $.easing.momentum(progress);
		const newX = startX + (targetX - startX) * progress;
		$container.css('transform', 'translateX(' + newX + 'px)');
		if (elapsedTime < totalDuration) {
			animationFrameId = requestAnimationFrame(frame);
		} else {
			$container.css('transform', 'translateX(' + targetX + 'px)');
			$container.removeClass('is-dragging-or-animating');
			updatePanelPosition(targetPanel, { skipMove: true });
			animationFrameId = null;
		}
	}
	animationFrameId = requestAnimationFrame(frame);
}

function selectInfoPanel(panel, element, isUserExplicitSelection = true) {
	const targetIndex = panelOrder.indexOf(panel);
	if (targetIndex === -1) {
		throw new Error(`[info-panels] Unknown panel identifier: "${panel}"`);
	}
	const $container = $('.subpanels-container');
	const currentX = getTranslateX($container);
	const targetX = -targetIndex * window.innerWidth;
	const isCurrentlyAtTarget = (currentPanelIndex === targetIndex && Math.abs(currentX - targetX) < 2 && !animationFrameId);

	if (!isCurrentlyAtTarget) {
		const artificialVelocity = 25;
		const options = { targetIndex: targetIndex };
		animateToTargetPanel(artificialVelocity, options);
	}
	$('.all-stops-selected-menu').removeClass('all-stops-selected-menu');
	const targetBtn = element || $(`.info-panels-header-buttons [data-panel="${panel}"]`)[0];
	if (targetBtn) {
		$(targetBtn).addClass('all-stops-selected-menu');
	}
	// Only update user's last selected panel if this is an explicit user action
	if (isUserExplicitSelection) {
		lastUserSelectedPanelIndex = targetIndex;
	}
}

// Handle closing the info panels wrapper
$('.info-panels-close').click(function() {
	console.log('Info panels close button clicked');
	$('.info-panels-show-hide-wrapper').hide();
    moveRouteSelectorsToMain();
    $('.bottom').show();
    $('.bottom').css('bottom', '0px');
    $('.left-btns, .right-btns, .route-selectors').show();
    
    // Only show settings button if no stop is currently selected
    if (!popupStopId) {
        $('.settings-btn').show();
        showSimBtnIfEligible();
    }
    $('.info-panels-close').show();
    // Restore original route selection if needed
    closeRouteMenu();
})

// Function to update panel position visually
function updatePanelPosition(panel, options) {
	const opts = options || {};
	const $container = $('.subpanels-container');
	$container.removeClass('panel-stops panel-routes panel-network');
	$container.addClass(`panel-${panel}`);

	const panelIndex = panelOrder.indexOf(panel);
	if (panelIndex === -1) {
		throw new Error(`[info-panels] Unknown panel identifier: "${panel}"`);
	}
	currentPanelIndex = panelIndex;
	lastUserSelectedPanelIndex = panelIndex;

	if (opts.skipMove) {
		return;
	}
	const targetX = -100 * panelIndex * (window.innerWidth / 100);
	$container.css({
		'transition': 'none',
		'transform': 'translateX(' + targetX + 'px)'
	});
	setTimeout(() => {
		if (!$container.hasClass('is-dragging-or-animating')) {
			$container.css('transition', 'transform 0.3s ease');
		}
	}, 0);
}

let initialTransformX = 0;
let animationFrameId = null;

// Unified pointer event handlers for touch and mouse
$('.info-panels-content').on('touchstart mousedown', function(e) {
	if (animationFrameId) {
		cancelAnimationFrame(animationFrameId);
		animationFrameId = null;
	}
	const $container = $('.subpanels-container');
	$container.stop(true).addClass('is-dragging-or-animating');
	// Ensure no CSS transition interferes with JS-driven drag
	$container.css('transition', 'none');

	ipCounters.starts += 1;
	const isTouch = e.type === 'touchstart';
	const sx = isTouch ? e.originalEvent.touches[0].clientX : e.clientX;
	const sy = isTouch ? e.originalEvent.touches[0].clientY : e.clientY;
	const currentX = getTranslateX($container);
	console.log('[IP] start', { type: e.type, x: sx, y: sy, currentX, starts: ipCounters.starts });

	if (!isTouch) {
		if (Date.now() - lastTouchEndTime < 400) {
			console.log('[IP] mousedown suppressed due to recent touch');
			return;
		}
	}
	if (isTouch) {
        dragStartX = e.originalEvent.touches[0].clientX;
        dragStartY = e.originalEvent.touches[0].clientY;
    } else {
        dragStartX = e.clientX;
        dragStartY = e.clientY;
    }
	dragEndX = dragStartX;
	dragEndY = dragStartY;
	initialTransformX = getTranslateX($container);
	velocityX = 0;
	lastMoveTime = 0;
	lastMoveX = dragStartX;
	touchStartTime = Date.now();
    isDragging = false;
});

$('.info-panels-content').on('touchmove mousemove', function(e) {
    if (!dragStartX || !dragStartY) return;
	ipCounters.moves += 1;
	const $container = $('.subpanels-container');
    const target = $(e.target);
	if (target.closest('.bottom, .route-selectors, .route-selector, .ridership-chart-wrapper, #ridership-chart, .route-header, .route-star, .color-circle, button, input, select').length > 0) {
		ipCounters.ignoredInteractive += 1;
		console.log('[IP] move ignored: interactive target', { type: e.type, moves: ipCounters.moves, ignoredInteractive: ipCounters.ignoredInteractive });
		return;
	}
    if (e.type === 'touchmove') {
        dragEndX = e.originalEvent.touches[0].clientX;
        dragEndY = e.originalEvent.touches[0].clientY;
    } else {
        dragEndX = e.clientX;
        dragEndY = e.clientY;
    }
    const deltaX = dragEndX - dragStartX;
    const deltaY = dragEndY - dragStartY;
	const touchDuration = Date.now() - touchStartTime;
	const horizontalDominant = Math.abs(deltaX) > Math.abs(deltaY);
	const distanceIntent = Math.abs(deltaX) > 20; // quicker flicks
	const timeAndDistanceIntent = Math.abs(deltaX) > 12; // remove strict time gate for responsiveness
	const meetsThreshold = horizontalDominant && (distanceIntent || timeAndDistanceIntent);
	console.log('[IP] move', { type: e.type, dx: deltaX, dy: deltaY, durationMs: touchDuration, meetsThreshold, isDragging });
	if (meetsThreshold) {
		if (!isDragging || Math.abs(deltaX) > Math.abs(deltaY)) {
        isDragging = true;
			suppressSubpanelClick = true;
			lastSubpanelDragEndTime = Date.now();
			if (horizontalDominant && Math.abs(deltaX) > 12) {
				ipCounters.preventDefaults += 1;
				e.preventDefault();
				console.log('[IP] preventDefault on move', { preventDefaults: ipCounters.preventDefaults });
			}
			const currentTime = Date.now();
			if (lastMoveTime > 0) {
				const timeDelta = currentTime - lastMoveTime;
				const positionDelta = dragEndX - lastMoveX;
				if (timeDelta > 0) {
					velocityX = positionDelta / timeDelta;
					console.log('[IP] velocity update', { vPxPerMs: velocityX, dt: timeDelta, dx: positionDelta });
				}
			}
			if (ipCounters.handledMoves === 0) {
				ipCounters.dragBegins += 1;
				console.log('[IP] drag begin', { dragBegins: ipCounters.dragBegins });
			}
			lastMoveTime = currentTime;
			lastMoveX = dragEndX;
			const newTransformX = initialTransformX + deltaX;
			$container.css('transform', 'translateX(' + newTransformX + 'px)');
			ipCounters.handledMoves += 1;
		}
	} else if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 15) {
		ipCounters.verticalSkips += 1;
		console.log('[IP] move treated as vertical scroll', { dx: deltaX, dy: deltaY, verticalSkips: ipCounters.verticalSkips });
		isDragging = false;
		return;
    }
});

$('.info-panels-content').on('touchend mouseup', function(e) {
	ipCounters.ends += 1;
	if (e.type === 'mouseup' && Date.now() - lastTouchEndTime < 400) {
		console.log('[IP] mouseup suppressed due to recent touch');
		return;
	}
	if (e.type === 'touchend') {
		lastTouchEndTime = Date.now();
		if (e.originalEvent && e.originalEvent.changedTouches && e.originalEvent.changedTouches[0]) {
			dragEndX = e.originalEvent.changedTouches[0].clientX;
			dragEndY = e.originalEvent.changedTouches[0].clientY;
		}
	} else if (e.type === 'mouseup') {
		dragEndX = e.clientX;
		dragEndY = e.clientY;
	}
    const target = $(e.target);
    const isInteractive = target.closest('.bottom, .route-selectors, .route-selector, .ridership-chart-wrapper, #ridership-chart, .route-header, .route-star, .color-circle, button, input, select').length > 0;
    if (isInteractive && !isDragging && (!dragStartX || Math.abs(dragEndX - dragStartX) < 10)) {
		console.log('[IP] end ignored: interactive area');
        dragStartX = dragStartY = dragEndX = dragEndY = 0;
        isDragging = false;
		lastMoveTime = 0;
		lastMoveX = 0;
		return;
    }
	const totalDx = dragEndX - dragStartX;
	const totalDy = dragEndY - dragStartY;
	const totalDuration = Date.now() - touchStartTime;
	const didDragGesture = isDragging || (dragStartX && (Math.abs(totalDx) > 10 || Math.abs(totalDy) > 15));
	if (didDragGesture) {
		suppressSubpanelClick = true;
		lastSubpanelDragEndTime = Date.now();
	}
    if (isDragging && dragStartX && dragStartY) {
		const scaledVelocity = velocityX * 20;
		console.log('[IP] end -> animate', { dx: totalDx, vScaled: scaledVelocity, handledMoves: ipCounters.handledMoves, totalMoves: ipCounters.moves });
		animateToTargetPanel(scaledVelocity, { dragDeltaX: totalDx });
	} else {
		// Flick fallback: animate based on displacement even if drag never crossed move threshold
		const horizontalDominant = Math.abs(totalDx) > Math.abs(totalDy);
		if (isDragging && horizontalDominant && Math.abs(totalDx) > 20) {
			const vScaled = totalDuration > 0 ? (totalDx / totalDuration) * 20 : 0;
			console.log('[IP] end -> flick animate', { dx: totalDx, vScaled: vScaled, durationMs: totalDuration });
			animateToTargetPanel(vScaled, { dragDeltaX: totalDx });
		} else {
			const $container = $('.subpanels-container');
			const currentX = getTranslateX($container);
			const expectedX = -currentPanelIndex * window.innerWidth;
			if (Math.abs(currentX - expectedX) > 5) {
				animateToTargetPanel(0, { targetIndex: currentPanelIndex });
			} else {
				console.log('[IP] end without drag', { isDragging, hasStart: !!dragStartX });
			}
		}
	}
	console.log('[IP] gesture summary', JSON.stringify(ipCounters));
	// reset counters for next gesture
	ipCounters.moves = 0;
	ipCounters.handledMoves = 0;
	ipCounters.ignoredInteractive = 0;
	ipCounters.verticalSkips = 0;
	ipCounters.preventDefaults = 0;

    dragStartX = 0;
    dragStartY = 0;
    isDragging = false;
	lastMoveTime = 0;
	lastMoveX = 0;
	touchStartTime = 0;
});

$('.info-panels-content').on('contextmenu', function(e) {
    if (dragStartX) {
		console.log('[IP] contextmenu prevented during drag');
        e.preventDefault();
    }
});

$('.info-panels-content').on('mouseleave touchcancel', function(e) {
	console.log('[IP] pointer cancel/leave');
	if (isDragging && dragStartX && dragEndX) {
		suppressSubpanelClick = true;
		lastSubpanelDragEndTime = Date.now();
		const totalDx = dragEndX - dragStartX;
		animateToTargetPanel(velocityX * 20, { dragDeltaX: totalDx });
	} else if ($('.subpanels-container').hasClass('is-dragging-or-animating') && !animationFrameId) {
		animateToTargetPanel(0);
	}
    dragStartX = 0;
    dragStartY = 0;
    isDragging = false;
	lastMoveTime = 0;
	lastMoveX = 0;
	velocityX = 0;
	touchStartTime = 0;
});

// Suppress accidental taps/clicks when swiping between subpanels
document.addEventListener('click', function(e) {
	if (suppressSubpanelClick || (lastSubpanelDragEndTime > 0 && Date.now() - lastSubpanelDragEndTime < 350)) {
		const target = $(e.target);
		if (target.closest('.info-panels-content').length > 0) {
			console.log('[IP] click suppressed due to subpanel drag');
			e.stopPropagation();
			e.stopImmediatePropagation();
			e.preventDefault();
			suppressSubpanelClick = false;
			return false;
		}
	}
}, true);

function navigateToPanel(direction) {
    const newIndex = currentPanelIndex + direction;
    if (newIndex < 0 || newIndex >= panelOrder.length) return;
    const newPanel = panelOrder[newIndex];
    const newElement = $(`.info-panels-header-buttons [data-panel="${newPanel}"]`);
    selectInfoPanel(newPanel, newElement[0]);
}

// Handle window resize while info panels are open
$(window).on('resize', function() {
	if ($('.info-panels-show-hide-wrapper').is(':visible')) {
		const $container = $('.subpanels-container');
		const $allSubpanels = $container.children('.subpanel');
		$container.width(3 * window.innerWidth);
		$allSubpanels.width(window.innerWidth);
		const targetX = -currentPanelIndex * window.innerWidth;
		$container.css({
			'transition': 'none',
			'transform': 'translateX(' + targetX + 'px)'
		});
	}
});

// Monitor for multiple animation calls
let animationCallCount = 0;
const originalAnimateToTargetPanel = animateToTargetPanel;
animateToTargetPanel = function(velocity, options) {
	animationCallCount++;
	console.log('[IP] animateToTargetPanel called', { count: animationCallCount, velocity, options });
	return originalAnimateToTargetPanel(velocity, options);
};

// Non-passive touchmove listener removed - was causing interference
