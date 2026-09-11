const FEEDBACK_MAX_LEN = 2000;
const FEEDBACK_CONTACT_MAX_LEN = 200;
const FEEDBACK_RATE_LIMIT_MS = 30000;
const FEEDBACK_MIN_INTERVAL_MS = 1000;
let feedbackSending = false;
let feedbackSource = 'bus';
let feedbackMissingLocationQuery = null;

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

function getFeedbackDraftKey(source = feedbackSource) {
    return source || 'general';
}

function saveFeedbackDraft(source = feedbackSource) {
    const key = getFeedbackDraftKey(source);
    try {
        const raw = localStorage.getItem('rubus_feedback_drafts_by_modal');
        const drafts = raw ? JSON.parse(raw) : {};
        drafts[key] = {
            feedback: $('.feedback-input').val() || '',
            contact: $('.feedback-contact-input').val() || '',
            tripshot: $('.feedback-dest-tripshot').is(':checked'),
            query: (source === 'missing_location') ? feedbackMissingLocationQuery : null
        };
        localStorage.setItem('rubus_feedback_drafts_by_modal', JSON.stringify(drafts));
    } catch (e) {}
}

function clearFeedbackDraft(source = feedbackSource) {
    const key = getFeedbackDraftKey(source);
    try {
        const raw = localStorage.getItem('rubus_feedback_drafts_by_modal');
        if (raw) {
            const drafts = JSON.parse(raw);
            delete drafts[key];
            localStorage.setItem('rubus_feedback_drafts_by_modal', JSON.stringify(drafts));
        }
        localStorage.removeItem('rubus_feedback_draft');
        localStorage.removeItem('rubus_feedback_contact_draft');
        localStorage.removeItem('rubus_feedback_tripshot_draft');
    } catch (e) {}
    if (source === 'missing_location') {
        feedbackMissingLocationQuery = null;
    }
    $('.feedback-input').val('');
    $('.feedback-contact-input').val('');
    $('.feedback-contact-container').hide();
    $('.feedback-contact-toggle-wrapper').show();
    $('.feedback-dest-rubus').prop('checked', true);
    $('.feedback-dest-tripshot').prop('checked', false);
    $('.feedback-dest-tag').hide();
    updateSendButtonState();
}

function restoreFeedbackDraft(source = feedbackSource) {
    const key = getFeedbackDraftKey(source);
    let draft = null;
    try {
        const raw = localStorage.getItem('rubus_feedback_drafts_by_modal');
        if (raw) {
            const drafts = JSON.parse(raw);
            draft = drafts[key] || null;
        }

        // Backward compatibility with legacy unsplit drafts
        if (!draft && !raw) {
            const legacyFeedback = localStorage.getItem('rubus_feedback_draft');
            const legacyContact = localStorage.getItem('rubus_feedback_contact_draft');
            const legacyTripshot = localStorage.getItem('rubus_feedback_tripshot_draft');
            if (legacyFeedback !== null) {
                draft = {
                    feedback: legacyFeedback,
                    contact: legacyContact || '',
                    tripshot: legacyTripshot === '1'
                };
            }
        }
    } catch (e) {}

    if (draft && source === 'missing_location' && draft.query && !feedbackMissingLocationQuery) {
        feedbackMissingLocationQuery = draft.query;
    }

    if (draft) {
        $('.feedback-input').val(draft.feedback || '');
        if (draft.contact) {
            $('.feedback-contact-input').val(draft.contact);
            $('.feedback-contact-container').show();
            $('.feedback-contact-toggle-wrapper').hide();
        } else {
            $('.feedback-contact-input').val('');
            $('.feedback-contact-container').hide();
            $('.feedback-contact-toggle-wrapper').show();
        }
        $('.feedback-dest-rubus').prop('checked', true);
        $('.feedback-dest-tripshot').prop('checked', Boolean(draft.tripshot));
    } else {
        $('.feedback-input').val('');
        $('.feedback-contact-input').val('');
        $('.feedback-contact-container').hide();
        $('.feedback-contact-toggle-wrapper').show();
        $('.feedback-dest-rubus').prop('checked', true);
        $('.feedback-dest-tripshot').prop('checked', false);
    }
    $('.feedback-dest-tag').hide();
    updateSendButtonState();
}

function openFeedbackModal(source = 'bus', options = {}) {
    if (typeof options === 'string') {
        options = { query: options };
    }
    feedbackSource = source;
    if (source === 'missing_location') {
        const q = (options && typeof options.query === 'string') ? options.query : '';
        feedbackMissingLocationQuery = q.trim();
    } else {
        feedbackMissingLocationQuery = null;
    }

    if (source === 'direct') {
        $('.feedback-title').text("Leave feedback");
        $('.feedback-subtext').text("Suggestions, bug reports, comments, complaints, or anything about RUBus or the buses.");
    } else if (source === 'general') {
        $('.feedback-title').text("Leave feedback");
        $('.feedback-subtext').text("About anything — features, bugs, or suggestions.");
    } else if (source === 'font') {
        $('.feedback-title').text("Suggest new font");
        $('.feedback-subtext').text("Or a typeface to add to RUBus.");
    } else if (source === 'theme') {
        $('.feedback-title').text("Suggest new theme");
        $('.feedback-subtext').text("Or a color palette to add to RUBus.");
    } else if (source === 'missing_location') {
        $('.feedback-title').text("Report missing location");
        $('.feedback-subtext').text("Tell us what place or building is missing from navigation.");
    } else {
        $('.feedback-title').text("Leave feedback");
        const busNum = popupBusName ? ((busData[popupBusName] && busData[popupBusName].busName) ? busData[popupBusName].busName : popupBusName) : null;
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
    } else if (source === 'missing_location') {
        $('.feedback-input').attr('placeholder', "What location is missing?");
    } else {
        $('.feedback-input').attr('placeholder', "What's on your mind?");
    }

    if (source === 'direct') {
        $('.feedback-contact-input').attr('placeholder', "Email, Insta @, Reddut u/, etc. (optional)");
        $('.feedback-destinations').show();
    } else {
        $('.feedback-contact-input').attr('placeholder', "Insta @, Reddit u/, email, etc. (optional)");
        $('.feedback-destinations').hide();
    }

    const $hideBtn = $('.feedback-hide-direct-btn');
    if (source === 'direct') {
        if (settings['toggle-hide-direct-feedback']) {
            $hideBtn
                .text('Hidden from map')
                .removeClass('is-confirming')
                .addClass('is-hidden')
                .show();
        } else {
            $hideBtn
                .text('Hide Direct Feedback Button From Map')
                .removeClass('is-confirming is-hidden')
                .show();
        }
    } else {
        $hideBtn.hide();
    }

    markPanelOpened('feedback');
    restoreFeedbackDraft(source);
    if (source === 'missing_location') {
        const q = feedbackMissingLocationQuery;
        const cleanQuery = q ? q.replace(/^"+|"+$/g, '').trim() : '';
        const currentVal = $('.feedback-input').val().trim();
        if (cleanQuery) {
            const defaultMsg = `Location "${cleanQuery}" is missing from navigation`;
            if (!currentVal || !currentVal.toLowerCase().includes(cleanQuery.toLowerCase())) {
                $('.feedback-input').val(defaultMsg);
            }
        } else if (!currentVal) {
            $('.feedback-input').val('Location is missing from navigation');
        }
        updateSendButtonState();
    }
    $('.empty-feedback').hide();
    $('.feedback-dest-tag').hide();
    $('.leave-feedback-wrapper').fadeIn('fast');
    const btnMap = {
        'general': 'footer_feedback',
        'font': 'settings_font_suggest',
        'theme': 'settings_theme_suggest',
        'bus': 'bus_feedback',
        'direct': 'direct_feedback',
        'missing_location': 'search_missing_location'
    };
    sa_event('btn_press', { btn: btnMap[source] || 'feedback_open' });
    if (source === 'bus') {
        $('.bottom').hide();
    }
}

function closeFeedbackModal() {
    saveFeedbackDraft();
    delete window._panelOpenedAt['feedback'];
    $('.feedback-dest-tag').hide();
    $('.feedback-hide-direct-btn').removeClass('is-confirming');
    $('.leave-feedback-wrapper').hide();
    if (feedbackSource === 'bus') {
        $('.bottom').show();
    }
    updateDirectFeedbackBtnVisibility();
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

    sa_event('btn_press', { btn: 'feedback_send_' + feedbackSource });

    feedbackSending = true;
    updateSendButtonState();

    let busNameVal = "";
    let routeVal = "";

    if (feedbackSource === 'bus' && popupBusName) {
        busNameVal = String(popupBusName);
        if (busData[popupBusName] && busData[popupBusName].route) {
            routeVal = busData[popupBusName].route;
        }
    }

    const sendToRubus = true;
    const sendToTripshot = (feedbackSource === 'direct') && $('.feedback-dest-tripshot').is(':checked');

    const payload = {
        feedback: feedback,
        contact: contact || null,
        busName: busNameVal,
        route: routeVal,
        source: feedbackSource,
        query: (feedbackSource === 'missing_location' && feedbackMissingLocationQuery) ? feedbackMissingLocationQuery : null,
        missingLocation: (feedbackSource === 'missing_location' && feedbackMissingLocationQuery) ? feedbackMissingLocationQuery : null,
        sendToRubus: sendToRubus,
        sendToTripshot: sendToTripshot,
        send_to_rubus: sendToRubus,
        send_to_tripshot: sendToTripshot,
        recipients: [
            ...(sendToRubus ? ['RUBus Team'] : []),
            ...(sendToTripshot ? ['TripShot/RU'] : [])
        ],
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
            clearFeedbackDraft(feedbackSource);
            if (feedbackSource === 'font' || feedbackSource === 'theme') {
                $('.feedback-sent').html('<i class="fa-solid fa-circle-check mr-0p5rem"></i>Suggestion sent');
            } else if (feedbackSource === 'missing_location') {
                $('.feedback-sent').html('<i class="fa-solid fa-circle-check mr-0p5rem"></i>Report sent');
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
            markRubusRequestsFailing();
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

    $('.feedback-dest-tripshot').on('change', function() {
        saveFeedbackDraft();
    });

    $(document).on('click', '.feedback-checkbox-label-disabled, .feedback-dest-rubus', function(e) {
        e.preventDefault();
        $('.feedback-dest-rubus').prop('checked', true);
        const $tag = $('.feedback-dest-tag');
        if ($tag.is(':visible')) {
            $tag.stop(true, true).css('opacity', 0.4).fadeTo(120, 1);
        } else {
            $tag.stop(true, true).fadeIn('fast');
        }
        return false;
    });

    let mouseDownTarget = null;
    let inputWasFocusedOnPointerDown = false;

    $('.feedback-outside').on('mousedown pointerdown touchstart', function(e) {
        mouseDownTarget = e.target;
        const active = document.activeElement;
        inputWasFocusedOnPointerDown = Boolean(
            active &&
            (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA') &&
            $(active).closest('.leave-feedback-wrapper').length > 0
        );
    });

    $('.feedback-outside').on('click', function(e) {
        if (e.target === this && mouseDownTarget === this) {
            const active = document.activeElement;
            const isCurrentlyFocused = Boolean(
                active &&
                (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA') &&
                $(active).closest('.leave-feedback-wrapper').length > 0
            );

            if (inputWasFocusedOnPointerDown || isCurrentlyFocused) {
                inputWasFocusedOnPointerDown = false;
                if (active) active.blur();
                $('.feedback-input, .feedback-contact-input').blur();
                return;
            }

            closeFeedbackModal();
        }
    });

    $(document).on('click', '.feedback-hide-direct-btn', function(e) {
        e.preventDefault();
        e.stopPropagation();

        const $btn = $(this);
        if ($btn.hasClass('is-hidden')) return;

        if (!$btn.hasClass('is-confirming')) {
            $btn.addClass('is-confirming').text('Confirm? You can add it back from settings.');
        } else {
            settings['toggle-hide-direct-feedback'] = true;
            $('#toggle-hide-direct-feedback').prop('checked', true);
            saveSettings();
            updateDirectFeedbackBtnVisibility();
            $btn.removeClass('is-confirming').addClass('is-hidden').text('Hidden from map');
            sa_event('toggle_change', {
                toggle: 'toggle-hide-direct-feedback',
                isChecked: true,
                source: 'direct_feedback_modal'
            });
        }
    });

    $(document).on('click', function(e) {
        if (!$(e.target).closest('.feedback-hide-direct-btn').length) {
            const $btn = $('.feedback-hide-direct-btn');
            if ($btn.hasClass('is-confirming')) {
                $btn.removeClass('is-confirming').text('Hide Direct Feedback Button From Map');
            }
        }
    });
});
    
