import { TextDecoder, TextEncoder } from 'util';

// jsPDF (via fast-png) needs these; Jest 27's jsdom lacks them.
Object.assign(globalThis, { TextEncoder, TextDecoder });

const { jsPDF } = require('jspdf');
const { guestLink, pdfSafe, qrSheetFileName, renderQrSheet, shareMessage, whatsappShareUrl } = require('./eventShare');

// A valid 1x1 PNG.
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('share links', () => {
  it('builds the guest link', () => {
    expect(guestLink('https://valere.co.za', 'abc')).toBe('https://valere.co.za/camera?event=abc');
  });

  it('puts the event name and link in a WhatsApp message, URL-encoded', () => {
    const link = guestLink('https://valere.co.za', 'abc');
    const url = whatsappShareUrl('Zoe & Sam\'s 30th', link);
    expect(url.startsWith('https://wa.me/?text=')).toBe(true);
    expect(decodeURIComponent(url.slice('https://wa.me/?text='.length))).toBe(shareMessage('Zoe & Sam\'s 30th', link));
    expect(url).not.toContain(' ');
    expect(url).not.toContain('&text');
  });
});

describe('pdfSafe / file name', () => {
  it('drops what the built-in fonts cannot print and flattens punctuation', () => {
    expect(pdfSafe('“Zoe’s” party 🎉 – 30th')).toBe('"Zoe\'s" party - 30th');
    expect(pdfSafe(null)).toBe('');
  });

  it('makes a safe file name', () => {
    expect(qrSheetFileName('Zoë & Sam: 30th!')).toBe('zoe-sam-30th-qr-sheet.pdf');
    expect(qrSheetFileName('🎉')).toBe('event-qr-sheet.pdf');
  });
});

describe('renderQrSheet', () => {
  const draw = (eventName) =>
    renderQrSheet(new jsPDF({ unit: 'mm', format: 'a4' }), {
      eventName, link: 'https://valere.co.za/camera?event=abc', qrDataUrl: PNG,
    });

  it('makes one A4 page with the event name and instructions', () => {
    const d = draw('Zoe & Sam');
    expect(d.getNumberOfPages()).toBe(1);
    const out = d.output();
    expect(out).toContain('Scan to add your photos');
    expect(out).toContain('Zoe & Sam');
  });

  it('copes with a very long or unprintable name', () => {
    expect(() => draw('W'.repeat(300))).not.toThrow();
    expect(() => draw('🎉🎉')).not.toThrow();
  });
});
