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

// Helper function to get the current X translation from a CSS transform matrix
// (covers translateX / translate3d / matrix — used for container + indicator)
function getTranslateX($element) {
	const el = $element && $element[0] ? $element[0] : $element;
	if (!el) return 0;
	// Fast path: inline style we set ourselves (translateX(Npx) / translate3d)
	try {
		const inline = el.style && el.style.transform;
		if (inline && inline !== 'none') {
			const m = /translate(?:3d|X)\(\s*(-?\d+\.?\d*)px/.exec(inline);
			if (m) return parseFloat(m[1]);
		}
	} catch(e) {}
	const transformMatrix = $element.css ? $element.css('transform') : getComputedStyle(el).transform;
	if (transformMatrix && transformMatrix !== 'none') {
		const matrixValues = transformMatrix.match(/matrix.*\((.+)\)/)[1].split(', ');
		return parseFloat(matrixValues[4]);
	}
	return 0;
}

// Compositor-friendly writes: transform-only, no layout properties.
// Container + indicator are promoted via will-change in CSS.
function setContainerX($container, x) {
	$container.css('transform', 'translate3d(' + x + 'px, 0, 0)');
}
function setIndicatorX($indicator, x) {
	$indicator.css('transform', 'translateX(' + x + 'px)');
}
function getIndicatorX($indicator) {
	if (!$indicator || !$indicator.length) return 0;
	return getTranslateX($indicator);
}
// Measure slider option width once per gesture/animation — NOT per move frame.
function measureInfoSlider() {
	const slider = document.querySelector('.info-panel-slider');
	if (!slider) return { slider: null, indicator: null, optionWidth: 0, count: panelOrder.length };
	const indicator = slider.querySelector('.info-panel-indicator');
	const count = slider.querySelectorAll('.info-panel-option').length || panelOrder.length;
	const w = slider.getBoundingClientRect().width;
	return { slider, indicator, optionWidth: count ? w / count : 0, count };
}
const INFO_INDICATOR_TRANSITION = 'transform 0.3s ease, width 0.3s ease, top 0.3s ease, height 0.3s ease, background-color 0.3s ease, box-shadow 0.3s ease';
const INFO_INDICATOR_NO_TRANSITION = 'background-color 0.3s ease, box-shadow 0.3s ease';

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

// Persist the last explicitly selected subpanel across reloads/sessions.
// Stored as the panel name (not the index) so reorderings stay valid.
const INFO_PANEL_STORAGE_KEY = 'rubus_info_panel_last_subpanel';
function readPersistedSubpanelIndex() {
	try {
		const idx = panelOrder.indexOf(localStorage.getItem(INFO_PANEL_STORAGE_KEY));
		if (idx !== -1) return idx;
	} catch(e) {}
	return 1;
}
function setLastUserSelectedPanelIndex(idx) {
	lastUserSelectedPanelIndex = idx;
	try { localStorage.setItem(INFO_PANEL_STORAGE_KEY, panelOrder[idx]); } catch(e) {}
}
// Restore persisted selection (if any) so the next open lands on it
try {
	lastUserSelectedPanelIndex = readPersistedSubpanelIndex();
	currentPanelIndex = lastUserSelectedPanelIndex;
} catch(e) {}

// Register custom easing function for smooth momentum (easeOutCubic —
// gentle stop without the abrupt start of the old 1.5 exponent)
$.easing.momentum = function (x) {
	return 1 - Math.pow(1 - x, 3);
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
	updateInfoPanelIndicator(currentPanel);

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

	if (!$('.info-panels-show-hide-wrapper').is(':visible')) {
		$('.subpanels-container').removeClass('is-dragging-or-animating');
		return;
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
		setLastUserSelectedPanelIndex(targetPanelIndex);
	}
	const targetX = -100 * targetPanelIndex * (window.innerWidth / 100);

	const distance = Math.abs(targetX - startX);
	const velocityMagnitude = Math.abs(initialVelocity);
	const baseDuration = 160;
	const velocityDuration = Math.min(velocityMagnitude * 3, 280);
	let totalDuration = Math.max(baseDuration, velocityDuration);
	// For explicit clicks (targetIndex defined), fixed duration matching the
	// indicator's CSS transition so both arrive together.
	if (opts.targetIndex !== undefined) {
		totalDuration = 220;
	}

	// Sync slider indicator with container — drive both via the same rAF
	// progress using transform-only writes (no `left`, no per-frame width).
	const $slider = $('.info-panel-slider');
	const $indicator = $('.info-panel-indicator');
	let hasIndicatorSync = $slider.length && $indicator.length;
	let startIndicatorX = 0;
	let targetIndicatorX = 0;
	if (hasIndicatorSync) {
		try {
			const m = measureInfoSlider();
			const count = m.count;
			const optionWidth = m.optionWidth;
			// Start from current visual position (handles mid-drag snap)
			startIndicatorX = getIndicatorX($indicator);
			if (!optionWidth) {
				hasIndicatorSync = false;
			} else {
				// First run still uses the CSS calc() fallback — snap base to px model
				const leftCss = $indicator.css('left') || '';
				if (leftCss.includes('calc') || (startIndicatorX === 0 && targetX !== 0 && startPanelIndex !== 0)) {
					startIndicatorX = startPanelIndex * optionWidth;
				}
				targetIndicatorX = targetPanelIndex * optionWidth;
			}
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
			// Disable CSS transition — we will drive transform via JS for perfect sync
			$indicator.css('transition', 'none');
			$indicator.css('left', '-3px');
			$indicator.css('width', `calc(100% / ${count} + 6px)`);
			setIndicatorX($indicator, startIndicatorX);
		} catch(e) { hasIndicatorSync = false; }
	} else {
		updateInfoPanelIndicator(targetPanel);
	}

	const startTime = performance.now();
	function frame(currentTime) {
		const elapsedTime = currentTime - startTime;
		let progress = Math.min(elapsedTime / totalDuration, 1);
		progress = $.easing.momentum(progress);
		const newX = startX + (targetX - startX) * progress;
		setContainerX($container, newX);
		if (hasIndicatorSync) {
			const newLeft = startIndicatorX + (targetIndicatorX - startIndicatorX) * progress;
			setIndicatorX($indicator, newLeft);
		}
		if (elapsedTime < totalDuration) {
			animationFrameId = requestAnimationFrame(frame);
		} else {
			setContainerX($container, targetX);
			$container.removeClass('is-dragging-or-animating');
			if (hasIndicatorSync) {
				setIndicatorX($indicator, targetIndicatorX);
				// Restore CSS transition for future hover/theme changes
				$indicator.css('transition', INFO_INDICATOR_TRANSITION);
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
		// NOTE: do NOT call updateInfoPanelIndicator here — the rAF loop above
		// owns the indicator's transform until it completes. A second driver
		// snapping `left` via CSS transition in the same frame is what caused
		// the visible jerk/flicker.
	} else {
		updateInfoPanelIndicator(panel);
	}
	// Only update user's last selected panel if this is an explicit user action
	if (isUserExplicitSelection) {
		setLastUserSelectedPanelIndex(targetIndex);
	}
}

// Handle closing the info panels wrapper
$('.info-panels-close').click(function() {
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
		setLastUserSelectedPanelIndex(panelIndex);
	}

	// Sync slider indicator with panel (keep legacy class for compat)
	updateInfoPanelIndicator(panel);

	// If a route was already selected on the map before the panels opened,
	// render its details now that the Routes subpanel is active (the entry
	// handler highlights the pill but doesn't populate the detail area).
	if (panel === 'routes') {
		ensureRouteSubpanelPopulated();
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

	// Position indicator with transform (compositor-only). Base left stays at
	// -3px so the +6px bleed is symmetric; translateX carries the index offset.
	// Never animate `left` per-frame — that forces layout on every tick.
	indicator.style.left = '-3px';
	indicator.style.width = `calc(100% / ${count} + 6px)`;
	indicator.style.top = '-3px';
	indicator.style.height = 'calc(100% + 6px)';
	const optionWidth = slider.getBoundingClientRect().width / count;
	indicator.style.transition = INFO_INDICATOR_TRANSITION;
	indicator.style.transform = `translateX(${index * optionWidth}px)`;

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
		indicator.style.transition = 'top 0.1s ease, height 0.1s ease, transform 0.1s ease, width 0.1s ease, background-color 0.3s ease, box-shadow 0.3s ease';
		indicator.style.top = '-6px';
		indicator.style.height = 'calc(100% + 12px)';
		const curW = indicator.offsetWidth;
		indicator.style.width = (curW + 6) + 'px';
	}
	function snapToClosest(clientX) {
		const closest = getClosestPanel(clientX);
		if (closest) {
			indicator.style.transition = 'transform 0.2s ease, width 0.2s ease, top 0.15s ease, height 0.15s ease, background-color 0.3s ease, box-shadow 0.3s ease';
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
		indicator.style.transition = 'transform 0.2s ease, width 0.2s ease, top 0.15s ease, height 0.15s ease, background-color 0.3s ease, box-shadow 0.3s ease';
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

	// Cached per-gesture metrics (measured once on pointerdown, not per move)
	let cachedOptionWidth = 0;
	let cachedSliderLeft = 0;
	let sliderDragFrame = 0;
	let pendingClientX = 0;
	function cacheSliderMetrics() {
		try {
			const rect = slider.getBoundingClientRect();
			cachedSliderLeft = rect.left;
			const n = slider.querySelectorAll('.info-panel-option').length || 3;
			cachedOptionWidth = n ? rect.width / n : 0;
		} catch(err) {}
	}

	slider.addEventListener('pointerdown', function(e) {
		// Only left button / touch — if target is an option, per-option handler already handled selection/drag
		if (e.target.closest('.info-panel-option')) return;
		if (e.button !== undefined && e.button !== 0) return;
		dragging = true;
		didDrag = false;
		startX = e.clientX;
		lastClosestPanel = null;
		cacheSliderMetrics();
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

	// Cached per-gesture metrics declared above (cacheSliderMetrics)

	function paintSliderDrag() {
		sliderDragFrame = 0;
		const count = (typeof panelOrder !== 'undefined' ? panelOrder.length : 3);
		const maxX = Math.max(0, (count - 1) * cachedOptionWidth);
		const halfW = indicator.offsetWidth / 2;
		let newX = (pendingClientX - cachedSliderLeft) - halfW;
		// Base left is -3px, so shift travel window by +3 to keep symmetric bleed
		newX = Math.max(0, Math.min(maxX, newX + 3));
		indicator.style.transform = `translateX(${newX}px)`;

		const closest = getClosestPanel(pendingClientX);
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
			}
		}

		// Mirror drag on main container — percentage, not same pixels.
		try {
			const $container = $('.subpanels-container');
			if ($container.length && maxX > 0) {
				const indicatorProgress = Math.max(0, Math.min(1, newX / maxX));
				const targetX = -indicatorProgress * (count - 1) * window.innerWidth;
				setContainerX($container, targetX);
			}
		} catch(err) {}
	}

	slider.addEventListener('pointermove', function(e) {
		if (!dragging) return;
		const dx = e.clientX - startX;
		if (Math.abs(dx) > 5) {
			if (!didDrag) {
				clearTimeout(holdTimer);
				applyPopup();
				indicator.style.transition = INFO_INDICATOR_NO_TRANSITION;
			}
			didDrag = true;
		}
		if (!didDrag) return;

		// Light handler: store coords, paint on rAF (transform-only)
		pendingClientX = e.clientX;
		if (!sliderDragFrame) {
			sliderDragFrame = requestAnimationFrame(paintSliderDrag);
		}
	});

	function endDrag(e) {
		if (!dragging) return;
		dragging = false;
		clearTimeout(holdTimer);
		if (sliderDragFrame) {
			cancelAnimationFrame(sliderDragFrame);
			sliderDragFrame = 0;
		}
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
			if (window._lastInfoPanelsOpenTime && Date.now() - window._lastInfoPanelsOpenTime < 350) {
				e.preventDefault();
				e.stopImmediatePropagation();
				return;
			}
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
			try { cacheSliderMetrics(); } catch(err) {}
			try { slider.setPointerCapture(e.pointerId); } catch(err) {}
			clearTimeout(holdTimer);
		} else {
			lastClosestPanel = panel;
		}
		});
		// Fallback click for non-pointer devices / accessibility; suppress if pointer already handled
		opt.addEventListener('click', function(e) {
			if (window._lastInfoPanelsOpenTime && Date.now() - window._lastInfoPanelsOpenTime < 350) {
				e.preventDefault();
				e.stopImmediatePropagation();
				return;
			}
			const panel = opt.getAttribute('data-panel');
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
// rAF-throttled content-drag paint state — the touchmove/mousemove handler
// only stores coordinates; all DOM writes happen here, once per frame,
// using cached layout (no getBoundingClientRect/offsetLeft per move).
let contentDragFrame = 0;
let pendingContainerX = null;
let pendingIndicatorX = null;
let pendingClosestIdx = -1;
let lastAppliedClosestIdx = -1;
let cachedViewportW = 0;
let cachedContentOptionWidth = 0;
let dragHasIndicator = false;
let $dragSlider = null;
let $dragIndicator = null;

function flushContentDrag() {
	contentDragFrame = 0;
	if (pendingContainerX === null) return;
	const $container = $('.subpanels-container');
	if ($container.length) {
		setContainerX($container, pendingContainerX);
	}
	if (dragHasIndicator && $dragIndicator && $dragIndicator.length && pendingIndicatorX !== null) {
		$dragIndicator.css('transition', 'none');
		setIndicatorX($dragIndicator, pendingIndicatorX);
	}
	if (pendingClosestIdx !== lastAppliedClosestIdx && $dragSlider && $dragSlider.length) {
		lastAppliedClosestIdx = pendingClosestIdx;
		const closestPanel = panelOrder[pendingClosestIdx];
		if (closestPanel) {
			$dragSlider.find('.info-panel-option').removeClass('selected all-stops-selected-menu');
			$dragSlider.find(`[data-panel="${closestPanel}"]`).addClass('selected all-stops-selected-menu');
		}
	}
	pendingContainerX = null;
}
function scheduleContentDragFrame() {
	if (!contentDragFrame) {
		contentDragFrame = requestAnimationFrame(flushContentDrag);
	}
}
window.cancelInfoPanelAnimation = function() {
	if (animationFrameId) {
		cancelAnimationFrame(animationFrameId);
		animationFrameId = null;
	}
	$('.subpanels-container').removeClass('is-dragging-or-animating');
};

// Unified pointer event handlers for touch and mouse
$('.info-panels-content').on('touchstart mousedown', function(e) {
	if (animationFrameId) {
		cancelAnimationFrame(animationFrameId);
		animationFrameId = null;
	}
	if (contentDragFrame) {
		cancelAnimationFrame(contentDragFrame);
		contentDragFrame = null;
		pendingContainerX = null;
	}
	const $container = $('.subpanels-container');
	$container.stop(true).addClass('is-dragging-or-animating');
	// Ensure no CSS transition interferes with JS-driven drag
	$container.css('transition', 'none');

	const isTouch = e.type === 'touchstart';
	if (!isTouch) {
		if (Date.now() - lastTouchEndTime < 400) {
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
	// Cache layout once per gesture — reused for every move frame
	cachedViewportW = window.innerWidth;
	lastAppliedClosestIdx = currentPanelIndex;
	pendingClosestIdx = currentPanelIndex;
	pendingIndicatorX = null;
	try {
		$dragSlider = $('.info-panel-slider');
		$dragIndicator = $('.info-panel-indicator');
		dragHasIndicator = $dragSlider.length > 0 && $dragIndicator.length > 0;
		cachedContentOptionWidth = 0;
		if (dragHasIndicator) {
			const w = $dragSlider[0].getBoundingClientRect().width;
			const n = $dragSlider[0].querySelectorAll('.info-panel-option').length || panelOrder.length;
			cachedContentOptionWidth = n ? w / n : 0;
			$dragIndicator.css({ 'transition': 'none', 'left': '-3px' });
		}
	} catch(err) { dragHasIndicator = false; }
	velocityX = 0;
	lastMoveTime = 0;
	lastMoveX = dragStartX;
	touchStartTime = Date.now();
    isDragging = false;
});

$('.info-panels-content').on('touchmove mousemove', function(e) {
    if (!dragStartX || !dragStartY) return;
    const target = $(e.target);
	if (target.closest('.bottom, .route-selectors, .route-selector, .ridership-chart-wrapper, #ridership-chart, .route-header, .route-star, .color-circle, button, input, select').length > 0) {
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
	const horizontalDominant = Math.abs(deltaX) > Math.abs(deltaY);
	const distanceIntent = Math.abs(deltaX) > 25; // quicker flicks
	const timeAndDistanceIntent = Math.abs(deltaX) > 20; // threshold for intentional horizontal swipe
	const meetsThreshold = horizontalDominant && (distanceIntent || timeAndDistanceIntent);
	if (meetsThreshold) {
		if (!isDragging || Math.abs(deltaX) > Math.abs(deltaY)) {
        isDragging = true;
			suppressSubpanelClick = true;
			lastSubpanelDragEndTime = Date.now();
			if (horizontalDominant && Math.abs(deltaX) > 12) {
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
			// Store only — the rAF painter does all DOM writes with cached layout
			const newTransformX = initialTransformX + deltaX;
			pendingContainerX = newTransformX;
			const panelCount = panelOrder.length;
			const span = (panelCount - 1) * (cachedViewportW || window.innerWidth);
			const containerProgress = span > 0 ? Math.max(0, Math.min(1, -newTransformX / span)) : 0;
			if (dragHasIndicator && cachedContentOptionWidth > 0) {
				pendingIndicatorX = containerProgress * (panelCount - 1) * cachedContentOptionWidth;
			} else {
				pendingIndicatorX = null;
			}
			pendingClosestIdx = Math.max(0, Math.min(panelCount - 1, Math.round(containerProgress * (panelCount - 1))));
			scheduleContentDragFrame();
		}
	} else if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 15) {
		isDragging = false;
		return;
    }
});

$('.info-panels-content').on('touchend mouseup', function(e) {
	if (contentDragFrame) {
		// Flush the last painted position so the snap animation starts from it
		cancelAnimationFrame(contentDragFrame);
		contentDragFrame = 0;
		if (pendingContainerX !== null) {
			const $c = $('.subpanels-container');
			if ($c.length) setContainerX($c, pendingContainerX);
			if (dragHasIndicator && $dragIndicator && $dragIndicator.length && pendingIndicatorX !== null) {
				$dragIndicator.css('transition', 'none');
				setIndicatorX($dragIndicator, pendingIndicatorX);
			}
			pendingContainerX = null;
		}
	}
	if (e.type === 'mouseup' && Date.now() - lastTouchEndTime < 400) {
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
		animateToTargetPanel(scaledVelocity, { dragDeltaX: totalDx });
	} else {
		// Flick fallback: animate based on displacement even if drag never crossed move threshold
		const horizontalDominant = Math.abs(totalDx) > Math.abs(totalDy);
		if (isDragging && horizontalDominant && Math.abs(totalDx) > 20) {
			const vScaled = totalDuration > 0 ? (totalDx / totalDuration) * 20 : 0;
			animateToTargetPanel(vScaled, { dragDeltaX: totalDx });
		} else {
			const $container = $('.subpanels-container');
			const currentX = getTranslateX($container);
			const expectedX = -currentPanelIndex * window.innerWidth;
			if (Math.abs(currentX - expectedX) > 5) {
				animateToTargetPanel(0, { targetIndex: currentPanelIndex, isUserExplicitSelection: false });
			}
		}
	}
	// reset gesture state
    dragStartX = 0;
    dragStartY = 0;
    isDragging = false;
	lastMoveTime = 0;
	lastMoveX = 0;
	touchStartTime = 0;
	pendingIndicatorX = null;
});

$('.info-panels-content').on('contextmenu', function(e) {
    if (dragStartX) {
        e.preventDefault();
    }
});

$('.info-panels-content').on('mouseleave touchcancel', function(e) {
	if (contentDragFrame) {
		cancelAnimationFrame(contentDragFrame);
		contentDragFrame = 0;
		pendingContainerX = null;
	}
	if (!$('.info-panels-show-hide-wrapper').is(':visible')) {
		$('.subpanels-container').removeClass('is-dragging-or-animating');
		dragStartX = dragStartY = dragEndX = dragEndY = 0;
		isDragging = false;
		lastMoveTime = 0;
		lastMoveX = 0;
		velocityX = 0;
		touchStartTime = 0;
		return;
	}
	if (isDragging && dragStartX && dragEndX) {
		suppressSubpanelClick = true;
		lastSubpanelDragEndTime = Date.now();
		const totalDx = dragEndX - dragStartX;
		animateToTargetPanel(velocityX * 20, { dragDeltaX: totalDx });
	} else if ($('.subpanels-container').hasClass('is-dragging-or-animating') && !animationFrameId) {
		animateToTargetPanel(0, { targetIndex: currentPanelIndex, isUserExplicitSelection: false });
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
		// Recompute transform-based indicator (optionWidth changed)
		try { updateInfoPanelIndicator(panelOrder[currentPanelIndex]); } catch(e) {}
	}
});

// Non-passive touchmove listener removed - was causing interference
