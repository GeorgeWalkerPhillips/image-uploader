// Handler-level test for wedding-planner-verify: a Paystack-confirmed success
// charge that validation REFUSES must leave an error_logs row (source
// 'wedding-planner:verify', reference + reason, no PII). Builds the real
// index.ts with esbuild, runs it in Node against an in-memory fake + stubbed
// fetch (Paystack). No Deno/network/Supabase. Fictional data only.
//
//   node --test supabase/functions/_shared/weddingPlannerVerify.test.mjs

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../..");
const U1 = "00000000-0000-4000-8000-0000000000a1";
const REF = `wp-${U1}-abcdefabcdef`;

let calls, paystackTxn, userError;
const fakeFrom = (table) => {
  let op = "select";
  const rec = (k, v) => calls.push([k, table, v]);
  const res = () => ({ data: null, error: null });
  const chain = {
    select() { return chain; },
    insert(v) { op = "insert"; rec("insert", v); return chain; },
    eq() { return chain; },
    maybeSingle: async () => res(),
    single: async () => res(),
    then(r, j) { return Promise.resolve(res()).then(r, j); },
  };
  return chain;
};
globalThis.__client = {
  from: fakeFrom,
  auth: {
    getUser: async () => ({ data: { user: { id: U1, is_anonymous: false } }, error: null }),
    admin: { getUserById: async (id) => userError ? { data: { user: null }, error: userError } : { data: { user: { id, email: "buyer@example.com" } }, error: null } },
  },
};
globalThis.Deno = {
  env: { get: (k) => ({ PAYSTACK_SECRET_KEY: "sk_test_fictional", SUPABASE_URL: "http://x", SUPABASE_ANON_KEY: "a", SUPABASE_SERVICE_ROLE_KEY: "k", RESEND_API_KEY: "r", RESEND_FROM_EMAIL: "f@example.com", ALLOWED_ORIGIN: "https://valere.co.za" })[k] },
  serve: (h) => { globalThis.__handler = h; },
};
globalThis.fetch = async (url, init) => {
  if (String(url).includes("paystack.co")) {
    return { ok: true, status: 200, json: async () => ({ status: true, data: paystackTxn }) };
  }
  return { ok: true, json: async () => ({}), text: async () => "" }; // Resend
};

const out = mkdtempSync(join(tmpdir(), "planner-verify-"));
let handler;
before(async () => {
  const stub = join(out, "stub.mjs");
  writeFileSync(stub, "export const createClient = () => globalThis.__client;");
  const outfile = join(out, "verify.mjs");
  const r = spawnSync("npx", ["--no-install", "esbuild", join(repo, "supabase/functions/wedding-planner-verify/index.ts"), "--bundle",
    "--platform=node", "--format=esm", "--external:https://*", `--outfile=${outfile}`, "--log-level=error"], { encoding: "utf8", cwd: repo });
  assert.equal(r.status, 0, r.stderr);
  writeFileSync(outfile, readFileSync(outfile, "utf8").replaceAll("https://esm.sh/@supabase/supabase-js@2", pathToFileURL(stub).href));
  await import(pathToFileURL(outfile).href);
  handler = globalThis.__handler;
});
after(() => rmSync(out, { recursive: true, force: true }));

const txn = (over = {}) => ({ reference: REF, status: "success", currency: "ZAR", amount: 19900, metadata: { product: "wedding_planner", userId: U1 }, ...over });
async function verify(t, opts = {}) {
  calls = []; paystackTxn = t; userError = opts.userError;
  const origErr = console.error; console.error = () => {};
  try {
    const res = await handler(new Request("http://localhost/wedding-planner-verify", { method: "POST", body: JSON.stringify({ reference: REF }), headers: { Authorization: "Bearer x" } }));
    return { status: res.status, body: await res.json() };
  } finally { console.error = origErr; }
}
const logs = () => calls.filter((c) => c[0] === "insert" && c[1] === "error_logs").map((c) => c[2]);

test("pre-price-change R499 charge is refused AND logged with reference + reason, no PII", async () => {
  const r = await verify(txn({ amount: 49900 }));
  assert.equal(r.status, 400);
  assert.equal(calls.some((c) => c[1] === "wedding_planner_entitlements"), false);
  const l = logs();
  assert.equal(l.length, 1);
  assert.equal(l[0].source, "wedding-planner:verify");
  assert.equal(l[0].severity, "error");
  assert.match(l[0].message, new RegExp(REF));
  assert.match(l[0].message, /49900/); // matches the operational query
  assert.match(l[0].message, /Amount mismatch/);
  assert.doesNotMatch(JSON.stringify(l), /@/);
});

test("wrong product metadata on a success charge is logged", async () => {
  const r = await verify(txn({ metadata: { userId: U1 } }));
  assert.equal(r.status, 400);
  assert.equal(logs().length, 1);
});

test("a failing error_logs insert never changes the response", async () => {
  const orig = globalThis.__client.from;
  globalThis.__client.from = (t) => { if (t === "error_logs") throw new Error("db down"); return orig(t); };
  try {
    const r = await verify(txn({ amount: 49900 }));
    assert.equal(r.status, 400);
    assert.match(r.body.error, /Amount mismatch/);
  } finally { globalThis.__client.from = orig; }
});

test("successful purchase writes no error_logs row", async () => {
  const r = await verify(txn());
  assert.equal(r.status, 200);
  assert.equal(r.body.status, "paid");
  assert.equal(logs().length, 0);
});

test("non-success Paystack statuses (pending/failed) are not 'refused charges': no log", async () => {
  for (const status of ["abandoned", "failed"]) {
    const r = await verify(txn({ status }));
    assert.equal(r.status, 200);
    assert.equal(logs().length, 0);
  }
});
