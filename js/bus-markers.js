// js/bus-markers.js - extracted verbatim from js/map.js
let busLines = {}
let midpointCircle = {}

// Remove a bus's displayed debug path layers (prev/curr/curve/join polylines
// and the midpoint circle) and drop their state. These are otherwise only
// cleaned inside updateMarkerPosition, so a bus that goes out of service would
// leave its path layers on the map permanently.
function removeBusPathLayers(busName) {
    if (busLines[busName]) {
        for (const key in busLines[busName]) {
            const layer = busLines[busName][key];
            if (layer && typeof layer.removeFrom === 'function') {
                try { layer.removeFrom(map); } catch (e) {}
            }
        }
        delete busLines[busName];
    }
    if (midpointCircle[busName]) {
        try { midpointCircle[busName].removeFrom(map); } catch (e) {}
        delete midpointCircle[busName];
    }
}


// Helper function to get the rotation element for any marker type (cached for high performance)
function getMarkerRotationElement(marker) {
    if (!marker) return null;
    if (marker._rotationElement) return marker._rotationElement;
    const el = marker.getElement ? marker.getElement() : null;
    if (!el) return null;
    const rotEl = el.querySelector('.bus-icon-outer') ||
                  el.querySelector('.passio-marker') ||
                  el.querySelector('.rider-marker') ||
                  el.querySelector('.duck-marker');
    if (rotEl) marker._rotationElement = rotEl;
    return rotEl;
}

// Cache for colored SVG data URLs
const svgCache = {};

// Function to generate a colored SVG data URL from the passio-bus.svg file (synchronous after pre-generation)
function generateColoredSvg(color) {
    // Return cached version if it exists
    if (svgCache[color]) {
        return svgCache[color];
    }
    
    // Fallback to original SVG if not cached
    return 'img/passio-bus.svg';
}

// Pre-generate all colored SVGs on startup
async function preGenerateColoredSvgs() {
    const colors = [...new Set(Object.values(colorMappings))];
    
    for (const color of colors) {
        try {
            await generateColoredSvgForColor(color);
        } catch (error) {
            console.error(`Failed to pre-generate SVG for color ${color}:`, error);
        }
    }
}

// Internal function to generate and cache a single colored SVG
async function generateColoredSvgForColor(color) {
    const response = await fetch('img/passio-bus.svg');
    const svgContent = await response.text();
    
    // Parse the SVG
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgContent, 'image/svg+xml');
    const svgElement = svgDoc.documentElement;
    
    // Modify the SVG to use the specified color
    // Look for fill attributes or add them to paths
    const paths = svgElement.querySelectorAll('path');
    paths.forEach(path => {
        if (!path.getAttribute('fill') || path.getAttribute('fill') !== 'none') {
            path.setAttribute('fill', color);
        }
    });
    
    // Also check for other elements that might have colors
    const elements = svgElement.querySelectorAll('*');
    elements.forEach(element => {
        if (element.tagName !== 'svg' && (!element.getAttribute('fill') || element.getAttribute('fill') !== 'none')) {
            element.setAttribute('fill', color);
        }
    });
    
    // Serialize back to string
    const serializer = new XMLSerializer();
    const modifiedSvgContent = serializer.serializeToString(svgElement);
    
    // Create blob URL
    const blob = new Blob([modifiedSvgContent], { type: 'image/svg+xml' });
    const svgUrl = URL.createObjectURL(blob);
    
    // Cache the result
    svgCache[color] = svgUrl;
}

// Function to generate a route-colored Passio marker SVG (cached and synchronous after pre-generation)

const updateMarkerPosition = (busName, immediatelyUpdate) => {
    const loc = {lat: busData[busName].lat, long: busData[busName].long};
    const marker = busMarkers[busName];

    // Cancel any existing animations for this bus (the shared loop drops it from the registry)
    cancelBusAnimation(busName);

    // Get current position
    const startLatLng = marker.getLatLng();
    const endLatLng = L.latLng(loc.lat, loc.long);
    
    let prevLatLng;
    try {
        if (busData[busName].previousPositions.length >= 3) {
            prevLatLng = {
                lat: busData[busName].previousPositions[busData[busName].previousPositions.length - 3][0], 
                lng: busData[busName].previousPositions[busData[busName].previousPositions.length - 3][1]
            };
        }
    } catch (error) {
        console.error(error);
        console.error(busData[busName].previousPositions);
        console.error(busData[busName]);
    }

    const positioningOption = settings['bus-positioning'];
    const showPath = settings['toggle-show-bus-path'];

    // Always maintain the data structure regardless of display setting
    if (busLines[busName]) {
        if (busLines[busName]['prev'] && busLines[busName]['prev'].removeFrom) {
            busLines[busName]['prev'].removeFrom(map);
        }
        if (busLines[busName]['curve'] && busLines[busName]['curve'].removeFrom) {
            busLines[busName]['curve'].removeFrom(map);
        }
        if (busLines[busName]['join'] && busLines[busName]['join'].removeFrom) {
            busLines[busName]['join'].removeFrom(map);
            delete busLines[busName]['join'];
        }
    } else {
        busLines[busName] = {};
    }

    // Handle current path line
    const prevPathEndpoint = busLines[busName]['curr'] ? busLines[busName]['curr']._latlngs[1] : startLatLng;
    if (busLines[busName]['curr'] && busLines[busName]['curr'].removeFrom) {
        busLines[busName]['curr'].removeFrom(map);
    }
    
    // Store previous path data
    if (busLines[busName]['curr'] && busLines[busName]['curr']._latlngs) {
        busLines[busName]['prev'] = busLines[busName]['curr']._latlngs;
    }

    // Always update the current line data
    busLines[busName]['curr'] = {
        _latlngs: [prevPathEndpoint, endLatLng]
    };

	// Prepare two-segment path: current -> previous target -> new target
	let previousTargetLatLng = prevPathEndpoint;
	if (previousTargetLatLng && previousTargetLatLng.lat !== undefined && previousTargetLatLng.lng !== undefined) {
		previousTargetLatLng = L.latLng(previousTargetLatLng.lat, previousTargetLatLng.lng);
	}
	const distanceToPreviousTarget = previousTargetLatLng && startLatLng.distanceTo ? startLatLng.distanceTo(previousTargetLatLng) : 0;
	const distanceFromPreviousToEnd = previousTargetLatLng && previousTargetLatLng.distanceTo ? previousTargetLatLng.distanceTo(endLatLng) : 0;
	const totalPathDistance = distanceToPreviousTarget + distanceFromPreviousToEnd;
	const useTwoSegmentPath = previousTargetLatLng && totalPathDistance > 0 && distanceToPreviousTarget > 1;

    // Only display the lines if showPath is true
    if (showPath) {
        // If we're mid-animation, render a temporary join segment from the current
        // marker position to the previous path endpoint so the first leg is visible
        try {
            if (prevPathEndpoint && startLatLng && typeof startLatLng.distanceTo === 'function') {
                const needJoin = startLatLng.distanceTo(L.latLng(prevPathEndpoint.lat, prevPathEndpoint.lng)) > 0.5;
                if (needJoin) {
                    const joinLine = L.polyline([startLatLng, prevPathEndpoint], {color: '#888', weight: 3, dashArray: '4,6'}).addTo(map);
                    busLines[busName]['join'] = joinLine;
                }
            }
        } catch (e) {}

        // Display previous line (red)
        if (busLines[busName]['prev']) {
            const prevLine = L.polyline(busLines[busName]['prev'], {color: 'red', weight: 4}).addTo(map);
            busLines[busName]['prev'] = prevLine;
        }
        
        // Display current line (blue)
        const currLine = L.polyline(busLines[busName]['curr']._latlngs, {color: 'blue', weight: 4}).addTo(map);
        busLines[busName]['curr'] = currLine;
    }

    // Add Bézier curve only if positioning option is 'bezier'
    if (prevLatLng && positioningOption === 'bezier') {
        // Define the mid-arc join waypoint (where red/blue connect)
        const joinWaypointLatLng = {
            lat: busLines[busName]['curr']._latlngs[0].lat,
            lng: busLines[busName]['curr']._latlngs[0].lng
        };
        
        // Quadratic control point chosen so the curve passes through joinWaypoint at t=0.5
        const bezierControlLatLng = {
            lat: 2 * joinWaypointLatLng.lat - 0.5 * (prevLatLng.lat + endLatLng.lat),
            lng: 2 * joinWaypointLatLng.lng - 0.5 * (prevLatLng.lng + endLatLng.lng)
        };
        
        // Only display the curve if showPath is true
        if (showPath) {
            // Sample the quadratic Bézier so it renders via the shimmed
            // L.polyline — L.curve is Leaflet-only and has no maplibre path.
            const curvePoints = [];
            const steps = 30;
            for (let i = 0; i <= steps; i++) {
                const t = i / steps;
                const omt = 1 - t;
                curvePoints.push([
                    omt * omt * prevLatLng.lat + 2 * omt * t * bezierControlLatLng.lat + t * t * endLatLng.lat,
                    omt * omt * prevLatLng.lng + 2 * omt * t * bezierControlLatLng.lng + t * t * endLatLng.lng
                ]);
            }
            const path = L.polyline(curvePoints, {color: 'purple', weight: 5, opacity: 1}).addTo(map);
            busLines[busName]['curve'] = path;
            
            // Add a dot at the join waypoint
            if (midpointCircle[busName]) midpointCircle[busName].removeFrom(map);
            midpointCircle[busName] = L.circleMarker([busLines[busName]['curr']._latlngs[0].lat, busLines[busName]['curr']._latlngs[0].lng], {
                radius: 4,
                color: 'lime',
                fillColor: 'lime',
                fillOpacity: 1
            }).addTo(map);
        }
    }

    // If immediatelyUpdate is true, skip animation and set position directly
    if (immediatelyUpdate) {
        marker.setLatLng(endLatLng);

        // Update rotation immediately as well
        if (!pauseRotationUpdating) {
            const newRotation = calculateRotation(busName, loc);
            if (newRotation !== undefined && typeof marker.setRotation === 'function') {
                marker.setRotation(newRotation);
            }
        }

        // Clear two-segment path data to prevent stale path information from affecting future animations
        // After teleporting, we don't want to use old path endpoints for the next animation
        if (busLines[busName]) {
            // Get the marker's position after teleporting to ensure we use the correct current position
            const currentPosition = marker.getLatLng();
            // Reset current path to start fresh on next animation
            busLines[busName]['curr'] = {
                _latlngs: [currentPosition, currentPosition] // Set both points to current position after teleport
            };
            // Clear previous path data since we've teleported and old path is irrelevant
            delete busLines[busName]['prev'];
        }

        // Clear any stored animation durations so they don't carry over to the
        // next non-immediate update. This path returns early and never reaches the
        // duration-consumption code below, so stale values would otherwise persist.
        delete busData[busName].apiAnimationDuration;
        delete busData[busName].websocketAnimationDuration;
        delete busData[busName].simAnimationDuration;

        return; // Exit early - no animation needed
    }

    // Calculate animation duration (scaled for sim buses)
    const timeSinceLastUpdate = new Date().getTime() - busData[busName].previousTime;
    // Cap the maximum animation duration to prevent extremely long animations after app resume
    // uynsure if thi s does anything or is needed
    const cappedTimeSinceLastUpdate = Math.min(timeSinceLastUpdate, 30000); // Max 30 seconds

    // Use stored animation duration if available (for consistent timing across update sources)
    let duration;
    if (busData[busName].websocketAnimationDuration) {
        duration = busData[busName].websocketAnimationDuration;
        // Clear the stored duration after use
        delete busData[busName].websocketAnimationDuration;
        // console.log(`[Animation] Using WebSocket-calculated duration: ${Math.round(duration/1000)}s for bus ${busName}`);
    } else if (busData[busName].apiAnimationDuration) {
        duration = busData[busName].apiAnimationDuration;
        // Clear the stored duration after use
        delete busData[busName].apiAnimationDuration;
        // console.log(`[Animation] Using API-calculated duration: ${Math.round(duration/1000)}s for bus ${busName}`);
    } else {
        const baseDuration = cappedTimeSinceLastUpdate + 2500;
        duration = baseDuration;
    }
    try {
        if (sim === true && busData[busName] && busData[busName].type === 'sim') {
            if (busData[busName].simAnimationDuration) {
                // Duration supplied by the simulator (elapsed time since the
                // previous visual report) — already in real-time ms, so no
                // multiplier scaling here.
                duration = busData[busName].simAnimationDuration;
                delete busData[busName].simAnimationDuration;
            } else {
                const mult = Math.max(1, (window.SIM_TIME_MULTIPLIER || 1));
                duration = Math.max(50, duration / mult);
            }
        }
    } catch (e) {}
    const startTime = performance.now();

    // Pause accumulation: while the "Pause Bus Markers on Pan" dev setting is
    // active, elapsed wall-clock time is excluded from animation progress so
    // markers resume exactly where they left off instead of jumping forward.
    let pausedAt = null;
    let pausedDuration = 0;

    const startRotation = typeof marker.getRotation === 'function' ? marker.getRotation() : 0;
    const endRotation = calculateRotation(busName, loc);

    const calculateBezierPoint = (t) => {
        if (!prevLatLng || positioningOption !== 'bezier') return null;
        
        // The join waypoint is the mid-curve constraint at t=0.5
        const joinWaypointLatLng = {
            lat: busLines[busName]['curr']._latlngs[0].lat,
            lng: busLines[busName]['curr']._latlngs[0].lng
        };
        
        const bezierControlLatLng = {
            lat: 2 * joinWaypointLatLng.lat - 0.5 * (prevLatLng.lat + endLatLng.lat),
            lng: 2 * joinWaypointLatLng.lng - 0.5 * (prevLatLng.lng + endLatLng.lng)
        };
        
        // This equals joinWaypointLatLng by construction; kept for clarity of intent
        const midCurvePointLatLng = {
            lat: 0.25 * prevLatLng.lat + 0.5 * bezierControlLatLng.lat + 0.25 * endLatLng.lat,
            lng: 0.25 * prevLatLng.lng + 0.5 * bezierControlLatLng.lng + 0.25 * endLatLng.lng
        };
        
        if (t <= 0.3) {
            const t1 = t / 0.3;
            return {
                lat: startLatLng.lat + (midCurvePointLatLng.lat - startLatLng.lat) * t1,
                lng: startLatLng.lng + (midCurvePointLatLng.lng - startLatLng.lng) * t1
            };
        } else {
            const t2 = (t - 0.3) / 0.7;
            const curveT = 0.5 + (t2 * 0.5);
            
            return {
                lat: (1 - curveT) ** 2 * prevLatLng.lat +
                    2 * (1 - curveT) * curveT * bezierControlLatLng.lat +
                    curveT ** 2 * endLatLng.lat,
                lng: (1 - curveT) ** 2 * prevLatLng.lng +
                    2 * (1 - curveT) * curveT * bezierControlLatLng.lng +
                    curveT ** 2 * endLatLng.lng
            };
        }
    };

    const animateMarker = (currentTime) => {
        // Skip this animation frame if busName has been removed from animationFrames
        if (!animationFrames[busName]) return;

        // When the "Pause Bus Markers on Pan" dev setting is enabled, freeze
        // progress while dragging so markers resume exactly where they left off.
        if (window.isMapDragging && settings && settings['toggle-pause-bus-markers-on-pan']) {
            if (pausedAt === null) pausedAt = currentTime;
            return;
        }
        if (pausedAt !== null) {
            pausedDuration += currentTime - pausedAt;
            pausedAt = null;
        }

        const elapsedTime = currentTime - startTime - pausedDuration;
        const progress = Math.max(0, Math.min(elapsedTime / duration, 1));

        // When culling is enabled, advance progress but skip DOM/WebGL rendering
        // for off-screen markers. This lets them complete naturally (progress→1)
        // so the rAF loop can sleep, while saving per-frame setLatLng cost.
        const isCulled = busAnimationCullBounds && marker.getLatLng && !busAnimationCullBounds.contains(marker.getLatLng());
        if (isCulled) {
            if (progress >= 1) {
                // Snap to final position even off-screen so pan-back shows correct location
                try { marker.setLatLng(endLatLng); } catch (e) {}
                delete animationFrames[busName];
            }
            return;
        }

        // Check if the bus marker still exists
        if (!busMarkers[busName]) {
            // Bus went out of service, clean up the animation
            delete animationFrames[busName];
            return;
        }

		// Determine the current position (two-segment path: start -> previous target -> new target)
		let currentLatLng;
		const useTwoSegment = useTwoSegmentPath;
		if (useTwoSegment) {
			const distanceTraveled = totalPathDistance * progress;
			// Remove the temporary join line once we pass the connection point
			if (distanceTraveled > distanceToPreviousTarget && busLines[busName] && busLines[busName]['join'] && busLines[busName]['join'].removeFrom) {
				busLines[busName]['join'].removeFrom(map);
				delete busLines[busName]['join'];
			}
			if (distanceTraveled <= distanceToPreviousTarget) {
				// Segment 1: move from start to previous target (linear)
				const t1 = distanceToPreviousTarget === 0 ? 1 : (distanceTraveled / distanceToPreviousTarget);
				currentLatLng = L.latLng(
					startLatLng.lat + (previousTargetLatLng.lat - startLatLng.lat) * t1,
					startLatLng.lng + (previousTargetLatLng.lng - startLatLng.lng) * t1
				);
			} else {
				// Segment 2: move from previous target to new end
				const remaining = Math.max(0, distanceTraveled - distanceToPreviousTarget);
				const t2 = distanceFromPreviousToEnd === 0 ? 1 : (remaining / distanceFromPreviousToEnd);
				if (positioningOption === 'bezier' && prevLatLng) {
					// Map into the curve phase of the existing bezier helper
					const t = 0.3 + 0.7 * Math.min(1, Math.max(0, t2));
					const bezierPoint = calculateBezierPoint(t);
					if (bezierPoint) {
						currentLatLng = L.latLng(bezierPoint.lat, bezierPoint.lng);
					} else {
						currentLatLng = L.latLng(
							previousTargetLatLng.lat + (endLatLng.lat - previousTargetLatLng.lat) * t2,
							previousTargetLatLng.lng + (endLatLng.lng - previousTargetLatLng.lng) * t2
						);
					}
				} else {
					currentLatLng = L.latLng(
						previousTargetLatLng.lat + (endLatLng.lat - previousTargetLatLng.lat) * t2,
						previousTargetLatLng.lng + (endLatLng.lng - previousTargetLatLng.lng) * t2
					);
				}
			}
		} else {
			// Single segment fallback (original behavior)
			if (positioningOption === 'bezier' && prevLatLng) {
				const bezierPoint = calculateBezierPoint(progress);
				if (bezierPoint) {
					currentLatLng = L.latLng(bezierPoint.lat, bezierPoint.lng);
				} else {
					currentLatLng = L.latLng(
						startLatLng.lat + (endLatLng.lat - startLatLng.lat) * progress,
						startLatLng.lng + (endLatLng.lng - startLatLng.lng) * progress
					);
				}
			} else {
				currentLatLng = L.latLng(
					startLatLng.lat + (endLatLng.lat - startLatLng.lat) * progress,
					startLatLng.lng + (endLatLng.lng - startLatLng.lng) * progress
				);
			}
		}

        marker.setLatLng(currentLatLng);
        
        let rotationChange = endRotation - startRotation;
        if (rotationChange > 180) {
            rotationChange -= 360;
        } else if (rotationChange < -180) {
            rotationChange += 360;
        }

        if (!pauseRotationUpdating) {
            const currentRotation = startRotation + rotationChange * progress;
            if (typeof marker.setRotation === 'function') {
                marker.setRotation(currentRotation);
            }
        }

        if (progress >= 1) {
            // Animation complete, clean up (the shared loop keeps driving remaining buses)
            delete animationFrames[busName];
        }
    };
    
    // Custom DOM-mode markers update a DOM transform and step every rAF
    // frame; WebGL markers flush via the batched setData()/updateData()
    // source patch in bus-layer.js, which rebuilds the worker tile index per
    // flush, so they step at ~30Hz. The "bus-animation-rate" dev setting
    // ("off"/"10hz"/"30hz") forces a fixed step for every mode, or keeps the
    // per-mode defaults when "off".
    animateMarker.stepIntervalMs = busAnimationStepIntervalMs(
        marker && marker._rendererMode,
        settings && settings['bus-animation-rate']
    );

    // Register this bus's step with the shared animation loop (coalesces all
    // bus animations into a single requestAnimationFrame per frame).
    animationFrames[busName] = animateMarker;
    ensureBusAnimationLoop();
};


// Allow sim to retime ongoing animations when speed multiplier changes
window.retimeSimAnimations = function() {
    try {
        if (sim !== true) return;
        const mult = Math.max(1, (window.SIM_TIME_MULTIPLIER || 1));
        const pollInterval = Math.max(50, (window.SIM_POLL_INTERVAL_MS || 600) / mult);
        for (const busName in busData) {
            const bus = busData[busName];
            if (!bus || bus.type !== 'sim') continue;
            if (!busMarkers[busName]) continue;
            // The stored sim duration is consumed by updateMarkerPosition, so
            // re-supply it from the current poll interval for the retime.
            bus.simAnimationDuration = pollInterval;
            updateMarkerPosition(busName, false);
        }
    } catch (e) {}
};
