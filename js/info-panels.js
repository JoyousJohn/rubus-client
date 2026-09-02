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

	// Update header button styling to match the restored panel (slider indicator)
	if (typeof updateInfoPanelIndicator === 'function') {
		updateInfoPanelIndicator(currentPanel);
	} else {
		$('.all-stops-selected-menu').removeClass('all-stops-selected-menu');
		const $targetHeaderBtn = $(`.info-panels-header-buttons [data-panel="${currentPanel}"]`);
		if ($targetHeaderBtn.length) {
			$targetHeaderBtn.addClass('all-stops-selected-menu');
		}
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
	const startPanelIndex = currentPanelIndex;
	currentPanelIndex = targetPanelIndex;
	if (opts.isUserExplicitSelection !== false) {
		lastUserSelectedPanelIndex = targetPanelIndex;
	}
	const targetX = -100 * targetPanelIndex * (window.innerWidth / 100);

	const distance = Math.abs(targetX - startX);
	const velocityMagnitude = Math.abs(initialVelocity);
	const baseDuration = 125;
	const velocityDuration = Math.min(velocityMagnitude * 3, 200);
	let totalDuration = Math.max(baseDuration, velocityDuration);
	// For explicit clicks (targetIndex defined), match slider indicator — faster than default 300ms
	if (opts.targetIndex !== undefined) {
		totalDuration = 180;
	}

	// Sync slider indicator with container — drive both via same RAF progress (percentage)
	const $slider = $('.info-panel-slider');
	const $indicator = $('.info-panel-indicator');
	let hasIndicatorSync = $slider.length && $indicator.length;
	let startIndicatorLeft = 0;
	let targetIndicatorLeft = 0;
	if (hasIndicatorSync) {
		try {
			const sliderWidth = $slider[0].getBoundingClientRect().width;
			const count = panelOrder.length;
			const optionWidth = sliderWidth / count;
			// Start from current visual position (handles mid-drag snap)
			startIndicatorLeft = $indicator[0].offsetLeft;
			// If offsetLeft is 0 but CSS is calc (initial load), fallback to computed
			if ($indicator.css('left').includes('calc') || startIndicatorLeft === 0) {
				// Use startPanelIndex for fallback
				startIndicatorLeft = startPanelIndex * optionWidth - 3;
			}
			targetIndicatorLeft = targetPanelIndex * optionWidth - 3;
			// Update selected state immediately (color), but drive position via JS
			$slider.find('.info-panel-option').removeClass('selected all-stops-selected-menu');
			const $targetOpt = $slider.find(`[data-panel="${targetPanel}"]`);
			if ($targetOpt.length) {
				$targetOpt.addClass('selected all-stops-selected-menu');
			}
			// Theme color
			try {
				const curTheme = document.documentElement.getAttribute('data-selected-theme') || (typeof settings !== 'undefined' && settings && settings['theme']) || 'beige-coffee';
				const resolved = (typeof resolveAutoTheme === 'function') ? resolveAutoTheme(curTheme) : curTheme;
				if (typeof themeIndicatorColorMap !== 'undefined' && themeIndicatorColorMap[resolved]) {
					$indicator.css({ backgroundColor: themeIndicatorColorMap[resolved].bg, boxShadow: themeIndicatorColorMap[resolved].shadow });
				}
			} catch(e) {}
			// Disable CSS transition — we will drive left via JS for perfect sync
			$indicator.css('transition', 'none');
			// Ensure indicator starts at start position (in case it was at intermediate drag pos, this is already correct)
			// For click from non-drag, this sets it to old position before animating to new
			if (opts.targetIndex !== undefined) {
				$indicator.css('left', startIndicatorLeft + 'px');
				$indicator.css('width', `calc(100% / ${count} + 6px)`);
			}
		} catch(e) { hasIndicatorSync = false; }
	} else {
		if (typeof updateInfoPanelIndicator === 'function') {
			updateInfoPanelIndicator(targetPanel);
		} else {
			const targetElement = $(`.info-panels-header-buttons [data-panel="${targetPanel}"]`);
			$('.all-stops-selected-menu').removeClass('all-stops-selected-menu');
			if (targetElement.length) {
				targetElement.addClass('all-stops-selected-menu');
			}
		}
	}

	const startTime = performance.now();
	function frame(currentTime) {
		const elapsedTime = currentTime - startTime;
		let progress = Math.min(elapsedTime / totalDuration, 1);
		progress = $.easing.momentum(progress);
		const newX = startX + (targetX - startX) * progress;
		$container.css('transform', 'translateX(' + newX + 'px)');
		if (hasIndicatorSync) {
			const newLeft = startIndicatorLeft + (targetIndicatorLeft - startIndicatorLeft) * progress;
			$indicator.css('left', newLeft + 'px');
			// Keep indicator correctly sized during JS drive
			$indicator.css('width', `calc(100% / ${panelOrder.length} + 6px)`);
		}
		if (elapsedTime < totalDuration) {
			animationFrameId = requestAnimationFrame(frame);
		} else {
			$container.css('transform', 'translateX(' + targetX + 'px)');
			$container.removeClass('is-dragging-or-animating');
			if (hasIndicatorSync) {
				$indicator.css('left', targetIndicatorLeft + 'px');
				// Restore CSS transition for future drags/hovers
				$indicator.css('transition', 'left 0.3s ease, width 0.3s ease, top 0.3s ease, height 0.3s ease, background-color 0.3s ease, box-shadow 0.3s ease');
			}
			updatePanelPosition(targetPanel, { skipMove: true, isUserExplicitSelection: opts.isUserExplicitSelection });
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
		const options = { targetIndex: targetIndex, isUserExplicitSelection: isUserExplicitSelection };
		animateToTargetPanel(artificialVelocity, options);
	}
	if (typeof updateInfoPanelIndicator === 'function') {
		updateInfoPanelIndicator(panel);
	} else {
		$('.all-stops-selected-menu').removeClass('all-stops-selected-menu');
		const targetBtn = element || $(`.info-panels-header-buttons [data-panel="${panel}"]`)[0];
		if (targetBtn) {
			$(targetBtn).addClass('all-stops-selected-menu');
		}
	}
	// Only update user's last selected panel if this is an explicit user action
	if (isUserExplicitSelection) {
		lastUserSelectedPanelIndex = targetIndex;
	}
}

// Handle closing the info panels wrapper
$('.info-panels-close').click(function() {
	console.log('Info panels close button clicked');
	if (animationFrameId) {
		cancelAnimationFrame(animationFrameId);
		animationFrameId = null;
	}
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
	if (opts.isUserExplicitSelection !== false) {
		lastUserSelectedPanelIndex = panelIndex;
	}

	// Sync slider indicator with panel (keep legacy class for compat)
	if (typeof updateInfoPanelIndicator === 'function') {
		try { updateInfoPanelIndicator(panel); } catch(e) {}
	}

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

// ── Slider indicator helpers (styled like .campus-slider) ─────────────────
function updateInfoPanelIndicator(panel) {
	if (!panel) {
		if (typeof panelOrder !== 'undefined' && typeof currentPanelIndex !== 'undefined') {
			panel = panelOrder[currentPanelIndex];
		} else {
			panel = 'stops';
		}
	}
	const slider = document.querySelector('.info-panel-slider');
	const indicator = document.querySelector('.info-panel-indicator');
	if (!slider || !indicator) return;
	const target = slider.querySelector(`[data-panel="${panel}"]`);
	if (!target) return;
	const options = slider.querySelectorAll('.info-panel-option');
	const index = Array.from(options).indexOf(target);
	const count = options.length;
	if (index < 0 || count === 0) return;

	// Position indicator like campus-slider (horizontal row)
	indicator.style.left = `calc(${index} * (100% / ${count}) - 3px)`;
	indicator.style.width = `calc(100% / ${count} + 6px)`;
	indicator.style.top = '-3px';
	indicator.style.height = 'calc(100% + 6px)';

	slider.querySelectorAll('.info-panel-option').forEach(opt => {
		opt.classList.remove('selected');
		opt.classList.remove('all-stops-selected-menu');
	});
	target.classList.add('selected');
	target.classList.add('all-stops-selected-menu');
}
window.updateInfoPanelIndicator = updateInfoPanelIndicator;

function initInfoPanelSliderDrag() {
	const slider = document.querySelector('.info-panel-slider');
	const indicator = document.querySelector('.info-panel-indicator');
	if (!slider || !indicator) return;

	let dragging = false;
	let startX = 0;
	let didDrag = false;
	let holdTimer = null;
	let lastClosestPanel = null;

	function getOptionCenter(option) {
		return option.offsetLeft + option.offsetWidth / 2;
	}
	function getClosestPanel(clientX) {
		const rect = slider.getBoundingClientRect();
		const relX = clientX - rect.left;
		const opts = slider.querySelectorAll('.info-panel-option');
		let closest = null;
		let minDist = Infinity;
		opts.forEach(opt => {
			const c = getOptionCenter(opt);
			const d = Math.abs(relX - c);
			if (d < minDist) {
				minDist = d;
				closest = opt;
			}
		});
		return closest;
	}
	function applyPopup() {
		if (indicator.style.top === '-6px') return;
		indicator.style.transition = 'top 0.1s ease, height 0.1s ease, left 0.1s ease, width 0.1s ease, background-color 0.3s ease, box-shadow 0.3s ease';
		indicator.style.top = '-6px';
		indicator.style.height = 'calc(100% + 12px)';
		const curLeft = indicator.offsetLeft;
		const curW = indicator.offsetWidth;
		indicator.style.left = (curLeft - 3) + 'px';
		indicator.style.width = (curW + 6) + 'px';
	}
	function snapToClosest(clientX) {
		const closest = getClosestPanel(clientX);
		if (closest) {
			indicator.style.transition = 'left 0.2s ease, width 0.2s ease, top 0.15s ease, height 0.15s ease, background-color 0.3s ease, box-shadow 0.3s ease';
			indicator.style.top = '-3px';
			indicator.style.height = 'calc(100% + 6px)';
			const panel = closest.getAttribute('data-panel');
			if (panel) {
				// Use existing panel navigation (will update indicator again)
				if (typeof selectInfoPanel === 'function') {
					selectInfoPanel(panel, closest);
				}
			}
		}
		lastClosestPanel = null;
	}
	function shrinkBack() {
		indicator.style.transition = 'left 0.2s ease, width 0.2s ease, top 0.15s ease, height 0.15s ease, background-color 0.3s ease, box-shadow 0.3s ease';
		indicator.style.top = '-3px';
		indicator.style.height = 'calc(100% + 6px)';
		try { updateInfoPanelIndicator(panelOrder[currentPanelIndex]); } catch(e) {}
		// If container was prepared for drag but no drag occurred, restore it
		try {
			const $container = $('.subpanels-container');
			if ($container.length && $container.hasClass('is-dragging-or-animating') && (typeof animationFrameId === 'undefined' || !animationFrameId)) {
				// No panel animation pending (background tap) — snap container back to current panel
				const curPanel = (typeof panelOrder !== 'undefined' && typeof currentPanelIndex !== 'undefined') ? panelOrder[currentPanelIndex] : 'stops';
				const idx = (typeof panelOrder !== 'undefined' ? panelOrder.indexOf(curPanel) : 1);
				const tx = -idx * window.innerWidth;
				$container.css({ 'transition': 'none', 'transform': 'translateX(' + tx + 'px)' });
				setTimeout(() => {
					if (!$container.hasClass('is-dragging-or-animating') || (typeof animationFrameId !== 'undefined' && animationFrameId)) return;
					$container.css('transition', 'transform 0.3s ease');
					$container.removeClass('is-dragging-or-animating');
				}, 50);
				// If no animation is running, clean up class now (will be cleared above or by next animation)
				if (!animationFrameId) {
					setTimeout(() => $container.removeClass('is-dragging-or-animating'), 300);
				}
			}
		} catch(e) {}
	}

	slider.addEventListener('pointerdown', function(e) {
		// Only left button / touch — if target is an option, per-option handler already handled selection/drag
		if (e.target.closest('.info-panel-option')) return;
		if (e.button !== undefined && e.button !== 0) return;
		dragging = true;
		didDrag = false;
		startX = e.clientX;
		lastClosestPanel = null;
		try { slider.setPointerCapture(e.pointerId); } catch(err) {}
		clearTimeout(holdTimer);
		holdTimer = setTimeout(function() {
			if (!dragging || didDrag) return;
			applyPopup();
		}, 400);
		// Prepare container for live drag — mirror content swipe behavior
		try {
			const $container = $('.subpanels-container');
			if ($container.length) {
				if (typeof animationFrameId !== 'undefined' && animationFrameId) {
					cancelAnimationFrame(animationFrameId);
					animationFrameId = null;
				}
				$container.stop(true).addClass('is-dragging-or-animating');
				$container.css('transition', 'none');
			}
		} catch(err) {}
	});

	slider.addEventListener('pointermove', function(e) {
		if (!dragging) return;
		const dx = e.clientX - startX;
		if (Math.abs(dx) > 5) {
			if (!didDrag) {
				clearTimeout(holdTimer);
				applyPopup();
				indicator.style.transition = 'background-color 0.3s ease, box-shadow 0.3s ease';
			}
			didDrag = true;
		}
		if (!didDrag) return;

		const opts = slider.querySelectorAll('.info-panel-option');
		const first = opts[0];
		const last = opts[opts.length - 1];
		const minLeft = first.offsetLeft - 6;
		const maxLeft = last.offsetLeft - 6;
		const rect = slider.getBoundingClientRect();
		const halfW = indicator.offsetWidth / 2;
		let newLeft = (e.clientX - rect.left) - halfW;
		newLeft = Math.max(minLeft, Math.min(maxLeft, newLeft));
		indicator.style.left = newLeft + 'px';

		const closest = getClosestPanel(e.clientX);
		if (closest) {
			const panel = closest.getAttribute('data-panel');
			if (panel !== lastClosestPanel) {
				lastClosestPanel = panel;
				slider.querySelectorAll('.info-panel-option').forEach(o => {
					o.classList.remove('selected');
					o.classList.remove('all-stops-selected-menu');
				});
				closest.classList.add('selected');
				closest.classList.add('all-stops-selected-menu');
				// live theme color already set, no need to change
			}
		}

		// Mirror drag on main container — percentage, not same pixels
		// Slider is not 100% wide, so 10px slider drag != 10px container drag.
		// Map indicator's percentage across its travel (minLeft→maxLeft) to
		// container's percentage across its travel (0→-(n-1)*W).
		try {
			const $container = $('.subpanels-container');
			if ($container.length) {
				const totalTravel = maxLeft - minLeft;
				let indicatorProgress = 0;
				if (totalTravel > 0) {
					indicatorProgress = (newLeft - minLeft) / totalTravel;
				}
				indicatorProgress = Math.max(0, Math.min(1, indicatorProgress));
				const panelCount = (typeof panelOrder !== 'undefined' ? panelOrder.length : 3);
				const targetX = -indicatorProgress * (panelCount - 1) * window.innerWidth;
				$container.css('transform', 'translateX(' + targetX + 'px)');
			}
		} catch(err) {}
	});

	function endDrag(e) {
		if (!dragging) return;
		dragging = false;
		clearTimeout(holdTimer);
		if (didDrag) {
			snapToClosest(e.clientX);
			e.preventDefault();
		} else {
			// Simple tap — select the tapped option if any
			if (lastPointerDownPanel) {
				const opt = slider.querySelector(`[data-panel="${lastPointerDownPanel}"]`);
				if (opt) {
					try { selectInfoPanel(lastPointerDownPanel, opt); } catch(err) {}
				}
			}
			if (indicator.style.top === '-6px') {
				shrinkBack();
			}
		}
		didDrag = false;
	}

	slider.addEventListener('pointerup', endDrag);
	slider.addEventListener('pointercancel', endDrag);

	// Per-option immediate feedback like campus-slider
	// Track last pointerdown panel to suppress duplicate click
	let lastPointerDownPanel = null;
	let lastPointerDownClearTimer = null;
	slider.querySelectorAll('.info-panel-option').forEach(opt => {
		opt.addEventListener('pointerdown', function(e) {
			if (e.button !== undefined && e.button !== 0) return;
			const panel = opt.getAttribute('data-panel');
			if (!panel) return;
			// Cancel any pending clear so a previous gesture's timeout can't
			// null out this new gesture mid-press (caused desync where text
			// recolored but the panel/indicator never animated).
			if (lastPointerDownClearTimer) {
				clearTimeout(lastPointerDownClearTimer);
				lastPointerDownClearTimer = null;
			}
			lastPointerDownPanel = panel;
			// Immediate visual feedback only — actual panel switch happens on pointerup
			// (so click and drag both animate container+indicator together via selectInfoPanel)
			try {
				slider.querySelectorAll('.info-panel-option').forEach(o => {
					o.classList.remove('selected', 'all-stops-selected-menu');
				});
				opt.classList.add('selected', 'all-stops-selected-menu');
			} catch(err) {}
			// Prepare for potential drag — reuse slider's dragging state
			if (!dragging) {
				dragging = true;
				didDrag = false;
				startX = e.clientX;
				lastClosestPanel = panel;
				try { slider.setPointerCapture(e.pointerId); } catch(err) {}
				clearTimeout(holdTimer);
			} else {
				lastClosestPanel = panel;
			}
		});
		// Fallback click for non-pointer devices / accessibility; suppress if pointer already handled
		opt.addEventListener('click', function(e) {
			const panel = opt.getAttribute('data-panel');
			if (!panel) return;
			// If pointerdown just handled this panel (within 500ms), ignore duplicate click
			if (lastPointerDownPanel === panel) {
				// If an animation is already running to this panel, don't restart
				if (typeof animationFrameId !== 'undefined' && animationFrameId) {
					e.preventDefault();
					e.stopImmediatePropagation();
					return;
				}
				// For simple tap, pointerdown already selected — just prevent double animation
				if (panelOrder[currentPanelIndex] === panel) {
					e.preventDefault();
					e.stopImmediatePropagation();
					return;
				}
			}
			try { if (typeof selectInfoPanel === 'function') selectInfoPanel(panel, opt); } catch(err) {}
		});
	});
	// Clear pointer panel after click phase (allow the same-gesture click fallback to see it)
	slider.addEventListener('pointerup', function() {
		if (lastPointerDownClearTimer) clearTimeout(lastPointerDownClearTimer);
		lastPointerDownClearTimer = setTimeout(() => { lastPointerDownPanel = null; }, 500);
	});

	// Keep indicator in sync with theme changes
	try {
		const obs = new MutationObserver(function() {
			try { updateInfoPanelIndicator(panelOrder[currentPanelIndex]); } catch(e) {}
		});
		obs.observe(document.documentElement, { attributes: true, attributeFilter: ['theme', 'data-selected-theme'] });
	} catch(e) {}
}

// Initialize after DOM ready
$(function() {
	try { updateInfoPanelIndicator(panelOrder[lastUserSelectedPanelIndex] || 'stops'); } catch(e) {}
	try { initInfoPanelSliderDrag(); } catch(e) { console.warn('initInfoPanelSliderDrag failed', e); }
});

let initialTransformX = 0;
let animationFrameId = null;
window.cancelInfoPanelAnimation = function() {
	if (animationFrameId) {
		cancelAnimationFrame(animationFrameId);
		animationFrameId = null;
	}
};

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
	const distanceIntent = Math.abs(deltaX) > 25; // quicker flicks
	const timeAndDistanceIntent = Math.abs(deltaX) > 20; // threshold for intentional horizontal swipe
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
			// Sync slider indicator with main drag — percentage (opposite direction, same progress)
			try {
				const $slider = $('.info-panel-slider');
				const $indicator = $('.info-panel-indicator');
				if ($slider.length && $indicator.length) {
					const opts = $slider[0].querySelectorAll('.info-panel-option');
					if (opts.length) {
						const first = opts[0];
						const last = opts[opts.length - 1];
						const minLeft = first.offsetLeft - 3;
						const maxLeft = last.offsetLeft - 3;
						const totalTravel = maxLeft - minLeft;
						const panelCount = panelOrder.length;
						const containerProgress = Math.max(0, Math.min(1, -newTransformX / ((panelCount - 1) * window.innerWidth)));
						const newIndicatorLeft = minLeft + containerProgress * totalTravel;
						$indicator.css('transition', 'none');
						$indicator.css('left', newIndicatorLeft + 'px');
						const closestIdx = Math.round(containerProgress * (panelCount - 1));
						const closestPanel = panelOrder[closestIdx];
						if (closestPanel) {
							$slider.find('.info-panel-option').removeClass('selected all-stops-selected-menu');
							$slider.find(`[data-panel="${closestPanel}"]`).addClass('selected all-stops-selected-menu');
						}
					}
				}
			} catch(e) {}
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
    const isInteractive = target.closest('.bottom, .route-selectors, .route-selector, .ridership-chart-wrapper, #ridership-chart, .route-header, .route-star, .color-circle, button, input, select, .incoming-wrapper, .incoming-list, .all-stops-grid, .campus-stops-list, .route-stops-grid').length > 0;
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
