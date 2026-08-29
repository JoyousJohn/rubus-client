// sw.js - Service Worker for RUBus PWA
const CACHE_NAME = 'rubus-cache-v1';

// Static app shell assets pre-cached for instant launch & offline fallback
const PRECACHE_ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/css/index.css',
    '/css/desktop.css',
    '/css/theme.css',
    '/img/rubus-favicon.png',
    '/img/rubus-favicon-autumn.png',
    '/img/stop_marker.png',
    '/img/stop_marker_selected.png',
    '/img/passio-bus.svg'
];

// Domains and endpoints that must ALWAYS bypass cache and fetch directly from live network
const BYPASS_CACHE_PATTERNS = [
    '/where',
    '/stops',
    '/bus_ridership',
    '/bus_breaks',
    '/feedback',
    '/track',
    '/bus_status',
    '/health',
    '/routes',
    '/campus_status',
    '/active_routes',
    'demo.rubus.live',
    'sim.rubus.live',
    'sa.rubus.live',
    'simpleanalyticscdn.com',
    'i.posthog.com'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(PRECACHE_ASSETS).catch((err) => {
                console.warn('[SW] Pre-caching asset failure (continuing):', err);
            });
        }).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);

    // Only handle GET requests
    if (request.method !== 'GET') {
        return;
    }

    // Only handle http and https schemes (ignore chrome-extension:, etc.)
    if (!url.protocol.startsWith('http')) {
        return;
    }

    // Check if request is a live dynamic API or analytics endpoint
    const isLiveApi = BYPASS_CACHE_PATTERNS.some((pattern) => {
        return url.pathname.includes(pattern) || url.hostname.includes(pattern);
    });

    if (isLiveApi) {
        // Network-only: never cache real-time transit telemetry
        return;
    }

    // Navigation requests (HTML document) - Network-First with Cache Fallback
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        const responseClone = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(request, responseClone);
                        });
                    }
                    return networkResponse;
                })
                .catch(() => {
                    return caches.match(request).then((cachedResponse) => {
                        return cachedResponse || caches.match('/index.html') || caches.match('/');
                    });
                })
        );
        return;
    }

    // JavaScript files - Network-First with Cache Fallback (guarantees latest deploy updates)
    if (url.pathname.endsWith('.js') || request.destination === 'script') {
        event.respondWith(
            fetch(request)
                .then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        const responseClone = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(request, responseClone);
                        });
                    }
                    return networkResponse;
                })
                .catch(() => {
                    return caches.match(request);
                })
        );
        return;
    }

    // Static Assets (Images, CSS, Fonts) - Stale-While-Revalidate / Cache-First
    event.respondWith(
        caches.match(request).then((cachedResponse) => {
            const fetchPromise = fetch(request)
                .then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        const responseClone = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(request, responseClone);
                        });
                    }
                    return networkResponse;
                })
                .catch(() => {
                    // Ignore network failure for background revalidation
                });

            return cachedResponse || fetchPromise;
        })
    );
});
