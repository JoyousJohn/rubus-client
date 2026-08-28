/**
 * bus-layer.js — Bus Marker System (two renderer modes)
 * 
 * Modes (switched by the "bus-marker-renderer" dev setting):
 *
 *   'custom'   — maplibregl.Marker DOM elements hosting the original
 *                .bus-marker-wrapper tree. Browser-composited, pixel-identical
 *                to the Leaflet markers, but each marker is a real element the
 *                browser re-composites on every pan frame.
 *
 *   'maplibre' — maplibre's native rendering pipeline (GeoJSON source +
 *                symbol layers) draws OUR custom rubus/passio/rider/duck
 *                marker graphics as sprite images. All markers live in one
 *                source patched via setData()/updateData() per frame, so
 *                pan/zoom has far less DOM churn — at the cost of pre-rasterized
 *                (slightly less crisp) sprites.
 *
 * Both expose a Leaflet-compatible proxy API so plotBus, the animation loop,
 * selection glow, tooltips, and favorites keep working unchanged.
 */

(function() {
    'use strict';

    // =========================================================================
    // Sprite Rendering (used by the 'maplibre' mode)
    // =========================================================================

    /**
     * Helper to create a retina high-DPI canvas scaled by devicePixelRatio.
     */
    function createHiDPICanvas(w, h) {
        const dpr = Math.max(2, window.devicePixelRatio || 2);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        canvas._dpr = dpr;
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        return { canvas, ctx, dpr };
    }

    /**
     * Read a theme CSS variable from :root (resolved for the active
     * [theme=...] attribute). Returns the fallback when unset/unresolvable.
     */
    function getThemeVar(name, fallback) {
        try {
            const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
            return value || fallback;
        } catch (e) {
            return fallback;
        }
    }

    function drawRubusTeardrop(ctx, cx, cy, radius, cornerRadius) {
        cornerRadius = cornerRadius === undefined ? 3 : cornerRadius;
        ctx.beginPath();
        ctx.moveTo(cx, cy - radius);
        ctx.arc(cx, cy, radius, -Math.PI / 2, Math.PI, false);
        // Smooth rounded corner at the top-left (DOM parity:
        // border-top-left-radius: 10%). The two-curve approach pinched
        // inward at the junction, leaving a concave notch in the outline.
        ctx.arcTo(cx - radius, cy - radius, cx, cy - radius, cornerRadius);
        ctx.closePath();
    }

    /**
     * Render a standalone white rounded-pill badge sprite with subtle shadow
     * and black bus number text level with the viewport (matching DOM .bus-name-label).
     */
    function renderLabelPillSprite(labelText) {
        // Measure text width using an offscreen canvas
        const measureCanvas = document.createElement('canvas');
        const measureCtx = measureCanvas.getContext('2d');
        measureCtx.font = 'bold 10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        const textMetrics = measureCtx.measureText(labelText || '');
        const textWidth = textMetrics.width;

        const pad = 4;
        const pillWidth = Math.max(textWidth + 8, 16);
        const pillHeight = 13;
        const totalW = Math.ceil(pillWidth + pad * 2);
        const totalH = Math.ceil(pillHeight + pad * 2);

        const { canvas, ctx } = createHiDPICanvas(totalW, totalH);

        const cx = totalW / 2;
        const cy = totalH / 2;
        const pillRadius = pillHeight / 2; // radius 6.5px for smooth rounded bubble
        const pillX = cx - pillWidth / 2;
        const pillY = cy - pillHeight / 2;

        // Shadow matching DOM: box-shadow: 0 1px 2px rgba(0,0,0,0.3)
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
        ctx.shadowBlur = 2;
        ctx.shadowOffsetY = 1;

        // Draw white rounded pill
        ctx.beginPath();
        ctx.arc(pillX + pillRadius, pillY + pillRadius, pillRadius, Math.PI / 2, Math.PI * 3 / 2);
        ctx.arc(pillX + pillWidth - pillRadius, pillY + pillRadius, pillRadius, -Math.PI / 2, Math.PI / 2);
        ctx.closePath();
        ctx.fillStyle = '#ffffff';
        ctx.fill();

        // Subtle crisp border
        ctx.shadowColor = 'transparent';
        ctx.lineWidth = 0.5;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
        ctx.stroke();

        // Draw label text
        ctx.font = 'bold 10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#000000';
        ctx.fillText(labelText || '', cx, cy + 0.5);

        ctx.restore();

        return canvas;
    }

    /**
     * Render a RUBus-style marker sprite to a canvas.
     * Dimensions match the original DOM markers: small (20px outer / 8px inner),
     * medium (27px / 13px), big (35px / 19px).
     * innerColor overrides the inner dot color (e.g. gold for favorites); when
     * omitted it resolves the active theme's --theme-bus-icon-inner.
     */
    function renderRubusSprite(color, size, innerColor) {
        const dimensions = {
            small: { outer: 20, inner: 8 },
            medium: { outer: 27, inner: 13 },
            big: { outer: 35, inner: 19 }
        };
        const dim = dimensions[size] || dimensions.medium;
        const margin = 4;
        const s = dim.outer + margin * 2;
        const { canvas, ctx } = createHiDPICanvas(s, s);

        const cx = s / 2;
        const cy = s / 2;
        const R = dim.outer / 2;

        // Outer ring: the 1.5px black border sits OUTSIDE the color fill.
        drawRubusTeardrop(ctx, cx, cy, R + 1.5, 3);
        ctx.fillStyle = '#000000';
        ctx.fill();
        drawRubusTeardrop(ctx, cx, cy, R, 1.5);
        ctx.fillStyle = color;
        ctx.fill();

        // Inner circle dot: 1.5px black border outside the theme-color fill.
        const innerR = dim.inner / 2;
        ctx.beginPath();
        ctx.arc(cx, cy, innerR + 1.5, 0, Math.PI * 2);
        ctx.fillStyle = '#000000';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
        ctx.fillStyle = innerColor || getThemeVar('--theme-bus-icon-inner', '#ffffff');
        ctx.fill();

        return canvas;
    }

    /**
     * Render a Passio-style bus marker sprite to a canvas.
     */
    function renderPassioSprite(color, size, busIconCanvas) {
        const sizes = { small: 26, medium: 34, big: 42 };
        const s = sizes[size] || 34;
        const { canvas, ctx } = createHiDPICanvas(s, s);

        const cx = s / 2;
        const cy = s / 2;
        const r = s / 2 - 3;

        const arrowSize = Math.max(4, Math.round(s * 0.16));
        ctx.fillStyle = color;
        ctx.save();
        ctx.translate(cx - r + 1, cy - r + 1);
        ctx.fillRect(0, 0, arrowSize, arrowSize);
        ctx.restore();

        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgb(246, 246, 246)';
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();

        if (busIconCanvas) {
            const iconSize = Math.round(r * 0.7);
            ctx.drawImage(busIconCanvas, cx - iconSize / 2, cy - iconSize / 2, iconSize, iconSize);
        }

        return canvas;
    }

    /**
     * Render a Rider-style marker sprite to a canvas.
     */
    function renderRiderSprite(color, size) {
        const sizes = { small: 26, medium: 34, big: 42 };
        const s = sizes[size] || 34;
        const { canvas, ctx } = createHiDPICanvas(s, s);

        const cx = s / 2;
        const cy = s / 2;
        const r = s / 2 - 3;

        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.stroke();

        const arrowR = r * 0.45;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-Math.PI / 4);
        ctx.beginPath();
        ctx.moveTo(0, -arrowR);
        ctx.lineTo(arrowR * 0.6, arrowR * 0.6);
        ctx.lineTo(0, arrowR * 0.2);
        ctx.lineTo(-arrowR * 0.6, arrowR * 0.6);
        ctx.closePath();
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.restore();

        return canvas;
    }

    /**
     * Render a Duck-style marker sprite to a canvas.
     */
    function renderDuckSprite(color, size) {
        const sizes = { small: 26, medium: 34, big: 42 };
        const s = sizes[size] || 34;
        const { canvas, ctx } = createHiDPICanvas(s, s);

        const cx = s / 2;
        const cy = s / 2;
        const r = s / 2 - 3;

        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.ellipse(cx + 1, cy + 2, r * 0.4, r * 0.28, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(cx - r * 0.2, cy - r * 0.15, r * 0.2, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(cx - r * 0.4, cy - r * 0.15);
        ctx.lineTo(cx - r * 0.55, cy - r * 0.08);
        ctx.lineTo(cx - r * 0.4, cy - r * 0.02);
        ctx.closePath();
        ctx.fillStyle = '#f5a623';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(cx - r * 0.22, cy - r * 0.22, r * 0.06, 0, Math.PI * 2);
        ctx.fillStyle = '#000000';
        ctx.fill();

        return canvas;
    }

    /**
     * Render a soft glow sprite matching the marker's silhouette. Used by the
     * 'maplibre' mode's selection glow. The DOM equivalent is an inline
     * `box-shadow: 0 0 10px <routeColor>` on the marker element; here the marker
     * shape is re-drawn filled with the route color plus a blurred shadow that
     * spills ~10px past the silhouette, so the glow hugs the actual marker shape
     * (rubus teardrop, passio/rider/duck circle) instead of a generic circle.
     * The canvas is padded so the blur is never clipped at the edges, and the
     * shape is centered so it lines up with the marker sprite.
     */
    function renderGlowSprite(type, color, size) {
        const pad = 10;
        let s;
        let drawGlow;

        if (type === 'rubus') {
            const dimensions = { small: { outer: 20 }, medium: { outer: 27 }, big: { outer: 35 } };
            const dim = dimensions[size] || dimensions.medium;
            s = dim.outer + 8 + pad * 2;
            const R = dim.outer / 2 + 1.5;
            drawGlow = function(ctx, cx, cy) { drawRubusTeardrop(ctx, cx, cy, R); };
        } else {
            const sizes = { small: 26, medium: 34, big: 42 };
            const markerS = sizes[size] || 34;
            s = markerS + pad * 2;
            const r = markerS / 2 - 3;
            drawGlow = function(ctx, cx, cy) {
                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.closePath();
            };
        }

        const { canvas, ctx } = createHiDPICanvas(s, s);
        const cx = s / 2;
        const cy = s / 2;

        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = 12;
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.65;
        // Multiple passes compound the blurred shadow (canvas shadows don't
        // accumulate from a single fill), giving a pronounced halo that still
        // hugs the marker silhouette.
        for (let i = 0; i < 3; i++) {
            drawGlow(ctx, cx, cy);
            ctx.fill();
        }
        ctx.restore();

        return canvas;
    }

    /**
     * Create a colored version of the bus SVG icon on a canvas.
     */
    function createColoredBusIconCanvas(svgImage, color, size) {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        ctx.drawImage(svgImage, 0, 0, size, size);
        ctx.globalCompositeOperation = 'source-in';
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, size, size);
        ctx.globalCompositeOperation = 'source-over';

        return canvas;
    }

    // =========================================================================
    // BusMarkerProxy — custom DOM mode (maplibregl.Marker + .bus-marker-wrapper)
    // =========================================================================

    class BusMarkerProxy {
        constructor(busName, lat, lng, options, manager) {
            this._busName = busName;
            this._manager = manager;
            this._clickHandlers = [];
            this._selected = false;
            this._isOnMap = false;
            this._rotation = options.rotation || 0;
            this._rendererMode = 'custom';
            this._lat = lat;
            this._lng = lng;

            const markerType = options.markerType || 'rubus';
            const route = options.route || '';
            const routeColor = options.routeColor || '#446bef';
            const sizeClass = options.sizeClass || 'medium-marker';
            const displayName = options.displayName || busName;

            this._markerType = markerType;
            this._route = route;
            this._routeColor = routeColor;
            this._sizeClass = sizeClass;
            this._isFavorite = false;

            const wrapper = document.createElement('div');
            wrapper.className = 'bus-marker-wrapper';
            // maplibre positions markers by transform from the container's
            // top-left, which requires position:absolute. index.css applies
            // position:relative to .bus-marker-wrapper (same specificity as
            // maplibre's .maplibregl-marker, later in cascade), so force it
            // inline to keep markers pinned to their projected lat/lng.
            wrapper.style.position = 'absolute';

            if (markerType === 'passio') {
                this._rotationEl = document.createElement('div');
                this._rotationEl.className = 'passio-marker ' + sizeClass;
                this._rotationEl.style.willChange = 'transform';
                const arrowOut = document.createElement('div');
                arrowOut.className = 'passio-marker-arrow-out';
                const arrowIn = document.createElement('div');
                arrowIn.className = 'passio-marker-arrow-in';
                arrowIn.style.backgroundColor = routeColor;
                arrowOut.appendChild(arrowIn);
                this._rotationEl.appendChild(arrowOut);
                const circle = document.createElement('div');
                circle.className = 'passio-marker-circle';
                circle.style.borderColor = routeColor;
                const icon = document.createElement('img');
                icon.className = 'passio-bus-icon';
                icon.style.width = '35%';
                icon.style.height = '35%';
                icon.style.objectFit = 'contain';
                icon.src = generateColoredSvg(routeColor);
                circle.appendChild(icon);
                this._rotationEl.appendChild(circle);
                this._passioBusIconEl = icon;
            } else if (markerType === 'rider') {
                this._rotationEl = document.createElement('div');
                this._rotationEl.className = 'rider-marker ' + sizeClass;
                this._rotationEl.style.backgroundColor = routeColor;
                const arrow = document.createElement('i');
                arrow.className = 'fa-solid fa-location-arrow';
                arrow.style.color = 'white';
                this._rotationEl.appendChild(arrow);
            } else if (markerType === 'duck') {
                this._rotationEl = document.createElement('div');
                this._rotationEl.className = 'duck-marker ' + sizeClass;
                const duck = document.createElement('i');
                duck.className = 'fa-solid fa-duck';
                duck.style.color = routeColor;
                this._rotationEl.appendChild(duck);
            } else {
                // RUBus default
                this._rotationEl = document.createElement('div');
                this._rotationEl.className = 'bus-icon-outer';
                this._rotationEl.style.backgroundColor = routeColor;
                const inner = document.createElement('div');
                inner.className = 'bus-icon-inner';
                this._rotationEl.appendChild(inner);
            }
            wrapper.appendChild(this._rotationEl);

            // Label element (hidden unless "show bus names" is on)
            this._labelEl = document.createElement('div');
            this._labelEl.className = 'bus-name-label none';
            this._labelEl.setAttribute('bus-name', busName);
            this._labelEl.textContent = displayName;
            wrapper.appendChild(this._labelEl);

            this._element = wrapper;
            this._rotationElement = this._rotationEl;
            this._zIndexBase = 500;
            this._applyZIndex();

            this._marker = new maplibregl.Marker({ element: wrapper, anchor: 'center', subpixelPositioning: true });
            this._marker.setLngLat([lng, lat]);
        }

        // -- Leaflet-compatible API --

        addTo(map) {
            // Idempotent: maplibre's Marker.addTo() removes + re-appends the
            // element (reordering overlapping markers), so re-adding an
            // already-on-map marker is never needed. Warn so unexpected
            // redundant calls are loud, not silently swallowed.
            if (this._isOnMap) {
                console.warn('[BusMarker] addTo on already-on-map marker', this._busName);
                return this;
            }
            this._marker.addTo(map);
            this._isOnMap = true;
            return this;
        }

        remove() {
            // Stop the in-flight animation so a removed/hidden marker stops
            // scheduling per-frame position updates (and source flushes).
            cancelBusAnimation(this._busName);
            this._marker.remove();
            this._isOnMap = false;
            return this;
        }

        removeFrom() {
            return this.remove();
        }

        setLatLng(newLatLng) {
            const p = _parseLatLng(newLatLng);
            this._lat = p.lat;
            this._lng = p.lng;
            this._marker.setLngLat([p.lng, p.lat]);
            return this;
        }

        setLatLngPrecise(newLatLng) {
            return this.setLatLng(newLatLng);
        }

        getLatLng() {
            return { lat: this._lat, lng: this._lng };
        }

        getLngLat() {
            return { lat: this._lat, lng: this._lng };
        }

        setLngLat(lnglat) {
            if (Array.isArray(lnglat)) {
                return this.setLatLng([lnglat[1], lnglat[0]]);
            }
            return this.setLatLng({ lat: lnglat.lat, lng: lnglat.lng });
        }

        getRotation() {
            return this._rotation || 0;
        }

        setRotation(deg) {
            this._rotation = deg;
            if (this._rotationEl) {
                this._rotationEl.style.transform = `rotate(${deg}deg)`;
            }
            if (this._markerType === 'passio' && this._passioBusIconEl) {
                this._passioBusIconEl.style.transform = `rotate(${-deg}deg)`;
            }
            return this;
        }

        setZIndexOffset(offset) {
            this._element.style.zIndex = String(Math.max(1, this._zIndexBase + Number(offset || 0)));
            return this;
        }

        // Toggle route/visibility filtering. Single choke point for hiding
        // and showing markers so both renderer modes stay in sync.
        setVisibility(visible) {
            this._element.style.display = visible ? '' : 'none';
            return this;
        }

        // Stable z-index so overlapping markers stack deterministically. Normal
        // buses use a fixed per-bus base (assigned by the manager); the selected
        // bus is always rendered on top.
        _applyZIndex() {
            this._element.style.zIndex = String(this._selected ? 5000 : this._zIndexBase);
        }

        getElement() {
            return this._element;
        }

        on(event, handler) {
            if (event === 'click') {
                this._clickHandlers.push(handler);
                if (this._element) {
                    this._element.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this._fireClick();
                    });
                }
            } else if (this._element) {
                this._element.addEventListener(event, handler);
            }
            return this;
        }

        // -- Internal helpers --

        _fireClick() {
            for (const handler of this._clickHandlers) {
                try { handler(); } catch (e) { console.error(e); }
            }
        }

        _isVisible() {
            return this._isOnMap && this._element.style.display !== 'none';
        }

        _isLabelVisible() {
            return !!(this._labelEl && !this._labelEl.classList.contains('none'));
        }

        // Re-color this marker for its (possibly new) route. Handles every
        // marker type so route changes and route-color changes always update
        // the marker regardless of which type is selected.
        setRouteColor(newColor) {
            this._routeColor = newColor;
            const el = this._element;
            const arrowIn = el.querySelector('.passio-marker-arrow-in');
            if (arrowIn) arrowIn.style.backgroundColor = newColor;
            const circle = el.querySelector('.passio-marker-circle');
            if (circle) circle.style.borderColor = newColor;
            const busIcon = el.querySelector('.passio-bus-icon');
            if (busIcon && svgCache[newColor]) busIcon.src = svgCache[newColor];
            if (this._rotationEl.classList.contains('bus-icon-outer')) {
                this._rotationEl.style.backgroundColor = newColor;
            }
            if (this._rotationEl.classList.contains('rider-marker')) {
                this._rotationEl.style.backgroundColor = newColor;
            }
            if (this._rotationEl.classList.contains('duck-marker')) {
                const duckIcon = this._rotationEl.querySelector('i');
                if (duckIcon) duckIcon.style.color = newColor;
            }
        }

        // Toggle the favorite (gold inner dot). Only RUBus markers have an
        // inner dot; other types have no favorite indicator.
        setFavorite(isFavorite) {
            this._isFavorite = !!isFavorite;
            if (this._markerType !== 'rubus') return;
            const inner = this._element.querySelector('.bus-icon-inner');
            if (inner) inner.style.backgroundColor = this._isFavorite ? 'gold' : 'var(--theme-bus-icon-inner)';
        }

        setOpacity(opacity) {
            this._opacity = opacity;
            this._element.style.opacity = String(opacity);
            return this;
        }
    }

    // =========================================================================
    // WebGLBusMarkerProxy — 'maplibre' mode: state held here, flushed to the
    // GeoJSON source by the manager. A detached DOM tree provides the
    // jQuery/querySelector API surface for compatibility.
    // =========================================================================

    class WebGLBusMarkerProxy {
        constructor(busName, lat, lng, options, manager) {
            this._busName = busName;
            this._manager = manager;
            this._clickHandlers = [];
            this._selected = false;
            this._isOnMap = false;
            this._dirty = true;
            this._rendererMode = 'maplibre';

            const markerType = options.markerType || 'rubus';
            const route = options.route || '';
            const routeColor = options.routeColor || '#446bef';
            const sizeClass = {
                'small-marker': 'small', 'medium-marker': 'medium', 'big-marker': 'big'
            }[options.sizeClass] || options.sizeClass || 'medium';
            const displayName = options.displayName || busName;

            this._markerType = markerType;
            this._route = route;
            this._routeColor = routeColor;
            this._sizeClass = sizeClass;
            this._displayName = displayName;
            this._rotation = options.rotation || 0;
            this._lat = lat;
            this._lng = lng;
            this._isFavorite = false;

            this._spriteName = manager._ensureSprite(markerType, routeColor, sizeClass);
            this._glowSpriteName = manager._ensureGlowSprite(markerType, routeColor, sizeClass);

            // Detached mock DOM tree — never attached to the map, used only as
            // a property bag for jQuery/DOM queries.
            this._mockEl = document.createElement('div');
            this._mockEl.className = 'bus-icon';
            this._mockEl.style.width = '30px';
            this._mockEl.style.height = '30px';

            const wrapper = document.createElement('div');
            wrapper.className = 'bus-marker-wrapper';

            this._rotationEl = document.createElement('div');
            if (markerType === 'passio') {
                this._rotationEl.className = 'passio-marker ' + (options.sizeClass || 'medium-marker');
                const arrowOut = document.createElement('div');
                arrowOut.className = 'passio-marker-arrow-out';
                const arrowIn = document.createElement('div');
                arrowIn.className = 'passio-marker-arrow-in';
                arrowIn.style.backgroundColor = routeColor;
                arrowOut.appendChild(arrowIn);
                this._rotationEl.appendChild(arrowOut);
                const circle = document.createElement('div');
                circle.className = 'passio-marker-circle';
                circle.style.borderColor = routeColor;
                const icon = document.createElement('img');
                icon.className = 'passio-bus-icon';
                icon.style.width = '35%';
                icon.style.height = '35%';
                icon.style.objectFit = 'contain';
                icon.src = generateColoredSvg(routeColor);
                circle.appendChild(icon);
                this._rotationEl.appendChild(circle);
                this._passioBusIconEl = icon;
            } else if (markerType === 'rider') {
                this._rotationEl.className = 'rider-marker ' + (options.sizeClass || 'medium-marker');
                this._rotationEl.style.backgroundColor = routeColor;
            } else if (markerType === 'duck') {
                this._rotationEl.className = 'duck-marker ' + (options.sizeClass || 'medium-marker');
            } else {
                this._rotationEl.className = 'bus-icon-outer';
                this._rotationEl.style.backgroundColor = routeColor;
                const inner = document.createElement('div');
                inner.className = 'bus-icon-inner';
                this._rotationEl.appendChild(inner);
            }
            wrapper.appendChild(this._rotationEl);

            this._labelEl = document.createElement('div');
            this._labelEl.className = 'bus-name-label none';
            this._labelEl.setAttribute('bus-name', busName);
            this._labelEl.textContent = displayName;
            wrapper.appendChild(this._labelEl);

            this._mockEl.appendChild(wrapper);
            this._rotationElement = this._rotationEl;
            this._icon = this._mockEl;
        }

        // -- Leaflet-compatible API --

        addTo(map) {
            if (this._isOnMap) {
                console.warn('[BusMarker] addTo on already-on-map marker', this._busName);
                return this;
            }
            this._isOnMap = true;
            this._dirty = true;
            this._manager.scheduleBatchUpdate();
            return this;
        }

        remove() {
            // Stop the in-flight animation so a removed/hidden marker stops
            // scheduling per-frame position updates (and source flushes).
            cancelBusAnimation(this._busName);
            this._isOnMap = false;
            this._dirty = true;
            this._manager.scheduleBatchUpdate();
            return this;
        }

        removeFrom() {
            return this.remove();
        }

        setLatLng(newLatLng) {
            const p = _parseLatLng(newLatLng);
            this._lat = p.lat;
            this._lng = p.lng;
            this._dirty = true;
            this._manager.scheduleBatchUpdate();
            return this;
        }

        setLatLngPrecise(newLatLng) {
            return this.setLatLng(newLatLng);
        }

        getLatLng() {
            return { lat: this._lat, lng: this._lng };
        }

        getLngLat() {
            return { lat: this._lat, lng: this._lng };
        }

        setLngLat(lnglat) {
            if (Array.isArray(lnglat)) {
                return this.setLatLng([lnglat[1], lnglat[0]]);
            }
            return this.setLatLng({ lat: lnglat.lat, lng: lnglat.lng });
        }

        getRotation() {
            return this._rotation || 0;
        }

        setRotation(deg) {
            this._rotation = deg;
            if (this._rotationEl) {
                this._rotationEl.style.transform = `rotate(${deg}deg)`;
            }
            if (this._markerType === 'passio' && this._passioBusIconEl) {
                this._passioBusIconEl.style.transform = `rotate(${-deg}deg)`;
            }
            this._dirty = true;
            this._manager.scheduleBatchUpdate();
            return this;
        }

        setZIndexOffset(offset) {
            // Z-ordering handled by symbol-sort-key
            return this;
        }

        getElement() {
            return this._mockEl;
        }

        on(event, handler) {
            if (event === 'click') {
                this._clickHandlers.push(handler);
            }
            this._mockEl.addEventListener(event, handler);
            return this;
        }

        // -- Internal helpers --

        _fireClick() {
            for (const handler of this._clickHandlers) {
                try { handler(); } catch (e) { console.error(e); }
            }
        }

        _isVisible() {
            return this._isOnMap && this._mockEl.style.display !== 'none';
        }

        _isLabelVisible() {
            return !!(this._labelEl && !this._labelEl.classList.contains('none'));
        }

        _toGeoJSONFeature() {
            return {
                type: 'Feature',
                // Unique id required for GeoJSONSource.updateData() diffing.
                id: String(this._busName),
                geometry: {
                    type: 'Point',
                    coordinates: [this._lng, this._lat]
                },
                properties: {
                    busName: this._busName,
                    spriteName: this._spriteName,
                    glowSpriteName: this._glowSpriteName,
                    pillSpriteName: this._pillSpriteName || '',
                    rotation: this._rotation || 0,
                    visible: this._isVisible(),
                    selected: this._selected,
                    showLabel: this._isLabelVisible() && !!this._pillSpriteName,
                    label: this._labelEl.textContent || '',
                    routeColor: this._routeColor,
                    opacity: this._opacity !== undefined ? this._opacity : 1
                }
            };
        }

        // Re-ensure this marker's sprite from its current type/color/size,
        // favorite state, and optional label text.
        _refreshSprite() {
            this._spriteName = this._manager._ensureSprite(
                this._markerType, this._routeColor, this._sizeClass,
                this._isFavorite ? 'gold' : undefined
            );
            this._glowSpriteName = this._manager._ensureGlowSprite(
                this._markerType, this._routeColor, this._sizeClass
            );
            const labelText = this._isLabelVisible() ? (this._labelEl && this._labelEl.textContent) : undefined;
            this._pillSpriteName = labelText ? this._manager._ensureLabelPillSprite(labelText) : null;
            this._dirty = true;
        }

        // Re-color this marker for its (possibly new) route. Regenerates the
        // sprite (which bakes the route color) and syncs the mock DOM.
        setRouteColor(newColor) {
            this._routeColor = newColor;
            const el = this._mockEl;
            const arrowIn = el.querySelector('.passio-marker-arrow-in');
            if (arrowIn) arrowIn.style.backgroundColor = newColor;
            const circle = el.querySelector('.passio-marker-circle');
            if (circle) circle.style.borderColor = newColor;
            const busIcon = el.querySelector('.passio-bus-icon');
            if (busIcon && svgCache[newColor]) busIcon.src = svgCache[newColor];
            if (this._rotationEl.classList.contains('bus-icon-outer')) {
                this._rotationEl.style.backgroundColor = newColor;
            }
            if (this._rotationEl.classList.contains('rider-marker')) {
                this._rotationEl.style.backgroundColor = newColor;
            }
            if (this._rotationEl.classList.contains('duck-marker')) {
                const duckIcon = this._rotationEl.querySelector('i');
                if (duckIcon) duckIcon.style.color = newColor;
            }
            this._refreshSprite();
            this._manager.scheduleBatchUpdate();
        }

        // Toggle the favorite (gold inner dot). Only RUBus markers have an
        // inner dot; other types have no favorite indicator.
        setFavorite(isFavorite) {
            this._isFavorite = !!isFavorite;
            if (this._markerType !== 'rubus') return;
            this._refreshSprite();
            this._manager.scheduleBatchUpdate();
        }

        // Toggle route/visibility filtering. Single choke point for hiding
        // and showing markers: updates the mock DOM state read by _isVisible()
        // and marks the feature dirty so the next flush (add/update/remove)
        // reflects it immediately instead of on the next poll.
        setVisibility(visible) {
            this._mockEl.style.display = visible ? '' : 'none';
            this._dirty = true;
            this._manager.scheduleBatchUpdate();
            return this;
        }

        setOpacity(opacity) {
            this._opacity = opacity;
            this._dirty = true;
            this._manager.scheduleBatchUpdate();
            return this;
        }
    }

    // =========================================================================
    // BusLayerManager — dispatches between the two renderer modes
    // =========================================================================

    class BusLayerManager {
        constructor() {
            this._map = null;
            this._proxies = {};          // busName → BusMarkerProxy | WebGLBusMarkerProxy
            this._initialized = false;
            this._selectedBusName = null; // busName currently shown selected

            // WebGL mode state
            this._cachedFeatures = {};   // busName → last-serialized GeoJSON Feature
            this._rafScheduled = false;
            this._spriteCache = {};      // spriteName → {type, color, size} metadata
            this._glowSpriteCache = {};  // glowSpriteName → true
            this._labelPillCache = {};   // pillSpriteName → true
            this._busIconImage = null;
            this._busIconLoaded = false;
            this._pendingSpriteQueue = [];
            this._zIndexCounter = 500;   // stable per-bus z-index for DOM mode
            this._sourceId = 'bus-markers-source';
            this._layerId = 'bus-markers-layer';
            this._labelLayerId = 'bus-markers-labels';
            this._glowLayerId = 'bus-markers-glow';
            this._selectedLayerId = 'bus-markers-selected';
            this._selectedLabelLayerId = 'bus-markers-selected-labels';
        }

        /**
         * Initialize the marker system. Call after map is created.
         * The WebGL source/layers are always created (deferred until the map
         * style loads) so toggling renderer mode works instantly.
         */
        init(mapInstance) {
            this._map = mapInstance;

            // Start loading the bus SVG icon (used for passio sprites)
            this._loadBusIcon();

            const self = this;
            function setupLayers() {
                if (self._initialized) return;
                // addSource/addLayer throw until the style JSON is parsed
                // (Style._checkLoaded). The gate is style._loaded, NOT
                // map.isStyleLoaded() or the map 'load' event — those also wait
                // on every source's tile requests and can stall indefinitely on
                // a hung request, leaving the marker system never initialized.
                if (!(mapInstance.style && mapInstance.style._loaded)) return;
                try {
                    if (!mapInstance.getSource(self._sourceId)) {
                        mapInstance.addSource(self._sourceId, {
                            type: 'geojson',
                            data: { type: 'FeatureCollection', features: [] }
                        });
                    }

                    // Layer 1: Unselected bus markers
                    if (!mapInstance.getLayer(self._layerId)) {
                        mapInstance.addLayer({
                            id: self._layerId,
                            type: 'symbol',
                            source: self._sourceId,
                            filter: ['all', ['==', ['get', 'visible'], true], ['!=', ['get', 'selected'], true]],
                            layout: {
                                'icon-image': ['get', 'spriteName'],
                                'icon-rotate': ['get', 'rotation'],
                                'icon-rotation-alignment': 'map',
                                'icon-allow-overlap': true,
                                'icon-ignore-placement': true,
                                'icon-size': 1,
                                'icon-pitch-alignment': 'map'
                            },
                            paint: {
                                'icon-opacity': ['get', 'opacity']
                            }
                        });
                    }

                    // Layer 2: Unselected bus name labels (level with viewport, never hidden)
                    if (!mapInstance.getLayer(self._labelLayerId)) {
                        mapInstance.addLayer({
                            id: self._labelLayerId,
                            type: 'symbol',
                            source: self._sourceId,
                            filter: ['all', ['==', ['get', 'visible'], true], ['!=', ['get', 'selected'], true], ['==', ['get', 'showLabel'], true]],
                            layout: {
                                'icon-image': ['get', 'pillSpriteName'],
                                'icon-rotation-alignment': 'viewport',
                                'icon-pitch-alignment': 'viewport',
                                'icon-allow-overlap': true,
                                'icon-ignore-placement': true,
                                'icon-size': 1
                            },
                            paint: {
                                'icon-opacity': ['get', 'opacity']
                            }
                        });
                    }

                    // Layer 3: Selected bus glow
                    if (!mapInstance.getLayer(self._glowLayerId)) {
                        mapInstance.addLayer({
                            id: self._glowLayerId,
                            type: 'symbol',
                            source: self._sourceId,
                            filter: ['all', ['==', ['get', 'visible'], true], ['==', ['get', 'selected'], true]],
                            layout: {
                                'icon-image': ['get', 'glowSpriteName'],
                                'icon-rotate': ['get', 'rotation'],
                                'icon-rotation-alignment': 'map',
                                'icon-allow-overlap': true,
                                'icon-ignore-placement': true,
                                'icon-size': 1,
                                'icon-pitch-alignment': 'map'
                            },
                            paint: {
                                'icon-opacity': ['get', 'opacity']
                            }
                        });
                    }

                    // Layer 4: Selected bus marker (paints above unselected markers and labels)
                    if (!mapInstance.getLayer(self._selectedLayerId)) {
                        mapInstance.addLayer({
                            id: self._selectedLayerId,
                            type: 'symbol',
                            source: self._sourceId,
                            filter: ['all', ['==', ['get', 'visible'], true], ['==', ['get', 'selected'], true]],
                            layout: {
                                'icon-image': ['get', 'spriteName'],
                                'icon-rotate': ['get', 'rotation'],
                                'icon-rotation-alignment': 'map',
                                'icon-allow-overlap': true,
                                'icon-ignore-placement': true,
                                'icon-size': 1,
                                'icon-pitch-alignment': 'map'
                            },
                            paint: {
                                'icon-opacity': ['get', 'opacity']
                            }
                        });
                    }

                    // Layer 5: Selected bus name label (paints above selected bus marker)
                    if (!mapInstance.getLayer(self._selectedLabelLayerId)) {
                        mapInstance.addLayer({
                            id: self._selectedLabelLayerId,
                            type: 'symbol',
                            source: self._sourceId,
                            filter: ['all', ['==', ['get', 'visible'], true], ['==', ['get', 'selected'], true], ['==', ['get', 'showLabel'], true]],
                            layout: {
                                'icon-image': ['get', 'pillSpriteName'],
                                'icon-rotation-alignment': 'viewport',
                                'icon-pitch-alignment': 'viewport',
                                'icon-allow-overlap': true,
                                'icon-ignore-placement': true,
                                'icon-size': 1
                            },
                            paint: {
                                'icon-opacity': ['get', 'opacity']
                            }
                        });
                    }

                    self._initialized = true;
                    mapInstance.off('style.load', setupLayers);
                    self._flushPendingSprites();
                    self._setupClickHandler();

                    // Flush any proxies that were created before the style
                    // loaded (their earlier flush early-returned while
                    // _initialized was false) so static buses appear
                    // immediately rather than waiting for the next poll.
                    self.scheduleBatchUpdate();
                } catch (e) {
                    console.error('[BusLayerManager] Error setting up layers:', e);
                }
            }

            // Layer creation retries automatically once the style parses
            // ('style.load' fires as soon as the style JSON is applied) and on
            // any style replacement while _initialized is still false.
            mapInstance.on('style.load', setupLayers);
            setupLayers();
        }

        /**
         * Load the bus SVG as an Image element for passio sprite rendering.
         */
        async _loadBusIcon() {
            try {
                const response = await fetch('img/passio-bus.svg');
                const svgText = await response.text();
                const blob = new Blob([svgText], { type: 'image/svg+xml' });
                const url = URL.createObjectURL(blob);
                const img = new Image();
                img.src = url;
                await new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = reject;
                });
                this._busIconImage = img;
                this._busIconLoaded = true;
                URL.revokeObjectURL(url);
                this._regeneratePassioSprites();
            } catch (e) {
                console.warn('[BusLayerManager] Failed to load bus SVG icon:', e);
            }
        }

        /**
         * Regenerate all passio sprites now that the SVG icon is loaded.
         */
        _regeneratePassioSprites() {
            if (!this._busIconLoaded) return;
            for (const name in this._spriteCache) {
                const meta = this._spriteCache[name];
                if (meta && meta.type === 'passio') {
                    const busIconCanvas = createColoredBusIconCanvas(this._busIconImage, meta.color, 40);
                    const canvas = renderPassioSprite(meta.color, meta.size, busIconCanvas);
                    this._addSpriteToMap(name, canvas);
                }
            }
            this.scheduleBatchUpdate();
        }

        /**
         * Ensure a sprite image exists for the given type/color/size.
         * innerColor (e.g. 'gold' for favorites) overrides the RUBus inner dot;
         * when omitted the sprite is baked from the active theme.
         * Returns the sprite name.
         */
        _ensureSprite(type, color, size, innerColor) {
            const colorKey = color.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
            const name = 'bus-' + type + '-' + colorKey + '-' + size + (innerColor ? '-inner-' + innerColor : '');

            if (this._spriteCache[name]) return name;

            let canvas;
            if (type === 'passio') {
                let busIconCanvas = null;
                if (this._busIconLoaded) {
                    busIconCanvas = createColoredBusIconCanvas(this._busIconImage, color, 40);
                }
                canvas = renderPassioSprite(color, size, busIconCanvas);
            } else if (type === 'rider') {
                canvas = renderRiderSprite(color, size);
            } else if (type === 'duck') {
                canvas = renderDuckSprite(color, size);
            } else {
                canvas = renderRubusSprite(color, size, innerColor);
            }

            this._spriteCache[name] = { type: type, color: color, size: size, innerColor: innerColor };
            this._addSpriteToMap(name, canvas);

            return name;
        }

        /**
         * Ensure a white rounded-pill badge sprite exists for the given bus name label.
         */
        _ensureLabelPillSprite(labelText) {
            if (!labelText) return null;
            const name = 'pill-' + String(labelText).replace(/[^a-zA-Z0-9]/g, '');

            if (this._labelPillCache[name]) return name;

            this._labelPillCache[name] = true;
            this._addSpriteToMap(name, renderLabelPillSprite(labelText));

            return name;
        }

        /**
         * Ensure a glow sprite exists for the given type/color/size. The glow
         * is a blurred silhouette of the marker shape (see renderGlowSprite)
         * drawn as a separate sprite beneath the icon. Returns the sprite name.
         */
        _ensureGlowSprite(type, color, size) {
            const colorKey = color.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
            const name = 'glow-' + type + '-' + colorKey + '-' + size;

            if (this._glowSpriteCache[name]) return name;

            this._glowSpriteCache[name] = true;
            this._addSpriteToMap(name, renderGlowSprite(type, color, size));

            return name;
        }

        /**
         * Add a canvas sprite image to the map.
         */
        _addSpriteToMap(name, canvas) {
            if (!this._map || !this._initialized) {
                this._pendingSpriteQueue.push({ name, canvas });
                return;
            }
            try {
                if (this._map.hasImage(name)) {
                    this._map.removeImage(name);
                }
                const ctx = canvas.getContext('2d');
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const dpr = canvas._dpr || window.devicePixelRatio || 2;
                const options = { pixelRatio: dpr };
                if (canvas._stretchX) options.stretchX = canvas._stretchX;
                if (canvas._stretchY) options.stretchY = canvas._stretchY;
                if (canvas._content) options.content = canvas._content;
                this._map.addImage(name, {
                    width: canvas.width,
                    height: canvas.height,
                    data: new Uint8Array(imageData.data.buffer)
                }, options);
            } catch (e) {
                console.warn('[BusLayerManager] Error adding sprite ' + name + ':', e);
            }
        }

        _flushPendingSprites() {
            const q = this._pendingSpriteQueue;
            this._pendingSpriteQueue = [];
            for (const item of q) {
                this._addSpriteToMap(item.name, item.canvas);
            }
        }

        /**
         * Create a bus marker proxy for the given bus (mode from settings).
         */
        createProxy(busName, latlng, options) {
            const p = _parseLatLng(latlng);
            const rendererMode = (typeof settings !== 'undefined' && settings['bus-marker-renderer']) || 'custom';

            let proxy;
            if (rendererMode === 'maplibre') {
                proxy = new WebGLBusMarkerProxy(busName, p.lat, p.lng, options, this);
            } else {
                proxy = new BusMarkerProxy(busName, p.lat, p.lng, options, this);
                proxy._zIndexBase = this._zIndexCounter++;
                proxy._applyZIndex();
            }

            // Remove old proxy if it exists
            if (this._proxies[busName]) {
                this._proxies[busName].remove();
            }
            this._proxies[busName] = proxy;

            // Re-apply selection if this bus is the currently selected one
            // (e.g. after a full marker teardown/recreate when toggling the
            // renderer mode) — the newly built proxy starts unselected.
            if (busName === this._selectedBusName) {
                this.setSelectedBus(busName);
            }

            return proxy;
        }

        /**
         * Remove a proxy and its marker.
         */
        removeProxy(busName) {
            const proxy = this._proxies[busName];
            if (proxy) {
                proxy.remove();
                delete this._proxies[busName];
            }
        }

        /**
         * Get a proxy by bus name.
         */
        getProxy(busName) {
            return this._proxies[busName] || null;
        }

        /**
         * Set the selected bus.
         */
        setSelectedBus(busName) {
            this._selectedBusName = busName;
            for (const name in this._proxies) {
                const proxy = this._proxies[name];
                const selected = (name === busName);
                proxy._selected = selected;
                if (proxy._rendererMode === 'maplibre') {
                    proxy._dirty = true;
                } else {
                    proxy._applyZIndex();
                    const rotEl = proxy._rotationElement || proxy._rotationEl;
                    if (rotEl) {
                        rotEl.style.boxShadow = selected ? `0 0 10px ${proxy._routeColor || '#446bef'}` : '';
                    }
                }
            }
            this.scheduleBatchUpdate();
        }

        /**
         * Clear selection.
         */
        clearSelection() {
            this.setSelectedBus(null);
        }

        /**
         * Update marker colors when a route's color changes.
         */
        updateRouteColor(route, newColor) {
            for (const busName in this._proxies) {
                const proxy = this._proxies[busName];
                if (proxy._route === route) {
                    proxy.setRouteColor(newColor);
                }
            }
            this.scheduleBatchUpdate();
        }

        /**
         * Update a single bus marker when the bus changes routes.
         */
        setBusRoute(busName, route, newColor) {
            const proxy = this._proxies[busName];
            if (!proxy) return;
            proxy._route = route;
            proxy.setRouteColor(newColor);
            this.scheduleBatchUpdate();
        }

        /**
         * Sync stored marker styles after the settings-driven size/type updates.
         */
        updateAllMarkerStyles() {
            const currentSize = (typeof settings !== 'undefined' && settings['marker-size']) ? settings['marker-size'] : 'medium';
            const markerType = (typeof settings !== 'undefined' && settings['marker-type']) ? settings['marker-type'] : 'rubus';
            const sizeClass = {
                small: 'small', medium: 'medium', big: 'big'
            }[currentSize] || 'medium';
            const domSizeClass = {
                small: 'small-marker', medium: 'medium-marker', big: 'big-marker'
            }[currentSize] || 'medium-marker';

            for (const busName in this._proxies) {
                const proxy = this._proxies[busName];
                if (proxy._rendererMode === 'maplibre') {
                    if (proxy._markerType !== markerType || proxy._sizeClass !== sizeClass) {
                        proxy._markerType = markerType;
                        proxy._sizeClass = sizeClass;
                        proxy._refreshSprite();
                    }
                } else {
                    if (proxy._markerType !== markerType) {
                        // Marker type changed — recreate via plotBus (handled by updateMarkerType).
                        proxy._markerType = markerType;
                    }
                    proxy._sizeClass = domSizeClass;
                    if (proxy._rotationEl) {
                        proxy._rotationEl.classList.remove('small-marker', 'medium-marker', 'big-marker');
                        proxy._rotationEl.classList.add(domSizeClass);
                    }
                }
            }
            this.scheduleBatchUpdate();
        }

        /**
         * Mark every WebGL proxy dirty and refresh sprites so the next flush re-serializes it.
         */
        markAllDirty() {
            for (const name in this._proxies) {
                const proxy = this._proxies[name];
                if (proxy._rendererMode === 'maplibre') {
                    proxy._refreshSprite();
                }
            }
            this.scheduleBatchUpdate();
        }

        /**
         * Regenerate RUBus sprites after a theme change (they bake the theme
         * inner color). Sprites with an explicit inner color (e.g. favorite
         * gold) are theme-independent and are left cached. No-op in custom DOM
         * mode.
         */
        regenerateThemeSprites() {
            const rubusNames = [];
            for (const name in this._spriteCache) {
                const meta = this._spriteCache[name];
                if (meta && meta.type === 'rubus' && !meta.innerColor) rubusNames.push(name);
            }
            if (!rubusNames.length) return;

            for (const name of rubusNames) {
                delete this._spriteCache[name];
                if (this._map && this._map.hasImage(name)) {
                    this._map.removeImage(name);
                }
            }
            for (const busName in this._proxies) {
                const proxy = this._proxies[busName];
                if (proxy._rendererMode === 'maplibre' && proxy._markerType === 'rubus') {
                    proxy._refreshSprite();
                }
            }
            this.scheduleBatchUpdate();
        }

        /**
         * Coalesce WebGL source updates into a single setData()/updateData()
         * per frame. No-op in custom DOM mode.
         */
        scheduleBatchUpdate() {
            if (this._rafScheduled) return;
            this._rafScheduled = true;
            requestAnimationFrame(() => {
                this._rafScheduled = false;
                this._flushBatchUpdate();
            });
        }

        /**
         * Push pending WebGL proxy changes to the source. The first flush (or
         * a flush on an empty source) rebuilds the FeatureCollection with
         * setData(); every subsequent flush sends an updateData() diff. The
         * diff avoids re-sending the full payload, but MapLibre still rebuilds
         * the worker tile index per update — which is why WebGL marker steps
         * are throttled to ~30Hz (see WEBGL_ANIMATION_STEP_MS).
         */
        _flushBatchUpdate() {
            if (!this._map || !this._initialized) return;

            // When the "Pause Bus Markers on Pan" dev setting is enabled, defer
            // source updates while the user is actively dragging/pinching.
            if (window.isMapDragging && typeof settings !== 'undefined' && settings && settings['toggle-pause-bus-markers-on-pan']) return;

            const source = this._map.getSource(this._sourceId);
            if (!source) return;

            // Snapshot the ids currently in the source (== _cachedFeatures) so
            // the diff below can tell adds/updates/removes apart.
            const idsInSource = new Set(Object.keys(this._cachedFeatures));
            const touched = new Set();

            const added = [];
            const updated = [];
            const removed = [];

            for (const busName in this._proxies) {
                const proxy = this._proxies[busName];
                if (proxy._rendererMode !== 'maplibre') continue;
                touched.add(busName);

                if (!proxy._isVisible()) {
                    // Hidden/removed buses are dropped from the source.
                    if (idsInSource.has(busName)) removed.push(busName);
                    delete this._cachedFeatures[busName];
                    continue;
                }
                if (!proxy._dirty) continue;

                const feature = proxy._toGeoJSONFeature();
                this._cachedFeatures[busName] = feature;
                proxy._dirty = false;
                if (idsInSource.has(busName)) {
                    updated.push({
                        id: feature.id,
                        newGeometry: feature.geometry,
                        removeAllProperties: true,
                        addOrUpdateProperties: Object.entries(feature.properties).map(([key, value]) => ({key, value}))
                    });
                } else {
                    added.push(feature);
                }
            }

            // Proxies removed outright (deleted from _proxies by removeProxy)
            // never appear in the loop, so drop their stale features here.
            for (const busName of idsInSource) {
                if (touched.has(busName)) continue;
                removed.push(busName);
                delete this._cachedFeatures[busName];
            }

            if (!added.length && !updated.length && !removed.length) return;

            if (idsInSource.size === 0 || typeof source.updateData !== 'function') {
                // First population (or a MapLibre build without updateData):
                // full rebuild.
                const allFeatures = Object.values(this._cachedFeatures);
                allFeatures.sort((a, b) => (a.properties.selected ? 1 : 0) - (b.properties.selected ? 1 : 0));
                source.setData({
                    type: 'FeatureCollection',
                    features: allFeatures
                });
                return;
            }

            source.updateData({
                add: added,
                update: updated,
                remove: removed
            });
        }

        /**
         * Single click handler for all WebGL bus markers and labels.
         */
        _setupClickHandler() {
            const self = this;
            const layers = [
                this._layerId,
                this._labelLayerId,
                this._selectedLayerId,
                this._selectedLabelLayerId
            ].filter(id => self._map.getLayer(id));

            for (const layerId of layers) {
                this._map.on('mousemove', layerId, function() {
                    if (self._map && self._map.getCanvas()) {
                        self._map.getCanvas().style.cursor = 'pointer';
                    }
                });
                this._map.on('mouseleave', layerId, function() {
                    if (self._map && self._map.getCanvas()) {
                        self._map.getCanvas().style.cursor = '';
                    }
                });
                this._map.on('click', layerId, function(e) {
                    if (!e.features || e.features.length === 0) return;
                    // MapLibre binds its click pipeline to the canvas container, so
                    // clicks on DOM markers (stop icons, distance markers) bubble
                    // in here too. Without this guard, clicking a stop marker that
                    // overlaps a bus would also select the bus underneath it.
                    // Those elements handle their own clicks, so skip them.
                    const target = e.originalEvent && e.originalEvent.target;
                    if (target && typeof target.closest === 'function' && target.closest('.maplibregl-marker')) {
                        return;
                    }
                    // In WebGL renderer mode stops are GL features too. Mirror DOM
                    // z-order hit-testing: when "Show Stops Above Buses" is on,
                    // stops are above buses, so a stop under the cursor wins over
                    // the bus click (the stop handler in stop-layer.js handles it).
                    if (typeof window.stopLayerManager !== 'undefined' && window.stopLayerManager.isActive()) {
                        const stopLayers = ['stop-markers-layer', 'stop-markers-labels', 'stop-markers-selected', 'stop-markers-selected-labels'].filter(id => self._map.getLayer(id));
                        if (stopLayers.length && self._map.queryRenderedFeatures(e.point, { layers: stopLayers }).length) {
                            const stopsAbove = !!(settings && settings['toggle-stops-above-buses']);
                            if (stopsAbove) return;
                        }
                    }
                    const busName = e.features[0].properties.busName;
                    const proxy = self._proxies[busName];
                    if (proxy) {
                        proxy._fireClick();
                    }
                });
            }
        }

        /**
         * Check if the marker system is initialized.
         */
        isInitialized() {
            return this._initialized;
        }
    }

    // =========================================================================
    // Utility functions
    // =========================================================================

    function _parseLatLng(latlng) {
        if (!latlng) return { lat: 0, lng: 0 };
        if (Array.isArray(latlng)) return { lat: Number(latlng[0]), lng: Number(latlng[1]) };
        if (typeof latlng === 'object') {
            const lat = latlng.lat !== undefined ? latlng.lat :
                        (latlng.latitude !== undefined ? latlng.latitude : latlng[0]);
            const lng = latlng.lng !== undefined ? latlng.lng :
                        (latlng.longitude !== undefined ? latlng.longitude :
                        (latlng.long !== undefined ? latlng.long : latlng[1]));
            return { lat: Number(lat), lng: Number(lng) };
        }
        return { lat: 0, lng: 0 };
    }

    // =========================================================================
    // Export as global singleton
    // =========================================================================

    window.busLayerManager = new BusLayerManager();

})();
