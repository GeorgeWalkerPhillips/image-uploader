// https-only origin helpers for links in emails / checkout returns. Pure; no
// imports, so both paystackPayment.ts and weddingPlanner.ts can use it.

export const DEFAULT_SITE_ORIGIN = "https://valere.co.za";

const HTTPS_ORIGIN_RE = /^https:\/\/[^\s*/]+$/;

function originList(allowedOriginEnv: string | undefined): string[] {
  return (allowedOriginEnv || "").split(",").map((o) => o.trim()).filter(Boolean);
}

/** Origin for links in emails: first https ALLOWED_ORIGIN, else the default site. */
export function siteOriginFrom(allowedOriginEnv: string | undefined): string {
  const first = originList(allowedOriginEnv).find((o) => HTTPS_ORIGIN_RE.test(o));
  return first ?? DEFAULT_SITE_ORIGIN;
}

/** Checkout return origin: the request Origin only if allow-listed, else the first allowed. */
export function checkoutOriginFrom(requestOrigin: string | null | undefined, allowedOriginEnv: string | undefined): string {
  // Same https-only rule as siteOriginFrom (paystack-initialize has no
  // localhost carve-out either): non-https entries are never used.
  const list = originList(allowedOriginEnv).filter((o) => HTTPS_ORIGIN_RE.test(o));
  if (requestOrigin && list.includes(requestOrigin)) return requestOrigin;
  return list[0] ?? DEFAULT_SITE_ORIGIN;
}
