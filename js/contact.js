let contact;

function showContact() {
    $('.contact').addClass('footer-selected');
    $('.footer-contact-wrapper').show();
}

function popContact() {

    Object.keys(contact).forEach(function(key) {
        if (key === 'emails') {
            contact.emails.forEach(function(email) {
                $('.footer-contact').append(`<div>${email.type}</div>`)
                $('.footer-contact').append(`<div>${email.address}</div>`)
            });
        }
    });

    showContact();

}


function contactClicked() {
    if (!contact) {
        fetch('https://transloc.up.railway.app/contact')
            .then(response => response.json())
            .then(data => {
                contact = data;
                popContact();
            })
            .catch(error => {
                console.error('Error fetching contact data:', error);
            });
    } else {
        showContact();
    }
}