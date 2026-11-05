// Tests for the reconcile-paid-events logic. No Deno, network or Supabase: the
// pure module is bundled with esbuild into Node and run with the built-in test
// runner, using an in-memory fake ReconcileStore. All data is fictional.
//
//   npx esbuild supabase/functions/_shared/reconcilePaidEvents.test.ts --bundle \
//     --platform=node --format=esm --outfile=/tmp/reconcilePaidEvents.test.mjs \
//     && node --test /tmp/reconcilePaidEvents.test.mjs

import "./denoShim.testutil.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { TIER_CONFIG } from "./paystackPayment";
import {
  TIER_PRICES, classifyPayment, escapeHtml, safeEqual, isAuthorized, buildAlertItems, applyRateLimit,
  alertBodyHtml, alertSubject, runReconcile, ALERT_COOLDOWN_MS,
  type ReconcileStore, type PreviewRow, type FixedRow, type AlertItem,
} from "./reconcilePaidEvents";

const NOW = new Date("2026-11-10T10:00:00Z");
const E1 = "00000000-0000-4000-8000-0000000000e1";
const E2 = "00000000-0000-4000-8000-0000000000e2";
const U1 = "00000000-0000-4000-8000-0000000000a1";
const U2 = "00000000-0000-4000-8000-0000000000a2";

function review(over: Partial<PreviewRow> = {}): PreviewRow {
  return {
    event_id: E1, tier: "growth", payment_reference: "ref-1", payment_amount_cents: 17900,
    payment_currency: "ZAR", paid_recorded_at: "2026-11-10T09:00:00Z",
    verdict: "needs_manual_review", reason: "payment amount does not match the tier price", ...over,
  };
}
const fixedRow = (over: Partial<FixedRow> = {}): FixedRow =>
  ({ event_id: E1, tier: "growth", payment_reference: "ref-1", payment_amount_cents: 39900, fixed: true, ...over });

interface Fake extends ReconcileStore {
  emails: { to: string; subject: string; html: string }[];
  alerts: AlertItem[];
  failures: string[];
}

function makeStore(o: {
  fixed?: FixedRow[]; preview?: PreviewRow[]; alerted?: string[];
  reconcileError?: string; previewError?: string; sendError?: string; lookupError?: string;
} = {}): Fake {
  const s: Fake = {
    emails: [], alerts: [], failures: [],
    async reconcile() { if (o.reconcileError) throw new Error(o.reconcileError); return o.fixed ?? []; },
    async preview() { if (o.previewError) throw new Error(o.previewError); return o.preview ?? []; },
    async recentlyAlerted() { if (o.lookupError) throw new Error(o.lookupError); return new Set(o.alerted ?? []); },
    async logAlert(item) { s.alerts.push(item); },
    async logFailure(m) { s.failures.push(m); },
    async sendEmail(a) { if (o.sendError) throw new Error(o.sendError); s.emails.push(a); },
    wrapHtml: (h) => `<wrap>${h}</wrap>`,
  };
  return s;
}

// ---- classification --------------------------------------------------------

test("TIER_PRICES matches the server TIER_CONFIG exactly (sync check)", () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(TIER_PRICES).map(([k, v]) => [k, [v.amountCents, v.guestCap, v.photoCap]])),
    Object.fromEntries(Object.entries(TIER_CONFIG).map(([k, v]) => [k, [v.amountCents, v.guestCap, v.photoCap]]))
  );
});

test("classification mirrors the SQL rules", () => {
  const ok = { tier: "growth", amountCents: 39900, currency: "ZAR", paymentUserId: U1, eventOwnerId: U1 };
  assert.deepEqual(classifyPayment(ok), { verdict: "fixable", reason: null });
  for (const [tier, amt] of [["starter", 17900], ["growth", 39900], ["unlimited", 99900]] as const) {
    assert.equal(classifyPayment({ ...ok, tier, amountCents: amt }).verdict, "fixable");
  }
  assert.equal(classifyPayment({ ...ok, tier: "free" }).verdict, "needs_manual_review");
  assert.equal(classifyPayment({ ...ok, tier: "constructor" }).verdict, "needs_manual_review");
  assert.equal(classifyPayment({ ...ok, amountCents: 17900 }).verdict, "needs_manual_review");
  assert.equal(classifyPayment({ ...ok, currency: "USD" }).verdict, "needs_manual_review");
  assert.equal(classifyPayment({ ...ok, currency: null }).verdict, "needs_manual_review");
  assert.equal(classifyPayment({ ...ok, paymentUserId: U2 }).verdict, "needs_manual_review");
  assert.equal(classifyPayment({ ...ok, paymentUserId: null, eventOwnerId: null }).verdict, "needs_manual_review");
  assert.match(classifyPayment({ ...ok, currency: "USD" }).reason!, /ZAR/);
});

// ---- auth --------------------------------------------------------------------

test("auth: only the exact service key passes; empty key never authorises", () => {
  assert.equal(safeEqual("abc", "abc"), true);
  assert.equal(safeEqual("abc", "abd"), false);
  assert.equal(safeEqual("abc", "abcd"), false);
  assert.equal(isAuthorized("Bearer secret-key", "secret-key"), true);
  assert.equal(isAuthorized("bearer secret-key", "secret-key"), true);
  assert.equal(isAuthorized("Bearer wrong", "secret-key"), false);
  assert.equal(isAuthorized(null, "secret-key"), false);
  assert.equal(isAuthorized("Bearer ", ""), false);
  assert.equal(isAuthorized("", ""), false);
  assert.equal(isAuthorized("Bearer x", undefined), false);
});

// ---- alert selection -----------------------------------------------------------

test("only alerts for payments in the last 14 days; fixed first, one item per event", () => {
  const old = review({ event_id: E2, paid_recorded_at: "2026-10-20T00:00:00Z" });
  const items = buildAlertItems([fixedRow()], [review(), old], NOW);
  assert.deepEqual(items.map((i) => [i.eventId, i.kind]), [[E1, "fixed"]]);
});

test("a row still fixable after the fixer is reported as fix_failed", () => {
  const items = buildAlertItems([fixedRow({ fixed: false })], [review({ verdict: "fixable", reason: null })], NOW);
  assert.deepEqual(items.map((i) => i.kind), ["fix_failed"]);
});

test("rate limit drops events alerted in the last 24h only", () => {
  const items = buildAlertItems([], [review(), review({ event_id: E2, payment_reference: "ref-2" })], NOW);
  assert.deepEqual(applyRateLimit(items, new Set([E1])).map((i) => i.eventId), [E2]);
  assert.deepEqual(applyRateLimit(items, new Set()).length, 2);
});

// ---- escaping ---------------------------------------------------------------------

test("a <script> reason is HTML-escaped in the alert body", () => {
  const items = buildAlertItems([], [review({ reason: '<script>alert("x")</script>' })], NOW);
  const html = alertBodyHtml(items);
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;"));
  assert.equal(escapeHtml(`<&>"'`), "&lt;&amp;&gt;&quot;&#39;");
});

test("alert text carries ids/tier/reference/amount/reason and no email-like text", () => {
  const items = buildAlertItems([], [review()], NOW);
  const html = alertBodyHtml(items);
  for (const s of [E1, "growth", "ref-1", "179.00 ZAR", "payment amount does not match"]) assert.ok(html.includes(s), s);
  assert.ok(!/@/.test(html + alertSubject(items)));
});

// ---- orchestration -------------------------------------------------------------------

test("healthy: nothing fixed, nothing in preview -> no email, no logs, 200", async () => {
  const s = makeStore();
  const r = await runReconcile(s, { opsEmail: "ops@example.test", now: NOW });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { checked: 0, fixed: 0, needsReview: 0, emailed: false, alerted: 0 });
  assert.equal(s.emails.length, 0);
  assert.equal(s.alerts.length, 0);
});

test("fixed event: one email, one alert row, summary counts", async () => {
  const s = makeStore({ fixed: [fixedRow()] });
  const r = await runReconcile(s, { opsEmail: "ops@example.test", now: NOW });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { checked: 1, fixed: 1, needsReview: 0, emailed: true, alerted: 1 });
  assert.equal(s.emails.length, 1);
  assert.equal(s.emails[0].to, "ops@example.test");
  assert.ok(s.emails[0].html.startsWith("<wrap>"));
  assert.equal(s.alerts.length, 1);
});

test("many problems -> still exactly ONE email, one alert row per event", async () => {
  const s = makeStore({
    fixed: [fixedRow()],
    preview: [review({ event_id: E2, payment_reference: "ref-2" })],
  });
  const r = await runReconcile(s, { opsEmail: "ops@example.test", now: NOW });
  assert.equal(s.emails.length, 1);
  assert.equal(s.alerts.length, 2);
  assert.deepEqual(r.body, { checked: 2, fixed: 1, needsReview: 1, emailed: true, alerted: 2 });
});

test("rate limited: second run for the same event the same day sends nothing", async () => {
  const s = makeStore({ preview: [review()], alerted: [E1] });
  const r = await runReconcile(s, { opsEmail: "ops@example.test", now: NOW });
  assert.equal(r.status, 200);
  assert.equal(s.emails.length, 0);
  assert.equal(s.alerts.length, 0);
  assert.deepEqual(r.body, { checked: 1, fixed: 0, needsReview: 1, emailed: false, alerted: 0 });
});

test("rate-limit window is 24h", () => {
  assert.equal(ALERT_COOLDOWN_MS, 86_400_000);
});

test("OPS_ALERT_EMAIL missing: no email, alert rows still logged, summary says so", async () => {
  for (const missing of [undefined, null, "", "   "]) {
    const s = makeStore({ preview: [review()] });
    const r = await runReconcile(s, { opsEmail: missing, now: NOW });
    assert.equal(r.status, 200);
    assert.equal(s.emails.length, 0);
    assert.equal(s.alerts.length, 1);
    assert.equal((r.body as { emailed: boolean }).emailed, false);
    assert.match((r.body as { emailSkipped?: string }).emailSkipped ?? "", /OPS_ALERT_EMAIL/);
  }
});

test("RPC failure is reported (500), not swallowed, and logged without emails", async () => {
  const s = makeStore({ reconcileError: "boom for ops@example.test" });
  const r = await runReconcile(s, { opsEmail: "ops@example.test", now: NOW });
  assert.equal(r.status, 500);
  assert.equal(s.emails.length, 0);
  assert.equal(s.failures.length, 1);
  assert.ok(!s.failures[0].includes("ops@example.test"));
  assert.match(s.failures[0], /reconcile failed/);

  const p = makeStore({ previewError: "preview broke" });
  assert.equal((await runReconcile(p, { opsEmail: null, now: NOW })).status, 500);
});

test("email send failure -> 500 and no alert rows written, so the next run retries", async () => {
  const s = makeStore({ preview: [review()], sendError: "resend down" });
  const r = await runReconcile(s, { opsEmail: "ops@example.test", now: NOW });
  assert.equal(r.status, 500);
  assert.equal(s.alerts.length, 0);
  assert.equal(s.failures.length, 1);
});

test("alert lookup failure -> 500, never a silent send", async () => {
  const s = makeStore({ preview: [review()], lookupError: "db down" });
  const r = await runReconcile(s, { opsEmail: "ops@example.test", now: NOW });
  assert.equal(r.status, 500);
  assert.equal(s.emails.length, 0);
});
