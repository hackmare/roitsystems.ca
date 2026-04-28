'use strict';

const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs').promises;
const { execFileSync } = require('child_process');
const MarkdownIt = require('markdown-it');

const app = express();
const PORT = process.env.PORT || 8080;
const DEFAULT_API_BASE_URL = 'https://pubapi.roitsystems.ca';
const API_BASE_URL = process.env.API_BASE_URL || DEFAULT_API_BASE_URL;

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function blogUrlPath(value) {
  return String(value ?? '')
    .split(/[\\/]+/)
    .map(encodeURIComponent)
    .join('/');
}

async function getGitDateOrMtime(fullPath) {
  const gitPath = path.relative(__dirname, fullPath);
  try {
    const date = execFileSync(
      'git',
      ['log', '--follow', '-1', '--format=%ai', '--', gitPath],
      { cwd: __dirname, encoding: 'utf8' },
    ).trim();
    if (date) return date;
  } catch {
    // Fallback to file mtime if git is unavailable in the runtime image.
  }

  const stats = await fs.stat(fullPath);
  return stats.mtime.toISOString();
}

function blogImageSlug(blogPath) {
  return path.basename(blogPath, path.extname(blogPath))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function getBlogImages(blogPath, absoluteUrlBase = '') {
  const slug = blogImageSlug(blogPath);
  const publicImageDir = path.join(__dirname, 'public', 'images', 'blog', slug);
  const publicImageUrl = `/images/blog/${slug}`;
  const images = {};

  for (const variant of ['card', 'hero', 'social']) {
    if (await fileExists(path.join(publicImageDir, `${variant}.png`))) {
      images[variant] = `${absoluteUrlBase}${publicImageUrl}/${variant}.png`;
    }
  }

  // Backward-compatible fallback for older generated sibling images.
  const legacyImagePath = path.join(__dirname, 'blog', blogPath.replace(/\.md$/, '.png'));
  if (await fileExists(legacyImagePath)) {
    const legacyUrl = `${absoluteUrlBase}/blog/${blogUrlPath(blogPath.replace(/\.md$/, '.png'))}`;
    images.card ??= legacyUrl;
    images.hero ??= legacyUrl;
    images.social ??= legacyUrl;
  }

  return images;
}

function extractMarkdownTitle(content) {
  return content
    .split('\n')
    .find(line => line.trim().startsWith('# '))
    ?.replace(/^#\s+/, '')
    .trim() || 'Untitled';
}

function cleanMarkdownText(value) {
  return String(value ?? '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`[\]]/g, '')
    .replace(/^#+\s*/, '')
    .trim();
}

function extractTeaser(content) {
  let foundTitle = false;

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('# ')) {
      foundTitle = true;
      continue;
    }
    if (
      foundTitle &&
      trimmed &&
      !trimmed.startsWith('#') &&
      !trimmed.startsWith('>') &&
      !/^\*\*[^*]+\*\*$/.test(trimmed) &&
      trimmed.length > 10
    ) {
      const firstParagraph = cleanMarkdownText(trimmed);
      const sentences = firstParagraph.split('.').filter(s => s.trim().length > 0);
      const firstTwoSentences = sentences.slice(0, 2).join('.').trim();
      return firstTwoSentences ? firstTwoSentences + (firstTwoSentences.endsWith('.') ? '' : '.') : '';
    }
  }

  return '';
}

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
          'https://cdn.jsdelivr.net',
        ],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'"],
        connectSrc: [
          "'self'",
          API_BASE_URL,
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
  res.type('application/javascript');
  res.send(`window.__ROIT_CONFIG__ = { apiBaseUrl: ${JSON.stringify(API_BASE_URL)} };`);
});

// Blog API: scan /blog directory and return metadata for markdown files
app.get('/api/blog', async (_req, res) => {
  try {
    const blogDir = path.join(__dirname, 'blog');
    const sections = {};

    async function processDirectory(dir, section = '') {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await processDirectory(fullPath, entry.name);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          const blogPath = path.relative(blogDir, fullPath).split(path.sep).join('/');
          const content = await fs.readFile(fullPath, 'utf8');
          const title = extractMarkdownTitle(content);
          const teaser = extractTeaser(content);

          // Calculate read time (approximately 200 words per minute)
          const wordCount = content.split(/\s+/).length;
          const readTimeMinutes = Math.max(1, Math.ceil(wordCount / 200));

          const date = await getGitDateOrMtime(fullPath);
          const images = await getBlogImages(blogPath);
          if (!sections[section]) sections[section] = [];
          sections[section].push({ title, date, path: blogPath, teaser, readTimeMinutes, images });
        }
      }
    }

    await processDirectory(blogDir);
    res.json({ sections });
  } catch (error) {
    console.error('Error fetching blog data:', error);
    res.status(500).json({ error: 'Failed to fetch blog data' });
  }
});

// Serve blog posts (markdown → HTML) and legacy sibling PNG images
app.get('/blog/:path(*)', async (req, res) => {
  const blogDir = path.join(__dirname, 'blog');
  const requestedPath = req.params.path;
  const resolvedPath = path.join(blogDir, requestedPath);

  // Block path traversal
  if (!resolvedPath.startsWith(blogDir + path.sep)) {
    return res.status(403).send('Forbidden');
  }

  // Serve PNG images directly
  if (requestedPath.endsWith('.png')) {
    try {
      await fs.access(resolvedPath);
      return res.sendFile(resolvedPath);
    } catch {
      return res.status(404).send('Not found');
    }
  }

  try {
    const filePath = resolvedPath;
    if (!filePath.endsWith('.md')) {
      return res.status(404).send('Not found');
    }

    const markdown = await fs.readFile(filePath, 'utf8');
    const md = new MarkdownIt({ linkify: true });
    const defaultFence = md.renderer.rules.fence || ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
    md.renderer.rules.fence = (tokens, idx, options, env, self) => {
      const token = tokens[idx];
      const lang = token.info.trim().split(/\s+/)[0].toLowerCase();
      if (lang === 'mermaid') {
        return `<div class="mermaid-card"><div class="mermaid">${escapeHtml(token.content)}</div></div>`;
      }
      return defaultFence(tokens, idx, options, env, self);
    };
    const htmlContent = md.render(markdown);
    const hasMermaid = htmlContent.includes('class="mermaid"');

    // Extract title from markdown
    const title = extractMarkdownTitle(markdown);
    const ogDescription = `${extractTeaser(markdown)} Read more...`;

    // Construct current URL for sharing
    const currentUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

    const absoluteUrlBase = `${req.protocol}://${req.get('host')}`;
    const blogImages = await getBlogImages(req.params.path, absoluteUrlBase);
    const ogImageUrl = blogImages.social || null;
    const heroImageUrl = blogImages.hero || null;

    // Get recent blog posts for sidebar
    const blogDir = path.join(__dirname, 'blog');
    const recentPosts = [];

    async function getRecentPosts(dir) {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await getRecentPosts(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          const blogPath = path.relative(blogDir, fullPath).split(path.sep).join('/');
          const content = await fs.readFile(fullPath, 'utf8');
          const title = extractMarkdownTitle(content);
          const teaser = extractTeaser(content);

          // Calculate read time (approximately 200 words per minute)
          const wordCount = content.split(/\s+/).length;
          const readTimeMinutes = Math.max(1, Math.ceil(wordCount / 200));

          const date = await getGitDateOrMtime(fullPath);
          const images = await getBlogImages(blogPath);

          recentPosts.push({ title, date, path: blogPath, teaser, readTimeMinutes, images });
        }
      }
    }

    await getRecentPosts(blogDir);
    recentPosts.sort((a, b) => new Date(b.date) - new Date(a.date));
    const sidebarPosts = recentPosts.slice(0, 10);

    // Generate sidebar HTML
    const sidebarHtml = sidebarPosts.map(post => `
      <a href="/blog/${blogUrlPath(post.path)}" class="block p-4 border-b border-slate-100 hover:bg-slate-50 transition-colors ${req.params.path === post.path ? 'bg-blue-50 border-blue-200' : ''}">
        <h4 class="font-semibold text-slate-900 mb-2">${escapeHtml(post.title)}</h4>
        ${post.teaser ? `<p class="text-sm text-slate-600 line-clamp-3 mb-2">${escapeHtml(post.teaser)}</p>` : ''}
        <div class="flex items-center justify-between text-xs text-slate-500">
          <span>${escapeHtml(new Date(post.date).toLocaleDateString())}</span>
          <span>${post.readTimeMinutes} min read</span>
        </div>
      </a>
    `).join('');

    // Simple HTML template
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)} | RO IT Systems</title>
  <meta name="description" content="${escapeHtml(ogDescription)}" />
  <meta property="og:type" content="article" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(ogDescription)}" />
  <meta property="og:url" content="${escapeHtml(currentUrl)}" />
  ${ogImageUrl ? `<meta property="og:image" content="${escapeHtml(ogImageUrl)}" />` : ''}
  <meta name="twitter:card" content="${ogImageUrl ? 'summary_large_image' : 'summary'}" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(ogDescription)}" />
  ${ogImageUrl ? `<meta name="twitter:image" content="${escapeHtml(ogImageUrl)}" />` : ''}
  <script src="/config.js"></script>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/lucide@latest"></script>
  <style>
    html { scroll-behavior: smooth; }
    body {
      background:
        radial-gradient(circle at top left, rgba(147, 197, 253, 0.22), transparent 28%),
        radial-gradient(circle at top right, rgba(59, 130, 246, 0.10), transparent 24%),
        #f8fafc;
    }
    .prose {
      max-width: none;
    }
    .prose h1 {
      font-size: 2.25rem;
      font-weight: 700;
      margin-top: 2rem;
      margin-bottom: 1rem;
    }
    .prose h2 {
      font-size: 1.875rem;
      font-weight: 600;
      margin-top: 2rem;
      margin-bottom: 1rem;
    }
    .prose h3 {
      font-size: 1.5rem;
      font-weight: 600;
      margin-top: 1.5rem;
      margin-bottom: 0.75rem;
    }
    .prose p {
      margin-bottom: 1rem;
      line-height: 1.75;
    }
    .prose a {
      color: #2563eb;
      text-decoration: underline;
      text-underline-offset: 2px;
    }
    .prose a:hover {
      color: #1e3a8a;
    }
    .prose ul, .prose ol {
      margin-bottom: 1rem;
      padding-left: 1.5rem;
    }
    .prose li {
      margin-bottom: 0.5rem;
    }
    .prose code {
      background-color: #f1f5f9;
      padding: 0.125rem 0.25rem;
      border-radius: 0.25rem;
      font-size: 0.875em;
    }
    .prose pre {
      background-color: #f1f5f9;
      padding: 1rem;
      border-radius: 0.5rem;
      overflow-x: auto;
      margin-bottom: 1rem;
    }
    .prose .mermaid-card {
      margin: 2rem 0;
      overflow-x: auto;
      border: 1px solid #dbeafe;
      border-radius: 1rem;
      background: rgba(255, 255, 255, 0.86);
      padding: 1rem;
      box-shadow: 0 18px 50px rgba(15, 23, 42, 0.08);
    }
    .prose .mermaid {
      display: flex;
      min-width: 620px;
      justify-content: center;
    }
    .prose .mermaid svg {
      height: auto;
      max-width: 100%;
    }
    @media (max-width: 640px) {
      .prose .mermaid-card {
        border-radius: 0.75rem;
        padding: 0.75rem;
      }
      .prose .mermaid {
        min-width: 520px;
      }
    }
    .prose blockquote {
      border-left: 4px solid #e2e8f0;
      padding-left: 1rem;
      margin-bottom: 1rem;
      font-style: italic;
    }
    .prose table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 1rem;
    }
    .prose th, .prose td {
      border: 1px solid #e2e8f0;
      padding: 0.5rem;
    }
    .prose th {
      background-color: #f8fafc;
      font-weight: 600;
    }
    .line-clamp-2 {
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .line-clamp-3 {
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
  </style>
</head>
<body class="min-h-screen text-slate-900 antialiased">
  <header class="sticky top-0 z-50 border-b border-slate-200/70 bg-white/70 backdrop-blur-xl">
    <div class="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
      <a href="/" class="flex items-center gap-3">
        <div class="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-blue-900 to-blue-600 text-sm font-bold text-white shadow-lg shadow-blue-500/20">RO</div>
        <div>
          <div class="text-lg font-semibold tracking-tight">RO IT Systems</div>
          <div class="text-sm text-slate-500">Responsible AI &bull; Data Governance &bull; Platform Consulting &bull; Turnkey Agentic AI Solutions</div>
        </div>
      </a>
      <nav class="hidden items-center gap-1 md:flex">
        <a href="/" class="page-link rounded-full px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-950">Home</a>
        <a href="/#approach" class="page-link rounded-full px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-950">Approach</a>
        <a href="/#services" class="page-link rounded-full px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-950">Services</a>
        <a href="/#outcomes" class="page-link rounded-full px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-950">Outcomes</a>
        <a href="/#about" class="page-link rounded-full px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-950">About</a>
        <a href="/#insights" class="page-link rounded-full px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-950">Insights</a>
        <a href="/#contact" class="page-link rounded-full px-4 py-2 text-sm font-semibold text-blue-900 shadow-sm transition hover:-translate-y-0.5">Contact</a>
      </nav>
    </div>
  </header>

  <main class="px-4 py-8 sm:px-6 lg:px-8">
    <div class="mx-auto max-w-7xl grid grid-cols-1 lg:grid-cols-4 gap-8">
      <!-- Sidebar -->
      <aside class="lg:col-span-1">
        <div class="sticky top-24">
          <h3 class="text-lg font-semibold text-slate-900 mb-4">Recent Posts</h3>
          <div class="space-y-1">
            ${sidebarHtml}
          </div>
        </div>
      </aside>

      <!-- Main content -->
      <div class="lg:col-span-3">
        <article class="prose prose-slate max-w-none">
          ${heroImageUrl ? `<img src="${escapeHtml(heroImageUrl)}" alt="${escapeHtml(title)}" class="w-full rounded-xl mb-8" style="max-height:420px;object-fit:cover;" />` : ''}
          ${htmlContent}
        </article>
        <div class="mt-8 pt-8 border-t border-slate-200">
          <div class="flex gap-4">
            <button type="button" id="backButton" class="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
              <i data-lucide="arrow-left" class="h-4 w-4"></i>
              Back
            </button>
            <a href="/" class="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-900 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors">
              <i data-lucide="home" class="h-4 w-4"></i>
              Home
            </a>
          </div>
          <div class="mt-6 pt-6 border-t border-slate-100">
            <h4 class="text-sm font-semibold text-slate-900 mb-3">Share this post</h4>
            <div class="flex gap-3">
              <a href="https://www.facebook.com/dialog/share?href=${encodeURIComponent(currentUrl)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
                <i data-lucide="facebook" class="h-4 w-4"></i>
                Facebook
              </a>
              <a href="https://twitter.com/intent/tweet?url=${encodeURIComponent(currentUrl)}&text=${encodeURIComponent(title)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-black rounded-lg hover:bg-gray-800 transition-colors">
                <i data-lucide="twitter" class="h-4 w-4"></i>
                X
              </a>
              <a href="https://www.threads.net/intent/post?url=${encodeURIComponent(currentUrl)}&text=${encodeURIComponent(title)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 transition-colors">
                <i data-lucide="message-circle" class="h-4 w-4"></i>
                Threads
              </a>
              <a href="mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(currentUrl)}" class="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">
                <i data-lucide="mail" class="h-4 w-4"></i>
                Email
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  </main>

  <script>
    document.getElementById('backButton')?.addEventListener('click', () => history.back());
    lucide.createIcons();
  </script>
  ${hasMermaid ? `<script type="module">
    import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.esm.min.mjs';
    mermaid.initialize({
      startOnLoad: true,
      securityLevel: "strict",
      theme: "base"
    });
  </script>` : ''}
</body>
</html>`;

    res.type('text/html');
    res.send(html);
  } catch (error) {
    console.error('Error serving blog post:', error);
    res.status(404).send('Blog post not found');
  }
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
