const COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#34495e', '#16a085', '#c0392b', '#2980b9', '#8e44ad', '#d35400', '#27ae60', '#2c3e50'];

let busStatsData = null;
let stopStatsData = null;
let userStatsData = null;
let trendStatsData = null;
let visitorTrendChart = null;
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

function mergeSimSegments(segments) {
    const merged = [];
    let simPct = 0;
    for (const seg of segments) {
        if (seg.label && seg.label.startsWith('sim-')) {
            simPct += seg.percentage;
        } else {
            merged.push(seg);
        }
    }
    if (simPct > 0) {
        merged.push({ label: 'sim', percentage: simPct });
    }
    merged.sort((a, b) => b.percentage - a.percentage);
    return merged;
}

function fetchStatsJson(url) {
    return fetch(url)
        .then(res => res.ok ? res.json() : null)
        .catch(err => {
            console.error('Stats fetch error:', url, err);
            return null;
        });
}

// Overlay text swap between the fetch and render phases so we can tell where
// the time goes. The pulsing shimmer animation lives on .stats-loading-overlay,
// so changing the text keeps the animation.
function setOverlayState(id, state) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = state === 'fetching' ? 'Fetching...' : 'Rendering...';
}

const STATS_LOCAL_CACHE_KEY = 'rubus_stats_cache_v1';
const STATS_LOCAL_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

function loadLocalCachedStats() {
    try {
        const raw = localStorage.getItem(STATS_LOCAL_CACHE_KEY);
        if (!raw) return false;
        const cached = JSON.parse(raw);
        if (Date.now() - cached.timestamp > STATS_LOCAL_CACHE_TTL_MS) return false;
        if (cached.bus) busStatsData = cached.bus;
        if (cached.stop) stopStatsData = cached.stop;
        if (cached.user) userStatsData = cached.user;
        if (cached.trend) trendStatsData = cached.trend;
        return true;
    } catch (e) {
        return false;
    }
}

function saveLocalCachedStats() {
    try {
        if (busStatsData && stopStatsData && userStatsData && trendStatsData) {
            localStorage.setItem(STATS_LOCAL_CACHE_KEY, JSON.stringify({
                timestamp: Date.now(),
                bus: busStatsData,
                stop: stopStatsData,
                user: userStatsData,
                trend: trendStatsData
            }));
        }
    } catch (e) {}
}

function showStats() {
    sa_event('btn_press', { btn: 'footer_stats' });
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

    if (!busStatsData || !stopStatsData || !userStatsData || !trendStatsData) {
        loadLocalCachedStats();
    }

    if (busStatsData) {
        renderPieChart(busStatsData, 'stats-canvas', 'stats-legend', { uppercase: true });
    } else {
        setOverlayState('stats-loading-bus', 'fetching');
        $('#stats-loading-bus').show();
    }

    if (stopStatsData) {
        renderPieChart(stopStatsData, 'stop-stats-canvas', 'stop-stats-legend', { useShortName: true });
    } else {
        setOverlayState('stats-loading-stop', 'fetching');
        $('#stats-loading-stop').show();
    }

    if (userStatsData) {
        renderPieChart(userStatsData, 'user-stats-canvas', 'user-stats-legend');
    } else {
        setOverlayState('stats-loading-user', 'fetching');
        $('#stats-loading-user').show();
    }

    if (trendStatsData) {
        renderVisitorTrendChart(trendStatsData);
    } else {
        setOverlayState('stats-loading-trend', 'fetching');
        $('#stats-loading-trend').show();
    }

    if (busStatsData && stopStatsData && userStatsData && trendStatsData) {
        return;
    }

    if (statsLoading) return;

    statsLoading = true;
    let remaining = 4;
    function onDone() {
        remaining--;
        if (remaining <= 0) {
            statsLoading = false;
            saveLocalCachedStats();
        }
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

    fetchStatsJson('https://demo.rubus.live/stats/trend?start=today-30d').then(data => {
        trendStatsData = data;
        if (data && data.labels && data.points && data.points.length) {
            renderVisitorTrendChart(data);
        } else {
            $('#stats-loading-trend').text('No data available').show();
        }
        onDone();
    }).catch(e => {
        console.error('Error fetching visitor trend stats:', e);
        $('#stats-loading-trend').text('No data available').show();
        onDone();
    });
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

    const loadingId = (canvasId === 'stats-canvas') ? 'stats-loading-bus' :
                      (canvasId === 'stop-stats-canvas') ? 'stats-loading-stop' :
                      (canvasId === 'user-stats-canvas') ? 'stats-loading-user' : null;
    if (loadingId) {
        setOverlayState(loadingId, 'rendering');
        $('#' + loadingId).show();
    }

    setupCanvasClickListener(canvasId, options);

    statsData.segments = mergeSimSegments(statsData.segments);
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
            if (rounded === 0 && (seg.percentage > 0 || (typeof seg.count === 'number' && seg.count > 0))) {
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
        if (rounded === 0 && (seg.percentage > 0 || (typeof seg.count === 'number' && seg.count > 0))) {
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

    if (loadingId) $('#' + loadingId).hide();
}

function renderVisitorTrendChart(trendData) {
    if (!trendData || !trendData.labels || !trendData.points || !trendData.points.length) return;

    setOverlayState('stats-loading-trend', 'rendering');
    $('#stats-loading-trend').show();

    const canvas = document.getElementById('visitor-trend-canvas');
    if (!canvas || typeof Chart === 'undefined') {
        $('#stats-loading-trend').hide();
        return;
    }

    if (visitorTrendChart) {
        visitorTrendChart.destroy();
        visitorTrendChart = null;
    }

    const ctx = canvas.getContext('2d');
    const h = canvas.clientHeight || 150;
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, 'rgba(129, 129, 241, 0.35)');
    gradient.addColorStop(1, 'rgba(129, 129, 241, 0.0)');

    const lastPointIdx = trendData.points.length - 1;

    visitorTrendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: trendData.labels,
            datasets: [{
                label: 'Relative Activity',
                data: trendData.points,
                borderColor: '#8181f1',
                backgroundColor: gradient,
                borderWidth: 2.5,
                fill: true,
                tension: 0.35,
                segment: {
                    borderDash: ctx => (ctx.p0DataIndex === lastPointIdx - 1 ? [5, 4] : undefined)
                },
                pointRadius: 0,
                pointHoverRadius: 4,
                pointHoverBackgroundColor: '#8181f1'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 600
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    displayColors: false,
                    backgroundColor: 'rgba(20, 20, 25, 0.9)',
                    titleFont: { size: 11 },
                    bodyFont: { size: 11 },
                    padding: 8,
                    cornerRadius: 6,
                    callbacks: {
                        label: function(context) {
                            const val = context.raw;
                            const diff = val - 100;
                            const diffStr = diff >= 0 ? `+${diff}%` : `${diff}%`;
                            const isLastDay = context.dataIndex === lastPointIdx;
                            const suffix = isLastDay ? ' (in progress)' : '';
                            return `Relative Activity: ${val} (${diffStr} vs avg)${suffix}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: {
                        maxTicksLimit: 6,
                        color: 'rgba(150, 150, 150, 0.7)',
                        font: { size: 10 }
                    }
                },
                y: {
                    display: false,
                    grid: { display: false }
                }
            }
        }
    });

    // Chart.js draws asynchronously (600ms animation); hide the overlay once
    // the chart has been created so the animation is visible underneath.
    $('#stats-loading-trend').hide();
}

