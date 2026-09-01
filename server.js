const express = require('express');
const path = require('path');
const https = require('https');
const http = require('http');
const app = express();

const PORT = process.env.PORT || 10000;

app.use(express.static(__dirname));

app.get('/gateway', (req, res) => {
    let targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send('SYS_ERR: Missing destination query parameter.');

    if (targetUrl === 'duckduckgo.com' || targetUrl === 'https://duckduckgo.com') {
        targetUrl = 'https://duckduckgo.com';
    }

    try {
        const parsedUrl = new URL(targetUrl);
        const client = parsedUrl.protocol === 'https:' ? https : http;

        const options = {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'identity' // Strictly block gzip/brotli compression corruption
            }
        };

        const proxyReq = client.request(parsedUrl, options, (proxyRes) => {
            res.status(proxyRes.statusCode);

            // Strip framing boundaries and cross-origin security rules
            Object.keys(proxyRes.headers).forEach((key) => {
                const lowerKey = key.toLowerCase();
                if (
                    lowerKey !== 'x-frame-options' && 
                    lowerKey !== 'content-security-policy' &&
                    lowerKey !== 'content-security-policy-report-only' &&
                    lowerKey !== 'clear-site-data' &&
                    lowerKey !== 'cross-origin-opener-policy'
                ) {
                    res.setHeader(key, proxyRes.headers[key]);
                }
            });

            // Set global CORS bypass controls to force assets to unlock inside the local frame
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', '*');

            // Intercept internal platform redirects and push them back into our proxy channel
            if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
                let redirectPath = proxyRes.headers.location;
                if (!/^https?:\/\//i.test(redirectPath)) {
                    redirectPath = parsedUrl.origin + redirectPath;
                }
                res.redirect(`/gateway?url=${encodeURIComponent(redirectPath)}`);
                return;
            }

            // HTML Parsing & Link Rewriting Layer
            if (proxyRes.headers['content-type'] && proxyRes.headers['content-type'].includes('text/html')) {
                let htmlBuffer = '';
                proxyRes.on('data', chunk => htmlBuffer += chunk);
                proxyRes.on('end', () => {
                    const baseOrigin = parsedUrl.origin;
                    
                    // Inject a base reference point and monkey-patch form submission endpoints
                    const frameworkBaseTag = `<base href="${baseOrigin}/"><script>
                        window.addEventListener('submit', function(e) {
                            var targetForm = e.target;
                            if(targetForm && targetForm.action && !targetForm.action.includes('/gateway')) {
                                targetForm.action = window.location.origin + '/gateway?url=' + encodeURIComponent(targetForm.action);
                            }
                        });
                    </script>`;

                    let processedHtml = htmlBuffer;
                    if (processedHtml.includes('<head>')) {
                        processedHtml = processedHtml.replace('<head>', '<head>' + frameworkBaseTag);
                    } else {
                        processedHtml = frameworkBaseTag + processedHtml;
                    }

                    res.send(processedHtml);
                });
            } else {
                // Pass through binary data streams (Images, CSS, JS) untouched
                proxyRes.pipe(res);
            }
        });

        proxyReq.on('error', (err) => {
            res.status(500).send(`CRITICAL_GATEWAY_ERROR: ${err.message}`);
        });

        proxyReq.end();
    } catch (e) {
        res.status(400).send('STRUCT_FORMAT_ERR: Invalid URL structure.');
    }
});

app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });
app.get('/healthz', (req, res) => { res.status(200).send('OK'); });

app.listen(PORT, () => { console.log(`[SYS_INIT] Upstream service deployment operational on port ${PORT}`); });
