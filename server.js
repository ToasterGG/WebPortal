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
    let targetUrl = req.query.url;

    if (!targetUrl) {
        return res.status(400).send('SYS_ERR: Missing destination parameters.');
    }

    if (targetUrl === 'duckduckgo.com' || targetUrl === 'https://duckduckgo.com') {
        targetUrl = 'https://duckduckgo.com';
    }

    try {
        // Fix spaces or typos in incoming links dynamically before passing to URL constructor
        targetUrl = targetUrl.trim();
        if (!/^https?:\/\//i.test(targetUrl)) {
            targetUrl = 'https://' + targetUrl;
        }

        let parsedUrl;
        try {
            parsedUrl = new URL(targetUrl);
        } catch (urlErr) {
            // FAIL-SAFE: If a dynamic background script sends a broken relative path, drop out safely
            return res.status(400).send(`STRUCT_FORMAT_ERR: Unparseable asset string format.`);
        }
        
        // Routinely mask the data center IP signature for known search engine backends
        let fetchUrl = targetUrl;
        if (parsedUrl.hostname.includes('duckduckgo.com') || parsedUrl.hostname.includes('bing.com')) {
            fetchUrl = 'https://allorigins.win' + encodeURIComponent(targetUrl);
        }

        const finalParsedUrl = new URL(fetchUrl);
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
            // Forward redirection updates transparently down the line
            if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
                let redirectPath = proxyRes.headers.location;
                try {
                    // Normalize the target redirect location safely
                    if (!/^https?:\/\//i.test(redirectPath)) {
                        redirectPath = parsedUrl.origin + redirectPath;
                    }
                    return res.redirect(`/gateway?url=${encodeURIComponent(redirectPath)}`);
                } catch(e) {
                    return res.status(500).send('STRUCT_FORMAT_ERR: Faulty server redirection header syntax.');
                }
            }

            res.status(proxyRes.statusCode);

            // Dismantle modern framing defenses and tracking restrictions
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

                    // Standardize asset references safely
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
