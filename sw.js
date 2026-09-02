self.addEventListener('install', function(event) {
    self.skipWaiting();
});

self.addEventListener('activate', function(event) {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', function(event) {
    const requestUrl = new URL(event.request.url);
    const workerUrl = new URL(self.location.href);
    
    const hostServer = workerUrl.searchParams.get('host');
    const targetOrigin = workerUrl.searchParams.get('origin');

    // Skip processing if the file path is already routed via your Render application URL
    if (requestUrl.origin === workerUrl.origin) {
        return;
    }

    let proxiedAssetUrl = hostServer + '/gateway?url=' + encodeURIComponent(event.request.url);

    event.respondWith(
        fetch(proxiedAssetUrl, {
            method: event.request.method,
            headers: event.request.headers,
            credentials: event.request.credentials
        }).catch(function() {
            return fetch(event.request);
        })
    );
});
