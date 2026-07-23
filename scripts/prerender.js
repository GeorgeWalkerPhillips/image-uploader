// Runs as "postbuild" (see package.json) — after `react-scripts build` produces
// build/, this boots a static server against that folder, drives a headless
// browser to each indexable route, and overwrites the SPA shell with the
// fully-rendered HTML. Crawlers that don't execute JS (or time out waiting to)
// then see real content instead of the bare `<div id="root">` mount point.
//
// Everything else (/camera, /admin, /login, /gallery, /reset-password) is
// guest/owner app functionality behind auth or a QR code — it's intentionally
// left as client-rendered and is blocked in robots.txt where applicable.
const fs = require('fs');
const path = require('path');
const http = require('http');
const serveHandler = require('serve-handler');
const puppeteer = require('puppeteer');

const BUILD_DIR = path.join(__dirname, '..', 'build');
const PORT = 45678;

const ROUTES = [
  { path: '/', outFile: 'index.html' },
  { path: '/privacy', outFile: path.join('privacy', 'index.html') },
  { path: '/terms', outFile: path.join('terms', 'index.html') },
  { path: '/refund-policy', outFile: path.join('refund-policy', 'index.html') },
];

// Mirrors Vercel's zero-config CRA behavior: serve a real static file if one
// exists at the requested path, otherwise fall back to the SPA shell so
// client-side routes like /privacy resolve instead of 404ing. The shell is
// captured once, in memory, before any route gets prerendered — routes are
// processed one at a time and build/index.html is overwritten after the
// first ("/"), so re-reading it from disk for later routes would serve an
// already-rendered homepage instead of the un-rendered shell.
function startServer(shellHtml) {
  const server = http.createServer((req, res) => {
    const requestedPath = path.join(BUILD_DIR, decodeURIComponent(req.url.split('?')[0]));
    const isRealFile = fs.existsSync(requestedPath) && fs.statSync(requestedPath).isFile();
    if (isRealFile) {
      serveHandler(req, res, { public: BUILD_DIR });
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(shellHtml);
    }
  });
  return new Promise((resolve) => {
    server.listen(PORT, () => resolve(server));
  });
}

// Vercel's build container is missing shared libs (libnspr4.so etc.) that
// Puppeteer's own bundled Chrome needs, so plain puppeteer.launch() fails
// there with "error while loading shared libraries". @sparticuz/chromium
// ships a Chromium build made for that kind of minimal serverless/build
// environment — use it when running on Vercel, and fall back to Puppeteer's
// normal bundled browser for local dev (sparticuz's binary is Linux-only).
async function launchBrowser() {
  if (process.env.VERCEL) {
    const chromium = require('@sparticuz/chromium');
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }
  return puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
}

async function prerender() {
  const shellHtml = fs.readFileSync(path.join(BUILD_DIR, 'index.html'), 'utf8');
  const server = await startServer(shellHtml);
  const browser = await launchBrowser();

  try {
    for (const route of ROUTES) {
      const page = await browser.newPage();
      const url = `http://localhost:${PORT}${route.path}`;
      await page.goto(url, { waitUntil: 'networkidle0' });
      await page.waitForSelector('h1');
      const html = await page.content();
      const outPath = path.join(BUILD_DIR, route.outFile);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, html);
      await page.close();
      console.log(`Prerendered ${route.path} -> build/${route.outFile}`);
    }
  } finally {
    await browser.close();
    server.close();
  }
}

prerender().catch((err) => {
  console.error('Prerender failed:', err);
  process.exit(1);
});
