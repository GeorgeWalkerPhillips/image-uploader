import { buildNextUp } from './nextUp';
import type { Invoice, Payment, Task } from '../types';

const task = (o: Partial<Task>): Task => ({
  id: 't', wedding_id: 'w', parent_task_id: null, title: 'T', description: null, assignee: 'both',
  category: null, due_on: '2026-11-01', priority: 'medium', status: 'todo', catch_up: false,
  recurrence: null, sort_order: 0, ...o,
});
const inv = (o: Partial<Invoice>): Invoice => ({
  id: 'i', wedding_id: 'w', vendor_id: null, vendor_name: 'Florist', invoice_number: null,
  total_cents: 1000, due_on: '2026-11-01', budget_line_id: null, quote_id: null,
  attachment_path: null, notes: null, ...o,
});
const pay = (o: Partial<Payment>): Payment => ({
  id: 'p', wedding_id: 'w', invoice_id: 'i', paid_on: '2026-10-01', amount_cents: 1000, method: 'eft',
  paid_by: 'joint', proof_path: null, notes: null, ...o,
});

describe('buildNextUp', () => {
  const today = '2026-10-18';

  it('skips done, subtasks, undated and fully paid invoices', () => {
    const items = buildNextUp(
      [task({ id: '1', status: 'done' }), task({ id: '2', parent_task_id: 'x' }), task({ id: '3', due_on: null }), task({ id: '4', title: 'Keep' })],
      [inv({ id: 'a' }), inv({ id: 'b', vendor_name: 'Paid' })],
      [pay({ invoice_id: 'b' })],
      today
    );
    expect(items.map((i) => i.key)).toEqual(['invoice:a', 'task:4']);
  });

  it('sorts by date, flags urgency, catch-up and balance', () => {
    const items = buildNextUp(
      [task({ id: '1', due_on: '2026-10-20', catch_up: true }), task({ id: '2', due_on: '2026-10-01' }), task({ id: '3', due_on: '2027-01-01' })],
      [inv({ id: 'a', due_on: '2026-10-19', total_cents: 5000 })],
      [pay({ invoice_id: 'a', amount_cents: 2000 })],
      today
    );
    expect(items.map((i) => i.key)).toEqual(['task:2', 'invoice:a', 'task:1', 'task:3']);
    expect(items.map((i) => i.urgency)).toEqual(['overdue', 'soon', 'soon', 'later']);
    expect(items[1].amountCents).toBe(3000);
    expect(items[2].catchUp).toBe(true);
  });

  it('limits to five', () => {
    const tasks = Array.from({ length: 8 }, (_, n) => task({ id: String(n), due_on: `2026-11-0${n + 1}` }));
    expect(buildNextUp(tasks, [], [], today)).toHaveLength(5);
  });
});
