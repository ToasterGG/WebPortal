self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

// Intercepts background asset calls (CSS, JS, PNGs) inside the active frame
self.addEventListener('fetch', (event) => {
    const requestUrl = new URL(event.request.url);
    const workerUrl = new URL(self.location.href);
    const targetOrigin = workerUrl.searchParams.get('origin');

    // Ignore requests that are already going directly to your Render proxy URL
    if (requestUrl.origin === workerUrl.origin) {
        return;
    }

    // Remap asset traffic through your backend gateway proxy
    let translatedUrl = workerUrl.origin + '/gateway?url=' + encodeURIComponent(event.request.url);
    
    event.respondWith(
        fetch(translatedUrl, {
            method: event.request.method,
            headers: event.request.headers,
            credentials: event.request.credentials
        }).catch(() => fetch(event.request))
    );
});
