'use strict';

const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

// DigitalOcean App Platform sits behind a load balancer; trust one proxy hop.
app.set('trust proxy', 1);

// Security headers via Helmet.
// CSP allows CDN scripts (Tailwind, Lucide) and the API backend.
// 'unsafe-inline' for scripts/styles is required because the page uses inline
// <script> and <style> blocks. Tightening this requires a build step with nonces.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://cdn.tailwindcss.com',
          'https://unpkg.com',
        ],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'"],
        connectSrc: [
          "'self'",
          process.env.API_BASE_URL || 'https://pubapi.roitsystems.ca',
        ],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'", 'mailto:'],
      },
    },
    // X-Powered-By is removed by Helmet automatically
    frameguard: { action: 'deny' }, // no framing needed on a public consulting site
    crossOriginEmbedderPolicy: false, // not needed for a public static site
  }),
);

// Global rate limit: prevents request flooding on any endpoint.
// Static assets are cheap to serve; /config.js is the only dynamic path.
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again in a moment.' },
});
app.use(globalLimiter);

// Request body size guard (no JSON body expected; belt-and-suspenders).
app.use(express.json({ limit: '10kb' }));

// Expose runtime config to the browser without baking secrets into HTML.
// Set API_BASE_URL in the environment before starting.
app.get('/config.js', (_req, res) => {
  const apiBaseUrl = process.env.API_BASE_URL || '';
  res.type('application/javascript');
  res.send(`window.__ROIT_CONFIG__ = { apiBaseUrl: ${JSON.stringify(apiBaseUrl)} };`);
});

// Static assets. dotfiles (like .env) are denied by the 'deny' default.
app.use(
  express.static(path.join(__dirname, 'public'), {
    dotfiles: 'deny',
    index: false, // explicit — index.html served by the catch-all below
  }),
);

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

function shutdown(signal) {
  console.log(`${signal} received — shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
