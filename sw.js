// sw.js - Service Worker for RUBus PWA
const CACHE_NAME = 'rubus-cache-__BUILD_HASH__';

// Static app shell assets pre-cached for instant launch & offline fallback
const PRECACHE_ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/css/index.css',
    '/css/desktop.css',
    '/img/rubus-icon-192.png',
    '/img/rubus-icon-512.png',
    '/img/rubus-favicon.png',
    '/img/rubus-favicon-back-to-college.png',
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
            return Promise.allSettled(
                PRECACHE_ASSETS.map((url) => cache.add(url).catch((err) => {
                    console.warn('[SW] Pre-cache failed for', url, err);
                    throw err;
                }))
            ).then((results) => {
                const failed = results.filter(r => r.status === 'rejected');
                if (failed.length) console.warn('[SW] Pre-cache completed with', failed.length, 'failures');
            });
        })
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

// Activate new SW on explicit client request (e.g. user clicked "Refresh" on update toast)
self.addEventListener('message', (event) => {
    if (event.data && event.data.action === 'skipWaiting') {
        self.skipWaiting();
    }
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

// Navigation requests (HTML document) - Network-First with 2.5s timeout & Cache Fallback
    if (request.mode === 'navigate') {
        const fetchPromise = fetch(request)
            .then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200) {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(request, responseClone);
                    });
                }
                return networkResponse;
            });

        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Navigation network timeout')), 2500);
        });

        event.respondWith(
            Promise.race([fetchPromise, timeoutPromise])
                .catch(() => {
                    return caches.match(request).then((cachedResponse) => {
                        return cachedResponse || caches.match('/index.html').then((htmlResponse) => {
                            return htmlResponse || caches.match('/').then((rootResponse) => {
                                // Never resolve respondWith() to undefined — that
                                // throws "FetchEvent.respondWith received an error".
                                return rootResponse || Response.error();
                            });
                        });
                    });
                })
        );
        return;
    }

    // JavaScript and CSS files - Network-First with Cache Fallback (guarantees latest deploy updates and keeps JS/CSS in sync)
    if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || request.destination === 'script' || request.destination === 'style') {
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
                        return cachedResponse || Response.error();
                    });
                })
        );
        return;
    }

// Static Assets (Images, Fonts) - Stale-While-Revalidate / Cache-First
    event.respondWith(
        caches.match(request).then((cachedResponse) => {
            if (cachedResponse) return cachedResponse;
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
                    // No cache entry and no network: resolve to an errored
                    // response so respondWith() never gets undefined.
                    return Response.error();
                });

            return fetchPromise;
        })
    );
});
