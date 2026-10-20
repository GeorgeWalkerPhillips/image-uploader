// Shared assertions for the About and Guides page tests.
import { GUIDES } from '../guides/content';
import { TIERS, WEDDING_PLANNER } from '../services/pricingTiers';
import { ORG_ID, WEBSITE_ID } from '../siteProfile';

export const KNOWN_ROUTES = new Set([
  '/',
  '/about',
  '/guides',
  '/wedding-planner',
  '/privacy',
  '/terms',
  '/refund-policy',
  '/login',
  ...GUIDES.map((g) => g.path),
]);

export const BANNED = /\brated\b|\bstars?\b|testimonial|trusted by|\baward|#1|best in South Africa|thousands of|\breviews?\b|\d+\s?(\+\s?)?(couples|users|weddings|customers)\b/i;

export const ldBlocks = (container) =>
  Array.from(container.querySelectorAll('script[type="application/ld+json"]')).map((n) => JSON.parse(n.textContent));

export const metaContent = (sel) => document.head.querySelector(sel)?.getAttribute('content');

// Every R-amount in the text, as a number.
export const randAmounts = (text) =>
  [...text.matchAll(/\bR(\d{1,3}(?:[\s ]\d{3})*|\d+)(?![\d])/g)].map((m) => Number(m[1].replace(/[\s ]/g, '')));

export const PRICE_SET = new Set([
  ...Object.values(TIERS).map((t) => t.amountCents / 100),
  WEDDING_PLANNER.amountCents / 100,
]);

export const wordCount = (el) => (el.textContent || '').trim().split(/\s+/).filter(Boolean).length;

export function expectSiteGraph(blocks) {
  const site = blocks.find((b) => Array.isArray(b['@graph']));
  expect(site).toBeDefined();
  const org = site['@graph'].find((n) => n['@type'] === 'Organization');
  const web = site['@graph'].find((n) => n['@type'] === 'WebSite');
  expect(org['@id']).toBe(ORG_ID);
  expect(web['@id']).toBe(WEBSITE_ID);
  expect(web.publisher['@id']).toBe(ORG_ID);
  return { org, web };
}

export function expectLinksResolve(container) {
  const hrefs = Array.from(container.querySelectorAll('a[href]')).map((a) => a.getAttribute('href'));
  expect(hrefs.length).toBeGreaterThan(5);
  hrefs.forEach((h) => {
    if (h.startsWith('mailto:')) return;
    expect(h.startsWith('/')).toBe(true);
    const p = h.split('#')[0].split('?')[0] || '/';
    expect(KNOWN_ROUTES.has(p)).toBe(true);
  });
  return hrefs;
}

export function expectImagesComplete(container) {
  container.querySelectorAll('img').forEach((img) => {
    expect(img.getAttribute('alt')).toBeTruthy();
    expect(Number(img.getAttribute('width'))).toBeGreaterThan(0);
    expect(Number(img.getAttribute('height'))).toBeGreaterThan(0);
  });
}
