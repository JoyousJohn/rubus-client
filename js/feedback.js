function sendFeedback() {

    const feedback = $('.feedback-input').val();

    if (feedback.length > 0) {

        $('.leave-feedback-wrapper').hide();
        $('.bottom').show();

        const payload = {
            feedback: feedback,
            busId: popupBusId,
            route: busData[popupBusId].route,
            timeSent: new Date().toISOString() 
        };
    
        $.ajax({
            url: 'https://demo.rubus.live/feedback',
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify(payload),
            success: function (data) {
                $('.feedback-input').val('');
                $('.feedback-sent').slideDown();
    
                setTimeout(() => {
                    $('.feedback-sent').slideUp();
                }, 3000);
            },
            error: function(jqXHR, textStatus, errorThrown) {
                console.error("Error sending feedback:", textStatus, errorThrown);
            }
        });
    } 

    else {
        $('.empty-feedback').slideDown();
    }
}

$(document).ready(function() {
    $('.feedback-input').on('input', function() {
        if ($('.feedback-input').val().length > 0) {
            $('.empty-feedback').slideUp('fast');
        }
    });

    $('.feedback-outside').click(function(e) {
        console.log(e.target)
        if (e.target === this) {
            $('.leave-feedback-wrapper').hide(); $('.bottom').show();
        }
    })
});
    
