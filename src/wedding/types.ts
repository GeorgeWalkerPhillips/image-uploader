export type Role = 'groom' | 'bride';
export type Assignee = Role | 'both';
export type Payer = Role | 'joint';
export type Scope = 'wedding' | 'honeymoon';

export interface Wedding {
  id: string;
  name: string;
  wedding_date: string;
  venue: string | null;
  guest_count: number | null;
  budget_cents: number;
  honeymoon_budget_cents: number;
  honeymoon_start: string | null;
  honeymoon_days: number | null;
  fx_thb_per_zar: number | null;
  currency: string;
  timezone: string;
  // Set by the database on every edit of the wedding row (not just the rate).
  updated_at?: string;
}

export interface Member {
  role: Role;
  display_name: string;
  wedding: Wedding;
}

export interface Category {
  id: string;
  wedding_id: string;
  scope: Scope;
  name: string;
  color: string | null;
  sort_order: number;
}

export interface BudgetLine {
  id: string;
  wedding_id: string;
  category_id: string;
  name: string;
  vendor_id: string | null;
  estimated_cents: number;
  quoted_cents: number | null;
  final_cents: number | null;
  notes: string | null;
  sort_order: number;
}

export interface Invoice {
  id: string;
  wedding_id: string;
  vendor_id: string | null;
  vendor_name: string;
  invoice_number: string | null;
  total_cents: number;
  due_on: string | null;
  budget_line_id: string | null;
  quote_id: string | null;
  attachment_path: string | null;
  notes: string | null;
}

export interface Payment {
  id: string;
  wedding_id: string;
  invoice_id: string;
  paid_on: string;
  amount_cents: number;
  method: 'eft' | 'card' | 'cash' | 'payshap';
  paid_by: Payer;
  proof_path: string | null;
  notes: string | null;
}

export interface Saving {
  id: string;
  wedding_id: string;
  contributed_on: string;
  amount_cents: number;
  paid_by: Payer;
  note: string | null;
}

export interface Task {
  id: string;
  wedding_id: string;
  parent_task_id: string | null;
  title: string;
  description: string | null;
  assignee: Assignee;
  category: string | null;
  due_on: string | null;
  priority: 'low' | 'medium' | 'high';
  status: 'todo' | 'in_progress' | 'done';
  catch_up: boolean;
  recurrence: 'daily' | 'weekly' | 'monthly' | null;
  sort_order: number;
}

export type TargetKind = 'amount' | 'date';
export type TargetScope = 'wedding' | 'honeymoon' | 'savings' | 'general';
export type TargetMetric =
  | 'manual'
  | 'paid_total'
  | 'committed_total'
  | 'savings_total'
  | 'honeymoon_paid_total'
  | 'honeymoon_committed_total'
  | 'category_paid'
  | 'category_committed';

export interface Target {
  id: string;
  wedding_id: string;
  title: string;
  kind: TargetKind;
  scope: TargetScope;
  metric: TargetMetric;
  category_id: string | null;
  target_cents: number | null;
  current_cents: number;
  target_at: string | null;
  notes: string | null;
  sort_order: number;
  archived: boolean;
}

// ---- Phase 2: quotes, vendors ------------------------------------------

export type QuoteStatus = 'requested' | 'received' | 'shortlisted' | 'accepted' | 'declined';

export interface Vendor {
  id: string;
  wedding_id: string;
  name: string;
  category_id: string | null;
  phone: string | null;
  email: string | null;
  whatsapp: string | null;
  website: string | null;
  notes: string | null;
}

export interface Quote {
  id: string;
  wedding_id: string;
  vendor_id: string | null;
  vendor_name: string;
  category_id: string | null;
  budget_line_id: string | null;
  amount_cents: number;
  received_on: string | null;
  valid_until: string | null;
  status: QuoteStatus;
  notes: string | null;
  attachment_path: string | null;
  created_at: string;
}

export type PaymentMethod = 'eft' | 'card' | 'cash' | 'payshap';

// ---- Phase 4: honeymoon and purchases ----------------------------------

export interface PurchaseItem {
  id: string;
  wedding_id: string;
  name: string;
  category: string | null;
  quantity: number;
  needed_by: string | null;
  // Total price for the line (all units), in cents.
  price_cents: number;
  bought: boolean;
  bought_by: Payer | null;
  bought_at_store: string | null;
  bought_on: string | null;
  receipt_path: string | null;
  notes: string | null;
}

export interface ItineraryDay {
  id: string;
  wedding_id: string;
  day_number: number;
  on_date: string | null;
  city: string | null;
  accommodation: string | null;
  activities: string | null;
  transport: string | null;
  booking_reference: string | null;
  cost_cents: number;
  notes: string | null;
}

export type BookingKind = 'flight' | 'accommodation' | 'transport' | 'activity' | 'insurance' | 'other';

export interface Booking {
  id: string;
  wedding_id: string;
  kind: BookingKind;
  name: string;
  confirmation_number: string | null;
  starts_on: string | null;
  ends_on: string | null;
  cost_cents: number;
  attachment_path: string | null;
  notes: string | null;
}

export interface PackingItem {
  id: string;
  wedding_id: string;
  name: string;
  category: string | null;
  packed: boolean;
}

export type TravelDocStatus = 'not_started' | 'applied' | 'collected';

export interface TravelDoc {
  id: string;
  wedding_id: string;
  title: string;
  person: Assignee;
  status: TravelDocStatus;
  due_on: string | null;
  notes: string | null;
}

// ---- Extras: guests and activity ---------------------------------------

export type GuestSide = Role | 'both';
export type Rsvp = 'pending' | 'yes' | 'no' | 'maybe';

export interface Guest {
  id: string;
  wedding_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  side: GuestSide;
  rsvp_status: Rsvp;
  party_size: number;
  dietary_notes: string | null;
  table_label: string | null;
  notes: string | null;
}

export interface ActivityEntry {
  id: string;
  wedding_id: string;
  actor_id: string;
  actor_name: string;
  action: string;
  subject: string | null;
  created_at: string;
}

// One member's email reminder preferences (primary key wedding_id + user_id).
export interface ReminderSettingsRow {
  wedding_id: string;
  user_id: string;
  enabled: boolean;
  lead_days: number[];
  include_events: boolean;
  include_tasks: boolean;
  include_payments: boolean;
}
