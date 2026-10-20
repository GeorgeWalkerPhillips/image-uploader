// The sort order each table is fetched with. One list for the screens' hooks
// and for "Save for offline", so both fill the SAME query cache entry with the
// SAME shape of data (the query key does not include the order).
import type { OrderBy, WeddingTable } from '../api';

export const ROW_ORDER: Record<WeddingTable, OrderBy | undefined> = {
  wedding_categories: { column: 'sort_order' },
  wedding_budget_lines: undefined,
  wedding_quotes: { column: 'created_at', ascending: false },
  wedding_vendors: { column: 'name' },
  wedding_invoices: { column: 'due_on' },
  wedding_payments: undefined,
  wedding_savings: undefined,
  wedding_targets: { column: 'sort_order' },
  wedding_tasks: { column: 'due_on' },
  wedding_events: { column: 'starts_at' },
  wedding_itinerary_days: { column: 'day_number' },
  wedding_purchase_items: { column: 'created_at' },
  wedding_bookings: { column: 'starts_on' },
  wedding_packing_items: { column: 'created_at' },
  wedding_travel_docs: { column: 'created_at' },
  wedding_guests: { column: 'name' },
  // The feed is capped; keep in step with ACTIVITY_PAGE in extrasHooks.ts.
  wedding_activity: { column: 'created_at', ascending: false, limit: 20 },
};
