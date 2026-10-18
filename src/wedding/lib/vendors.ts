import type { Vendor } from '../types';

// Case-insensitive, whitespace-trimmed vendor lookup, so "ACME" and "acme "
// reuse one vendor instead of creating a duplicate.
export function findVendorByName(vendors: readonly Vendor[], name: string): Vendor | undefined {
  const needle = name.trim().toLowerCase();
  if (!needle) return undefined;
  return vendors.find((v) => v.name.trim().toLowerCase() === needle);
}
