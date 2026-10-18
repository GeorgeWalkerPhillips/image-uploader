import type { Task } from '../types';
import {
  changeStatus, filterTasks, groupByAssignee, isOverdue, kanbanColumns, nextDueDate, sortTasks,
  subtaskProgress, taskCategories, taskUrgency, topLevel,
} from './tasks';

const task = (id: string, over: Partial<Task> = {}): Task => ({
  id, wedding_id: 'w', parent_task_id: null, title: id, description: null, assignee: 'both', category: null,
  due_on: null, priority: 'medium', status: 'todo', catch_up: false, recurrence: null, sort_order: 0, ...over,
});

describe('urgency', () => {
  it('flags overdue only for open tasks', () => {
    expect(isOverdue(task('a', { due_on: '2026-10-17' }), '2026-10-18')).toBe(true);
    expect(isOverdue(task('a', { due_on: '2026-10-17', status: 'done' }), '2026-10-18')).toBe(false);
    expect(isOverdue(task('a', { due_on: '2026-10-18' }), '2026-10-18')).toBe(false);
    expect(isOverdue(task('a'), '2026-10-18')).toBe(false);
  });
  it('is never urgent once done', () => {
    expect(taskUrgency(task('a', { due_on: '2026-10-19', status: 'done' }), '2026-10-18')).toBe('none');
    expect(taskUrgency(task('a', { due_on: '2026-10-19' }), '2026-10-18')).toBe('soon');
  });
});

describe('filterTasks', () => {
  const tasks = [
    task('groom job', { assignee: 'groom', category: 'Attire' }),
    task('bride job', { assignee: 'bride', category: 'Decor', priority: 'high' }),
    task('joint job', { assignee: 'both', category: 'Decor', status: 'done', catch_up: true, description: 'Pick flowers' }),
  ];
  it('"my tasks" includes what is assigned to both, and excludes the partner\'s', () => {
    expect(filterTasks(tasks, { mineRole: 'groom' }).map((t) => t.id)).toEqual(['groom job', 'joint job']);
    expect(filterTasks(tasks, { mineRole: 'bride' }).map((t) => t.id)).toEqual(['bride job', 'joint job']);
  });
  it('filters by assignee, status, category, priority and catch-up', () => {
    expect(filterTasks(tasks, { assignee: 'bride' }).map((t) => t.id)).toEqual(['bride job']);
    expect(filterTasks(tasks, { status: 'open' }).map((t) => t.id)).toEqual(['groom job', 'bride job']);
    expect(filterTasks(tasks, { status: 'done' }).map((t) => t.id)).toEqual(['joint job']);
    expect(filterTasks(tasks, { category: 'Decor' }).length).toBe(2);
    expect(filterTasks(tasks, { priority: 'high' }).map((t) => t.id)).toEqual(['bride job']);
    expect(filterTasks(tasks, { catchUpOnly: true }).map((t) => t.id)).toEqual(['joint job']);
  });
  it('searches title, description and category case-insensitively', () => {
    expect(filterTasks(tasks, { search: 'FLOWERS' }).map((t) => t.id)).toEqual(['joint job']);
    expect(filterTasks(tasks, { search: 'attire' }).map((t) => t.id)).toEqual(['groom job']);
    expect(filterTasks(tasks, { search: 'nothing' })).toEqual([]);
  });
});

describe('sortTasks', () => {
  const tasks = [
    task('undated'),
    task('late', { due_on: '2026-12-01' }),
    task('soon-low', { due_on: '2026-10-20', priority: 'low' }),
    task('soon-high', { due_on: '2026-10-20', priority: 'high' }),
  ];
  it('sorts by due date (undated last), then priority', () => {
    expect(sortTasks(tasks, 'due').map((t) => t.id)).toEqual(['soon-high', 'soon-low', 'late', 'undated']);
  });
  it('sorts by priority first, then due date (undated last within a priority)', () => {
    expect(sortTasks(tasks, 'priority').map((t) => t.id)).toEqual(['soon-high', 'late', 'undated', 'soon-low']);
  });
  it('keeps the manual order when asked', () => {
    const manual = [task('b', { sort_order: 2 }), task('a', { sort_order: 1 })];
    expect(sortTasks(manual, 'manual').map((t) => t.id)).toEqual(['a', 'b']);
  });
  it('does not mutate its input', () => {
    const copy = [...tasks];
    sortTasks(tasks, 'due');
    expect(tasks).toEqual(copy);
  });
});

describe('grouping, subtasks, categories', () => {
  const parent = task('p');
  const tasks = [parent, task('s1', { parent_task_id: 'p', status: 'done' }), task('s2', { parent_task_id: 'p' }), task('g', { assignee: 'groom', status: 'in_progress', category: 'A' }), task('h', { category: 'B' }), task('i', { category: 'A' })];
  it('groups by assignee and into kanban columns', () => {
    expect(groupByAssignee(tasks).groom.map((t) => t.id)).toEqual(['g']);
    expect(groupByAssignee(tasks).both.length).toBe(5);
    expect(kanbanColumns(tasks).in_progress.map((t) => t.id)).toEqual(['g']);
    expect(kanbanColumns(tasks).done.map((t) => t.id)).toEqual(['s1']);
  });
  it('separates top-level tasks and reports subtask progress', () => {
    expect(topLevel(tasks).map((t) => t.id)).toEqual(['p', 'g', 'h', 'i']);
    expect(subtaskProgress('p', tasks)).toEqual({ done: 1, total: 2 });
    expect(subtaskProgress('g', tasks)).toEqual({ done: 0, total: 0 });
  });
  it('lists distinct categories alphabetically', () => {
    expect(taskCategories(tasks)).toEqual(['A', 'B']);
  });
});

describe('nextDueDate', () => {
  it('moves daily and weekly by whole days across month/year ends', () => {
    expect(nextDueDate('2026-12-31', 'daily')).toBe('2027-01-01');
    expect(nextDueDate('2027-02-25', 'weekly')).toBe('2027-03-04');
  });
  it('keeps the day of month for monthly, clamping short months', () => {
    expect(nextDueDate('2026-12-15', 'monthly')).toBe('2027-01-15');
    expect(nextDueDate('2027-01-31', 'monthly')).toBe('2027-02-28');
    expect(nextDueDate('2028-01-31', 'monthly')).toBe('2028-02-29');
    expect(nextDueDate('2027-11-30', 'monthly')).toBe('2027-12-30');
  });
});

describe('changeStatus', () => {
  const now = new Date('2026-10-18T10:00:00Z');
  it('stamps who and when on completion', () => {
    expect(changeStatus(task('a'), 'done', now, 'u1')).toEqual({
      patch: { status: 'done', completed_at: '2026-10-18T10:00:00.000Z', completed_by: 'u1' },
      next: null,
    });
  });
  it('drafts the next occurrence when a repeating task is completed', () => {
    const r = changeStatus(task('a', { recurrence: 'weekly', due_on: '2026-10-20', title: 'Pay deposit', category: 'Money', assignee: 'bride', priority: 'high', catch_up: true }), 'done', now, 'u1');
    expect(r.next).toEqual({
      title: 'Pay deposit', description: null, assignee: 'bride', category: 'Money', due_on: '2026-10-27', priority: 'high',
      recurrence: 'weekly', parent_task_id: null, status: 'todo', catch_up: false,
    });
  });
  it('repeats from today when a repeating task had no due date', () => {
    expect(changeStatus(task('a', { recurrence: 'weekly' }), 'done', now, null).next?.due_on).toBe('2026-10-25');
  });
  it('does not draft another copy if the task was already done', () => {
    expect(changeStatus(task('a', { recurrence: 'daily', due_on: '2026-10-20', status: 'done' }), 'done', now, 'u1').next).toBeNull();
  });
  it('clears the completion stamp when moved out of done', () => {
    expect(changeStatus(task('a', { status: 'done' }), 'in_progress', now, 'u1')).toEqual({
      patch: { status: 'in_progress', completed_at: null, completed_by: null }, next: null,
    });
  });
});
