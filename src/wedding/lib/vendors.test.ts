import { findVendorByName } from './vendors';
import type { Vendor } from '../types';

const vendor = (id: string, name: string): Vendor => ({
  id, wedding_id: 'w', name, category_id: null, phone: null, email: null, whatsapp: null, website: null,
} as Vendor);

describe('findVendorByName', () => {
  const vendors = [vendor('v1', 'Acme Flowers'), vendor('v2', ' Test Hall ')];
  it('ignores case and surrounding spaces on both sides', () => {
    expect(findVendorByName(vendors, 'ACME flowers')?.id).toBe('v1');
    expect(findVendorByName(vendors, '  acme FLOWERS ')?.id).toBe('v1');
    expect(findVendorByName(vendors, 'test hall')?.id).toBe('v2');
  });
  it('returns undefined for unknown or blank names', () => {
    expect(findVendorByName(vendors, 'Other')).toBeUndefined();
    expect(findVendorByName(vendors, '   ')).toBeUndefined();
  });
});
