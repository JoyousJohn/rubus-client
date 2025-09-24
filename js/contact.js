let contact;

function showContact() {
    $('.contact').addClass('footer-selected');
    $('.footer-contact-wrapper').show();
    // Hide changelog when showing contact
    $('.changelog-wrapper').hide();
    $('.changelog').removeClass('footer-selected');
}

function popContact() {

    Object.keys(contact).forEach(function(key) {
        if (key === 'emails') {
            contact.emails.forEach(function(email) {
                $('.footer-contact').find('.footer-contact-email-blurb').before(`<div>${email.type}</div>`)
                $('.footer-contact').find('.footer-contact-email-blurb').before(`<div class="right"><a href="mailto:${email.address}">${email.address}</a></div>`)
            });
        }

        else if (key === 'socials') {
            contact.socials.forEach(function(social) {
                $('.footer-contact').append(`<div style="line-height: 0.7;">${social.type}<br><span class="gray777777 text-1p2rem">(recommended)</span></div>`)
                if (social.type === 'Reddit') {
                    $('.footer-contact').append(`<div class="right"><a href="https://reddit.com/${social.address}">${social.address}</a></div>`)
                }
            });
        }

    });

    showContact();

}


function contactClicked() {
    if (!contact) {
        $('.footer-contact-loading').show();
        fetch('https://demo.rubus.live/contact')
            .then(response => response.json())
            .then(data => {
                contact = data;
                $('.footer-contact-loading').hide();
                popContact();
            })
            .catch(error => {
                console.error('Error fetching contact data:', error);
            });
    } else {
        if ($('.footer-contact-wrapper').is(':visible')) {
            $('.footer-contact-wrapper').hide();
            $('.contact').removeClass('footer-selected');
        } else {
            showContact();
        }
    }
}