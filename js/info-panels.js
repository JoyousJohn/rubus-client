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
	return 1 - Math.pow(1 - x, 1.5);
};

// Function to move route selectors into the route subpanel
function moveRouteSelectorsToSubpanel() {
	const bottomElement = $('.bottom');
	const routeSelectorsContainer = $('#route-selectors-container');
	if (bottomElement.length && routeSelectorsContainer.length) {
		bottomElement.appendTo(routeSelectorsContainer);
	}
}

// Function to move route selectors back to the main page
function moveRouteSelectorsToMain() {
	const bottomElement = $('.bottom');
	if (bottomElement.length) {
		bottomElement.insertAfter('.settings-panel');
	}
}

// Function to restore the last selected panel position when opening info panels
function restorePanelPosition() {
	const currentPanel = panelOrder[currentPanelIndex];
	const panelIndex = currentPanelIndex;
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

	// Re-enable transitions after positioning is complete
	setTimeout(() => {
		$container.css('transition', 'transform 0.3s ease');
	}, 0);
}

// Calculate target panel position and animate there with physics-like momentum
function animateToTargetPanel(initialVelocity, options) {
	const opts = options || {};

	if (animationFrameId) {
		cancelAnimationFrame(animationFrameId);
	}

	const $container = $('.subpanels-container');
	$container.css('transition', 'none');

	const startX = getTranslateX($container);
	let targetPanelIndex = currentPanelIndex;

	if (opts.targetIndex === undefined && Math.abs(initialVelocity) > 5) {
		if (initialVelocity < 0) {
			targetPanelIndex = Math.min(currentPanelIndex + 1, panelOrder.length - 1);
		} else {
			targetPanelIndex = Math.max(currentPanelIndex - 1, 0);
		}
	} else if (opts.targetIndex !== undefined) {
		targetPanelIndex = opts.targetIndex;
	} else {
		let closestPanelIndex = 0;
		let minDistance = Infinity;
		for (let i = 0; i < panelOrder.length; i++) {
			const panelX = -100 * i * (window.innerWidth / 100);
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

function selectInfoPanel(panel, element) {
	try {
		const currentPanel = panelOrder[currentPanelIndex];
		const targetIndex = panelOrder.indexOf(panel);
		if (panel !== currentPanel) {
			const artificialVelocity = 25;
			const options = { targetIndex: targetIndex };
			animateToTargetPanel(artificialVelocity, options);
		}
		$('.all-stops-selected-menu').removeClass('all-stops-selected-menu');
		if (element) {
			$(element).addClass('all-stops-selected-menu');
		}
	} catch (error) {}
}

// Handle closing the info panels wrapper
$('.info-panels-close').click(function() {
	$('.info-panels-show-hide-wrapper').hide();
	moveRouteSelectorsToMain();
	$('.bottom').show();
	$('.bottom').css('bottom', '0px');
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
	const panelIndex = panelOrder.indexOf(panel);
	const targetX = -100 * panelIndex * (window.innerWidth / 100);
	$container.css({
		'transition': 'none',
		'transform': 'translateX(' + targetX + 'px)'
	});
	setTimeout(() => {
		$container.css('transition', 'transform 0.3s ease');
	}, 0);
	currentPanelIndex = panelIndex;
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
	if (e.type === 'touchstart') {
		dragStartX = e.originalEvent.touches[0].clientX;
		dragStartY = e.originalEvent.touches[0].clientY;
	} else {
		if (Date.now() - lastTouchEndTime < 400) {
			return;
		}
		dragStartX = e.clientX;
		dragStartY = e.clientY;
	}
	initialTransformX = getTranslateX($container);
	velocityX = 0;
	lastMoveTime = 0;
	lastMoveX = dragStartX;
	touchStartTime = Date.now();
	isDragging = false;
});

$('.info-panels-content').on('touchmove mousemove', function(e) {
	if (!dragStartX || !dragStartY) return;
	const $container = $('.subpanels-container');
	const target = $(e.target);
	if (target.closest('.bottom, .route-selectors, .route-selector, .ridership-chart-wrapper, #ridership-chart, .buses-overview-grid').length > 0) {
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
	if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 25 && touchDuration > 150) {
		if (!isDragging || Math.abs(deltaX) > Math.abs(deltaY)) {
			isDragging = true;
			if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 25) {
				e.preventDefault();
			}
			const currentTime = Date.now();
			if (lastMoveTime > 0) {
				const timeDelta = currentTime - lastMoveTime;
				const positionDelta = dragEndX - lastMoveX;
				if (timeDelta > 0) {
					velocityX = positionDelta / timeDelta;
				}
			}
			lastMoveTime = currentTime;
			lastMoveX = dragEndX;
			const newTransformX = initialTransformX + deltaX;
			$container.css('transform', 'translateX(' + newTransformX + 'px)');
		}
	} else if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 15) {
		isDragging = false;
		return;
	}
});

$('.info-panels-content').on('touchend mouseup', function(e) {
	if (e.type === 'mouseup' && Date.now() - lastTouchEndTime < 400) {
		return;
	}
	if (e.type === 'touchend') {
		lastTouchEndTime = Date.now();
	}
	const target = $(e.target);
	if (target.closest('.bottom, .route-selectors, .route-selector').length > 0) {
		dragStartX = dragStartY = dragEndX = dragEndY = 0;
		isDragging = false;
		lastMoveTime = 0;
		lastMoveX = 0;
		return;
	}
	if (isDragging && dragStartX && dragStartY) {
		const scaledVelocity = velocityX * 20;
		animateToTargetPanel(scaledVelocity);
	}
	dragStartX = 0;
	dragStartY = 0;
	isDragging = false;
	lastMoveTime = 0;
	lastMoveX = 0;
	touchStartTime = 0;
});

$('.info-panels-content').on('contextmenu', function(e) {
	if (dragStartX) {
		e.preventDefault();
	}
});

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
	if (newIndex < 0 || newIndex >= panelOrder.length) return;
	const newPanel = panelOrder[newIndex];
	const newElement = $(`.info-panels-header-buttons [data-panel="${newPanel}"]`);
	currentPanelIndex = newIndex;
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



