const express = require('express');
const https = require('https');
const http = require('http');
const path = require('path');
const app = express();

const PORT = process.env.PORT || 10000;

app.use(express.static(__dirname));

app.get('/gateway', (req, res) => {
    let targetUrl = req.query.url;

    if (!targetUrl) {
        return res.status(400).send('SYS_ERR: Missing destination query parameter. Ensure the target URL is provided via ?url=');
    }

    if (targetUrl === 'duckduckgo.com' || targetUrl === 'https://duckduckgo.com') {
        targetUrl = 'https://duckduckgo.com';
    }

    try {
        const parsedUrl = new URL(targetUrl);
        const client = parsedUrl.protocol === 'https:' ? https : http;

        const options = {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'identity' // Strictly block gzip/brotli compression
            }
        };

        const proxyReq = client.request(parsedUrl, options, (proxyRes) => {
            // Forward original HTTP response codes securely
            res.status(proxyRes.statusCode);

            // Strip out strict cross-origin iframe security rules
            Object.keys(proxyRes.headers).forEach((key) => {
                const lowerKey = key.toLowerCase();
                if (!['x-frame-options', 'content-security-policy', 'content-security-policy-report-only', 'clear-site-data', 'cross-origin-opener-policy'].includes(lowerKey)) {
                    res.setHeader(key, proxyRes.headers[key]);
                }
            });

            // Enforce open CORS configuration to unblock background media transfers
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', '*');

            // Handle server-side redirects recursively
            if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
                let redirectPath = proxyRes.headers.location;
                if (!/^https?:\/\//i.test(redirectPath)) {
                    redirectPath = parsedUrl.origin + redirectPath;
                }
                res.redirect(`/gateway?url=${encodeURIComponent(redirectPath)}`);
                return;
            }

            // HTML Parsing & Direct Link/Asset Translation Layer
            if (proxyRes.headers['content-type'] && proxyRes.headers['content-type'].includes('text/html')) {
                let htmlBuffer = '';
                proxyRes.on('data', chunk => htmlBuffer += chunk);
                proxyRes.on('end', () => {
                    const hostServer = `${req.protocol}://${req.get('host')}`;
                    const targetBase = parsedUrl.origin;
                    
                    let processedHtml = htmlBuffer;

                    // 1. REWRITE ALL RELATIVE AND ABSOLUTE SRC ATTRIBUTES (FOR IMAGES, ICONS, LAYOUTS)
                    processedHtml = processedHtml.replace(/src=["']\/([^"']+)["']/g, `src="${hostServer}/gateway?url=${encodeURIComponent(targetBase)}/$1"`);
                    processedHtml = processedHtml.replace(/src=["'](https?:\/\/[^"']+)["']/g, (match, p1) => `src="${hostServer}/gateway?url=${encodeURIComponent(p1)}"`);

                    // 2. REWRITE ALL LINK HREF ENTIRES (SO CLICKS STAY SECURED INSIDE PROXY LAYOUT)
                    processedHtml = processedHtml.replace(/href=["']\/([^"']+)["']/g, `href="${hostServer}/gateway?url=${encodeURIComponent(targetBase)}/$1"`);
                    processedHtml = processedHtml.replace(/href=["'](https?:\/\/[^"']+)["']/g, (match, p1) => `href="${hostServer}/gateway?url=${encodeURIComponent(p1)}"`);

                    // 3. REWRITE SEARCH AND SYSTEM INPUT FORM SUBMIT PATHS
                    processedHtml = processedHtml.replace(/action=["']\/([^"']+)["']/g, `action="${hostServer}/gateway?url=${encodeURIComponent(targetBase)}/$1"`);
                    processedHtml = processedHtml.replace(/action=["'](https?:\/\/[^"']+)["']/g, (match, p1) => `action="${hostServer}/gateway?url=${encodeURIComponent(p1)}"`);

                    // Inject global fallback anchor tag configurations
                    const baselineTag = `<base href="${targetBase}/">`;
                    if (processedHtml.includes('<head>')) {
                        processedHtml = processedHtml.replace('<head>', '<head>' + baselineTag);
                    } else {
                        processedHtml = baselineTag + processedHtml;
                    }

                    res.send(processedHtml);
                });
            } else {
                // Pass binary formats (Images, PNGs, JPEGs, SVG glyphs) untouched through the server stream
                proxyRes.pipe(res);
            }
        });

        proxyReq.on('error', (err) => res.status(500).send(`CRITICAL_GATEWAY_ERROR: ${err.message}`));
        proxyReq.end();
    } catch (e) {
        res.status(400).send('STRUCT_FORMAT_ERR: Invalid transmission target construction.');
    }
});

app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });
app.get('/healthz', (req, res) => { res.status(200).send('OK'); });

app.listen(PORT, () => console.log(`[SYS_INIT] Autonomous rewriter core active on port ${PORT}`));
