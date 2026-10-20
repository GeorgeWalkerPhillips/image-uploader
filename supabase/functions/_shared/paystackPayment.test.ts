// Tests for applyPaystackPayment (shared by paystack-webhook / paystack-verify),
// focused on the unlimited-tier Wedding Planner bundle. No Deno/network/Supabase:
// esbuild into Node + in-memory fake client. Fictional data only.
//
//   npx esbuild supabase/functions/_shared/paystackPayment.test.ts --bundle \
//     --platform=node --format=esm --outfile=/tmp/paystackPayment.test.mjs \
//     && node --test /tmp/paystackPayment.test.mjs

import "./denoShim.testutil.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyPaystackPayment, TIER_CONFIG } from "./paystackPayment";

const OWNER = "00000000-0000-4000-8000-0000000000a1";
const EVT = "00000000-0000-4000-8000-0000000000e1";
const EVT2 = "00000000-0000-4000-8000-0000000000e2";

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

function makeDb(opts: { tier: string; entitlementError?: Row | "throw"; preEntitled?: boolean; eventId?: string }) {
  const eventId = opts.eventId ?? EVT;
  const t: Record<string, Row[]> = {
    events: [{ id: eventId, name: "Test Event", tier: opts.tier, created_by: OWNER, is_paid: false,
      start_date: "2026-11-01", end_date: "2026-11-02" }],
    payments: [],
    user_profiles: [{ id: OWNER, email: "owner@example.test", full_name: "Test Owner" }],
    wedding_planner_entitlements: opts.preEntitled
      ? [{ user_id: OWNER, payment_reference: "paystack-x", amount_cents: 19900, source: "paystack" }] : [],
    error_logs: [],
  };
  const unique: Record<string, string[]> = {
    payments: ["payment_reference"],
    wedding_planner_entitlements: ["user_id", "payment_reference"],
  };
  const client = {
    from(table: string) {
      const filters: [string, unknown][] = [];
      let op: "select" | "update" = "select";
      let patch: Row = {};
      const matched = () => t[table].filter((r) => filters.every(([k, v]) => r[k] === v));
      const q: Row = {
        select() { return q; },
        eq(k: string, v: unknown) { filters.push([k, v]); return q; },
        maybeSingle: async () => ({ data: matched()[0] ?? null, error: null }),
        single: async () => ({ data: matched()[0] ?? null, error: null }),
        update(p: Row) { op = "update"; patch = p; return q; },
        insert: async (row: Row) => {
          if (table === "wedding_planner_entitlements" && opts.entitlementError) {
            if (opts.entitlementError === "throw") throw new Error("network down");
            return { error: opts.entitlementError };
          }
          for (const col of unique[table] ?? []) {
            if (t[table].some((r) => r[col] === row[col])) return { error: { code: "23505" } };
          }
          t[table].push({ ...row });
          return { error: null };
        },
        then(resolve: (v: Row) => void) {
          if (op === "update") {
            const rows = matched();
            rows.forEach((r) => Object.assign(r, patch));
            resolve({ data: rows.map((r) => ({ id: r.id })), error: null });
          } else resolve({ data: matched(), error: null });
        },
      };
      return q;
    },
  };
  return { t, client };
}

function withFetch() {
  const emails: Row[] = [];
  const orig = globalThis.fetch;
  globalThis.fetch = (async (_u: unknown, init: Row) => {
    emails.push(JSON.parse(init.body));
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  return { emails, restore: () => { globalThis.fetch = orig; } };
}

const txnFor = (tier: string, ref = "cbv-ref-1", over: Row = ({})) =>
  ({ reference: ref, status: "success", currency: "ZAR", amount: TIER_CONFIG[tier].amountCents, metadata: {}, ...over });

test("starter and growth grant no planner entitlement", async () => {
  for (const tier of ["starter", "growth"]) {
    const f = withFetch();
    try {
      const { t, client } = makeDb({ tier });
      const r = await applyPaystackPayment(client, EVT, txnFor(tier));
      assert.deepEqual(r, { ok: true, alreadyPaid: false, tier });
      assert.equal(t.wedding_planner_entitlements.length, 0);
      assert.equal(f.emails.length, 1);
      assert.doesNotMatch(f.emails[0].html, /Wedding Planner/);
    } finally { f.restore(); }
  }
});

test("receipt for non-bundle tiers contains no bundle text", async () => {
  const f = withFetch();
  try {
    const { client } = makeDb({ tier: "starter" });
    await applyPaystackPayment(client, EVT, txnFor("starter"));
    assert.doesNotMatch(f.emails[0].html, /\/hq\//);
  } finally { f.restore(); }
});

test("unlimited grants exactly one bundle entitlement; replay and concurrent calls do not duplicate or re-email", async () => {
  const f = withFetch();
  try {
    const { t, client } = makeDb({ tier: "unlimited" });
    const [a, b] = await Promise.all([
      applyPaystackPayment(client, EVT, txnFor("unlimited")),
      applyPaystackPayment(client, EVT, txnFor("unlimited")),
    ]);
    const c = await applyPaystackPayment(client, EVT, txnFor("unlimited"));
    assert.equal([a, b].filter((r) => r.ok && !r.alreadyPaid).length, 1);
    assert.deepEqual(c, { ok: true, alreadyPaid: true, tier: "unlimited" });
    assert.deepEqual(t.wedding_planner_entitlements, [
      { user_id: OWNER, payment_reference: `bundle-${EVT}`, amount_cents: 0, source: "admin" },
    ]);
    assert.equal(f.emails.length, 1);
    assert.equal(t.error_logs.length, 0);
  } finally { f.restore(); }
});

test("unlimited receipt mentions the included Wedding Planner with the /hq/ link", async () => {
  const f = withFetch();
  try {
    const { client } = makeDb({ tier: "unlimited" });
    await applyPaystackPayment(client, EVT, txnFor("unlimited"));
    assert.match(f.emails[0].html, /Your Wedding Planner is included &mdash; open it at https:\/\/valere\.co\.za\/hq\//);
  } finally { f.restore(); }
});

test("already-entitled owner (unique violation) is fine: no error log, payment ok", async () => {
  const f = withFetch();
  try {
    const { t, client } = makeDb({ tier: "unlimited", preEntitled: true });
    const r = await applyPaystackPayment(client, EVT, txnFor("unlimited"));
    assert.deepEqual(r, { ok: true, alreadyPaid: false, tier: "unlimited" });
    assert.equal(t.wedding_planner_entitlements.length, 1);
    assert.equal(t.error_logs.length, 0);
    assert.equal(f.emails.length, 1);
  } finally { f.restore(); }
});

for (const [label, entitlementError] of [
  ["db error", { code: "XX000", message: "boom with owner@example.test" }],
  ["thrown exception", "throw"],
] as const) {
  test(`failing entitlement insert (${label}) keeps payment result, sends receipt once, logs ids only`, async () => {
    const f = withFetch();
    const origErr = console.error; console.error = () => {};
    try {
      const { t, client } = makeDb({ tier: "unlimited", entitlementError });
      const r = await applyPaystackPayment(client, EVT, txnFor("unlimited"));
      assert.deepEqual(r, { ok: true, alreadyPaid: false, tier: "unlimited" });
      assert.equal(t.events[0].is_paid, true);
      assert.equal(f.emails.length, 1);
      assert.equal(t.error_logs.length, 1);
      const log = t.error_logs[0];
      assert.equal(log.source, "wedding-planner:bundle");
      assert.equal(log.event_id, EVT);
      assert.equal(log.user_id, OWNER);
      assert.doesNotMatch(JSON.stringify(log), /example\.test/);
      const r2 = await applyPaystackPayment(client, EVT, txnFor("unlimited"));
      assert.deepEqual(r2, { ok: true, alreadyPaid: true, tier: "unlimited" });
      assert.equal(f.emails.length, 1);
    } finally { f.restore(); console.error = origErr; }
  });
}

test("validations untouched: wrong amount / currency / status grant nothing", async () => {
  const f = withFetch();
  try {
    for (const over of [{ amount: 17900 }, { currency: "USD" }, { status: "failed" }, { metadata: { tier: "starter" } }]) {
      const { t, client } = makeDb({ tier: "unlimited" });
      const r = await applyPaystackPayment(client, EVT, txnFor("unlimited", "cbv-ref-2", over));
      assert.equal(r.ok, false);
      assert.equal(t.wedding_planner_entitlements.length, 0);
      assert.equal(t.events[0].is_paid, false);
    }
    assert.equal(f.emails.length, 0);
  } finally { f.restore(); }
});
