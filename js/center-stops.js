// js/center-stops.js - shows the names of the 3 visible, active bus stops
// closest to the center of the current map camera in the .center-stops-btns
// wrapper (a flex column above the left .buildings-btn).
//
// The "visible" pool is the set of stop markers currently shown on the map.
// Both renderer modes keep that state in marker._addedToMap (set true by
// addTo(), false by remove() — see js/poly.js L.marker monkeypatch), so route
// selector filtering, hide-OOS stops, force-show and service changes all feed
// in automatically without duplicating their logic here.

var _csProbe = null;
var _csBadgeProbe = null;
var _csBuffer = 1;

function _getCSProbe() {
    if (_csProbe) return _csProbe;
    _csProbe = document.createElement('span');
    _csProbe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;left:-9999px;top:0;pointer-events:none;';
    document.body.appendChild(_csProbe);
    return _csProbe;
}

function _getCSBadgeProbe() {
    if (_csBadgeProbe) return _csBadgeProbe;
    _csBadgeProbe = document.createElement('span');
    _csBadgeProbe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;left:-9999px;top:0;pointer-events:none;';
    document.body.appendChild(_csBadgeProbe);
    return _csBadgeProbe;
}

function _syncProbeFont(el) {
    var s = getComputedStyle(el);
    var p = _getCSProbe();
    p.style.fontFamily = s.fontFamily;
    p.style.fontSize = s.fontSize;
    p.style.fontWeight = s.fontWeight;
    p.style.fontStyle = s.fontStyle;
    p.style.letterSpacing = s.letterSpacing;
}

function _measureCS(s) {
    var p = _getCSProbe();
    p.textContent = s;
    return p.getBoundingClientRect().width;
}

// Widest width of the greedy-wrapped soft line(s) of `name` that fit within
// `maxPx`, as a plain text width (no badge).
function _widestWrappedLine(name, maxPx) {
    var words = name.split(/\s+/);
    if (!words.length) return 0;
    var line = words[0];
    var lineW = _measureCS(line);
    var widest = lineW;
    for (var i = 1; i < words.length; i++) {
        var cand = line + ' ' + words[i];
        var candW = _measureCS(cand);
        if (candW <= maxPx) {
            line = cand;
            lineW = candW;
        } else {
            if (lineW > widest) widest = lineW;
            line = words[i];
            lineW = _measureCS(line);
        }
    }
    if (lineW > widest) widest = lineW;
    return widest;
}

// Widths of each greedy-wrapped soft line (plain text) of `name` that fits
// `maxPx`.
function _csWrapLineWidths(name, maxPx) {
    var words = name.split(/\s+/);
    if (!words.length) return [0];
    var widths = [];
    var line = words[0];
    var lineW = _measureCS(line);
    for (var i = 1; i < words.length; i++) {
        var cand = line + ' ' + words[i];
        var candW = _measureCS(cand);
        if (candW <= maxPx) {
            line = cand;
            lineW = candW;
        } else {
            widths.push(lineW);
            line = words[i];
            lineW = _measureCS(line);
        }
    }
    widths.push(lineW);
    return widths;
}

// If a stop's displayed name ends with "North"/"South" (short names) or with
// "(NB)"/"(SB)" (main names), split off a small direction badge. Returns
// {base, tag} or null.
function _csParseBadge(name) {
    var dir = /^(.*?)\s+(North|South)$/i.exec(name);
    if (dir) {
        var tag = dir[2].charAt(0).toUpperCase() + dir[2].slice(1).toLowerCase();
        return { base: dir[1].trim(), tag: tag };
    }
    var nsb = /^(.*?)\s*\((NB|SB)\)$/i.exec(name);
    if (nsb) {
        return { base: nsb[1].replace(/\s+$/, '').trim(), tag: nsb[2].toUpperCase() };
    }
    return null;
}

// Measured rendered width (border-box) of a direction badge for the given tag,
// using the same sizing as the .cs-badge CSS rule.
var _csCachedRootFont;
var _csHostStylesElComputed;
var _csLayoutCache = new Map();

function _csRootFont() {
    if (typeof _csCachedRootFont === 'undefined') {
        _csCachedRootFont = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    }
    return _csCachedRootFont;
}

function _csHostStyles() {
    if (!_csHostStylesElComputed) {
        var el = document.querySelector('.center-stops-btns-item');
        _csHostStylesElComputed = el ? getComputedStyle(el) : null;
    }
    return _csHostStylesElComputed;
}

function _csMeasureBadge(tag) {
    var cs = _csHostStyles() || {};
    var rootFont = _csRootFont();
    var baseFont = parseFloat(cs.fontSize) || 17.6;
    var p = _getCSBadgeProbe();
    p.style.fontFamily = cs.fontFamily || '';
    p.style.fontSize = (baseFont * 0.72) + 'px';
    p.style.fontWeight = '500';
    p.style.letterSpacing = '0.02em';
    p.textContent = tag;
    return p.getBoundingClientRect().width + (0.4 * rootFont * 2); // 0.4rem padding each side
}

// Full row layout for a chip at a given wrap limit: the badge split plus the
// needed content width. Memoized by (name, limit) so re-ranking while dragging
// only measures each name once.
function _csLayout(name, limit) {
    var key = name + '\u0000' + limit.toFixed(2);
    var hit = _csLayoutCache.get(key);
    if (hit) return hit;
    var badge = _csParseBadge(name);
    var need;
    if (badge) {
        var badgeW = _csMeasureBadge(badge.tag);
        var gap = 0.3 * _csRootFont(); // .cs-badge margin-left
        var widths = _csWrapLineWidths(badge.base || 'x', limit - badgeW - gap);
        var last = widths[widths.length - 1];
        var maxLine = Math.max.apply(null, widths);
        need = Math.max(maxLine, last + gap + badgeW);
    } else {
        need = _widestWrappedLine(name, limit);
    }
    need = Math.min(need, limit);
    var result = { name: name, badge: badge, need: need };
    _csLayoutCache.set(key, result);
    return result;
}

function _csRender(el, layout, isClosest) {
    var $item = $(el);
    $item.empty();
    if (isClosest) {
        $('<div class="cs-closest">CLOSEST</div>').appendTo($item);
    }
    if (layout.badge) {
        if (layout.badge.base) {
            $('<span class="cs-base">').text(layout.badge.base).appendTo($item);
        } else {
            $('<span class="cs-dash">&ndash;</span>').appendTo($item);
        }
        $('<span class="cs-badge">').text(layout.badge.tag).appendTo($item);
    } else {
        $('<span class="cs-base">').text(layout.name).appendTo($item);
    }
}

// Width of the CLOSEST badge content (measured with the name font, an upper
// bound since the badge renders at a smaller size) plus its horizontal padding.
function _csMeasureClosestBadge() {
    return _measureCS('CLOSEST') + (2 * 0.6 * _csRootFont());
}

var _csItems = null;
var _csMetrics = null;
var _csLastCenter = null;
var _csLastTopKey = null;
var _csMoveRaf = null;

function _csItemsList() {
    if (!_csItems) _csItems = $('.center-stops-btns-item');
    return _csItems;
}

// Widths/padding are identical across the three chips and only change when the
// viewport/layout does (resize, theme toggle), so they're measured once and
// reused for the cheap per-drag updates.
function _csRefreshMetrics() {
    var first = document.querySelector('.center-stops-btns-item');
    if (!first) { _csMetrics = null; return; }
    var maxPx = parseFloat(getComputedStyle(first).maxWidth) || 200;
    var padH = parseFloat(getComputedStyle(first).paddingLeft) + parseFloat(getComputedStyle(first).paddingRight);
    _csMetrics = { maxPx: maxPx, padH: padH, limit: maxPx - padH };
    _syncProbeFont(first);
}

function _csTopCandidates(centerLat, centerLng) {
    var candidates = [];
    for (var stopId in busStopMarkers) {
        var marker = busStopMarkers[stopId];
        if (!marker || !marker._addedToMap) continue;
        var stop = stopsData[stopId];
        if (!stop || typeof stop.name !== 'string' || !stop.name) continue;
        var lat = Number(stop.latitude);
        var lng = Number(stop.longitude);
        if (!isFinite(lat) || !isFinite(lng)) continue;
        var useMain = typeof settings !== 'undefined' && settings['toggle-center-stops-main-name'] === true;
        var displayName = useMain ? (stop.name || stop.shortName) : (stop.shortName || stop.name);
        candidates.push({
            stopId: Number(stopId),
            name: displayName,
            distance: haversine(centerLat, centerLng, lat, lng)
        });
    }
    candidates.sort(function(a, b) { return a.distance - b.distance; });
    return candidates.slice(0, 3);
}

function _csRenderChips(top) {
    if (!_csMetrics) _csRefreshMetrics();
    var m = _csMetrics;
    var $items = _csItemsList();
    $items.hide();
    $items.each(function(index) {
        var stop = top[index];
        var $item = $(this);
        var el = $item[0];
        if (!stop) { $item.hide(); return; }
        var layout = _csLayout(stop.name, m.limit);
        var isClosest = typeof closestStopId !== 'undefined' && closestStopId != null && stop.stopId === Number(closestStopId);
        // Only rebuild chip DOM when it actually changes stop (or its closest
        // state); re-ranking an already-rendered stop is just a width refresh.
        if (el._csStopId !== stop.stopId || el._csClosest !== isClosest) {
            el._csStopId = stop.stopId;
            el._csClosest = isClosest;
            _csRender(el, layout, isClosest);
        }
        var need = layout.need;
        if (isClosest) {
            var closestW = _csMeasureClosestBadge();
            if (closestW > need) need = closestW;
        }
        el.style.width = Math.min(need + _csBuffer + m.padH, m.maxPx) + 'px';
        $item.show().off('click').on('click', function() {
            clearPanoutFeedback();
            flyToStop(stop.stopId);
        });
    });
}

function updateCenterStops() {
    fitCenterStopsWidth();
    _csRefreshMetrics();
    var $items = _csItemsList();
    if (!$items.length || typeof map === 'undefined' || !map || typeof stopsData === 'undefined' || !stopsData) {
        return;
    }
    var center = map.getCenter();
    if (!center) return;
    _csRenderChips(_csTopCandidates(center.lat, center.lng));
    _csLastCenter = { lat: center.lat, lng: center.lng };
    _csLastTopKey = null;
}

window.updateCenterStops = updateCenterStops;

// Throttled live updates during pan/drag: at most one recompute per animation
// frame (requestAnimationFrame coalesces the many `move` events), skipping
// entirely when the center has barely moved or the top-3 set is unchanged.
function _csScheduleMoveUpdate() {
    if (_csMoveRaf) return;
    _csMoveRaf = requestAnimationFrame(function() {
        _csMoveRaf = null;
        _csUpdateOnMove();
    });
}

function _csUpdateOnMove() {
    if (typeof map === 'undefined' || !map || typeof stopsData === 'undefined' || !stopsData) return;
    if ($('.center-stops-btns').is(':hidden')) return; // popup open; moveend fixes it
    if (!_csMetrics) _csRefreshMetrics();
    var center = map.getCenter();
    if (!center) return;
    if (_csLastCenter &&
        Math.abs(center.lat - _csLastCenter.lat) < 1e-5 &&
        Math.abs(center.lng - _csLastCenter.lng) < 1e-5) {
        return;
    }
    _csLastCenter = { lat: center.lat, lng: center.lng };
    var top = _csTopCandidates(center.lat, center.lng);
    var key = top.map(function(t) { return t.stopId; }).join(',');
    if (key === _csLastTopKey) return;
    _csLastTopKey = key;
    _csRenderChips(top);
}

// Constrain each stop chip to 2x the width of the square left buttons
// (buildings/satellite/info-panels), so long stop names wrap instead of
// stretching the column. Measured dynamically since the buttons are sized by
// their content + rem padding.
function fitCenterStopsWidth() {
    var btn = document.querySelector('.buildings-btn');
    if (!btn) return;
    var w = btn.getBoundingClientRect().width;
    if (!isFinite(w) || w <= 0) return;
    $('.center-stops-btns').css('--center-stops-max-width', (w * 2) + 'px');
}

window.fitCenterStopsWidth = fitCenterStopsWidth;

// Lightweight re-render used when the user's closest stop changes (location
// shared or updated) without the map moving: re-ranks from the last known
// center so the CLOSEST badge can appear/disappear on already-shown chips.
window.refreshCenterStopsClosest = function() {
    if (typeof map === 'undefined' || !map || !stopsData || !_csLastCenter) return;
    _csRenderChips(_csTopCandidates(_csLastCenter.lat, _csLastCenter.lng));
};

document.addEventListener('rubus-map-created', function() {
    if (typeof map === 'undefined' || !map) return;
    map.on('moveend', updateCenterStops);
    map.on('move', _csScheduleMoveUpdate);
    updateCenterStops();
});

document.addEventListener('rubus-bus-data-loaded', function() {
    updateCenterStops();
});

$(function() {
    fitCenterStopsWidth();
    _csRefreshMetrics();
    window.addEventListener('resize', updateCenterStops);
});

// The whole widget is hidden while a stop/bus/building popup is open, and
// restored by hideInfoBoxes() (drag, panout, close). Used by popup show sites.
window.hideCenterStops = function() {
    $('.center-stops-btns').hide();
};
window.showCenterStops = function() {
    $('.center-stops-btns').show();
};
