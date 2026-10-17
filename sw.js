// Service Worker for "Làm chủ mọi thứ" PWA
const CACHE_NAME = 'lam-chu-moi-thu-v66';
const STATIC_ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './favicon.png',
    './apple-touch-icon.png',
    './assets/icon-192.png',
    './assets/pwa-icon-512.png',
    './assets/web-avatar.png',
    './main/css/styles.css?v=92',
    './main/js/app.js?v=75',
    './main/js/her.js?v=11'
];

// Install: Cache static shell assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS).catch((err) => {
                console.warn('⚠️ Some static assets failed to cache:', err);
            });
        }).then(() => self.skipWaiting())
    );
});

// Activate: Clean up obsolete caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch: Network-first for dynamic & API calls, Stale-while-revalidate for static files
self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);

    // Bypass cache completely for Supabase & external API / POST / PUT requests
    // Bảo đảm 100% dữ liệu backend không bị cache sai hoặc ảnh hưởng
    if (
        request.method !== 'GET' ||
        url.hostname.includes('supabase.co') ||
        url.pathname.includes('/rest/v1/') ||
        url.pathname.includes('/auth/v1/')
    ) {
        return; // Let browser perform direct network fetch
    }

    // HTML navigation: Network-first with cache fallback
    if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
        event.respondWith(
            fetch(request)
                .then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        const responseClone = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
                    }
                    return networkResponse;
                })
                .catch(() => {
                    return caches.match(request).then((cachedResponse) => {
                        return cachedResponse || caches.match('./index.html');
                    });
                })
        );
        return;
    }

    // Static assets (CSS, JS, Fonts, Images): Cache-first with background revalidation
    event.respondWith(
        caches.match(request).then((cachedResponse) => {
            const fetchPromise = fetch(request)
                .then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        const responseClone = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
                    }
                    return networkResponse;
                })
                .catch(() => {
                    // Network failed, nothing to do if cache exists
                });

            return cachedResponse || fetchPromise;
        })
    );
});
