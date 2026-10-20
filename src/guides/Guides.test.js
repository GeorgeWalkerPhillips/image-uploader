import '../testUtils/routerPolyfill';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { GuidesIndex, GuidePage } from './Guides';
import LandingPage from '../LandingPage';
import {
  GUIDES,
  GUIDES_INDEX,
  GUIDES_URL,
  BUDGET_ROWS,
  BUDGET_EXAMPLE_TOTAL,
  DATE_MODIFIED,
  DATE_PUBLISHED,
} from './content';
import { ORG_ID, SITE_URL } from '../siteProfile';
import {
  BANNED,
  PRICE_SET,
  expectImagesComplete,
  expectLinksResolve,
  expectSiteGraph,
  ldBlocks,
  metaContent,
  randAmounts,
  wordCount,
} from '../testUtils/seoHelpers';

jest.mock('../supabaseClient', () => ({ supabase: {} }));
jest.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: null, loading: false, signOut: jest.fn() }) }));

const renderGuide = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/guides" element={<GuidesIndex />} />
        <Route path="/guides/:slug" element={<GuidePage />} />
      </Routes>
    </MemoryRouter>
  );

describe('guides data', () => {
  it('has five guides with unique slugs, titles <= 60 and descriptions <= 155', () => {
    expect(GUIDES).toHaveLength(5);
    expect(new Set(GUIDES.map((g) => g.slug)).size).toBe(5);
    GUIDES.forEach((g) => {
      expect(g.title.length).toBeLessThanOrEqual(60);
      expect(g.description.length).toBeLessThanOrEqual(155);
      expect(g.description.length).toBeGreaterThan(60);
      expect(g.faq.length).toBeGreaterThanOrEqual(4);
      expect(g.faq.length).toBeLessThanOrEqual(6);
      expect(g.takeaways.length).toBeGreaterThanOrEqual(4);
      g.related.forEach((r) => expect(GUIDES.some((x) => x.slug === r)).toBe(true));
    });
    expect(GUIDES_INDEX.title.length).toBeLessThanOrEqual(60);
    expect(GUIDES_INDEX.description.length).toBeLessThanOrEqual(155);
  });

  it('budget shares sum to 100', () => {
    expect(BUDGET_ROWS.reduce((n, r) => n + r.share, 0)).toBe(100);
  });
});

describe.each(GUIDES.map((g) => [g.slug, g]))('guide: %s', (_slug, guide) => {
  it('has exactly one h1 and a sensible heading hierarchy', () => {
    const { container } = renderGuide(guide.path);
    const h1s = container.querySelectorAll('h1');
    expect(h1s).toHaveLength(1);
    expect(h1s[0].textContent).toBe(guide.h1);
    const levels = Array.from(container.querySelectorAll('h1,h2,h3,h4')).map((h) => Number(h.tagName[1]));
    expect(levels.filter((l) => l === 2).length).toBeGreaterThanOrEqual(4);
    expect(levels.includes(4)).toBe(false);
    levels.forEach((l, i) => {
      if (i > 0) expect(l - levels[i - 1]).toBeLessThanOrEqual(1);
    });
    expect(screen.getByRole('heading', { name: 'Key takeaways' })).toBeInTheDocument();
  });

  it('is a reasonable length (700 to 1100 words of article text)', () => {
    const { container } = renderGuide(guide.path);
    const n = wordCount(container.querySelector('main'));
    // eslint-disable-next-line no-console
    if (process.env.SHOW_WORDS) console.log(guide.slug, n);
    expect(n).toBeGreaterThanOrEqual(700);
    expect(n).toBeLessThanOrEqual(1100);
  });

  it('gives any images alt, width and height', () => {
    const { container } = renderGuide(guide.path);
    expectImagesComplete(container);
  });

  it('emits Organization/WebSite, Article, FAQPage and BreadcrumbList JSON-LD linked by @id', () => {
    const { container } = renderGuide(guide.path);
    const blocks = ldBlocks(container);
    expectSiteGraph(blocks);
    const types = blocks.map((b) => b['@type'] || 'graph').sort();
    expect(types).toEqual(['Article', 'BreadcrumbList', 'FAQPage', 'graph']);
    const article = blocks.find((b) => b['@type'] === 'Article');
    expect(article.headline).toBe(guide.h1);
    expect(article.headline.length).toBeLessThanOrEqual(110);
    expect(article.description).toBe(guide.description);
    expect(article.author['@id']).toBe(ORG_ID);
    expect(article.publisher['@id']).toBe(ORG_ID);
    expect(article.datePublished).toBe('2026-10-20');
    expect(article.dateModified).toBe('2026-10-20');
    expect(DATE_PUBLISHED).toBe('2026-10-20');
    expect(DATE_MODIFIED).toBe('2026-10-20');
    expect(article.mainEntityOfPage['@id']).toBe(guide.url);
    expect(guide.url).toBe(`${SITE_URL}/guides/${guide.slug}`);
    const crumbs = blocks.find((b) => b['@type'] === 'BreadcrumbList');
    expect(crumbs.itemListElement.map((i) => i.item)).toEqual([`${SITE_URL}/`, GUIDES_URL, guide.url]);
    expect(crumbs.itemListElement.map((i) => i.position)).toEqual([1, 2, 3]);
  });

  it('FAQ JSON-LD equals the rendered FAQ', () => {
    const { container } = renderGuide(guide.path);
    const faq = ldBlocks(container).find((b) => b['@type'] === 'FAQPage');
    const rendered = Array.from(container.querySelectorAll('#faq > div')).map((d) => ({
      q: d.querySelector('h3').textContent,
      a: d.querySelector('p').textContent,
    }));
    expect(rendered).toEqual(guide.faq.map((f) => ({ q: f.q, a: f.a })));
    expect(faq.mainEntity.map((e) => [e.name, e.acceptedAnswer.text])).toEqual(rendered.map((r) => [r.q, r.a]));
  });

  it('sets title, description, canonical, robots, Open Graph and Twitter tags, and restores them', () => {
    const before = document.title;
    const { unmount } = renderGuide(guide.path);
    expect(document.title).toBe(guide.title);
    expect(metaContent('meta[name="description"]')).toBe(guide.description);
    expect(document.head.querySelector('link[rel="canonical"]').getAttribute('href')).toBe(guide.url);
    expect(metaContent('meta[name="robots"]')).toMatch(/^index,follow/);
    expect(metaContent('meta[property="og:title"]')).toBe(guide.title);
    expect(metaContent('meta[property="og:description"]')).toBe(guide.description);
    expect(metaContent('meta[property="og:url"]')).toBe(guide.url);
    expect(metaContent('meta[property="og:type"]')).toBe('article');
    expect(metaContent('meta[property="og:image"]')).toMatch(/^https:\/\/www\.valere\.co\.za\/.+\.png$/);
    expect(metaContent('meta[name="twitter:card"]')).toBe('summary_large_image');
    expect(metaContent('meta[name="twitter:title"]')).toBe(guide.title);
    unmount();
    expect(document.title).toBe(before);
    expect(document.head.querySelector('meta[property="og:image:width"]')).toBeNull();
    expect(document.head.querySelector('link[rel="canonical"]')).toBeNull();
  });

  it('makes no fabricated claims', () => {
    const { container } = renderGuide(guide.path);
    const all = container.textContent + JSON.stringify(ldBlocks(container)) + guide.description;
    expect(all).not.toMatch(BANNED);
  });

  it('shows only prices that come from pricingTiers (or the labelled budget example)', () => {
    const { container } = renderGuide(guide.path);
    const exampleAmounts = new Set([BUDGET_EXAMPLE_TOTAL, ...BUDGET_ROWS.map((r) => (BUDGET_EXAMPLE_TOTAL * r.share) / 100)]);
    const amounts = randAmounts(container.querySelector('main').textContent);
    amounts.forEach((a) => {
      const ok = PRICE_SET.has(a) || (guide.slug.includes('budget') && exampleAmounts.has(a));
      expect(ok).toBe(true);
    });
    expect(container.textContent).not.toMatch(/R\s?50\b/);
  });

  it('links to real routes, to the planner, pricing, about and other guides', () => {
    const { container } = renderGuide(guide.path);
    const hrefs = expectLinksResolve(container);
    ['/about', '/guides', '/wedding-planner', '/#pricing'].forEach((h) => expect(hrefs).toContain(h));
    expect(hrefs.some((h) => h.startsWith('/guides/') && h !== guide.path)).toBe(true);
  });

  it('labels Valere as our product and does not name competitors', () => {
    const { container } = renderGuide(guide.path);
    const text = container.querySelector('main').textContent;
    expect(text).not.toMatch(/\b(Zola|Joy|WedPics|Guestpix|Waldo|Lense|Dazzle|Kululu)\b/);
    if (guide.sections.some((s) => s.blocks.some((b) => b.type === 'product'))) {
      expect(container.querySelector('aside')).toHaveTextContent('Our product');
    } else {
      expect(text).toMatch(/our product/i);
    }
  });
});

describe('guides index', () => {
  it('has one h1, links to every guide, and valid JSON-LD', () => {
    const { container } = renderGuide('/guides');
    expect(container.querySelectorAll('h1')).toHaveLength(1);
    const hrefs = expectLinksResolve(container);
    GUIDES.forEach((g) => expect(hrefs).toContain(g.path));
    const blocks = ldBlocks(container);
    expectSiteGraph(blocks);
    const coll = blocks.find((b) => b['@type'] === 'CollectionPage');
    expect(coll.publisher['@id']).toBe(ORG_ID);
    expect(coll.mainEntity.itemListElement.map((i) => i.url)).toEqual(GUIDES.map((g) => g.url));
    expect(blocks.find((b) => b['@type'] === 'BreadcrumbList').itemListElement).toHaveLength(2);
    expectImagesComplete(container);
  });

  it('sets meta and canonical', () => {
    renderGuide('/guides');
    expect(document.title).toBe(GUIDES_INDEX.title);
    expect(metaContent('meta[name="description"]')).toBe(GUIDES_INDEX.description);
    expect(document.head.querySelector('link[rel="canonical"]').getAttribute('href')).toBe(GUIDES_URL);
    expect(metaContent('meta[property="og:url"]')).toBe(GUIDES_URL);
  });

  it('makes no fabricated claims', () => {
    const { container } = renderGuide('/guides');
    expect(container.textContent + JSON.stringify(ldBlocks(container))).not.toMatch(BANNED);
  });
});

describe('unknown guide', () => {
  it('shows a not-found page with one h1', () => {
    const { container } = renderGuide('/guides/does-not-exist');
    expect(container.querySelectorAll('h1')).toHaveLength(1);
    expect(screen.getByText('Guide not found')).toBeInTheDocument();
  });
});

describe('landing page', () => {
  it('links to Guides and About in the nav and footer', () => {
    const { container } = render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(hrefs.filter((h) => h === '/guides').length).toBeGreaterThanOrEqual(2);
    expect(hrefs).toContain('/about');
    expect(container.querySelector('footer')).toHaveTextContent('Guides');
    expect(container.querySelector('footer')).toHaveTextContent('About Valere');
  });
});
