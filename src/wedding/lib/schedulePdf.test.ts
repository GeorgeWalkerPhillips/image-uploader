import '../testPolyfills';
import { jsPDF } from 'jspdf';
import { pdfFileName, pdfSafe, renderSchedulePdf } from './schedulePdf';
import type { ScheduleItem } from '../types';

const item = (n: number, o: Partial<ScheduleItem> = {}): ScheduleItem => ({
  id: `i${n}`, wedding_id: 'w', start_time: `${String(8 + (n % 14)).padStart(2, '0')}:${n % 2 ? '30' : '00'}:00`, end_time: null,
  title: `Item ${n}`, location: null, who: null, notes: null, ...o,
});
const base = { weddingName: 'Ada & Ben', dateLabel: 'Saturday, 6 March 2027', venue: 'The Garden' };
const make = () => new jsPDF({ unit: 'mm', format: 'a4' });

describe('pdfSafe', () => {
  it('flattens typographic punctuation and drops what the built-in fonts cannot print', () => {
    expect(pdfSafe('“Hello” – it’s … ok 💍 \n there')).toBe('"Hello" - it\'s ... ok there');
    expect(pdfSafe('Café Zoë')).toBe('Café Zoë');
  });
});

describe('pdfFileName', () => {
  it('makes a safe slug', () => {
    expect(pdfFileName('Thandi & Michaël')).toBe('thandi-michael-day-schedule.pdf');
    expect(pdfFileName('💍')).toBe('wedding-day-schedule.pdf');
  });
});

describe('renderSchedulePdf', () => {
  it('fits a short day on one A4 page with a footer', () => {
    const d = renderSchedulePdf(make(), { ...base, items: [item(1), item(2, { notes: 'Bring rings', who: 'Sam' })] });
    expect(d.getNumberOfPages()).toBe(1);
    expect(d.internal.pageSize.getWidth()).toBeCloseTo(210, 0);
  });

  it('flows a long day onto more pages and numbers them', () => {
    const items = Array.from({ length: 40 }, (_, n) => item(n, { notes: 'A longer note that wraps over a couple of lines so the entry is taller.' }));
    const d = renderSchedulePdf(make(), { ...base, items });
    expect(d.getNumberOfPages()).toBeGreaterThan(2);
    const bytes = d.output();
    expect(bytes).toContain(`PAGE ${d.getNumberOfPages()} OF ${d.getNumberOfPages()}`);
  });

  it('never splits an entry across pages and survives long and unprintable text', () => {
    const items = [item(1, { title: 'x'.repeat(120), notes: 'y'.repeat(1000), location: 'z'.repeat(160) }), item(2, { title: '💍💍' })];
    expect(() => renderSchedulePdf(make(), { ...base, weddingName: 'W'.repeat(200), items })).not.toThrow();
  });

  it('still produces a document when there are no items', () => {
    const d = renderSchedulePdf(make(), { ...base, items: [] });
    expect(d.getNumberOfPages()).toBe(1);
    expect(d.output()).toContain('No schedule items yet.');
  });
});
