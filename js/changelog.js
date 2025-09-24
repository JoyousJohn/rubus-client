async function getChangelog() {
    $.ajax({
        url: 'https://api.github.com/repos/JoyousJohn/rubus-client/commits',
        type: 'GET',
        success: function(data, textStatus, jqXHR) {
            // Group commits by formatted date (M.D.YY)
            const dateToCommits = new Map();

            data.forEach(item => {
                const commit = item.commit;
                const message = commit.message;
                const isoDate = commit.committer.date;
                if (!isoDate) return;

                const d = new Date(isoDate);
                const m = d.getUTCMonth() + 1; // 1-12
                const day = d.getUTCDate(); // 1-31
                const yy = (d.getUTCFullYear() % 100).toString();
                const formatted = `${m}.${day}.${yy}`; // no leading zeros per spec

                if (!dateToCommits.has(formatted)) {
                    dateToCommits.set(formatted, []);
                }
                dateToCommits.get(formatted).push({ message });
            });

            const $list = $('.changelog-list');
            $list.empty();
            // Inline styles for list container (single flex column)
            $list.css({
                display: 'flex',
                flexDirection: 'column',
                rowGap: '1.2rem'
            });

            // Render as a single flex column list: date header once, then messages for that date
            for (const [dateLabel, commits] of dateToCommits) {
                const $dayContainer = $('<div class="changelog-day"></div>');
                const $dateHeader = $(`<div class="changelog-date bold-500">${dateLabel}</div>`);
                // Align date header with start of list text (not bullets)
                $dateHeader.css({
                    marginLeft: '2rem',
                    fontWeight: 500
                });
                const $ul = $('<ul class="changelog-items"></ul>');
                // Ensure bullet text alignment and spacing
                $ul.css({
                    listStyle: 'disc',
                    listStylePosition: 'outside',
                    margin: '0.3rem 0 1.2rem 0',
                    paddingLeft: '2rem'
                });

                commits.forEach(c => {
                    const $li = $(`<li class="changelog-message">${c.message}</li>`);
                    $ul.append($li);
                });

                $dayContainer.append($dateHeader);
                $dayContainer.append($ul);
                $list.append($dayContainer);
            }

            $('.changelog-wrapper').show();
        }
    });
}