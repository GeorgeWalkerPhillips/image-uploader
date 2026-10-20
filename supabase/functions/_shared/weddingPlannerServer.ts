// Deno-side wiring for weddingPlanner.ts: injects the real Resend sender and
// the site origin (first https ALLOWED_ORIGIN, else https://valere.co.za).
// Kept separate so the pure module stays testable under Node.

import { sendEmail } from "./resend.ts";
import { applyPlannerPayment, siteOriginFrom } from "./weddingPlanner.ts";
import { redactEmails } from "./weddingReminders.ts";

// deno-lint-ignore no-explicit-any
export function applyPlannerPaymentServer(admin: any, userId: string, txn: any) {
  return applyPlannerPayment(admin, userId, txn, {
    sendEmail,
    siteOrigin: siteOriginFrom(Deno.env.get("ALLOWED_ORIGIN")),
  });
}

// Best-effort error_logs row for a Paystack-confirmed success charge that was
// REFUSED (amount mismatch, bad product, 409, 5xx ...), so a customer who paid
// but got nothing (e.g. checkout started before a price change) is findable.
// Reference + status + reason only; no email or other PII. Never throws.
export async function logPlannerRefusal(
  // deno-lint-ignore no-explicit-any
  admin: any,
  source: string,
  reference: string,
  status: number,
  reason: string
): Promise<void> {
  try {
    await admin.from("error_logs").insert({
      severity: "error",
      source,
      message: redactEmails(`charge.success ${reference} not applied (status ${status}): ${reason}`).slice(0, 500),
    });
  } catch {
    // diagnostics only; never change the response over a logging failure
  }
}
