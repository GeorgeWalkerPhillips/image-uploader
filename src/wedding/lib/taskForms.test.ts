import { emptyTaskForm, validateTask } from './taskForms';

describe('validateTask', () => {
  const base = { ...emptyTaskForm('bride'), title: ' Book makeup trial ' };
  it('builds a payload with nulls for blanks', () => {
    expect(validateTask(base)).toEqual({
      ok: true,
      value: { title: 'Book makeup trial', description: null, assignee: 'bride', category: null, due_on: null, priority: 'medium', status: 'todo', recurrence: null, parent_task_id: null },
    });
  });
  it('keeps due date, category, recurrence and parent', () => {
    const r = validateTask({ ...base, dueOn: '2026-11-01', category: ' Attire ', recurrence: 'monthly', parentTaskId: 'p1', description: ' note ' });
    expect(r.ok && r.value).toMatchObject({ due_on: '2026-11-01', category: 'Attire', recurrence: 'monthly', parent_task_id: 'p1', description: 'note' });
  });
  it('requires a title and rejects bad dates', () => {
    const r = validateTask({ ...emptyTaskForm(), dueOn: '2026-02-30' });
    expect(!r.ok && Object.keys(r.errors).sort()).toEqual(['dueOn', 'title']);
  });
  it('needs a due date for a repeating task', () => {
    const r = validateTask({ ...base, recurrence: 'weekly' });
    expect(!r.ok && r.errors.dueOn).toMatch(/Repeating/);
  });
  it('limits title and category length', () => {
    const r = validateTask({ ...base, title: 'x'.repeat(161), category: 'y'.repeat(61) });
    expect(!r.ok && Object.keys(r.errors).sort()).toEqual(['category', 'title']);
  });
});
