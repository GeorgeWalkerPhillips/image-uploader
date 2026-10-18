import '../testPolyfills';
import {
  buildStoragePath,
  isOwnPath,
  MAX_FILE_BYTES,
  resolveContentType,
  safeFileName,
  validateFile,
} from './files';

const file = (name: string, type: string, size = 1000) => ({ name, type, size });

describe('validateFile', () => {
  test.each([
    ['a.pdf', 'application/pdf'],
    ['a.jpg', 'image/jpeg'],
    ['a.png', 'image/png'],
    ['a.webp', 'image/webp'],
    ['a.heic', 'image/heic'],
    ['a.heif', 'image/heif'],
  ])('accepts %s', (name, type) => {
    expect(validateFile(file(name, type))).toBeNull();
  });

  test('accepts a HEIC photo whose type is blank, by extension', () => {
    expect(resolveContentType(file('IMG_1.HEIC', ''))).toBe('image/heic');
    expect(validateFile(file('IMG_1.HEIC', ''))).toBeNull();
  });

  test('rejects disallowed types', () => {
    expect(validateFile(file('a.exe', 'application/x-msdownload'))).toMatch(/PDF or image/);
    expect(validateFile(file('a.svg', 'image/svg+xml'))).toMatch(/PDF or image/);
    expect(validateFile(file('noext', ''))).toMatch(/PDF or image/);
  });

  test('rejects empty files', () => {
    expect(validateFile(file('a.pdf', 'application/pdf', 0))).toMatch(/empty/);
  });

  test('allows exactly 10 MB but rejects more', () => {
    expect(validateFile(file('a.pdf', 'application/pdf', MAX_FILE_BYTES))).toBeNull();
    expect(validateFile(file('a.pdf', 'application/pdf', MAX_FILE_BYTES + 1))).toMatch(/too big/);
  });
});

describe('safeFileName', () => {
  test('keeps a normal name', () => {
    expect(safeFileName('Invoice 001.pdf')).toBe('Invoice-001.pdf');
  });
  test('strips directories and traversal', () => {
    expect(safeFileName('../../etc/passwd')).toBe('passwd');
    expect(safeFileName('C:\\Users\\x\\proof.PNG')).toBe('proof.png');
  });
  test('removes control characters and unicode oddities', () => {
    expect(safeFileName('re\u0000ceipt\u202E\n.pdf')).toBe('re-ceipt.pdf');
    expect(safeFileName('Café Ünï.pdf')).toBe('Cafe-Uni.pdf');
    expect(safeFileName('😀😀.jpg')).toBe('file.jpg');
  });
  test('caps the length but keeps the extension', () => {
    const out = safeFileName(`${'a'.repeat(300)}.pdf`);
    expect(out.length).toBeLessThanOrEqual(80);
    expect(out.endsWith('.pdf')).toBe(true);
  });
  test('falls back when nothing is left', () => {
    expect(safeFileName('...')).toBe('file');
    expect(safeFileName('')).toBe('file');
  });
  test('never contains a path separator', () => {
    expect(safeFileName('a/b\\c.pdf')).not.toMatch(/[\\/]/);
  });
});

describe('buildStoragePath', () => {
  test('<weddingId>/<kind>/<id>-<name>', () => {
    expect(buildStoragePath('w-123', 'invoices', 'My Invoice.pdf', 'uuid-1')).toBe(
      'w-123/invoices/uuid-1-My-Invoice.pdf'
    );
    expect(buildStoragePath('w-123', 'proofs', 'x.png', 'u').split('/')[0]).toBe('w-123');
  });
  test('generates a unique id by default', () => {
    const a = buildStoragePath('w', 'quotes', 'a.pdf');
    const b = buildStoragePath('w', 'quotes', 'a.pdf');
    expect(a).not.toBe(b);
    expect(a).toMatch(/^w\/quotes\/[0-9a-f-]{36}-a\.pdf$/);
  });
  test('refuses an unsafe wedding id', () => {
    expect(() => buildStoragePath('', 'quotes', 'a.pdf')).toThrow();
    expect(() => buildStoragePath('a/b', 'quotes', 'a.pdf')).toThrow();
  });
});

test('isOwnPath only accepts paths in the wedding folder', () => {
  expect(isOwnPath('w1/invoices/x.pdf', 'w1')).toBe(true);
  expect(isOwnPath('w2/invoices/x.pdf', 'w1')).toBe(false);
  expect(isOwnPath('w1/../w2/x.pdf', 'w1')).toBe(false);
  expect(isOwnPath('w1', 'w1')).toBe(false);
});
