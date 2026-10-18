// Pure logic for the Wedding HQ email reminders (send-wedding-reminders).
// Deliberately free of Deno APIs, network calls and Supabase imports so it
// can be bundled with esbuild and unit-tested in plain Node — see
// weddingReminders.test.ts. The Edge Function (send-wedding-reminders/index.ts)
// only wires a real Supabase client + Resend into `runReminders` below.
//
// PRIVACY: a reminder email carries only a title, a time and (for payments) an
// amount. Never add guest names or contact details, travel-document info,
// notes, bank details or invoice numbers here.

export type ItemKind = "event" | "task" | "payment";

export const DEFAULT_LEAD_DAYS = [0, 1];
export const MAX_LEAD_DAYS = 30;

// Africa/Johannesburg is UTC+2 all year (South Africa has no DST).
const JHB_OFFSET_MS = 2 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const NBSP = " ";

// ---------------------------------------------------------------------------
// Dates (all in Africa/Johannesburg, as YYYY-MM-DD strings)
// ---------------------------------------------------------------------------

/** The Johannesburg calendar date (YYYY-MM-DD) of an instant. */
export function jhbDateOf(instant: Date | string): string {
  const ms = new Date(instant).getTime();
  if (!Number.isFinite(ms)) throw new Error("Invalid date");
  return new Date(ms + JHB_OFFSET_MS).toISOString().slice(0, 10);
}

/** "HH:MM" wall-clock time in Johannesburg. */
export function jhbTimeOf(instant: Date | string): string {
  const ms = new Date(instant).getTime();
  if (!Number.isFinite(ms)) throw new Error("Invalid date");
  return new Date(ms + JHB_OFFSET_MS).toISOString().slice(11, 16);
}

/** Adds whole days to a YYYY-MM-DD date. */
export function addDays(isoDate: string, days: number): string {
  const ms = Date.parse(`${isoDate}T00:00:00Z`);
  if (!Number.isFinite(ms)) throw new Error("Invalid date");
  return new Date(ms + days * DAY_MS).toISOString().slice(0, 10);
}

/** UTC instant at which the given Johannesburg date starts (00:00 JHB). */
export function jhbDayStartUtc(isoDate: string): string {
  return new Date(Date.parse(`${isoDate}T00:00:00Z`) - JHB_OFFSET_MS).toISOString();
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Integer cents -> "R 15 000,00" (non-breaking spaces; mirrors src/wedding/lib/money.ts). */
export function formatZar(cents: number): string {
  if (!Number.isFinite(cents)) return `R${NBSP}0,00`;
  const rounded = Math.round(cents);
  const abs = Math.abs(rounded);
  const rands = Math.floor(abs / 100);
  const grouped = String(rands).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return `${rounded < 0 ? "-" : ""}R${NBSP}${grouped},${String(abs % 100).padStart(2, "0")}`;
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

// ---------------------------------------------------------------------------
// Row shapes (only the columns the reminder reads)
// ---------------------------------------------------------------------------

export interface MemberRow { user_id: string; role: "groom" | "bride" }
export interface SettingsRow {
  user_id: string;
  enabled: boolean;
  lead_days: number[] | null;
  include_events: boolean;
  include_tasks: boolean;
  include_payments: boolean;
}
export interface EventRow { id: string; title: string; starts_at: string; all_day: boolean }
export interface TaskRow {
  id: string;
  title: string;
  due_on: string | null;
  status: "todo" | "in_progress" | "done";
  assignee: "groom" | "bride" | "both";
}
export interface InvoiceRow { id: string; vendor_name: string; total_cents: number; due_on: string | null }
export interface PaymentRow { invoice_id: string; amount_cents: number }
export interface LogKey { item_kind: ItemKind; item_id: string; due_on: string; lead_days: number }

export interface EffectiveSettings {
  enabled: boolean;
  leadDays: number[];
  includeEvents: boolean;
  includeTasks: boolean;
  includePayments: boolean;
}

/** Members with no settings row get the defaults (enabled, today + tomorrow). */
export function effectiveSettings(row: SettingsRow | undefined | null): EffectiveSettings {
  if (!row) {
    return {
      enabled: true,
      leadDays: [...DEFAULT_LEAD_DAYS],
      includeEvents: true,
      includeTasks: true,
      includePayments: true,
    };
  }
  const lead = Array.isArray(row.lead_days)
    ? Array.from(new Set(row.lead_days.filter((n) => Number.isInteger(n) && n >= 0 && n <= MAX_LEAD_DAYS)))
        .sort((a, b) => a - b)
        .slice(0, 6)
    : [...DEFAULT_LEAD_DAYS];
  return {
    enabled: row.enabled,
    leadDays: lead,
    includeEvents: row.include_events,
    includeTasks: row.include_tasks,
    includePayments: row.include_payments,
  };
}

// ---------------------------------------------------------------------------
// Invoice balance (mirrors invoiceBalanceCents in src/wedding/lib/budget.ts)
// ---------------------------------------------------------------------------

export function invoiceBalanceCents(invoice: Pick<InvoiceRow, "id" | "total_cents">, payments: readonly PaymentRow[]): number {
  const paid = payments
    .filter((p) => p.invoice_id === invoice.id)
    .reduce((total, p) => total + p.amount_cents, 0);
  return invoice.total_cents - paid;
}

// ---------------------------------------------------------------------------
// Item collection
// ---------------------------------------------------------------------------

export interface ReminderItem {
  kind: ItemKind;
  id: string;
  dueOn: string; // YYYY-MM-DD (JHB)
  leadDays: number;
  title: string;
  time?: string; // HH:MM JHB, timed events only
  amountCents?: number; // payments only: outstanding balance
  sortKey: string;
}

export interface CollectInput {
  today: string;
  role: "groom" | "bride";
  settings: EffectiveSettings;
  events: readonly EventRow[];
  tasks: readonly TaskRow[];
  invoices: readonly InvoiceRow[];
  payments: readonly PaymentRow[];
  alreadySent: readonly LogKey[];
}

/** Items to remind one member about today, minus anything already logged. */
export function collectItems(input: CollectInput): ReminderItem[] {
  const { today, role, settings } = input;
  if (!settings.enabled) return [];
  const sent = new Set(
    input.alreadySent.map((k) => `${k.item_kind}|${k.item_id}|${k.due_on}|${k.lead_days}`)
  );
  const out: ReminderItem[] = [];
  const push = (item: ReminderItem) => {
    if (!sent.has(`${item.kind}|${item.id}|${item.dueOn}|${item.leadDays}`)) out.push(item);
  };

  for (const lead of settings.leadDays) {
    const target = addDays(today, lead);

    if (settings.includeEvents) {
      for (const e of input.events) {
        if (jhbDateOf(e.starts_at) !== target) continue;
        const time = e.all_day ? undefined : jhbTimeOf(e.starts_at);
        push({
          kind: "event", id: e.id, dueOn: target, leadDays: lead, title: e.title, time,
          sortKey: `${lead}|0|${time ?? "00:00"}|${e.title}`,
        });
      }
    }

    if (settings.includeTasks) {
      for (const t of input.tasks) {
        if (t.status === "done" || t.due_on !== target) continue;
        if (t.assignee !== "both" && t.assignee !== role) continue;
        push({ kind: "task", id: t.id, dueOn: target, leadDays: lead, title: t.title, sortKey: `${lead}|1|${t.title}` });
      }
    }

    if (settings.includePayments) {
      for (const inv of input.invoices) {
        if (inv.due_on !== target) continue;
        const balance = invoiceBalanceCents(inv, input.payments);
        if (balance <= 0) continue; // settled or overpaid
        push({
          kind: "payment", id: inv.id, dueOn: target, leadDays: lead, title: inv.vendor_name,
          amountCents: balance, sortKey: `${lead}|2|${inv.vendor_name}`,
        });
      }
    }
  }

  return out.sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0));
}

// ---------------------------------------------------------------------------
// Digest
// ---------------------------------------------------------------------------

export function leadLabel(lead: number): string {
  if (lead === 0) return "Today";
  if (lead === 1) return "Tomorrow";
  return `In ${lead} days`;
}

export function digestSubject(count: number): string {
  return `Wedding HQ: ${count} ${count === 1 ? "thing" : "things"} coming up`;
}

/** Body fragment for wrapEmail (heading and button are added by the caller). All user text is escaped. */
export function digestSectionsHtml(items: readonly ReminderItem[]): string {
  const leads = Array.from(new Set(items.map((i) => i.leadDays))).sort((a, b) => a - b);
  const kindLabel: Record<ItemKind, string> = { event: "Event", task: "Task", payment: "Payment due" };
  return leads
    .map((lead) => {
      const rows = items
        .filter((i) => i.leadDays === lead)
        .map((i) => {
          const time = i.time ? `${escapeHtml(i.time)} &middot; ` : "";
          const amount = i.amountCents !== undefined ? ` &mdash; ${escapeHtml(formatZar(i.amountCents))}` : "";
          return `<li style="margin:0 0 6px;"><span style="color:#999999;font-size:12px;">${kindLabel[i.kind]}</span><br />${time}${escapeHtml(i.title)}${amount}</li>`;
        })
        .join("");
      return `<h2 style="margin:20px 0 8px;font-size:15px;color:#111111;">${escapeHtml(leadLabel(lead))}</h2><ul style="margin:0;padding-left:18px;">${rows}</ul>`;
    })
    .join("");
}

// ---------------------------------------------------------------------------
// Orchestration (dependencies injected so it can be tested with fakes)
// ---------------------------------------------------------------------------

export interface ReminderItemsData {
  events: EventRow[];
  tasks: TaskRow[];
  invoices: InvoiceRow[];
  payments: PaymentRow[];
}

export interface ReminderStore {
  listWeddingIds(): Promise<string[]>;
  listMembers(weddingId: string): Promise<MemberRow[]>;
  listSettings(weddingId: string): Promise<SettingsRow[]>;
  /** Everything that could fall in [fromDate, toDate] (JHB dates, inclusive). */
  loadItems(weddingId: string, fromDate: string, toDate: string): Promise<ReminderItemsData>;
  loadLog(weddingId: string, userId: string, fromDate: string, toDate: string): Promise<LogKey[]>;
  insertLog(weddingId: string, userId: string, keys: LogKey[]): Promise<void>;
  /** null when the user has no email or is anonymous. */
  getEmail(userId: string): Promise<string | null>;
  sendEmail(args: { to: string; subject: string; html: string }): Promise<void>;
  buildHtml(items: readonly ReminderItem[]): string;
}

export interface RunSummary {
  weddings: number;
  members: number;
  emailsSent: number;
  skipped: number;
  errors: number;
}

export async function runReminders(
  store: ReminderStore,
  now: Date,
  onError: (scope: string, err: unknown) => void = () => {}
): Promise<RunSummary> {
  const summary: RunSummary = { weddings: 0, members: 0, emailsSent: 0, skipped: 0, errors: 0 };
  const today = jhbDateOf(now);

  let weddingIds: string[];
  try {
    weddingIds = await store.listWeddingIds();
  } catch (err) {
    onError("listWeddings", err);
    summary.errors++;
    return summary;
  }

  for (const weddingId of weddingIds) {
    summary.weddings++;
    try {
      const [members, settingsRows] = await Promise.all([
        store.listMembers(weddingId),
        store.listSettings(weddingId),
      ]);
      const settingsByUser = new Map(settingsRows.map((s) => [s.user_id, s]));
      const plans = members.map((m) => ({ member: m, settings: effectiveSettings(settingsByUser.get(m.user_id)) }));
      summary.members += members.length;

      const active = plans.filter((p) => p.settings.enabled && p.settings.leadDays.length > 0);
      summary.skipped += plans.length - active.length;
      if (active.length === 0) continue;

      const maxLead = Math.max(...active.flatMap((p) => p.settings.leadDays));
      const windowEnd = addDays(today, maxLead);
      const data = await store.loadItems(weddingId, today, windowEnd);

      for (const { member, settings } of active) {
        try {
          const log = await store.loadLog(weddingId, member.user_id, today, windowEnd);
          const items = collectItems({
            today, role: member.role, settings, ...data, alreadySent: log,
          });
          if (items.length === 0) { summary.skipped++; continue; }

          const to = await store.getEmail(member.user_id);
          if (!to) { summary.skipped++; continue; }

          await store.sendEmail({
            to,
            subject: digestSubject(items.length),
            html: store.buildHtml(items),
          });
          summary.emailsSent++;

          // Log only after a successful send so a failed send retries tomorrow.
          try {
            await store.insertLog(
              weddingId,
              member.user_id,
              items.map((i) => ({ item_kind: i.kind, item_id: i.id, due_on: i.dueOn, lead_days: i.leadDays }))
            );
          } catch (err) {
            // Email already went out; surface it, a duplicate tomorrow is the worst case.
            onError("insertLog", err);
            summary.errors++;
          }
        } catch (err) {
          onError("member", err);
          summary.errors++;
        }
      }
    } catch (err) {
      onError("wedding", err);
      summary.errors++;
    }
  }
  return summary;
}
