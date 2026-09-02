const express = require('express');
const path = require('path');
const https = require('https');
const http = require('http');
const app = express();

const PORT = process.env.PORT || 10000;

app.use(express.static(__dirname));

app.get('/gateway', (req, res) => {
    let targetUrl = req.query.url;
    
    // Catch-all structural routing fallback for blank parameters or raw endpoints
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
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'identity' // Prevents gzip/brotli compression layout corruption
            }
        };

        const proxyReq = client.request(parsedUrl, options, (proxyRes) => {
            res.status(proxyRes.statusCode);

            // Strip modern framing locks and access boundaries
            Object.keys(proxyRes.headers).forEach((key) => {
                const lowerKey = key.toLowerCase();
                if (!['x-frame-options', 'content-security-policy', 'content-security-policy-report-only', 'clear-site-data', 'cross-origin-opener-policy'].includes(lowerKey)) {
                    res.setHeader(key, proxyRes.headers[key]);
                }
            });

            // Enforce open access control parameters
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

            // HTML Processing & Link / Form Interception Layer
            if (proxyRes.headers['content-type'] && proxyRes.headers['content-type'].includes('text/html')) {
                let htmlBuffer = '';
                proxyRes.on('data', chunk => htmlBuffer += chunk);
                proxyRes.on('end', () => {
                    const hostUrl = `${req.protocol}://${req.get('host')}`;
                    const baseOrigin = parsedUrl.origin;
                    
                    // Form Submission Interceptor: Captures clicks and forces them through your Render path
                    const networkScript = `
                        <script>
                            window.addEventListener('submit', function(e) {
                                var form = e.target;
                                if (form && form.action && !form.action.includes('/gateway')) {
                                    // Intercept action routing paths
                                    form.action = '${hostUrl}/gateway?url=' + encodeURIComponent(form.action);
                                }
                            });
                        </script>
                    `;

                    let processedHtml = htmlBuffer;

                    // Fix images by forcefully re-routing relative URLs through your proxy gateway instead of the source domain
                    processedHtml = processedHtml.replace(/(href|src|action)="\/(?!\/)/g, `$1="${hostUrl}/gateway?url=${encodeURIComponent(baseOrigin)}/`);
                    processedHtml = processedHtml.replace(/(href|src|action)=' \/(?!\/)/g, `$1='${hostUrl}/gateway?url=${encodeURIComponent(baseOrigin)}/`);

                    // Attach the form submission monitor into the head layout
                    if (processedHtml.includes('<head>')) {
                        processedHtml = processedHtml.replace('<head>', '<head>' + networkScript);
                    } else {
                        processedHtml = networkScript + processedHtml;
                    }

                    res.send(processedHtml);
                });
            } else {
                // Instantly pass through non-HTML binary media data (PNGs, JPEGs, SVG Icons)
                proxyRes.pipe(res);
            }
        });

        proxyReq.on('error', (err) => {
            res.status(500).send(`CRITICAL_GATEWAY_ERROR: ${err.message}`);
        });

        proxyReq.end();
    } catch (e) {
        res.status(400).send('STRUCT_FORMAT_ERR: Invalid request destination format.');
    }
});

app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });
app.get('/healthz', (req, res) => { res.status(200).send('OK'); });

app.listen(PORT, () => { console.log(`[SYS_INIT] Standalone proxy gateway active on port ${PORT}`); });
