import '../testUtils/routerPolyfill';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MarketingConsent } from './MarketingConsent';
import * as pixel from '../utils/metaPixel';

jest.mock('../utils/metaPixel', () => ({
  ...jest.requireActual('../utils/metaPixel'),
  isPixelConfigured: jest.fn(),
  trackPageView: jest.fn(),
}));

const renderAt = (url) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <MarketingConsent />
    </MemoryRouter>
  );

beforeEach(() => {
  window.localStorage.clear();
  pixel.isPixelConfigured.mockReturnValue(true);
  pixel.trackPageView.mockClear();
});

describe('MarketingConsent', () => {
  it('shows on a public page and stores Accept, then tracks a page view', () => {
    renderAt('/wedding-planner');
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    expect(window.localStorage.getItem('cbv:marketing-consent')).toBe('granted');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(pixel.trackPageView).toHaveBeenCalledWith('/wedding-planner');
  });

  it('stores Decline and never tracks', () => {
    renderAt('/');
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }));
    expect(window.localStorage.getItem('cbv:marketing-consent')).toBe('denied');
    expect(pixel.trackPageView).not.toHaveBeenCalled();
  });

  it.each(['/camera?event=x', '/gallery', '/admin', '/login', '/hq', '/?event=abc'])(
    'never shows on %s',
    (url) => {
      renderAt(url);
      expect(screen.queryByRole('dialog')).toBeNull();
    }
  );

  it('renders nothing when no pixel id is configured', () => {
    pixel.isPixelConfigured.mockReturnValue(false);
    renderAt('/');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
