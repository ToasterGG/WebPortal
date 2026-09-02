app.use(express.static(__dirname));

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

// FIXED: Direct route mapping handles incoming bookmarklet frames safely
app.get('/gateway', (req, res) => {
    let rawQueryUrl = req.query.url;

    // FALLBACK: If no URL parameter is defined, serve index.html directly from this endpoint
    if (!rawQueryUrl) {
        return res.sendFile(path.join(__dirname, 'index.html'));
    }

    let targetUrl = String(rawQueryUrl).trim();

    try {
        if (targetUrl.includes('%')) {
            targetUrl = decodeURIComponent(targetUrl);
        }
    } catch (e) {}

    if (targetUrl.toLowerCase() === 'duckduckgo.com' || targetUrl.toLowerCase() === 'https://duckduckgo.com') {
        targetUrl = 'https://duckduckgo.com';
    }

    if (!/^https?:\/\//i.test(targetUrl)) {
        targetUrl = 'https://' + targetUrl;
    }

    let parsedUrl;
    try {
        parsedUrl = new URL(targetUrl);
    } catch (urlErr) {
        return res.status(400).send(`STRUCT_FORMAT_ERR: Unparseable asset string format.`);
    }

    try {
        const networkClient = parsedUrl.protocol === 'https:' ? https : http;

        const options = {
            method: 'GET',
            hostname: parsedUrl.hostname,
            path: parsedUrl.pathname + parsedUrl.search,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'identity',
                'Host': parsedUrl.hostname,
                'Referer': parsedUrl.origin
            }
        };

        const proxyReq = networkClient.request(options, (proxyRes) => {
            if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
                let redirectPath = proxyRes.headers.location;
                if (!/^https?:\/\//i.test(redirectPath)) {
                    redirectPath = parsedUrl.origin + redirectPath;
                }
                return res.redirect(`/gateway?url=${encodeURIComponent(redirectPath)}`);
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
                    
                    const integrationScript = `
                        <base href="${targetBase}/">
                        <script>
                            document.addEventListener('click', function(e) {
                                var anchor = e.target.closest('a');
                                if (anchor && anchor.href && !anchor.href.startsWith('${hostServer}')) {
                                    e.preventDefault();
                                    window.location.href = '${hostServer}/gateway?url=' + encodeURIComponent(anchor.href);
                                }
                            }, true);

                            window.addEventListener('submit', function(e) {
                                var form = e.target;
                                if (form && form.action && !form.action.includes('/gateway')) {
                                    form.action = '${hostServer}/gateway?url=' + encodeURIComponent(form.action);
                                }
                            }, true);
                        </script>
                    `;

                    let processedHtml = htmlBuffer;
                    
                    processedHtml = processedHtml.replace(/src=["']\/([^"']+)["']/g, `src="${hostServer}/gateway?url=${encodeURIComponent(targetBase)}/$1"`);
                    processedHtml = processedHtml.replace(/src=["'](https?:\/\/[^"']+)["']/g, (match, p1) => `src="${hostServer}/gateway?url=${encodeURIComponent(p1)}"`);
                    processedHtml = processedHtml.replace(/href=["']\/([^"']+)["']/g, `href="${hostServer}/gateway?url=${encodeURIComponent(targetBase)}/$1"`);
                    processedHtml = processedHtml.replace(/href=["'](https?:\/\/[^"']+)["']/g, (match, p1) => `href="${hostServer}/gateway?url=${encodeURIComponent(p1)}"`);

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

// Cross-device raw text output route
app.get('/bookmarklet', (req, res) => {
    res.setHeader('Content-Type', 'text/plain');
    res.send(`javascript:(function(){var hostUrl='https://onrender.com containerId='sys-overlay-root';var existing=document.getElementById(containerId);if(existing){existing.style.display=existing.style.display==='none'?'flex':'none';return;}var box=document.createElement('div');box.id=containerId;Object.assign(box.style,{position:'fixed',top:'40px',right:'40px',width:'850px',height:'550px',zIndex:'2147483647',boxShadow:'0 15px 50px rgba(0,0,0,0.6)',borderRadius:'8px',backgroundColor:'#242428',display:'flex',flexDirection:'column',overflow:'hidden',border:'1px solid #323238',fontFamily:'sans-serif'});var titleBar=document.createElement('div');Object.assign(titleBar.style,{backgroundColor:'#242428',padding:'10px 14px',display:'flex',justifyContent:'space-between',alignItems:'center',borderBottom:'1px solid #323238'});var txt=document.createElement('span');txt.innerText='Enterprise Application Network';txt.style.color='#fff';txt.style.fontSize='13px';txt.style.fontWeight='600';var close=document.createElement('button');close.innerText='✕';Object.assign(close.style,{background:'none',border:'none',color:'#aaa',cursor:'pointer',fontSize:'16px'});close.onclick=function(){document.body.removeChild(box);};titleBar.appendChild(txt);titleBar.appendChild(close);var webFrame=document.createElement('iframe');Object.assign(webFrame.style,{width:'100%',flexGrow:'1',border:'none',backgroundColor:'#fff'});webFrame.setAttribute('sandbox','allow-forms allow-modals allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts');webFrame.src=hostUrl;box.appendChild(titleBar);box.appendChild(webFrame);document.body.appendChild(box);})();`);
});

app.listen(PORT, () => console.log(`[SYS_INIT] Proxy cluster operational on port ${PORT}`));
