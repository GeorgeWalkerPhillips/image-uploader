// Pure logic for the reconcile-paid-events Edge Function (no Deno APIs, so it
// is tested under Node with esbuild; see reconcilePaidEvents.test.ts).
//
// The fixing itself happens in SQL (reconcile_paid_events() in
// reconcile-paid-events-2026-11.sql). This module decides what to ALERT about,
// rate-limits alerts, builds the (escaped, PII-free) alert text and orchestrates
// the run against an injected store so it can be tested with fakes.

// SYNC POINT: the same prices live in the SQL preview function, TIER_CONFIG
// (paystackPayment.ts), src/services/pricingTiers.js and the billing trigger.
// reconcilePaidEvents.test.ts fails if this table drifts from TIER_CONFIG.
export const TIER_PRICES: Record<string, { amountCents: number; guestCap: number; photoCap: number }> = {
  starter: { amountCents: 17900, guestCap: 25, photoCap: 15 },
  growth: { amountCents: 39900, guestCap: 50, photoCap: 25 },
  unlimited: { amountCents: 99900, guestCap: 500, photoCap: 50 },
};

export const LOOKBACK_DAYS = 14;
export const ALERT_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const ALERT_SOURCE = "reconcile-paid-events-alert";
export const RUN_SOURCE = "reconcile-paid-events";

export type Verdict = "fixable" | "needs_manual_review";

export interface PreviewRow {
  event_id: string;
  tier: string;
  payment_reference: string;
  payment_amount_cents: number | null;
  payment_currency: string | null;
  paid_recorded_at: string;
  verdict: Verdict;
  reason: string | null;
}

export interface FixedRow {
  event_id: string;
  tier: string;
  payment_reference: string;
  payment_amount_cents?: number | null;
  fixed: boolean;
}

// ---------------------------------------------------------------------------
// Classification (mirrors the SQL preview rules; the SQL is authoritative)
// ---------------------------------------------------------------------------

export function classifyPayment(input: {
  tier: string;
  amountCents: number | null;
  currency: string | null;
  paymentUserId: string | null;
  eventOwnerId: string | null;
}): { verdict: Verdict; reason: string | null } {
  const price = Object.prototype.hasOwnProperty.call(TIER_PRICES, input.tier) ? TIER_PRICES[input.tier] : null;
  let reason: string | null = null;
  if (!price) reason = "tier is not a paid tier";
  else if (input.currency !== "ZAR") reason = "payment currency is not ZAR";
  else if (input.amountCents !== price.amountCents) reason = "payment amount does not match the tier price";
  else if (!input.paymentUserId || input.paymentUserId !== input.eventOwnerId) {
    reason = "payment owner differs from event owner";
  }
  return reason ? { verdict: "needs_manual_review", reason } : { verdict: "fixable", reason: null };
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Strips anything that looks like an email address from text destined for logs. */
export function redactEmails(text: string): string {
  return text.replace(/[^\s<>"'@,;()]+@[^\s<>"'@,;()]+/g, "[redacted-email]");
}

/** Constant-time-ish string compare for the bearer token check. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** True only when the header is `Bearer <serviceKey>` (case-insensitive scheme) and the key is non-empty. */
export function isAuthorized(authorizationHeader: string | null | undefined, serviceKey: string | null | undefined): boolean {
  if (!serviceKey) return false;
  const provided = (authorizationHeader ?? "").replace(/^Bearer\s+/i, "");
  return safeEqual(provided, serviceKey);
}

function formatAmount(cents: number | null | undefined, currency: string | null | undefined): string {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return "amount n/a";
  return `${(cents / 100).toFixed(2)} ${currency || "?"}`;
}

// ---------------------------------------------------------------------------
// Alert selection, rate limiting and text
// ---------------------------------------------------------------------------

export type AlertKind = "fixed" | "needs_review" | "fix_failed";

export interface AlertItem {
  kind: AlertKind;
  eventId: string;
  tier: string;
  paymentReference: string;
  amountCents: number | null;
  currency: string | null;
  reason: string;
}

/**
 * What happened this run, as alert candidates (before rate limiting):
 *  - every event the fixer re-unlocked;
 *  - every 'needs_manual_review' row from the preview;
 *  - every row still 'fixable' after the fixer ran (the fix did not apply).
 * Only payments recorded within the lookback window are considered.
 */
export function buildAlertItems(fixedRows: readonly FixedRow[], previewRows: readonly PreviewRow[], now: Date): AlertItem[] {
  const cutoff = now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  const items: AlertItem[] = [];
  const seen = new Set<string>();

  for (const f of fixedRows) {
    if (!f.fixed || seen.has(f.event_id)) continue;
    seen.add(f.event_id);
    items.push({
      kind: "fixed",
      eventId: f.event_id,
      tier: f.tier,
      paymentReference: f.payment_reference,
      amountCents: f.payment_amount_cents ?? null,
      currency: null,
      reason: "event was paid but locked; re-unlocked automatically",
    });
  }

  for (const p of previewRows) {
    if (seen.has(p.event_id)) continue;
    const recordedAt = Date.parse(p.paid_recorded_at);
    if (!Number.isFinite(recordedAt) || recordedAt < cutoff) continue;
    seen.add(p.event_id);
    items.push({
      kind: p.verdict === "fixable" ? "fix_failed" : "needs_review",
      eventId: p.event_id,
      tier: p.tier,
      paymentReference: p.payment_reference,
      amountCents: p.payment_amount_cents,
      currency: p.payment_currency,
      reason: p.verdict === "fixable" ? "fixer did not apply the unlock (see error_logs)" : p.reason || "unspecified",
    });
  }
  return items;
}

/** At most one alert per event per 24h: drops items whose event already has a recent alert. */
export function applyRateLimit(items: readonly AlertItem[], recentlyAlertedEventIds: ReadonlySet<string>): AlertItem[] {
  return items.filter((i) => !recentlyAlertedEventIds.has(i.eventId));
}

const KIND_LABEL: Record<AlertKind, string> = {
  fixed: "FIXED automatically",
  needs_review: "NEEDS MANUAL REVIEW",
  fix_failed: "FIX FAILED",
};

export function alertSubject(items: readonly AlertItem[]): string {
  const needsHuman = items.filter((i) => i.kind !== "fixed").length;
  return needsHuman > 0
    ? `Valere: ${needsHuman} paid event(s) need attention`
    : `Valere: ${items.length} locked paid event(s) re-unlocked`;
}

/** Inner HTML (wrap with wrapEmail). Every dynamic value is escaped. Ids, tier, reference, amount, reason only. */
export function alertBodyHtml(items: readonly AlertItem[]): string {
  const rows = items
    .map(
      (i) =>
        `<li style="margin:0 0 12px;"><strong>${escapeHtml(KIND_LABEL[i.kind])}</strong><br />` +
        `Event id: ${escapeHtml(i.eventId)}<br />` +
        `Tier: ${escapeHtml(i.tier)}<br />` +
        `Payment reference: ${escapeHtml(i.paymentReference)}<br />` +
        `Amount: ${escapeHtml(formatAmount(i.amountCents, i.currency))}<br />` +
        `Detail: ${escapeHtml(i.reason)}</li>`
    )
    .join("");
  return (
    `<p>The payment reconciler found paid events that were not unlocked.</p><ul style="padding-left:18px;">${rows}</ul>` +
    `<p>Review the rows in the error_logs table (source starting with reconcile-paid-events).</p>`
  );
}

// ---------------------------------------------------------------------------
// Orchestration (dependencies injected)
// ---------------------------------------------------------------------------

export interface ReconcileStore {
  /** rpc('reconcile_paid_events'); throws on error. */
  reconcile(): Promise<FixedRow[]>;
  /** rpc('reconcile_paid_events_preview'); throws on error. */
  preview(): Promise<PreviewRow[]>;
  /** Event ids with an alert row (source ALERT_SOURCE) created at or after `sinceIso`. */
  recentlyAlerted(eventIds: string[], sinceIso: string): Promise<Set<string>>;
  /** One error_logs row per alerted event. */
  logAlert(item: AlertItem): Promise<void>;
  /** Run-level failure to error_logs (best effort; must not throw). */
  logFailure(message: string): Promise<void>;
  /** Throws when the provider rejects the send. */
  sendEmail(args: { to: string; subject: string; html: string }): Promise<void>;
  /** Wraps alert body HTML in the branded shell. */
  wrapHtml(bodyHtml: string): string;
}

export interface ReconcileSummary {
  checked: number;
  fixed: number;
  needsReview: number;
  emailed: boolean;
  alerted: number;
  emailSkipped?: string;
}

export interface RunResult {
  status: 200 | 500;
  body: ReconcileSummary | { error: string };
}

export async function runReconcile(
  store: ReconcileStore,
  opts: { opsEmail: string | null | undefined; now: Date }
): Promise<RunResult> {
  let step = "reconcile";
  try {
    const fixedRows = await store.reconcile();
    step = "preview";
    const previewRows = await store.preview();

    const fixed = fixedRows.filter((r) => r.fixed).length;
    const needsReview = previewRows.length;
    const checked = new Set([...fixedRows.map((r) => r.event_id), ...previewRows.map((r) => r.event_id)]).size;

    const candidates = buildAlertItems(fixedRows, previewRows, opts.now);
    const summary: ReconcileSummary = { checked, fixed, needsReview, emailed: false, alerted: 0 };
    if (candidates.length === 0) return { status: 200, body: summary };

    step = "alert lookup";
    const sinceIso = new Date(opts.now.getTime() - ALERT_COOLDOWN_MS).toISOString();
    const already = await store.recentlyAlerted(candidates.map((c) => c.eventId), sinceIso);
    const toAlert = applyRateLimit(candidates, already);
    if (toAlert.length === 0) return { status: 200, body: summary };

    const to = (opts.opsEmail ?? "").trim();
    if (to) {
      step = "alert email";
      await store.sendEmail({
        to,
        subject: alertSubject(toAlert),
        html: store.wrapHtml(alertBodyHtml(toAlert)),
      });
      summary.emailed = true;
    } else {
      summary.emailSkipped = "OPS_ALERT_EMAIL is not set";
    }

    // Written only after a successful send (or when there is no address), so a
    // failed send is retried on the next run instead of being rate limited.
    step = "alert log";
    for (const item of toAlert) await store.logAlert(item);
    summary.alerted = toAlert.length;
    return { status: 200, body: summary };
  } catch (err) {
    const message = redactEmails(String((err as Error)?.message ?? err)).slice(0, 500);
    await store.logFailure(`${step} failed: ${message}`);
    return { status: 500, body: { error: `reconcile-paid-events: ${step} failed` } };
  }
}
