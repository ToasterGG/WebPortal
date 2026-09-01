const express = require('express');
const path = require('path');
const app = express();

// Use the port provided by the environment (e.g., Render) or default to 8080 locally
const PORT = process.env.PORT || 8080;

// Serve static files (like index.html) from the root directory
app.use(express.static(__path));

// Serve the index.html file at the root URL
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// A simple health check route for monitoring connectivity
app.get('/healthz', (req, res) => {
    res.status(200).send('OK');
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
