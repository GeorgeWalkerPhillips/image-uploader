import {
  addDaysISO,
  calendarDaysUntil,
  countdownTo,
  daysBetweenISO,
  dueUrgency,
  formatDateJhb,
  jhbInstant,
  todayJhbISO,
  toJhbDateISO,
} from './time';

describe('countdownTo', () => {
  const target = new Date('2027-03-27T08:00:00Z');
  it('breaks the gap into days/hours/minutes/seconds', () => {
    const now = new Date(target.getTime() - ((3 * 86400 + 4 * 3600 + 5 * 60 + 6) * 1000));
    expect(countdownTo(target, now)).toMatchObject({ done: false, days: 3, hours: 4, minutes: 5, seconds: 6 });
  });
  it('is done at and after the target', () => {
    expect(countdownTo(target, target).done).toBe(true);
    expect(countdownTo(target, new Date(target.getTime() + 1000))).toMatchObject({ done: true, days: 0, seconds: 0 });
  });
  it('counts down to a Johannesburg wall-clock time', () => {
    const wedding = jhbInstant('2027-03-27', '10:00');
    expect(wedding.toISOString()).toBe('2027-03-27T08:00:00.000Z');
  });
});

describe('Johannesburg dates', () => {
  it('maps late-evening UTC to the next Johannesburg calendar day', () => {
    expect(toJhbDateISO(new Date('2026-10-17T23:30:00Z'))).toBe('2026-10-18');
    expect(todayJhbISO(new Date('2026-10-17T21:59:00Z'))).toBe('2026-10-17');
  });
  it('counts whole days between calendar dates', () => {
    expect(daysBetweenISO('2026-10-18', '2027-03-27')).toBe(160);
    expect(daysBetweenISO('2027-03-27', '2026-10-18')).toBe(-160);
    expect(daysBetweenISO('2027-03-27', '2027-03-27')).toBe(0);
  });
  it('adds days across month and year boundaries', () => {
    expect(addDaysISO('2027-03-29', 13)).toBe('2027-04-11');
    expect(addDaysISO('2026-12-31', 1)).toBe('2027-01-01');
  });
  it('formats in en-ZA', () => {
    expect(formatDateJhb('2027-03-27', { day: 'numeric', month: 'long', year: 'numeric' })).toMatch(/27/);
  });
});

describe('dueUrgency', () => {
  const today = '2026-10-18';
  it('flags overdue, soon (within 7 days) and later', () => {
    expect(dueUrgency('2026-10-17', today)).toBe('overdue');
    expect(dueUrgency('2026-10-18', today)).toBe('soon');
    expect(dueUrgency('2026-10-25', today)).toBe('soon');
    expect(dueUrgency('2026-10-26', today)).toBe('later');
    expect(dueUrgency(null, today)).toBe('none');
  });
});

describe('calendarDaysUntil', () => {
  const target = jhbInstant('2027-03-06', '10:00');
  it('is 1 the evening before, even with under 24h left', () => {
    expect(calendarDaysUntil(target, jhbInstant('2027-03-05', '23:00'))).toBe(1);
  });
  it('is 0 on the day itself, before or after the time', () => {
    expect(calendarDaysUntil(target, jhbInstant('2027-03-06', '00:30'))).toBe(0);
    expect(calendarDaysUntil(target, jhbInstant('2027-03-06', '18:00'))).toBe(0);
  });
  it('is negative once the date has passed', () => {
    expect(calendarDaysUntil(target, jhbInstant('2027-03-08', '09:00'))).toBe(-2);
  });
});
