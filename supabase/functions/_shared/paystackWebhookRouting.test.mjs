// Integration test for paystack-webhook routing. Builds the REAL index.ts of
// the working tree AND the committed (git HEAD) version with esbuild, runs both
// handlers in Node against an in-memory recording fake of Supabase + stubbed
// fetch, and asserts:
//   * event payments behave identically before/after (responses AND every DB
//     call and outgoing email),
//   * planner charges are routed to the planner path only,
//   * unsigned / badly signed requests are rejected.
// No Deno, network or Supabase needed. Fictional data only.
//
// Run from the repo root:
//   node --test supabase/functions/_shared/paystackWebhookRouting.test.mjs
// (needs `npx esbuild` available; git for the baseline comparison)

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { readFileSync, writeFileSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../..");
const webhookDir = join(repo, "supabase/functions/paystack-webhook");
const SECRET = "sk_test_fictional";
const U1 = "00000000-0000-4000-8000-0000000000a1";
const U2 = "00000000-0000-4000-8000-0000000000a2";
const EVT = "00000000-0000-4000-8000-0000000000e1";

// ---- fake runtime ------------------------------------------------------------------
let calls, fetches, state;

function resetWorld(over = {}) {
  calls = [];
  fetches = [];
  state = {
    event: { id: EVT, name: "Test Event", tier: "growth", created_by: U1, is_paid: false, start_date: "2026-12-01T10:00:00Z", end_date: "2026-12-02T10:00:00Z" },
    entitled: [],
    ...over,
  };
}

function from(table) {
  const q = { table, op: "select" };
  const rec = (kind, ...a) => calls.push([kind, table, ...a]);
  const resolveQ = () => {
    if (table === "events" && q.op === "update") return { data: [{ id: EVT }], error: null };
    if (table === "events") return { data: state.event, error: null };
    if (table === "user_profiles") return { data: { email: "owner@example.com", full_name: "Test Owner" }, error: null };
    if (table === "wedding_planner_entitlements" && q.op === "select") return { data: null, error: null };
    return { data: null, error: null };
  };
  const chain = {
    select(...a) { rec("select", a); return chain; },
    insert(v) { q.op = "insert"; rec("insert", v); return chain; },
    update(v) { q.op = "update"; rec("update", v); return chain; },
    eq(...a) { rec("eq", a); return chain; },
    maybeSingle() { return Promise.resolve(resolveQ()); },
    single() { return Promise.resolve(resolveQ()); },
    then(res, rej) { return Promise.resolve(resolveQ()).then(res, rej); },
  };
  return chain;
}

const admin = {
  from,
  auth: { admin: { getUserById: async (id) => { calls.push(["getUserById", id]); return { data: { user: { id, email: "buyer@example.com" } }, error: null }; } } },
};

globalThis.__admin = admin;
globalThis.Deno = {
  env: { get: (k) => ({ PAYSTACK_SECRET_KEY: SECRET, SUPABASE_URL: "http://x", SUPABASE_SERVICE_ROLE_KEY: "k", RESEND_API_KEY: "r", RESEND_FROM_EMAIL: "f@example.com", ALLOWED_ORIGIN: "https://valere.co.za" })[k] },
  serve: (h) => { globalThis.__lastHandler = h; },
};
globalThis.fetch = async (url, init) => {
  fetches.push([String(url), JSON.parse(init.body)]);
  return { ok: true, json: async () => ({}), text: async () => "" };
};

// ---- build both versions -----------------------------------------------------------
const out = mkdtempSync(join(tmpdir(), "webhook-routing-"));
const stub = join(out, "supabase-stub.mjs");
writeFileSync(stub, `export const createClient = () => ({
  from: (...a) => globalThis.__admin.from(...a),
  auth: { admin: { getUserById: (...a) => globalThis.__admin.auth.admin.getUserById(...a) } },
});`);

function buildAndLoad(entry, name) {
  const outfile = join(out, `${name}.mjs`);
  const r = spawnSync("npx", ["--no-install", "esbuild", entry, "--bundle", "--platform=node", "--format=esm",
    "--external:https://*", `--outfile=${outfile}`, "--log-level=error"], { encoding: "utf8", cwd: repo });
  assert.equal(r.status, 0, r.stderr);
  const code = readFileSync(outfile, "utf8").replaceAll("https://esm.sh/@supabase/supabase-js@2", pathToFileURL(stub).href);
  writeFileSync(outfile, code);
  return import(pathToFileURL(outfile).href).then(() => globalThis.__lastHandler);
}

let current, baseline;
const baselineFile = join(webhookDir, ".baseline.tmp.ts");
before(async () => {
  current = await buildAndLoad(join(webhookDir, "index.ts"), "current");
  const head = spawnSync("git", ["show", "HEAD:supabase/functions/paystack-webhook/index.ts"], { encoding: "utf8", cwd: repo });
  if (head.status === 0) {
    writeFileSync(baselineFile, head.stdout);
    try { baseline = await buildAndLoad(baselineFile, "baseline"); } finally { rmSync(baselineFile, { force: true }); }
  }
});
after(() => { rmSync(baselineFile, { force: true }); rmSync(out, { recursive: true, force: true }); });

// ---- helpers -------------------------------------------------------------------------
const sign = (body) => createHmac("sha512", SECRET).update(body).digest("hex");
const makeReq = (payload, sig) => {
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  return new Request("http://localhost/paystack-webhook", {
    method: "POST", body,
    headers: sig === null ? {} : { "x-paystack-signature": sig ?? sign(body) },
  });
};
const charge = (data) => ({ event: "charge.success", data });
const norm = (v) => JSON.parse(JSON.stringify(v).replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, "<ts>"));

async function run(handler, payload, sig, world) {
  resetWorld(world);
  const res = await handler(makeReq(payload, sig));
  return { status: res.status, text: await res.text(), calls: norm(calls), fetches: norm(fetches) };
}
const touched = (r, table) => r.calls.some((c) => c[1] === table);

const evtTxn = (over = {}) => ({ reference: `cbv-${EVT}-abcdefabcdef`, status: "success", currency: "ZAR", amount: 39900, metadata: { eventId: EVT, userId: U1, tier: "growth", eventName: "Test Event" }, ...over });
const planRef = (u = U1) => `wp-${u}-abcdefabcdef`;
const planTxn = (over = {}) => ({ reference: planRef(), status: "success", currency: "ZAR", amount: 49900, metadata: { product: "wedding_planner", userId: U1 }, ...over });

// ---- 1. existing event behaviour is unchanged ------------------------------------------
const EVENT_CASES = {
  "valid event payment (reference + metadata)": charge(evtTxn()),
  "event payment, metadata as JSON string": charge(evtTxn({ metadata: JSON.stringify({ eventId: EVT, tier: "growth" }) })),
  "event payment resolved from reference only": charge(evtTxn({ metadata: { referrer: "https://x" } })),
  "event payment, wrong amount": charge(evtTxn({ amount: 17900 })),
  "event payment, tier mismatch": charge(evtTxn({ metadata: { eventId: EVT, tier: "starter" } })),
  "event payment, unknown product value + eventId": charge(evtTxn({ metadata: { eventId: EVT, tier: "growth", product: "Wedding_Planner" } })),
  "event payment, bogus product value": charge(evtTxn({ metadata: { eventId: EVT, product: 42 } })),
  "charge with no event id": charge({ reference: "plain-ref", status: "success", amount: 100, metadata: {} }),
  "lookalike wp reference with event metadata": charge(evtTxn({ reference: `wpx-${U1}-abcdefabcdef` })),
  "non charge.success event": { event: "charge.failed", data: evtTxn() },
  "transfer event": { event: "transfer.success", data: { reference: "t1" } },
};

for (const [name, payload] of Object.entries(EVENT_CASES)) {
  test(`event flow unchanged vs git HEAD: ${name}`, async (t) => {
    if (!baseline) return t.skip("git HEAD baseline unavailable");
    const before_ = await run(baseline, payload);
    const after_ = await run(current, payload);
    assert.deepEqual(after_, before_);
    assert.equal(touched(after_, "wedding_planner_entitlements"), false);
  });
}

test("event payment still marks the event paid and sends the event receipt", async () => {
  const r = await run(current, charge(evtTxn()));
  assert.equal(r.status, 200);
  assert.ok(r.calls.some((c) => c[0] === "update" && c[1] === "events"));
  assert.ok(r.calls.some((c) => c[0] === "insert" && c[1] === "payments"));
  assert.equal(r.fetches.length, 1);
  assert.match(r.fetches[0][1].subject, /Payment confirmed for/);
  assert.equal(touched(r, "wedding_planner_entitlements"), false);
});

// ---- 2. planner routing ---------------------------------------------------------------
test("planner reference + metadata -> planner path only, receipt sent", async () => {
  const r = await run(current, charge(planTxn()));
  assert.equal(r.status, 200);
  const ins = r.calls.find((c) => c[0] === "insert" && c[1] === "wedding_planner_entitlements");
  assert.ok(ins, "entitlement inserted");
  assert.equal(ins[2].user_id, U1);
  assert.equal(ins[2].payment_reference, planRef());
  assert.equal(touched(r, "events"), false);
  assert.equal(touched(r, "payments"), false);
  assert.equal(r.fetches.length, 1);
  assert.equal(r.fetches[0][1].subject, "Wedding Planner purchase confirmed");
});

test("planner reference alone (no metadata) is rejected by validation (product required), nothing granted", async () => {
  const r = await run(current, charge(planTxn({ metadata: undefined })));
  assert.equal(r.status, 200); // non-retryable
  assert.equal(touched(r, "wedding_planner_entitlements"), false);
  assert.equal(touched(r, "events"), false);
});

test("planner wrong amount: acknowledged (200), nothing granted, event tables untouched", async () => {
  const r = await run(current, charge(planTxn({ amount: 39900 })));
  assert.equal(r.status, 200);
  assert.equal(touched(r, "wedding_planner_entitlements"), false);
  assert.equal(touched(r, "events"), false);
});

test("event reference carrying planner metadata is a conflict: neither path runs", async () => {
  const r = await run(current, charge(evtTxn({ metadata: { eventId: EVT, product: "wedding_planner", userId: U1 } })));
  assert.equal(r.status, 200);
  assert.equal(touched(r, "events"), false);
  assert.equal(touched(r, "payments"), false);
  assert.equal(touched(r, "wedding_planner_entitlements"), false);
  assert.ok(r.calls.some((c) => c[0] === "insert" && c[1] === "error_logs"));
  assert.equal(r.fetches.length, 0);
});

test("planner reference naming one user but metadata another: conflict, nothing granted", async () => {
  const r = await run(current, charge(planTxn({ metadata: { product: "wedding_planner", userId: U2 } })));
  assert.equal(r.status, 200);
  assert.equal(touched(r, "wedding_planner_entitlements"), false);
  assert.equal(touched(r, "events"), false);
});

test("event-priced event reference replayed with planner reference text: never grants", async () => {
  // A planner-format reference with an event-tier amount cannot unlock the planner
  const r = await run(current, charge(planTxn({ amount: 17900, metadata: { product: "wedding_planner", userId: U1 } })));
  assert.equal(touched(r, "wedding_planner_entitlements"), false);
});

// ---- 3. signature ------------------------------------------------------------------------
test("unsigned, mis-signed and tampered-body requests are rejected before any DB access", async () => {
  for (const payload of [charge(planTxn()), charge(evtTxn())]) {
    const none = await run(current, payload, null);
    assert.equal(none.status, 400);
    const bad = await run(current, payload, "0".repeat(128));
    assert.equal(bad.status, 400);
    // signature valid for a different body
    const wrong = await run(current, payload, sign("something else"));
    assert.equal(wrong.status, 400);
    for (const r of [none, bad, wrong]) {
      assert.deepEqual(r.calls, []);
      assert.deepEqual(r.fetches, []);
    }
  }
});
