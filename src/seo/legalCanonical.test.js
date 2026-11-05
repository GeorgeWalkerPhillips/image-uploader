import '../testUtils/routerPolyfill';
import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Terms from '../Terms';
import PrivacyPolicy from '../PrivacyPolicy';
import RefundPolicy from '../RefundPolicy';

const canonical = () => document.head.querySelector('link[rel="canonical"]');

describe.each([
  ['Terms', Terms, '/terms'],
  ['PrivacyPolicy', PrivacyPolicy, '/privacy'],
  ['RefundPolicy', RefundPolicy, '/refund-policy'],
])('%s canonical', (_name, Page, path) => {
  beforeEach(() => {
    document.head.innerHTML = '<link rel="canonical" href="https://www.valere.co.za/" />';
  });

  it('points at its own URL and restores the shell value on unmount', () => {
    const { unmount } = render(<MemoryRouter><Page /></MemoryRouter>);
    expect(canonical().getAttribute('href')).toBe(`https://www.valere.co.za${path}`);
    unmount();
    expect(canonical().getAttribute('href')).toBe('https://www.valere.co.za/');
  });
});
