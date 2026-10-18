import { emptyVendorForm, quoteCountsByVendor, validateVendor } from './vendorForm';

describe('validateVendor', () => {
  it('needs only a name, and nulls blanks', () => {
    expect(validateVendor({ ...emptyVendorForm, name: ' Riverside Hall ' })).toEqual({
      ok: true,
      value: { name: 'Riverside Hall', category_id: null, phone: null, whatsapp: null, email: null, website: null, notes: null },
    });
  });
  it('rejects a bad email and any non-http(s) website', () => {
    const r = validateVendor({ ...emptyVendorForm, name: 'X', email: 'nope', website: 'javascript:alert(1)' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['email', 'website']);
  });
  it('accepts a bare domain as the website and keeps the category', () => {
    const r = validateVendor({ ...emptyVendorForm, name: 'X', website: 'riverside.example', categoryId: 'c1', phone: '082 123 4567' });
    expect(r.ok && r.value.website).toBe('riverside.example');
    expect(r.ok && r.value.category_id).toBe('c1');
  });
  it('requires a name', () => {
    const r = validateVendor(emptyVendorForm);
    expect(!r.ok && r.errors.name).toBeTruthy();
  });
});

describe('quoteCountsByVendor', () => {
  it('counts per vendor and ignores unlinked quotes', () => {
    expect(quoteCountsByVendor([{ vendor_id: 'a' }, { vendor_id: 'a' }, { vendor_id: 'b' }, { vendor_id: null }])).toEqual({ a: 2, b: 1 });
  });
});
