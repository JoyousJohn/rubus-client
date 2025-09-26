let currentPage = 1;
let allCommits = new Map(); // Store all commits grouped by date
let previousCommitCount = 0; // Track how many commits were rendered before
let changelogInitialized = false; // Track if changelog has been loaded before
let renderedCommits = new Map(); // Track which commits have already been rendered

async function getChangelog() {
    // Toggle behavior: if already visible, hide and unselect
    if ($('.changelog-wrapper').is(':visible')) {
        $('.changelog-wrapper').hide();
        $('.changelog').removeClass('footer-selected');
        $('.status-wrapper').hide();
        stopStatusUpdates();
        return;
    }

    // Preparing to show changelog: hide contact and status, unselect them
    $('.footer-contact-wrapper').hide();
    $('.contact').removeClass('footer-selected');
    $('.status-wrapper').hide();
    $('.status').removeClass('footer-selected');
    stopStatusUpdates();

    // Immediately select changelog and show wrapper
    $('.changelog').addClass('footer-selected');
    $('.changelog-wrapper').show();

    // If changelog was already initialized, just show it again
    if (changelogInitialized) {
        renderChangelog();
        return;
    }

    // Reset for new changelog view
    currentPage = 1;
    allCommits.clear();
    renderedCommits.clear();
    previousCommitCount = 0;
    
    loadCommitsPage(currentPage);
}

function loadCommitsPage(page) {
    $.ajax({
        url: `https://api.github.com/repos/JoyousJohn/rubus-client/commits?per_page=57&page=${page}`,
        type: 'GET',
        success: function(data, textStatus, jqXHR) {
            // If no more commits, hide the button
            if (data.length === 0) {
                $('.show-more-commits-btn').hide();
                return;
            }

            // Group commits by formatted date (M.D.YY)
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

                if (!allCommits.has(formatted)) {
                    allCommits.set(formatted, []);
                }
                allCommits.get(formatted).push({ message });
            });

            renderChangelog();
            
            // Show the button if we got a full page of commits
            if (data.length === 57) {
                $('.show-more-commits-btn').show();
            } else {
                $('.show-more-commits-btn').hide();
            }
        }
    });
}

function renderChangelog() {
    const $list = $('.changelog-list');
    const isInitialLoad = previousCommitCount === 0;
    
    if (isInitialLoad) {
        $list.empty();
    }
    
    // Inline styles for list container (single flex column)
    $list.css({
        display: 'flex',
        flexDirection: 'column',
        rowGap: '1.2rem'
    });

    // Count total commits to determine what's new
    let totalCommits = 0;
    for (const [dateLabel, commits] of allCommits) {
        totalCommits += commits.length;
    }

    // Render all dates and commits
    console.log('=== RENDER CHANGELOG DEBUG ===');
    console.log('All commits by date:', Object.fromEntries(allCommits));
    console.log('Currently rendered commits:', Object.fromEntries(renderedCommits));

    for (const [dateLabel, commits] of allCommits) {
        console.log(`\nProcessing date: ${dateLabel}`);
        const dateKey = dateLabel;
        const existingRendered = renderedCommits.get(dateKey) || [];
        const newCommits = commits.filter(commit =>
            !existingRendered.some(rendered => rendered.message === commit.message)
        );

        console.log(`- Total commits for this date: ${commits.length}`);
        console.log(`- Already rendered: ${existingRendered.length}`);
        console.log(`- New commits to render: ${newCommits.length}`);

        if (newCommits.length === 0) {
            console.log('SKIP: No new commits for this date');
            continue; // No new commits for this date
        }

        // Check if this date already exists in the DOM
        const $existingDateContainer = $(`.changelog-date:contains('${dateLabel}')`).closest('.changelog-day');
        console.log(`- Date exists in DOM: ${$existingDateContainer.length > 0}`);

        if ($existingDateContainer.length > 0) {
            // Date already exists, append new commits
            console.log('ACTION: Appending to existing date');
            const $existingUl = $existingDateContainer.find('.changelog-items');

            console.log(`- Adding ${newCommits.length} new commits to existing date`);
            newCommits.forEach(c => {
                const $li = $(`<li class="changelog-message">${c.message}</li>`);
                $li.hide();
                $existingUl.append($li);
                $li.slideDown(200);
                console.log(`  - Added commit: ${c.message.substring(0, 50)}...`);
            });

            // Update the count in the existing header
            const totalCount = existingRendered.length + newCommits.length;
            const $existingSpan = $existingDateContainer.find('.changelog-date span');
            console.log(`- Updating count from ${existingRendered.length} to ${totalCount}`);
            $existingSpan.text(`(${totalCount})`);

            // Remove + from this date since we now have all commits for this API response
            // Note: We can't know if there are more commits for this date in future API responses
            const currentText = $existingSpan.text();
            if (currentText.includes('+')) {
                $existingSpan.text(currentText.replace('+', ''));
                console.log('- Removed + from count (but this date might have more commits in future responses)');
            }

        } else {
            // Date doesn't exist, create new date group
            console.log('ACTION: Creating new date group');
            const $dayContainer = $('<div class="changelog-day"></div>');
            const commitCount = newCommits.length;
            const isLastDate = dateLabel === Array.from(allCommits.keys())[allCommits.size - 1]; // Last date in all commits
            const countDisplay = isLastDate && currentPage === 1 ? `${commitCount}+` : commitCount;
            const $dateHeader = $(`<div class="changelog-date bold-500">${dateLabel} <span style="color: #888; font-weight: normal;">(${countDisplay})</span></div>`);
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

            console.log(`- Creating new date group with ${commitCount} commits`);
            newCommits.forEach(c => {
                const $li = $(`<li class="changelog-message">${c.message}</li>`);
                $ul.append($li);
                console.log(`  - Added commit: ${c.message.substring(0, 50)}...`);
            });

            $dayContainer.append($dateHeader);
            $dayContainer.append($ul);

            if (isInitialLoad) {
                console.log('- Initial load: appending to list');
                $list.append($dayContainer);
            } else {
                // For subsequent loads, append and slide down new date groups
                console.log('- Show more: sliding down new date group');
                $dayContainer.hide();
                $list.append($dayContainer);
                $dayContainer.slideDown(300);
            }
        }

        // Update rendered commits for this date
        renderedCommits.set(dateLabel, commits);
        console.log(`- Updated rendered commits for ${dateLabel}: now ${commits.length} total`);
    }

    console.log('=== RENDER CHANGELOG DEBUG END ===\n');

    // Add show more button if not already present
    if ($('.show-more-commits-btn').length === 0) {
        const $showMoreBtn = $('<div class="show-more-commits-btn pointer text-1p4rem center mt-1rem" style="color: #1a73e8; font-weight: 500;"><i class="fa-solid fa-plus"></i> Show more commits</div>');
        $showMoreBtn.click(function() {
            currentPage++;
            loadCommitsPage(currentPage);
        });
        $list.after($showMoreBtn);
    }

    // Update the count of rendered commits
    previousCommitCount = totalCommits;

    if (isInitialLoad) {
        // Hide status
        $('.status-wrapper').hide();
        stopStatusUpdates();
        changelogInitialized = true;
    }
}