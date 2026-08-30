const FEEDBACK_MAX_LEN = 2000;
const FEEDBACK_CONTACT_MAX_LEN = 200;
const FEEDBACK_RATE_LIMIT_MS = 30000;
const FEEDBACK_MIN_INTERVAL_MS = 1000;
let feedbackSending = false;

function getLastFeedbackTime() {
    try { return parseInt(localStorage.getItem('rubus_last_feedback_time') || '0', 10) || 0; } catch (e) { return 0; }
}
function setLastFeedbackTime(ts) {
    try { localStorage.setItem('rubus_last_feedback_time', String(ts)); } catch (e) {}
}

function updateSendButtonState() {
    const len = $('.feedback-input').val().trim().length;
    const overLimit = len > FEEDBACK_MAX_LEN;
    if (len > 0 && !overLimit && !feedbackSending) {
        $('.feedback-send-btn').removeClass('disabled');
    } else {
        $('.feedback-send-btn').addClass('disabled');
    }
    // Show inline hint if over limit
    if (overLimit) {
        $('.empty-feedback').text('Feedback too long (' + len + '/' + FEEDBACK_MAX_LEN + ' chars)').slideDown();
    } else if (len > 0) {
        $('.empty-feedback').slideUp('fast');
    }
}

function saveFeedbackDraft() {
    try {
        localStorage.setItem('rubus_feedback_draft', $('.feedback-input').val() || '');
        localStorage.setItem('rubus_feedback_contact_draft', $('.feedback-contact-input').val() || '');
    } catch (e) {}
}

function clearFeedbackDraft() {
    try {
        localStorage.removeItem('rubus_feedback_draft');
        localStorage.removeItem('rubus_feedback_contact_draft');
    } catch (e) {}
    $('.feedback-input').val('');
    $('.feedback-contact-input').val('');
    $('.feedback-contact-container').hide();
    $('.feedback-contact-toggle-wrapper').show();
    updateSendButtonState();
}

function restoreFeedbackDraft() {
    try {
        const savedFeedback = localStorage.getItem('rubus_feedback_draft');
        const savedContact = localStorage.getItem('rubus_feedback_contact_draft');

        if (savedFeedback !== null) {
            $('.feedback-input').val(savedFeedback);
        }
        if (savedContact) {
            $('.feedback-contact-input').val(savedContact);
            $('.feedback-contact-container').show();
            $('.feedback-contact-toggle-wrapper').hide();
        } else if (!$('.feedback-contact-input').val()) {
            $('.feedback-contact-container').hide();
            $('.feedback-contact-toggle-wrapper').show();
        }
    } catch (e) {
        if ($('.feedback-contact-input').val()) {
            $('.feedback-contact-container').show();
            $('.feedback-contact-toggle-wrapper').hide();
        } else {
            $('.feedback-contact-container').hide();
            $('.feedback-contact-toggle-wrapper').show();
        }
    }
    updateSendButtonState();
}

function openFeedbackModal(source = 'bus') {
    feedbackSource = source;
    if (source === 'general') {
        $('.feedback-title').text("Leave feedback");
        $('.feedback-subtext').text("About anything — features, bugs, or suggestions.");
    } else if (source === 'font') {
        $('.feedback-title').text("Suggest new font");
        $('.feedback-subtext').text("Or a typeface to add to RUBus.");
    } else if (source === 'theme') {
        $('.feedback-title').text("Suggest new theme");
        $('.feedback-subtext').text("Or a color palette to add to RUBus.");
    } else {
        $('.feedback-title').text("Leave feedback");
        const busNum = (typeof popupBusName !== 'undefined' && popupBusName) ? ((typeof busData !== 'undefined' && busData[popupBusName] && busData[popupBusName].busName) ? busData[popupBusName].busName : popupBusName) : null;
        if (busNum) {
            $('.feedback-subtext').text(`About bus ${busNum} or how RUBus is displaying it.`);
        } else {
            $('.feedback-subtext').text("About this bus or how RUBus is displaying it.");
        }
    }

    if (source === 'theme') {
        $('.feedback-input').attr('placeholder', "What colors do you like?");
    } else if (source === 'font') {
        $('.feedback-input').attr('placeholder', "What font style or typeface?");
    } else {
        $('.feedback-input').attr('placeholder', "What's on your mind?");
    }

    restoreFeedbackDraft();
    $('.empty-feedback').hide();
    $('.leave-feedback-wrapper').fadeIn('fast');
    if (typeof sa_event === 'function') {
        const btnMap = {
            'general': 'footer_feedback',
            'font': 'settings_font_suggest',
            'theme': 'settings_theme_suggest',
            'bus': 'bus_feedback'
        };
        sa_event('btn_press', { btn: btnMap[source] || 'feedback_open' });
    }
    if (source === 'bus') {
        $('.bottom').hide();
    }
}

function closeFeedbackModal() {
    saveFeedbackDraft();
    $('.leave-feedback-wrapper').hide();
    if (feedbackSource === 'bus') {
        $('.bottom').show();
    }
}

function sendFeedback() {
    const feedback = $('.feedback-input').val().trim();
    const contact = $('.feedback-contact-input').val().trim();

    if (feedbackSending) return;
    const now = Date.now();
    const last = getLastFeedbackTime();
    if (now - last < FEEDBACK_RATE_LIMIT_MS) {
        const waitSec = Math.ceil((FEEDBACK_RATE_LIMIT_MS - (now - last)) / 1000);
        $('.empty-feedback').text('Please wait ' + waitSec + 's before sending again.').slideDown();
        return;
    }
    if (now - last < FEEDBACK_MIN_INTERVAL_MS) {
        return;
    }

    if (feedback.length === 0) {
        $('.empty-feedback').text('Please enter feedback.').slideDown();
        return;
    }
    if (feedback.length > FEEDBACK_MAX_LEN) {
        $('.empty-feedback').text('Feedback too long (' + feedback.length + '/' + FEEDBACK_MAX_LEN + ' chars). Please shorten.').slideDown();
        return;
    }
    if (contact.length > FEEDBACK_CONTACT_MAX_LEN) {
        $('.empty-feedback').text('Contact info too long (' + contact.length + '/' + FEEDBACK_CONTACT_MAX_LEN + ' chars).').slideDown();
        return;
    }
    // Payload size guard (DoS)
    const payloadPreview = JSON.stringify({ feedback: feedback, contact: contact });
    if (payloadPreview.length > 10000) {
        $('.empty-feedback').text('Feedback payload too large.').slideDown();
        return;
    }

    if (typeof sa_event === 'function') {
        sa_event('btn_press', { btn: 'feedback_send_' + feedbackSource });
    }

    feedbackSending = true;
    updateSendButtonState();

    let busNameVal = "";
    let routeVal = "";

    if (feedbackSource === 'bus' && typeof popupBusName !== 'undefined' && popupBusName !== null) {
        busNameVal = String(popupBusName);
        if (typeof busData !== 'undefined' && busData[popupBusName] && busData[popupBusName].route) {
            routeVal = busData[popupBusName].route;
        }
    }

    const payload = {
        feedback: feedback,
        contact: contact || null,
        busName: busNameVal,
        route: routeVal,
        source: feedbackSource,
        timeSent: new Date().toISOString() 
    };

    // Close modal optimistically after validation to avoid double-send
    closeFeedbackModal();
    setLastFeedbackTime(now);

    $.ajax({
        url: 'https://demo.rubus.live/feedback',
        type: 'POST',
        contentType: 'application/json',
        headers: {
            'X-Requested-With': 'XMLHttpRequest'
        },
        data: JSON.stringify(payload),
        timeout: 10000,
        success: function (data) {
            feedbackSending = false;
            updateSendButtonState();
            clearFeedbackDraft();
            if (feedbackSource === 'font' || feedbackSource === 'theme') {
                $('.feedback-sent').html('<i class="fa-solid fa-circle-check mr-0p5rem"></i>Suggestion sent');
            } else {
                $('.feedback-sent').html('<i class="fa-solid fa-circle-check mr-0p5rem"></i>Feedback sent');
            }
            $('.feedback-sent').slideDown();

            setTimeout(() => {
                $('.feedback-sent').slideUp();
            }, 3000);
        },
        error: function(jqXHR, textStatus, errorThrown) {
            feedbackSending = false;
            updateSendButtonState();
            // Allow retry by rewinding rate-limit on network failure (not on 429)
            if (!jqXHR.status || jqXHR.status >= 500) {
                try { localStorage.removeItem('rubus_last_feedback_time'); } catch (e) {}
            }
            console.error("Error sending feedback:", textStatus, errorThrown);
            if (typeof markRubusRequestsFailing === 'function') {
                markRubusRequestsFailing();
            }
            $('.feedback-sent').html('<i class="fa-solid fa-triangle-exclamation mr-0p5rem"></i>Failed to send. Please try again.').slideDown();
            setTimeout(() => { $('.feedback-sent').slideUp(); }, 3000);
        }
    });
}

$(document).ready(function() {
    updateSendButtonState();
    $('.feedback-input, .feedback-contact-input').on('input', function() {
        const curLen = $('.feedback-input').val().trim().length;
        // Only auto-hide empty-feedback when not showing a validation error
        if (curLen > 0 && curLen <= FEEDBACK_MAX_LEN && $('.feedback-contact-input').val().trim().length <= FEEDBACK_CONTACT_MAX_LEN) {
            // Let updateSendButtonState decide if we should hide (it hides when len>0 and not over limit)
            // We pre-hide generic empty message but keep over-limit messages
            if (!$('.empty-feedback').text().includes('too long') && !$('.empty-feedback').text().includes('Please wait')) {
                $('.empty-feedback').slideUp('fast');
            }
        }
        updateSendButtonState();
        saveFeedbackDraft();
    });

    let mouseDownTarget = null;
    $('.feedback-outside').on('mousedown', function(e) {
        mouseDownTarget = e.target;
    });

    $('.feedback-outside').on('click', function(e) {
        if (e.target === this && mouseDownTarget === this) {
            closeFeedbackModal();
        }
    });
});
    
