// Show chat UI when chat button is clicked
$(document).on('click', '.chat-btn', function() {
  $('.chat-wrapper').removeClass('none').show();
  adjustChatHeight();
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
// Handle sending a message
$(document).on('submit', '.chat-ui-input-bar', function(e) {
  e.preventDefault();
  const $input = $(this).find('.chat-ui-input');
  const msg = $input.val().trim();
  if (!msg) return;
  const $messages = $('.chat-ui-messages');
  // Add user message to DOM and history
  $messages.append(`<div class="chat-message user">${$('<div>').text(msg).html()}</div>`);
  window.chatHistory.push({ role: 'user', content: msg });
  $input.val('');
  $messages.scrollTop($messages[0].scrollHeight);
  // Show loading bot message
  const $botMsg = $('<div class="chat-message bot loading">Thinking...</div>');
  $messages.append($botMsg);
  $messages.scrollTop($messages[0].scrollHeight);

  // Make POST request with updated history
  $.ajax({
    url: 'https://talk.rubus.live/chat',
    method: 'POST',
    contentType: 'application/json',
    data: JSON.stringify({ user_query: msg, conversation_history: window.chatHistory.slice(0, -1) }),  // Send history up to the last message
    success: function(data) {
      if (data && data.answer) {
        $botMsg.text(data.answer).removeClass('loading');
        window.chatHistory.push({ role: 'assistant', content: data.answer });  // Add bot response to history
      } else {
        $botMsg.text('Sorry, I did not understand that.').removeClass('loading');
      }
      $messages.scrollTop($messages[0].scrollHeight);
    },
    error: function(jqXHR, textStatus, errorThrown) {
      console.error('Chat request failed:', textStatus, errorThrown);
      $botMsg.text('Sorry, there was a problem connecting to the chatbot.').removeClass('loading');
      $messages.scrollTop($messages[0].scrollHeight);
    }
  });
});
