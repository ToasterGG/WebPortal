const express = require('express');
const path = require('path');
const https = require('https');
const http = require('http');
const app = express();

const PORT = process.env.PORT || 8080;

// Serve all frontend files dynamically
app.use(express.static(__dirname));

app.get('/gateway', (req, res) => {
    let target = req.query.url;
    if (!target) return res.status(400).send('Missing target routing URL.');

    if (target === 'duckduckgo.com') {
        target = 'https://duckduckgo.com';
    }

    try {
        const parsedUrl = new URL(target);
        const client = parsedUrl.protocol === 'https:' ? https : http;

        const options = {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'identity' // Strictly forbids gzip/brotli encryption corruption
            }
        };

        const proxyReq = client.request(parsedUrl, options, (proxyRes) => {
            // Mirror connection status
            res.status(proxyRes.statusCode);

            // Strip framing boundaries and cross-origin tracking rules
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

            // Intercept document strings to inject path translation scripts
            if (proxyRes.headers['content-type'] && proxyRes.headers['content-type'].includes('text/html')) {
                let body = '';
                proxyRes.on('data', chunk => body += chunk);
                proxyRes.on('end', () => {
                    const originBase = parsedUrl.origin;
                    const proxyEndpoint = `${req.protocol}://${req.get('host')}/gateway?url=`;

                    // Inject the custom Service Worker registrar directly into the target webpage's header
                    const injectionScript = `
                        <script>
                            if ('serviceWorker' in navigator) {
                                navigator.serviceWorker.register('/sw.js?origin=${encodeURIComponent(originBase)}')
                                .then(() => console.log('Interception system locked.'))
                                .catch(err => console.error('Worker registration failed:', err));
                            }
                        </script>
                    `;

                    // Rewrite paths and insert our injection script
                    let rewritten = body.replace('<head>', '<head>' + injectionScript);
                    rewritten = rewritten.replace(/(href|src|action)="\/(?!\/)/g, `$1="${originBase}/`);
                    rewritten = rewritten.replace(/(href|src|action)=' \/(?!\/)/g, `$1='${originBase}/`);

                    res.send(rewritten);
                });
            } else {
                proxyRes.pipe(res);
            }
        });

        proxyReq.on('error', (err) => {
            res.status(500).send(`Gateway routing failed: ${err.message}`);
        });

        proxyReq.end();
    } catch (e) {
        res.status(400).send('Invalid network destination formatting.');
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/healthz', (req, res) => {
    res.status(200).send('OK');
});

app.listen(PORT, () => {
    console.log(`Interceptor service active on port ${PORT}`);
});
