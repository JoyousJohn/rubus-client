// scripts/build.js - Cloudflare Pages build script
// Automatically stamps deployment commit hash, build number, and build date into sw.js and index.html
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

function fetchCommitCount() {
    return new Promise((resolve) => {
        const options = {
            hostname: 'api.github.com',
            path: '/repos/JoyousJohn/rubus-client/commits?per_page=1',
            headers: { 'User-Agent': 'RUBus-Build-Script' }
        };
        const req = https.get(options, (res) => {
            const linkHeader = res.headers['link'];
            if (linkHeader) {
                const match = linkHeader.match(/page=(\d+)>; rel="last"/);
                if (match) {
                    return resolve(parseInt(match[1], 10));
                }
            }
            resolve(null);
        });
        req.on('error', () => resolve(null));
        req.setTimeout(5000, () => {
            req.destroy();
            resolve(null);
        });
    });
}

async function main() {
    let commitHash = process.env.CF_PAGES_COMMIT_SHA;
    let commitCount = null;

    if (!commitHash) {
        try {
            commitHash = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
            commitCount = parseInt(execSync('git rev-list --count HEAD', { encoding: 'utf8' }).trim(), 10);
        } catch (e) {
            commitHash = Date.now().toString(36);
        }
    } else {
        commitHash = commitHash.slice(0, 7);
    }

    if (!commitCount) {
        commitCount = await fetchCommitCount();
    }

    const now = new Date();
    const buildDate = (now.getMonth() + 1) + '/' + now.getDate();

    console.log(`[build] Stamping deployment commit: ${commitHash}, build: ${commitCount || 'unknown'}, date: ${buildDate}`);

    // 1. Update sw.js CACHE_NAME
    const swPath = path.join(__dirname, '..', 'sw.js');
    let swContent = fs.readFileSync(swPath, 'utf8');
    swContent = swContent.replace(
        /const CACHE_NAME = ['"][^'"]+['"];/,
        `const CACHE_NAME = 'rubus-cache-${commitHash}';`
    );
    fs.writeFileSync(swPath, swContent, 'utf8');
    console.log(`[build] sw.js updated with CACHE_NAME = 'rubus-cache-${commitHash}'`);

    // 2. Update index.html meta tags for instant deploy and version detection
    const indexPath = path.join(__dirname, '..', 'index.html');
    let indexContent = fs.readFileSync(indexPath, 'utf8');

    // Update or insert rubus-build
    if (indexContent.includes('name="rubus-build"')) {
        indexContent = indexContent.replace(
            /<meta name="rubus-build" content="[^"]*">/,
            `<meta name="rubus-build" content="${commitHash}">`
        );
    } else {
        indexContent = indexContent.replace(
            '<head>',
            `<head>\n    <meta name="rubus-build" content="${commitHash}">`
        );
    }

    // Update or insert rubus-build-num
    if (commitCount) {
        if (indexContent.includes('name="rubus-build-num"')) {
            indexContent = indexContent.replace(
                /<meta name="rubus-build-num" content="[^"]*">/,
                `<meta name="rubus-build-num" content="${commitCount}">`
            );
        } else {
            indexContent = indexContent.replace(
                /<meta name="rubus-build" content="[^"]*">/,
                `<meta name="rubus-build" content="${commitHash}">\n    <meta name="rubus-build-num" content="${commitCount}">`
            );
        }
    }

    // Update or insert rubus-build-date
    if (indexContent.includes('name="rubus-build-date"')) {
        indexContent = indexContent.replace(
            /<meta name="rubus-build-date" content="[^"]*">/,
            `<meta name="rubus-build-date" content="${buildDate}">`
        );
    } else {
        indexContent = indexContent.replace(
            /<meta name="rubus-build" content="[^"]*">/,
            `<meta name="rubus-build" content="${commitHash}">\n    <meta name="rubus-build-date" content="${buildDate}">`
        );
    }

    fs.writeFileSync(indexPath, indexContent, 'utf8');
    console.log(`[build] index.html updated with build metadata`);
}

main().catch((err) => {
    console.error('[build] Error:', err);
    process.exit(1);
});
