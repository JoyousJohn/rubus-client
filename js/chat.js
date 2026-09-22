// Starter suggestion templates with typed slots. Taps submit live chat requests;
// there are no pre-generated answers. Curated literals only (no dependency on
// lib/stops.js load order), so every slot resolves to a recognizable place the
// backend can resolve. Deliberately excludes vague general-info questions.
const CHAT_STARTER_PLACES = [
    { n: 'The Yard', c: 'ca' },
    { n: 'Livingston Student Center', c: 'livi' },
    { n: 'Hill Center', c: 'busch' },
    { n: 'College Avenue Student Center', c: 'ca' },
    { n: 'Busch Student Center', c: 'busch' },
    { n: 'College Hall', c: 'cook' },
    { n: 'Red Oak Lane', c: 'cook' },
    { n: 'Quads', c: 'livi' },
    { n: 'Allison Road Classrooms', c: 'busch' },
    { n: 'Rutgers Cinema', c: 'livi' },
    { n: 'SoCam Apts', c: 'downtown' },
    { n: "Jersey Mike's Arena", c: 'livi' }
];

const CHAT_STARTER_STOPS = [
    'Livingston Student Center',
    'The Yard',
    'College Avenue Student Center',
    'Hill Center',
    'Busch Student Center',
    'Allison Road Classrooms',
    'College Hall',
    'Red Oak Lane',
    'SoCam Apts',
    'Quads'
];

const CHAT_STARTER_BUILDINGS = [
    'Rutgers Cinema',
    'Old Queens',
    'College Hall',
    'Hill Center',
    'Livingston Student Center',
    'Busch Student Center',
    'Werblin Recreation Center',
    "Jersey Mike's Arena"
];

const CHAT_STARTER_CAMPUSES = ['Busch', 'Livingston', 'College Avenue', 'Cook/Douglass'];

const CHAT_WEEKDAY_ROUTES = ['LX', 'EE', 'A', 'H', 'B', 'F', 'C', 'REXB', 'REXL', 'Helix', 'KBS'];
const CHAT_WEEKEND_ROUTES = ['Weekend 1', 'Weekend 2', 'Helix'];

const CHAT_STARTER_TEMPLATES = [
    { cat: 'nav', text: 'How do I get from {FROM} to {TO}?' },
    { cat: 'nav', text: 'Fastest bus from {FROM} to {TO}?' },
    { cat: 'nav', text: 'How far is {FROM} from {TO}?' },
    { cat: 'routes', text: 'Where does the {ROUTE} stop?' },
    { cat: 'routes', text: 'What routes stop at {STOP}?' },
    { cat: 'routes', text: 'How does the {ROUTE_A} differ from the {ROUTE_B}?' },
    { cat: 'routes', text: 'What bus routes run today?' },
    { cat: 'live', text: 'When is the next bus at {STOP}?' },
    { cat: 'live', text: 'Where are the {ROUTE} buses right now?' },
    { cat: 'live', text: 'What buses are at {STOP} right now?' },
    { cat: 'live', text: 'How long does the {ROUTE} loop take?' },
    { cat: 'live', text: 'What buses are running right now?' },
    { cat: 'live', text: 'Which buses just started running?' },
    { cat: 'info', text: 'When does the {ROUTE} run?' },
    { cat: 'info', text: 'Where is {BUILDING}?' },
    { cat: 'info', text: 'What parking is near {PLACE}?' },
    { cat: 'info', text: 'What parking lots are on {CAMPUS}?' },
    { cat: 'info', text: 'How long do buses stop at {STOP}?' },
    { cat: 'info', text: 'Which stops are near 5 Sicard Street?' },
    { cat: 'info', text: 'Where does the Helix shuttle stop?' }
];

function chatStarterIsWeekend() {
    const day = new Date().getDay();
    return day === 0 || day === 6;
}

function chatStarterRoutePool() {
    return chatStarterIsWeekend() ? CHAT_WEEKEND_ROUTES : CHAT_WEEKDAY_ROUTES;
}

function chatPick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function chatPickFromTo(requireDifferentCampus) {
    const from = chatPick(CHAT_STARTER_PLACES);
    let to = chatPick(CHAT_STARTER_PLACES);
    let guard = 0;
    while ((to.n === from.n || (requireDifferentCampus && to.c === from.c)) && guard++ < 20) {
        to = chatPick(CHAT_STARTER_PLACES);
    }
    return [from.n, to.n];
}

function chatFillStarter(template) {
    let q = template.text;
    if (q.includes('{FROM}') || q.includes('{TO}')) {
        const needsDifferentCampus = template.cat === 'nav';
        const [from, to] = chatPickFromTo(needsDifferentCampus);
        q = q.replace('{FROM}', from).replace('{TO}', to);
    }
    if (q.includes('{ROUTE_A}')) {
        const pool = chatStarterRoutePool();
        const a = chatPick(pool);
        let b = chatPick(pool);
        let guard = 0;
        while (b === a && guard++ < 10) b = chatPick(pool);
        q = q.replace('{ROUTE_A}', a).replace('{ROUTE_B}', b);
    } else if (q.includes('{ROUTE}')) {
        q = q.replace('{ROUTE}', chatPick(chatStarterRoutePool()));
    }
    if (q.includes('{STOP}')) q = q.replace('{STOP}', chatPick(CHAT_STARTER_STOPS));
    if (q.includes('{BUILDING}')) q = q.replace('{BUILDING}', chatPick(CHAT_STARTER_BUILDINGS));
    if (q.includes('{PLACE}')) q = q.replace('{PLACE}', chatPick(CHAT_STARTER_PLACES).n);
    if (q.includes('{CAMPUS}')) q = q.replace('{CAMPUS}', chatPick(CHAT_STARTER_CAMPUSES));
    return q;
}

// Stratified sample: 2 nav + 3 live + 2 routes + 2 info = 9 chips covering
// navigation, live tracking, network, and place/schedule in every open.
function buildChatStarterQuestions() {
    const byCat = { nav: [], live: [], routes: [], info: [] };
    CHAT_STARTER_TEMPLATES.forEach(t => byCat[t.cat].push(t));
    const want = { nav: 2, live: 3, routes: 2, info: 2 };
    const out = [];
    const seen = new Set();
    Object.keys(want).forEach(cat => {
        const pool = [...byCat[cat]].sort(() => 0.5 - Math.random());
        let n = 0;
        for (const t of pool) {
            if (n >= want[cat]) break;
            const q = chatFillStarter(t);
            if (seen.has(q)) continue;
            seen.add(q);
            out.push(q);
            n++;
        }
    });
    return out;
}

const readableRouteNames = {
    'weekend 1': 'wknd1',
    'weekend 2': 'wknd2',
    'weekend1': 'wknd1',
    'weekend2': 'wknd2',
    'wknd 1': 'wknd1',
    'wknd 2': 'wknd2',
    'wknd1': 'wknd1',
    'wknd2': 'wknd2',
    'winter 1': 'winter1',
    'winter 2': 'winter2',
    'winter1': 'winter1',
    'winter2': 'winter2',
    'summer 1': 'summer1',
    'summer 2': 'summer2',
    'summer1': 'summer1',
    'summer2': 'summer2',
    'all campus': 'all',
    'overnight 1': 'on1',
    'overnight 2': 'on2',
    'overnight1': 'on1',
    'overnight2': 'on2',
    'on 1': 'on1',
    'on 2': 'on2',
    'on1': 'on1',
    'on2': 'on2',
    'b/l': 'bl',
    'b-he': 'bhe',
    'b he': 'bhe',
};

function parseMarkdown(text) {
    if (!text) return '';
    // Escape all HTML first so raw AI / user text can never inject tags.
    // Subsequent markdown replacements then wrap the already-escaped text in
    // the small set of safe tags we generate ourselves.
    const esc = (typeof escapeHtml === 'function') ? escapeHtml : (s) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    let processed = esc(text);
    
    // Parse Markdown tables
    const lines = processed.split('\n');
    let inTable = false;
    let tableHtml = '';
    const newLines = [];
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('|') && line.endsWith('|')) {
            const cells = line.split('|').map(c => c.trim()).slice(1, -1);
            if (!inTable) {
                inTable = true;
                tableHtml = '<div style="overflow-x: auto; width: 100%; margin: 1rem 0;"><table class="chat-ui-table"><thead><tr>';
                cells.forEach(cell => {
                    // cell is already escaped (from esc(text)), so no double-escape
                    tableHtml += `<th>${cell}</th>`;
                });
                tableHtml += '</tr></thead><tbody>';
            } else {
                // Check if separator row
                if (cells.every(c => /^-+$/.test(c.replace(/:/g, '')))) {
                    continue;
                }
                tableHtml += '<tr>';
                cells.forEach(cell => {
                    tableHtml += `<td>${cell}</td>`;
                });
                tableHtml += '</tr>';
            }
        } else {
            if (inTable) {
                tableHtml += '</tbody></table></div>';
                newLines.push(tableHtml);
                inTable = false;
                tableHtml = '';
            }
            newLines.push(lines[i]);
        }
    }
    if (inTable) {
        tableHtml += '</tbody></table></div>';
        newLines.push(tableHtml);
    }
    processed = newLines.join('\n');

    // Unordered lists: consecutive lines starting with -, *, or • become a
    // <ul>. (• is accepted for backward compat with older plain-text answers.)
    // Requires whitespace after the marker so *italic* text never matches.
    const listLines = processed.split('\n');
    let inList = false;
    const listOut = [];
    for (const ln of listLines) {
        const lm = ln.match(/^\s*([-*•])\s+(.*)$/);
        if (lm) {
            if (!inList) { inList = true; listOut.push('<ul class="chat-md-list">'); }
            listOut.push(`<li>${lm[2]}</li>`);
        } else {
            if (inList) { inList = false; listOut.push('</ul>'); }
            listOut.push(ln);
        }
    }
    if (inList) listOut.push('</ul>');
    processed = listOut.join('\n');

    // Use replacement functions so captured groups are already escaped and
    // we don't re-interpret $1 as raw HTML.
    processed = processed.replace(/^### (.*$)/gim, (m, g1) => `<h3 style="margin: 1.5rem 0 0.5rem 0; font-size: 1.6rem; font-weight: 500;">${g1}</h3>`);
    processed = processed.replace(/^## (.*$)/gim, (m, g1) => `<h2 style="margin: 0.8rem 0 0.4rem 0; font-size: 1.8rem; font-weight: normal;">${g1}</h2>`);
    processed = processed.replace(/^# (.*$)/gim, (m, g1) => `<h1 style="margin: 1.0rem 0 0.5rem 0; font-size: 2.0rem; font-weight: normal;">${g1}</h1>`);
    processed = processed.replace(/^---$/gim, '<hr style="border: 0; margin: 0.4rem 0; opacity: 0;">');
    
    // Strip newlines directly adjacent to block elements to prevent double line breaks
    processed = processed.replace(/\n?<(h[1-3]|hr)([^>]*)>\n?/gi, '<$1$2>');
    processed = processed.replace(/\n?<\/(h[1-3])>\n?/gi, '</$1>');
    
    processed = processed.replace(/\n\n+/g, '<div style="height: 1.1rem;"></div>');
    processed = processed.replace(/\*\*(.*?)\*\*/g, (m, g1) => `<strong>${g1}</strong>`);
    processed = processed.replace(/__(.*?)__/g, (m, g1) => `<strong>${g1}</strong>`);
    processed = processed.replace(/\*(.*?)\*/g, (m, g1) => `<em>${g1}</em>`);
    processed = processed.replace(/(?<!\w)_(.*?)_(?!\w)/g, (m, g1) => `<em>${g1}</em>`);
    return processed;
}

function getAllStopNames() {
    const stopNames = [];
    if (typeof allStopsData !== 'undefined') {
        for (const campus in allStopsData) {
            for (const stopId in allStopsData[campus]) {
                const stop = allStopsData[campus][stopId];
                if (stop.name) stopNames.push(stop.name);
                if (stop.shortName) stopNames.push(stop.shortName);
                if (stop.shorterName) stopNames.push(stop.shorterName);
                if (stop.mainName) stopNames.push(stop.mainName);
            }
        }
    }
    return [...new Set(stopNames)].sort((a, b) => b.length - a.length);
}

function colorRouteNames(text) {
    if (typeof colorMappings === 'undefined') return text;
    const esc = (typeof escapeHtml === 'function') ? escapeHtml : (s) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    const escColor = (typeof escapeCssColor === 'function') ? escapeCssColor : (c) => c;
    
    const stopNames = getAllStopNames();
    const allStopVariants = [];
    stopNames.forEach(s => {
        allStopVariants.push(s);
        const escaped = esc(s);
        if (escaped !== s) allStopVariants.push(escaped);
        const smartApos = s.replace(/'/g, '’');
        if (smartApos !== s) {
            allStopVariants.push(smartApos);
            const smartEscaped = esc(smartApos);
            if (smartEscaped !== smartApos) allStopVariants.push(smartEscaped);
        }
    });
    allStopVariants.sort((a, b) => b.length - a.length);
    const escapedStops = allStopVariants.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const stopRegex = escapedStops.length ? new RegExp(`(?<![\\w&])(${escapedStops.join('|')})(?![\\w;])`, 'gi') : null;
    
    const readableKeys = Object.keys(readableRouteNames).sort((a, b) => b.length - a.length);
    const escapedReadable = readableKeys.map(r => r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const readableRegex = new RegExp(`(?:(?<=\\s|^|[•\\*\\-]|\\b))(${escapedReadable.join('|')})(?:\\b|(?=\\s|$|:))(?:\\s+(route\\b))?`, 'gi');
    
    const sorted = [...knownRoutes].sort((a, b) => b.length - a.length);
    const escaped = sorted.map(r => r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    // A lone letter after "Building" is a building label ("Building B"), not
    // a route: exclude exactly that case, color everything else as before.
    const routeRegex = new RegExp(`(?<!\\bbuilding\\s)\\b(${escaped.join('|')})\\b(?:\\s+(route\\b))?`, 'gi');
    
    const colorLine = (line) => {
        // Sentence-initial "A" is the article, not route A — unless it heads
        // a route list ("A, B", "A and H"). Stash it behind a digit-only
        // placeholder the coloring passes cannot match, restore afterwards.
        // Bold "**A**" never matches (line starts with "<"), so routes stay.
        const stashedA = [];
        const guarded = line.replace(/(^|[.!?]|<\/(?:div|li|p|ul)>|<li>|<br\s*\/?>|:)(\s*)(A)\b(?=\s*[a-z])(?!\s*(?:,|and|or|&|\/)\s*[ABCFH]\b)/g, (m, pre, ws, a) => {
            stashedA.push(a);
            return `${pre}${ws}\0${stashedA.length - 1}\0`;
        });
        const colored = guarded.replace(/(^|>)([^<]*?)(?=<|$)/g, (match, before, content) => {
            if (!content) return match;
            
            let processed = content;
            // "Weekend 1/2" (also Overnight/Winter/Summer) shorthand: color
            // each digit with its own route color (1 -> route 1, 2 -> route 2).
            processed = processed.replace(/\b(weekend|overnight|winter|summer)\s+1\s*\/\s*2\b/gi, (m, base) => {
                const key1 = readableRouteNames[base.toLowerCase() + ' 1'];
                const key2 = readableRouteNames[base.toLowerCase() + ' 2'];
                const c1 = key1 ? colorMappings[key1] : null;
                const c2 = key2 ? colorMappings[key2] : null;
                const d1 = c1 ? `<span style="color: ${escColor(c1)}">1</span>` : '1';
                const d2 = c2 ? `<span style="color: ${escColor(c2)}">2</span>` : '2';
                return `${esc(base)} ${d1}/${d2}`;
            });
            if (stopRegex) {
                processed = processed.replace(stopRegex, (matchedStr) => {
                    return `<span style="color: #65acf2;">${matchedStr}</span>`;
                });
            }

            processed = processed.replace(readableRegex, (matchStr, name) => {
                const key = readableRouteNames[name.toLowerCase()];
                const color = colorMappings[key];
                if (color) return `<span style="color: ${escColor(color)}">${esc(matchStr)}</span>`;
                return esc(matchStr);
            });

            processed = processed.replace(routeRegex, (matchStr, name, routeWord) => {
                if (name === name.toLowerCase()) return esc(matchStr);
                if (name.toLowerCase() === 'all' && !routeWord) {
                    return esc(matchStr);
                }
                const key = name.toLowerCase();
                const color = colorMappings[key];
                if (color) {
                    const uppercasedName = name.toUpperCase();
                    const newMatchStr = matchStr.replace(name, uppercasedName);
                    return `<span style="color: ${escColor(color)}">${esc(newMatchStr)}</span>`;
                }
                return esc(matchStr);
            });

            return before + processed;
        });
        return colored.replace(/\0(\d+)\0/g, (m, i) => stashedA[+i]);
    };

    const lines = text.split('\n');
    const processedLines = lines.map(line => {
        if (/^\s*#+\s+/.test(line)) {
            return line;
        }
        return colorLine(line);
    });
    
    return processedLines.join('\n');
}

// Visual Viewport-aware sizing
let chatViewportListenersAttached = false;
let chatVvpHandler = null;

function setChatHeightsForViewportHeight(viewportHeightPx) {
  const headerHeight = $('.chat-ui-header').outerHeight() || 0;
  const inputBarHeight = $('.chat-ui-input-bar').outerHeight() || 0;
  const disclaimerHeight = $('.chat-disclaimer').outerHeight() || 0;
  const availableHeight = Math.max(0, viewportHeightPx - headerHeight - inputBarHeight - disclaimerHeight);
  $('.chat-ui-panel').css('height', viewportHeightPx + 'px');
  $('.chat-ui-messages').css('height', availableHeight + 'px');
}

function adjustChatHeights() {
  if (window.visualViewport) {
    const vvp = window.visualViewport;
    $('.chat-modal-parent').css({
      'position': 'absolute',
      'top': vvp.offsetTop + 'px',
      'left': vvp.offsetLeft + 'px',
      'height': vvp.height + 'px',
      'width': vvp.width + 'px'
    });
    setChatHeightsForViewportHeight(vvp.height);
  } else {
    const height = window.innerHeight;
    $('.chat-modal-parent').css({
      'position': 'fixed',
      'top': '0px',
      'left': '0px',
      'height': '100%',
      'width': '100%'
    });
    setChatHeightsForViewportHeight(height);
  }
}

function attachChatViewportListeners() {
  if (chatViewportListenersAttached) return;
  chatViewportListenersAttached = true;
  chatVvpHandler = () => requestAnimationFrame(() => {
    adjustChatHeights();
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', chatVvpHandler);
    window.visualViewport.addEventListener('scroll', chatVvpHandler);
  }
  window.addEventListener('resize', chatVvpHandler);
}

function detachChatViewportListeners() {
  if (!chatViewportListenersAttached) return;
  chatViewportListenersAttached = false;
  if (window.visualViewport && chatVvpHandler) {
    window.visualViewport.removeEventListener('resize', chatVvpHandler);
    window.visualViewport.removeEventListener('scroll', chatVvpHandler);
  }
  if (chatVvpHandler) {
    window.removeEventListener('resize', chatVvpHandler);
  }
  chatVvpHandler = null;
}

function updateChatInitialMessage() {
    if (window.chatHistory && window.chatHistory.length > 0) return;
    const baseMsg = 'I can help with navigation, routes, stops, and schedules.';
    let busCount = 0;
    let routeCount = 0;
    if (typeof busesByRoutes !== 'undefined' && typeof selectedCampus !== 'undefined' && busesByRoutes[selectedCampus]) {
        for (const route in busesByRoutes[selectedCampus]) {
            const buses = busesByRoutes[selectedCampus][route] || [];
            const validBuses = buses.filter(b => {
                // isBusInService (not isBusShownOnMap): the show-out-of-service
                // toggle must not inflate the "running" count, and off-route
                // buses are excluded via distanceFromLine either way.
                if (typeof isBusInService === 'function') return isBusInService(b);
                if (typeof isBusShownOnMap === 'function') return isBusShownOnMap(b);
                return typeof busData !== 'undefined' && busData[b] && !busData[b].oos && !busData[b].atDepot;
            });
            if (validBuses.length > 0) {
                routeCount++;
                busCount += validBuses.length;
            }
        }
    }
    
    let text = baseMsg;
    if (busCount > 0 && routeCount > 0) {
        const busStr = busCount === 1 ? '1 bus' : `${busCount} buses`;
        const routeStr = routeCount === 1 ? '1 route' : `${routeCount} routes`;
        text = `${baseMsg} There are currently ${busStr} running on ${routeStr}.`;
    }
    
    const $firstBotMsg = $('.chat-ui-messages .chat-initial-prompt').length
        ? $('.chat-ui-messages .chat-initial-prompt').first()
        : $('.chat-ui-messages .chat-message.bot:not(.chat-beta-notice)').first();
    if ($firstBotMsg.length && $firstBotMsg.text() !== text) {
        $firstBotMsg.text(text);
    }
}
window.updateChatInitialMessage = updateChatInitialMessage;

document.addEventListener('rubus-bus-data-loaded', function() {
    updateChatInitialMessage();
});

window.updateChatButtonVisibility = function() {
    const campus = (typeof settings !== 'undefined' && settings && settings['campus']) || 'nb';
    const showChat = (typeof settings !== 'undefined' && settings && settings['toggle-show-chat']);
    if (campus === 'nb' && showChat) {
        $('.chat-btn-wrapper').show();
    } else {
        $('.chat-btn-wrapper').hide();
        if (campus !== 'nb' && $('.chat-wrapper').is(':visible')) {
            $('.chat-wrapper').hide();
        }
    }
};

$(function() {
    window.updateChatButtonVisibility();
});

// One session id per conversation (fresh when history is empty) so the
// server can link a client's turns into a replayable thread in Mongo.
function ensureChatSessionId() {
    if (!window.chatHistory || window.chatHistory.length === 0 || !window.chatSessionId) {
        window.chatSessionId = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    }
    return window.chatSessionId;
}

// Show chat UI when chat button is clicked
$(document).on('click', '.chat-btn', function() {
  ensureChatSessionId();
  capturePostHog('chat_opened', {
      campus: settings['campus'] || 'nb',
      model: settings['chatbot-model'] || defaultSettings['chatbot-model'],
      provider: settings['chatbot-provider'] || 'auto'
  });
  sa_event('btn_press', { btn: 'chat_open' });
  $('.chat-wrapper').removeClass('none').show();
  attachChatViewportListeners();
  attachChatMessagesScrollTracker();
  attachChatRecsDragScroll();
  chatUserScrolledUp = false;
  chatAutoScrollSticky = true;
  cancelSmoothScroll();
  $('.chat-scroll-bottom-btn').removeClass('visible has-new');
  adjustChatHeights();
  updateChatInitialMessage();

    // Clear previous recommendations to prevent unbounded DOM growth
    $('.chat-recs').empty();
    if (!window.chatHistory || window.chatHistory.length === 0) {
        $('.chat-recs').show();
        const $rows = [
            $('<div class="chat-recs-row"></div>'),
            $('<div class="chat-recs-row"></div>'),
            $('<div class="chat-recs-row"></div>')
        ];
        const questions = buildChatStarterQuestions();
        questions.forEach((q, idx) => {
            const $rec = $('<button class="chat-suggestion-chip" type="button"></button>').text(q);
            $rec.click(function(e) {
                if (chatRecsJustDragged) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    return;
                }
                capturePostHog('chat_suggestion_clicked', {
                    model: settings['chatbot-model'] || defaultSettings['chatbot-model'],
                    provider: settings['chatbot-provider'] || 'auto',
                    campus: settings['campus'] || 'nb'
                });
                sa_event('btn_press', { btn: 'chat_example_selected' });
                $('.chat-recs').hide();
                $('.chat-ui-input').val(q).data('is-example', true);
                $('.chat-ui-input-bar').trigger('submit');
            });
            $rows[idx % 3].append($rec);
        });
        $rows.forEach($row => $('.chat-recs').append($row));
        $('.chat-recs').scrollLeft(0);
    }
    $('.chat-ui-input').focus();
});

let isUserTouchingChat = false;
let touchStartY = 0;
// True when the view is locked to follow new streamed tokens at the bottom.
// When user manually scrolls up, this becomes false (pausing auto-scroll).
let chatAutoScrollSticky = true;
let chatUserScrolledUp = false;
let smoothScrollRaf = null;
let currentTargetScrollTop = null;
let lastProgrammaticScrollTime = 0;
const CHAT_BOTTOM_THRESHOLD_PX = 40;

function cancelSmoothScroll() {
  if (smoothScrollRaf) {
    cancelAnimationFrame(smoothScrollRaf);
    smoothScrollRaf = null;
  }
  currentTargetScrollTop = null;
}

function isChatMessagesNearBottom($messages, threshold) {
  if (!$messages || !$messages.length) return true;
  const el = $messages[0];
  if (!el) return true;
  if (el.scrollHeight <= el.clientHeight + 1) return true;
  const limit = (typeof threshold === 'number') ? threshold : CHAT_BOTTOM_THRESHOLD_PX;
  return (el.scrollTop + el.clientHeight) >= (el.scrollHeight - limit);
}

function updateScrollBottomBtn() {
  const $messages = $('.chat-ui-messages');
  const $btn = $('.chat-scroll-bottom-btn');
  if (!$messages.length || !$btn.length) return;
  const el = $messages[0];
  if (!el) return;

  const isScrollable = (el.scrollHeight - el.clientHeight) > 24;
  const isNearBottom = isChatMessagesNearBottom($messages, CHAT_BOTTOM_THRESHOLD_PX);

  if (isScrollable && !isNearBottom) {
    $btn.addClass('visible');
  } else {
    $btn.removeClass('visible has-new');
  }
}

// Smooth auto-scroll loop for streaming tokens:
// Glides down to follow newly wrapped lines without snapping or abrupt jumps.
function smoothScrollChatToBottom($messages, speed = 0.18) {
  if (!$messages || !$messages.length) return;
  const el = $messages[0];
  if (!el) return;

  const maxScroll = el.scrollHeight - el.clientHeight;
  if (maxScroll <= 0) return;

  currentTargetScrollTop = maxScroll;

  if (smoothScrollRaf) return;

  function step() {
    if (!chatAutoScrollSticky || isUserTouchingChat) {
      cancelSmoothScroll();
      return;
    }

    const current = el.scrollTop;
    const target = currentTargetScrollTop !== null ? currentTargetScrollTop : (el.scrollHeight - el.clientHeight);
    const diff = target - current;

    if (diff <= 0) {
      cancelSmoothScroll();
      return;
    }

    if (diff < 0.75) {
      lastProgrammaticScrollTime = performance.now();
      el.scrollTop = target;
      cancelSmoothScroll();
      return;
    }

    let delta = diff * speed;
    if (delta < 0.8) delta = 0.8;
    if (delta > diff) delta = diff;

    lastProgrammaticScrollTime = performance.now();
    el.scrollTop = current + delta;

    smoothScrollRaf = requestAnimationFrame(step);
  }

  smoothScrollRaf = requestAnimationFrame(step);
}

function attachChatMessagesScrollTracker() {
  const $messages = $('.chat-ui-messages');
  if (!$messages.length || $messages.data('scroll-tracker-attached')) return;
  $messages.data('scroll-tracker-attached', true);

  let lastScrollTop = $messages[0].scrollTop;

  $messages.on('scroll', function() {
    const currentScrollTop = this.scrollTop;
    const now = performance.now();
    const isProgrammatic = (now - lastProgrammaticScrollTime) < 100;

    if (!isProgrammatic) {
      if (currentScrollTop < lastScrollTop - 2) {
        chatAutoScrollSticky = false;
        chatUserScrolledUp = true;
        cancelSmoothScroll();
      } else if (isChatMessagesNearBottom($(this), CHAT_BOTTOM_THRESHOLD_PX)) {
        chatAutoScrollSticky = true;
        chatUserScrolledUp = false;
      }
    }

    lastScrollTop = currentScrollTop;
    updateScrollBottomBtn();
  });

  $messages.on('wheel', function(e) {
    const orig = e.originalEvent;
    if (!orig) return;
    if (orig.deltaY < 0) {
      chatAutoScrollSticky = false;
      chatUserScrolledUp = true;
      cancelSmoothScroll();
      updateScrollBottomBtn();
    } else if (orig.deltaY > 0) {
      setTimeout(() => {
        if (isChatMessagesNearBottom($messages, CHAT_BOTTOM_THRESHOLD_PX)) {
          chatAutoScrollSticky = true;
          chatUserScrolledUp = false;
          updateScrollBottomBtn();
        }
      }, 30);
    }
  });
}

let isChatRecsDragging = false;
let chatRecsJustDragged = false;
let chatRecsMomentumRaf = null;

function attachChatRecsDragScroll() {
  const $recs = $('.chat-recs');
  if (!$recs.length || $recs.data('drag-scroll-attached')) return;
  $recs.data('drag-scroll-attached', true);

  let isDown = false;
  let startX = 0;
  let startScroll = 0;
  let lastX = 0;
  let lastTime = 0;
  let velocity = 0;
  const DRAG_THRESHOLD = 4;

  function stopMomentum() {
    if (chatRecsMomentumRaf) {
      cancelAnimationFrame(chatRecsMomentumRaf);
      chatRecsMomentumRaf = null;
    }
  }

  $recs.on('pointerdown mousedown', function(e) {
    if (e.type === 'pointerdown' && e.pointerType && e.pointerType !== 'mouse') return;
    if (e.button !== 0) return;
    stopMomentum();
    isDown = true;
    isChatRecsDragging = false;
    startX = e.clientX || (e.originalEvent && e.originalEvent.clientX) || 0;
    lastX = startX;
    lastTime = performance.now();
    velocity = 0;
    startScroll = this.scrollLeft;
  });

  $(document).on('pointermove mousemove', function(e) {
    if (!isDown) return;
    const clientX = e.clientX || (e.originalEvent && e.originalEvent.clientX) || 0;
    const dx = clientX - startX;
    const now = performance.now();
    const dt = now - lastTime;
    if (dt > 10) {
      velocity = (clientX - lastX) / dt;
      lastX = clientX;
      lastTime = now;
    }
    if (!isChatRecsDragging && Math.abs(dx) > DRAG_THRESHOLD) {
      isChatRecsDragging = true;
      $recs.addClass('dragging');
    }
    if (isChatRecsDragging) {
      const recsEl = $recs[0];
      if (recsEl) recsEl.scrollLeft = startScroll - dx;
      if (e.cancelable) e.preventDefault();
    }
  });

  $(document).on('pointerup pointercancel mouseup', function(e) {
    if (!isDown) return;
    isDown = false;
    if (isChatRecsDragging) {
      isChatRecsDragging = false;
      $recs.removeClass('dragging');
      chatRecsJustDragged = true;
      setTimeout(() => { chatRecsJustDragged = false; }, 80);

      const recsEl = $recs[0];
      if (recsEl && Math.abs(velocity) > 0.2) {
        let v = velocity;
        const step = () => {
          v *= 0.92;
          if (Math.abs(v) < 0.05) return;
          recsEl.scrollLeft -= v * 16;
          chatRecsMomentumRaf = requestAnimationFrame(step);
        };
        chatRecsMomentumRaf = requestAnimationFrame(step);
      }
    }
  });

  $recs.on('wheel', function(e) {
    const orig = e.originalEvent;
    if (!orig) return;
    if (Math.abs(orig.deltaY) > Math.abs(orig.deltaX)) {
      stopMomentum();
      this.scrollLeft += orig.deltaY;
      e.preventDefault();
    }
  });
}

$(function() {
  attachChatMessagesScrollTracker();
  attachChatRecsDragScroll();
});

$(document).on('touchstart pointerdown', '.chat-ui-messages', function(e) {
  if (e.pointerType && e.pointerType === 'mouse' && e.button !== 0) return;
  isUserTouchingChat = true;
  cancelSmoothScroll();
  const evt = e.originalEvent || e;
  touchStartY = evt.touches ? evt.touches[0].clientY : evt.clientY;
});

$(document).on('touchmove pointermove', '.chat-ui-messages', function(e) {
  if (!isUserTouchingChat) return;
  const evt = e.originalEvent || e;
  const currentY = evt.touches ? evt.touches[0].clientY : evt.clientY;
  if (currentY > touchStartY + 6) {
    chatAutoScrollSticky = false;
    chatUserScrolledUp = true;
    cancelSmoothScroll();
    updateScrollBottomBtn();
  }
});

$(document).on('touchend touchcancel pointerup pointercancel', function() {
  isUserTouchingChat = false;
  const $messages = $('.chat-ui-messages');
  if ($messages.length && isChatMessagesNearBottom($messages, CHAT_BOTTOM_THRESHOLD_PX)) {
    chatAutoScrollSticky = true;
    chatUserScrolledUp = false;
  }
  updateScrollBottomBtn();
});

// Floating scroll-to-bottom button click handler
$(document).on('click', '.chat-scroll-bottom-btn', function() {
  const $messages = $('.chat-ui-messages');
  if (!$messages.length) return;
  const el = $messages[0];
  if (!el) return;

  chatAutoScrollSticky = true;
  chatUserScrolledUp = false;
  $('.chat-scroll-bottom-btn').removeClass('visible has-new');

  const target = el.scrollHeight - el.clientHeight;
  lastProgrammaticScrollTime = performance.now() + 450;
  el.scrollTo({
    top: target,
    behavior: 'smooth'
  });
});

function scrollChatToBottom($messages, force = false) {
  if (!$messages || !$messages.length) return;
  if (!force && isUserTouchingChat) return;
  if (force) {
    cancelSmoothScroll();
    chatAutoScrollSticky = true;
    chatUserScrolledUp = false;
    const el = $messages[0];
    if (el) el.scrollTop = el.scrollHeight;
    updateScrollBottomBtn();
  } else {
    smoothScrollChatToBottom($messages);
  }
}

function scrollChatToUserMessageTop($messages, $userMsg) {
  if (!$messages || !$messages.length || !$userMsg || !$userMsg.length) return;
  const container = $messages[0];
  const userEl = $userMsg[0];
  if (!container || !userEl) return;

  cancelSmoothScroll();
  chatAutoScrollSticky = true;
  chatUserScrolledUp = false;
  $('.chat-scroll-bottom-btn').removeClass('visible has-new');

  requestAnimationFrame(() => {
    const containerRect = container.getBoundingClientRect();
    const userRect = userEl.getBoundingClientRect();
    const targetTop = userRect.top - containerRect.top + container.scrollTop;
    const targetScrollTop = Math.max(0, targetTop - 8);
    lastProgrammaticScrollTime = performance.now() + 450;
    container.scrollTo({
      top: targetScrollTop,
      behavior: 'smooth'
    });
  });
}

// Adjust layout on focus/blur (mobile keyboard showing/hiding) without scrolling down
$(document).on('focus', '.chat-ui-input', function() {
  setTimeout(() => {
    adjustChatHeights();
    updateScrollBottomBtn();
  }, 50);
});
$(document).on('blur', '.chat-ui-input', function() {
  setTimeout(() => {
    adjustChatHeights();
    updateScrollBottomBtn();
  }, 50);
});

function closeChat() {
  capturePostHog('chat_closed', {
      campus: settings['campus'] || 'nb',
      message_count: window.chatHistory.length || 0
  });
  cancelSmoothScroll();
  chatAutoScrollSticky = true;
  chatUserScrolledUp = false;
  $('.chat-scroll-bottom-btn').removeClass('visible has-new');
  $('.chat-wrapper').hide();
  detachChatViewportListeners();
  // Clear inline sizing
  $('.chat-modal-parent').css({
    'position': '',
    'top': '',
    'left': '',
    'height': '',
    'width': ''
  });
  $('.chat-ui-panel').css('height', '');
  $('.chat-ui-messages').css('height', '');
  returnToMapIfChatRoute();
}
window.closeChat = closeChat;

// If the address bar still points at the chat route (path */chat, hash #chat,
// or ?chat param), restore the URL so the map can be reached again.
function returnToMapIfChatRoute() {
  const params = new URLSearchParams(window.location.search);
  let changed = false;

  if (params.has('chat')) {
    params.delete('chat');
    changed = true;
  }

  let path = window.location.pathname;
  if (path.endsWith('/chat')) {
    path = path.slice(0, -('/chat'.length)) || '/';
    changed = true;
  }

  let hash = window.location.hash;
  if (hash === '#chat') {
    hash = '';
    changed = true;
  }

  if (!changed) return;

  const queryString = params.toString();
  const newUrl = path + (queryString ? '?' + queryString : '') + hash;
  history.replaceState(history.state, '', newUrl);
}

// Close chat UI
$(document).on('click', '.chat-ui-close', function() {
  closeChat();
});
window.chatHistory = [];

// Helpers for POST-based chat: truncate history to avoid unbounded URLs / PII in logs
function truncateChatHistory(history) {
    const MAX_ENTRIES = 20;
    const MAX_CHARS = 8000;
    const MAX_CONTENT = 2000;
    if (!Array.isArray(history)) return [];
    let truncated = history.slice(-MAX_ENTRIES);
    truncated = truncated.map(entry => ({
        role: entry.role,
        content: typeof entry.content === 'string' && entry.content.length > MAX_CONTENT ? entry.content.slice(0, MAX_CONTENT) + '…' : entry.content
    }));
    let totalChars = JSON.stringify(truncated).length;
    while (truncated.length > 2 && totalChars > MAX_CHARS) {
        truncated = truncated.slice(2);
        totalChars = JSON.stringify(truncated).length;
    }
    return truncated;
}

// Device-local chatbot token spend tracking. Records per-completion spend via
// LocalStats (IndexedDB daily aggregates keyed by model, mirrored to
// localStorage under 'rubus-chat-token-spend-v1'). No UI reads this.
function chatTokenNum(v) {
    const n = Math.floor(Number(v));
    return (isFinite(n) && n > 0) ? n : 0;
}

function estimateChatTokens(text) {
    if (!text) return 0;
    return Math.max(1, Math.round(String(text).length / 3.8));
}

function recordChatTokenSpend(data, opts) {
    if (opts.responseError) return null;
    const model = opts.model || data.model || 'unknown';
    const provider = opts.provider || data.provider || 'auto';
    const completion = chatTokenNum(data.completion_tokens || data.output_tokens)
        || estimateChatTokens(opts.answer || data.answer || '');
    const reasoning = chatTokenNum(data.reasoning_tokens)
        || (opts.thinking ? estimateChatTokens(opts.thinking) : 0);
    const promptServer = chatTokenNum(data.prompt_tokens || data.input_tokens || data.promptTokens);
    const prompt = promptServer || estimateChatTokens(opts.question || '');
    const total = chatTokenNum(data.total_tokens || data.tokens || data.totalTokens)
        || (completion + reasoning + prompt);
    if (total <= 0) return null;
    const spend = { completion: completion, reasoning: reasoning, prompt: prompt, total: total };
    sa_event('chat_tokens', {
        model: model,
        provider: provider,
        tokens: total,
        completion_tokens: completion,
        reasoning_tokens: reasoning,
        prompt_tokens: prompt
    });
    return spend;
}

// One request at a time: the send button stays locked while a response is
// generating and unlocks on done/error, so messages can't pile up mid-stream.
// The text input stays editable throughout so the next message can be
// composed while waiting.
function setChatInputEnabled(on) {
    $('.chat-ui-send').prop('disabled', !on);
}

$(document).on('submit', '.chat-ui-input-bar', function(e) {
    e.preventDefault();

    $('.chat-recs').hide();

    const $input = $(this).find('.chat-ui-input');
    // One-shot flag stamped by suggestion-chip taps. Consumed before the
    // early returns so a dropped submit can't misattribute the next message.
    const isExample = $input.data('is-example') === true;
    $input.removeData('is-example');
    if ($(this).find('.chat-ui-send').prop('disabled')) return;
    let msg = $input.val().trim();
    if (!msg) return;
    // Client-side size limit to avoid DoS and huge payloads
    const MAX_MSG_LEN = 2000;
    if (msg.length > MAX_MSG_LEN) msg = msg.slice(0, MAX_MSG_LEN);
    const $messages = $('.chat-ui-messages');
    // Prior suggestion chips are one-shot: hide them once a new message goes out.
    $messages.find('.chat-suggestions-container').fadeOut(150, function() { $(this).remove(); });
    const $userMsg = $(`<div class="chat-message user">${$('<div>').text(msg).html()}</div>`);
    $messages.append($userMsg);
    window.chatHistory.push({ role: 'user', content: msg });
    capturePostHog('chat_message_sent', {
        message: msg,
        message_length: msg.length,
        history_length: window.chatHistory.length,
        model: settings['chatbot-model'] || defaultSettings['chatbot-model'],
        provider: settings['chatbot-provider'] || 'auto',
        is_example: isExample,
        campus: settings['campus'] || 'nb'
    });
    sa_event('btn_press', { btn: 'chat_message_sent' });
    $input.val('');
    setChatInputEnabled(false);

    const reqStartTime = performance.now();
    let responseDone = false;
    let phase = 'waiting'; // 'waiting' | 'thinking' | 'answering'
    let phaseStartTime = null;
    let segmentStartTokens = 0; // streamed tokens predating the current phase segment
    let thinkActiveMs = 0; // thinking-stream time accumulated across tool-gap segments
    let streamedThinking = '';
    let streamedAnswer = '';
    let tpsInterval = null;
    let $currentThinkingBox = null;
    let $botMeta = null;

    const selectedModel = settings['chatbot-model'] || defaultSettings['chatbot-model'];
    const selectedProvider = settings['chatbot-provider'] || 'auto';
    let currentModel = selectedModel;
    let currentProvider = selectedProvider;

    // Display labels come from the server: /chat/models serves key->label
    // pairs (also used for the settings buttons), and stream events already
    // carry display-ready model/provider strings. No local name maps.
    function chatCatalogLabel(kind, key) {
        if (kind === 'provider' && String(key || '').trim().toLowerCase() === 'auto') return '';
        try {
            const models = (chatbotModelCatalog && chatbotModelCatalog.models) || [];
            if (kind === 'model') {
                const found = models.find((entry) => entry && entry.key === key);
                return (found && found.label) || '';
            }
            for (const model of models) {
                const found = ((model && model.providers) || []).find((entry) => entry && entry.key === key);
                if (found && found.label) return found.label;
            }
        } catch (e) {}
        return '';
    }

    function formatServerName(raw) {
        if (!raw) return '';
        const s = String(raw).split('/').pop().trim();
        if (!s || s.toLowerCase() === 'auto') return '';
        return s;
    }

    function formatThinkingBadge(metric) {
        const parts = [];
        const modelStr = chatCatalogLabel('model', currentModel) || formatServerName(currentModel);
        const providerStr = chatCatalogLabel('provider', currentProvider) || formatServerName(currentProvider);
        if (modelStr) parts.push(modelStr);
        if (providerStr) parts.push(providerStr);
        if (metric) {
            const formattedMetric = String(metric).replace(/(\d+)(\s+tokens)/, (m, count, suffix) => {
                return Number(count).toLocaleString() + suffix;
            });
            parts.push(formattedMetric);
        }
        return parts.join(' · ');
    }

    function estimateTokens(text) {
        if (!text) return 0;
        return Math.max(1, Math.round(text.length / 3.8));
    }

    function getLiveStatusString() {
        const now = performance.now();
        if (phase === 'waiting' || !phaseStartTime) {
            const elapsedSec = (now - reqStartTime) / 1000;
            return `${elapsedSec.toFixed(1)}s`;
        }

        const elapsedPhaseSec = (now - phaseStartTime) / 1000;
        if (elapsedPhaseSec < 0.1) return '';

        if (phase === 'thinking') {
            const tokens = estimateTokens(streamedThinking) - segmentStartTokens;
            const tps = (tokens / elapsedPhaseSec).toFixed(1);
            return `${tps} tps`;
        } else if (phase === 'answering') {
            const tokens = estimateTokens(streamedAnswer) - segmentStartTokens;
            const tps = (tokens / elapsedPhaseSec).toFixed(1);
            return `${tps} tps`;
        }
        return `${((now - reqStartTime) / 1000).toFixed(1)}s`;
    }

    function updateActiveTps() {
        const tpsText = getLiveStatusString();
        if (tpsText) {
            $('.chat-tps-badge.active-tps').text(tpsText);
            if (phase === 'thinking' && $currentThinkingBox) {
                $currentThinkingBox.find('.thinking-tps-badge').text(formatThinkingBadge(tpsText));
            }
        }
    }

    tpsInterval = setInterval(updateActiveTps, 100);

    // Show loading bot message with live status line & right-aligned timer / TPS
    const $botMsg = $(`
        <div class="chat-message bot loading">
            <div class="chat-status-line">
                <span class="chat-status-text">Thinking...</span>
                <span class="chat-tps-badge active-tps">0.0s</span>
            </div>
        </div>
    `);
    $messages.append($botMsg);
    scrollChatToUserMessageTop($messages, $userMsg);

    function ensureThinkingBox() {
        if (!$currentThinkingBox) {
            const isVisible = settings['toggle-show-thinking'];
            $currentThinkingBox = $(`
                <div class="chat-thinking-box"${isVisible ? '' : ' style="display: none;"'}>
                    <div class="thinking-header">
                        <span class="thinking-tps-badge">${formatThinkingBadge('')}</span>
                    </div>
                    <div class="thinking-content"></div>
                </div>
            `);
            $currentThinkingBox.insertBefore($botMsg);
        }
        return $currentThinkingBox;
    }

    function isThinkingAtBottom($box) {
        if (!$box || !$box.length) return true;
        const el = $box.find('.thinking-content')[0];
        if (!el) return true;
        if (el.scrollHeight <= el.clientHeight + 1) return true;
        const threshold = 24;
        return (el.scrollTop + el.clientHeight) >= (el.scrollHeight - threshold);
    }

    function scrollThinkingToBottom($box) {
        if (!$box || !$box.length) return;
        const el = $box.find('.thinking-content')[0];
        if (el) el.scrollTop = el.scrollHeight;
    }

    function ensureBotMeta() {
        if (!$botMeta) {
            $botMeta = $(`
                <div class="chat-status-line chat-message-meta">
                    <span class="chat-tps-badge active-tps"></span>
                </div>
            `);
            $botMeta.insertAfter($botMsg);
        }
        return $botMeta;
    }

    // Prepare conversation history (excluding the just-added user message) and truncate
    const historyToSend = truncateChatHistory(window.chatHistory.slice(0, -1));

    // Abort any previous streaming request
    if (window.currentChatController) {
        try { window.currentChatController.abort(); } catch (err) {}
        window.currentChatController = null;
    }
    if (window.currentEventSource) {
        try { window.currentEventSource.close(); } catch (err) {}
        window.currentEventSource = null;
    }

    const controller = new AbortController();
    window.currentChatController = controller;

    let finalAnswer = null;

    function handleChatData(data) {
        try {
            if (data.model) currentModel = data.model;
            if (data.provider) currentProvider = data.provider;

            // 1. Thinking delta or complete thinking block
            if (data.thinking_delta && !data.done) {
                if (phase !== 'thinking') {
                    phase = 'thinking';
                    phaseStartTime = performance.now();
                    $botMsg.find('.chat-status-text').text('Thinking...');
                    if (streamedThinking && !streamedThinking.endsWith('\n\n')) {
                        streamedThinking += (streamedThinking.endsWith('\n') ? '\n' : '\n\n');
                    }
                    segmentStartTokens = estimateTokens(streamedThinking);
                }
                streamedThinking += data.thinking_delta;

                ensureThinkingBox();
                var _autoScroll1 = isThinkingAtBottom($currentThinkingBox);
                $currentThinkingBox.find('.thinking-content').text(streamedThinking);
                if (_autoScroll1) scrollThinkingToBottom($currentThinkingBox);
                $currentThinkingBox.find('.thinking-tps-badge').text(formatThinkingBadge(getLiveStatusString()));
                updateActiveTps();
            } else if (data.thinking && !data.done) {
                if (!streamedThinking) {
                    streamedThinking = data.thinking;
                    ensureThinkingBox();
                    var _autoScroll2 = isThinkingAtBottom($currentThinkingBox);
                    $currentThinkingBox.find('.thinking-content').text(streamedThinking);
                    if (_autoScroll2) scrollThinkingToBottom($currentThinkingBox);
                    $currentThinkingBox.find('.thinking-tps-badge').text(formatThinkingBadge(getLiveStatusString()));
                }
            }

            // 2. Tool call progress notification
            if (data.progress && !data.done) {
                console.log(data);
                if (phase === 'thinking' && phaseStartTime) thinkActiveMs += performance.now() - phaseStartTime;
                phase = 'waiting';
                phaseStartTime = null;
                streamedAnswer = '';

                // Log function call in thinking element if a tool was executed
                if (data.tool_name) {
                    const toolTrace = `[Called ${data.tool_name}]`;
                    const lastLine = (streamedThinking || '').trimEnd().split('\n').pop() || '';
                    if (lastLine !== toolTrace) {
                        if (streamedThinking) {
                            const trimmed = streamedThinking.trimEnd();
                            streamedThinking = trimmed + (trimmed.endsWith(']') ? '\n' : '\n\n') + toolTrace + '\n';
                        } else {
                            streamedThinking = toolTrace + '\n';
                        }
                    }
                    ensureThinkingBox();
                    var _autoScroll3 = isThinkingAtBottom($currentThinkingBox);
                    $currentThinkingBox.find('.thinking-content').text(streamedThinking);
                    if (_autoScroll3) scrollThinkingToBottom($currentThinkingBox);
                    const thinkTokens = estimateTokens(streamedThinking);
                    $currentThinkingBox.find('.thinking-tps-badge').text(formatThinkingBadge(`${Number(thinkTokens).toLocaleString()} tokens`));
                } else if ($currentThinkingBox) {
                    const thinkTokens = estimateTokens(streamedThinking);
                    $currentThinkingBox.find('.thinking-tps-badge').text(formatThinkingBadge(`${Number(thinkTokens).toLocaleString()} tokens`));
                }

                // Remove pulse animation from previous thinking steps
                $('.chat-tps-badge.active-tps').removeClass('active-tps');
                $('.chat-message.bot.thinking.loading').removeClass('loading');
                if ($botMeta) {
                    $botMeta.remove();
                    $botMeta = null;
                }
                $botMsg.hide();

                const safeProgressText = $('<div>').text(data.progress).html();
                const $thinkingDiv = $(`
                    <div class="chat-message bot loading thinking">
                        <div class="chat-status-line">
                            <span class="chat-status-text">${safeProgressText}</span>
                            <span class="chat-tps-badge active-tps">${getLiveStatusString()}</span>
                        </div>
                    </div>
                `);
                $thinkingDiv.insertBefore($botMsg);
                if (chatAutoScrollSticky) {
                    smoothScrollChatToBottom($messages);
                } else {
                    $('.chat-scroll-bottom-btn').addClass('has-new');
                }
            }

            // 3. Streaming answer content delta
            if (data.delta && !data.done) {
                if (phase !== 'answering') {
                    // Finalize thinking header badge if it exists
                    if ($currentThinkingBox && (phase === 'thinking' || thinkActiveMs > 0)) {
                        if (phase === 'thinking' && phaseStartTime) thinkActiveMs += performance.now() - phaseStartTime;
                        const thinkSec = Math.max(0.1, thinkActiveMs / 1000).toFixed(1);
                        const thinkTokens = estimateTokens(streamedThinking);
                        const thinkTps = (thinkTokens / thinkSec).toFixed(1);
                        $currentThinkingBox.find('.thinking-tps-badge').text(formatThinkingBadge(`${thinkSec}s · ${thinkTps} tps`));
                    }
                    phase = 'answering';
                    phaseStartTime = performance.now();
                    segmentStartTokens = estimateTokens(streamedAnswer);
                    $('.chat-message.bot.thinking').slideUp();
                    $botMsg.show().removeClass('loading');
                    $botMsg.html('<div class="chat-message-content"></div>');
                    ensureBotMeta();
                }
                streamedAnswer += data.delta;
                $botMsg.find('.chat-message-content').html(colorRouteNames(parseMarkdown(streamedAnswer)));
                updateActiveTps();
                if (chatAutoScrollSticky) {
                    smoothScrollChatToBottom($messages);
                } else {
                    $('.chat-scroll-bottom-btn').addClass('has-new');
                }
            }

            // 4. Response complete
            else if (data.done) {
                responseDone = true;
                setChatInputEnabled(true);
                if (tpsInterval) {
                    clearInterval(tpsInterval);
                    tpsInterval = null;
                }
                $('.chat-tps-badge.active-tps').removeClass('active-tps');
                $('.chat-message.bot.thinking').slideUp();
                $botMsg.show().removeClass('loading');
                finalAnswer = data.answer || streamedAnswer || '';

                const thinkingToDisplay = (streamedThinking || data.thinking || '').trim();
                if (thinkingToDisplay) {
                    ensureThinkingBox();
                    var _autoScroll4 = isThinkingAtBottom($currentThinkingBox);
                    $currentThinkingBox.find('.thinking-content').text(thinkingToDisplay);
                    if (_autoScroll4) scrollThinkingToBottom($currentThinkingBox);
                    const thinkTokens = data.reasoning_tokens || estimateTokens(thinkingToDisplay);
                    $currentThinkingBox.find('.thinking-tps-badge').text(formatThinkingBadge(`${Number(thinkTokens).toLocaleString()} tokens`));
                }

                const rawText = finalAnswer;
                let responseError = null;
                if (!rawText && data.progress && data.progress.startsWith('Error:')) {
                    console.error('[Chat Error]', data.progress);
                    const errLower = data.progress.toLowerCase();
                    responseError = (errLower.includes('429') || errLower.includes('rate-limit') || errLower.includes('busy')) ? 'rate_limit' : 'provider_error';
                    if (errLower.includes('429') || errLower.includes('rate-limit') || errLower.includes('busy')) {
                        finalAnswer = 'Sorry, the assistant is temporarily busy due to high demand. Please try again in a moment.';
                    } else {
                        finalAnswer = 'Sorry, I encountered an issue processing your request. Please try again shortly.';
                    }
                } else if (rawText && rawText.startsWith('Error:')) {
                    console.error('[Chat Error]', rawText);
                    const errLower = rawText.toLowerCase();
                    responseError = (errLower.includes('429') || errLower.includes('rate-limit') || errLower.includes('busy')) ? 'rate_limit' : 'provider_error';
                    if (errLower.includes('429') || errLower.includes('rate-limit') || errLower.includes('busy')) {
                        finalAnswer = 'Sorry, the assistant is temporarily busy due to high demand. Please try again in a moment.';
                    } else {
                        finalAnswer = 'Sorry, I encountered an issue processing your request. Please try again shortly.';
                    }
                } else if (!rawText) {
                    responseError = 'empty_response';
                    finalAnswer = 'Sorry, I received an empty response.';
                } else {
                    finalAnswer = rawText.trim() || 'There was an issue formatting the response.';
                }

                const suggestions = Array.isArray(data.suggestions) ? data.suggestions : [];

                const answerDurationSec = (phaseStartTime && phase === 'answering')
                    ? Math.max(0.1, (performance.now() - phaseStartTime) / 1000)
                    : Math.max(0.1, (performance.now() - reqStartTime) / 1000);
                const totalAnswerTokens = data.completion_tokens || estimateTokens(finalAnswer);
                const finalAnswerTps = (totalAnswerTokens / answerDurationSec).toFixed(1);

                // Local-first: updates the device-local cumulative totals
                // synchronously, so the PostHog event below can carry the
                // up-to-date running total for this user.
                const chatSpend = recordChatTokenSpend(data, {
                    responseError: responseError,
                    model: currentModel,
                    provider: currentProvider,
                    answer: finalAnswer,
                    thinking: thinkingToDisplay,
                    question: msg
                });

                const chatCumulative = LocalStats.getChatTokenSpend();

                const chatPersonSet = {
                    chat_last_model: currentModel,
                    chat_last_provider: currentProvider,
                    chat_total_tokens: chatCumulative.totalTokens,
                    chat_total_messages: chatCumulative.totalMessages
                };

                capturePostHog('chat_response_received', {
                    success: !responseError,
                    error_type: responseError,
                    latency_ms: Math.round(performance.now() - reqStartTime),
                    answer_length: finalAnswer.length,
                    completion_tokens: (chatSpend && chatSpend.completion) || totalAnswerTokens,
                    reasoning_tokens: (chatSpend && chatSpend.reasoning) || (thinkingToDisplay ? estimateChatTokens(thinkingToDisplay) : 0),
                    prompt_tokens: (chatSpend && chatSpend.prompt) || estimateChatTokens(msg),
                    total_tokens: (chatSpend && chatSpend.total) || totalAnswerTokens,
                    chat_total_tokens: chatCumulative.totalTokens,
                    chat_total_messages: chatCumulative.totalMessages,
                    suggestions_count: suggestions.length,
                    model: currentModel,
                    provider: currentProvider,
                    campus: settings['campus'] || 'nb',
                    $set: chatPersonSet
                });

                console.log(finalAnswer);
                const processedAnswer = colorRouteNames(parseMarkdown(finalAnswer));
                $botMsg.html(`<div class="chat-message-content">${processedAnswer}</div>`).removeClass('loading');
                ensureBotMeta();
                $botMeta.find('.chat-tps-badge').removeClass('active-tps').text(`${finalAnswerTps} tps · ${answerDurationSec.toFixed(1)}s`);

                if (suggestions.length > 0) {
                    const $chipsContainer = $('<div class="chat-suggestions-container flex flex-wrap gap-0p5rem mt-1rem"></div>');
                    suggestions.forEach(question => {
                        const $chip = $('<button class="chat-suggestion-chip" type="button"></button>').text(question);
                        $chip.on('click', function() {
                            capturePostHog('chat_suggestion_clicked', {
                                model: currentModel,
                                provider: currentProvider,
                                campus: settings['campus'] || 'nb'
                            });
                            $('.chat-ui-input').val(question).data('is-example', true);
                            $('.chat-ui-input-bar').trigger('submit');
                            $chipsContainer.fadeOut(200, function() { $(this).remove(); });
                        });
                        $chipsContainer.append($chip);
                    });
                    $chipsContainer.insertAfter($botMeta);
                }

                window.chatHistory.push({ role: 'assistant', content: finalAnswer, thinking: thinkingToDisplay, model: currentModel, provider: currentProvider });
                window.currentChatController = null;
                if (chatAutoScrollSticky) {
                    smoothScrollChatToBottom($messages);
                } else {
                    $('.chat-scroll-bottom-btn').addClass('has-new');
                }
            }
        } catch (err) {
            console.error('Error handling chat data:', err, data);
        }
    }

    const isLocalDev = (typeof window !== 'undefined') && (
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname === '0.0.0.0'
    );

    async function sendChatRequest() {
        // Persistent anonymous uid (created in gui.js settings load) so the
        // backend can attribute chat logs per user without any login.
        let chatUid = null;
        try { chatUid = localStorage.getItem('uid'); } catch (e) { chatUid = null; }
        const payload = JSON.stringify({ user_query: msg, conversation_history: historyToSend, model: selectedModel, provider: selectedProvider, user_id: chatUid, session_id: window.chatSessionId || null });

        // 1. If on localhost, try the local backend first
        if (isLocalDev) {
            try {
                const localResp = await fetch('http://localhost:8000/chat/stream', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
                    body: payload,
                    signal: controller.signal
                });
                if (localResp.ok) {
                    return localResp;
                }
                console.warn('[Chat] Local backend returned status', localResp.status, '- falling back to talk.rubus.live');
            } catch (localErr) {
                if (localErr.name === 'AbortError') throw localErr;
                console.warn('[Chat] Local backend unavailable at localhost:8000, falling back to talk.rubus.live:', localErr.message);
            }
        }

        // 2. Production or fallback to talk.rubus.live
        const remoteEndpoint = 'https://talk.rubus.live/chat/stream';
        let remoteResp = await fetch(remoteEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
            body: payload,
            signal: controller.signal
        });

        // 3. If remote returns 405 Method Not Allowed or 501, fallback to GET
        if (remoteResp.status === 405 || remoteResp.status === 501) {
            const getUrl = `${remoteEndpoint}?user_query=${encodeURIComponent(msg)}&conversation_history=${encodeURIComponent(JSON.stringify(historyToSend))}&model=${encodeURIComponent(selectedModel)}&user_id=${encodeURIComponent(chatUid || '')}&session_id=${encodeURIComponent(window.chatSessionId || '')}`;
            remoteResp = await fetch(getUrl, {
                method: 'GET',
                headers: { 'Accept': 'text/event-stream' },
                signal: controller.signal
            });
        }

        if (!remoteResp.ok) throw new Error('HTTP ' + remoteResp.status);
        return remoteResp;
    }

    sendChatRequest().then(async (response) => {
        const contentType = response.headers.get('content-type') || '';
        // If server returns plain JSON (non-streaming fallback)
        if (contentType.includes('application/json') && !contentType.includes('text/event-stream')) {
            const data = await response.json();
            handleChatData(data.done !== undefined ? data : { done: true, answer: data.answer || data.response || JSON.stringify(data), progress: data.progress, model: data.model, provider: data.provider });
            if (!responseDone) throw new Error('Chat response ended without completion');
            return;
        }
        if (!response.body || !response.body.getReader) {
            // Fallback: read as text and try to parse
            const text = await response.text();
            text.split('\n').forEach(line => {
                const trimmed = line.trim();
                if (!trimmed) return;
                let jsonStr = trimmed;
                if (trimmed.startsWith('data:')) jsonStr = trimmed.slice(5).trim();
                if (jsonStr.startsWith('{')) {
                    try { handleChatData(JSON.parse(jsonStr)); } catch (e) {}
                }
            });
            if (!responseDone) throw new Error('Chat response ended without completion');
            return;
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let aborted = false;
        while (true) {
            let chunk;
            try {
                chunk = await reader.read();
            } catch (readErr) {
                if (readErr && (readErr.name === 'AbortError' || readErr.message?.includes('aborted'))) {
                    aborted = true;
                    break;
                }
                throw readErr;
            }
            const { done, value } = chunk;
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            // SSE events are delimited by \n\n
            let idx;
            while ((idx = buffer.indexOf('\n\n')) !== -1) {
                const rawEvent = buffer.slice(0, idx);
                buffer = buffer.slice(idx + 2);
                const lines = rawEvent.split('\n');
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed) continue;
                    let jsonStr = trimmed;
                    if (trimmed.startsWith('data:')) {
                        jsonStr = trimmed.slice(5).trim();
                        // Handle [DONE] sentinel
                        if (jsonStr === '[DONE]') continue;
                    }
                    if (!jsonStr.startsWith('{')) continue;
                    try {
                        const data = JSON.parse(jsonStr);
                        handleChatData(data);
                        if (data.done) {
                            try { reader.cancel(); } catch (e) {}
                            return;
                        }
                    } catch (err) {
                        console.error('Error parsing SSE JSON:', err, jsonStr);
                    }
                }
            }
        }
        // Flush any remaining buffered event
        if (buffer.trim()) {
            const lines = buffer.split('\n');
            for (const line of lines) {
                let jsonStr = line.trim();
                if (jsonStr.startsWith('data:')) jsonStr = jsonStr.slice(5).trim();
                if (jsonStr.startsWith('{')) {
                    try { handleChatData(JSON.parse(jsonStr)); } catch (e) {}
                }
            }
        }
        if (aborted) {
            window.currentChatController = null;
            setChatInputEnabled(true);
            return;
        }
        if (!responseDone) throw new Error('Chat response ended without completion');
    }).catch(err => {
        if (tpsInterval) {
            clearInterval(tpsInterval);
            tpsInterval = null;
        }
        setChatInputEnabled(true);
        if (err.name === 'AbortError') return;
        console.error('SSE error:', err);
        capturePostHog('chat_response_received', {
            success: false,
            error_type: 'network_error',
            latency_ms: Math.round(performance.now() - reqStartTime),
            model: currentModel,
            provider: currentProvider,
            campus: settings['campus'] || 'nb'
        });
        $botMsg.text('Sorry, there was a problem connecting to the chatbot.').removeClass('loading');
        if (chatAutoScrollSticky) {
            smoothScrollChatToBottom($messages);
        } else {
            $('.chat-scroll-bottom-btn').addClass('has-new');
        }
        window.currentChatController = null;
    });
});

$(document).ready(function() {
    const path = window.location.pathname.replace(/\/$/, ''); // Remove trailing slash
    const urlParams = new URLSearchParams(window.location.search);
    if (path === '/chat' || path.endsWith('/chat') || window.location.hash === '#chat' || urlParams.has('chat')) {
        $('.chat-btn').trigger('click');
    }
});