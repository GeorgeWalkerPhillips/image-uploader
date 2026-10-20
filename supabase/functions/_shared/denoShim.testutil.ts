// Test-only: lets modules that read Deno.env at import time (resend.ts,
// cors.ts) load under Node. Import this FIRST in a test file. Never imported
// by any Edge Function.
// deno-lint-ignore no-explicit-any
const g = globalThis as any;
g.Deno = g.Deno ?? { env: { get: (_k: string) => undefined } };
export {};
