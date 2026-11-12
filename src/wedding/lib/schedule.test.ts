import { durationLabel, hhmm, overlappingIds, sortSchedule, STARTER_SCHEDULE, validateScheduleItem } from './schedule';
import type { ScheduleFormValues } from './schedule';
import type { ScheduleItem } from '../types';

const item = (id: string, start: string, end: string | null = null): ScheduleItem => ({
  id, wedding_id: 'w', start_time: start, end_time: end, title: id, location: null, who: null, notes: null,
});
const form = (o: Partial<ScheduleFormValues> = {}): ScheduleFormValues => ({
  start: '14:30', end: '', title: 'Ceremony', location: '', who: '', notes: '', ...o,
});

describe('validateScheduleItem', () => {
  it('accepts a minimal item and turns blanks into null', () => {
    expect(validateScheduleItem(form())).toEqual({
      ok: true,
      value: { start_time: '14:30', end_time: null, title: 'Ceremony', location: null, who: null, notes: null },
    });
  });

  it('trims text and keeps an end time', () => {
    const r = validateScheduleItem(form({ end: '15:15', title: '  Ceremony ', location: ' Garden ' }));
    expect(r).toEqual({ ok: true, value: expect.objectContaining({ end_time: '15:15', title: 'Ceremony', location: 'Garden' }) });
  });

  it('requires a start time and a title', () => {
    const r = validateScheduleItem(form({ start: '', title: '  ' }));
    expect(r).toEqual({ ok: false, errors: { start: 'Choose a start time.', title: 'Say what happens.' } });
  });

  it('rejects malformed times and an end that is not after the start', () => {
    expect(validateScheduleItem(form({ start: '25:00' }))).toMatchObject({ ok: false, errors: { start: expect.any(String) } });
    expect(validateScheduleItem(form({ end: '14:30' }))).toMatchObject({ ok: false, errors: { end: 'The end time must be after the start.' } });
    expect(validateScheduleItem(form({ end: '09:00' }))).toMatchObject({ ok: false });
  });

  it('enforces the same length limits as the table', () => {
    expect(validateScheduleItem(form({ title: 'x'.repeat(121) }))).toMatchObject({ ok: false, errors: { title: expect.any(String) } });
    expect(validateScheduleItem(form({ location: 'x'.repeat(161) }))).toMatchObject({ ok: false, errors: { location: expect.any(String) } });
    expect(validateScheduleItem(form({ notes: 'x'.repeat(1001) }))).toMatchObject({ ok: false, errors: { notes: expect.any(String) } });
  });
});

describe('ordering and display helpers', () => {
  it('trims database times to HH:MM', () => {
    expect(hhmm('14:30:00')).toBe('14:30');
    expect(hhmm(null)).toBe('');
  });

  it('sorts by start time, keeping the original order for equal times, without mutating', () => {
    const input = [item('c', '18:00'), item('a', '09:00'), item('b1', '12:00'), item('b2', '12:00:00')];
    expect(sortSchedule(input).map((i) => i.id)).toEqual(['a', 'b1', 'b2', 'c']);
    expect(input[0].id).toBe('c');
  });

  it('labels durations', () => {
    expect(durationLabel('15:00', '15:45')).toBe('45 min');
    expect(durationLabel('15:00', '16:00')).toBe('1 h');
    expect(durationLabel('18:30', '20:00')).toBe('1 h 30 min');
    expect(durationLabel('15:00', null)).toBe('');
  });

  it('flags only items whose range runs into the next start', () => {
    const sorted = sortSchedule([item('a', '10:00', '11:30'), item('b', '11:00'), item('c', '12:00', '13:00'), item('d', '13:00')]);
    expect([...overlappingIds(sorted)].sort()).toEqual(['a', 'b']);
  });
});

describe('starter schedule', () => {
  it('is itself valid and in order', () => {
    const forms = STARTER_SCHEDULE.map((s) => ({ ...form(), start: s.start_time, end: s.end_time ?? '', title: s.title, location: s.location ?? '' }));
    forms.forEach((f) => expect(validateScheduleItem(f).ok).toBe(true));
    const starts = STARTER_SCHEDULE.map((s) => s.start_time);
    expect([...starts].sort()).toEqual(starts);
  });
});
