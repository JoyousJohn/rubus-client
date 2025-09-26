$('.events-link').click(function() {
    $('.involved-wrapper').show();

    fetch('https://demo.rubus.live/involved', {
    })
        .then(response => response.json())
        .then(data => {
            console.log(data);

            const currentDate = new Date();
            const futureEventIndex = data.findIndex(event => new Date(event['start']) >= currentDate);
            const futureEvents = futureEventIndex === -1 ? [] : data.slice(futureEventIndex);

            futureEvents.forEach(event => {

                let $imgElm = $(`<div id="event-img"></div>`)
                if (event['img']) {
                    $imgElm.css('background-image', `url(https://se-images.campuslabs.com/clink/images/${event['img']})`)
                } else {
                    $imgElm.css('background-color', '#e5e5e5')
                }
                $('.involved-grid').append($imgElm)

                const $eventElm = $(`
                    <div class="flex flex-col">
                        <div class="benefits flex gap-x-0p5rem"></div>
                        <div class="text-1p2rem bold-500 gray818181">${event['org']}</div>
                        <div class="text-1p5rem lh-1">${event['name']}</div>
                        <div class="flex justify-between gap-x-1rem">
                            <div class="no-wrap lh-15">${formatDate(event['start'])}</div>
                            <div class="align-right">${event['location']}</div>
                        </div>
                    </div>
                `)

                if (event.benefits) {
                    event.benefits.forEach(benefit => {
                        $eventElm.find('.benefits').append(`<div class="benefit white" style="padding: 0.2rem 0.5rem; border-radius: 0.3rem; background-color: #1cd41c;">${benefit}</div>`)
                    })
                }

                $('.involved-grid').append($eventElm)

            });

        })
        .catch(error => {
            console.error('Error fetching events:', error);
            markRubusRequestsFailing();
        });

})

// Function to format the date
function formatDate(dateString) {
    const options = { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric', hour12: true };
    return new Date(dateString).toLocaleString('en-US', options);
}


$('.events-close').click(function() {
    $('.involved-wrapper').hide();
})