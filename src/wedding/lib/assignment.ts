// Who a task is assigned to. This is separate from the groom/bride/both
// "assignee" ("whose job is it"), which is untouched: assigned_to is the person
// (couple member or helper) it was delegated to.
import type { Person, Task } from '../types';

export const NOBODY = '';
export const UNASSIGNED_FILTER = 'unassigned';

export function personLabel(p: Pick<Person, 'display_name' | 'kind'>): string {
  return p.kind === 'collaborator' ? `${p.display_name} (helper)` : p.display_name;
}

export function nameOf(people: readonly Person[], userId: string | null): string | null {
  if (!userId) return null;
  return people.find((p) => p.user_id === userId)?.display_name ?? null;
}

// Chip text for a task, or null when nobody is assigned. A person who has since
// left shows as "Former helper" rather than a raw id.
export function assignedChip(people: readonly Person[], task: Pick<Task, 'assigned_to'>): string | null {
  if (!task.assigned_to) return null;
  const n = nameOf(people, task.assigned_to);
  return n ? `Assigned to ${n}` : 'Assigned to a former helper';
}

export type AssignedFilter = 'all' | typeof UNASSIGNED_FILTER | string;

export function matchesAssigned(task: Pick<Task, 'assigned_to'>, f: AssignedFilter | undefined): boolean {
  if (!f || f === 'all') return true;
  if (f === UNASSIGNED_FILTER) return !task.assigned_to;
  return task.assigned_to === f;
}

// "For Ada" / "For both of the couple": who a helper's task is for, from the
// groom/bride/both field and the couple's names.
export function forLabel(people: readonly Person[], assignee: Task['assignee']): string {
  if (assignee === 'both') return 'For both of the couple';
  const p = people.find((x) => x.kind === 'partner' && x.role === assignee);
  return p ? `For ${p.display_name}` : `For the ${assignee}`;
}
