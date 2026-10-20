// Node-side checks on the static SEO files in public/ and scripts/. These read
// files from disk: no rendering.
import fs from 'fs';
import path from 'path';
import { GUIDES, GUIDES_PATH } from './guides/content';
import { BLOG_PATH, POSTS } from './blog/content';
import { TIERS, WEDDING_PLANNER } from './services/pricingTiers';
import { ORG_ID, SOCIAL_PROFILES, SITE_URL, homeGraph, organizationNode } from './siteProfile';

const root = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8');
const ROUTES = ['/about', GUIDES_PATH, ...GUIDES.map((g) => g.path), BLOG_PATH, ...POSTS.map((p) => p.path)];

describe('sitemap.xml', () => {
  const xml = read('public', 'sitemap.xml');
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

  it.each(ROUTES)('contains %s with lastmod 2026-10-20', (route) => {
    expect(locs).toContain(`${SITE_URL}${route}`);
    const block = xml.slice(xml.indexOf(`<loc>${SITE_URL}${route}</loc>`));
    expect(block.slice(0, block.indexOf('</url>'))).toContain('<lastmod>2026-10-20</lastmod>');
  });

  it('keeps the existing pages and never lists /hq, /admin or other private routes', () => {
    ['/', '/wedding-planner', '/privacy', '/terms', '/refund-policy'].forEach((r) =>
      expect(locs).toContain(`${SITE_URL}${r === '/' ? '/' : r}`)
    );
    locs.forEach((l) => expect(l).not.toMatch(/\/(hq|admin|login|camera|gallery|unauthorized)/));
    expect(new Set(locs).size).toBe(locs.length);
  });
});

describe('robots.txt', () => {
  const txt = read('public', 'robots.txt');
  const groups = txt
    .split(/\n\s*\n/)
    .map((g) => g.split('\n').filter((l) => l && !l.startsWith('#')))
    .filter((g) => g.some((l) => /^User-agent:/i.test(l)));
  const agents = [
    'Googlebot', 'Bingbot', 'GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot',
    'Claude-User', 'anthropic-ai', 'PerplexityBot', 'Perplexity-User', 'Google-Extended', 'Applebot',
    'Applebot-Extended', 'CCBot', 'Amazonbot', 'DuckAssistBot', 'MistralAI-User',
  ];

  it.each(['*', ...agents])('has a group for %s that allows / and disallows the private routes', (agent) => {
    const group = groups.find((g) => g.includes(`User-agent: ${agent}`));
    expect(group).toBeDefined();
    expect(group).toContain('Allow: /');
    ['/admin', '/login', '/unauthorized'].forEach((p) => expect(group).toContain(`Disallow: ${p}`));
  });

  it('still points at the sitemap and does not mention /hq', () => {
    expect(txt).toContain('Sitemap: https://www.valere.co.za/sitemap.xml');
    expect(txt).not.toMatch(/\/hq/);
  });
});

describe('IndexNow', () => {
  const keyFiles = fs.readdirSync(path.join(root, 'public')).filter((f) => /^[a-f0-9]{32}\.txt$/.test(f));

  it('has exactly one key file whose content is its own name', () => {
    expect(keyFiles).toHaveLength(1);
    expect(read('public', keyFiles[0]).trim()).toBe(keyFiles[0].replace('.txt', ''));
  });

  it('the script targets the right host, endpoint and key location', () => {
    const js = read('scripts', 'indexnow.js');
    expect(js).toContain("const HOST = 'www.valere.co.za'");
    expect(js).toContain('https://api.indexnow.org/IndexNow');
    expect(js).toMatch(/keyLocation: `https:\/\/\$\{HOST\}\/\$\{key\}\.txt`/);
    expect(js).toMatch(/AFTER EACH DEPLOY/);
  });
});

describe('prerender routes', () => {
  it('prerender.js lists /about, /guides and every guide', () => {
    const js = read('scripts', 'prerender.js');
    expect(js).toContain("path: '/about'");
    expect(js).toContain("path: '/guides'");
    GUIDES.forEach((g) => expect(js).toContain(`'${g.slug}'`));
    expect(js).toContain("path: '/blog'");
    POSTS.forEach((p) => expect(js).toContain(`'${p.slug}'`));
    expect((js.match(/'[a-z0-9-]{12,}',\n/g) || []).length).toBe(GUIDES.length + POSTS.length);
  });
});

describe('llms.txt and llms-full.txt', () => {
  const llms = read('public', 'llms.txt');

  it('links to about, planner, guides index, every guide, the blog index and every post', () => {
    ['/about', '/wedding-planner', '/guides', ...GUIDES.map((g) => g.path), BLOG_PATH, ...POSTS.map((p) => p.path)].forEach((r) =>
      expect(llms).toContain(`(${SITE_URL}${r})`)
    );
    expect(llms).toContain(`${SITE_URL}/llms-full.txt`);
  });

  it('prices match pricingTiers', () => {
    Object.values(TIERS).forEach((t) => {
      expect(llms).toContain(`${t.name}`);
      expect(llms).toContain(`up to ${t.guestCap} guests, ${t.photosPerGuest} photos each`);
      if (t.amountCents) expect(llms).toContain(`R${t.amountCents / 100}`);
    });
    expect(llms).toContain(`R${WEDDING_PLANNER.amountCents / 100}`);
    expect(llms).not.toMatch(/R50\b/);
  });

  it('keeps its honesty rules', () => {
    expect(llms).toMatch(/does not send invitations/);
    expect(llms).toMatch(/viewing only/);
    expect(llms).not.toMatch(/\brated\b|\bstars?\b|testimonial|trusted by|award|#1|best in South Africa|thousands of/i);
  });

  it('llms-full.txt is exactly what the generator produces from the content modules', () => {
    const { render } = require('../scripts/generate-llms-full');
    const out = render({
      site: require('./siteProfile'),
      about: require('./aboutContent'),
      guides: require('./guides/content'),
      blog: require('./blog/content'),
    });
    POSTS.forEach((p) => expect(read('public', 'llms-full.txt')).toContain(`URL: ${p.url}`));
    expect(read('public', 'llms-full.txt')).toBe(out);
  });
});

describe('index.html', () => {
  const html = read('public', 'index.html');
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);

  it('has exactly one JSON-LD block, a single @graph equal to siteProfile', () => {
    expect(html.match(/application\/ld\+json/g)).toHaveLength(1);
    expect(ld).toEqual(JSON.parse(JSON.stringify(homeGraph())));
  });

  it('has stable @ids and emits sameAs only when profiles are configured', () => {
    const org = ld['@graph'].find((n) => n['@type'] === 'Organization');
    expect(org['@id']).toBe(ORG_ID);
    expect(ld['@graph'].map((n) => n['@id'])).toEqual([
      `${SITE_URL}/#organization`,
      `${SITE_URL}/#website`,
      `${SITE_URL}/#photo-app`,
    ]);
    if (SOCIAL_PROFILES.length === 0) expect(org).not.toHaveProperty('sameAs');
    else expect(org.sameAs).toEqual(SOCIAL_PROFILES);
    expect(organizationNode([]).sameAs).toBeUndefined();
    expect(organizationNode(['https://example.com/x']).sameAs).toEqual(['https://example.com/x']);
  });

  it('SOCIAL_PROFILES holds only absolute https URLs', () => {
    SOCIAL_PROFILES.forEach((u) => expect(u).toMatch(/^https:\/\//));
  });

  it('home title and description name the brand and South Africa', () => {
    const title = html.match(/<title>([^<]*)<\/title>/)[1].replace(/&amp;/g, '&');
    expect(title).toMatch(/^Valere/);
    expect(title).toMatch(/South Africa/);
    expect(title.length).toBeLessThanOrEqual(60);
    const desc = html.match(/name="description"\s+content="([^"]*)"/)[1];
    expect(desc).toMatch(/^Valere is a South African/);
    expect(desc.length).toBeLessThanOrEqual(155);
    expect(html).toMatch(/og:title" content="Valere:/);
  });
});

describe('public pages never mention the private app', () => {
  const files = [
    ['public', 'robots.txt'],
    ['public', 'sitemap.xml'],
    ['public', 'llms.txt'],
    ['public', 'llms-full.txt'],
    ['public', 'index.html'],
    ['src', 'guides', 'content.js'],
    ['src', 'aboutContent.js'],
    ['src', 'siteProfile.js'],
    ['src', 'About.js'],
    ['src', 'guides', 'Guides.js'],
    ['src', 'blog', 'content.js'],
    ['src', 'blog', 'Blog.js'],
  ];
  it.each(files.map((f) => [f.join('/'), f]))('%s has no /hq', (_, f) => {
    expect(read(...f)).not.toMatch(/\/hq\b|Wedding HQ/i);
  });
});

describe('brand consistency in public-facing copy', () => {
  it('public pages say Valere, not "Capture by Val"', () => {
    const files = ['WeddingPlanner.js', 'weddingPlannerContent.js', 'LandingPage.js', 'About.js', 'aboutContent.js', 'PrivacyPolicy.js', 'Terms.js', 'RefundPolicy.js'];
    files.forEach((f) => expect(read('src', f)).not.toMatch(/Capture by Val/i));
    expect(read('public', 'index.html')).not.toMatch(/Capture by Val/i);
    expect(read('public', 'llms.txt')).not.toMatch(/Capture by Val/i);
  });

  it('the Organization node matches the contact point used on the legal pages', () => {
    const { CONTACT_EMAIL } = require('./siteProfile');
    expect(organizationNode().contactPoint.email).toBe(CONTACT_EMAIL);
    expect(read('src', 'PrivacyPolicy.js')).toContain('CONTACT_EMAIL');
  });
});
