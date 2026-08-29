function updateSendButtonState() {
    if ($('.feedback-input').val().trim().length > 0) {
        $('.feedback-send-btn').removeClass('disabled');
    } else {
        $('.feedback-send-btn').addClass('disabled');
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

    if (feedback.length > 0) {
        if (typeof sa_event === 'function') {
            sa_event('btn_press', { btn: 'feedback_send_' + feedbackSource });
        }
        closeFeedbackModal();

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
    
        $.ajax({
            url: 'https://demo.rubus.live/feedback',
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify(payload),
            success: function (data) {
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
                console.error("Error sending feedback:", textStatus, errorThrown);
                if (typeof markRubusRequestsFailing === 'function') {
                    markRubusRequestsFailing();
                }
            }
        });
    } else {
        $('.empty-feedback').slideDown();
    }
}

$(document).ready(function() {
    updateSendButtonState();
    $('.feedback-input, .feedback-contact-input').on('input', function() {
        if ($('.feedback-input').val().length > 0) {
            $('.empty-feedback').slideUp('fast');
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
    
