let contact;
let contactLoading = false;

function showContact() {
    $('.contact').addClass('footer-selected');
    $('.footer-contact-wrapper').show();
    // Hide changelog when showing contact
    $('.changelog-wrapper').hide();
    $('.changelog').removeClass('footer-selected');
    // Hide status
    $('.status-wrapper').hide();
    $('.status').removeClass('footer-selected');
    // Hide errors
    $('.errors-wrapper').hide();
    $('.errors-tab').removeClass('footer-selected');
    stopStatusUpdates();
}

function popContact() {
    const esc = (typeof escapeHtml === 'function' ? escapeHtml : (s)=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'));
    Object.keys(contact).forEach(function(key) {
        if (key === 'emails') {
            contact.emails.forEach(function(email) {
                const $typeDiv = $('<div></div>').text(email.type);
                $('.footer-contact').find('.footer-contact-email-blurb').before($typeDiv);
                const $addrLink = $('<a></a>').attr('href', 'mailto:' + email.address).text(email.address);
                const $addrDiv = $('<div class="right"></div>').append($addrLink);
                $('.footer-contact').find('.footer-contact-email-blurb').before($addrDiv);
            });
        }

        else if (key === 'socials') {
            contact.socials.forEach(function(social) {
                const $socialDiv = $('<div style="line-height: 0.7;"></div>');
                $socialDiv.append(document.createTextNode(social.type));
                $socialDiv.append($('<br>'));
                $socialDiv.append($('<span class="gray777777 text-1p2rem"></span>').text('(recommended)'));
                $('.footer-contact').append($socialDiv);
                if (social.type === 'Reddit') {
                    const $link = $('<a></a>').attr('href', 'https://reddit.com/' + social.address).text(social.address);
                    $('.footer-contact').append($('<div class="right"></div>').append($link));
                }
            });
        }

    });

    showContact();

}


function contactClicked() {
    sa_event('btn_press', { btn: 'footer_contact' });
    if (contactLoading) {
        return;
    }

    // Check if contact wrapper is currently visible
    if ($('.footer-contact-wrapper').is(':visible')) {
        $('.footer-contact-wrapper').hide();
        $('.contact').removeClass('footer-selected');
        $('.status-wrapper').hide();
        $('.errors-wrapper').hide();
        $('.errors-tab').removeClass('footer-selected');
        stopStatusUpdates();
        return;
    }

    // If not visible, show contact
    // Immediately hide changelog and status, show contact loading state
    $('.changelog-wrapper').hide();
    $('.changelog').removeClass('footer-selected');
    $('.status-wrapper').hide();
    $('.status').removeClass('footer-selected');
    $('.stats-wrapper').hide();
    $('.stats').removeClass('footer-selected');
    $('.errors-wrapper').hide();
    $('.errors-tab').removeClass('footer-selected');
    stopStatusUpdates();
    $('.footer-contact-loading').show();
    $('.footer-contact-wrapper').hide();
    $('.contact').addClass('footer-selected');
    
    if (!contact) {
        contactLoading = true;
        fetch('https://demo.rubus.live/contact')
            .then(response => response.json())
            .then(data => {
                contact = data;
                $('.footer-contact-loading').hide();
                popContact();
                updateRubusResponseTime();
                contactLoading = false;
            })
            .catch(error => {
                console.error('Error fetching contact data:', error);
                markRubusRequestsFailing();
                contactLoading = false;
            });
    } else {
        $('.footer-contact-loading').hide();
        showContact();
    }
}