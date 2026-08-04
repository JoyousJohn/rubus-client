// js/my-stats.js - "My Stats" panel in developer settings. Renders device-local
// aggregates captured by stats-tracker.js (IndexedDB). No data leaves the device.
const MY_STATS_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#34495e', '#16a085', '#c0392b'];

let myStatsData = null;

function myStatsSegments(rows, bucketKey) {
    const counts = {};
    rows.forEach(function(r) {
        const key = r[bucketKey] || 'Unknown';
        counts[key] = (counts[key] || 0) + r.count;
    });
    const total = Object.values(counts).reduce(function(a, b) { return a + b; }, 0);
    const segments = Object.keys(counts).map(function(key) {
        return { label: key, count: counts[key], percentage: total ? (counts[key] / total) * 100 : 0 };
    });
    segments.sort(function(a, b) { return b.count - a.count; });
    return segments;
}

function myStatsLabelColor(label) {
    if (typeof colorMappings !== 'undefined' && colorMappings[label]) return colorMappings[label];
    return '#888';
}

function renderMyStatsPie(canvasId, legendId, segments, options) {
    options = options || {};
    const canvas = document.getElementById(canvasId);
    const legend = document.getElementById(legendId);
    if (!canvas || !legend) return;

    const col60 = canvas.closest('.stats-col-60');
    const col40 = legend.closest('.stats-col-40');
    if (col60) col60.style.display = '';
    if (col40) col40.style.width = '';

    if (!segments.length) {
        // Hide the (empty) canvas column so the message centers across the
        // full chart width instead of just the 40% legend column.
        if (col60) col60.style.display = 'none';
        if (col40) col40.style.width = '100%';
        legend.innerHTML = '<div class="text-1p2rem dimgray center">No data yet.</div>';
        return;
    }

    const dpr = Math.max(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth || 220;
    const h = canvas.clientHeight || w || 220;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(dpr, dpr);

    const cx = w / 2;
    const cy = h / 2;
    const r = Math.min(cx, cy) - 8;

    let startAngle = -Math.PI / 2;
    segments.forEach(function(seg, i) {
        const slice = (seg.percentage / 100) * Math.PI * 2;
        const color = myStatsLabelColor(seg.label);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r, startAngle, startAngle + slice);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
        startAngle += slice;
    });

    let legendHtml = '';
    segments.forEach(function(seg, i) {
        const color = myStatsLabelColor(seg.label);
        let label = seg.label;
        if (options.useShortName && typeof getStopShortName === 'function') {
            label = getStopShortName(label);
        }
        legendHtml += `<div class="stats-legend-item">
            <span class="stats-legend-dot" style="background:${color}"></span>
            <span class="stats-legend-label">${label}</span>
            <span class="stats-legend-pct">${Math.round(seg.percentage)}%</span>
        </div>`;
    });
    legend.innerHTML = legendHtml;
}

function renderMyStatsVisits(rows) {
    const todayKey = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const dayCounts = {};
    let total = 0;
    rows.forEach(function(r) {
        dayCounts[r.day] = (dayCounts[r.day] || 0) + r.count;
        total += r.count;
    });

    const days = Object.keys(dayCounts).sort();
    const last7 = days.slice(-7);
    const last30 = days.slice(-30);
    const sum = function(dayKeys) { return dayKeys.reduce(function(a, d) { return a + (dayCounts[d] || 0); }, 0); };

    $('#my-stats-total').text(total);
    $('#my-stats-7d').text(sum(last7));
    $('#my-stats-30d').text(sum(last30));

    // Horizontal bar chart of the last 14 days (oldest → newest)
    const barDays = days.slice(-14);
    const max = Math.max.apply(null, barDays.map(function(d) { return dayCounts[d]; })) || 1;
    let bars = '<div class="flex align-end gap-x-0p2rem" style="height:70px;">';
    barDays.forEach(function(d) {
        const h = Math.max(2, Math.round((dayCounts[d] / max) * 62));
        const isToday = d === todayKey;
        bars += `<div class="flex flex-col flex-1 justify-end" title="${d}: ${dayCounts[d]}">
            <div style="height:${h}px; background:${isToday ? '#e74c3c' : 'var(--theme-extra)'}; border-radius:2px 2px 0 0;"></div>
        </div>`;
    });
    bars += '</div>';
    $('#my-stats-visits-bars').html(bars);
}

async function loadMyStats() {
    try {
        const rows = await LocalStats.getDailyStats();
        myStatsData = rows;
        $('#my-stats-empty').hide();

        const loadRows = rows.filter(r => r.name === 'load');
        const busRows = rows.filter(r => r.name === 'view_bus');
        const stopRows = rows.filter(r => r.name === 'view_stop');
        const buildingRows = rows.filter(r => r.name === 'building_tap');

        if (!rows.length) {
            $('#my-stats-empty').show();
            $('#my-stats-loading-bus, #my-stats-loading-stop, #my-stats-loading-building').hide();
            return;
        }

        renderMyStatsVisits(loadRows);
        renderMyStatsPie('my-bus-canvas', 'my-bus-legend', myStatsSegments(busRows, 'bucket'), {});
        renderMyStatsPie('my-stop-canvas', 'my-stop-legend', myStatsSegments(stopRows, 'bucket'), { useShortName: true });
        renderMyStatsPie('my-building-canvas', 'my-building-legend', myStatsSegments(buildingRows, 'bucket'), {});
        $('#my-stats-loading-bus, #my-stats-loading-stop, #my-stats-loading-building').hide();
    } catch (e) {
        console.error('[my-stats] failed to load local stats:', e);
        $('#my-stats-empty').show().text('Could not load local stats.');
        $('#my-stats-loading-bus, #my-stats-loading-stop, #my-stats-loading-building').hide();
    }
}

window.toggleMyStats = function() {
    const $wrapper = $('.my-stats-wrapper');
    const $head = $('#my-stats-head');
    const isVisible = $wrapper.is(':visible');
    if (isVisible) {
        $wrapper.hide();
        $head.text('Show My Stats ▼');
        return;
    }
    $wrapper.show();
    $head.text('Hide My Stats ▲');
    loadMyStats();
};
