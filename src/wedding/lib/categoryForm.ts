import type { FieldErrors, Validated } from './validators';
import type { Category, Scope } from '../types';

export const CATEGORY_COLORS: readonly string[] = [
  '#8b7fd6', '#e58fb0', '#7fb4e6', '#111111', '#6b6b76', '#b9b9c4', '#5f54b0', '#c45f8a', '#4a86c0',
];

const HEX = /^#[0-9a-fA-F]{6}$/;

// The category's own colour, or a palette colour picked by its position.
export function categoryColor(color: string | null | undefined, index: number): string {
  if (color && HEX.test(color)) return color;
  return CATEGORY_COLORS[((index % CATEGORY_COLORS.length) + CATEGORY_COLORS.length) % CATEGORY_COLORS.length]!;
}

export interface CategoryFormValues {
  name: string;
  scope: Scope;
  color: string;
}

export interface CategoryPayload {
  name: string;
  scope: Scope;
  color: string | null;
}

export const emptyCategoryForm = (scope: Scope = 'wedding'): CategoryFormValues => ({ name: '', scope, color: '' });

// `existing` is every category, so we can explain the (scope, name) uniqueness
// rule before the database does.
export function validateCategory(
  v: CategoryFormValues,
  existing: readonly Pick<Category, 'id' | 'name' | 'scope'>[],
  editingId?: string
): Validated<CategoryPayload> {
  const errors: FieldErrors = {};
  const name = v.name.trim();
  if (!name) errors.name = 'Enter a category name.';
  else if (name.length > 60) errors.name = 'Keep the name under 60 characters.';
  else if (
    existing.some((c) => c.id !== editingId && c.scope === v.scope && c.name.trim().toLowerCase() === name.toLowerCase())
  ) {
    errors.name = `You already have a ${v.scope} category called "${name}".`;
  }
  if (v.scope !== 'wedding' && v.scope !== 'honeymoon') errors.scope = 'Choose wedding or honeymoon.';
  if (v.color && !HEX.test(v.color)) errors.color = 'Choose one of the colours.';
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { name, scope: v.scope, color: v.color || null } };
}
