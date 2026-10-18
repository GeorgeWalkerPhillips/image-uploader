// Pure helpers for Wedding HQ file uploads (quotes, invoices, proofs of
// payment). These are UX niceties: the private `wedding-files` bucket and its
// RLS policies (first path segment must be the member's wedding id) plus the
// bucket's own size and MIME limits are the real enforcement.

export type FileKind = 'quotes' | 'invoices' | 'proofs';

export const ALLOWED_FILE_TYPES: readonly string[] = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
];

export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export const FILE_ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,application/pdf,image/*';

export interface FileLike {
  name: string;
  type: string;
  size: number;
}

const EXTENSION_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
};

const extensionOf = (name: string): string => {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
};

// Some phones report an empty type for HEIC photos, so fall back to the extension.
export function resolveContentType(file: Pick<FileLike, 'name' | 'type'>): string {
  const declared = file.type.trim().toLowerCase();
  if (declared) return declared;
  return EXTENSION_TYPES[extensionOf(file.name)] ?? '';
}

// A friendly error message, or null when the file is fine to upload.
export function validateFile(file: FileLike): string | null {
  if (file.size <= 0) return 'That file is empty. Choose a different one.';
  if (file.size > MAX_FILE_BYTES) {
    return `That file is too big (${(file.size / 1048576).toFixed(1)} MB). The limit is 10 MB.`;
  }
  if (!ALLOWED_FILE_TYPES.includes(resolveContentType(file))) {
    return 'Only PDF or image files (JPG, PNG, WebP, HEIC) can be uploaded.';
  }
  return null;
}

const MAX_NAME_LENGTH = 80;

// Reduces any file name to [A-Za-z0-9._-]: drops directories, control
// characters, diacritics and other unicode oddities, and caps the length while
// keeping a short extension.
export function safeFileName(name: string, max = MAX_NAME_LENGTH): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const clean = (text: string): string =>
    text
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9_-]+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^[-_]+|[-_]+$/g, '');
  const dot = base.lastIndexOf('.');
  const ext = dot > 0 ? clean(base.slice(dot + 1)).replace(/[^A-Za-z0-9]/g, '').slice(0, 10).toLowerCase() : '';
  let stem = clean(dot > 0 ? base.slice(0, dot) : base);
  const room = Math.max(1, max - (ext ? ext.length + 1 : 0));
  stem = stem.slice(0, room).replace(/[-_]+$/, '');
  if (!stem) stem = 'file';
  return ext ? `${stem}.${ext}` : stem;
}

export function newFileId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  // Older iOS Safari (before 15.4) has getRandomValues but not randomUUID.
  const bytes = new Uint8Array(16);
  c.getRandomValues(bytes);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// <weddingId>/<kind>/<uuid>-<safe file name>. The first segment must be the
// wedding id: the storage policy checks it.
export function buildStoragePath(
  weddingId: string,
  kind: FileKind,
  fileName: string,
  id: string = newFileId()
): string {
  if (!weddingId || /[\\/]/.test(weddingId)) throw new Error('Invalid wedding id for upload.');
  return `${weddingId}/${kind}/${id}-${safeFileName(fileName)}`;
}

// Only ever sign or delete objects that live under our own wedding's folder.
export function isOwnPath(path: string, weddingId: string): boolean {
  return !!weddingId && path.startsWith(`${weddingId}/`) && !path.includes('..');
}
