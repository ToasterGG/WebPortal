const express = require('express');
const path = require('path');
const https = require('https');
const http = require('http');
const app = express();

const PORT = process.env.PORT || 8080;

app.use(express.static(__dirname));

// The core engine that bypasses iframe restrictions
app.get('/proxy', (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) {
        return res.status(400).send('Missing target URL');
    }

    try {
        const parsedUrl = new URL(targetUrl);
        const client = parsedUrl.protocol === 'https:' ? https : http;

        const options = {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
            }
        };

        const proxyReq = client.request(parsedUrl, options, (proxyRes) => {
            // Forward the original status code
            res.status(proxyRes.statusCode);

            // Copy all headers from the website EXCEPT the ones that block iframes
            Object.keys(proxyRes.headers).forEach((key) => {
                const lowerKey = key.toLowerCase();
                if (
                    lowerKey !== 'x-frame-options' && 
                    lowerKey !== 'content-security-policy' &&
                    lowerKey !== 'content-security-policy-report-only'
                ) {
                    res.setHeader(key, proxyRes.headers[key]);
                }
            });

            // Stream the website's HTML straight back to the user's iframe
            proxyRes.pipe(res);
        });

        proxyReq.on('error', (err) => {
            res.status(500).send(`Failed to connect to target website: ${err.message}`);
        });

        proxyReq.end();

    } catch (e) {
        res.status(400).send('Invalid URL format. Please include http:// or https://');
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/healthz', (req, res) => {
    res.status(200).send('OK');
});

app.listen(PORT, () => {
    console.log(`Reverse Proxy Server running on port ${PORT}`);
});
