const COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#34495e', '#16a085', '#c0392b', '#2980b9', '#8e44ad', '#d35400', '#27ae60', '#2c3e50'];

let busStatsData = null;
let stopStatsData = null;
let userStatsData = null;
let statsLoading = false;

let stopShortNameMap = null;

function getStopShortNameMap() {
    if (stopShortNameMap) return stopShortNameMap;
    stopShortNameMap = {};

    if (typeof allStopsData !== 'undefined' && allStopsData) {
        for (const campus in allStopsData) {
            const campusStops = allStopsData[campus];
            for (const id in campusStops) {
                const s = campusStops[id];
                if (s && s.name) {
                    stopShortNameMap[s.name] = s.shortName || s.name;
                }
            }
        }
    }

    if (typeof stopsData !== 'undefined' && stopsData) {
        for (const id in stopsData) {
            const s = stopsData[id];
            if (s && s.name) {
                stopShortNameMap[s.name] = s.shortName || s.name;
            }
        }
    }

    return stopShortNameMap;
}

function getStopShortName(name) {
    if (!name) return '';
    const cleanName = name.replace(/^sim-/, '').trim();
    const map = getStopShortNameMap();
    return map[name] || map[cleanName] || cleanName;
}

function fetchStatsJson(url) {
    return fetch(url)
        .then(res => res.ok ? res.json() : null)
        .catch(err => {
            console.error('Stats fetch error:', url, err);
            return null;
        });
}

function showStats() {
    sa_event('btn_press', { btn: 'footer_stats' });
    if (statsLoading) return;

    if ($('.stats-wrapper').is(':visible')) {
        $('.stats-wrapper').hide();
        $('.stats').removeClass('footer-selected');
        return;
    }

    $('.footer-contact-wrapper').hide();
    $('.contact').removeClass('footer-selected');
    $('.changelog-wrapper').hide();
    $('.changelog').removeClass('footer-selected');
    $('.status-wrapper').hide();
    $('.status').removeClass('footer-selected');
    $('.errors-wrapper').hide();
    $('.errors-tab').removeClass('footer-selected');
    stopStatusUpdates();

    $('.stats').addClass('footer-selected');
    $('.stats-wrapper').show();

    const $lineCount = $('.stats-js-lines');
    const $cssCount = $('.stats-css-lines');
    const $htmlCount = $('.stats-html-lines');
    $lineCount.text(typeof TOTAL_JS_LINES !== 'undefined' ? `${TOTAL_JS_LINES.toLocaleString()} lines of JS` : 'X lines of JS').show();
    $cssCount.text(typeof TOTAL_CSS_LINES !== 'undefined' ? `${TOTAL_CSS_LINES.toLocaleString()} lines of CSS` : 'X lines of CSS').show();
    $htmlCount.text(typeof TOTAL_HTML_LINES !== 'undefined' ? `${TOTAL_HTML_LINES.toLocaleString()} lines of HTML` : 'X lines of HTML').show();

    if (busStatsData) {
        renderPieChart(busStatsData, 'stats-canvas', 'stats-legend', { uppercase: true });
    } else {
        $('#stats-loading-bus').show();
    }

    if (stopStatsData) {
        renderPieChart(stopStatsData, 'stop-stats-canvas', 'stop-stats-legend', { useShortName: true });
    } else {
        $('#stats-loading-stop').show();
    }

    if (userStatsData) {
        renderPieChart(userStatsData, 'user-stats-canvas', 'user-stats-legend');
    } else {
        $('#stats-loading-user').show();
    }

    if (busStatsData && stopStatsData && userStatsData) {
        return;
    }

    statsLoading = true;
    let remaining = 3;
    function onDone() {
        remaining--;
        if (remaining <= 0) statsLoading = false;
    }

    fetchStatsJson('https://demo.rubus.live/stats/view_bus?field=route&start=today-7d').then(data => {
        busStatsData = data;
        if (data) renderPieChart(data, 'stats-canvas', 'stats-legend', { uppercase: true });
        onDone();
    }).catch(e => { console.error('Error fetching bus stats:', e); onDone(); });

    fetchStatsJson('https://demo.rubus.live/stats/view_stop?field=stop_name&start=today-7d').then(data => {
        stopStatsData = data;
        if (data) renderPieChart(data, 'stop-stats-canvas', 'stop-stats-legend', { useShortName: true });
        onDone();
    }).catch(e => { console.error('Error fetching stop stats:', e); onDone(); });

    fetchStatsJson('https://demo.rubus.live/stats/load?field=users&start=today-7d').then(data => {
        userStatsData = data;
        if (data) renderPieChart(data, 'user-stats-canvas', 'user-stats-legend');
        onDone();
    }).catch(e => { console.error('Error fetching user stats:', e); onDone(); });
}

const selectedSlices = {};

function selectSlice(canvasId, index) {
    if (selectedSlices[canvasId] === index) {
        selectedSlices[canvasId] = -1;
    } else {
        selectedSlices[canvasId] = index;
    }

    if (canvasId === 'stats-canvas' && busStatsData) {
        renderPieChart(busStatsData, 'stats-canvas', 'stats-legend', { uppercase: true });
    } else if (canvasId === 'stop-stats-canvas' && stopStatsData) {
        renderPieChart(stopStatsData, 'stop-stats-canvas', 'stop-stats-legend', { useShortName: true });
    } else if (canvasId === 'user-stats-canvas' && userStatsData) {
        renderPieChart(userStatsData, 'user-stats-canvas', 'user-stats-legend');
    }
}

function setupCanvasClickListener(canvasId, options) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || canvas.dataset.clickBound) return;
    canvas.dataset.clickBound = 'true';
    canvas.style.cursor = 'pointer';

    canvas.addEventListener('click', (event) => {
        const data = (canvasId === 'stats-canvas') ? busStatsData :
                     (canvasId === 'stop-stats-canvas') ? stopStatsData : userStatsData;
        if (!data || !data.segments || !data.segments.length) return;

        const rect = canvas.getBoundingClientRect();
        const clientX = event.clientX - rect.left;
        const clientY = event.clientY - rect.top;

        const w = canvas.clientWidth || 220;
        const h = canvas.clientHeight || w || 220;
        const cx = w / 2;
        const cy = h / 2;
        const r = Math.min(cx, cy) - 16;

        const dx = clientX - cx;
        const dy = clientY - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > r + 8) {
            selectSlice(canvasId, -1);
            return;
        }

        let angle = Math.atan2(dy, dx);
        if (angle < -Math.PI / 2) {
            angle += Math.PI * 2;
        }

        let startAngle = -Math.PI / 2;
        for (let i = 0; i < data.segments.length; i++) {
            const seg = data.segments[i];
            const slice = (seg.percentage / 100) * Math.PI * 2;
            const endAngle = startAngle + slice;

            if (angle >= startAngle && angle < endAngle) {
                selectSlice(canvasId, i);
                break;
            }
            startAngle = endAngle;
        }
    });
}

function renderPieChart(statsData, canvasId, legendId, options = {}) {
    if (!statsData || !statsData.segments || !statsData.segments.length) return;

    if (canvasId === 'stats-canvas') $('#stats-loading-bus').hide();
    else if (canvasId === 'stop-stats-canvas') $('#stats-loading-stop').hide();
    else if (canvasId === 'user-stats-canvas') $('#stats-loading-user').hide();

    setupCanvasClickListener(canvasId, options);

    const segments = statsData.segments;
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const selectedIndex = (selectedSlices[canvasId] !== undefined) ? selectedSlices[canvasId] : -1;

    const ctx = canvas.getContext('2d');
    const dpr = Math.max(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth || 220;
    const h = canvas.clientHeight || w || 220;

    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(dpr, dpr);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const cx = w / 2;
    const cy = h / 2;
    const r = Math.min(cx, cy) - 16;

    let selectedOverlayInfo = null;

    let startAngle = -Math.PI / 2;
    segments.forEach((seg, i) => {
        const slice = (seg.percentage / 100) * Math.PI * 2;
        const endAngle = startAngle + slice;
        const color = (typeof colorMappings !== 'undefined' && colorMappings[seg.label]) ? colorMappings[seg.label] : COLORS[i % COLORS.length];
        const isSelected = (i === selectedIndex);

        const midAngle = startAngle + slice / 2;
        const shiftRadius = isSelected ? 8 : 0;
        const ox = Math.cos(midAngle) * shiftRadius;
        const oy = Math.sin(midAngle) * shiftRadius;

        ctx.beginPath();
        ctx.moveTo(cx + ox, cy + oy);
        ctx.arc(cx + ox, cy + oy, r, startAngle, endAngle);
        ctx.closePath();

        ctx.fillStyle = color;
        ctx.fill();

        ctx.strokeStyle = isSelected ? '#ffffff' : color;
        ctx.lineWidth = isSelected ? 2 : 1;
        ctx.lineJoin = 'round';
        ctx.stroke();

        if (isSelected) {
            const rounded = Math.round(seg.percentage);
            let pctStr = `${rounded}%`;
            if (rounded === 0 && seg.percentage > 0) {
                pctStr = '<1%';
            }
            let labelText = seg.label || '';
            if (options.useShortName) {
                labelText = getStopShortName(labelText);
            }
            if (options.uppercase) {
                labelText = labelText.toUpperCase();
            }

            selectedOverlayInfo = {
                labelText,
                pctStr,
                color,
                tx: cx + ox + Math.cos(midAngle) * (r * 0.55),
                ty: cy + oy + Math.sin(midAngle) * (r * 0.55)
            };
        }

        startAngle = endAngle;
    });

    if (selectedOverlayInfo) {
        const { labelText, pctStr, color, tx, ty } = selectedOverlayInfo;
        const fullText = `${labelText} ${pctStr}`;

        ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        const textMetrics = ctx.measureText(fullText);
        const textWidth = textMetrics.width;
        const badgeW = textWidth + 14;
        const badgeH = 22;

        let bx = tx - badgeW / 2;
        let by = ty - badgeH / 2;

        bx = Math.max(4, Math.min(w - badgeW - 4, bx));
        by = Math.max(4, Math.min(h - badgeH - 4, by));

        ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
        ctx.shadowBlur = 6;

        ctx.fillStyle = 'rgba(20, 20, 20, 0.9)';
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(bx, by, badgeW, badgeH, 6);
        } else {
            ctx.rect(bx, by, badgeW, badgeH);
        }
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(fullText, bx + badgeW / 2, by + badgeH / 2 + 1);
    }

    let legendHtml = '';
    segments.forEach((seg, i) => {
        const rounded = Math.round(seg.percentage);
        let pctStr = `${rounded}%`;
        if (rounded === 0 && seg.percentage > 0) {
            pctStr = '<1%';
        }
        let labelText = seg.label || '';
        if (options.useShortName) {
            labelText = getStopShortName(labelText);
        }
        if (options.uppercase) {
            labelText = labelText.toUpperCase();
        }

        const isSelected = (i === selectedIndex);
        const color = (typeof colorMappings !== 'undefined' && colorMappings[seg.label]) ? colorMappings[seg.label] : COLORS[i % COLORS.length];

        const activeStyle = '';
        const activeClass = isSelected ? 'stats-legend-selected' : '';

        legendHtml += `<div class="stats-legend-item ${activeClass}" ${activeStyle} onclick="selectSlice('${canvasId}', ${i})">
            <span class="stats-legend-dot" style="background:${color}"></span>
            <span class="stats-legend-label">${labelText}</span>
            <span class="stats-legend-pct">${pctStr}</span>
        </div>`;
    });

    const legend = document.getElementById(legendId);
    if (legend) legend.innerHTML = legendHtml;
}
