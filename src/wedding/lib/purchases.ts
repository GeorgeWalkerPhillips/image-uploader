import { centsToGroupedInput } from './money';
import { optionalDate, optionalMoney, requiredMoney, requiredDate, requiredText, trimOrNull } from './moneyForms';
import type { FieldErrors, Validated } from './validators';
import type { Payer, PurchaseItem } from '../types';

// Pure logic for the purchase checklist (things to buy, then bought). The
// price is the TOTAL for the line (all units), in integer cents.

const MAX_NOTE = 1000;
const MAX_QUANTITY = 9999;

export interface PurchaseFormValues {
  name: string;
  category: string;
  quantity: string;
  neededBy: string;
  price: string;
  store: string;
  notes: string;
}

export interface PurchasePayload {
  name: string;
  category: string | null;
  quantity: number;
  needed_by: string | null;
  price_cents: number;
  bought_at_store: string | null;
  notes: string | null;
}

export const emptyPurchaseForm: PurchaseFormValues = {
  name: '', category: '', quantity: '1', neededBy: '', price: '', store: '', notes: '',
};

export function purchaseToForm(p: PurchaseItem): PurchaseFormValues {
  return {
    name: p.name,
    category: p.category ?? '',
    quantity: String(p.quantity),
    neededBy: p.needed_by ?? '',
    price: p.price_cents > 0 ? centsToGroupedInput(p.price_cents) : '',
    store: p.bought_at_store ?? '',
    notes: p.notes ?? '',
  };
}

export function validatePurchase(v: PurchaseFormValues): Validated<PurchasePayload> {
  const errors: FieldErrors = {};
  const name = requiredText(v.name, 'name', 'what to buy', errors);
  const category = trimOrNull(v.category);
  if (category && category.length > 60) errors.category = 'Keep it under 60 characters.';
  const q = v.quantity.trim();
  let quantity = 1;
  if (q !== '') {
    if (!/^\d+$/.test(q) || Number(q) < 1 || Number(q) > MAX_QUANTITY) {
      errors.quantity = `Enter a whole number from 1 to ${MAX_QUANTITY}.`;
    } else quantity = Number(q);
  }
  const neededBy = optionalDate(v.neededBy, 'neededBy', errors);
  const price = optionalMoney(v.price, 'price', errors);
  const store = trimOrNull(v.store);
  if (store && store.length > 120) errors.store = 'Keep it under 120 characters.';
  const notes = trimOrNull(v.notes);
  if (notes && notes.length > MAX_NOTE) errors.notes = `Keep it under ${MAX_NOTE} characters.`;
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name, category, quantity, needed_by: neededBy, price_cents: price ?? 0, bought_at_store: store, notes,
    },
  };
}

// ------------------------------------------------------------- mark bought

export interface BoughtFormValues {
  boughtOn: string;
  boughtBy: Payer;
  store: string;
  price: string;
}

export interface BoughtPatch {
  bought: true;
  bought_on: string;
  bought_by: Payer;
  bought_at_store: string | null;
  price_cents: number;
}

const BUYERS: readonly Payer[] = ['groom', 'bride', 'joint'];

export function boughtFormFor(item: PurchaseItem, todayISO: string, defaultBuyer: Payer): BoughtFormValues {
  return {
    boughtOn: item.bought_on ?? todayISO,
    boughtBy: item.bought_by ?? defaultBuyer,
    store: item.bought_at_store ?? '',
    price: item.price_cents > 0 ? centsToGroupedInput(item.price_cents) : '',
  };
}

// What you actually paid is required (R0 is fine for a gift); it replaces the
// planned price so the totals reflect real spending.
export function validateBought(v: BoughtFormValues): Validated<BoughtPatch> {
  const errors: FieldErrors = {};
  const boughtOn = requiredDate(v.boughtOn, 'boughtOn', errors);
  if (!BUYERS.includes(v.boughtBy)) errors.boughtBy = 'Choose who bought it.';
  const price = requiredMoney(v.price, 'price', errors);
  const store = trimOrNull(v.store);
  if (store && store.length > 120) errors.store = 'Keep it under 120 characters.';
  if (Object.keys(errors).length > 0 || boughtOn === null || price === null) return { ok: false, errors };
  return {
    ok: true,
    value: { bought: true, bought_on: boughtOn, bought_by: v.boughtBy, bought_at_store: store, price_cents: price },
  };
}

// Back to "still to buy". The price, store and receipt are kept.
export const UNBOUGHT_PATCH = { bought: false, bought_on: null, bought_by: null } as const;

// ------------------------------------------------------------------ totals

export interface PurchaseTotals {
  boughtCents: number;
  remainingCents: number;
  totalCents: number;
  boughtCount: number;
  openCount: number;
  pct: number; // share of items bought, 0-100
}

export function purchaseTotals(items: readonly PurchaseItem[]): PurchaseTotals {
  let bought = 0;
  let remaining = 0;
  let boughtCount = 0;
  for (const i of items) {
    if (i.bought) {
      bought += i.price_cents;
      boughtCount += 1;
    } else remaining += i.price_cents;
  }
  return {
    boughtCents: bought,
    remainingCents: remaining,
    totalCents: bought + remaining,
    boughtCount,
    openCount: items.length - boughtCount,
    pct: items.length > 0 ? Math.round((boughtCount / items.length) * 100) : 0,
  };
}

// To buy: soonest needed-by first (no date last). Bought: most recent first.
export function sortPurchases(items: readonly PurchaseItem[]): { toBuy: PurchaseItem[]; bought: PurchaseItem[] } {
  const toBuy = items
    .filter((i) => !i.bought)
    .sort((a, b) => {
      if (a.needed_by && b.needed_by && a.needed_by !== b.needed_by) return a.needed_by.localeCompare(b.needed_by);
      if (a.needed_by && !b.needed_by) return -1;
      if (!a.needed_by && b.needed_by) return 1;
      return a.name.localeCompare(b.name);
    });
  const bought = items
    .filter((i) => i.bought)
    .sort((a, b) => (b.bought_on ?? '').localeCompare(a.bought_on ?? '') || a.name.localeCompare(b.name));
  return { toBuy, bought };
}

export function purchaseCategories(items: readonly PurchaseItem[]): string[] {
  return [...new Set(items.map((i) => i.category?.trim()).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b));
}
