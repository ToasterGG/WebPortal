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
                'Accept-Language': 'en-US,en;q=0.5',
                // FIX: Force the target website to send uncompressed plain text (No gzip/brotli)
                'Accept-Encoding': 'identity'
            }
        };

        const proxyReq = client.request(parsedUrl, options, (proxyRes) => {
            res.status(proxyRes.statusCode);

            // Strip out anti-framing rules
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

            // Process text/html files to inject absolute path routing
            if (proxyRes.headers['content-type'] && proxyRes.headers['content-type'].includes('text/html')) {
                let body = '';
                proxyRes.on('data', chunk => body += chunk);
                proxyRes.on('end', () => {
                    const baseUrl = parsedUrl.origin;
                    
                    // Convert relative assets and paths to absolute links using the target origin
                    let rewrittenBody = body
                        .replace(/(href|src|action)="\/(?!\/)/g, `$1="${baseUrl}/`)
                        .replace(/(href|src|action)=' \/(?!\/)/g, `$1='${baseUrl}/`);
                    
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
    console.log(`Core Hub operational on port ${PORT}`);
});
