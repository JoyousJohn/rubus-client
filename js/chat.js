const exampleChats = [
    {
        'q': 'Where does the LX stop?',
        'a': 'The LX route stops at the College Avenue Student Center, The Yard, Student Activities Center, Livingston Plaza, Livingston Student Center, and Quads.'
    }, {
        'q': 'How do I get from The Yard to SoCam South?',
        'a': 'To get from The Yard to SoCam Apts (SB), you can take the EE route, which stops at both The Yard and SoCam Apts (SB).'
    }, {
        'q': 'When does the H start running?',
        'a': 'The H route starts running at 7:00 AM.'
    }, {
        'q': 'What do I do if I need to get somewhere late at night after buses stopped running?',
        'a': 'You can use the Knight Mover on-demand late-night service, which operates from 3:00 AM to 7:00 AM, Monday through Thursday. You can call them at 732-932-RIDE (7433), but be aware that they stop accepting calls at 5:45 AM.'
    }, {
        'q': 'How do I get from Busch to Cook if the REXB alreaddy stopped running?',
        'a': 'If the REXB route has already stopped running, you can take the A or H route from Busch to College Avenue, then transfer to the EE or F route to get to Cook.'
    }, {
        'q': 'How does the EE differ from the F?',
        'a': 'The EE route differs from the F route in that it also stops at SoCam Apts in downtown New Brunswick, whereas the F route does not. Additionally, the EE route stops at more locations on the Cook campus, including Red Oak Lane, Lipman Hall, Biel Road, Henderson, and Gibbons, whereas the F route only stops at College Hall and Lipman Hall.'
    }, {
        'q': 'Do I need a pass or ticket to ride the bus?',
        'a': 'No, you do not need a pass or ticket to ride the Rutgers buses. The buses are completely free for all Rutgers students, so you can just board the bus without needing any kind of payment or pass.'
    }, {
        'q': 'What are the peak hours for bus service?',
        'a': 'The peak hours for bus service are typically 8:00-10:00 AM and 4:00-7:00 PM, when buses are busiest and you can expect crowds and possible overflows. During these times, buses usually come every 5-10 minutes.'
    }, {
        'q': 'How do I get from one campus to another?',
        'a': 'To get from one campus to another, you can take a Rutgers bus. The specific route you take will depend on which campuses you are traveling between. For example, to get from College Avenue to Busch, you can take the A or H route. To get from College Avenue to Livingston, you can take the LX route. To get from Busch to Livingston, you can take the B route. To get from College Ave to Cook or Douglass, you can take the EE or F route. If you are not sure which route to take, I can help you figure it out. Which campuses are you trying to travel between?'
    }, {
        'q': 'What routes connect the different campuses?',
        'a': 'The A and H routes connect College Avenue to Busch, the LX route connects College Avenue to Livingston, the B route connects Busch to Livingston, and the EE and F routes connect College Avenue to Cook/Douglass, while the REXB and REXL routes provide additional connections between Busch, Livingston, and Cook/Douglass campuses.'
    }, {
        'q': 'What are the event shuttles and when are they used?',
        'a': 'The event shuttles are special buses that are provided for big events, such as commencement and football games. They are used to transport students and attendees to and from these events. For example, during football games, special football shuttles are available, starting a few hours before the game and running until at least 2 hours after the game.'
    }, {
        'q': 'What is RUBus.live?',
        'a': 'RUBus.live is the leading bus tracking application for the Rutgers University bus network in accuracy. It features extremely precise ETAs, many UI options to view bus data, and provides a better user experience than the Passio GO! app.'
    }
]

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
    const routeRegex = new RegExp(`\\b(${escaped.join('|')})\\b(?:\\s+(route\\b))?`, 'gi');
    
    const colorLine = (line) => {
        return line.replace(/(^|>)([^<]*?)(?=<|$)/g, (match, before, content) => {
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
  const availableHeight = Math.max(0, viewportHeightPx - headerHeight - inputBarHeight);
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
  chatVvpHandler = () => requestAnimationFrame(adjustChatHeights);
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
    const baseMsg = 'Ask me complex questions about bus routes, schedules, navigation, and more.';
    let busCount = 0;
    let routeCount = 0;
    if (typeof busesByRoutes !== 'undefined' && typeof selectedCampus !== 'undefined' && busesByRoutes[selectedCampus]) {
        for (const route in busesByRoutes[selectedCampus]) {
            const buses = busesByRoutes[selectedCampus][route] || [];
            const validBuses = buses.filter(b => {
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
    
    const $firstBotMsg = $('.chat-ui-messages .chat-message.bot').first();
    if ($firstBotMsg.length) {
        $firstBotMsg.text(text);
    }
}

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

// Show chat UI when chat button is clicked
$(document).on('click', '.chat-btn', function() {
  $('.chat-wrapper').removeClass('none').show();
  attachChatViewportListeners();
  adjustChatHeights();
  updateChatInitialMessage();

    // Clear previous recommendations to prevent unbounded DOM growth
    $('.chat-recs').empty();
    const shuffled = [...exampleChats].sort(() => 0.5 - Math.random());
    shuffled.forEach(example => {
        const $rec = $('<div class="p-1rem br-1rem pointer" style="background-color: var(--theme-chat-recs-bg); color: var(--theme-chat-recs-text);"></div>').text(example.q);
        $('.chat-recs').append($rec.click(function() {
            $('.chat-recs').hide();
            const $messages = $('.chat-ui-messages');
            const $userMsg = $(`<div class="chat-message user">${$('<div>').text(example.q).html()}</div>`);
            $messages.append($userMsg);
            window.chatHistory.push({ role: 'user', content: example.q });
            const $botMsg = $('<div class="chat-message bot loading">Thinking...</div>');
            $messages.append($botMsg);
            scrollChatToBottom($messages, false);
            setTimeout(() => {
                const processedExample = colorRouteNames(parseMarkdown(example.a));
                $botMsg.html(processedExample).removeClass('loading');
                $messages.append($botMsg);
                window.chatHistory.push({ role: 'assistant', content: example.a });  // Add bot response to history
                scrollChatToTurnTopOrBottom($messages, $userMsg, false);
            }, 1333);
        }))
    })
    $('.chat-recs').scrollLeft(0);
    $('.chat-ui-input').focus();
});

let isUserTouchingChat = false;

$(document).on('touchstart pointerdown', '.chat-ui-messages', function(e) {
  if (e.pointerType && e.pointerType === 'mouse' && e.button !== 0) return;
  isUserTouchingChat = true;
});

$(document).on('touchend touchcancel pointerup pointercancel', function() {
  isUserTouchingChat = false;
});

function scrollChatToBottom($messages, force = false) {
  if (!$messages || !$messages.length) return;
  if (!force && isUserTouchingChat) {
    return; // Maintain user's scroll location while finger/pointer is actively on screen
  }
  $messages.scrollTop($messages[0].scrollHeight);
}

function scrollChatToTurnTopOrBottom($messages, $userMsg, force = false) {
  if (!$messages || !$messages.length) return;
  if (!force && isUserTouchingChat) {
    return; // Maintain user's scroll location while finger/pointer is actively on screen
  }
  const el = $messages[0];
  const userMsgTop = ($userMsg && $userMsg.length && $userMsg[0]) ? $userMsg[0].offsetTop : 0;
  const totalTurnHeight = el.scrollHeight - userMsgTop;
  const visibleHeight = el.clientHeight;

  if (totalTurnHeight > visibleHeight) {
    // If the response exceeds available wrapper height, position user's query near the top
    $messages.scrollTop(Math.max(0, userMsgTop - 8));
  } else {
    // If it fits inside the wrapper, scroll to bottom so the full exchange is in view
    $messages.scrollTop(el.scrollHeight);
  }
}

// Nudge layout when input gains focus (keyboard opening)
// Height adjustment is handled by visualViewport.resize listener; focus handler just scrolls to bottom
$(document).on('focus', '.chat-ui-input', function() {
  setTimeout(() => {
    const $messages = $('.chat-ui-messages');
    if ($messages.length > 0) {
      scrollChatToBottom($messages, true);
    }
  }, 150);
});
$(document).on('blur', '.chat-ui-input', function() {
  setTimeout(adjustChatHeights, 50);
});

function closeChat() {
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

$(document).on('submit', '.chat-ui-input-bar', function(e) {
    e.preventDefault();

    $('.chat-recs').hide();

    const $input = $(this).find('.chat-ui-input');
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
    $input.val('');
    scrollChatToBottom($messages, true);

    const reqStartTime = performance.now();
    let totalEstimatedTokens = 0;
    let tpsInterval = null;

    function estimateTokens(text) {
        if (!text) return 0;
        return Math.max(1, Math.ceil(text.length / 3.8));
    }

    function getLiveTpsString() {
        const elapsedSec = (performance.now() - reqStartTime) / 1000;
        if (totalEstimatedTokens === 0) {
            return `${elapsedSec.toFixed(1)}s`;
        }
        if (elapsedSec < 0.15) return '';
        const tps = (totalEstimatedTokens / elapsedSec).toFixed(1);
        return `${tps} tps`;
    }

    function updateActiveTps() {
        const tpsText = getLiveTpsString();
        if (tpsText) {
            $('.chat-tps-badge.active-tps').text(tpsText);
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
    scrollChatToBottom($messages, false);

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
    let toolCalls = [];
    let streamedThinking = '';
    let $currentThinkingBox = null;

    function handleChatData(data) {
        try {
            if (data.thinking) {
                totalEstimatedTokens += estimateTokens(data.thinking);
                streamedThinking = (streamedThinking ? streamedThinking + '\n\n' : '') + data.thinking;
                updateActiveTps();
                if (settings['toggle-show-thinking']) {
                    if (!$currentThinkingBox) {
                        $currentThinkingBox = $(`
                            <div class="chat-thinking-box">
                                <div class="thinking-header"><i class="fa-solid fa-brain"></i> Thought Process <span class="thinking-toggle" style="font-size: 1rem; margin-left: 0.5rem; opacity: 0.7;">▼</span></div>
                                <div class="thinking-content"></div>
                            </div>
                        `);
                        $currentThinkingBox.find('.thinking-header').click(function() {
                            const $content = $(this).siblings('.thinking-content');
                            const isVis = $content.is(':visible');
                            $content.slideToggle(150);
                            $(this).find('.thinking-toggle').text(isVis ? '▶' : '▼');
                        });
                        $currentThinkingBox.insertBefore($botMsg);
                    }
                    $currentThinkingBox.find('.thinking-content').text(streamedThinking);
                    scrollChatToBottom($messages, false);
                }
            }

            if (data.progress && !data.done) {
                console.log(data);
                totalEstimatedTokens += estimateTokens(data.progress);
                toolCalls.push(data.progress);
                // Remove pulse animation from previous thinking steps
                $('.chat-tps-badge.active-tps').removeClass('active-tps');
                $('.chat-message.bot.thinking.loading').removeClass('loading');
                $botMsg.hide();
                const safeProgressText = $('<div>').text(data.progress).html();
                const $thinkingDiv = $(`
                    <div class="chat-message bot loading thinking">
                        <div class="chat-status-line">
                            <span class="chat-status-text">${safeProgressText}</span>
                            <span class="chat-tps-badge active-tps">${getLiveTpsString()}</span>
                        </div>
                    </div>
                `);
                $thinkingDiv.insertBefore($botMsg);
            } else if (data.done) {
                if (tpsInterval) {
                    clearInterval(tpsInterval);
                    tpsInterval = null;
                }
                if (data.answer) {
                    totalEstimatedTokens += estimateTokens(data.answer);
                }
                $('.chat-tps-badge.active-tps').removeClass('active-tps');
                $('.chat-message.bot.thinking').slideUp();
                $botMsg.show();
                finalAnswer = data.answer;

                const thinkingToDisplay = data.thinking || streamedThinking;
                if (settings['toggle-show-thinking'] && thinkingToDisplay && !$currentThinkingBox) {
                    $currentThinkingBox = $(`
                        <div class="chat-thinking-box">
                            <div class="thinking-header"><i class="fa-solid fa-brain"></i> Thought Process <span class="thinking-toggle" style="font-size: 1rem; margin-left: 0.5rem; opacity: 0.7;">▼</span></div>
                            <div class="thinking-content"></div>
                        </div>
                    `);
                    $currentThinkingBox.find('.thinking-header').click(function() {
                        const $content = $(this).siblings('.thinking-content');
                        const isVis = $content.is(':visible');
                        $content.slideToggle(150);
                        $(this).find('.thinking-toggle').text(isVis ? '▶' : '▼');
                    });
                    $currentThinkingBox.find('.thinking-content').text(thinkingToDisplay);
                    $currentThinkingBox.insertBefore($botMsg);
                }

                if (settings['toggle-show-thinking'] && toolCalls.length > 0) {
                    const $showEntireResponse = $('<div class="text-1p3rem pointer" style="color: #8181f1; margin-left: 1.3rem;">Show raw response & tools</div>').click(function() {
                        const $expandedInfo = $('<div class="expanded-raw-info" style="margin-left: 1.3rem;"></div>');
                        const $respDiv = $('<div class="text-1p3rem" style="white-space: pre-wrap; margin-top: 0.5rem; color: #aaa;"></div>').text('Response content: ' + data.answer);
                        $expandedInfo.append($respDiv);
                        if (toolCalls.length > 0) {
                            const $toolsList = $('<div class="text-1p3rem" style="color: #8181f1; margin-top: 0.5rem;">Tools called:</div>');
                            const $ul = $('<ul style="margin: 0.25rem 0 0 0; padding-left: 1.5rem;"></ul>');
                            toolCalls.forEach(tool => {
                                const $li = $('<li style="color: #aaa;"></li>').text(tool);
                                $ul.append($li);
                            });
                            $toolsList.append($ul);
                            $expandedInfo.append($toolsList);
                        }
                        $expandedInfo.insertAfter($(this));
                        $(this).remove();
                        scrollChatToBottom($messages, false);
                    });
                    $messages.append($showEntireResponse);
                }

                let rawText = data.answer || '';
                if (!rawText && data.progress && data.progress.startsWith('Error:')) {
                    console.error('[Chat Error]', data.progress);
                    const errLower = data.progress.toLowerCase();
                    if (errLower.includes('429') || errLower.includes('rate-limit') || errLower.includes('busy')) {
                        finalAnswer = 'Sorry, the assistant is temporarily busy due to high demand. Please try again in a moment.';
                    } else {
                        finalAnswer = 'Sorry, I encountered an issue processing your request. Please try again shortly.';
                    }
                } else if (rawText && rawText.startsWith('Error:')) {
                    console.error('[Chat Error]', rawText);
                    const errLower = rawText.toLowerCase();
                    if (errLower.includes('429') || errLower.includes('rate-limit') || errLower.includes('busy')) {
                        finalAnswer = 'Sorry, the assistant is temporarily busy due to high demand. Please try again in a moment.';
                    } else {
                        finalAnswer = 'Sorry, I encountered an issue processing your request. Please try again shortly.';
                    }
                } else if (!rawText) {
                    finalAnswer = 'Sorry, I received an empty response.';
                } else {
                    const channelFinalMatch = rawText.match(/(?:<\|channel\|>final<\|message\|>|assistantfinal|assistant:\s*final|<final>)([\s\S]*)/i);
                    if (channelFinalMatch) {
                        rawText = channelFinalMatch[1];
                    } else {
                        rawText = rawText.replace(/<\|channel\|>analysis<\|message\|>[\s\S]*?<\|end\|>/gi, '');
                        rawText = rawText.replace(/<\|channel\|>[^<]+<\|message\|>/gi, '');
                        rawText = rawText.replace(/<\|start\|>assistant/gi, '');
                        rawText = rawText.replace(/<\|end\|>/gi, '');
                        rawText = rawText.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '');
                        rawText = rawText.replace(/<analysis>[\s\S]*?<\/analysis>/gi, '');
                        rawText = rawText.replace(/<thought>[\s\S]*?<\/thought>/gi, '');
                    }
                    rawText = rawText.replace(/<\|[^>]+>/g, '');
                    finalAnswer = rawText.trim() || 'There was an issue formatting the response.';
                }

                let suggestions = [];
                const suggestionsMatch = finalAnswer.match(/<suggestions>([\s\S]*?)<\/suggestions>/i);
                if (suggestionsMatch) {
                    suggestions = suggestionsMatch[1].split('\n')
                        .map(line => line.replace(/^[•\-\*\s]+/, '').trim())
                        .filter(text => text.length > 0);
                    finalAnswer = finalAnswer.replace(/<suggestions>[\s\S]*?<\/suggestions>/i, '').trim();
                }

                console.log(finalAnswer);
                const processedAnswer = colorRouteNames(parseMarkdown(finalAnswer));
                $botMsg.html(processedAnswer).removeClass('loading');

                if (suggestions.length > 0) {
                    const $chipsContainer = $('<div class="chat-suggestions-container flex flex-wrap gap-0p5rem mt-1rem"></div>');
                    suggestions.forEach(question => {
                        const $chip = $('<button class="chat-suggestion-chip" type="button"></button>').text(question);
                        $chip.on('click', function() {
                            $('.chat-ui-input').val(question);
                            $('.chat-ui-input-bar').trigger('submit');
                            $chipsContainer.fadeOut(200, function() { $(this).remove(); });
                        });
                        $chipsContainer.append($chip);
                    });
                    $chipsContainer.insertAfter($botMsg);
                }

                window.chatHistory.push({ role: 'assistant', content: finalAnswer });
                window.currentChatController = null;
                scrollChatToTurnTopOrBottom($messages, $userMsg, false);
            } else {
                scrollChatToBottom($messages, false);
            }
        } catch (err) {
            console.error('Error handling chat data:', err, data);
        }
    }

    const selectedModel = (typeof settings !== 'undefined' && settings['chatbot-model']) || 'ling';
    const selectedProvider = (typeof settings !== 'undefined' && settings['chatbot-provider']) || 'auto';
    const isLocalDev = (typeof window !== 'undefined') && (
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname === '0.0.0.0'
    );

    async function sendChatRequest() {
        const payload = JSON.stringify({ user_query: msg, conversation_history: historyToSend, model: selectedModel, provider: selectedProvider });

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
            const getUrl = `${remoteEndpoint}?user_query=${encodeURIComponent(msg)}&conversation_history=${encodeURIComponent(JSON.stringify(historyToSend))}&model=${encodeURIComponent(selectedModel)}`;
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
            handleChatData(data.done !== undefined ? data : { done: true, answer: data.answer || data.response || JSON.stringify(data), progress: data.progress });
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
            return;
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
            let chunk;
            try {
                chunk = await reader.read();
            } catch (readErr) {
                if (readErr && (readErr.name === 'AbortError' || readErr.message?.includes('aborted'))) {
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
    }).catch(err => {
        if (tpsInterval) {
            clearInterval(tpsInterval);
            tpsInterval = null;
        }
        if (err.name === 'AbortError') return;
        console.error('SSE error:', err);
        $botMsg.text('Sorry, there was a problem connecting to the chatbot.').removeClass('loading');
        $messages.scrollTop($messages[0].scrollHeight);
        window.currentChatController = null;
    });
});

$(document).ready(function() {
    const path = window.location.pathname.replace(/\/$/, ''); // Remove trailing slash
    const urlParams = new URLSearchParams(window.location.search);
    if (path === '/chat' || path.endsWith('/chat') || window.location.hash === '#chat' || urlParams.has('chat')) {
        // Wait slightly to ensure everything is initialized, then open the chat UI
        setTimeout(() => {
            $('.chat-btn').trigger('click');
        }, 100);
    }
});