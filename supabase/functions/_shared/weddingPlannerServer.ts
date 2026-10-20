// Deno-side wiring for weddingPlanner.ts: injects the real Resend sender and
// the site origin (first https ALLOWED_ORIGIN, else https://valere.co.za).
// Kept separate so the pure module stays testable under Node.

import { sendEmail } from "./resend.ts";
import { applyPlannerPayment, siteOriginFrom } from "./weddingPlanner.ts";

// deno-lint-ignore no-explicit-any
export function applyPlannerPaymentServer(admin: any, userId: string, txn: any) {
  return applyPlannerPayment(admin, userId, txn, {
    sendEmail,
    siteOrigin: siteOriginFrom(Deno.env.get("ALLOWED_ORIGIN")),
  });
}
