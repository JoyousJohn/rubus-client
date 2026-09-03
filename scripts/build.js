// scripts/build.js - Cloudflare Pages build script
// Automatically stamps the deployment commit hash into sw.js and index.html
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

let commitHash = process.env.CF_PAGES_COMMIT_SHA;
if (!commitHash) {
    try {
        commitHash = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
    } catch (e) {
        commitHash = Date.now().toString(36);
    }
} else {
    commitHash = commitHash.slice(0, 7);
}

console.log(`[build] Stamping deployment commit: ${commitHash}`);

// 1. Update sw.js CACHE_NAME
const swPath = path.join(__dirname, '..', 'sw.js');
let swContent = fs.readFileSync(swPath, 'utf8');
swContent = swContent.replace(
    /const CACHE_NAME = ['"][^'"]+['"];/,
    `const CACHE_NAME = 'rubus-cache-${commitHash}';`
);
fs.writeFileSync(swPath, swContent, 'utf8');
console.log(`[build] sw.js updated with CACHE_NAME = 'rubus-cache-${commitHash}'`);

// 2. Update index.html meta tag for instant deploy detection
const indexPath = path.join(__dirname, '..', 'index.html');
let indexContent = fs.readFileSync(indexPath, 'utf8');
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
fs.writeFileSync(indexPath, indexContent, 'utf8');
console.log(`[build] index.html updated with meta name="rubus-build" content="${commitHash}"`);
