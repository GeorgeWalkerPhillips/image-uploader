// Contact details typed by people are shown as plain text. A tappable link
// (tel:, mailto:, wa.me, website) is only ever built from a value that passed
// these checks, and from the normalised form, never from the raw text.

// Phone number as bare international digits ("27821234567"), or null if it
// cannot be read as a number. South African numbers: spaces, dashes and
// brackets are ignored, "0xx" becomes "27xx", "+27 (0)82" loses the extra 0.
export function normalisePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const compact = raw.trim().replace(/[\s().\-‐-―]/g, '');
  if (!/^\+?\d+$/.test(compact)) return null;
  const hasPlus = compact.startsWith('+');
  let digits = hasPlus ? compact.slice(1) : compact;

  const international = (d: string): string | null => {
    if (d.startsWith('0')) return null;
    if (d.startsWith('27')) {
      const national = d.startsWith('270') ? `27${d.slice(3)}` : d;
      return national.length === 11 ? national : null;
    }
    return d.length >= 8 && d.length <= 15 ? d : null;
  };

  if (hasPlus) return international(digits);
  if (digits.startsWith('00')) return international(digits.slice(2));
  if (digits.startsWith('0')) {
    if (digits.length !== 10 || digits.startsWith('00')) return null;
    digits = `27${digits.slice(1)}`;
    return digits;
  }
  if (digits.startsWith('27') && digits.length === 11) return digits;
  return null;
}

export function telHref(raw: string | null | undefined): string | null {
  const n = normalisePhone(raw);
  return n ? `tel:+${n}` : null;
}

export function whatsappHref(raw: string | null | undefined): string | null {
  const n = normalisePhone(raw);
  return n ? `https://wa.me/${n}` : null;
}

// Deliberately conservative: no whitespace, quotes, "%", "?", "&" or "#" so the
// address cannot smuggle extra mailto: parameters (cc, bcc, body).
const EMAIL = /^[A-Za-z0-9._+-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;

export function isValidEmail(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const email = raw.trim();
  return email.length <= 254 && EMAIL.test(email);
}

export function mailtoHref(raw: string | null | undefined): string | null {
  return isValidEmail(raw) ? `mailto:${(raw as string).trim()}` : null;
}

// A website the person can safely open: http or https only. "example.com" is
// read as https://example.com. javascript:, data:, file: and the like are
// refused, as are addresses with embedded credentials.
export function safeWebsiteHref(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const text = raw.trim();
  if (!text || /\s/.test(text) || text.startsWith('/')) return null;
  let candidate = text;
  if (text.includes('://')) {
    if (!/^https?:\/\//i.test(text)) return null;
  } else {
    // "javascript:alert(1)" has a scheme; "example.com:8080/x" has a port.
    if (/^[a-z][a-z0-9+.-]*:(?!\d+(\/|$))/i.test(text)) return null;
    candidate = `https://${text}`;
  }
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.username || url.password) return null;
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(url.hostname)) return null;
  return url.href;
}
