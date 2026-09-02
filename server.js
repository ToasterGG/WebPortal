const express = require('express');
const https = require('https');
const http = require('http');
const path = require('path');
const app = express();

const PORT = process.env.PORT || 10000;

app.use(express.static(__dirname));

// Utility to parse browser cookies easily
function parseCookies(req) {
    const list = {};
    const rc = req.headers.cookie;
    if (rc) {
        rc.split(';').forEach(cookie => {
            const parts = cookie.split('=');
            list[parts.shift().trim()] = decodeURIComponent(parts.join('='));
        });
    }
    return list;
}

app.get('/gateway', (req, res) => {
    let targetUrl = req.query.url;
    const cookies = parseCookies(req);

    // If the browser requests an internal asset without a ?url= parameter, check the last known site cookie
    if (!targetUrl && cookies['proxied_origin']) {
        targetUrl = cookies['proxied_origin'] + req.url.replace('/gateway', '');
    }

    if (!targetUrl) {
        return res.status(400).send('SYS_ERR: Missing destination query parameter. Ensure the target URL is provided via ?url=');
    }

    if (targetUrl === 'duckduckgo.com' || targetUrl === 'https://duckduckgo.com') {
        targetUrl = 'https://duckduckgo.com';
    }

    try {
        const parsedUrl = new URL(targetUrl);
        const client = parsedUrl.protocol === 'https:' ? https : http;

        // Remember this specific domain origin context on the browser for down-stream assets
        res.setHeader('Set-Cookie', `proxied_origin=${encodeURIComponent(parsedUrl.origin)}; Path=/; HttpOnly; SameSite=Lax`);

        const options = {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'identity'
            }
        };

        const proxyReq = client.request(parsedUrl, options, (proxyRes) => {
            res.status(proxyRes.statusCode);

            // Strip anti-framing rules and origin tracking controls
            Object.keys(proxyRes.headers).forEach((key) => {
                const lowerKey = key.toLowerCase();
                if (!['x-frame-options', 'content-security-policy', 'content-security-policy-report-only', 'clear-site-data', 'cross-origin-opener-policy'].includes(lowerKey)) {
                    res.setHeader(key, proxyRes.headers[key]);
                }
            });

            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', '*');

            // Handle internal system redirects recursively through the gateway
            if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
                let redirectPath = proxyRes.headers.location;
                if (!/^https?:\/\//i.test(redirectPath)) {
                    redirectPath = parsedUrl.origin + redirectPath;
                }
                res.redirect(`/gateway?url=${encodeURIComponent(redirectPath)}`);
                return;
            }

            // HTML Translation Layer
            if (proxyRes.headers['content-type'] && proxyRes.headers['content-type'].includes('text/html')) {
                let htmlBuffer = '';
                proxyRes.on('data', chunk => htmlBuffer += chunk);
                proxyRes.on('end', () => {
                    const hostUrl = `${req.protocol}://${req.get('host')}`;
                    const baseOrigin = parsedUrl.origin;
                    
                    // Inject a native base reference point to preserve asset loading paths
                    const structuralScript = `<base href="${baseOrigin}/">
                    <script>
                        // Intercept all form submissions and convert them to proxy queries cleanly
                        window.addEventListener('submit', function(e) {
                            var form = e.target;
                            if (form && form.action && !form.action.includes('/gateway')) {
                                e.preventDefault();
                                var destination = form.action;
                                // Serialize form inputs manually into standard URL parameters
                                var formData = new FormData(form);
                                var params = new URLSearchParams(formData).toString();
                                if(params) destination += (destination.includes('?') ? '&' : '?') + params;
                                
                                window.location.href = '${hostUrl}/gateway?url=' + encodeURIComponent(destination);
                            }
                        }, true);
                    </script>`;

                    let processedHtml = htmlBuffer;
                    if (processedHtml.includes('<head>')) {
                        processedHtml = processedHtml.replace('<head>', '<head>' + structuralScript);
                    } else {
                        processedHtml = structuralScript + processedHtml;
                    }

                    res.send(processedHtml);
                });
            } else {
                proxyRes.pipe(res);
            }
        });

        proxyReq.on('error', (err) => res.status(500).send(`CRITICAL_GATEWAY_ERROR: ${err.message}`));
        proxyReq.end();
    } catch (e) {
        res.status(400).send('STRUCT_FORMAT_ERR: Invalid Request Format.');
    }
});

app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });
app.get('/healthz', (req, res) => { res.status(200).send('OK'); });

app.listen(PORT, () => console.log(`[SYS_INIT] Tracking instance active on port ${PORT}`));
