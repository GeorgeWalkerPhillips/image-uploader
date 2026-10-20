import { useState } from 'react';
import type { FormEvent } from 'react';
import { ASSIGNEES, emptyTaskForm, PRIORITIES, RECURRENCES, STATUSES, validateTask } from '../lib/taskForms';
import type { TaskFormValues, TaskPayload } from '../lib/taskForms';
import type { FieldErrors } from '../lib/validators';
import { NOBODY, personLabel } from '../lib/assignment';
import type { Assignee, Person, Task } from '../types';
import { CheckboxField, SelectField, TextAreaField, TextField } from './fields';
import styles from '../wedding.module.css';

export const PRIORITY_LABELS: Record<Task['priority'], string> = { low: 'Low', medium: 'Medium', high: 'High' };
export const STATUS_LABELS: Record<Task['status'], string> = { todo: 'To do', in_progress: 'In progress', done: 'Done' };
export const RECURRENCE_LABELS: Record<NonNullable<Task['recurrence']>, string> = {
  daily: 'Every day', weekly: 'Every week', monthly: 'Every month',
};

interface Props {
  initial?: Task;
  assigneeLabels: Record<Assignee, string>;
  categories: readonly string[];
  // The couple and helpers; the "Assign to" field is shown only when this has people.
  people?: readonly Person[];
  saving?: boolean;
  onSubmit: (payload: TaskPayload, catchUp: boolean) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

export function TaskForm({ initial, assigneeLabels, categories, people, saving = false, onSubmit, onCancel, onDelete }: Props) {
  const [v, setV] = useState<TaskFormValues>(() =>
    initial
      ? {
          title: initial.title,
          description: initial.description ?? '',
          assignee: initial.assignee,
          category: initial.category ?? '',
          dueOn: initial.due_on ?? '',
          priority: initial.priority,
          status: initial.status,
          recurrence: initial.recurrence ?? '',
          parentTaskId: initial.parent_task_id ?? '',
        }
      : emptyTaskForm()
  );
  const [catchUp, setCatchUp] = useState(initial?.catch_up ?? false);
  const [assignedTo, setAssignedTo] = useState(initial?.assigned_to ?? NOBODY);
  const canAssign = !!people && people.length > 0;
  const knownPerson = !assignedTo || (people ?? []).some((p) => p.user_id === assignedTo);
  const [errors, setErrors] = useState<FieldErrors>({});
  const set = <K extends keyof TaskFormValues>(key: K) => (value: TaskFormValues[K]) =>
    setV((p) => ({ ...p, [key]: value }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const r = validateTask(v);
    if (!r.ok) {
      setErrors(r.errors);
      return;
    }
    setErrors({});
    onSubmit(canAssign ? { ...r.value, assigned_to: knownPerson ? assignedTo || null : null } : r.value, catchUp);
  };

  return (
    <form className={styles.card} onSubmit={submit} noValidate aria-label={initial ? 'Edit task' : 'Add task'}>
      <h2 className={styles.h2}>{initial ? 'Edit task' : 'New task'}</h2>
      <TextField label="Title" value={v.title} maxLength={160} error={errors.title} onChange={set('title')} />
      <TextAreaField label="Description" value={v.description} onChange={set('description')} />
      <div className={styles.twoCol}>
        <SelectField label="For" value={v.assignee} error={errors.assignee} onChange={(x) => set('assignee')(x as Assignee)}>
          {ASSIGNEES.map((a) => <option key={a} value={a}>{assigneeLabels[a]}</option>)}
        </SelectField>
        <SelectField label="Priority" value={v.priority} error={errors.priority}
          onChange={(x) => set('priority')(x as Task['priority'])}>
          {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
        </SelectField>
      </div>
      {canAssign && (
        <SelectField label="Assign to" value={assignedTo} onChange={setAssignedTo}>
          <option value={NOBODY}>Nobody in particular</option>
          {(people ?? []).map((p) => <option key={p.user_id} value={p.user_id}>{personLabel(p)}</option>)}
          {!knownPerson && <option value={assignedTo}>Former helper (unassigned on save)</option>}
        </SelectField>
      )}
      <TextField label="Category (optional)" value={v.category} maxLength={60} error={errors.category}
        list="task-categories" onChange={set('category')} />
      <datalist id="task-categories">
        {categories.map((c) => <option key={c} value={c} />)}
      </datalist>
      <div className={styles.twoCol}>
        <TextField label="Due date" type="date" value={v.dueOn} error={errors.dueOn} onChange={set('dueOn')} />
        <SelectField label="Status" value={v.status} error={errors.status} onChange={(x) => set('status')(x as Task['status'])}>
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </SelectField>
      </div>
      {!initial?.parent_task_id && (
        <SelectField label="Repeats" value={v.recurrence}
          onChange={(x) => set('recurrence')(x as TaskFormValues['recurrence'])}>
          <option value="">Does not repeat</option>
          {RECURRENCES.map((r) => <option key={r} value={r}>{RECURRENCE_LABELS[r]}</option>)}
        </SelectField>
      )}
      <CheckboxField label="Catch up (we are behind on this)" checked={catchUp} onChange={setCatchUp} />
      <div className={styles.actions}>
        <button type="submit" className={styles.btnPrimary} disabled={saving}>
          {saving ? 'Saving...' : 'Save task'}
        </button>
        <button type="button" className={styles.btn} onClick={onCancel} disabled={saving}>Cancel</button>
        {onDelete && (
          <button type="button" className={styles.btnDanger} onClick={onDelete} disabled={saving}>Delete</button>
        )}
      </div>
    </form>
  );
}
