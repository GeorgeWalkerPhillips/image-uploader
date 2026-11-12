import type { jsPDF } from 'jspdf';
import { durationLabel, hhmm, sortSchedule } from './schedule';
import type { ScheduleItem } from '../types';

// The printable wedding day schedule, in the Valere look: warm cream paper,
// espresso ink (the logo's brown), a muted gold accent, serif headings. Built
// with jsPDF's built-in fonts so nothing has to be downloaded or embedded.

export interface SchedulePdfInput {
  weddingName: string;
  /** Long, ready-to-print date, e.g. "Saturday, 12 December 2026". */
  dateLabel: string;
  venue: string | null;
  items: readonly ScheduleItem[];
}

export interface PdfLogo {
  dataUrl: string;
  /** Natural size, used only for the aspect ratio. */
  width: number;
  height: number;
}

type Rgb = readonly [number, number, number];
const PAPER: Rgb = [250, 246, 240];
const INK: Rgb = [44, 31, 22];
const GOLD: Rgb = [168, 132, 79];
const MUTED: Rgb = [122, 106, 92];
const HAIRLINE: Rgb = [221, 210, 195];

const PAGE_W = 210;
const PAGE_H = 297;
const BOTTOM = 276; // content stops here; the footer sits below
const TIME_RIGHT = 44; // right edge of the time column
const LINE_X = 52; // the vertical timeline
const BODY_X = 60;
const BODY_W = 190 - BODY_X;

// The built-in PDF fonts only cover Western European text. Anything else
// (emoji, other scripts) would print as garbage, so it is dropped, and the
// typographic punctuation is flattened to plain equivalents.
export function pdfSafe(text: string): string {
  return text
    .replace(/[‘’‚]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[^\S ]+/g, ' ')
    .replace(/[^ -~ -ÿ]/g, '')
    .replace(/ {2,}/g, ' ')
    .trim();
}

export function pdfFileName(weddingName: string): string {
  const slug = weddingName
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'wedding'}-day-schedule.pdf`;
}

const setInk = (d: jsPDF, c: Rgb) => d.setTextColor(c[0], c[1], c[2]);

// Letter-spaced text. jsPDF aligns on the unspaced width, which pushes centred
// and right-aligned text off-centre, so the spaced width is worked out here.
function spaced(d: jsPDF, text: string, x: number, y: number, space: number, align: 'left' | 'center' | 'right') {
  const width = d.getTextWidth(text) + space * text.length;
  const left = align === 'left' ? x : align === 'center' ? x - width / 2 : x - width;
  d.setCharSpace(space);
  d.text(text, left, y);
  d.setCharSpace(0);
}

function paintPage(d: jsPDF) {
  d.setFillColor(PAPER[0], PAPER[1], PAPER[2]);
  d.rect(0, 0, PAGE_W, PAGE_H, 'F');
  d.setDrawColor(GOLD[0], GOLD[1], GOLD[2]);
  d.setLineWidth(0.3);
  d.rect(8, 8, PAGE_W - 16, PAGE_H - 16, 'S'); // fine gold frame
}

function wordmark(d: jsPDF, x: number, y: number, size: number, align: 'left' | 'center') {
  d.setFont('times', 'bold');
  d.setFontSize(size);
  setInk(d, INK);
  d.text('valere.', x, y, { align });
}

function diamondRule(d: jsPDF, y: number, half = 22) {
  const cx = PAGE_W / 2;
  d.setDrawColor(GOLD[0], GOLD[1], GOLD[2]);
  d.setLineWidth(0.3);
  d.line(cx - half, y, cx - 3, y);
  d.line(cx + 3, y, cx + half, y);
  d.setFillColor(GOLD[0], GOLD[1], GOLD[2]);
  d.triangle(cx, y - 1.3, cx + 1.3, y, cx, y + 1.3, 'F');
  d.triangle(cx, y - 1.3, cx - 1.3, y, cx, y + 1.3, 'F');
}

// Cover block on the first page. Returns the y where the timeline starts.
function drawCover(d: jsPDF, input: SchedulePdfInput, logo: PdfLogo | null): number {
  if (logo) {
    const w = 36;
    const h = (w * logo.height) / logo.width;
    d.addImage(logo.dataUrl, 'PNG', (PAGE_W - w) / 2, 22, w, h);
  } else {
    wordmark(d, PAGE_W / 2, 32, 30, 'center');
  }

  d.setFont('helvetica', 'normal');
  d.setFontSize(8.5);
  setInk(d, GOLD);
  spaced(d, 'WEDDING DAY SCHEDULE', PAGE_W / 2, 56, 2.2, 'center');

  d.setFont('times', 'bold');
  d.setFontSize(32);
  setInk(d, INK);
  const nameLines = (d.splitTextToSize(pdfSafe(input.weddingName), 150) as string[]).slice(0, 2);
  let y = 72;
  nameLines.forEach((line) => {
    d.text(line, PAGE_W / 2, y, { align: 'center' });
    y += 13;
  });

  y += 1;
  diamondRule(d, y);
  y += 10;

  d.setFont('times', 'italic');
  d.setFontSize(14);
  setInk(d, INK);
  d.text(pdfSafe(input.dateLabel), PAGE_W / 2, y, { align: 'center' });
  y += 7;

  if (input.venue && pdfSafe(input.venue)) {
    d.setFont('helvetica', 'normal');
    d.setFontSize(10);
    setInk(d, MUTED);
    const venue = (d.splitTextToSize(pdfSafe(input.venue), 150) as string[]).slice(0, 2);
    venue.forEach((line) => {
      d.text(line, PAGE_W / 2, y, { align: 'center' });
      y += 5;
    });
  }
  return y + 12;
}

// Slim running header for pages after the first.
function drawRunningHeader(d: jsPDF, weddingName: string): number {
  wordmark(d, 20, 22, 15, 'left');
  d.setFont('helvetica', 'normal');
  d.setFontSize(8);
  setInk(d, MUTED);
  const name = (d.splitTextToSize(pdfSafe(weddingName).toUpperCase(), 100) as string[])[0];
  spaced(d, name, 190, 22, 0.8, 'right');
  d.setDrawColor(HAIRLINE[0], HAIRLINE[1], HAIRLINE[2]);
  d.setLineWidth(0.25);
  d.line(20, 27, 190, 27);
  return 40;
}

interface Block {
  time: string;
  until: string;
  title: string[];
  details: Array<{ label: string; lines: string[] }>;
  notes: string[];
  height: number;
}

const TITLE_LH = 5.6;
const SMALL_LH = 4.4;

function measure(d: jsPDF, item: ScheduleItem): Block {
  d.setFont('times', 'bold');
  d.setFontSize(13);
  const title = d.splitTextToSize(pdfSafe(item.title), BODY_W) as string[];

  d.setFont('helvetica', 'normal');
  d.setFontSize(9.5);
  const details: Block['details'] = [];
  const add = (label: string, value: string | null) => {
    const v = value ? pdfSafe(value) : '';
    if (v) details.push({ label, lines: d.splitTextToSize(v, BODY_W - 17) as string[] });
  };
  add('WHERE', item.location);
  add('WHO', item.who);

  d.setFont('helvetica', 'italic');
  const notes = item.notes && pdfSafe(item.notes) ? (d.splitTextToSize(pdfSafe(item.notes), BODY_W) as string[]) : [];

  const dur = durationLabel(item.start_time, item.end_time);
  const until = item.end_time ? `until ${hhmm(item.end_time)}${dur ? ` (${dur})` : ''}` : '';

  let height = title.length * TITLE_LH;
  details.forEach((r) => { height += r.lines.length * SMALL_LH + 0.6; });
  height += notes.length * SMALL_LH + (notes.length ? 0.6 : 0);
  return { time: hhmm(item.start_time), until, title, details, notes, height: Math.max(height, 9) };
}

function drawBlock(d: jsPDF, b: Block, y: number, hasNext: boolean, nextTop: number, continued: boolean) {
  // Time column.
  d.setFont('times', 'bold');
  d.setFontSize(16);
  setInk(d, INK);
  d.text(b.time, TIME_RIGHT, y + 4.2, { align: 'right' });
  if (b.until) {
    d.setFont('helvetica', 'normal');
    d.setFontSize(7);
    setInk(d, MUTED);
    const small = d.splitTextToSize(b.until, 26) as string[];
    small.forEach((line, i) => d.text(line, TIME_RIGHT, y + 8.4 + i * 3.2, { align: 'right' }));
  }

  // The timeline: a line down to the next entry (or off the page edge), then the dot.
  d.setDrawColor(HAIRLINE[0], HAIRLINE[1], HAIRLINE[2]);
  d.setLineWidth(0.4);
  if (continued) d.line(LINE_X, 30, LINE_X, y + 3.2); // arrives from the previous page
  if (hasNext) d.line(LINE_X, y + 3.2, LINE_X, Math.min(nextTop + 3.2, BOTTOM + 4));
  d.setFillColor(GOLD[0], GOLD[1], GOLD[2]);
  d.circle(LINE_X, y + 3.2, 1.3, 'F');
  d.setFillColor(PAPER[0], PAPER[1], PAPER[2]);
  d.circle(LINE_X, y + 3.2, 0.5, 'F');

  // Body.
  let cy = y + 4;
  d.setFont('times', 'bold');
  d.setFontSize(13);
  setInk(d, INK);
  b.title.forEach((line) => {
    d.text(line, BODY_X, cy);
    cy += TITLE_LH;
  });
  cy -= TITLE_LH - SMALL_LH - 0.4;
  b.details.forEach((row) => {
    d.setFont('helvetica', 'bold');
    d.setFontSize(6.5);
    setInk(d, GOLD);
    d.setCharSpace(0.6);
    d.text(row.label, BODY_X, cy);
    d.setCharSpace(0);
    d.setFont('helvetica', 'normal');
    d.setFontSize(9.5);
    setInk(d, MUTED);
    row.lines.forEach((line, i) => d.text(line, BODY_X + 17, cy + i * SMALL_LH));
    cy += row.lines.length * SMALL_LH + 0.6;
  });
  if (b.notes.length) {
    d.setFont('helvetica', 'italic');
    d.setFontSize(9.5);
    setInk(d, MUTED);
    b.notes.forEach((line) => {
      d.text(line, BODY_X, cy);
      cy += SMALL_LH;
    });
  }
}

function drawFooters(d: jsPDF) {
  const total = d.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    d.setPage(p);
    d.setDrawColor(HAIRLINE[0], HAIRLINE[1], HAIRLINE[2]);
    d.setLineWidth(0.25);
    d.line(20, 283, 190, 283);
    d.setFont('helvetica', 'normal');
    d.setFontSize(7.5);
    setInk(d, MUTED);
    spaced(d, 'PREPARED WITH VALERE', 20, 288, 0.6, 'left');
    spaced(d, `PAGE ${p} OF ${total}`, 190, 288, 0.6, 'right');
  }
}

// Draws the whole schedule onto a jsPDF document the caller created (A4, mm).
export function renderSchedulePdf(d: jsPDF, input: SchedulePdfInput, logo: PdfLogo | null = null): jsPDF {
  paintPage(d);
  let y = drawCover(d, input, logo);

  const items = sortSchedule(input.items);
  if (items.length === 0) {
    d.setFont('times', 'italic');
    d.setFontSize(13);
    setInk(d, MUTED);
    d.text('No schedule items yet.', PAGE_W / 2, y + 10, { align: 'center' });
    drawFooters(d);
    return d;
  }

  const blocks = items.map((i) => measure(d, i));
  const GAP = 6;
  blocks.forEach((b, i) => {
    let continued = false;
    if (y + b.height > BOTTOM) {
      continued = true;
      // The line continues off the bottom of this page and in at the top of the next.
      d.addPage();
      paintPage(d);
      y = drawRunningHeader(d, input.weddingName);
    }
    const nextTop = y + b.height + GAP;
    drawBlock(d, b, y, i < blocks.length - 1, nextTop, continued);
    y = nextTop;
  });

  drawFooters(d);
  return d;
}

// Loads the logo for the cover; null (a text wordmark is drawn instead) if it
// cannot be fetched, for example when offline.
export async function loadLogo(url: string): Promise<PdfLogo | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
    const size = await new Promise<{ width: number; height: number }>((resolve, reject) => {
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

// Builds the PDF and saves it to the device. jsPDF is loaded on demand so it
// only costs anything when someone taps the button.
export async function downloadSchedulePdf(input: SchedulePdfInput, logoUrl: string): Promise<void> {
  const [{ jsPDF: JsPDF }, logo] = await Promise.all([import('jspdf'), loadLogo(logoUrl)]);
  const doc = new JsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  renderSchedulePdf(doc, input, logo);
  doc.save(pdfFileName(input.weddingName));
}
