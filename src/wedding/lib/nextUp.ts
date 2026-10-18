import { invoiceBalanceCents, invoiceStatus } from './budget';
import { dueUrgency, type Urgency } from './time';
import type { Invoice, Payment, Task } from '../types';

export interface NextUpItem {
  key: string;
  type: 'task' | 'invoice';
  title: string;
  dueOn: string;
  urgency: Urgency;
  catchUp: boolean;
  amountCents: number | null;
}

// The nearest-due open tasks (top-level only) and unpaid invoices, merged and
// sorted by due date (ties: invoices first, then title). Items with no due date
// are left out - "next up" needs a date to be meaningful.
export function buildNextUp(
  tasks: readonly Task[],
  invoices: readonly Invoice[],
  payments: readonly Payment[],
  todayISO: string,
  limit = 5
): NextUpItem[] {
  const items: NextUpItem[] = [];

  for (const t of tasks) {
    if (t.status === 'done' || t.parent_task_id !== null || !t.due_on) continue;
    items.push({
      key: `task:${t.id}`,
      type: 'task',
      title: t.title,
      dueOn: t.due_on,
      urgency: dueUrgency(t.due_on, todayISO),
      catchUp: t.catch_up,
      amountCents: null,
    });
  }

  for (const inv of invoices) {
    if (!inv.due_on || invoiceStatus(inv, payments, todayISO) === 'paid') continue;
    items.push({
      key: `invoice:${inv.id}`,
      type: 'invoice',
      title: inv.vendor_name,
      dueOn: inv.due_on,
      urgency: dueUrgency(inv.due_on, todayISO),
      catchUp: false,
      amountCents: invoiceBalanceCents(inv, payments),
    });
  }

  items.sort((a, b) => {
    if (a.dueOn !== b.dueOn) return a.dueOn < b.dueOn ? -1 : 1;
    if (a.type !== b.type) return a.type === 'invoice' ? -1 : 1;
    return a.title.localeCompare(b.title);
  });
  return items.slice(0, limit);
}
