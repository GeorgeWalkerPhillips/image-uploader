import '../testUtils/routerPolyfill';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { BlogIndex, BlogPostPage } from './Blog';
import { GuidesIndex, GuidePage } from '../guides/Guides';
import LandingPage from '../LandingPage';
import { BLOG_INDEX, BLOG_URL, POSTS, formatDate, postsForGuide, sortedPosts } from './content';
import { GUIDES } from '../guides/content';
import { TIERS } from '../services/pricingTiers';
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

const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/blog" element={<BlogIndex />} />
        <Route path="/blog/:slug" element={<BlogPostPage />} />
        <Route path="/guides" element={<GuidesIndex />} />
        <Route path="/guides/:slug" element={<GuidePage />} />
      </Routes>
    </MemoryRouter>
  );

describe('blog data', () => {
  it('has the two launch posts with unique slugs and SEO fields within limits', () => {
    expect(POSTS.map((p) => p.slug)).toEqual(['wedding-qr-code-sign-wording', 'wedding-day-guest-photo-plan']);
    expect(new Set(POSTS.map((p) => p.slug)).size).toBe(POSTS.length);
    POSTS.forEach((p) => {
      expect(p.metaTitle.length).toBeLessThanOrEqual(60);
      expect(p.metaDescription.length).toBeLessThanOrEqual(155);
      expect(p.metaDescription.length).toBeGreaterThan(60);
      expect(p.faq.length).toBeGreaterThanOrEqual(5);
      expect(p.faq.length).toBeLessThanOrEqual(6);
      expect(p.takeaways.length).toBeGreaterThanOrEqual(4);
      expect(p.datePublished).toBe('2026-10-20');
      expect(p.dateModified).toBe('2026-10-20');
      expect(p.readMinutes).toBeGreaterThan(0);
      expect(p.url).toBe(`${SITE_URL}/blog/${p.slug}`);
      p.relatedPosts.forEach((r) => expect(POSTS.some((x) => x.slug === r)).toBe(true));
      p.relatedGuides.forEach((r) => expect(GUIDES.some((x) => x.slug === r)).toBe(true));
    });
    expect(BLOG_INDEX.title.length).toBeLessThanOrEqual(60);
    expect(BLOG_INDEX.description.length).toBeLessThanOrEqual(155);
  });

  it('sorts newest first and formats dates', () => {
    const sorted = sortedPosts([...POSTS]);
    for (let i = 1; i < sorted.length; i += 1) expect(sorted[i - 1].datePublished >= sorted[i].datePublished).toBe(true);
    expect(formatDate('2026-10-20')).toBe('20 October 2026');
  });
});

describe.each(POSTS.map((p) => [p.slug, p]))('post: %s', (_slug, post) => {
  it('has exactly one h1 and a sensible heading hierarchy', () => {
    const { container } = renderAt(post.path);
    const h1s = container.querySelectorAll('h1');
    expect(h1s).toHaveLength(1);
    expect(h1s[0].textContent).toBe(post.h1);
    const levels = Array.from(container.querySelectorAll('h1,h2,h3,h4')).map((h) => Number(h.tagName[1]));
    expect(levels.filter((l) => l === 2).length).toBeGreaterThanOrEqual(4);
    expect(levels.includes(4)).toBe(false);
    levels.forEach((l, i) => {
      if (i > 0) expect(l - levels[i - 1]).toBeLessThanOrEqual(1);
    });
    expect(screen.getByRole('heading', { name: 'Key takeaways' })).toBeInTheDocument();
  });

  it('has 700 to 1200 words of article text', () => {
    const { container } = renderAt(post.path);
    const n = wordCount(container.querySelector('main'));
    // eslint-disable-next-line no-console
    if (process.env.SHOW_WORDS) console.log(post.slug, n);
    expect(n).toBeGreaterThanOrEqual(700);
    expect(n).toBeLessThanOrEqual(1200);
  });

  it('gives any images alt, width and height', () => {
    const { container } = renderAt(post.path);
    expectImagesComplete(container);
  });

  it('emits Organization/WebSite, BlogPosting, FAQPage and BreadcrumbList JSON-LD linked by @id', () => {
    const { container } = renderAt(post.path);
    const blocks = ldBlocks(container);
    expectSiteGraph(blocks);
    expect(blocks.map((b) => b['@type'] || 'graph').sort()).toEqual(['BlogPosting', 'BreadcrumbList', 'FAQPage', 'graph']);
    const posting = blocks.find((b) => b['@type'] === 'BlogPosting');
    expect(posting.headline).toBe(post.h1);
    expect(posting.headline.length).toBeLessThanOrEqual(110);
    expect(posting.description).toBe(post.metaDescription);
    expect(posting.author['@id']).toBe(ORG_ID);
    expect(posting.publisher['@id']).toBe(ORG_ID);
    expect(posting.datePublished).toBe('2026-10-20');
    expect(posting.dateModified).toBe('2026-10-20');
    expect(posting.mainEntityOfPage['@id']).toBe(post.url);
    expect(posting.image).toMatch(/^https:\/\/www\.valere\.co\.za\/.+\.png$/);
    const crumbs = blocks.find((b) => b['@type'] === 'BreadcrumbList');
    expect(crumbs.itemListElement.map((i) => i.item)).toEqual([`${SITE_URL}/`, BLOG_URL, post.url]);
    expect(crumbs.itemListElement.map((i) => i.position)).toEqual([1, 2, 3]);
  });

  it('FAQ JSON-LD equals the rendered FAQ', () => {
    const { container } = renderAt(post.path);
    const faq = ldBlocks(container).find((b) => b['@type'] === 'FAQPage');
    const rendered = Array.from(container.querySelectorAll('#faq > div')).map((d) => ({
      q: d.querySelector('h3').textContent,
      a: d.querySelector('p').textContent,
    }));
    expect(rendered).toEqual(post.faq.map((f) => ({ q: f.q, a: f.a })));
    expect(faq.mainEntity.map((e) => [e.name, e.acceptedAnswer.text])).toEqual(rendered.map((r) => [r.q, r.a]));
  });

  it('sets title, description, canonical, robots, Open Graph and Twitter tags, and restores them', () => {
    const before = document.title;
    const { unmount } = renderAt(post.path);
    expect(document.title).toBe(post.metaTitle);
    expect(metaContent('meta[name="description"]')).toBe(post.metaDescription);
    expect(document.head.querySelector('link[rel="canonical"]').getAttribute('href')).toBe(post.url);
    expect(metaContent('meta[name="robots"]')).toMatch(/^index,follow/);
    expect(metaContent('meta[property="og:title"]')).toBe(post.metaTitle);
    expect(metaContent('meta[property="og:description"]')).toBe(post.metaDescription);
    expect(metaContent('meta[property="og:url"]')).toBe(post.url);
    expect(metaContent('meta[property="og:type"]')).toBe('article');
    expect(metaContent('meta[property="og:image"]')).toMatch(/^https:\/\/www\.valere\.co\.za\/.+\.png$/);
    expect(metaContent('meta[name="twitter:card"]')).toBe('summary_large_image');
    unmount();
    expect(document.title).toBe(before);
    expect(document.head.querySelector('link[rel="canonical"]')).toBeNull();
  });

  it('makes no fabricated claims and no guarantees', () => {
    const { container } = renderAt(post.path);
    const all = container.textContent + JSON.stringify(ldBlocks(container)) + post.metaDescription;
    expect(all).not.toMatch(BANNED);
    expect(all).not.toMatch(/guarantee/i);
    expect(all).not.toMatch(/every guest will|all guests will/i);
  });

  it('shows only prices that come from pricingTiers', () => {
    const { container } = renderAt(post.path);
    randAmounts(container.querySelector('main').textContent).forEach((a) => expect(PRICE_SET.has(a)).toBe(true));
    expect(container.textContent).not.toMatch(/R\s?50\b/);
    expect(container.textContent).toContain(`R${TIERS.starter.amountCents / 100}`);
    expect(container.textContent).toContain(`R${TIERS.unlimited.amountCents / 100}`);
  });

  it('links to real routes, the guides, the blog, pricing and about, and labels Valere as our product', () => {
    const { container } = renderAt(post.path);
    const hrefs = expectLinksResolve(container);
    ['/about', '/blog', '/guides', '/wedding-planner', '/#pricing'].forEach((h) => expect(hrefs).toContain(h));
    post.relatedGuides.forEach((s) => expect(hrefs).toContain(`/guides/${s}`));
    post.relatedPosts.forEach((s) => expect(hrefs).toContain(`/blog/${s}`));
    expect(container.querySelector('aside')).toHaveTextContent('Our product');
    expect(container.querySelector('main').textContent).not.toMatch(/\b(Zola|Joy|WedPics|Guestpix|Waldo|Lense|Dazzle|Kululu)\b/);
  });
});

describe('blog index', () => {
  it('has one h1, a card per post (title, summary, date, read time) newest first, and valid JSON-LD', () => {
    const { container } = renderAt('/blog');
    expect(container.querySelectorAll('h1')).toHaveLength(1);
    const hrefs = expectLinksResolve(container);
    sortedPosts().forEach((p) => expect(hrefs).toContain(p.path));
    const cards = Array.from(container.querySelectorAll('main ul a'));
    expect(cards.map((a) => a.getAttribute('href'))).toEqual(sortedPosts().map((p) => p.path));
    cards.forEach((a, i) => {
      const p = sortedPosts()[i];
      expect(a).toHaveTextContent(p.h1);
      expect(a).toHaveTextContent(p.summary);
      expect(a).toHaveTextContent(formatDate(p.datePublished));
      expect(a).toHaveTextContent(`${p.readMinutes} min read`);
    });
    const blocks = ldBlocks(container);
    expectSiteGraph(blocks);
    const coll = blocks.find((b) => [].concat(b['@type']).includes('CollectionPage'));
    expect([].concat(coll['@type'])).toContain('Blog');
    expect(coll.publisher['@id']).toBe(ORG_ID);
    expect(coll.mainEntity.itemListElement.map((i) => i.url)).toEqual(sortedPosts().map((p) => p.url));
    expect(blocks.find((b) => b['@type'] === 'BreadcrumbList').itemListElement).toHaveLength(2);
    expectImagesComplete(container);
  });

  it('sets meta and canonical and makes no fabricated claims', () => {
    const { container } = renderAt('/blog');
    expect(document.title).toBe(BLOG_INDEX.title);
    expect(metaContent('meta[name="description"]')).toBe(BLOG_INDEX.description);
    expect(document.head.querySelector('link[rel="canonical"]').getAttribute('href')).toBe(BLOG_URL);
    expect(metaContent('meta[property="og:url"]')).toBe(BLOG_URL);
    expect(container.textContent + JSON.stringify(ldBlocks(container))).not.toMatch(BANNED);
  });
});

describe('unknown post', () => {
  it('shows a not-found page with one h1', () => {
    const { container } = renderAt('/blog/does-not-exist');
    expect(container.querySelectorAll('h1')).toHaveLength(1);
    expect(screen.getByText('Post not found')).toBeInTheDocument();
  });
});

describe('cross-links and navigation', () => {
  it('the collect-photos guide links to both posts under "Related reading"', () => {
    const { container } = renderAt('/guides/collect-wedding-guest-photos-qr-code');
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    POSTS.forEach((p) => expect(hrefs).toContain(p.path));
    expect(container.querySelector('main').textContent).toContain('Related reading:');
    expect(postsForGuide('collect-wedding-guest-photos-qr-code')).toHaveLength(2);
  });

  it('every post links back to a guide that links back to the post', () => {
    POSTS.forEach((p) => p.relatedGuides.forEach((g) => expect(postsForGuide(g).map((x) => x.slug)).toContain(p.slug)));
  });

  it('the landing page links to Blog in the nav and footer', () => {
    const { container } = render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(hrefs.filter((h) => h === '/blog').length).toBeGreaterThanOrEqual(2);
    expect(container.querySelector('footer')).toHaveTextContent('Blog');
  });

  it('the content-page header and footer link to Blog', () => {
    const { container } = renderAt('/guides');
    expect(container.querySelector('header')).toHaveTextContent('Blog');
    expect(container.querySelector('footer')).toHaveTextContent('Blog');
  });
});
