import { isValidEmail, safeWebsiteHref } from './contact';
import type { FieldErrors, Validated } from './validators';
import type { Quote, Vendor } from '../types';

export interface VendorFormValues {
  name: string;
  categoryId: string;
  phone: string;
  whatsapp: string;
  email: string;
  website: string;
  notes: string;
}

export interface VendorPayload {
  name: string;
  category_id: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  website: string | null;
  notes: string | null;
}

export const emptyVendorForm: VendorFormValues = { name: '', categoryId: '', phone: '', whatsapp: '', email: '', website: '', notes: '' };

export const vendorToForm = (v: Vendor): VendorFormValues => ({
  name: v.name,
  categoryId: v.category_id ?? '',
  phone: v.phone ?? '',
  whatsapp: v.whatsapp ?? '',
  email: v.email ?? '',
  website: v.website ?? '',
  notes: v.notes ?? '',
});

const orNull = (s: string): string | null => (s.trim() === '' ? null : s.trim());

export function validateVendor(v: VendorFormValues): Validated<VendorPayload> {
  const errors: FieldErrors = {};
  const name = v.name.trim();
  if (!name) errors.name = 'Enter the vendor\'s name.';
  else if (name.length > 120) errors.name = 'Keep the name under 120 characters.';
  if (v.phone.trim().length > 40) errors.phone = 'Keep the phone number under 40 characters.';
  if (v.whatsapp.trim().length > 40) errors.whatsapp = 'Keep the WhatsApp number under 40 characters.';
  if (v.email.trim() && !isValidEmail(v.email)) errors.email = 'Enter a valid email, or leave it blank.';
  if (v.website.trim() && !safeWebsiteHref(v.website)) {
    errors.website = 'Enter a web address starting with http:// or https://, e.g. example.com.';
  }
  if (v.notes.trim().length > 2000) errors.notes = 'Keep notes under 2000 characters.';
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name,
      category_id: v.categoryId || null,
      phone: orNull(v.phone),
      whatsapp: orNull(v.whatsapp),
      email: orNull(v.email),
      website: orNull(v.website),
      notes: orNull(v.notes),
    },
  };
}

// How many quotes each vendor has, by vendor id (quotes with no vendor are ignored).
export function quoteCountsByVendor(quotes: readonly Pick<Quote, 'vendor_id'>[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const q of quotes) if (q.vendor_id) counts[q.vendor_id] = (counts[q.vendor_id] ?? 0) + 1;
  return counts;
}
