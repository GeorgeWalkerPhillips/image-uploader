// Wedding Planner product purchase: server-side price, reference format,
// transaction routing and the "grant the entitlement" logic. PURE module: no
// Deno globals, no network, so it is testable under Node (see
// weddingPlanner.test.ts). The real email sender / origin are injected by
// _shared/weddingPlannerServer.ts.
//
// SYNC POINT: WEDDING_PLANNER.amountCents MUST equal
// WEDDING_PLANNER.amountCents in src/services/pricingTiers.js (the UI price).
// This server constant is the only thing that decides what Paystack charges
// and what applyPlannerPayment accepts. Change both together.
//
// Only the service role may write wedding_planner_entitlements (RLS grants
// clients select-own only). Callers of applyPlannerPayment must already have
// authenticated the transaction: webhook HMAC verified, or fetched directly
// from Paystack with the secret key (wedding-planner-verify).

import { wrapEmail, emailHeading, emailButton, emailFootnote } from "./emailTemplate.ts";
import { escapeHtml, formatZar, redactEmails } from "./weddingReminders.ts";
import { parseMetadata } from "./paystackPayment.ts";

export const WEDDING_PLANNER = { amountCents: 49900, currency: "ZAR" } as const; // R499
export const PLANNER_PRODUCT = "wedding_planner";
export const DEFAULT_SITE_ORIGIN = "https://valere.co.za";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// wp-<uuid>-<12 alphanumerics>. Paystack allows only alphanumerics, "-", "." and "=".
const PLANNER_REF_RE = /^wp-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-[a-z0-9]{12}$/i;

// ---------------------------------------------------------------------------
// References and metadata
// ---------------------------------------------------------------------------

export function buildPlannerReference(userId: string): string {
  if (!UUID_RE.test(userId)) throw new Error("buildPlannerReference: userId must be a UUID");
  const rand = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  return `wp-${userId}-${rand}`;
}

export function isPlannerReference(reference: unknown): boolean {
  return typeof reference === "string" && PLANNER_REF_RE.test(reference);
}

export function userIdFromPlannerReference(reference: unknown): string | null {
  if (typeof reference !== "string") return null;
  const match = reference.match(PLANNER_REF_RE);
  return match && UUID_RE.test(match[1]) ? match[1].toLowerCase() : null;
}

export function plannerMetadata(userId: string): { product: string; userId: string } {
  return { product: PLANNER_PRODUCT, userId };
}

// ---------------------------------------------------------------------------
// Routing (used by paystack-webhook)
// ---------------------------------------------------------------------------

export type Route =
  | { kind: "event" } // none of our planner signals: existing event flow runs untouched
  | { kind: "planner"; userId: string }
  | { kind: "conflict"; reason: string }; // planner signals mixed with event signals / mismatches

// Decides which product a charge.success belongs to. A transaction is routed
// to the planner ONLY if it carries a planner signal: a well-formed planner
// reference, or metadata.product exactly "wedding_planner". Anything else
// (including unknown/tampered product values) stays on the event path, which
// is byte-for-byte what it was before. Mixed signals are never guessed at.
export function routeTransaction(txn: { reference?: unknown; metadata?: unknown }): Route {
  const metadata = parseMetadata(txn?.metadata);
  const refUser = userIdFromPlannerReference(txn?.reference);
  const productIsPlanner = metadata.product === PLANNER_PRODUCT;
  const refIsPlanner = refUser !== null;

  if (!refIsPlanner && !productIsPlanner) return { kind: "event" };

  // A planner signal is present. It must not be mixed with event signals.
  if (typeof txn?.reference === "string" && /^cbv-/i.test(txn.reference)) {
    return { kind: "conflict", reason: "planner metadata on an event reference" };
  }
  if (metadata.eventId !== undefined) {
    return { kind: "conflict", reason: "planner signal with event metadata" };
  }

  const metaUser = typeof metadata.userId === "string" && UUID_RE.test(metadata.userId)
    ? metadata.userId.toLowerCase()
    : null;
  if (metadata.userId !== undefined && metaUser === null) {
    return { kind: "conflict", reason: "malformed planner userId metadata" };
  }
  if (refUser && metaUser && refUser !== metaUser) {
    return { kind: "conflict", reason: "reference and metadata name different users" };
  }
  const userId = refUser ?? metaUser;
  if (!userId) return { kind: "conflict", reason: "planner charge without a user id" };
  return { kind: "planner", userId };
}

// ---------------------------------------------------------------------------
// Origins
// ---------------------------------------------------------------------------

function originList(allowedOriginEnv: string | undefined): string[] {
  return (allowedOriginEnv || "").split(",").map((o) => o.trim()).filter(Boolean);
}

/** Origin for links in emails: first https ALLOWED_ORIGIN, else the default site. */
export function siteOriginFrom(allowedOriginEnv: string | undefined): string {
  const first = originList(allowedOriginEnv).find((o) => /^https:\/\/[^\s*/]+$/.test(o));
  return first ?? DEFAULT_SITE_ORIGIN;
}

/** Checkout return origin: the request Origin only if allow-listed, else the first allowed. */
export function checkoutOriginFrom(requestOrigin: string | null | undefined, allowedOriginEnv: string | undefined): string {
  const list = originList(allowedOriginEnv);
  if (requestOrigin && list.includes(requestOrigin)) return requestOrigin;
  return list[0] ?? DEFAULT_SITE_ORIGIN;
}

/** The body sent to Paystack's transaction/initialize. Amount is the server constant, never client input. */
export function buildInitializePayload(user: { id: string; email: string }, origin: string, reference = buildPlannerReference(user.id)) {
  return {
    email: user.email,
    amount: WEDDING_PLANNER.amountCents,
    currency: WEDDING_PLANNER.currency,
    reference,
    // Paystack appends ?reference=...&trxref=... on return.
    callback_url: `${origin}/wedding-planner?payment=success`,
    metadata: plannerMetadata(user.id),
  };
}

// ---------------------------------------------------------------------------
// Applying a payment
// ---------------------------------------------------------------------------

// deno-lint-ignore no-explicit-any
type AdminClient = any;
// deno-lint-ignore no-explicit-any
type Txn = any;

export type PlannerApplyResult =
  | { ok: true; alreadyPaid: boolean; duplicateCharge: boolean }
  | { ok: false; status: number; error: string };

export interface PlannerDeps {
  sendEmail: (m: { to: string; subject: string; html: string }) => Promise<unknown>;
  siteOrigin: string;
}

/** Pure check of the transaction itself (status, currency, amount, product, metadata user). */
export function validatePlannerTransaction(userId: string, txn: Txn): string | null {
  if (!txn || typeof txn !== "object") return "Missing transaction";
  if (typeof txn.reference !== "string" || txn.reference.length < 1 || txn.reference.length > 100) {
    return "Missing or invalid transaction reference";
  }
  if (txn.status !== "success") return `Transaction status is ${String(txn.status)}`;
  const currency = String(txn.currency ?? "").toUpperCase();
  if (currency !== WEDDING_PLANNER.currency) return `Unexpected currency ${currency || "(none)"}`;
  if (txn.amount !== WEDDING_PLANNER.amountCents) {
    return `Amount mismatch for planner purchase: charged ${txn.amount}, expected ${WEDDING_PLANNER.amountCents}`;
  }
  const metadata = parseMetadata(txn.metadata);
  // Required (not just "if present"): our checkout always sets it, and it keeps
  // any charge that wasn't started as a planner purchase out of entitlements.
  if (metadata.product !== PLANNER_PRODUCT) {
    return "Transaction product is not the wedding planner";
  }
  if (metadata.userId !== undefined && String(metadata.userId).toLowerCase() !== userId.toLowerCase()) {
    return "Transaction metadata names a different user";
  }
  // The reference must be a planner reference naming this user, so a Capture by
  // Val event reference (cbv-...) can never be replayed into an entitlement.
  const refUser = userIdFromPlannerReference(txn.reference);
  if (!refUser || refUser !== userId.toLowerCase()) return "Transaction reference does not belong to this user";
  return null;
}

async function logError(admin: AdminClient, source: string, message: string) {
  try {
    await admin.from("error_logs").insert({
      severity: "error",
      source,
      message: redactEmails(message).slice(0, 2000),
    });
  } catch {
    // diagnostics only
  }
}

/**
 * Grants the Wedding Planner to `userId` for an already-authenticated
 * successful Paystack transaction. Idempotent and race-safe: the UNIQUE
 * constraints on payment_reference and user_id decide, and only the call that
 * actually inserted the row sends the receipt.
 */
export async function applyPlannerPayment(
  admin: AdminClient,
  userId: string,
  txn: Txn,
  deps: PlannerDeps
): Promise<PlannerApplyResult> {
  if (typeof userId !== "string" || !UUID_RE.test(userId)) {
    return { ok: false, status: 400, error: "Invalid user id" };
  }
  const invalid = validatePlannerTransaction(userId, txn);
  if (invalid) return { ok: false, status: 400, error: invalid };

  const { data: userData, error: userError } = await admin.auth.admin.getUserById(userId);
  const user = userData?.user;
  if (userError || !user) return { ok: false, status: 404, error: "User not found" };
  if (user.is_anonymous) return { ok: false, status: 400, error: "Anonymous users cannot own the planner" };

  const { error: insertError } = await admin.from("wedding_planner_entitlements").insert({
    user_id: userId,
    payment_reference: txn.reference,
    amount_cents: txn.amount,
    source: "paystack",
    paid_at: new Date().toISOString(),
  });

  if (!insertError) {
    await sendPlannerReceipt(admin, user.email, txn, deps);
    return { ok: true, alreadyPaid: false, duplicateCharge: false };
  }

  if (insertError.code !== "23505") {
    console.error("Failed to record planner entitlement:", insertError.code);
    return { ok: false, status: 500, error: "Failed to record entitlement" };
  }

  // Unique violation: either this reference was already processed, or this
  // user already holds an entitlement under a different reference.
  const { data: byRef } = await admin
    .from("wedding_planner_entitlements")
    .select("user_id")
    .eq("payment_reference", txn.reference)
    .maybeSingle();

  if (byRef) {
    if (byRef.user_id !== userId) {
      return { ok: false, status: 409, error: "This payment was already applied to another account" };
    }
    return { ok: true, alreadyPaid: true, duplicateCharge: false };
  }

  // Reference is new but the user already has the planner (grandfathered, admin
  // grant, or an earlier payment): a second successful charge. Nothing to
  // unlock; flag it so the extra charge can be refunded by hand.
  await logError(
    admin,
    "wedding-planner:duplicate-charge",
    `Duplicate planner charge ${txn.reference} for user ${userId}: user already entitled. Refund manually in Paystack.`
  );
  return { ok: true, alreadyPaid: true, duplicateCharge: true };
}

export function receiptEmail(txn: Txn, siteOrigin: string): { subject: string; html: string } {
  const amount = formatZar(typeof txn.amount === "number" ? txn.amount : 0);
  return {
    subject: "Wedding Planner purchase confirmed",
    html: wrapEmail(`
      ${emailHeading("Wedding Planner purchase confirmed")}
      <p>Thank you. Your Wedding Planner is unlocked and ready to set up.</p>
      <p><strong>Amount:</strong> ${escapeHtml(amount)}<br/>
      <strong>Reference:</strong> ${escapeHtml(txn.reference)}</p>
      ${emailButton(`${escapeHtml(siteOrigin)}/hq/`, "Open your Wedding Planner")}
      ${emailFootnote("Keep this email as your receipt. If anything looks wrong, reply to this message.")}
    `),
  };
}

async function sendPlannerReceipt(admin: AdminClient, email: unknown, txn: Txn, deps: PlannerDeps) {
  try {
    if (typeof email !== "string" || !email) return;
    const { subject, html } = receiptEmail(txn, deps.siteOrigin);
    await deps.sendEmail({ to: email, subject, html });
  } catch (emailError) {
    // Never fail the payment over an email hiccup: the entitlement is already granted.
    console.error("Failed to send planner receipt");
    await logError(admin, "wedding-planner:sendReceipt", String((emailError as Error)?.message ?? emailError));
  }
}
