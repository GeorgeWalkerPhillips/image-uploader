import { isISODate } from './moneyForms';
import type { FieldErrors, Validated } from './validators';
import type { Assignee, Task } from '../types';

export const ASSIGNEES: readonly Assignee[] = ['groom', 'bride', 'both'];
export const PRIORITIES: readonly Task['priority'][] = ['low', 'medium', 'high'];
export const STATUSES: readonly Task['status'][] = ['todo', 'in_progress', 'done'];
export const RECURRENCES = ['daily', 'weekly', 'monthly'] as const;

export interface TaskFormValues {
  title: string;
  description: string;
  assignee: Assignee;
  category: string;
  dueOn: string;
  priority: Task['priority'];
  status: Task['status'];
  recurrence: '' | (typeof RECURRENCES)[number];
  parentTaskId: string;
}

export interface TaskPayload {
  title: string;
  description: string | null;
  assignee: Assignee;
  category: string | null;
  due_on: string | null;
  priority: Task['priority'];
  status: Task['status'];
  recurrence: Task['recurrence'];
  parent_task_id: string | null;
  // Set by the form only when the team list is loaded; otherwise left out so a save never clears it.
  assigned_to?: string | null;
}

export const emptyTaskForm = (assignee: Assignee = 'both'): TaskFormValues => ({
  title: '', description: '', assignee, category: '', dueOn: '', priority: 'medium', status: 'todo',
  recurrence: '', parentTaskId: '',
});

const trimOrNull = (s: string): string | null => (s.trim() === '' ? null : s.trim());

// Mirrors the wedding_tasks CHECK constraints so people see a friendly message.
export function validateTask(v: TaskFormValues): Validated<TaskPayload> {
  const errors: FieldErrors = {};
  const title = v.title.trim();
  if (!title) errors.title = 'Give the task a title.';
  else if (title.length > 160) errors.title = 'Keep the title under 160 characters.';
  if (!ASSIGNEES.includes(v.assignee)) errors.assignee = 'Choose who it is for.';
  if (!PRIORITIES.includes(v.priority)) errors.priority = 'Choose a priority.';
  if (!STATUSES.includes(v.status)) errors.status = 'Choose a status.';
  let due: string | null = null;
  if (v.dueOn.trim() !== '') {
    if (!isISODate(v.dueOn.trim())) errors.dueOn = 'Choose a valid date.';
    else due = v.dueOn.trim();
  }
  // A repeating task needs a date to repeat from.
  if (v.recurrence !== '' && !due) errors.dueOn = 'Repeating tasks need a due date.';
  if (v.category.trim().length > 60) errors.category = 'Keep the category under 60 characters.';
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      title,
      description: trimOrNull(v.description),
      assignee: v.assignee,
      category: trimOrNull(v.category),
      due_on: due,
      priority: v.priority,
      status: v.status,
      recurrence: v.recurrence === '' ? null : v.recurrence,
      parent_task_id: v.parentTaskId || null,
    },
  };
}
