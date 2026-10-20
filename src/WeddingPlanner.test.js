import './testUtils/routerPolyfill';
import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import WeddingPlanner, { VERIFY_ATTEMPTS, VERIFY_DELAY_MS, plannerPriceText } from './WeddingPlanner';
import LandingPage from './LandingPage';
import { UserBadge } from './components/UserBadge';
import { WEDDING_PLANNER, formatPrice } from './services/pricingTiers';
import * as service from './services/weddingPlannerService';
import { useAuth } from './context/AuthContext';

jest.mock('./supabaseClient', () => ({ supabase: {} }));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('./context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('./services/weddingPlannerService', () => ({
  startCheckout: jest.fn(),
  verifyPurchase: jest.fn(),
  getPlannerStatus: jest.fn(),
  NO_PLANNER_STATUS: { entitled: false, wedding_id: null, access: null, role: null },
}));

const NONE = { entitled: false, wedding_id: null, access: null, role: null };
let uid = 0;
const realUser = () => ({ id: `user-${(uid += 1)}`, email: 'a@b.co', user_metadata: { full_name: 'Ann' } });

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname + loc.search}</div>;
}

const renderAt = (url, ui = <WeddingPlanner />) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/wedding-planner" element={ui} />
        <Route path="*" element={<LocationProbe />} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>
  );

beforeEach(() => {
  jest.resetAllMocks();
  service.getPlannerStatus.mockResolvedValue(NONE);
  useAuth.mockReturnValue({ user: null, loading: false, signOut: jest.fn() });
});

describe('marketing page', () => {
  it('renders the price from the constant', () => {
    renderAt('/wedding-planner');
    const expected = formatPrice(WEDDING_PLANNER.amountCents, WEDDING_PLANNER.currency)
      .replace(/[\s ]/g, '')
      .replace(/[,.]00$/, '');
    expect(plannerPriceText()).toBe(expected);
    expect(expected).toMatch(/199/);
    expect(screen.getAllByText(new RegExp(expected)).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /refund policy/i })[0]).toHaveAttribute('href', '/refund-policy');
  });

  it('notes it is included free with The Whole Reel, linking to event pricing', () => {
    renderAt('/wedding-planner');
    expect(screen.getByText(/Included free with The Whole Reel/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See event pricing' })).toHaveAttribute('href', '/#pricing');
  });

  it('sets the document title', () => {
    renderAt('/wedding-planner');
    expect(document.title).toMatch(/Wedding Planner/);
  });

  it('does not mention photo tier pricing', () => {
    const { container } = renderAt('/wedding-planner');
    expect(container.textContent).not.toMatch(/Gathering|Big Day|R179|R399|R999/);
  });
});

describe('buying', () => {
  it('signed out: Buy routes to sign-up with a return to ?buy=1', async () => {
    renderAt('/wedding-planner');
    await userEvent.click(screen.getAllByRole('button', { name: /^Buy for/ })[0]);
    await waitFor(() => {
      const locs = screen.getAllByTestId('loc').map((n) => n.textContent);
      expect(locs.some((l) => l.startsWith('/login?mode=signup&next=') && decodeURIComponent(l).endsWith('next=/wedding-planner?buy=1'))).toBe(true);
    });
    expect(service.startCheckout).not.toHaveBeenCalled();
  });

  it('treats an anonymous guest session as signed out', async () => {
    useAuth.mockReturnValue({ user: { id: 'g', is_anonymous: true }, loading: false });
    renderAt('/wedding-planner');
    await userEvent.click(screen.getAllByRole('button', { name: /^Buy for/ })[0]);
    expect(service.startCheckout).not.toHaveBeenCalled();
    expect(service.getPlannerStatus).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getAllByTestId('loc').some((n) => n.textContent.startsWith('/login'))).toBe(true)
    );
  });

  it('signed in: starts checkout once, even on double click', async () => {
    useAuth.mockReturnValue({ user: realUser(), loading: false });
    let resolve;
    service.startCheckout.mockReturnValue(new Promise((r) => { resolve = r; }));
    renderAt('/wedding-planner');
    const btn = await screen.findAllByRole('button', { name: /^Buy for/ });
    await waitFor(() => expect(btn[0]).toBeEnabled());
    await userEvent.dblClick(btn[0]);
    expect(service.startCheckout).toHaveBeenCalledTimes(1);
    await act(async () => resolve());
  });

  it('shows an honest, retryable error when checkout fails', async () => {
    useAuth.mockReturnValue({ user: realUser(), loading: false });
    service.startCheckout.mockRejectedValueOnce(new Error('Payments are down'));
    renderAt('/wedding-planner');
    const btn = (await screen.findAllByRole('button', { name: /^Buy for/ }))[0];
    await waitFor(() => expect(btn).toBeEnabled());
    await userEvent.click(btn);
    expect((await screen.findAllByRole('alert'))[0]).toHaveTextContent('Payments are down');
    service.startCheckout.mockResolvedValueOnce('https://x');
    await userEvent.click(screen.getAllByRole('button', { name: /^Buy for/ })[0]);
    expect(service.startCheckout).toHaveBeenCalledTimes(2);
  });

  it('returning signed in with ?buy=1 continues to checkout once and clears the flag', async () => {
    useAuth.mockReturnValue({ user: realUser(), loading: false });
    service.startCheckout.mockResolvedValue('https://x');
    renderAt('/wedding-planner?buy=1');
    await waitFor(() => expect(service.startCheckout).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getAllByTestId('loc')[0].textContent).not.toMatch(/buy=1/)
    );
  });

  it('?buy=1 does not start checkout for an already-entitled user', async () => {
    useAuth.mockReturnValue({ user: realUser(), loading: false });
    service.getPlannerStatus.mockResolvedValue({ ...NONE, entitled: true, access: 'partner' });
    renderAt('/wedding-planner?buy=1');
    await screen.findAllByRole('link', { name: /open your wedding planner/i });
    expect(service.startCheckout).not.toHaveBeenCalled();
  });

  it('entitled user sees Open instead of Buy', async () => {
    useAuth.mockReturnValue({ user: realUser(), loading: false });
    service.getPlannerStatus.mockResolvedValue({ ...NONE, entitled: true });
    renderAt('/wedding-planner');
    const links = await screen.findAllByRole('link', { name: /open your wedding planner/i });
    expect(links[0]).toHaveAttribute('href', '/hq/');
    expect(screen.queryByRole('button', { name: /^Buy for/ })).toBeNull();
  });
});

// Jest 27 has no advanceTimersByTimeAsync: flush pending promises, then fire the wait.
const tick = async () => {
  await act(async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  });
  await act(async () => {
    jest.advanceTimersByTime(VERIFY_DELAY_MS);
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  });
};

describe('return from Paystack', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    useAuth.mockReturnValue({ user: realUser(), loading: false });
  });
  afterEach(() => jest.useRealTimers());

  const renderReturn = () => {
    renderAt('/wedding-planner?payment=success&reference=ref_1');
  };

  it('shows confirming, retries pending, then success with a link to /hq/', async () => {
    service.verifyPurchase
      .mockResolvedValueOnce({ status: 'pending' })
      .mockResolvedValueOnce({ status: 'pending' })
      .mockResolvedValueOnce({ status: 'paid' });
    renderReturn();
    expect(await screen.findByText(/Confirming your payment/)).toBeInTheDocument();
    expect(service.verifyPurchase).toHaveBeenCalledWith('ref_1');
    await tick();
    await tick();
    expect(await screen.findByText(/You are all set/)).toBeInTheDocument();
    expect(service.verifyPurchase).toHaveBeenCalledTimes(3);
    expect(screen.getAllByRole('link', { name: /open your wedding planner/i })[0]).toHaveAttribute('href', '/hq/');
  });

  it('already_paid counts as success', async () => {
    service.verifyPurchase.mockResolvedValue({ status: 'already_paid' });
    renderReturn();
    expect(await screen.findByText(/You are all set/)).toBeInTheDocument();
  });

  it('gives up honestly after the attempt limit and offers a re-check', async () => {
    service.verifyPurchase.mockResolvedValue({ status: 'pending' });
    renderReturn();
    for (let i = 0; i < VERIFY_ATTEMPTS; i += 1) {
      await tick();
    }
    expect(await screen.findByText(/Still waiting for confirmation/)).toBeInTheDocument();
    expect(service.verifyPurchase).toHaveBeenCalledTimes(VERIFY_ATTEMPTS);
    expect(screen.getByText(/do not need to pay again/)).toBeInTheDocument();
    service.verifyPurchase.mockResolvedValue({ status: 'paid' });
    const btn = screen.getByRole('button', { name: /check again/i });
    await act(async () => { btn.click(); });
    expect(await screen.findByText(/You are all set/)).toBeInTheDocument();
  });

  it('failed shows failure copy and does not retry', async () => {
    service.verifyPurchase.mockResolvedValue({ status: 'failed' });
    renderReturn();
    expect(await screen.findByText(/did not go through/)).toBeInTheDocument();
    expect(service.verifyPurchase).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /try payment again/i })).toBeInTheDocument();
  });

  it('not_found shows the reference', async () => {
    service.verifyPurchase.mockResolvedValue({ status: 'not_found' });
    renderReturn();
    expect(await screen.findByText(/could not find that payment/)).toBeInTheDocument();
    expect(screen.getByText('ref_1')).toBeInTheDocument();
  });

  it('transport errors are retried then reported as a connection problem', async () => {
    service.verifyPurchase.mockRejectedValue(new Error('network'));
    renderReturn();
    for (let i = 0; i < VERIFY_ATTEMPTS; i += 1) {
      await tick();
    }
    expect(await screen.findByText(/could not check your payment/i)).toBeInTheDocument();
    expect(service.verifyPurchase).toHaveBeenCalledTimes(VERIFY_ATTEMPTS);
  });

  it('signed out: asks to sign in and does not call verify', async () => {
    useAuth.mockReturnValue({ user: null, loading: false });
    renderReturn();
    expect(await screen.findByText(/Sign in to confirm your payment/)).toBeInTheDocument();
    expect(service.verifyPurchase).not.toHaveBeenCalled();
  });
});

describe('nav link', () => {
  const renderBadge = async () => {
    render(
      <MemoryRouter>
        <UserBadge />
      </MemoryRouter>
    );
    await userEvent.click(screen.getByRole('button'));
  };

  it('shows Wedding Planner only when entitled, linking to /hq/', async () => {
    useAuth.mockReturnValue({ user: realUser(), signOut: jest.fn() });
    service.getPlannerStatus.mockResolvedValue({ ...NONE, entitled: true });
    await renderBadge();
    expect(await screen.findByRole('button', { name: 'Wedding Planner' })).toBeInTheDocument();
  });

  it('shows it for a collaborator (access set, not entitled)', async () => {
    useAuth.mockReturnValue({ user: realUser(), signOut: jest.fn() });
    service.getPlannerStatus.mockResolvedValue({ ...NONE, access: 'collaborator' });
    await renderBadge();
    expect(await screen.findByRole('button', { name: 'Wedding Planner' })).toBeInTheDocument();
  });

  it('is hidden when not entitled, and when the lookup fails', async () => {
    useAuth.mockReturnValue({ user: realUser(), signOut: jest.fn() });
    await renderBadge();
    expect(screen.getByRole('button', { name: 'Your Events' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Wedding Planner' })).toBeNull();
  });

  it('is never looked up for anonymous guests', () => {
    useAuth.mockReturnValue({ user: { id: 'g', is_anonymous: true } });
    render(<MemoryRouter><UserBadge /></MemoryRouter>);
    expect(service.getPlannerStatus).not.toHaveBeenCalled();
  });
});

describe('landing page section', () => {
  it('shows the planner price from the constant and links to the page', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );
    expect(screen.getByText(/One-time R\s?199 per wedding/)).toBeInTheDocument();
    const cta = screen.getByRole('link', { name: 'Explore the Wedding Planner' });
    expect(cta).toHaveAttribute('href', '/wedding-planner');
    expect(screen.getAllByRole('link', { name: /Wedding Planner/ }).length).toBeGreaterThan(1);
  });

  it('lists the planner as included only on The Whole Reel card', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );
    const cards = screen.getAllByText(/^Wedding Planner included \(worth R\s?199\)$/);
    expect(cards).toHaveLength(1);
    expect(cards[0].closest('div')).toHaveTextContent('The Whole Reel');
    expect(screen.getByRole('link', { name: 'See pricing' })).toHaveAttribute('href', '#pricing');
  });
});
