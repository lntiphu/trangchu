// Service Worker for "Làm chủ mọi thứ" PWA
const CACHE_NAME = 'lam-chu-moi-thu-v77';
const STATIC_ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './favicon.png',
    './apple-touch-icon.png',
    './assets/icon-192.png',
    './assets/pwa-icon-512.png',
    './assets/web-avatar.png',
    './assets/logo-chu-dong.svg',
    './main/css/styles.css?v=98',
    './main/js/app.js?v=91',
    './main/js/her.js?v=13',
    './thuchi/index.html',
    './thuchi/css/style.css?v=15',
    './thuchi/js/app.js?v=30'
];

// Install: Cache static shell assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return Promise.all(STATIC_ASSETS.map(async (asset) => {
                try { await cache.add(asset); }
                catch (error) { console.warn('Không thể lưu tài nguyên vào cache:', asset, error); }
            }));
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

    // HTML navigation & same-origin JS/CSS: Network-first with cache fallback
    const isSameOriginCode = url.origin === self.location.origin && (url.pathname.endsWith('.js') || url.pathname.endsWith('.css'));
    if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html') || isSameOriginCode) {
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
                        if (cachedResponse) return cachedResponse;
                        return (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html'))
                            ? caches.match('./index.html')
                            : Response.error();
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
                .catch(() => cachedResponse || Response.error());

            return cachedResponse || fetchPromise;
        })
    );
});
