// Sharing helpers for an event's guest link, plus the printable QR sheet.
// Pure functions are kept apart from the browser-only download so they can be
// unit tested.

export const guestLink = (origin, eventId) => `${origin}/camera?event=${eventId}`;

// The message pre-filled when the organiser taps "Share on WhatsApp".
export const shareMessage = (eventName, link) =>
  `Help us capture ${eventName}! Scan or tap to add your photos - no app and no sign-up: ${link}`;

export const whatsappShareUrl = (eventName, link) =>
  `https://wa.me/?text=${encodeURIComponent(shareMessage(eventName, link))}`;

// jsPDF's built-in fonts only cover Western European text; anything else
// (emoji, other scripts) would print as garbage, so it is dropped.
export function pdfSafe(text) {
  return String(text ?? '')
    .replace(/[‘’‚]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[^\S ]+/g, ' ')
    .replace(/[^ -~ -ÿ]/g, '')
    .replace(/ {2,}/g, ' ')
    .trim();
}

export function qrSheetFileName(eventName) {
  const slug = String(eventName ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'event'}-qr-sheet.pdf`;
}

const PAPER = [250, 246, 240];
const INK = [44, 31, 22];
const GOLD = [168, 132, 79];
const MUTED = [122, 106, 92];
const W = 210;
const H = 297;

const color = (d, c) => d.setTextColor(c[0], c[1], c[2]);

function spaced(d, text, x, y, space) {
  const width = d.getTextWidth(text) + space * text.length;
  d.setCharSpace(space);
  d.text(text, x - width / 2, y);
  d.setCharSpace(0);
}

// Draws the A4 sheet guests see on the table: big QR, how it works, no jargon.
export function renderQrSheet(d, { eventName, link, qrDataUrl, logo = null }) {
  d.setFillColor(PAPER[0], PAPER[1], PAPER[2]);
  d.rect(0, 0, W, H, 'F');
  d.setDrawColor(GOLD[0], GOLD[1], GOLD[2]);
  d.setLineWidth(0.3);
  d.rect(8, 8, W - 16, H - 16, 'S');

  if (logo) {
    const w = 38;
    d.addImage(logo.dataUrl, 'PNG', (W - w) / 2, 22, w, (w * logo.height) / logo.width);
  } else {
    d.setFont('times', 'bold');
    d.setFontSize(30);
    color(d, INK);
    d.text('valere.', W / 2, 34, { align: 'center' });
  }

  d.setFont('helvetica', 'normal');
  d.setFontSize(8.5);
  color(d, GOLD);
  spaced(d, 'SHARE THE MEMORIES', W / 2, 54, 2.2);

  d.setFont('times', 'bold');
  d.setFontSize(28);
  color(d, INK);
  const name = pdfSafe(eventName) || 'Our event';
  const lines = d.splitTextToSize(name, 160).slice(0, 2);
  let y = 68;
  lines.forEach((line) => {
    d.text(line, W / 2, y, { align: 'center' });
    y += 12;
  });

  // QR on a white card with a fine gold edge.
  const box = 112;
  const bx = (W - box) / 2;
  const by = y + 6;
  d.setFillColor(255, 255, 255);
  d.setDrawColor(GOLD[0], GOLD[1], GOLD[2]);
  d.roundedRect(bx, by, box, box, 4, 4, 'FD');
  d.addImage(qrDataUrl, 'PNG', bx + 8, by + 8, box - 16, box - 16);

  y = by + box + 16;
  d.setFont('times', 'italic');
  d.setFontSize(22);
  color(d, INK);
  d.text('Scan to add your photos', W / 2, y, { align: 'center' });

  y += 14;
  d.setFont('helvetica', 'normal');
  d.setFontSize(11);
  color(d, MUTED);
  ['1.  Open your phone camera and point it at the code',
    '2.  Tap the link, then take or choose your photos',
    '3.  They appear in the shared gallery - no app, no sign-up'].forEach((s) => {
    d.text(s, W / 2, y, { align: 'center' });
    y += 7;
  });

  let host = '';
  try {
    host = new URL(link).host;
  } catch {
    host = '';
  }
  d.setFontSize(8);
  spaced(d, `PREPARED WITH VALERE${host ? '  -  ' + host.toUpperCase() : ''}`, W / 2, 282, 0.6);
  return d;
}

async function loadLogo(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const dataUrl = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
    const size = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error('logo'));
      img.src = dataUrl;
    });
    return size.width > 0 && size.height > 0 ? { dataUrl, ...size } : null;
  } catch {
    return null;
  }
}

// Builds the sheet from the QR canvas already on the page and saves it.
export async function downloadQrSheet({ eventName, link, qrCanvas, logoUrl = '/valere_logo.png' }) {
  const qrDataUrl = qrCanvas.toDataURL('image/png');
  const logo = await loadLogo(logoUrl);
  // Loaded on demand so the dashboard doesn't pay for it until it is needed.
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  renderQrSheet(doc, { eventName, link, qrDataUrl, logo });
  doc.save(qrSheetFileName(eventName));
}
