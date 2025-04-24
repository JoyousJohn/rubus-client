function sendFeedback() {

    $('.leave-feedback-wrapper').hide();

    const feedback = $('.feedback-input').val();

    if (feedback.length > 0) {
        const payload = {
            feedback: feedback,
            busId: popupBusId,
            timeSent: new Date().toISOString() 
        };
    
        $.ajax({
            url: 'https://transloc.up.railway.app/feedback',
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
}