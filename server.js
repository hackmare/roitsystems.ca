const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

// Expose runtime config to the browser without baking secrets into HTML.
// Set API_BASE_URL in the environment before starting (e.g. https://api.roitsystems.ca).
app.get('/config.js', (_req, res) => {
  const apiBaseUrl = process.env.API_BASE_URL || '';
  res.type('application/javascript');
  res.send(`window.__ROIT_CONFIG__ = { apiBaseUrl: ${JSON.stringify(apiBaseUrl)} };`);
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
