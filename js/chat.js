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

// Show chat UI when chat button is clicked
$(document).on('click', '.chat-btn', function() {
  $('.chat-wrapper').removeClass('none').show();
//   adjustChatHeight();

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
                $botMsg.text(example.a).removeClass('loading');
                $messages.append($botMsg);
                window.chatHistory.push({ role: 'assistant', content: example.a });  // Add bot response to history
            }, 1333);
        }))
    })
    $('.chat-recs').scrollLeft(0);

});

// // Adjust chat height based on actual viewport
// function adjustChatHeight() {
//   const headerHeight = $('.chat-ui-header').outerHeight();
//   const inputBarHeight = $('.chat-ui-input-bar').outerHeight();
//   const availableHeight = window.innerHeight - headerHeight - inputBarHeight;
//   $('.chat-ui-messages').css('height', availableHeight + 'px');
// }

// // Adjust on window resize (including keyboard open/close)
// $(window).on('resize orientationchange', function() {
//   if ($('.chat-wrapper').is(':visible')) {
//     setTimeout(adjustChatHeight, 100); // Small delay to ensure layout is updated
//   }
// });

// Close chat UI
$(document).on('click', '.chat-ui-close', function() {
  $('.chat-wrapper').hide();
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

    evtSource.onmessage = function(event) {
        try {
            const data = JSON.parse(event.data);
            if (data.progress && !data.done) {
                // Show tool progress/description
                $botMsg.text(data.progress).addClass('loading');
            } else if (data.done) {
                // Show final answer
                $botMsg.text(data.answer).removeClass('loading');
                finalAnswer = data.answer;
                window.chatHistory.push({ role: 'assistant', content: data.answer });
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