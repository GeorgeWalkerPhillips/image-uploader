import './testUtils/routerPolyfill';
import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import About from './About';
import {
  ABOUT_DESCRIPTION,
  ABOUT_TITLE,
  ABOUT_URL,
  FAQ_ITEMS,
  PRICING_LINES,
  ABOUT_INTRO,
} from './aboutContent';
import { CONTACT_EMAIL, DISAMBIGUATION, ORG_ID, SITE_URL, SOCIAL_PROFILES } from './siteProfile';
import { GUIDES } from './guides/content';
import { TIERS, WEDDING_PLANNER } from './services/pricingTiers';
import {
  BANNED,
  PRICE_SET,
  expectImagesComplete,
  expectLinksResolve,
  expectSiteGraph,
  ldBlocks,
  metaContent,
  randAmounts,
} from './testUtils/seoHelpers';

jest.mock('./supabaseClient', () => ({ supabase: {} }));
jest.mock('./context/AuthContext', () => ({ useAuth: () => ({ user: null, loading: false, signOut: jest.fn() }) }));

const renderAbout = () =>
  render(
    <MemoryRouter initialEntries={['/about']}>
      <About />
    </MemoryRouter>
  );

describe('About page', () => {
  it('has exactly one h1 and the key sections', () => {
    const { container } = renderAbout();
    const h1s = container.querySelectorAll('h1');
    expect(h1s).toHaveLength(1);
    expect(h1s[0].textContent).toBe('About Valere');
    const h2s = Array.from(container.querySelectorAll('h2')).map((h) => h.textContent);
    expect(h2s).toEqual(
      expect.arrayContaining([
        'What Valere is',
        'How it works',
        'Who it is for',
        'Our approach to privacy',
        'How to contact us',
        'Frequently asked',
      ])
    );
    expect(container.querySelectorAll('#how-heading ~ ol > li')).toHaveLength(3);
    expect(ABOUT_INTRO.startsWith(DISAMBIGUATION)).toBe(true);
  });

  it('has 5 to 6 FAQs and FAQ JSON-LD equals the rendered FAQ', () => {
    const { container } = renderAbout();
    expect(FAQ_ITEMS.length).toBeGreaterThanOrEqual(5);
    expect(FAQ_ITEMS.length).toBeLessThanOrEqual(6);
    const rendered = Array.from(container.querySelectorAll('#faq > div')).map((d) => ({
      q: d.querySelector('h3').textContent,
      a: d.querySelector('p').textContent,
    }));
    expect(rendered).toEqual(FAQ_ITEMS.map((f) => ({ q: f.q, a: f.a })));
    const faq = ldBlocks(container).find((b) => b['@type'] === 'FAQPage');
    expect(faq.mainEntity.map((e) => [e.name, e.acceptedAnswer.text])).toEqual(rendered.map((r) => [r.q, r.a]));
  });

  it('emits Organization/WebSite, AboutPage and BreadcrumbList JSON-LD that reference the Organization @id', () => {
    const { container } = renderAbout();
    const blocks = ldBlocks(container);
    const { org } = expectSiteGraph(blocks);
    expect(org.name).toBe('Valere');
    expect(org.description).toBe(DISAMBIGUATION);
    expect(org.areaServed).toBe('ZA');
    expect(org.contactPoint.email).toBe(CONTACT_EMAIL);
    if (SOCIAL_PROFILES.length === 0) expect(org).not.toHaveProperty('sameAs');
    const about = blocks.find((b) => b['@type'] === 'AboutPage');
    expect(about.about['@id']).toBe(ORG_ID);
    expect(about.mainEntity['@id']).toBe(ORG_ID);
    expect(about.url).toBe(ABOUT_URL);
    expect(ABOUT_URL).toBe(`${SITE_URL}/about`);
    expect(blocks.find((b) => b['@type'] === 'BreadcrumbList').itemListElement.map((i) => i.name)).toEqual(['Home', 'About']);
  });

  it('sets title (<= 60), description (<= 155), canonical, OG and Twitter, and restores them', () => {
    const before = document.title;
    const { unmount } = renderAbout();
    expect(ABOUT_TITLE.length).toBeLessThanOrEqual(60);
    expect(ABOUT_DESCRIPTION.length).toBeLessThanOrEqual(155);
    expect(document.title).toBe(ABOUT_TITLE);
    expect(metaContent('meta[name="description"]')).toBe(ABOUT_DESCRIPTION);
    expect(document.head.querySelector('link[rel="canonical"]').getAttribute('href')).toBe(ABOUT_URL);
    expect(metaContent('meta[property="og:title"]')).toBe(ABOUT_TITLE);
    expect(metaContent('meta[property="og:url"]')).toBe(ABOUT_URL);
    expect(metaContent('meta[name="twitter:description"]')).toBe(ABOUT_DESCRIPTION);
    unmount();
    expect(document.title).toBe(before);
    expect(document.head.querySelector('link[rel="canonical"]')).toBeNull();
  });

  it('shows prices that come from pricingTiers', () => {
    const { container } = renderAbout();
    const text = container.querySelector('main').textContent;
    randAmounts(text).forEach((a) => expect(PRICE_SET.has(a)).toBe(true));
    Object.values(TIERS)
      .filter((t) => t.amountCents)
      .forEach((t) => expect(text).toContain(`R${t.amountCents / 100}`));
    expect(text).toContain(`R${WEDDING_PLANNER.amountCents / 100}`);
    expect(PRICING_LINES).toHaveLength(5);
  });

  it('makes no fabricated claims and states no founder, date or address details', () => {
    const { container } = renderAbout();
    const all = container.textContent + JSON.stringify(ldBlocks(container));
    expect(all).not.toMatch(BANNED);
    expect(all).not.toMatch(/founded|since 20\d\d|our founder|headquarter/i);
  });

  it('links to privacy, terms, planner, guides, and uses the existing contact email only', () => {
    const { container } = renderAbout();
    const hrefs = expectLinksResolve(container);
    ['/privacy', '/terms', '/refund-policy', '/wedding-planner', '/guides', '/#pricing'].forEach((h) => expect(hrefs).toContain(h));
    GUIDES.forEach((g) => expect(hrefs).toContain(g.path));
    const mails = Array.from(container.querySelectorAll('a[href^="mailto:"]')).map((a) => a.getAttribute('href'));
    expect(mails).toEqual([`mailto:${CONTACT_EMAIL}`]);
  });

  it('gives any images alt, width and height', () => {
    const { container } = renderAbout();
    expectImagesComplete(container);
  });
});
