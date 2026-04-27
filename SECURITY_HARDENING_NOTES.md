# Security Hardening Notes — roitsystems.ca

## Assessment Summary

This is a minimal Express static-file server with one dynamic endpoint (`/config.js`).
The attack surface is small but the previous configuration had no security headers,
no rate limiting, and no production hardening applied.

---

## Risks Found

| # | Risk | Severity | Status |
|---|------|----------|--------|
| 1 | No HTTP security headers (no CSP, X-Frame-Options, HSTS, etc.) | High | Fixed |
| 2 | `X-Powered-By: Express` header leaked server technology | Medium | Fixed (Helmet) |
| 3 | No rate limiting — /config.js and static routes unprotected | Medium | Fixed |
| 4 | No request body size limit | Low | Fixed |
| 5 | CDN resources (Tailwind, Lucide) loaded without SRI hashes | Medium | Documented (manual) |
| 6 | No graceful shutdown handler | Low | Fixed |
| 7 | `express.static` default dotfiles behaviour not explicitly set | Low | Fixed (deny) |
| 8 | No `.env.example` or `.npmrc` | Low | Fixed |
| 9 | `npm audit` not part of scripts | Low | Fixed |

---

## Changes Made

### `server.js`
- Added `helmet` with a Content Security Policy allowing the Tailwind CDN and Lucide
  CDN scripts, inline scripts/styles (required — no build step), and connecting only
  to `self` and the configured API backend.
- Set `app.set('trust proxy', 1)` for correct IP detection behind DigitalOcean's load balancer.
- Added `express-rate-limit`: 120 requests / 60 seconds globally.
- Added `express.json({ limit: '10kb' })` body size guard (no JSON expected, belt-and-suspenders).
- Set `dotfiles: 'deny'` on `express.static` to block access to `.env`, `.git`, etc.
- Added graceful shutdown on SIGTERM and SIGINT with a 10-second hard timeout.

### `package.json`
- Added `helmet` and `express-rate-limit` to production dependencies.
- Added `audit` and `test` npm scripts.

### `.npmrc` (new)
- `audit=true`: runs `npm audit` automatically on install.
- `fund=false`: suppresses funding messages.

### `.env.example` (new)
- Documents required environment variables with placeholder values.
- Provides a clear contract for DigitalOcean App Platform configuration.

### `.gitignore`
- Added `.env.local`, `.env.*.local`, `Thumbs.db`, `npm-debug.log*`, `*.swp`, `*.swo`.

---

## npm audit Results

`npm audit` passes with 0 vulnerabilities across all 73 production and dev dependencies.

---

## Remaining Risks and Manual Follow-up

### 1. CDN Subresource Integrity (SRI) — Manual Action Required

`index.html` loads two CDN scripts without integrity hashes:
- `https://cdn.tailwindcss.com` (Tailwind CDN build script)
- `https://unpkg.com/lucide@latest` (Lucide icon library)

**Risk:** A CDN compromise could inject malicious JavaScript into the page.

**Recommended fix:** Pin specific versions and add `integrity` + `crossorigin` attributes:
```html
<script src="https://unpkg.com/lucide@0.x.y/dist/umd/lucide.min.js"
  integrity="sha384-<hash>"
  crossorigin="anonymous"></script>
```
Compute hashes with: `curl -s <URL> | openssl dgst -sha384 -binary | openssl base64 -A`

**Better long-term fix:** Replace the Tailwind CDN play script with a proper build step
(Tailwind CLI) and bundle Lucide locally. This eliminates CDN dependency entirely.

### 2. CSP `unsafe-inline` for Scripts — Manual Action Required

The Content Security Policy includes `'unsafe-inline'` for `script-src` because
the page uses an inline `<script>` block. This weakens XSS protection.

**Recommended fix:** Extract the inline script to a `/static/app.js` file served
from `public/`. Then the CSP can remove `'unsafe-inline'` from `script-src`.

### 3. HTTPS Enforcement

HTTPS is handled entirely by DigitalOcean App Platform (TLS termination at the edge).
The Express app itself receives plain HTTP internally and has no HTTPS logic.
This is correct for this deployment model.

No action required, but confirm App Platform forces HTTPS redirect in the DigitalOcean console.

### 4. Fastify Vulnerabilities (roitsystems-infra, not this repo)

See `roitsystems-infra/SECURITY_HARDENING_NOTES.md` for the Fastify upgrade path.
