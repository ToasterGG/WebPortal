const express = require('express');
const path = require('path');
const https = require('https');
const http = require('http');
const app = express();

const PORT = process.env.PORT || 8080;

app.use(express.static(__dirname));

app.get('/proxy', (req, res) => {
    let targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send('Missing target URL');

    // Default to duckduckgo html view if requested generally
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
                'Accept-Language': 'en-US,en;q=0.5'
            }
        };

        const proxyReq = client.request(parsedUrl, options, (proxyRes) => {
            // Copy status code
            res.status(proxyRes.statusCode);

            // Strip ALL framing protection headers entirely
            Object.keys(proxyRes.headers).forEach((key) => {
                const lowerKey = key.toLowerCase();
                if (
                    lowerKey !== 'x-frame-options' && 
                    lowerKey !== 'content-security-policy' &&
                    lowerKey !== 'content-security-policy-report-only' &&
                    lowerKey !== 'clear-site-data'
                ) {
                    res.setHeader(key, proxyRes.headers[key]);
                }
            });

            // If the content is HTML, rewrite links so they don't break or escape the frame
            if (proxyRes.headers['content-type'] && proxyRes.headers['content-type'].includes('text/html')) {
                let body = '';
                proxyRes.on('data', chunk => body += chunk);
                proxyRes.on('end', () => {
                    // Force forms and links to point back through your proxy URL
                    const currentProxyBase = `${req.protocol}://${req.get('host')}/proxy?url=`;
                    const baseUrl = parsedUrl.origin;

                    // Basic link replacement trick for relative endpoints
                    let rewrittenBody = body.replace(/(href|src|action)="\/(?!\/)/g, `$1="${baseUrl}/`);
                    
                    res.send(rewrittenBody);
                });
            } else {
                proxyRes.pipe(res);
            }
        });

        proxyReq.on('error', (err) => {
            res.status(500).send(`Connection Error: ${err.message}`);
        });

        proxyReq.end();
    } catch (e) {
        res.status(400).send('Invalid URL formatting.');
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/healthz', (req, res) => {
    res.status(200).send('OK');
});

app.listen(PORT, () => {
    console.log(`Universal Proxy Core listening on port ${PORT}`);
});
