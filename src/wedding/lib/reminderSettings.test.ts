import {
  DEFAULT_REMINDER_VALUES, LEAD_OPTIONS, MAX_LEAD_DAYS, normaliseLeadDays, rowToValues, summariseReminders,
  toggleLeadDay, validateReminders,
} from './reminderSettings';

const base = DEFAULT_REMINDER_VALUES;

test('normaliseLeadDays sorts, de-duplicates and drops out-of-range values', () => {
  expect(normaliseLeadDays([7, 0, 7, 1, -1, 31, 1.5])).toEqual([0, 1, 7]);
});

test('toggleLeadDay adds, removes, keeps order and stops at the maximum', () => {
  expect(toggleLeadDay([0, 1], 7)).toEqual([0, 1, 7]);
  expect(toggleLeadDay([0, 1, 7], 1)).toEqual([0, 7]);
  const six = [0, 1, 2, 3, 7, 14];
  expect(six).toHaveLength(MAX_LEAD_DAYS);
  expect(toggleLeadDay(six, 30)).toEqual(six);
  expect(toggleLeadDay(six, 14)).toEqual([0, 1, 2, 3, 7]);
});

test('every chip option is a valid database lead day', () => {
  expect(LEAD_OPTIONS.map((o) => o.days)).toEqual([0, 1, 2, 3, 7, 14, 30]);
});

test('rowToValues gives the defaults when there is no row, and a copy of them', () => {
  const v = rowToValues(null);
  expect(v).toEqual(base);
  v.leadDays.push(9);
  expect(DEFAULT_REMINDER_VALUES.leadDays).toEqual([0, 1]);
});

test('rowToValues reads a stored row', () => {
  expect(
    rowToValues({ enabled: false, lead_days: [7, 0], include_events: true, include_tasks: false, include_payments: true })
  ).toEqual({ enabled: false, leadDays: [0, 7], includeEvents: true, includeTasks: false, includePayments: true });
});

test('validate: a good selection becomes the table payload', () => {
  expect(validateReminders({ ...base, leadDays: [3, 0, 3], includeTasks: false })).toEqual({
    ok: true,
    value: { enabled: true, lead_days: [0, 3], include_events: true, include_tasks: false, include_payments: true },
  });
});

test('validate: none selected while enabled is an error', () => {
  const r = validateReminders({ ...base, leadDays: [] });
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.errors.leadDays).toMatch(/at least one/i);
});

test('validate: more than six is an error', () => {
  const r = validateReminders({ ...base, leadDays: [0, 1, 2, 3, 7, 14, 30] });
  expect(r.ok).toBe(false);
});

test('validate: all three kinds off while enabled is an error', () => {
  const r = validateReminders({ ...base, includeEvents: false, includeTasks: false, includePayments: false });
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.errors.include).toBeTruthy();
});

test('validate: turned off needs no selection and stores valid defaults', () => {
  const r = validateReminders({ ...base, enabled: false, leadDays: [] });
  expect(r).toEqual({
    ok: true,
    value: { enabled: false, lead_days: [0, 1], include_events: true, include_tasks: true, include_payments: true },
  });
});

test('summary describes the default choice in plain words', () => {
  expect(summariseReminders(base)).toBe(
    "On mornings when something is due you'll get one email around 07:00 listing events, tasks and payments due today and tomorrow."
  );
});

test('summary handles longer leads, single kinds, off and empty', () => {
  expect(summariseReminders({ ...base, leadDays: [0, 7, 14], includeTasks: false, includePayments: false })).toBe(
    "On mornings when something is due you'll get one email around 07:00 listing events due today, in 7 days and in 14 days."
  );
  expect(summariseReminders({ ...base, enabled: false })).toMatch(/off/);
  expect(summariseReminders({ ...base, leadDays: [] })).toMatch(/at least one/i);
});
