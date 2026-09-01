const express = require('express');
const path = require('path');
// FIXED: Accessing Rammerhead's specific server module export pattern
const RammerheadServer = require('rammerhead/src/server/RammerheadServer');
const app = express();

// Render requires web services to bind to port 10000 by default
const PORT = process.env.PORT || 10000;

app.use(express.static(__dirname));

// Initialize enterprise rewrite engine with correct constructor assignment
const rh = new RammerheadServer({
    bindingAddress: '0.0.0.0',
    port: PORT,
    prefix: '/rh/',
    logger: {
        info: () => {},
        error: (msg) => console.error(`[SYS_REWRITE_ERR] ${msg}`)
    },
    // Enforce basic structural routing variables
    diskCache: false
});

// Intercept routing directives via Rammerhead middleware layers
app.use((req, res, next) => {
    if (req.url.startsWith('/rh/') || req.url.startsWith('/rammerhead.js')) {
        return rh.handle(req, res);
    }
    next();
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/healthz', (req, res) => {
    res.status(200).send('OK');
});

app.listen(PORT, () => {
    console.log(`[SYS_INIT] Upstream service deployment operational on port ${PORT}`);
});
