import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { EventReadyPanel } from './EventReadyPanel';

const event = { id: 'ev-1', name: 'Zoe & Sam' };
const setup = (over = {}) => {
  const props = { event, origin: 'https://valere.co.za', onCopy: jest.fn(), onDownloadSheet: jest.fn(), onClose: jest.fn(), ...over };
  render(<EventReadyPanel {...props} />);
  return props;
};

test('names the event and shows a QR code for its guest link', () => {
  setup();
  expect(screen.getByRole('heading', { name: 'Zoe & Sam is ready for photos' })).toBeInTheDocument();
  expect(document.getElementById('ready-qr-ev-1')).toBeInTheDocument();
});

test('WhatsApp share opens wa.me safely with the guest link inside the message', () => {
  setup();
  const a = screen.getByRole('link', { name: /Share on WhatsApp/ });
  expect(a.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/\?text=/);
  expect(decodeURIComponent(a.getAttribute('href'))).toContain('https://valere.co.za/camera?event=ev-1');
  expect(a).toHaveAttribute('target', '_blank');
  expect(a.getAttribute('rel')).toContain('noopener');
});

test('copy, printable sheet and close call back with the right things', () => {
  const p = setup();
  fireEvent.click(screen.getByRole('button', { name: /Copy link/ }));
  expect(p.onCopy).toHaveBeenCalledWith('ev-1');
  fireEvent.click(screen.getByRole('button', { name: /Printable QR sheet/ }));
  expect(p.onDownloadSheet).toHaveBeenCalledWith(event);
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(p.onClose).toHaveBeenCalled();
});
