// Generates the Wedding Planner marketing images in public/wedding-planner/:
// phone screenshots of the real app screens (as WebP) plus the 1200x630 Open
// Graph share image. NOT part of the build or the tests; run it by hand when
// the app UI changes, then look at every image before committing.
//
//   1. Build the app with dummy Supabase env (nothing is ever contacted):
//        REACT_APP_SUPABASE_URL=https://example.supabase.co \
//        REACT_APP_SUPABASE_ANON_KEY=dummy CI=false npm run build
//   2. Run this script. It needs `playwright-core` (not a project dependency,
//      so `npm i --no-save playwright-core` or point NODE_PATH at a copy), a
//      Chromium (CHROMIUM_PATH, default /opt/pw-browsers/chromium-1194/...)
//      and python3 with Pillow for the WebP conversion:
//        node scripts/generate-planner-screenshots.js
//      Optional: RAW_DIR=/some/dir keeps the lossless PNGs for inspection.
//
// Everything runs against a fully mocked Supabase (route interception) fed by
// scripts/planner-screenshot-fixtures.js, which is entirely fictional data.
const { chromium } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const handler = require('serve-handler');
const fx = require('./planner-screenshot-fixtures');

const REPO = path.join(__dirname, '..');
const OUT = path.join(REPO, 'public', 'wedding-planner');
const RAW = process.env.RAW_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'planner-shots-'));
const CHROME = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 4192;
const BASE = `http://localhost:${PORT}`;
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(RAW, { recursive: true });

const server = http.createServer((req, res) =>
  handler(req, res, { public: path.join(REPO, 'build'), rewrites: [{ source: '**', destination: '/index.html' }] }));

const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const exp = Math.floor(Date.now() / 1000) + 86400 * 30;
const session = (id, name) => {
  const jwt = `${b64u({ alg: 'HS256', typ: 'JWT' })}.${b64u({ sub: id, exp, role: 'authenticated', aud: 'authenticated' })}.fakesig`;
  return {
    access_token: jwt, refresh_token: 'demo-refresh', token_type: 'bearer', expires_in: 86400 * 30, expires_at: exp,
    user: { id, aud: 'authenticated', role: 'authenticated', email: `${name.toLowerCase()}@example.com`, is_anonymous: false, user_metadata: { full_name: name }, app_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
  };
};

// Opens a fake realtime socket that accepts every subscription, so the app
// shows "Live" instead of "Reconnecting".
async function mockRealtime(ctx) {
  await ctx.routeWebSocket(/example\.supabase\.co\/realtime/, (ws) => {
    ws.onMessage((raw) => {
      let m;
      try { m = JSON.parse(String(raw)); } catch (e) { return; }
      const arr = Array.isArray(m);
      const [joinRef, ref, topic, event, payload] = arr ? m : [null, m.ref, m.topic, m.event, m.payload];
      let reply = null;
      if (event === 'phx_join') {
        const changes = ((payload.config && payload.config.postgres_changes) || []).map((c, i) => ({ id: i + 1, ...c }));
        reply = { status: 'ok', response: { postgres_changes: changes } };
      } else if (event === 'heartbeat') {
        reply = { status: 'ok', response: {} };
      } else if (event === 'phx_leave') {
        reply = { status: 'ok', response: {} };
      }
      if (!reply) return;
      const out = arr ? [joinRef, ref, topic, 'phx_reply', reply] : { topic, event: 'phx_reply', payload: reply, ref };
      ws.send(JSON.stringify(out));
    });
  });
}

async function makeContext(browser, { who }) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
    serviceWorkers: 'block',
  });
  await ctx.clock.setFixedTime(fx.NOW_ISO);
  const sess = who.session;
  await ctx.addInitScript((s) => { try { localStorage.setItem('sb-example-auth-token', JSON.stringify(s)); } catch (e) { /* ignore */ } }, sess);
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' };
  const json = (route, body, status = 200) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const status = who.status;
  await ctx.route('**/*', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.hostname === 'localhost') return route.continue();
    if (url.hostname !== 'example.supabase.co') {
      if (/fonts\.(googleapis|gstatic)\.com/.test(url.hostname)) return route.abort();
      return route.abort();
    }
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const p = url.pathname;
    if (p === '/auth/v1/user') return json(route, sess.user);
    if (p === '/auth/v1/token') return json(route, sess);
    if (p.startsWith('/storage/v1/')) return json(route, { signedURL: '/none' });
    if (p === '/rest/v1/rpc/my_wedding_planner_status') return json(route, status);
    if (p === '/rest/v1/rpc/wedding_people') return json(route, fx.people);
    if (p === '/rest/v1/rpc/my_collab_wedding') return json(route, [{ id: fx.WID, name: fx.wedding.name, wedding_date: fx.wedding.wedding_date.slice(0, 10) }]);
    if (p === '/rest/v1/wedding_members') {
      if (url.searchParams.get('user_id')) return json(route, who.member ? [{ role: 'groom', display_name: 'Ada', wedding: fx.wedding }] : []);
      return json(route, [{ role: 'groom', display_name: 'Ada' }, { role: 'bride', display_name: 'Ben' }]);
    }
    if (p === '/rest/v1/wedding_weddings') return json(route, [fx.wedding]);
    if (p === '/rest/v1/wedding_invites') return json(route, fx.invites);
    if (p === '/rest/v1/wedding_reminder_settings') return json(route, [fx.reminderSettings]);
    if (p === '/rest/v1/wedding_tasks') return json(route, who.tasks);
    if (p.startsWith('/rest/v1/')) {
      const rows = fx.tables[p.replace('/rest/v1/', '')];
      return json(route, Array.isArray(rows) ? rows : []);
    }
    return json(route, {});
  });
  await mockRealtime(ctx);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  pageerror:', e.message));
  return { ctx, page };
}

// Where to start the 390x844 frame. Shots are cut out of a full-height render
// (not a scrolled viewport) so the sticky header only ever appears at the top
// and the floating tab bar only at the very bottom, never over mid-page content.
async function frameY(locator, offset) {
  await locator.waitFor();
  return locator.evaluate((el, off) => Math.max(0, Math.round(el.getBoundingClientRect().top + window.scrollY - off)), offset);
}

const couple = { session: session('u-1', 'Ada'), member: true, tasks: fx.tables.wedding_tasks, status: { entitled: true, wedding_id: fx.WID, access: 'partner', role: 'groom' } };
const helper = { session: session('u-3', 'Sam'), member: false, tasks: fx.helperTasks, status: { entitled: false, wedding_id: fx.WID, access: 'collaborator', role: null } };

// name -> how to reach and frame the screen. Names become public file names.
const SHOTS = [
  { name: 'wedding-planner-home-dashboard', who: couple, url: '/hq/', ready: (p) => p.getByRole('region', { name: 'Next up' }) },
  { name: 'wedding-budget-tracker-app', who: couple, url: '/hq/budget', ready: (p) => p.getByRole('region', { name: 'Categories' }),
    prep: async (p) => {
      await p.getByRole('button', { name: /Photography/ }).click();
      await p.waitForTimeout(300);
      return { at: p.getByRole('button', { name: /Photography/ }).locator('xpath=ancestor::*[contains(@class,"card")][1]'), offset: 6 };
    } },
  { name: 'compare-wedding-vendor-quotes', who: couple, url: '/hq/quotes', ready: (p) => p.getByRole('region', { name: 'Compare quotes' }),
    prep: async (p) => ({ at: p.getByRole('region', { name: 'Compare quotes' }), offset: 12 }) },
  { name: 'wedding-money-spent-who-paid', who: couple, url: '/hq/spending', ready: (p) => p.getByRole('region', { name: 'Who paid' }) },
  { name: 'wedding-task-list-assign-helpers', who: couple, url: '/hq/tasks', ready: (p) => p.getByRole('region', { name: /Tasks for/ }).first(),
    prep: async (p) => ({ at: p.getByRole('region', { name: /Tasks for/ }).first(), offset: 14 }) },
  { name: 'invite-wedding-party-helpers', who: couple, url: '/hq/team', ready: (p) => p.getByRole('list', { name: 'Open invitations' }),
    prep: async (p) => ({ at: p.getByRole('region', { name: 'Helpers' }), offset: 12 }) },
  { name: 'wedding-helper-my-tasks-view', who: helper, url: '/hq/', ready: (p) => p.getByRole('region', { name: 'Open tasks' }) },
  { name: 'wedding-calendar-reminders', who: couple, url: '/hq/calendar', ready: (p) => p.getByRole('region', { name: 'Month' }) },
  { name: 'wedding-guest-list-rsvp-tracker', who: couple, url: '/hq/guests', ready: (p) => p.getByRole('region', { name: 'Guest summary' }) },
  { name: 'honeymoon-planner-itinerary', who: couple, url: '/hq/honeymoon', ready: (p) => p.getByRole('button', { name: 'Itinerary' }),
    prep: async (p) => { await p.getByRole('button', { name: 'Itinerary' }).click(); await p.waitForTimeout(400); } },
  { name: 'honeymoon-currency-converter-zar-thb', who: couple, url: '/hq/honeymoon', ready: (p) => p.getByRole('button', { name: 'Currency' }),
    prep: async (p) => { await p.getByRole('button', { name: 'Currency' }).click(); await p.waitForTimeout(400); } },
  { name: 'wedding-purchases-checklist-receipts', who: couple, url: '/hq/purchases', ready: (p) => p.getByRole('region', { name: 'Purchase totals' }) },
  { name: 'wedding-email-reminder-settings', who: couple, url: '/hq/settings', ready: (p) => p.locator('#reminders-heading'),
    prep: async (p) => ({ at: p.locator('#reminders-heading').locator('xpath=ancestor::section[1]'), offset: 12 }) },
  { name: 'wedding-planner-works-offline', who: couple, url: '/hq/', ready: (p) => p.getByRole('region', { name: 'Next up' }),
    prep: async (p) => { await p.context().setOffline(true); await p.evaluate(() => window.dispatchEvent(new Event('offline'))); await p.getByText(/You're offline/).waitFor(); } },
];

(async () => {
  await new Promise((r) => server.listen(PORT, r));
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
  for (const shot of SHOTS) {
    if (only && !only.includes(shot.name)) continue;
    const { ctx, page } = await makeContext(browser, { who: shot.who });
    try {
      await page.goto(BASE + shot.url);
      await shot.ready(page).waitFor({ timeout: 15000 });
      await page.waitForTimeout(700);
      const frame = shot.prep ? await shot.prep(page) : null;
      await page.evaluate(() => document.activeElement && document.activeElement.blur());
      // Grow the viewport to the whole page so fixed/sticky chrome lands at the
      // page's own top and bottom, then cut the 390x844 frame out of it.
      const full0 = await page.evaluate(() => document.documentElement.scrollHeight);
      await page.setViewportSize({ width: 390, height: Math.max(844, full0) });
      await page.waitForTimeout(500);
      const full = await page.evaluate(() => document.documentElement.scrollHeight);
      let y = frame && frame.at ? await frameY(frame.at, frame.offset) : 0;
      y = Math.max(0, Math.min(y, full - 844));
      await page.screenshot({ path: path.join(RAW, `${shot.name}.png`), clip: { x: 0, y, width: 390, height: 844 } });
      console.log('captured', shot.name);
    } catch (e) {
      console.log('FAILED', shot.name, e.message.split('\n')[0]);
      await page.screenshot({ path: path.join(RAW, `${shot.name}-FAILED.png`) }).catch(() => {});
    }
    await ctx.close();
  }

  // Open Graph card: three of the screenshots on the brand gradient.
  const og = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  const ogPage = await og.newPage();
  const img = (n) => `data:image/png;base64,${fs.readFileSync(path.join(RAW, `${n}.png`)).toString('base64')}`;
  const logo = `data:image/png;base64,${fs.readFileSync(path.join(REPO, 'public', 'valere_logo.png')).toString('base64')}`;
  await ogPage.setContent(`<!doctype html><html><head><style>
    *{box-sizing:border-box;margin:0}
    body{width:1200px;height:630px;overflow:hidden;font-family:Inter,"Helvetica Neue",Arial,sans-serif;color:#111;
      background:linear-gradient(135deg,#f6e7e1 0%,#efe4f2 50%,#dfe9f5 100%);position:relative}
    .copy{position:absolute;left:72px;top:96px;width:520px}
    .copy img{height:40px;display:block;margin-bottom:36px}
    h1{font-family:"Cormorant Garamond",Georgia,serif;font-weight:600;font-size:68px;line-height:1.04;letter-spacing:-1px}
    h1 em{font-style:italic;font-weight:500}
    p{margin-top:24px;font-size:26px;line-height:1.35;color:#333}
    .pill{display:inline-block;margin-top:34px;background:#000;color:#fff;border-radius:999px;padding:16px 30px;font-size:22px;font-weight:600}
    .ph{position:absolute;width:236px;height:512px;border-radius:34px;background:#111;padding:8px;box-shadow:0 30px 60px rgba(40,20,60,.25)}
    .ph img{width:100%;height:100%;object-fit:cover;object-position:top;border-radius:27px;display:block}
  </style></head><body>
    <div class="copy"><img src="${logo}" alt="">
      <h1>The wedding planner, <em>done together</em></h1>
      <p>Budget, quotes, tasks, guest list and honeymoon in one private app.</p>
      <span class="pill">Valere Wedding Planner</span></div>
    <div class="ph" style="left:610px;top:150px;transform:rotate(-4deg)"><img src="${img('wedding-budget-tracker-app')}" alt=""></div>
    <div class="ph" style="left:760px;top:70px;z-index:2"><img src="${img('wedding-planner-home-dashboard')}" alt=""></div>
    <div class="ph" style="left:912px;top:180px;transform:rotate(4deg)"><img src="${img('wedding-task-list-assign-helpers')}" alt=""></div>
  </body></html>`);
  await ogPage.waitForTimeout(400);
  await ogPage.screenshot({ path: path.join(RAW, 'og-wedding-planner.png') });
  await og.close();
  await browser.close();
  server.close();

  // PNG -> WebP (screens) and optimised PNG->JPEG (share image, widest support).
  const py = `
import sys, os, glob
from PIL import Image
raw, out = sys.argv[1], sys.argv[2]
for f in sorted(glob.glob(os.path.join(raw, '*.png'))):
    name = os.path.basename(f)[:-4]
    if name.endswith('-FAILED'): continue
    im = Image.open(f).convert('RGB')
    if name.startswith('og-'):
        im.save(os.path.join(out, name + '.jpg'), 'JPEG', quality=86, optimize=True, progressive=True)
        continue
    for q in (82, 74, 66, 58, 50):
        dest = os.path.join(out, name + '.webp')
        im.save(dest, 'WEBP', quality=q, method=6)
        if os.path.getsize(dest) <= 120 * 1024: break
    print(name, im.size, os.path.getsize(dest) // 1024, 'KB q' + str(q))
`;
  const r = spawnSync('python3', ['-I', '-c', py, RAW, OUT], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status || 1);
  console.log('PNG sources in', RAW);
})().catch((e) => { console.error(e); process.exit(1); });
