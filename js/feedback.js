function sendFeedback() {
    $('.leave-feedback-wrapper').hide();

    const feedback = $('.feedback-input').val();

    if (feedback.length > 0) {
        $.post('https://transloc.up.railway.app/feedback', {
            feedback: feedback
        }, function (data) {
            $('.feedback-input').val('');
            $('.feedback-sent').slideDown();

            setTimeout(() => {
                $('.feedback-sent').slideUp();
            }, 3000);

        });
    }
}