// Resolves which origin to echo back in Access-Control-Allow-Origin.
// ALLOWED_ORIGIN can be a single origin or a comma-separated list (e.g.
// "https://valere.co.za,https://www.valere.co.za") — CORS requires the
// response header to exactly match the requesting browser's origin, so a
// single hardcoded value breaks the moment a site is reachable at more
// than one hostname (apex vs. www, custom domain vs. the old vercel.app
// one, etc.).
const configuredOrigins = (Deno.env.get("ALLOWED_ORIGIN") || "https://capture-by-val.vercel.app")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

export function corsHeadersFor(req: Request) {
  const requestOrigin = req.headers.get("origin") || "";
  const allowOrigin = configuredOrigins.includes(requestOrigin)
    ? requestOrigin
    : configuredOrigins[0];

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}
