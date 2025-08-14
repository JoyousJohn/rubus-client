// Riding detection module
// Depends on: jQuery ($), haversine (from map.js), busData, popupBusId

(function(){
	// State
	window.ridingState = window.ridingState || { currentBusId: null, confidence: 0, lastUpdateTs: 0 };
	window.busMatchStreak = window.busMatchStreak || {};

	let geoWatchId;
	let ridingEvaluationTimer;

	window.userGeo = window.userGeo || {
		lat: null,
		lng: null,
		lastLat: null,
		lastLng: null,
		lastTime: null,
		speedMps: null,
		headingDeg: null,
		accuracyM: null,
	};

	function milesToMeters(mi) { return mi * 1609.344; }
	function mpsToMph(mps) { return mps * 2.236936; }
	function normalizeAngleDeg(a) { return (a % 360 + 360) % 360; }
	function smallestAngleDiffDeg(a, b) {
		const diff = Math.abs(normalizeAngleDeg(a) - normalizeAngleDeg(b));
		return Math.min(diff, 360 - diff);
	}

	window.updateRidingBadgeUI = function updateRidingBadgeUI() {
		try {
			if (window.popupBusId && window.ridingState.currentBusId && Number(window.popupBusId) === Number(window.ridingState.currentBusId)) {
				$('.info-riding').show();
			} else {
				$('.info-riding').hide();
			}
		} catch (_) {}
	}

	function onGeoPosition(position) {
		const { latitude, longitude, accuracy, heading, speed } = position.coords;
		const now = Date.now();
		window.userPosition = [latitude, longitude];

		let derivedSpeedMps = (typeof speed === 'number' && !Number.isNaN(speed)) ? speed : null;
		let derivedHeading = (typeof heading === 'number' && !Number.isNaN(heading)) ? heading : null;

		if (window.userGeo.lat !== null && window.userGeo.lng !== null && window.userGeo.lastTime) {
			const dt = (now - window.userGeo.lastTime) / 1000;
			if (dt > 0.5 && dt < 30) {
				const distMiles = haversine(window.userGeo.lat, window.userGeo.lng, latitude, longitude);
				const distMeters = milesToMeters(distMiles);
				if (derivedSpeedMps === null) {
					derivedSpeedMps = distMeters / dt;
				}
				if (derivedHeading === null) {
					const dy = latitude - window.userGeo.lat;
					const dx = longitude - window.userGeo.lng;
					derivedHeading = normalizeAngleDeg(Math.atan2(dx, dy) * 180 / Math.PI);
				}
			}
		}

		window.userGeo = {
			lat: latitude,
			lng: longitude,
			lastLat: window.userGeo.lat,
			lastLng: window.userGeo.lng,
			lastTime: now,
			speedMps: derivedSpeedMps,
			headingDeg: derivedHeading,
			accuracyM: accuracy || null,
		};

		try { evaluateRidingCandidate(); } catch (_) {}
	}

	function onGeoError(_) {
		// ignore
	}

	window.startLocationWatchForRiding = function startLocationWatchForRiding() {
		if (!navigator.geolocation) return;
		try {
			if (geoWatchId) return;
			geoWatchId = navigator.geolocation.watchPosition(onGeoPosition, onGeoError, {
				enableHighAccuracy: true,
				maximumAge: 1000,
				timeout: 10000,
			});

			if (!ridingEvaluationTimer) {
				ridingEvaluationTimer = setInterval(() => {
					try { evaluateRidingCandidate(); } catch (_) {}
				}, 1500);
			}
		} catch (_) {}
	}

	window.initLocationWatchForRiding = function initLocationWatchForRiding() {
		try {
			const shared = (() => {
				try { return !!JSON.parse(localStorage.getItem('locationShared') || 'false'); } catch (_) { return !!localStorage.getItem('locationShared'); }
			})();
			if (navigator.permissions && navigator.permissions.query) {
				navigator.permissions.query({ name: 'geolocation' }).then((status) => {
					if (status.state === 'granted' || shared) {
						startLocationWatchForRiding();
					}
					status.onchange = function() {
						if (this.state === 'granted') startLocationWatchForRiding();
					};
				}).catch(() => { if (shared) startLocationWatchForRiding(); });
			} else if (shared) {
				startLocationWatchForRiding();
			}
		} catch (_) {}
	}

	window.evaluateRidingCandidate = function evaluateRidingCandidate() {
		if (!window.userGeo || window.userGeo.lat === null || !window.busData) return;
		const now = Date.now();

		let bestBusId = null;
		let bestScore = 0;

		for (const id in window.busData) {
			const bus = window.busData[id];
			if (!bus || !('lat' in bus) || !('long' in bus)) continue;
			if (bus.oos && !bus.atDepot) continue;

			const distMeters = milesToMeters(haversine(window.userGeo.lat, window.userGeo.lng, bus.lat, bus.long));
			const busMph = (typeof bus.speed === 'number' && !Number.isNaN(bus.speed)) ? bus.speed : (typeof bus.visualSpeed === 'number' ? bus.visualSpeed : 0);
			const movingFast = busMph > 8;
			const distThreshold = movingFast ? 38 : 24;
			const distScore = Math.max(0, Math.min(1, (distThreshold - distMeters) / distThreshold));

			let speedScore = 0.5;
			if (window.userGeo.speedMps !== null) {
				const userMph = mpsToMph(window.userGeo.speedMps);
				const diff = Math.abs((busMph || 0) - userMph);
				const tol = movingFast ? 5 : 2.5;
				speedScore = Math.max(0, 1 - (diff / tol));
			}

			let headingScore = 0.5;
			const busHeading = (typeof bus.rotation === 'number') ? normalizeAngleDeg(bus.rotation + 45) : null;
			if (window.userGeo.headingDeg !== null && busHeading !== null && movingFast) {
				const angDiff = smallestAngleDiffDeg(window.userGeo.headingDeg, busHeading);
				headingScore = Math.max(0, 1 - (angDiff / 70));
			}

			const score = (0.6 * distScore) + (0.25 * speedScore) + (0.15 * headingScore);

			if (!window.busMatchStreak[id]) window.busMatchStreak[id] = 0;
			if (score >= 0.72 && distMeters <= distThreshold) {
				window.busMatchStreak[id] = Math.min(10, window.busMatchStreak[id] + 1);
			} else {
				window.busMatchStreak[id] = Math.max(0, window.busMatchStreak[id] - 1);
			}

			if (score > bestScore || (
				Math.abs(score - bestScore) < 0.02 && bestBusId !== null && (
					distMeters < milesToMeters(haversine(window.userGeo.lat, window.userGeo.lng, window.busData[bestBusId].lat, window.busData[bestBusId].long)) ||
					window.busMatchStreak[id] > (window.busMatchStreak[bestBusId] || 0)
				)
			)) {
				bestScore = score;
				bestBusId = id;
			}
		}

		const prevBusId = window.ridingState.currentBusId;
		const prevConf = window.ridingState.confidence;

		const promote = () => {
			window.ridingState.currentBusId = bestBusId;
			window.ridingState.confidence = bestScore;
			window.ridingState.lastUpdateTs = now;
		};

		const demote = () => {
			window.ridingState.currentBusId = null;
			window.ridingState.confidence = 0;
			window.ridingState.lastUpdateTs = now;
		};

		if (bestBusId && bestScore >= 0.75 && (window.busMatchStreak[bestBusId] || 0) >= 3) {
			if (!prevBusId || Number(prevBusId) === Number(bestBusId) || bestScore - prevConf > 0.12) {
				promote();
			}
		} else {
			if (prevBusId && (now - window.ridingState.lastUpdateTs > 8000 || bestScore < 0.5)) {
				demote();
			}
		}

		if (prevBusId !== window.ridingState.currentBusId || prevConf !== window.ridingState.confidence) {
			window.updateRidingBadgeUI();
		}
	}

})();
