import '../testUtils/routerPolyfill';
import fs from 'fs';
import path from 'path';
import React from 'react';
import { render, screen, within, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom';
import { SiteNav, SITE_LINKS } from './SiteNav';
import LandingPage from '../LandingPage';
import WeddingPlanner from '../WeddingPlanner';
import About from '../About';
import { GuidesIndex, GuidePage } from '../guides/Guides';
import { BlogIndex, BlogPostPage } from '../blog/Blog';
import { GUIDES } from '../guides/content';
import { POSTS } from '../blog/content';
import { useAuth } from '../context/AuthContext';
import { getPlannerStatus } from '../services/weddingPlannerService';

jest.mock('../supabaseClient', () => ({ supabase: {} }));
jest.mock('../context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../services/weddingPlannerService', () => ({
  startCheckout: jest.fn(),
  verifyPurchase: jest.fn(),
  getPlannerStatus: jest.fn().mockResolvedValue({ entitled: false, wedding_id: null, access: null, role: null }),
  NO_PLANNER_STATUS: { entitled: false, wedding_id: null, access: null, role: null },
}));

let mqlListeners;
let mqlMatches;

// Installs a controllable matchMedia: `desktop` is the (min-width: 960px) state.
function mockViewport(desktop) {
  mqlMatches = desktop;
  mqlListeners = [];
  window.matchMedia = jest.fn().mockImplementation((query) => ({
    get matches() {
      return query.includes('960px') ? mqlMatches : false;
    },
    media: query,
    addEventListener: (_, fn) => mqlListeners.push(fn),
    removeEventListener: (_, fn) => {
      mqlListeners = mqlListeners.filter((f) => f !== fn);
    },
    addListener: jest.fn(),
    removeListener: jest.fn(),
  }));
}

const signedOut = () => useAuth.mockReturnValue({ user: null, loading: false, signOut: jest.fn() });
const signedIn = () =>
  useAuth.mockReturnValue({
    user: { id: 'u1', email: 'ann@example.com', user_metadata: { full_name: 'Ann' } },
    loading: false,
    signOut: jest.fn(),
  });

const renderNav = (props = {}, at = '/guides') =>
  render(
    <MemoryRouter initialEntries={[at]}>
      <Routes>
        <Route path="*" element={<SiteNav {...props} />} />
      </Routes>
      <Link to="/about">elsewhere</Link>
      <button type="button">outside</button>
    </MemoryRouter>
  );

beforeEach(() => {
  jest.resetAllMocks();
  getPlannerStatus.mockResolvedValue({ entitled: false, wedding_id: null, access: null, role: null });
  mockViewport(false);
  signedOut();
});

afterEach(() => {
  delete window.matchMedia;
});

describe('SiteNav toggle', () => {
  it('renders one labelled nav and a 44px-class toggle that starts collapsed', () => {
    renderNav();
    expect(screen.getAllByRole('navigation', { name: 'Main' })).toHaveLength(1);
    const toggle = screen.getByRole('button', { name: 'Open menu' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('type', 'button');
    expect(document.getElementById(toggle.getAttribute('aria-controls'))).not.toBeNull();
  });

  it('opens and closes, swapping aria-expanded and the accessible name', () => {
    renderNav();
    const toggle = screen.getByRole('button', { name: 'Open menu' });
    fireEvent.click(toggle);
    expect(toggle).toHaveAccessibleName('Close menu');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle.closest('header')).toHaveAttribute('data-open', 'true');
    fireEvent.click(toggle);
    expect(toggle).toHaveAccessibleName('Open menu');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('keeps focus on the toggle when opened, and Escape closes and returns focus to it', () => {
    renderNav();
    const toggle = screen.getByRole('button', { name: 'Open menu' });
    toggle.focus();
    fireEvent.click(toggle);
    expect(toggle).toHaveFocus(); // opening never moves focus
    screen.getByRole('button', { name: 'outside' }).focus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveFocus();
  });

  it('ignores Escape while closed', () => {
    renderNav();
    const outside = screen.getByRole('button', { name: 'outside' });
    outside.focus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(outside).toHaveFocus();
  });

  it('closes when the backdrop (outside tap) is pressed', () => {
    renderNav();
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    fireEvent.click(screen.getByTestId('site-nav-backdrop'));
    expect(screen.getByRole('button', { name: 'Open menu' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes when a link inside the menu is tapped, and on the route change it causes', () => {
    renderNav();
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Blog' }));
    expect(screen.getByRole('button', { name: 'Open menu' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes on a route change that did not come from a menu link', () => {
    renderNav();
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    fireEvent.click(screen.getByRole('link', { name: 'elsewhere' }));
    expect(screen.getByRole('button', { name: 'Open menu' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes when the viewport grows past the breakpoint', () => {
    renderNav();
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    expect(screen.getByRole('button', { name: 'Close menu' })).toBeInTheDocument();
    mqlMatches = true;
    act(() => mqlListeners.forEach((fn) => fn()));
    expect(screen.getByRole('button', { name: 'Open menu' })).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('SiteNav links', () => {
  it('has the four site links as real anchors, in the DOM even while collapsed', () => {
    renderNav();
    expect(screen.getByRole('button', { name: 'Open menu' })).toHaveAttribute('aria-expanded', 'false');
    const nav = screen.getByRole('navigation', { name: 'Main' });
    SITE_LINKS.forEach(({ to, label }) => {
      const link = within(nav).getByText(label, { selector: 'a' });
      expect(link).toHaveAttribute('href', to);
    });
  });

  it('marks the current page with aria-current="page" and a section with "true"', () => {
    renderNav({}, '/guides');
    expect(screen.getByText('Guides', { selector: 'a' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('Blog', { selector: 'a' })).not.toHaveAttribute('aria-current');
  });

  it('marks the parent section while on a child page', () => {
    renderNav({}, '/guides/some-guide');
    expect(screen.getByText('Guides', { selector: 'a' })).toHaveAttribute('aria-current', 'true');
  });

  it('renders page anchors before the site links', () => {
    renderNav({ anchors: [{ href: '#faq', label: 'FAQ' }] });
    const hrefs = within(screen.getByRole('navigation', { name: 'Main' }))
      .getAllByRole('link')
      .map((a) => a.getAttribute('href'));
    expect(hrefs.indexOf('#faq')).toBeGreaterThan(-1);
    expect(hrefs.indexOf('#faq')).toBeLessThan(hrefs.indexOf('/wedding-planner'));
  });

  it('offers Create an event and Sign in when signed out; Sign in only for primaryAction="signin"', () => {
    const { unmount } = renderNav();
    expect(screen.getByRole('link', { name: 'Create an event' })).toHaveAttribute('href', '/login?mode=signup');
    expect(screen.getAllByRole('link', { name: 'Sign in' }).length).toBeGreaterThan(0);
    unmount();
    renderNav({ primaryAction: 'signin', signInTo: '/login?mode=signin&next=%2Fx' });
    expect(screen.queryByRole('link', { name: 'Create an event' })).toBeNull();
    const signIns = screen.getAllByRole('link', { name: 'Sign in' });
    expect(signIns).toHaveLength(1);
    expect(signIns[0]).toHaveAttribute('href', '/login?mode=signin&next=%2Fx');
  });
});

describe('SiteNav account', () => {
  it('puts the existing account menu inside the mobile menu when signed in', () => {
    signedIn();
    renderNav();
    expect(screen.queryByRole('link', { name: 'Create an event' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    const badge = screen.getByRole('button', { name: /Ann/ });
    expect(badge.closest('nav')).toBe(screen.getByRole('navigation', { name: 'Main' }));
    fireEvent.click(badge);
    expect(screen.getByRole('button', { name: 'Your Events' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign Out' })).toBeInTheDocument();
  });

  it('shows the account badge once (in the bar) on desktop', () => {
    mockViewport(true);
    signedIn();
    renderNav();
    expect(screen.getAllByRole('button', { name: /Ann/ })).toHaveLength(1);
  });

  it('treats anonymous guest sessions as signed out', () => {
    useAuth.mockReturnValue({ user: { id: 'g', is_anonymous: true }, loading: false });
    renderNav();
    expect(screen.getByRole('link', { name: 'Create an event' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Your Events/ })).toBeNull();
  });
});

describe('SiteNav CSS contract', () => {
  // CSS modules are not applied in jsdom, so check the rules that hide the
  // collapsed menu and the reduced-motion path in the stylesheet itself.
  const css = fs.readFileSync(path.join(__dirname, 'SiteNav.module.css'), 'utf8');

  it('hides the collapsed panel with visibility:hidden (not display:none), keeping it in the DOM', () => {
    const rule = css.match(/\n\.panel \{[^}]*\}/)[0];
    expect(rule).toMatch(/visibility:\s*hidden/);
    expect(rule).toMatch(/grid-template-rows:\s*0fr/);
    expect(rule).not.toMatch(/display:\s*none/);
    expect(css.match(/\.pillOpen \.panel \{[^}]*\}/)[0]).toMatch(/visibility:\s*visible/);
  });

  it('removes all motion under prefers-reduced-motion', () => {
    const block = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(block).toMatch(/\.pill/);
    expect(block).toMatch(/\.panel/);
    expect(block).toMatch(/\.bars span/);
    expect(block).toMatch(/transition:\s*none/);
  });

  it('uses the same breakpoint as the component', () => {
    expect(css).toMatch(/@media \(min-width: 960px\)/);
    expect(require('./SiteNav').DESKTOP_QUERY).toBe('(min-width: 960px)');
  });
});

describe('every public page uses the shared SiteNav once', () => {
  const guide = GUIDES[0];
  const post = POSTS[0];
  const pages = [
    ['landing', '/', <LandingPage />, '/'],
    ['wedding planner', '/wedding-planner', <WeddingPlanner />, '/wedding-planner'],
    ['about', '/about', <About />, '/about'],
    ['guides index', '/guides', <GuidesIndex />, '/guides'],
    ['guide', guide.path, <GuidePage />, '/guides/:slug'],
    ['blog index', '/blog', <BlogIndex />, '/blog'],
    ['blog post', post.path, <BlogPostPage />, '/blog/:slug'],
  ];

  it.each(pages)('%s', (_name, url, element, route) => {
    const { container } = render(
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path={route} element={element} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getAllByRole('navigation', { name: 'Main' })).toHaveLength(1);
    expect(container.querySelectorAll('header')).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Open menu' })).toHaveLength(1);
    // The old loose second row is gone.
    expect(screen.queryByRole('navigation', { name: 'Sections' })).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Page sections' })).toBeNull();
    // No other nav in the header region, and the four links are all there.
    const nav = screen.getByRole('navigation', { name: 'Main' });
    SITE_LINKS.forEach(({ to }) => {
      expect(nav.querySelector(`a[href="${to}"]`)).not.toBeNull();
    });
  });
});
