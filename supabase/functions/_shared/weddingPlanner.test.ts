// Tests for the Wedding Planner purchase + invite logic. No Deno, network or
// Supabase: bundled with esbuild into Node, in-memory fakes. Fictional data only.
//
//   npx esbuild supabase/functions/_shared/weddingPlanner.test.ts --bundle \
//     --platform=node --format=esm --outfile=/tmp/weddingPlanner.test.mjs \
//     && node --test /tmp/weddingPlanner.test.mjs
//
// (The paystack-webhook routing integration test is paystackWebhookRouting.test.mjs.)

import "./denoShim.testutil.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  WEDDING_PLANNER, buildPlannerReference, userIdFromPlannerReference, isPlannerReference,
  plannerMetadata, routeTransaction, siteOriginFrom, checkoutOriginFrom, buildInitializePayload,
  validatePlannerTransaction, applyPlannerPayment, receiptEmail,
} from "./weddingPlanner";
import { buildReference } from "./paystackPayment";
import {
  handleInvite, hashToken, generateToken, normalizeEmail, inviteEmail, INVITE_SUBJECT,
  type InviteStore, type InviteRow, type InviteKind,
} from "./weddingInvite";
import { escapeHtml } from "./weddingReminders";

const U1 = "00000000-0000-4000-8000-0000000000a1";
const U2 = "00000000-0000-4000-8000-0000000000a2";
const EVT = "00000000-0000-4000-8000-0000000000e1";
const W = "00000000-0000-4000-8000-000000000001";
const W2 = "00000000-0000-4000-8000-000000000002";

// ---- references / routing -----------------------------------------------------

test("price constant", () => {
  assert.equal(WEDDING_PLANNER.amountCents, 49900);
  assert.equal(WEDDING_PLANNER.currency, "ZAR");
});

test("planner reference: build, parse, Paystack-safe characters", () => {
  const ref = buildPlannerReference(U1);
  assert.match(ref, /^wp-[0-9a-f-]{36}-[a-z0-9]{12}$/);
  assert.match(ref, /^[A-Za-z0-9.=-]+$/);
  assert.equal(userIdFromPlannerReference(ref), U1);
  assert.equal(isPlannerReference(ref), true);
  assert.throws(() => buildPlannerReference("not-a-uuid"));
  assert.notEqual(buildPlannerReference(U1), buildPlannerReference(U1));
});

test("planner reference: malformed and foreign formats are rejected", () => {
  for (const bad of [
    null, undefined, 42, "", "wp-", `wp-${U1}`, `wp-${U1}-short`, `wp-${U1}-has_underscore1`,
    `wp-${U1}-abcdefabcdef-extra`, `WPX-${U1}-abcdefabcdef`, `wp-not-a-uuid-abcdefabcdef`,
    `xwp-${U1}-abcdefabcdef`, `wp-${U1}-abcdefabcdef\n`, `cbv-${U1}-abcdefabcdef`,
  ]) {
    assert.equal(userIdFromPlannerReference(bad), null, String(bad));
  }
  assert.equal(userIdFromPlannerReference(buildReference(EVT)), null);
  assert.equal(userIdFromPlannerReference(`wp-${U1.toUpperCase()}-abcdefabcdef`), U1);
});

test("routing: planner ref or product -> planner; plain event traffic stays on the event path", () => {
  assert.deepEqual(routeTransaction({ reference: buildPlannerReference(U1) }), { kind: "planner", userId: U1 });
  assert.deepEqual(
    routeTransaction({ reference: buildPlannerReference(U1), metadata: plannerMetadata(U1) }),
    { kind: "planner", userId: U1 }
  );
  assert.deepEqual(
    routeTransaction({ reference: "abc", metadata: JSON.stringify(plannerMetadata(U1)) }),
    { kind: "planner", userId: U1 }
  );
  // event traffic
  assert.deepEqual(routeTransaction({ reference: buildReference(EVT), metadata: { eventId: EVT, tier: "growth" } }), { kind: "event" });
  assert.deepEqual(routeTransaction({ reference: "x", metadata: { referrer: "https://x" } }), { kind: "event" });
  assert.deepEqual(routeTransaction({}), { kind: "event" });
  assert.deepEqual(routeTransaction({ reference: "x", metadata: "not json" }), { kind: "event" });
});

test("routing: tampered / unknown products never fall into the planner path", () => {
  for (const product of ["Wedding_Planner", "wedding-planner", "wedding_planner ", "planner", 1, null, true, {}]) {
    assert.deepEqual(
      routeTransaction({ reference: buildReference(EVT), metadata: { product, eventId: EVT } }),
      { kind: "event" }, String(product)
    );
  }
  // lookalike prefixes are not planner refs
  assert.deepEqual(routeTransaction({ reference: `wpx-${U1}-abcdefabcdef` }), { kind: "event" });
  assert.deepEqual(routeTransaction({ reference: `wp-${U1}-abcdefabcdef-1` }), { kind: "event" });
});

test("routing: mixed or inconsistent planner signals are refused, never guessed", () => {
  const c = (t: object) => routeTransaction(t).kind;
  assert.equal(c({ reference: buildReference(EVT), metadata: plannerMetadata(U1) }), "conflict");
  assert.equal(c({ reference: buildPlannerReference(U1), metadata: { product: "wedding_planner", eventId: EVT } }), "conflict");
  assert.equal(c({ reference: buildPlannerReference(U1), metadata: plannerMetadata(U2) }), "conflict");
  assert.equal(c({ reference: "abc", metadata: { product: "wedding_planner" } }), "conflict"); // no user id
  assert.equal(c({ reference: "abc", metadata: { product: "wedding_planner", userId: "nope" } }), "conflict");
});

test("origins", () => {
  assert.equal(siteOriginFrom("http://localhost:3000,https://valere.co.za,https://www.valere.co.za"), "https://valere.co.za");
  assert.equal(siteOriginFrom("*"), "https://valere.co.za");
  assert.equal(siteOriginFrom(undefined), "https://valere.co.za");
  assert.equal(siteOriginFrom("http://localhost:3000"), "https://valere.co.za");
  const allowed = "https://valere.co.za,https://www.valere.co.za";
  assert.equal(checkoutOriginFrom("https://www.valere.co.za", allowed), "https://www.valere.co.za");
  assert.equal(checkoutOriginFrom("https://evil.example", allowed), "https://valere.co.za");
  assert.equal(checkoutOriginFrom(null, allowed), "https://valere.co.za");
  assert.equal(checkoutOriginFrom("https://evil.example", undefined), "https://valere.co.za");
});

test("initialize payload: amount from the server constant only", () => {
  const p = buildInitializePayload({ id: U1, email: "a@example.com" }, "https://valere.co.za");
  assert.equal(p.amount, 49900);
  assert.equal(p.currency, "ZAR");
  assert.equal(p.email, "a@example.com");
  assert.deepEqual(p.metadata, { product: "wedding_planner", userId: U1 });
  assert.equal(userIdFromPlannerReference(p.reference), U1);
  assert.equal(p.callback_url, "https://valere.co.za/wedding-planner?payment=success");
});

// ---- transaction validation ---------------------------------------------------

const goodTxn = (over: object = {}) => ({
  reference: `wp-${U1}-abcdefabcdef`, status: "success", currency: "ZAR", amount: 49900,
  metadata: plannerMetadata(U1), ...over,
});

test("validatePlannerTransaction", () => {
  assert.equal(validatePlannerTransaction(U1, goodTxn()), null);
  assert.match(validatePlannerTransaction(U1, goodTxn({ metadata: undefined }))!, /product/);
  assert.match(validatePlannerTransaction(U1, goodTxn({ reference: buildReference(EVT) }))!, /reference/);
  assert.match(validatePlannerTransaction(U1, goodTxn({ status: "failed" }))!, /status/);
  assert.match(validatePlannerTransaction(U1, goodTxn({ status: undefined }))!, /status/);
  assert.match(validatePlannerTransaction(U1, goodTxn({ currency: "USD" }))!, /currency/);
  assert.match(validatePlannerTransaction(U1, goodTxn({ currency: undefined }))!, /currency/);
  assert.match(validatePlannerTransaction(U1, goodTxn({ amount: 49899 }))!, /Amount mismatch/);
  assert.match(validatePlannerTransaction(U1, goodTxn({ amount: 99800 }))!, /Amount mismatch/);
  assert.match(validatePlannerTransaction(U1, goodTxn({ amount: "49900" }))!, /Amount mismatch/);
  assert.match(validatePlannerTransaction(U1, goodTxn({ metadata: { product: "event" } }))!, /product/);
  assert.match(validatePlannerTransaction(U1, goodTxn({ metadata: plannerMetadata(U2) }))!, /different user/);
  assert.match(validatePlannerTransaction(U2, goodTxn())!, /different user/); // ref names U1
});

// ---- applyPlannerPayment with a fake admin client -------------------------------

function fakeAdmin(opts: { users?: Record<string, { email?: string; is_anonymous?: boolean }>; seed?: { user_id: string; payment_reference: string }[]; insertError?: { code: string } } = {}) {
  const users = opts.users ?? { [U1]: { email: "bride@example.com" }, [U2]: { email: "other@example.com" } };
  const entitlements: Record<string, unknown>[] = [...(opts.seed ?? [])];
  const errorLogs: Record<string, unknown>[] = [];
  const admin = {
    auth: { admin: { getUserById: async (id: string) => (users[id] ? { data: { user: { id, ...users[id] } }, error: null } : { data: { user: null }, error: { message: "nf" } }) } },
    from(table: string) {
      if (table === "error_logs") return { insert: async (row: Record<string, unknown>) => { errorLogs.push(row); return { error: null }; } };
      assert.equal(table, "wedding_planner_entitlements");
      return {
        insert: async (row: Record<string, unknown>) => {
          if (opts.insertError) return { error: opts.insertError };
          if (entitlements.some((e) => e.payment_reference === row.payment_reference || e.user_id === row.user_id)) return { error: { code: "23505" } };
          entitlements.push(row);
          return { error: null };
        },
        select: () => ({ eq: (_c: string, v: string) => ({ maybeSingle: async () => ({ data: entitlements.find((e) => e.payment_reference === v) ?? null }) }) }),
      };
    },
  };
  return { admin, entitlements, errorLogs };
}

function deps(fail = false) {
  const sent: { to: string; subject: string; html: string }[] = [];
  return { sent, d: { siteOrigin: "https://valere.co.za", sendEmail: async (m: { to: string; subject: string; html: string }) => { if (fail) throw new Error("Resend send failed (500): bounce for bride@example.com"); sent.push(m); return {}; } } };
}

test("new purchase: entitlement inserted once, receipt sent once, idempotent on replay", async () => {
  const { admin, entitlements } = fakeAdmin();
  const { sent, d } = deps();
  const txn = goodTxn();
  const r1 = await applyPlannerPayment(admin, U1, txn, d);
  assert.deepEqual(r1, { ok: true, alreadyPaid: false, duplicateCharge: false });
  assert.equal(entitlements.length, 1);
  assert.equal(entitlements[0].source, "paystack");
  assert.equal(entitlements[0].payment_reference, txn.reference);
  assert.equal(entitlements[0].amount_cents, 49900);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "bride@example.com");
  assert.equal(sent[0].subject, "Wedding Planner purchase confirmed");
  assert.match(sent[0].html, /valere\.co\.za\/hq\//);
  assert.match(sent[0].html, /R&nbsp;499,00|R 499,00/);

  const r2 = await applyPlannerPayment(admin, U1, txn, d);
  assert.deepEqual(r2, { ok: true, alreadyPaid: true, duplicateCharge: false });
  assert.equal(entitlements.length, 1);
  assert.equal(sent.length, 1, "no second receipt");
});

test("concurrent identical deliveries: exactly one receipt", async () => {
  const { admin, entitlements } = fakeAdmin();
  const { sent, d } = deps();
  const txn = goodTxn();
  const results = await Promise.all([1, 2, 3].map(() => applyPlannerPayment(admin, U1, txn, d)));
  assert.equal(entitlements.length, 1);
  assert.equal(results.filter((r) => r.ok && !r.alreadyPaid).length, 1);
  assert.equal(sent.length, 1);
});

test("reference already claimed by another user is refused", async () => {
  const txn = goodTxn();
  // (U1's reference but entitlement row says U2 owns it)
  const { admin } = fakeAdmin({ seed: [{ user_id: U2, payment_reference: txn.reference }] });
  const { sent, d } = deps();
  const r = await applyPlannerPayment(admin, U1, txn, d);
  assert.deepEqual(r, { ok: false, status: 409, error: "This payment was already applied to another account" });
  assert.equal(sent.length, 0);
});

test("existing entitlement via another reference: already_paid, flagged duplicate, logged, no receipt", async () => {
  const { admin, entitlements, errorLogs } = fakeAdmin({ seed: [{ user_id: U1, payment_reference: `grandfathered-${U1}` }] });
  const { sent, d } = deps();
  const r = await applyPlannerPayment(admin, U1, goodTxn(), d);
  assert.deepEqual(r, { ok: true, alreadyPaid: true, duplicateCharge: true });
  assert.equal(entitlements.length, 1);
  assert.equal(sent.length, 0);
  assert.equal(errorLogs.length, 1);
  assert.equal(errorLogs[0].source, "wedding-planner:duplicate-charge");
  assert.doesNotMatch(JSON.stringify(errorLogs), /@/);
});

test("anonymous / unknown user refused", async () => {
  const anon = fakeAdmin({ users: { [U1]: { is_anonymous: true } } });
  const r = await applyPlannerPayment(anon.admin, U1, goodTxn(), deps().d);
  assert.equal(r.ok, false);
  assert.equal(anon.entitlements.length, 0);
  const none = fakeAdmin({ users: {} });
  const r2 = await applyPlannerPayment(none.admin, U1, goodTxn(), deps().d);
  assert.deepEqual(r2, { ok: false, status: 404, error: "User not found" });
});

test("wrong amount, currency, status or product: refused, nothing written", async () => {
  for (const over of [{ amount: 17900 }, { amount: 49901 }, { currency: "USD" }, { status: "abandoned" }, { metadata: { product: "event" } }]) {
    const { admin, entitlements } = fakeAdmin();
    const r = await applyPlannerPayment(admin, U1, goodTxn(over), deps().d);
    assert.equal(r.ok, false, JSON.stringify(over));
    assert.equal((r as { status: number }).status, 400);
    assert.equal(entitlements.length, 0);
  }
});

test("non-unique DB failure is a 500 (webhook will be retried)", async () => {
  const { admin } = fakeAdmin({ insertError: { code: "XX000" } });
  const r = await applyPlannerPayment(admin, U1, goodTxn(), deps().d);
  assert.deepEqual(r, { ok: false, status: 500, error: "Failed to record entitlement" });
});

test("receipt email failure never fails the payment; logged without the address", async () => {
  const { admin, entitlements, errorLogs } = fakeAdmin();
  const { d } = deps(true);
  const r = await applyPlannerPayment(admin, U1, goodTxn(), d);
  assert.deepEqual(r, { ok: true, alreadyPaid: false, duplicateCharge: false });
  assert.equal(entitlements.length, 1);
  assert.equal(errorLogs.length, 1);
  assert.equal(errorLogs[0].source, "wedding-planner:sendReceipt");
  assert.doesNotMatch(JSON.stringify(errorLogs), /bride@example\.com/);
});

test("receipt HTML escapes the reference", () => {
  const { html } = receiptEmail({ amount: 49900, reference: `<img src=x onerror=1>` }, "https://valere.co.za");
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img/);
});

// ---- invites ------------------------------------------------------------------------

const NOW = new Date("2026-11-10T08:00:00Z");

function fakeStore(over: {
  couple?: Record<string, { weddingId: string; displayName: string }>;
  coupleCount?: number; collabCount?: number; emails?: string[]; invites?: InviteRow[];
  createdToday?: number; createdByUser?: number; failEmail?: boolean; insertCode?: string;
} = {}) {
  const invites: InviteRow[] = over.invites ? [...over.invites] : [];
  const sent: { to: string; subject: string; html: string }[] = [];
  const logs: { source: string; message: string }[] = [];
  let seq = 0;
  const store: InviteStore = {
    getCoupleMembership: async (id) => (over.couple ?? { [U1]: { weddingId: W, displayName: "Alex <b>&" } })[id] ?? null,
    countCouple: async () => over.coupleCount ?? 1,
    countCollaborators: async () => over.collabCount ?? 0,
    memberEmails: async () => over.emails ?? ["alex@example.com"],
    listOpenInvites: async (w) => invites.filter((i) => i.weddingId === w && !i.acceptedAt && !i.revokedAt),
    countInvitesCreatedSince: async () => over.createdToday ?? 0,
    countInvitesByUserSince: async () => over.createdByUser ?? 0,
    getInvite: async (id) => invites.find((i) => i.id === id) ?? null,
    insertInvite: async (row) => {
      if (over.insertCode) throw Object.assign(new Error("dup"), { code: over.insertCode });
      const id = `00000000-0000-4000-8000-00000000f${String(++seq).padStart(3, "0")}`;
      invites.push({ id, weddingId: row.weddingId, email: row.email, kind: row.kind, displayName: row.displayName, expiresAt: row.expiresAt, acceptedAt: null, revokedAt: null, tokenHash: row.tokenHash });
      return { id };
    },
    setToken: async (id, tokenHash, expiresAt) => { const i = invites.find((x) => x.id === id)!; i.tokenHash = tokenHash; i.expiresAt = expiresAt; },
    revokeInvite: async (id) => { invites.find((x) => x.id === id)!.revokedAt = NOW.toISOString(); },
    sendEmail: async (m) => { if (over.failEmail) throw new Error("Resend failed for guest@example.com"); sent.push(m); return {}; },
    logError: async (source, message) => { logs.push({ source, message }); },
  };
  return { store, invites, sent, logs };
}

const caller = { id: U1, email: "alex@example.com" };
const idep = { siteOrigin: "https://valere.co.za", now: () => NOW };
const create = (store: InviteStore, over: object = {}, c = caller) =>
  handleInvite(store, idep, c, { action: "create", email: "  Guest@Example.com ", kind: "collaborator", displayName: "Guest", ...over });

const tokenFromEmail = (html: string) => decodeURIComponent(html.match(/join#token=([^"&]+)/)![1]);

test("hashToken is sha256 hex of the UTF-8 token (matches accept_wedding_invite)", async () => {
  for (const t of ["abc", "é-ü_ß", generateToken()]) {
    assert.equal(await hashToken(t), createHash("sha256").update(t, "utf8").digest("hex"));
  }
  assert.match(await hashToken("x"), /^[0-9a-f]{64}$/);
  const tok = generateToken();
  assert.match(tok, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(tok, generateToken());
});

test("normalizeEmail", () => {
  assert.equal(normalizeEmail("  Guest@Example.COM "), "guest@example.com");
  for (const bad of ["", "a", "a@b", "a b@c.com", "a@@c.com", "<x>@c.com", "a@c..com", `${"a".repeat(250)}@c.com`, `${"a".repeat(65)}@c.com`, 5, null, "a@c.com,b@c.com"]) {
    assert.equal(normalizeEmail(bad), null, String(bad));
  }
});

test("create: success; email carries token whose hash is stored; response has no token/hash", async () => {
  const { store, invites, sent } = fakeStore();
  const res = await create(store);
  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(res.body).sort(), ["inviteId", "ok"]);
  assert.equal(invites.length, 1);
  assert.equal(invites[0].email, "guest@example.com");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "guest@example.com");
  assert.equal(sent[0].subject, INVITE_SUBJECT);
  const token = tokenFromEmail(sent[0].html);
  assert.equal(invites[0].tokenHash, createHash("sha256").update(token).digest("hex"));
  const body = JSON.stringify(res.body);
  assert.ok(!body.includes(token) && !body.includes(invites[0].tokenHash));
  assert.equal(Date.parse(invites[0].expiresAt) - NOW.getTime(), 14 * 86_400_000);
  assert.ok(!JSON.stringify(invites).includes(token), "raw token never stored");
});

test("create: inviter name and display name are HTML-escaped in the email", async () => {
  const { store, sent } = fakeStore();
  await create(store, { displayName: `<script>alert(1)</script>` });
  assert.doesNotMatch(sent[0].html, /<script>/);
  assert.doesNotMatch(sent[0].html, /Alex <b>/);
  assert.match(sent[0].html, /Alex &lt;b&gt;&amp;/);
  assert.match(sent[0].html, /&lt;script&gt;/);
  assert.match(escapeHtml("<>"), /&lt;&gt;/);
});

test("create: authority and validation", async () => {
  const { store, invites } = fakeStore();
  assert.equal((await create(store, {}, { id: U2, email: "x@example.com" })).status, 403); // not a couple member
  assert.equal((await create(store, {}, { id: U1, email: "a@example.com", isAnonymous: true })).status, 403);
  assert.equal((await create(store, { email: "nope" })).status, 400);
  assert.equal((await create(store, { kind: "admin" })).status, 400);
  assert.equal((await create(store, { displayName: "x".repeat(81) })).status, 400);
  assert.equal((await create(store, { displayName: 7 })).status, 400);
  assert.equal((await handleInvite(store, idep, caller, { action: "nuke" })).status, 400);
  assert.equal((await handleInvite(store, idep, caller, null)).status, 400);
  assert.equal(invites.length, 0);
});

test("create: refuses self-invite and existing members", async () => {
  const { store } = fakeStore({ emails: ["alex@example.com", "member@example.com"] });
  assert.equal((await create(store, { email: "ALEX@example.com" })).status, 400);
  const r = await create(store, { email: "Member@Example.com" });
  assert.equal(r.status, 409);
});

test("create: partner limits (couple full / pending partner invite)", async () => {
  const full = fakeStore({ coupleCount: 2 });
  assert.equal((await create(full.store, { kind: "partner" })).status, 409);
  const pending = fakeStore({ invites: [{ id: "00000000-0000-4000-8000-00000000f900", weddingId: W, email: "p@example.com", kind: "partner", displayName: null, expiresAt: "2026-11-20T00:00:00Z", acceptedAt: null, revokedAt: null, tokenHash: "h" }] });
  assert.equal((await create(pending.store, { kind: "partner" })).status, 409);
  const ok = fakeStore();
  assert.equal((await create(ok.store, { kind: "partner" })).status, 200);
});

test("create: collaborators + open invites capped at 10; expired invites don't count", async () => {
  const mk = (n: number, exp: string): InviteRow[] => Array.from({ length: n }, (_, i) => ({
    id: `00000000-0000-4000-8000-00000000d${String(i).padStart(3, "0")}`, weddingId: W, email: `c${i}-${exp}@example.com`, kind: "collaborator" as InviteKind,
    displayName: null, expiresAt: exp, acceptedAt: null, revokedAt: null, tokenHash: "h",
  }));
  const live = "2026-11-20T00:00:00Z", dead = "2026-11-01T00:00:00Z";
  assert.equal((await create(fakeStore({ collabCount: 6, invites: mk(4, live) }).store)).status, 409);
  assert.equal((await create(fakeStore({ collabCount: 6, invites: mk(3, live) }).store)).status, 200);
  assert.equal((await create(fakeStore({ collabCount: 6, invites: mk(4, dead) }).store)).status, 200);
  assert.equal((await create(fakeStore({ collabCount: 10 }).store)).status, 409);
});

test("create: daily brake at 20", async () => {
  assert.equal((await create(fakeStore({ createdToday: 20 }).store)).status, 429);
  assert.equal((await create(fakeStore({ createdToday: 19 }).store)).status, 200);
});

test("create: per-user daily brake (revoke-and-reinvite loops still count)", async () => {
  assert.equal((await create(fakeStore({ createdByUser: 20 }).store)).status, 429);
  assert.equal((await create(fakeStore({ createdByUser: 19 }).store)).status, 200);
});

test("invite link uses the URL fragment, never a query string", async () => {
  const { store, sent } = fakeStore();
  await create(store);
  assert.match(sent[0].html, /\/hq\/join#token=[A-Za-z0-9_-]{43}"/);
  assert.doesNotMatch(sent[0].html, /join\?/);
});

test("create: live duplicate blocks; stale expired duplicate is revoked then re-invited", async () => {
  const base = { id: "00000000-0000-4000-8000-00000000f800", weddingId: W, email: "guest@example.com", kind: "collaborator" as InviteKind, displayName: null, acceptedAt: null, revokedAt: null, tokenHash: "h" };
  const live = fakeStore({ invites: [{ ...base, expiresAt: "2026-11-20T00:00:00Z" }] });
  assert.equal((await create(live.store)).status, 409);
  assert.equal(live.sent.length, 0);

  const stale = fakeStore({ invites: [{ ...base, expiresAt: "2026-11-01T00:00:00Z" }] });
  const r = await create(stale.store);
  assert.equal(r.status, 200);
  assert.ok(stale.invites[0].revokedAt, "stale invite revoked");
  assert.equal(stale.invites.length, 2);
});

test("create: unique-index race maps to 409", async () => {
  const { store, sent } = fakeStore({ insertCode: "23505" });
  assert.equal((await create(store)).status, 409);
  assert.equal(sent.length, 0);
});

test("create: email failure -> 502, invite revoked, no token or address in logs", async () => {
  const { store, invites, logs } = fakeStore({ failEmail: true });
  const r = await create(store);
  assert.equal(r.status, 502);
  assert.equal(invites.length, 1);
  assert.ok(invites[0].revokedAt, "no orphan open invite");
  assert.equal(logs.length, 1);
  assert.doesNotMatch(JSON.stringify(logs), /guest@example\.com/);
  assert.doesNotMatch(JSON.stringify(r.body), /token|hash/i);
  // slot is free again
  const again = fakeStore({ invites: invites, collabCount: 0 });
  assert.equal((await create(again.store)).status, 200);
});

test("resend: rotates token+expiry, emails new token, old hash gone", async () => {
  const { store, invites, sent } = fakeStore();
  await create(store);
  const oldHash = invites[0].tokenHash;
  const later = { ...idep, now: () => new Date(NOW.getTime() + 5 * 86_400_000) };
  const r = await handleInvite(store, later, caller, { action: "resend", inviteId: invites[0].id });
  assert.deepEqual(r, { status: 200, body: { ok: true, inviteId: invites[0].id } });
  assert.notEqual(invites[0].tokenHash, oldHash);
  assert.equal(invites[0].tokenHash, await hashToken(tokenFromEmail(sent[1].html)));
  assert.equal(Date.parse(invites[0].expiresAt), later.now().getTime() + 14 * 86_400_000);
});

test("resend failure restores the previous token; foreign / accepted / revoked invites refused", async () => {
  const f = fakeStore({ failEmail: true, invites: [{ id: "00000000-0000-4000-8000-00000000f700", weddingId: W, email: "g@example.com", kind: "collaborator", displayName: null, expiresAt: "2026-11-20T00:00:00Z", acceptedAt: null, revokedAt: null, tokenHash: "OLD" }] });
  const r = await handleInvite(f.store, idep, caller, { action: "resend", inviteId: f.invites[0].id });
  assert.equal(r.status, 502);
  assert.equal(f.invites[0].tokenHash, "OLD");
  assert.equal(f.invites[0].expiresAt, "2026-11-20T00:00:00Z");

  const row = (o: object): InviteRow => ({ id: "00000000-0000-4000-8000-00000000f701", weddingId: W, email: "g@example.com", kind: "collaborator", displayName: null, expiresAt: "2026-11-20T00:00:00Z", acceptedAt: null, revokedAt: null, tokenHash: "h", ...o });
  const act = (inv: InviteRow, action: string) => handleInvite(fakeStore({ invites: [inv] }).store, idep, caller, { action, inviteId: inv.id });
  assert.equal((await act(row({ weddingId: W2 }), "resend")).status, 404);
  assert.equal((await act(row({ weddingId: W2 }), "revoke")).status, 404);
  assert.equal((await act(row({ acceptedAt: "2026-11-01T00:00:00Z" }), "resend")).status, 409);
  assert.equal((await act(row({ revokedAt: "2026-11-01T00:00:00Z" }), "resend")).status, 404);
  assert.equal((await handleInvite(fakeStore().store, idep, caller, { action: "revoke", inviteId: "nope" })).status, 404);
});

test("resend of an expired invite re-checks slots", async () => {
  const inv: InviteRow = { id: "00000000-0000-4000-8000-00000000f702", weddingId: W, email: "g@example.com", kind: "collaborator", displayName: null, expiresAt: "2026-11-01T00:00:00Z", acceptedAt: null, revokedAt: null, tokenHash: "h" };
  assert.equal((await handleInvite(fakeStore({ invites: [inv], collabCount: 10 }).store, idep, caller, { action: "resend", inviteId: inv.id })).status, 409);
  assert.equal((await handleInvite(fakeStore({ invites: [inv], collabCount: 3 }).store, idep, caller, { action: "resend", inviteId: inv.id })).status, 200);
});

test("revoke: sets revoked_at, idempotent, collaborators cannot invite", async () => {
  const { store, invites } = fakeStore();
  await create(store);
  const r = await handleInvite(store, idep, caller, { action: "revoke", inviteId: invites[0].id });
  assert.equal(r.status, 200);
  assert.ok(invites[0].revokedAt);
  assert.equal((await handleInvite(store, idep, caller, { action: "revoke", inviteId: invites[0].id })).status, 200);
  // a collaborator is not in wedding_members -> getCoupleMembership null -> 403
  assert.equal((await handleInvite(store, idep, { id: U2, email: "c@example.com" }, { action: "revoke", inviteId: invites[0].id })).status, 403);
});

test("invite email: role wording, link, escaping", () => {
  const c = inviteEmail({ inviterName: "A", kind: "collaborator", displayName: null, token: "t".repeat(43), expiresAt: "2026-11-24T08:00:00Z", siteOrigin: "https://valere.co.za" });
  assert.match(c.html, /only see the tasks assigned to you/);
  assert.match(c.html, /https:\/\/valere\.co\.za\/hq\/join#token=t{43}/);
  const p = inviteEmail({ inviterName: "A", kind: "partner", displayName: "Sam", token: "t".repeat(43), expiresAt: "2026-11-24T08:00:00Z", siteOrigin: "https://valere.co.za" });
  assert.match(p.html, /full access/);
  assert.match(p.html, /Hi Sam,/);
});
