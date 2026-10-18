import { categoryColor, CATEGORY_COLORS, validateCategory } from './categoryForm';

const existing = [{ id: 'c1', name: 'Venue', scope: 'wedding' as const }];

test('requires a name', () => {
  const r = validateCategory({ name: '  ', scope: 'wedding', color: '' }, existing);
  expect(r).toEqual({ ok: false, errors: { name: 'Enter a category name.' } });
});

test('explains the duplicate (scope, name) rule, case-insensitively, but allows the other scope', () => {
  const dup = validateCategory({ name: ' venue ', scope: 'wedding', color: '' }, existing);
  expect(dup.ok).toBe(false);
  expect(validateCategory({ name: 'Venue', scope: 'honeymoon', color: '' }, existing).ok).toBe(true);
});

test('editing a category does not clash with itself', () => {
  expect(validateCategory({ name: 'Venue', scope: 'wedding', color: '' }, existing, 'c1').ok).toBe(true);
});

test('colour is optional but must be a hex colour', () => {
  expect(validateCategory({ name: 'Cake', scope: 'wedding', color: 'red' }, existing).ok).toBe(false);
  expect(validateCategory({ name: 'Cake', scope: 'wedding', color: '#8b7fd6' }, existing)).toEqual({
    ok: true,
    value: { name: 'Cake', scope: 'wedding', color: '#8b7fd6' },
  });
});

test('categoryColor falls back to the palette by position', () => {
  expect(categoryColor(null, 1)).toBe(CATEGORY_COLORS[1]);
  expect(categoryColor('#123456', 1)).toBe('#123456');
  expect(categoryColor('bad', 0)).toBe(CATEGORY_COLORS[0]);
  expect(categoryColor(null, CATEGORY_COLORS.length)).toBe(CATEGORY_COLORS[0]);
});
