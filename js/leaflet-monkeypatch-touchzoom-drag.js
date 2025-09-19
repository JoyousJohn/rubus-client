(function() {
	if (!window.L || !L.Map || !L.Map.TouchZoom || !L.Draggable) return;

	// Guard against double-apply
	if (L.Map.__rubusPatchedSingleFingerAfterPinch) return;
	L.Map.__rubusPatchedSingleFingerAfterPinch = true;

	const proto = L.Map.TouchZoom.prototype;
	const originalOnTouchMove = proto._onTouchMove;
	const originalOnTouchEnd = proto._onTouchEnd;

	// Track last active touches during pinch and whether we were pinching
	proto.__rubusWasPinching = false;
	proto.__rubusLastTouches = null;

	proto._onTouchMove = function(e) {
		if (!this._map || !this._map._loaded) { return; }
		const touches = e.touches ? e.touches : (e.originalEvent && e.originalEvent.touches);
		if (touches && touches.length >= 2) {
			this.__rubusWasPinching = true;
			this.__rubusLastTouches = touches;
		}
		return originalOnTouchMove.call(this, e);
	};

	proto._onTouchEnd = function(e) {
		// Call original first so Leaflet cleans up its pinch state
		originalOnTouchEnd.call(this, e);

		try {
			const map = this._map;
			if (!map || !map._loaded) return;

			const evt = e.originalEvent || e;
			const touches = evt.touches || [];

			// Condition: we were pinching and now exactly one touch remains
			if (this.__rubusWasPinching && touches.length === 1) {
				// Reset flag for next interaction
				this.__rubusWasPinching = false;

				// Start a drag using the remaining finger
				const container = map._container;
				const touch = touches[0];

				// Create a synthetic pointerdown/mousedown to kick Draggable
				// Prefer pointer events when available
				const pointerDownType = window.PointerEvent ? 'pointerdown' : ('ontouchstart' in window ? 'touchstart' : 'mousedown');

				if (pointerDownType === 'pointerdown') {
					const pe = new PointerEvent('pointerdown', {
						bubbles: true,
						cancelable: true,
						pointerId: touch.identifier || 1,
						pointerType: 'touch',
						clientX: touch.clientX,
						clientY: touch.clientY,
						buttons: 1
					});
					container.dispatchEvent(pe);
				} else if (pointerDownType === 'touchstart') {
					const te = new TouchEvent('touchstart', {
						bubbles: true,
						cancelable: true,
						touches: evt.touches,
						targetTouches: evt.targetTouches,
						changedTouches: evt.changedTouches
					});
					container.dispatchEvent(te);
				} else {
					const me = new MouseEvent('mousedown', {
						bubbles: true,
						cancelable: true,
						clientX: touch.clientX,
						clientY: touch.clientY,
						buttons: 1
					});
					container.dispatchEvent(me);
				}
			}
		} catch (err) {
			// Fail-safe: never break map
			console && console.warn && console.warn('Leaflet monkeypatch single-finger-after-pinch failed:', err);
		}
	};
})();
