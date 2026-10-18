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
