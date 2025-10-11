let currentPage = 1;
let allCommits = new Map(); // Store all commits grouped by date
let previousCommitCount = 0; // Track how many commits were rendered before
let changelogInitialized = false; // Track if changelog has been loaded before
let renderedCommits = new Map(); // Track which commits have already been rendered
let changelogLoading = false; // Prevent spam clicking on changelog
let preloadingNextPage = false; // Track if we're preloading the next page
let loadedPages = new Set(); // Track which pages have been loaded

async function getChangelog() {
    // Prevent spam clicking
    if (changelogLoading) {
        return;
    }

    // Toggle behavior: if already visible, hide and unselect
    if ($('.changelog-wrapper').is(':visible')) {
        $('.changelog-wrapper').hide();
        $('.changelog').removeClass('footer-selected');
        $('.status-wrapper').hide();
        $('.errors-wrapper').hide();
        $('.errors-tab').removeClass('footer-selected');
        stopStatusUpdates();
        return;
    }

    // Preparing to show changelog: hide contact and status, unselect them
    $('.footer-contact-wrapper').hide();
    $('.contact').removeClass('footer-selected');
    $('.status-wrapper').hide();
    $('.status').removeClass('footer-selected');
    $('.errors-wrapper').hide();
    $('.errors-tab').removeClass('footer-selected');
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
    loadedPages.clear();
    previousCommitCount = 0;
    
    loadCommitsPage(currentPage);
}

function loadCommitsPage(page, isPreload = false) {
    // Prevent spam clicking (but allow preloading)
    if (changelogLoading && !isPreload) {
        return;
    }

    if (isPreload) {
        preloadingNextPage = true;
    } else {
        changelogLoading = true;
    }
    
    $.ajax({
        url: `https://api.github.com/repos/JoyousJohn/rubus-client/commits?per_page=57&page=${page}`,
        type: 'GET',
        success: function(data, textStatus, jqXHR) {
            // If no more commits, hide the button
            if (data.length === 0) {
                if (!isPreload) {
                    $('.show-more-commits-btn').hide();
                }
                if (!isPreload) {
                    changelogLoading = false;
                }
                preloadingNextPage = false;
                return;
            }

            // Group commits by formatted date (M.D.YY)
            const requestDates = new Map();
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

                if (!requestDates.has(formatted)) {
                    requestDates.set(formatted, 0);
                }
                requestDates.set(formatted, requestDates.get(formatted) + 1);

                if (!allCommits.has(formatted)) {
                    allCommits.set(formatted, []);
                }
                allCommits.get(formatted).push({ message });
            });

            // Log dates and commit counts from this request
            const sortedDates = Array.from(requestDates.entries()).sort((a, b) => a[0].localeCompare(b[0]));
            const dateInfo = sortedDates.map(([date, count]) => `${date}(${count})`).join(', ');
            console.log(`Request ${page} dates: ${dateInfo}`);

            // Track that this page has been loaded
            loadedPages.add(page);

            // For preloaded pages, don't render or update UI, just store the data
            if (isPreload) {
                preloadingNextPage = false;
                return;
            }

            renderChangelog();

            // Show the button if we got a full page of commits
            if (data.length === 57) {
                $('.show-more-commits-btn').show();
                // Pre-load the next page for instant loading
                if (!preloadingNextPage) {
                    loadCommitsPage(page + 1, true);
                }
            } else {
                $('.show-more-commits-btn').hide();
            }

            changelogLoading = false;
        },
        error: function() {
            if (!isPreload) {
                changelogLoading = false;
            }
            preloadingNextPage = false;
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
    for (const [dateLabel, commits] of allCommits) {
        const dateKey = dateLabel;
        const existingRendered = renderedCommits.get(dateKey) || [];
        const newCommits = commits.filter(commit =>
            !existingRendered.some(rendered => rendered.message === commit.message)
        );

        if (newCommits.length === 0) {
            continue; // No new commits for this date
        }

        // Check if this date already exists in the DOM
        const $existingDateContainer = $(`.changelog-date:contains('${dateLabel}')`).closest('.changelog-day');

        if ($existingDateContainer.length > 0) {
            // Date already exists, append new commits
            const $existingUl = $existingDateContainer.find('.changelog-items');

            newCommits.forEach(c => {
                const $li = $(`<li class="changelog-message">${c.message}</li>`);
                $li.hide();
                $existingUl.append($li);
                $li.slideDown(200);
            });

            // Update the count in the existing header
            const totalCount = existingRendered.length + newCommits.length;
            const $existingSpan = $existingDateContainer.find('.changelog-date span');
            $existingSpan.text(`(${totalCount})`);

        } else {
            // Date doesn't exist, create new date group
            const $dayContainer = $('<div class="changelog-day"></div>');
            const commitCount = newCommits.length;
            const isLastDate = dateLabel === Array.from(allCommits.keys())[allCommits.size - 1]; // Last date in all commits
            const countDisplay = isLastDate ? `${commitCount}+` : commitCount;
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

            newCommits.forEach(c => {
                const $li = $(`<li class="changelog-message">${c.message}</li>`);
                $ul.append($li);
            });

            $dayContainer.append($dateHeader);
            $dayContainer.append($ul);

            if (isInitialLoad) {
                $list.append($dayContainer);
            } else {
                // For subsequent loads, append and slide down new date groups
                $dayContainer.hide();
                $list.append($dayContainer);
                $dayContainer.slideDown(300);
            }
        }

        // Update rendered commits for this date - only add the new ones
        const currentRendered = renderedCommits.get(dateLabel) || [];
        renderedCommits.set(dateLabel, [...currentRendered, ...newCommits]);
    }

    // Add show more button if not already present
    if ($('.show-more-commits-btn').length === 0) {
        const $showMoreBtn = $('<div class="show-more-commits-btn pointer text-1p4rem center mt-1rem" style="color: #1a73e8; font-weight: 500;"><i class="fa-solid fa-plus"></i> Show more commits</div>');
        $showMoreBtn.click(function() {
            if (changelogLoading || preloadingNextPage) {
                return;
            }

            // Check if next page is already preloaded
            const nextPage = currentPage + 1;

            if (loadedPages.has(nextPage)) {
                // Next page is already loaded, just render
                currentPage = nextPage;
                renderChangelog();
            } else {
                // Load the next page normally
                currentPage++;
                loadCommitsPage(currentPage);
            }
        });
        $list.after($showMoreBtn);
    }

    // Update the count of rendered commits
    previousCommitCount = totalCommits;

    if (isInitialLoad) {
        // Hide status and errors
        $('.status-wrapper').hide();
        $('.errors-wrapper').hide();
        $('.errors-tab').removeClass('footer-selected');
        stopStatusUpdates();
        changelogInitialized = true;
    }
}