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
    'winter 1': 'winter1',
    'winter 2': 'winter2',
    'summer 1': 'summer1',
    'summer 2': 'summer2',
    'all campus': 'all',
    'overnight 1': 'on1',
    'overnight 2': 'on2',
};

function parseMarkdown(text) {
    if (!text) return '';
    let processed = text;
    
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

    processed = processed.replace(/^### (.*$)/gim, '<h3 style="margin: 1.5rem 0 0.5rem 0; font-size: 1.6rem; font-weight: 500;">$1</h3>');
    processed = processed.replace(/^## (.*$)/gim, '<h2 style="margin: 0.8rem 0 0.4rem 0; font-size: 1.8rem; font-weight: normal;">$1</h2>');
    processed = processed.replace(/^# (.*$)/gim, '<h1 style="margin: 1.0rem 0 0.5rem 0; font-size: 2.0rem; font-weight: normal;">$1</h1>');
    processed = processed.replace(/^---$/gim, '<hr style="border: 0; margin: 0.4rem 0; opacity: 0;">');
    
    // Strip newlines directly adjacent to block elements to prevent double line breaks
    processed = processed.replace(/\n?<(h[1-3]|hr)([^>]*)>\n?/gi, '<$1$2>');
    processed = processed.replace(/\n?<\/(h[1-3])>\n?/gi, '</$1>');
    
    processed = processed.replace(/\n\n+/g, '<div style="height: 0.6rem;"></div>');
    processed = processed.replace(/\*\*(.*?)\*\*/g, '$1');
    processed = processed.replace(/\*(.*?)\*/g, '<em>$1</em>');
    processed = processed.replace(/_(.*?)_/g, '<em>$1</em>');
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
    
    const stopNames = getAllStopNames();
    const escapedStops = stopNames.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const stopRegex = new RegExp(`(?<!\\w)(${escapedStops.join('|')})(?!\\w)`, 'gi');
    
    const readableKeys = Object.keys(readableRouteNames).sort((a, b) => b.length - a.length);
    const readableRegex = new RegExp(`\\b(${readableKeys.join('|')})\\b(?:\\s+(route\\b))?`, 'gi');
    
    const sorted = [...knownRoutes].sort((a, b) => b.length - a.length);
    const escaped = sorted.map(r => r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const routeRegex = new RegExp(`\\b(${escaped.join('|')})\\b(?:\\s+(route\\b))?`, 'gi');
    
    const colorLine = (line) => {
        return line.replace(/(^|>)([^<]*?)(?=<|$)/g, (match, before, content) => {
            if (!content) return match;
            
            let processed = content.replace(stopRegex, (name) => {
                return `<span style="color: #65acf2;">${name}</span>`;
            });
            
            processed = processed.replace(readableRegex, (matchStr, name) => {
                if (name === name.toLowerCase()) return matchStr;
                const key = readableRouteNames[name.toLowerCase()];
                const color = colorMappings[key];
                if (color) return `<strong style="color: ${color}">${matchStr}</strong>`;
                return matchStr;
            });
            
            processed = processed.replace(routeRegex, (matchStr, name, routeWord) => {
                if (name === name.toLowerCase()) return matchStr;
                if (name.toLowerCase() === 'all' && !routeWord) {
                    return matchStr;
                }
                const key = name.toLowerCase();
                const color = colorMappings[key];
                if (color) {
                    const uppercasedName = name.toUpperCase();
                    const newMatchStr = matchStr.replace(name, uppercasedName);
                    return `<strong style="color: ${color}">${newMatchStr}</strong>`;
                }
                return matchStr;
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

// Show chat UI when chat button is clicked
$(document).on('click', '.chat-btn', function() {
  $('.chat-wrapper').removeClass('none').show();
  attachChatViewportListeners();
  adjustChatHeights();

    const shuffled = [...exampleChats].sort(() => 0.5 - Math.random());
    shuffled.forEach(example => {
        $('.chat-recs').append($(`<div class="p-1rem br-1rem pointer" style="flex: 0 0 33vw; background-color: var(--theme-chat-recs-bg); color: var(--theme-chat-recs-text);">${example.q}</div>`).click(function() {
            $('.chat-recs').hide();
            const $messages = $('.chat-ui-messages');
            $messages.append(`<div class="chat-message user">${$('<div>').text(example.q).html()}</div>`);
            window.chatHistory.push({ role: 'user', content: example.q });
            const $botMsg = $('<div class="chat-message bot loading">Thinking...</div>');
            $messages.append($botMsg);
            setTimeout(() => {
                const processedExample = colorRouteNames(parseMarkdown(example.a));
                $botMsg.html(processedExample).removeClass('loading');
                $messages.append($botMsg);
                window.chatHistory.push({ role: 'assistant', content: example.a });  // Add bot response to history
            }, 1333);
        }))
    })
    $('.chat-recs').scrollLeft(0);
    $('.chat-ui-input').focus();
});

// Nudge layout when input gains focus (keyboard opening)
$(document).on('focus', '.chat-ui-input', function() {
  setTimeout(adjustChatHeights, 50);
  setTimeout(() => {
    const $messages = $('.chat-ui-messages');
    if ($messages.length > 0) {
      $messages.scrollTop($messages[0].scrollHeight);
    }
  }, 150);
});
$(document).on('blur', '.chat-ui-input', function() {
  setTimeout(adjustChatHeights, 50);
});

// Close chat UI
$(document).on('click', '.chat-ui-close', function() {
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
});
window.chatHistory = [];

$(document).on('submit', '.chat-ui-input-bar', function(e) {
    e.preventDefault();

    $('.chat-recs').hide();

    const $input = $(this).find('.chat-ui-input');
    const msg = $input.val().trim();
    if (!msg) return;
    const $messages = $('.chat-ui-messages');
    $messages.append(`<div class="chat-message user">${$('<div>').text(msg).html()}</div>`);
    window.chatHistory.push({ role: 'user', content: msg });
    $input.val('');
    $messages.scrollTop($messages[0].scrollHeight);

    // Show loading bot message
    const $botMsg = $('<div class="chat-message bot loading">Thinking...</div>');
    $messages.append($botMsg);
    $messages.scrollTop($messages[0].scrollHeight);

    // Prepare conversation history (excluding the just-added user message)
    const historyToSend = window.chatHistory.slice(0, -1);

    // Build SSE URL with query params
    const url = 'https://talk.rubus.live/chat/stream'
        + '?user_query=' + encodeURIComponent(msg)
        + '&conversation_history=' + encodeURIComponent(JSON.stringify(historyToSend));

    // Close any previous EventSource
    if (window.currentEventSource) {
        window.currentEventSource.close();
    }

    // Open SSE connection
    const evtSource = new EventSource(url);
    window.currentEventSource = evtSource;

    let finalAnswer = null;
    let toolCalls = [];

    evtSource.onmessage = function(event) {
        try {
            const data = JSON.parse(event.data);
            if (data.progress && !data.done) {
                // Show tool progress/description
                console.log(data);
                toolCalls.push(data.progress);
                const $thinkingDiv = $(`<div class="chat-message bot loading thinking">${data.progress}</div>`);
                $thinkingDiv.insertBefore($messages.children().last());
            } else if (data.done) {
                $('.chat-message.bot.loading.thinking').slideUp();
                // Show final answer
                finalAnswer = data.answer;
                if (settings['toggle-show-thinking']) {
                    // console.log(data.answer);
                    const $showEntireResponse = $('<div class="text-1p3rem pointer" style="color: #8181f1; margin-left: 1.3rem;">Show raw response & tools</div>').click(function() {
                        const $expandedInfo = $('<div class="expanded-raw-info" style="margin-left: 1.3rem;"></div>');
                        $expandedInfo.append(`<div class="text-1p3rem" style="white-space: pre-wrap; margin-top: 0.5rem; color: #aaa;">Response content: ${data.answer}</div>`);
                        if (toolCalls.length > 0) {
                            const $toolsList = $('<div class="text-1p3rem" style="color: #8181f1; margin-top: 0.5rem;">Tools called:</div>');
                            const $ul = $('<ul style="margin: 0.25rem 0 0 0; padding-left: 1.5rem;"></ul>');
                            toolCalls.forEach(tool => {
                                $ul.append(`<li style="color: #aaa;">${tool}</li>`);
                            });
                            $toolsList.append($ul);
                            $expandedInfo.append($toolsList);
                        }
                        $expandedInfo.insertAfter($(this));
                        $(this).remove();
                        $messages.scrollTop($messages[0].scrollHeight);
                    });
                    $messages.append($showEntireResponse);
                } 

                // Extract text after assistantFinal
                let match = null;
                if (data.answer) {
                    match = data.answer.match(/assistantfinal([\s\S]*)/i);
                    if (!match) {
                        // Look for tag format: "final:" or "<final>" or "/final" at the start, or preceded by a newline/whitespace
                        const tagMatch = data.answer.match(/(?:^|[\r\n])(?:<final>|final[:\s\-\]\|])([\s\S]*)$/i);
                        if (tagMatch) {
                            match = [null, tagMatch[1]];
                        }
                    }
                }
                if (!data.answer) {
                    console.error("Backend returned null answer. Progress/Error status:", data.progress);
                }
                if (match) {
                    finalAnswer = match[1].trim();
                } else {
                    if (!data.answer && data.progress && data.progress.startsWith('Error:')) {
                        finalAnswer = data.progress;
                    } else {
                        finalAnswer = data.answer || 'There was an issue formatting the response.';
                    }
                }
                    
                
                // Extract suggestions from finalAnswer
                let suggestions = [];
                const suggestionsMatch = finalAnswer.match(/<suggestions>([\s\S]*?)<\/suggestions>/i);
                if (suggestionsMatch) {
                    suggestions = suggestionsMatch[1].split('\n')
                        .map(line => line.replace(/^[•\-\*\s]+/, '').trim())
                        .filter(text => text.length > 0);
                    // Strip the suggestions section from the final output
                    finalAnswer = finalAnswer.replace(/<suggestions>[\s\S]*?<\/suggestions>/i, '').trim();
                }

                console.log(finalAnswer);
                const processedAnswer = colorRouteNames(parseMarkdown(finalAnswer));
                $botMsg.html(processedAnswer).removeClass('loading');

                if (suggestions.length > 0) {
                    const $chipsContainer = $('<div class="chat-suggestions-container flex flex-wrap gap-0p5rem mt-1rem"></div>');
                    suggestions.forEach(question => {
                        const $chip = $(`<button class="chat-suggestion-chip" type="button">${question}</button>`);
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
                evtSource.close();
            }
            $messages.scrollTop($messages[0].scrollHeight);
        } catch (err) {
            console.error('Error parsing SSE data:', err, event.data);
        }
    };

    evtSource.onerror = function(err) {
        console.error('SSE error:', err);
        $botMsg.text('Sorry, there was a problem connecting to the chatbot.').removeClass('loading');
        $messages.scrollTop($messages[0].scrollHeight);
        evtSource.close();
    };
});