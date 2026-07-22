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

    if (busStatsData || stopStatsData || userStatsData) {
        if (busStatsData) renderPieChart(busStatsData, 'stats-canvas', 'stats-legend', { uppercase: true });
        if (stopStatsData) renderPieChart(stopStatsData, 'stop-stats-canvas', 'stop-stats-legend', { useShortName: true });
        if (userStatsData) renderPieChart(userStatsData, 'user-stats-canvas', 'user-stats-legend');
        return;
    }

    statsLoading = true;
    Promise.all([
        fetchStatsJson('https://demo.rubus.live/stats/view_bus?field=route&start=today-7d'),
        fetchStatsJson('https://demo.rubus.live/stats/view_stop?field=stop_name&start=today-7d'),
        fetchStatsJson('https://demo.rubus.live/stats/load?field=users&start=today-7d')
    ])
    .then(([busData, stopData, userData]) => {
        busStatsData = busData;
        stopStatsData = stopData;
        userStatsData = userData;
        if (busStatsData) renderPieChart(busStatsData, 'stats-canvas', 'stats-legend', { uppercase: true });
        if (stopStatsData) renderPieChart(stopStatsData, 'stop-stats-canvas', 'stop-stats-legend', { useShortName: true });
        if (userStatsData) renderPieChart(userStatsData, 'user-stats-canvas', 'user-stats-legend');
        statsLoading = false;
    })
    .catch(error => {
        console.error('Error fetching stats:', error);
        statsLoading = false;
    });
}

function renderPieChart(statsData, canvasId, legendId, options = {}) {
    if (!statsData || !statsData.segments || !statsData.segments.length) return;

    const segments = statsData.segments;
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const dpr = Math.max(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth || 220;
    const h = canvas.clientHeight || 220;

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
    const r = Math.min(cx, cy) - 12;

    let startAngle = -Math.PI / 2;
    segments.forEach((seg, i) => {
        const slice = (seg.percentage / 100) * Math.PI * 2;
        const endAngle = startAngle + slice;
        const color = COLORS[i % COLORS.length];

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r, startAngle, endAngle);
        ctx.closePath();

        ctx.fillStyle = color;
        ctx.fill();

        // Stroke slice outline in same color to eliminate subpixel seam aliasing
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.lineJoin = 'round';
        ctx.stroke();

        startAngle = endAngle;
    });

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
        legendHtml += `<div class="stats-legend-item">
            <span class="stats-legend-dot" style="background:${COLORS[i % COLORS.length]}"></span>
            <span class="stats-legend-label">${labelText}</span>
            <span class="stats-legend-pct">${pctStr}</span>
        </div>`;
    });

    const legend = document.getElementById(legendId);
    if (legend) legend.innerHTML = legendHtml;
}
