const express = require('express');
const https = require('https');
const http = require('http');
const path = require('path');
const app = express();

const PORT = process.env.PORT || 10000;

app.use(express.static(__dirname));

app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

app.get('/gateway', (req, res) => {
    let rawQueryUrl = req.query.url;

    if (!rawQueryUrl) {
        return res.status(400).send('SYS_ERR: Missing destination parameters.');
    }

    let targetUrl = String(rawQueryUrl).trim();

    // Fix double-encoding bugs caused by browser mapping layers
    try {
        if (targetUrl.includes('%')) {
            targetUrl = decodeURIComponent(targetUrl);
        }
    } catch (e) {}

    // Normalize direct shortcut addresses
    if (targetUrl === 'duckduckgo.com' || targetUrl === 'https://duckduckgo.com') {
        targetUrl = 'https://duckduckgo.com';
    }

    // Force basic protocol mapping layout
    if (!/^https?:\/\//i.test(targetUrl)) {
        targetUrl = 'https://' + targetUrl;
    }

    let parsedUrl;
    try {
        // FIXED: Clean up broken relative URLs created by image/script sub-requests
        targetUrl = targetUrl.replace(/https?:\/\/(https?:\/\/)/i, '$1'); 
        targetUrl = targetUrl.replace(/https?:\/\/\/+/g, 'https://');
        
        parsedUrl = new URL(targetUrl);
    } catch (urlErr) {
        // FALLBACK: If asset loading strings are corrupted, process them safely as a clean search parameters query
        targetUrl = 'https://duckduckgo.com?q=' + encodeURIComponent(rawQueryUrl);
        parsedUrl = new URL(targetUrl);
    }

    try {
        let fetchUrl = targetUrl;
        
        // Routinely mask data center IP footprints for search query engines
        if (parsedUrl.hostname.includes('duckduckgo.com') || parsedUrl.hostname.includes('bing.com')) {
            fetchUrl = 'https://allorigins.win' + encodeURIComponent(targetUrl);
        }

        // FIXED: Enforce strict verification controls on the masked URL string layout before initializing the request object
        let finalParsedUrl;
        try {
            finalParsedUrl = new URL(fetchUrl);
        } catch (e) {
            // If the masking URL corrupts, fall back directly to using the parsed target origin path
            fetchUrl = targetUrl;
            finalParsedUrl = parsedUrl;
        }

        const networkClient = finalParsedUrl.protocol === 'https:' ? https : http;

        const options = {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'identity'
            }
        };

        const proxyReq = networkClient.request(finalParsedUrl, options, (proxyRes) => {
            if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
                let redirectPath = proxyRes.headers.location;
                try {
                    if (!/^https?:\/\//i.test(redirectPath)) {
                        redirectPath = parsedUrl.origin + redirectPath;
                    }
                    return res.redirect(`/gateway?url=${encodeURIComponent(redirectPath)}`);
                } catch(e) {
                    return res.status(500).send('STRUCT_FORMAT_ERR: Faulty server redirection header syntax.');
                }
            }

            res.status(proxyRes.statusCode);

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
                    const hostServer = `${req.protocol}://${req.get('host')}`;
                    const targetBase = parsedUrl.origin;
                    
                    let processedHtml = htmlBuffer;

                    // Map relative asset and text links natively to flow completely through your server gateway endpoint
                    processedHtml = processedHtml.replace(/src=["']\/([^"']+)["']/g, `src="${hostServer}/gateway?url=${encodeURIComponent(targetBase)}/$1"`);
                    processedHtml = processedHtml.replace(/src=["'](https?:\/\/[^"']+)["']/g, (match, p1) => `src="${hostServer}/gateway?url=${encodeURIComponent(p1)}"`);
                    processedHtml = processedHtml.replace(/href=["']\/([^"']+)["']/g, `href="${hostServer}/gateway?url=${encodeURIComponent(targetBase)}/$1"`);
                    processedHtml = processedHtml.replace(/href=["'](https?:\/\/[^"']+)["']/g, (match, p1) => `href="${hostServer}/gateway?url=${encodeURIComponent(p1)}"`);

                    const integrationScript = `
                        <base href="${targetBase}/">
                        <script>
                            window.addEventListener('submit', function(e) {
                                var form = e.target;
                                if (form && form.action && !form.action.includes('/gateway')) {
                                    form.action = '${hostServer}/gateway?url=' + encodeURIComponent(form.action);
                                }
                            });
                        </script>
                    `;

                    processedHtml = processedHtml.includes('<head>') ? processedHtml.replace('<head>', '<head>' + integrationScript) : integrationScript + processedHtml;
                    res.send(processedHtml);
                });
            } else {
                proxyRes.pipe(res);
            }
        });

        proxyReq.on('error', (err) => {
            res.status(500).send(`GATEWAY_ERR: ${err.message}`);
        });

        proxyReq.end();
    } catch (e) {
        res.status(500).send(`STRUCT_FORMAT_ERR: Core system runtime failure tracking exception. Trace: ${e.message}`);
    }
});

app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });
app.get('/healthz', (req, res) => { res.status(200).send('OK'); });

app.listen(PORT, () => console.log(`[SYS_INIT] Secure proxy cluster online on port ${PORT}`));
