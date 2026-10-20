import { assignedChip, forLabel, matchesAssigned, nameOf, personLabel, UNASSIGNED_FILTER } from './assignment';
import { filterTasks } from './tasks';
import type { Person, Task } from '../types';

const people: Person[] = [
  { user_id: 'u-ada', display_name: 'Ada', kind: 'partner', role: 'groom' },
  { user_id: 'u-bea', display_name: 'Bea', kind: 'partner', role: 'bride' },
  { user_id: 'u-sam', display_name: 'Sam', kind: 'collaborator', role: null },
];
const task = (id: string, assigned_to?: string | null): Task => ({
  id, wedding_id: 'w', parent_task_id: null, title: id, description: null, assignee: 'both', category: null,
  due_on: null, priority: 'medium', status: 'todo', catch_up: false, recurrence: null, sort_order: 1, assigned_to,
});

describe('labels', () => {
  it('marks helpers and finds names', () => {
    expect(personLabel(people[0] as Person)).toBe('Ada');
    expect(personLabel(people[2] as Person)).toBe('Sam (helper)');
    expect(nameOf(people, 'u-sam')).toBe('Sam');
    expect(nameOf(people, null)).toBeNull();
  });
  it('builds the chip, with a safe label for someone who has left', () => {
    expect(assignedChip(people, task('a', 'u-sam'))).toBe('Assigned to Sam');
    expect(assignedChip(people, task('a', 'u-gone'))).toBe('Assigned to a former helper');
    expect(assignedChip(people, task('a', null))).toBeNull();
    expect(assignedChip(people, task('a'))).toBeNull();
  });
  it('says who a helper\'s task is for', () => {
    expect(forLabel(people, 'groom')).toBe('For Ada');
    expect(forLabel(people, 'bride')).toBe('For Bea');
    expect(forLabel(people, 'both')).toBe('For both of the couple');
    expect(forLabel([], 'bride')).toBe('For the bride');
  });
});

describe('filtering by assigned_to', () => {
  const all = [task('a', 'u-sam'), task('b', 'u-ada'), task('c', null), task('d')];
  it('matches all / unassigned / a person', () => {
    expect(all.filter((t) => matchesAssigned(t, undefined))).toHaveLength(4);
    expect(all.filter((t) => matchesAssigned(t, 'all'))).toHaveLength(4);
    expect(all.filter((t) => matchesAssigned(t, UNASSIGNED_FILTER)).map((t) => t.id)).toEqual(['c', 'd']);
    expect(all.filter((t) => matchesAssigned(t, 'u-sam')).map((t) => t.id)).toEqual(['a']);
  });
  it('filterTasks combines it with the existing filters and leaves them untouched', () => {
    expect(filterTasks(all, { assignedTo: 'u-ada' }).map((t) => t.id)).toEqual(['b']);
    expect(filterTasks(all, { assignedTo: 'u-ada', search: 'zzz' })).toHaveLength(0);
    expect(filterTasks(all, {})).toHaveLength(4);
    expect(filterTasks(all, { mineRole: 'groom' })).toHaveLength(4); // groom/bride/both semantics unchanged
  });
});
