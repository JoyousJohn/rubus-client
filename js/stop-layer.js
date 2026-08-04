// js/stop-layer.js - WebGL-mode stop markers (MapLibre symbol layers).
//
// In "maplibre" renderer mode buses are drawn on the GL canvas, so DOM stop
// markers (which always paint above the canvas) can never be ordered below
// buses. This module renders stops as GL layers instead, so the "Show Stops
// Above Buses" toggle can genuinely reorder stop vs bus layers.
//
// The DOM stop markers still exist as lightweight registry objects (L.marker
// in poly.js) - all visibility/opacity/selection logic keeps working
// unchanged. For stops in WebGL mode, addTo()/remove() are intercepted in
// poly.js to flip a registry flag (_addedToMap) and trigger a GL resync here
// instead of touching the DOM. ETA labels and the selected-stop state are
// mirrored here via setStopEtaLabel()/clearAllStopEtas() and setSelected().

(function() {
    const SOURCE_ID = 'stop-markers-source';
    const LAYER_ID = 'stop-markers-layer';
    const LABEL_LAYER_ID = 'stop-markers-labels';
    const SELECTED_LAYER_ID = 'stop-markers-selected';
    const SELECTED_LABEL_LAYER_ID = 'stop-markers-selected-labels';

    // Sprite names -> image URLs. Registered once per style with map.addImage.
    const STOP_SPRITES = {
        'stop-marker': 'img/stop_marker.png',
        'stop-marker-selected': 'img/stop_marker_selected.png',
        'stop-marker-rider': 'img/rider/rider-stop-marker-white.png'
    };

    // Display size (CSS px) for each sprite, matching the DOM markers (18px
    // rubus icons, 15px rider icons).
    const STOP_SPRITE_SIZES = {
        'stop-marker': 18,
        'stop-marker-selected': 18,
        'stop-marker-rider': 15
    };

    // Sprites are pre-scaled to 2x and registered with this pixelRatio so
    // high-DPI screens get crisp edges. Registering the raw 512px PNG with a
    // tiny icon-size makes the GPU sample every ~28th texel, which aliases
    // badly around the circle's border.
    const STOP_SPRITE_DPR = 2;

    // ETA labels are rendered as white pills (white background, black text,
    // subtle shadow) with the text drawn on top. A per-text pill sprite is
    // generated on a canvas so the pill hugs the text width like the DOM
    // element. The end radius is always half the pill height, so the left/right
    // ends are perfect semicircles.
    const ETA_FONT_SIZE = 10;        // tooltip text size
    const ETA_PILL_HEIGHT = 14;      // 10px text + 2px padding per side
    const ETA_PILL_PADDING_X = 4;    // horizontal padding per side (DOM: 4px)
    // The pill text is measured and drawn with the SAME canvas font, so
    // measureText is exact and no extra width buffer is needed.
    const ETA_TEXT_FONT_STACK = '"Open Sans", sans-serif';
    const ETA_TEXT_WIDTH_BUFFER = 1.0;
    const ETA_SPRITE_MAX = 300;      // LRU cap on cached pill textures

    const manager = {
        _map: null,
        _initialized: false,
        _rafScheduled: false,
        _pendingRefresh: false,
        _cached: {},          // stopId -> serialized feature
        _etaText: {},         // stopId -> current ETA string
        _selectedStop: null,  // stopId currently selected (popup open)
        _lastClickEvent: null, // dedup handle for icon+label overlap clicks
        _etaSpriteCounter: 0, // unique id counter for pill sprites
        _etaSprites: {},      // eta text -> sprite name
        _etaSpriteOrder: [],  // sprite names, LRU order (oldest first)
        _etaSpriteUsage: {},  // sprite name -> number of features using it

        isActive() {
            return !!(typeof settings !== 'undefined' && settings && settings['bus-marker-renderer'] === 'maplibre');
        },

        init(map) {
            this._map = map;
            if (!map) return;
            // style.load also re-fires on style replacement, which is when
            // sources/layers/sprites get reset - re-ensure everything then.
            map.on('style.load', () => this._ensureLayers());
            this._ensureLayers();
            // Stop clicks can land on icon or label glyphs; bind all four
            // layers so label hits open the stop popup like the DOM corner
            // label does.
            map.on('click', LAYER_ID, (e) => this._onStopClick(e));
            map.on('click', LABEL_LAYER_ID, (e) => this._onStopClick(e));
            map.on('click', SELECTED_LAYER_ID, (e) => this._onStopClick(e));
            map.on('click', SELECTED_LABEL_LAYER_ID, (e) => this._onStopClick(e));
        },

        // Call after the "bus-marker-renderer" setting changes: attach/detach
        // the DOM stop markers so both renderer modes show the right
        // implementation.
        applyRendererMode() {
            if (!this._map || typeof busStopMarkers === 'undefined') return;
            if (this.isActive()) {
                // Entering WebGL mode: detach any DOM stop markers (they would
                // otherwise always paint above the GL canvas). Their
                // _addedToMap flags stay set, so the GL source keeps showing
                // them.
                for (const stopId in busStopMarkers) {
                    const m = busStopMarkers[stopId];
                    if (m && m._map && typeof m._originalRemove === 'function') {
                        m._originalRemove();
                    }
                }
                this.refresh();
            } else {
                // Leaving WebGL mode: re-attach the DOM markers that are
                // considered visible.
                for (const stopId in busStopMarkers) {
                    const m = busStopMarkers[stopId];
                    if (m && m._addedToMap && !m._map && typeof m._addToDom === 'function') {
                        m._addToDom(map);
                    }
                }
            }
        },

        _onStopClick(e) {
            if (!e.features || e.features.length === 0) return;
            // A single click can hit multiple stop layers (icon + overlapping
            // ETA label glyph), firing this handler several times - process
            // each physical click only once.
            const origEvent = e.originalEvent || e;
            if (this._lastClickEvent === origEvent) return;
            this._lastClickEvent = origEvent;
            // Mirror DOM z-order hit-testing: when "Show Stops Above Buses" is
            // off, buses are above stops, so a bus glyph under the cursor wins
            // over the stop click.
            if (typeof settings !== 'undefined' && !settings['toggle-stops-above-buses'] && this._map) {
                const busLayers = ['bus-markers-glow', 'bus-markers-layer', 'bus-markers-labels'].filter(id => this._map.getLayer(id));
                if (busLayers.length && this._map.queryRenderedFeatures(e.point, { layers: busLayers }).length) {
                    return;
                }
            }
            // The feature property is a string; popStopInfo compares stop ids
            // strictly against numbers, so coerce back.
            const stopId = Number(e.features[0].properties.stopId);
            // Don't process stop clicks when in parking permit mode.
            if ($('body').hasClass('parking-permit-mode')) {
                return;
            }
            sourceStopId = null;
            sourceBusName = null;
            if (typeof clearPanoutFeedback === 'function') { clearPanoutFeedback(); }
            popStopInfo(stopId);
            if (!shownRoute) {
                showAllBuses();
                showAllPolylines();
            }
        },

        _ensureLayers() {
            if (!this._map) return;
            const map = this._map;
            try {
                if (typeof map.getStyle === 'function' && !map.getStyle()) return;
                if (!map.getSource(SOURCE_ID)) {
                    map.addSource(SOURCE_ID, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
                }
                // Create the non-selected stop layers BELOW the bus layers so
                // the default order (buses above stops) holds before
                // updateStopsLayerOrder runs.
                const beforeId = map.getLayer('bus-markers-glow') ? 'bus-markers-glow'
                    : (map.getLayer('bus-markers-layer') ? 'bus-markers-layer' : undefined);
                if (!map.getLayer(LAYER_ID)) {
                    map.addLayer({
                        id: LAYER_ID,
                        type: 'symbol',
                        source: SOURCE_ID,
                        filter: ['!=', ['get', 'selected'], true],
                        layout: {
                            'icon-image': ['case', ['get', 'rider'], 'stop-marker-rider', 'stop-marker'],
                            'icon-size': 1,
                            'icon-allow-overlap': true,
                            'icon-ignore-placement': true
                        },
                        paint: {
                            'icon-opacity': ['get', 'opacity']
                        }
                    }, beforeId);
                }
                if (!map.getLayer(LABEL_LAYER_ID)) {
                    map.addLayer({
                        id: LABEL_LAYER_ID,
                        type: 'symbol',
                        source: SOURCE_ID,
                        filter: ['all', ['!=', ['get', 'selected'], true], ['!=', ['get', 'eta'], '']],
                        layout: {
                            // The whole label (white pill + text) is baked into
                            // a per-text sprite (see _buildEtaSprite). Rendering
                            // a GL text-field on top too draws the same string
                            // twice at slightly different metrics/positions,
                            // making the text look doubled and unsharp.
                            'icon-image': ['get', 'etaSprite'],
                            'icon-size': 1,
                            // Pin the pill's left edge beside the stop marker
                            // (DOM corner-label parity: top -0.8rem, left 1.7rem
                            // on the 18px wrapper -> (2, -23) from the anchor).
                            // 'left' anchors the sprite's left edge at icon-offset
                            // so the pill grows rightward instead of covering
                            // the marker.
                            'icon-anchor': 'left',
                            'icon-offset': [2, -15.5],
                            'icon-allow-overlap': true,
                            'icon-ignore-placement': true
                        },
                        paint: {
                            'icon-opacity': ['get', 'opacity']
                        }
                    }, beforeId);
                }
                // The selected stop always paints on top (DOM parity: z-index
                // 2000 above bus markers). updateStopsLayerOrder leaves these
                // on top in both toggle states.
                if (!map.getLayer(SELECTED_LAYER_ID)) {
                    map.addLayer({
                        id: SELECTED_LAYER_ID,
                        type: 'symbol',
                        source: SOURCE_ID,
                        filter: ['==', ['get', 'selected'], true],
                        layout: {
                            'icon-image': 'stop-marker-selected',
                            'icon-size': 1,
                            'icon-allow-overlap': true,
                            'icon-ignore-placement': true
                        },
                        paint: {
                            'icon-opacity': ['get', 'opacity']
                        }
                    });
                }
                if (!map.getLayer(SELECTED_LABEL_LAYER_ID)) {
                    map.addLayer({
                        id: SELECTED_LABEL_LAYER_ID,
                        type: 'symbol',
                        source: SOURCE_ID,
                        filter: ['all', ['==', ['get', 'selected'], true], ['!=', ['get', 'eta'], '']],
                        layout: {
                            // Whole label (pill + text) is baked into the
                            // sprite; no GL text-field (see LABEL_LAYER_ID).
                            'icon-image': ['get', 'etaSprite'],
                            'icon-size': 1,
                            // Same side placement as LABEL_LAYER_ID.
                            'icon-anchor': 'left',
                            'icon-offset': [2, -15.5],
                            'icon-allow-overlap': true,
                            'icon-ignore-placement': true
                        },
                        paint: {
                            'icon-opacity': ['get', 'opacity']
                        }
                    });
                }
                this._ensureSprites();
                this._initialized = true;
                if (this._pendingRefresh) {
                    this._pendingRefresh = false;
                    this.refresh();
                }
                if (typeof window.updateStopsLayerOrder === 'function') {
                    window.updateStopsLayerOrder();
                }
            } catch (e) {
                console.error('[StopLayerManager] error setting up layers:', e);
            }
        },

        _ensureSprites() {
            const map = this._map;
            for (const name in STOP_SPRITES) {
                if (map.hasImage(name)) continue;
                this._loadSprite(name);
            }
        },

        // Pre-scale the source PNG down to 2x its display size with the
        // canvas' high-quality resampler, then register it with pixelRatio 2.
        // This replaces the GPU's extreme downscale (512px -> 18px) that
        // aliases the marker border.
        _loadSprite(name) {
            const map = this._map;
            // Style reloads reset all images; reuse the already-scaled pixels
            // instead of re-downloading and re-scaling.
            if (this._spriteData && this._spriteData[name]) {
                try {
                    map.addImage(name, this._spriteData[name], { pixelRatio: STOP_SPRITE_DPR });
                    this.refresh();
                } catch (err) {
                    console.error('[StopLayerManager] addImage failed for', name, err);
                }
                return;
            }
            const img = new Image();
            img.onload = () => {
                try {
                    if (map.hasImage(name)) return;
                    const display = STOP_SPRITE_SIZES[name];
                    const targetW = Math.max(1, Math.round(display * STOP_SPRITE_DPR));
                    const targetH = Math.max(1, Math.round(img.naturalHeight * targetW / img.naturalWidth));
                    const canvas = document.createElement('canvas');
                    canvas.width = targetW;
                    canvas.height = targetH;
                    const ctx = canvas.getContext('2d');
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';
                    ctx.drawImage(img, 0, 0, targetW, targetH);
                    const data = ctx.getImageData(0, 0, targetW, targetH);
                    this._spriteData = this._spriteData || {};
                    this._spriteData[name] = data;
                    map.addImage(name, data, { pixelRatio: STOP_SPRITE_DPR });
                    this.refresh();
                } catch (err) {
                    console.error('[StopLayerManager] addImage failed for', name, err);
                }
            };
            img.onerror = () => {
                console.error('[StopLayerManager] failed to load stop sprite', name, STOP_SPRITES[name]);
            };
            img.src = STOP_SPRITES[name];
        },

        // Returns the pill sprite name for an ETA string ('' when empty),
        // generating and caching a per-text sprite on first use. Sprites are
        // re-built if the image is missing (e.g. after a style reload resets
        // all images) or if the size constants changed.
        _getEtaSprite(text) {
            if (!text) return '';
            let name = this._etaSprites[text];
            if (name && this._map && !this._map.hasImage(name)) {
                name = null;
            }
            if (!name) {
                name = 'stop-eta-' + (++this._etaSpriteCounter);
                this._etaSprites[text] = name;
                this._buildEtaSprite(name, text);
            }
            const idx = this._etaSpriteOrder.indexOf(name);
            if (idx >= 0) this._etaSpriteOrder.splice(idx, 1);
            this._etaSpriteOrder.push(name);
            this._evictEtaSprites();
            return name;
        },

        // Renders a white rounded pill with the ETA text at 2x scale and
        // registers it (pixelRatio 2), mirroring the DOM corner-label.
        _buildEtaSprite(name, text) {
            const map = this._map;
            const s = STOP_SPRITE_DPR;
            const font = (ETA_FONT_SIZE * s) + 'px ' + ETA_TEXT_FONT_STACK;
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            ctx.font = font;
            // Buffer the measurement: the GL style font is typically wider
            // than canvas sans-serif, so an un-buffered pill lets the text
            // overflow its rounded ends.
            const textW = Math.ceil(ctx.measureText(text).width * ETA_TEXT_WIDTH_BUFFER);
            const pillW = Math.max(2, Math.round(textW + ETA_PILL_PADDING_X * 2 * s));
            const pillH = Math.round(ETA_PILL_HEIGHT * s);
            // Radius is exactly half the height, so the left/right ends are
            // perfect semicircles (no straight vertical segments).
            const r = Math.round(pillH / 2);
            // Canvas is 1px taller than the pill so the drop shadow (drawn
            // below the pill body) is visible without visually extending the
            // pill, matching the DOM box-shadow (0 1px 2px). The pill body is
            // vertically centered on the canvas so the icon anchor (canvas
            // center) coincides with the pill center.
            const shadowY = Math.round(1 * s);
            const pillTop = Math.round(shadowY / 2);
            canvas.width = pillW;
            canvas.height = pillH + shadowY;
            ctx.fillStyle = 'rgba(0,0,0,0.2)';
            this._roundRectPath(ctx, 0, pillTop + pillH, pillW, pillH, r).fill();
            ctx.fillStyle = '#ffffff';
            this._roundRectPath(ctx, 0, pillTop, pillW, pillH, r).fill();
            ctx.fillStyle = '#111111';
            ctx.font = font;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, pillW / 2, pillTop + pillH / 2);
            try {
                map.addImage(name, ctx.getImageData(0, 0, pillW, canvas.height), { pixelRatio: s });
            } catch (err) {
                console.error('[StopLayerManager] addImage failed for ETA pill', text, err);
            }
        },

        _roundRectPath(ctx, x, y, w, h, r) {
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.lineTo(x + w - r, y);
            ctx.arcTo(x + w, y, x + w, y + r, r);
            ctx.lineTo(x + w, y + h - r);
            ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
            ctx.lineTo(x + r, y + h);
            ctx.arcTo(x, y + h, x, y + h - r, r);
            ctx.lineTo(x, y + r);
            ctx.arcTo(x, y, x + r, y, r);
            ctx.closePath();
            return ctx;
        },

        // Drops least-recently-used pill textures (bounded memory), skipping
        // sprites still referenced by rendered features.
        _evictEtaSprites() {
            if (this._etaSpriteOrder.length <= ETA_SPRITE_MAX) return;
            const evicted = [];
            for (const name of this._etaSpriteOrder) {
                if (this._etaSpriteOrder.length - evicted.length <= ETA_SPRITE_MAX) break;
                if (this._etaSpriteUsage[name]) continue;
                evicted.push(name);
            }
            for (const name of evicted) {
                const idx = this._etaSpriteOrder.indexOf(name);
                if (idx >= 0) this._etaSpriteOrder.splice(idx, 1);
                for (const text in this._etaSprites) {
                    if (this._etaSprites[text] === name) {
                        delete this._etaSprites[text];
                        break;
                    }
                }
                try { this._map.removeImage(name); } catch (e) {}
            }
        },

        _buildFeature(stopId) {
            const m = typeof busStopMarkers !== 'undefined' && busStopMarkers[stopId];
            if (!m || !m._addedToMap) return null;
            const ll = typeof m.getLatLng === 'function' ? m.getLatLng() : null;
            if (!ll || isNaN(ll.lat) || isNaN(ll.lng)) return null;
            let opacity = 1;
            const el = typeof m.getElement === 'function' ? m.getElement() : null;
            if (el) {
                const o = parseFloat(el.style.opacity);
                if (Number.isFinite(o)) opacity = o;
            }
            return {
                type: 'Feature',
                id: 'stop-' + stopId,
                geometry: { type: 'Point', coordinates: [ll.lng, ll.lat] },
                properties: {
                    stopId: String(stopId),
                    opacity: opacity,
                    eta: this._etaText[stopId] || '',
                    etaSprite: this._getEtaSprite(this._etaText[stopId] || ''),
                    selected: this._selectedStop === String(stopId),
                    rider: typeof appStyle !== 'undefined' && appStyle === 'rider'
                }
            };
        },

        _rebuild() {
            if (!this.isActive() || !this._initialized || !this._map) return;
            if (typeof busStopMarkers === 'undefined') return;
            const src = this._map.getSource(SOURCE_ID);
            if (!src) return;
            const features = [];
            this._cached = {};
            this._etaSpriteUsage = {};
            for (const stopId in busStopMarkers) {
                const f = this._buildFeature(stopId);
                if (f) {
                    features.push(f);
                    this._cached[String(stopId)] = f;
                    const sp = f.properties.etaSprite;
                    if (sp) this._etaSpriteUsage[sp] = (this._etaSpriteUsage[sp] || 0) + 1;
                }
            }
            this._evictEtaSprites();
            try {
                src.setData({ type: 'FeatureCollection', features: features });
            } catch (e) {}
        },

        // Coalesced full resync (add/remove/opacity/selected/style changes are
        // event-driven, not per-frame, so a single setData per frame is fine).
        refresh() {
            if (!this.isActive()) return;
            if (!this._initialized) {
                this._pendingRefresh = true;
                return;
            }
            if (this._rafScheduled) return;
            this._rafScheduled = true;
            requestAnimationFrame(() => {
                this._rafScheduled = false;
                this._rebuild();
            });
        },

        // Incremental single-feature update for ETA text changes (these fire
        // once per second from the countdown timer, so avoid full rebuilds).
        _pushStop(stopId) {
            if (!this.isActive() || !this._initialized || !this._map) return;
            const key = String(stopId);
            if (!this._cached[key]) {
                this.refresh();
                return;
            }
            const f = this._buildFeature(stopId);
            if (!f) {
                this.refresh();
                return;
            }
            this._cached[key] = f;
            const src = this._map.getSource(SOURCE_ID);
            if (!src || typeof src.updateData !== 'function') return;
            try {
                src.updateData({
                    update: [{
                        id: f.id,
                        newGeometry: f.geometry,
                        removeAllProperties: true,
                        addOrUpdateProperties: Object.entries(f.properties).map(([key, value]) => ({ key, value }))
                    }]
                });
            } catch (e) {}
        },

        setSelected(stopId) {
            const key = (stopId === null || stopId === undefined) ? null : String(stopId);
            if (this._selectedStop === key) return;
            this._selectedStop = key;
            this.refresh();
        },

        clearEtas() {
            this._etaText = {};
            this.refresh();
        }
    };

    // ETA label write helper: updates the DOM corner-label (DOM renderer
    // mode) and the GL label property (WebGL renderer mode) in one place.
    // `show` undefined = text-only update, true = text + show, false = clear.
    window.setStopEtaLabel = function(stopId, text, show) {
        const $el = $(`[stop-eta="${stopId}"]`);
        if (show === undefined) {
            $el.text(text);
        } else if (show) {
            $el.text(text).show();
        } else {
            $el.text('').hide();
        }
        manager._etaText[String(stopId)] = (show === false) ? '' : String(text || '');
        if (manager.isActive()) {
            manager._pushStop(stopId);
        }
    };

    // Clears every ETA label (panout/fit/campus flows that hide them all).
    window.clearAllStopEtas = function() {
        $('[stop-eta]').text('').hide();
        if (manager.isActive()) {
            manager.clearEtas();
        }
    };

    window.stopLayerManager = manager;
})();
