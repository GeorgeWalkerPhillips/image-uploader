// Tests for the Wedding HQ reminder logic. No Deno, network or Supabase: the
// pure module is bundled with esbuild into Node and run with the built-in
// test runner, using an in-memory fake ReminderStore.
//
// Run from the repo root:
//   npx esbuild supabase/functions/_shared/weddingReminders.test.ts --bundle \
//     --platform=node --format=esm --outfile=/tmp/weddingReminders.test.mjs \
//     && node --test /tmp/weddingReminders.test.mjs
//
// All data below is fictional.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  jhbDateOf, jhbTimeOf, addDays, jhbDayStartUtc, escapeHtml, formatZar, redactEmails, safeEqual,
  effectiveSettings, invoiceBalanceCents, collectItems, digestSectionsHtml, digestSubject,
  runReminders,
  type ReminderStore, type ReminderItemsData, type LogKey, type SettingsRow, type MemberRow,
  type EventRow, type TaskRow, type InvoiceRow, type PaymentRow,
} from "./weddingReminders";

const W = "00000000-0000-4000-8000-000000000001";
const U_GROOM = "00000000-0000-4000-8000-0000000000a1";
const U_BRIDE = "00000000-0000-4000-8000-0000000000a2";
const NOW = new Date("2026-11-10T05:00:00Z"); // 07:00 JHB on 2026-11-10

const defaults = effectiveSettings(undefined);

// ---- dates ----------------------------------------------------------------

test("JHB date boundaries: 22:00Z and 23:30Z are already the next JHB day", () => {
  assert.equal(jhbDateOf("2026-11-10T21:59:59Z"), "2026-11-10");
  assert.equal(jhbDateOf("2026-11-10T22:00:00Z"), "2026-11-11");
  assert.equal(jhbDateOf("2026-11-10T23:30:00Z"), "2026-11-11");
  assert.equal(jhbTimeOf("2026-11-10T23:30:00Z"), "01:30");
  assert.equal(jhbTimeOf("2026-11-10T12:05:00Z"), "14:05");
});

test("addDays crosses month/year/leap boundaries; day start is 22:00Z the day before", () => {
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2028-02-28", 1), "2028-02-29");
  assert.equal(addDays("2026-11-10", 0), "2026-11-10");
  assert.equal(jhbDayStartUtc("2026-11-11"), "2026-11-10T22:00:00.000Z");
});

// ---- formatting -----------------------------------------------------------

test("money formats as R 15 000,00 with non-breaking spaces", () => {
  assert.equal(formatZar(1500000), "R 15 000,00");
  assert.equal(formatZar(1500050), "R 15 000,50");
  assert.equal(formatZar(5), "R 0,05");
  assert.equal(formatZar(123456789), "R 1 234 567,89");
  assert.equal(formatZar(-250000), "-R 2 500,00");
});

test("escapeHtml neutralises markup and quotes", () => {
  assert.equal(escapeHtml(`<script>alert("x")</script>`), "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
  assert.equal(escapeHtml(`Tom & Jerry's`), "Tom &amp; Jerry&#39;s");
  assert.equal(escapeHtml(null), "");
});

test("redactEmails and safeEqual", () => {
  assert.equal(redactEmails("bounce for jane.doe@example.com today"), "bounce for [redacted-email] today");
  assert.equal(safeEqual("abc", "abc"), true);
  assert.equal(safeEqual("abc", "abd"), false);
  assert.equal(safeEqual("abc", "abcd"), false);
});

// ---- settings -------------------------------------------------------------

test("default settings fallback when no row exists; sanitises odd lead_days", () => {
  assert.deepEqual(defaults, { enabled: true, leadDays: [0, 1], includeEvents: true, includeTasks: true, includePayments: true });
  const odd = effectiveSettings({
    user_id: U_GROOM, enabled: true, lead_days: [7, 1, 1, -3, 99, 0], include_events: true, include_tasks: false, include_payments: true,
  });
  assert.deepEqual(odd.leadDays, [0, 1, 7]);
  assert.equal(odd.includeTasks, false);
});

// ---- invoice balance ------------------------------------------------------

const inv = (id: string, total: number, due: string | null, vendor = "Fictional Florist"): InvoiceRow =>
  ({ id, vendor_name: vendor, total_cents: total, due_on: due });

test("invoice balance: unpaid, partial, paid and overpaid", () => {
  const pays: PaymentRow[] = [{ invoice_id: "i2", amount_cents: 4000 }, { invoice_id: "i3", amount_cents: 10000 }, { invoice_id: "i4", amount_cents: 12000 }];
  assert.equal(invoiceBalanceCents(inv("i1", 10000, null), pays), 10000);
  assert.equal(invoiceBalanceCents(inv("i2", 10000, null), pays), 6000);
  assert.equal(invoiceBalanceCents(inv("i3", 10000, null), pays), 0);
  assert.equal(invoiceBalanceCents(inv("i4", 10000, null), pays), -2000);
});

// ---- collection -----------------------------------------------------------

const ev = (id: string, title: string, starts_at: string, all_day = false): EventRow => ({ id, title, starts_at, all_day });
const task = (id: string, title: string, due_on: string | null, assignee: TaskRow["assignee"] = "both", status: TaskRow["status"] = "todo"): TaskRow =>
  ({ id, title, due_on, assignee, status });

const base = { today: "2026-11-10", role: "groom" as const, settings: defaults, events: [] as EventRow[], tasks: [] as TaskRow[], invoices: [] as InvoiceRow[], payments: [] as PaymentRow[], alreadySent: [] as LogKey[] };

test("events: 23:30Z lands on next JHB day (tomorrow); all-day stored 00:00 JHB has no time", () => {
  const items = collectItems({
    ...base,
    events: [
      ev("e1", "Late fitting", "2026-11-10T23:30:00Z"), // 01:30 on 11 Nov JHB -> tomorrow
      ev("e2", "Cake tasting", "2026-11-10T08:00:00Z"), // 10:00 on 10 Nov -> today
      ev("e3", "Venue day", "2026-11-09T22:00:00Z", true), // 00:00 JHB 10 Nov, all-day -> today
      ev("e4", "Too far", "2026-11-12T08:00:00Z"),
    ],
  });
  assert.deepEqual(items.map((i) => [i.id, i.leadDays, i.time]), [
    ["e3", 0, undefined], ["e2", 0, "10:00"], ["e1", 1, "01:30"],
  ]);
});

test("lead-day matching follows settings and ignores other days", () => {
  const settings = effectiveSettings({ user_id: U_GROOM, enabled: true, lead_days: [7], include_events: true, include_tasks: true, include_payments: true });
  const items = collectItems({
    ...base, settings,
    tasks: [task("t1", "Today task", "2026-11-10"), task("t2", "Week task", "2026-11-17")],
  });
  assert.deepEqual(items.map((i) => [i.id, i.leadDays]), [["t2", 7]]);
});

test("assignee filtering: own role + both; done tasks and undated skipped", () => {
  const tasks = [
    task("a", "Mine", "2026-11-10", "groom"),
    task("b", "Hers", "2026-11-10", "bride"),
    task("c", "Ours", "2026-11-10", "both"),
    task("d", "Finished", "2026-11-10", "both", "done"),
    task("e", "No date", null),
  ];
  assert.deepEqual(new Set(collectItems({ ...base, role: "groom", tasks }).map((i) => i.id)), new Set(["a", "c"]));
  assert.deepEqual(new Set(collectItems({ ...base, role: "bride", tasks }).map((i) => i.id)), new Set(["b", "c"]));
});

test("payments: only unsettled invoices due that day, amount is the balance", () => {
  const items = collectItems({
    ...base,
    invoices: [inv("i1", 1500000, "2026-11-10"), inv("i2", 1000000, "2026-11-11", "Fictional Caterer"), inv("i3", 500000, "2026-11-10", "Paid Up"), inv("i4", 500000, null)],
    payments: [{ invoice_id: "i2", amount_cents: 250000 }, { invoice_id: "i3", amount_cents: 500000 }],
  });
  assert.deepEqual(items.map((i) => [i.id, i.kind, i.leadDays, i.amountCents]), [["i1", "payment", 0, 1500000], ["i2", "payment", 1, 750000]]);
});

test("include_* flags and enabled=false suppress items", () => {
  const data = { ...base, events: [ev("e1", "X", "2026-11-10T08:00:00Z")], tasks: [task("t1", "Y", "2026-11-10")], invoices: [inv("i1", 100, "2026-11-10")] };
  const only = (flags: Partial<SettingsRow>) =>
    collectItems({ ...data, settings: effectiveSettings({ user_id: U_GROOM, enabled: true, lead_days: [0], include_events: false, include_tasks: false, include_payments: false, ...flags }) }).map((i) => i.kind);
  assert.deepEqual(only({ include_events: true }), ["event"]);
  assert.deepEqual(only({ include_tasks: true }), ["task"]);
  assert.deepEqual(only({ include_payments: true }), ["payment"]);
  assert.deepEqual(collectItems({ ...data, settings: { ...defaults, enabled: false } }), []);
});

test("dedupe: items already in the log (same kind/id/due/lead) are skipped", () => {
  const events = [ev("e1", "Fitting", "2026-11-10T08:00:00Z"), ev("e2", "Tasting", "2026-11-11T08:00:00Z")];
  const sent: LogKey[] = [{ item_kind: "event", item_id: "e1", due_on: "2026-11-10", lead_days: 0 }];
  assert.deepEqual(collectItems({ ...base, events, alreadySent: sent }).map((i) => i.id), ["e2"]);
  // same event but a different lead is a different reminder
  const s2 = effectiveSettings({ user_id: U_GROOM, enabled: true, lead_days: [0, 1], include_events: true, include_tasks: true, include_payments: true });
  const later = collectItems({ ...base, today: "2026-11-09", settings: s2, events: [ev("e1", "Fitting", "2026-11-10T08:00:00Z")], alreadySent: sent });
  assert.deepEqual(later.map((i) => [i.id, i.leadDays]), [["e1", 1]]);
});

// ---- digest ---------------------------------------------------------------

test("digest: sections, escaped titles, time and amount; no raw <script>", () => {
  const items = collectItems({
    ...base,
    events: [ev("e1", "<script>alert(1)</script>", "2026-11-10T08:00:00Z"), ev("e2", "Rehearsal", "2026-11-11T07:30:00Z")],
    invoices: [inv("i1", 1500000, "2026-11-10", `Flowers & "Co"`)],
  });
  const html = digestSectionsHtml(items);
  assert.ok(!html.includes("<script"));
  assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
  assert.ok(html.includes("Flowers &amp; &quot;Co&quot;"));
  assert.ok(html.includes("R 15 000,00"));
  assert.ok(html.includes("10:00"));
  assert.ok(html.indexOf("Today") < html.indexOf("Tomorrow"));
  assert.equal(digestSubject(1), "Wedding HQ: 1 thing coming up");
  assert.equal(digestSubject(3), "Wedding HQ: 3 things coming up");
});

// ---- orchestration with a fake store --------------------------------------

interface FakeOpts {
  members?: MemberRow[];
  settings?: SettingsRow[];
  data?: ReminderItemsData;
  emails?: Record<string, string | null>;
  failSendFor?: string[]; // recipient addresses whose send throws
  failLoadLogFor?: string[]; // user ids
  weddings?: string[];
}

function fakeStore(o: FakeOpts) {
  const sent: { to: string; subject: string; html: string }[] = [];
  const logged: { weddingId: string; userId: string; keys: LogKey[] }[] = [];
  const members = o.members ?? [{ user_id: U_GROOM, role: "groom" }, { user_id: U_BRIDE, role: "bride" }];
  const store: ReminderStore = {
    listWeddingIds: async () => o.weddings ?? [W],
    listMembers: async () => members,
    listSettings: async () => o.settings ?? [],
    loadItems: async () => o.data ?? { events: [], tasks: [], invoices: [], payments: [] },
    loadLog: async (_w, userId) => {
      if (o.failLoadLogFor?.includes(userId)) throw new Error("boom");
      return logged.filter((l) => l.userId === userId).flatMap((l) => l.keys);
    },
    insertLog: async (weddingId, userId, keys) => { logged.push({ weddingId, userId, keys }); },
    getEmail: async (id) => (o.emails ? o.emails[id] ?? null : `${id.slice(-2)}@example.test`),
    sendEmail: async (m) => {
      if (o.failSendFor?.includes(m.to)) throw new Error("resend down");
      sent.push(m);
    },
    buildHtml: (items) => digestSectionsHtml(items),
  };
  return { store, sent, logged };
}

const oneTask: ReminderItemsData = { events: [], tasks: [task("t1", "Book band", "2026-11-10")], invoices: [], payments: [] };

test("run: one digest per member (not per item), defaults applied, log written after send", async () => {
  const data: ReminderItemsData = {
    events: [ev("e1", "A", "2026-11-10T08:00:00Z"), ev("e2", "B", "2026-11-10T09:00:00Z")],
    tasks: [task("t1", "C", "2026-11-10")], invoices: [], payments: [],
  };
  const { store, sent, logged } = fakeStore({ data });
  const s = await runReminders(store, NOW);
  assert.equal(sent.length, 2);
  assert.equal(sent[0].subject, "Wedding HQ: 3 things coming up");
  assert.deepEqual(s, { weddings: 1, members: 2, emailsSent: 2, skipped: 0, errors: 0 });
  assert.equal(logged.length, 2);
  assert.equal(logged[0].keys.length, 3);
});

test("run: second run the same day sends nothing (dedupe through the log)", async () => {
  const { store, sent } = fakeStore({ data: oneTask });
  await runReminders(store, NOW);
  assert.equal(sent.length, 2);
  const s2 = await runReminders(store, NOW);
  assert.equal(sent.length, 2);
  assert.equal(s2.emailsSent, 0);
  assert.equal(s2.skipped, 2);
});

test("run: empty digest sends nothing", async () => {
  const { store, sent, logged } = fakeStore({});
  const s = await runReminders(store, NOW);
  assert.equal(sent.length, 0);
  assert.equal(logged.length, 0);
  assert.equal(s.emailsSent, 0);
});

test("run: failed send does not write the log; retried on the next run", async () => {
  const addr = `${U_GROOM.slice(-2)}@example.test`;
  const fail = fakeStore({ data: oneTask, failSendFor: [addr] });
  const s = await runReminders(fail.store, NOW);
  assert.equal(s.errors, 1);
  assert.equal(s.emailsSent, 1); // bride's went out
  assert.deepEqual(fail.logged.map((l) => l.userId), [U_BRIDE]); // groom not logged
  // next day-run with Resend healthy again: groom is retried, bride is not repeated
  const ok = fakeStore({ data: oneTask });
  ok.logged.push(...fail.logged);
  const s2 = await runReminders(ok.store, NOW);
  assert.equal(s2.emailsSent, 1);
  assert.equal(ok.sent[0].to, addr);
});

test("run: one member's failure does not block others (and a failing wedding does not block the next)", async () => {
  const { store, sent } = fakeStore({ data: oneTask, failLoadLogFor: [U_GROOM] });
  const s = await runReminders(store, NOW);
  assert.equal(s.errors, 1);
  assert.equal(sent.length, 1);

  const second = "00000000-0000-4000-8000-000000000002";
  const f = fakeStore({ data: oneTask, weddings: [W, second] });
  const base = f.store.listMembers;
  f.store.listMembers = async (id) => { if (id === W) throw new Error("db"); return base(id); };
  const s2 = await runReminders(f.store, NOW);
  assert.equal(s2.weddings, 2);
  assert.equal(s2.errors, 1);
  assert.equal(f.sent.length, 2);
});

test("run: disabled members, members without email skipped; settings rows respected", async () => {
  const { store, sent } = fakeStore({
    data: oneTask,
    settings: [{ user_id: U_GROOM, enabled: false, lead_days: [0, 1], include_events: true, include_tasks: true, include_payments: true }],
    emails: { [U_BRIDE]: null },
  });
  const s = await runReminders(store, NOW);
  assert.equal(sent.length, 0);
  assert.equal(s.skipped, 2);
  assert.equal(s.errors, 0);
});

test("run: summary contains no PII (counts only) and reports listing failure", async () => {
  const { store } = fakeStore({ data: oneTask });
  const s = await runReminders(store, NOW);
  assert.deepEqual(Object.keys(s).sort(), ["emailsSent", "errors", "members", "skipped", "weddings"]);
  store.listWeddingIds = async () => { throw new Error("down"); };
  const s2 = await runReminders(store, NOW);
  assert.equal(s2.errors, 1);
});
