const express = require('express');
const https = require('https');
const http = require('http');
const app = express();

const PORT = process.env.PORT || 10000;

// Enable cross-origin resource sharing for telemetry requests
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

app.get('/gateway', (req, res) => {
    let targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send('SYS_ERR: Missing endpoint parameter.');

    if (targetUrl === 'duckduckgo.com') {
        targetUrl = 'https://duckduckgo.com';
    }

    try {
        const parsedUrl = new URL(targetUrl);
        const client = parsedUrl.protocol === 'https:' ? https : http;

        const options = {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Encoding': 'identity'
            }
        };

        const proxyReq = client.request(parsedUrl, options, (proxyRes) => {
            res.status(proxyRes.statusCode);

            // Strip anti-framing rules
            Object.keys(proxyRes.headers).forEach((key) => {
                const lowerKey = key.toLowerCase();
                if (!['x-frame-options', 'content-security-policy', 'content-security-policy-report-only', 'clear-site-data', 'cross-origin-opener-policy'].includes(lowerKey)) {
                    res.setHeader(key, proxyRes.headers[key]);
                }
            });

            if (proxyRes.headers['content-type'] && proxyRes.headers['content-type'].includes('text/html')) {
                let htmlBuffer = '';
                proxyRes.on('data', chunk => htmlBuffer += chunk);
                proxyRes.on('end', () => {
                    // Inject a base reference point to preserve asset loading paths
                    const baseTag = `<base href="${parsedUrl.origin}/">`;
                    let processedHtml = htmlBuffer.includes('<head>') ? htmlBuffer.replace('<head>', '<head>' + baseTag) : baseTag + htmlBuffer;
                    res.send(processedHtml);
                });
            } else {
                proxyRes.pipe(res);
            }
        });

        proxyReq.on('error', (err) => res.status(500).send(`GATEWAY_ERR: ${err.message}`));
        proxyReq.end();
    } catch (e) {
        res.status(400).send('STRUCT_FORMAT_ERR: Invalid layout formatting.');
    }
});

app.get('/healthz', (req, res) => res.status(200).send('OK'));

app.listen(PORT, () => console.log(`[SYS_INIT] Backend pipeline listening on port ${PORT}`));
