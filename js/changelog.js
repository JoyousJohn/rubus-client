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

    // Render only new commits that haven't been rendered yet
    for (const [dateLabel, commits] of allCommits) {
        // Check if this date group has been rendered before
        const dateKey = dateLabel;
        const existingRendered = renderedCommits.get(dateKey) || [];
        
        // Find new commits for this date
        const newCommits = commits.filter(commit => 
            !existingRendered.some(rendered => rendered.message === commit.message)
        );
        
        if (newCommits.length === 0) {
            continue; // No new commits for this date
        }
        
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

        newCommits.forEach(c => {
            const $li = $(`<li class="changelog-message">${c.message}</li>`);
            $ul.append($li);
        });

        $dayContainer.append($dateHeader);
        $dayContainer.append($ul);
        
        if (isInitialLoad) {
            $list.append($dayContainer);
        } else {
            // For subsequent loads, append and slide down only new commits
            $dayContainer.hide();
            $list.append($dayContainer);
            $dayContainer.slideDown(300);
        }
        
        // Update rendered commits for this date
        renderedCommits.set(dateKey, commits);
    }

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