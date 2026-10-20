import type { Assignee, Role, Task } from '../types';
import { matchesAssigned } from './assignment';
import { addDaysISO, dueUrgency, toJhbDateISO, type Urgency } from './time';

export type TaskStatus = Task['status'];
export type TaskPriority = Task['priority'];
export type Recurrence = NonNullable<Task['recurrence']>;

export const isDone = (t: Pick<Task, 'status'>): boolean => t.status === 'done';

export function isOverdue(t: Pick<Task, 'status' | 'due_on'>, todayISO: string): boolean {
  return !isDone(t) && !!t.due_on && t.due_on < todayISO;
}

export function taskUrgency(t: Pick<Task, 'status' | 'due_on'>, todayISO: string): Urgency {
  return isDone(t) ? 'none' : dueUrgency(t.due_on, todayISO);
}

const PRIORITY_RANK: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };

// ---------------------------------------------------------------- filtering

export interface TaskFilter {
  search?: string;
  // Show only this assignee's tasks (jobs for "both" are included when `mineRole` is used instead).
  assignee?: Assignee | 'all';
  // "My tasks": what the signed-in person owns, plus anything assigned to both.
  mineRole?: Role;
  status?: TaskStatus | 'open' | 'all';
  category?: string;
  priority?: TaskPriority | 'all';
  catchUpOnly?: boolean;
  // 'all' (default), 'unassigned', or a user id: who it was delegated to (assigned_to).
  assignedTo?: string;
}

export function filterTasks(tasks: readonly Task[], f: TaskFilter): Task[] {
  const q = (f.search ?? '').trim().toLowerCase();
  return tasks.filter((t) => {
    if (f.mineRole && t.assignee !== f.mineRole && t.assignee !== 'both') return false;
    if (f.assignee && f.assignee !== 'all' && t.assignee !== f.assignee) return false;
    if (f.status === 'open' && isDone(t)) return false;
    if (f.status && f.status !== 'open' && f.status !== 'all' && t.status !== f.status) return false;
    if (f.category && f.category !== 'all' && (t.category ?? '') !== f.category) return false;
    if (f.priority && f.priority !== 'all' && t.priority !== f.priority) return false;
    if (f.catchUpOnly && !t.catch_up) return false;
    if (!matchesAssigned(t, f.assignedTo)) return false;
    if (q) {
      const hay = `${t.title} ${t.description ?? ''} ${t.category ?? ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

// ------------------------------------------------------------------ sorting

export type TaskSort = 'due' | 'priority' | 'manual';

export function sortTasks(tasks: readonly Task[], by: TaskSort): Task[] {
  const dueCompare = (a: Task, b: Task): number => {
    if (a.due_on && b.due_on) return a.due_on.localeCompare(b.due_on);
    if (a.due_on) return -1;
    if (b.due_on) return 1;
    return 0;
  };
  return [...tasks].sort((a, b) => {
    if (by === 'priority') {
      return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || dueCompare(a, b) || a.title.localeCompare(b.title);
    }
    if (by === 'manual') return a.sort_order - b.sort_order || a.title.localeCompare(b.title);
    return dueCompare(a, b) || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.sort_order - b.sort_order || a.title.localeCompare(b.title);
  });
}

// ----------------------------------------------------------------- grouping

export function groupByAssignee(tasks: readonly Task[]): Record<Assignee, Task[]> {
  const groups: Record<Assignee, Task[]> = { groom: [], bride: [], both: [] };
  for (const t of tasks) groups[t.assignee].push(t);
  return groups;
}

export function kanbanColumns(tasks: readonly Task[]): Record<TaskStatus, Task[]> {
  const cols: Record<TaskStatus, Task[]> = { todo: [], in_progress: [], done: [] };
  for (const t of tasks) cols[t.status].push(t);
  return cols;
}

export const topLevel = (tasks: readonly Task[]): Task[] => tasks.filter((t) => !t.parent_task_id);
export const subtasksOf = (parentId: string, tasks: readonly Task[]): Task[] =>
  tasks.filter((t) => t.parent_task_id === parentId);

export function subtaskProgress(parentId: string, tasks: readonly Task[]): { done: number; total: number } {
  const subs = subtasksOf(parentId, tasks);
  return { done: subs.filter(isDone).length, total: subs.length };
}

export function taskCategories(tasks: readonly Task[]): string[] {
  return [...new Set(tasks.map((t) => t.category).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b));
}

// ------------------------------------------------------------- recurrence

function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

// The next due date for a repeating task. Monthly keeps the day of the month,
// clamping to the end of shorter months (31 Jan -> 28 Feb, then 28 Mar).
export function nextDueDate(dueISO: string, recurrence: Recurrence): string {
  if (recurrence === 'daily') return addDaysISO(dueISO, 1);
  if (recurrence === 'weekly') return addDaysISO(dueISO, 7);
  const [y = '0', m = '1', d = '1'] = dueISO.split('-');
  let year = Number(y);
  let month = Number(m) + 1;
  if (month > 12) {
    month = 1;
    year += 1;
  }
  const day = Math.min(Number(d), daysInMonth(year, month));
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export interface RecurringDraft {
  title: string;
  description: string | null;
  assignee: Assignee;
  category: string | null;
  due_on: string;
  priority: TaskPriority;
  recurrence: Recurrence;
  parent_task_id: string | null;
  status: 'todo';
  catch_up: false;
}

export interface StatusChange {
  patch: {
    status: TaskStatus;
    completed_at: string | null;
    completed_by: string | null;
  };
  // A fresh copy of a repeating task when it is completed; null otherwise.
  next: RecurringDraft | null;
}

// What to write when a task's status changes. Completing stamps who/when and, for
// a repeating task, drafts the next occurrence (from the due date, or from today
// when it had none). Moving a task back out of "done" clears the stamp.
export function changeStatus(task: Task, status: TaskStatus, now: Date, userId: string | null): StatusChange {
  if (status !== 'done') {
    return { patch: { status, completed_at: null, completed_by: null }, next: null };
  }
  const patch = { status, completed_at: now.toISOString(), completed_by: userId };
  if (!task.recurrence || task.status === 'done') return { patch, next: null };
  const base = task.due_on ?? toJhbDateISO(now);
  return {
    patch,
    next: {
      title: task.title,
      description: task.description,
      assignee: task.assignee,
      category: task.category,
      due_on: nextDueDate(base, task.recurrence),
      priority: task.priority,
      recurrence: task.recurrence,
      parent_task_id: task.parent_task_id,
      status: 'todo',
      catch_up: false,
    },
  };
}
