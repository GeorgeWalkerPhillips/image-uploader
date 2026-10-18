import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useWedding } from '../WeddingContext';
import { useDeleteRow, usePayerLabels, useSaveRow, useTasks } from '../hooks';
import { useAuthUser } from '../useAuthUser';
import { notify } from '../notify';
import { useLogActivity } from '../extrasHooks';
import { Skeleton } from '../components/Skeleton';
import { ErrorRetry } from '../components/ErrorRetry';
import { useNow } from '../components/useNow';
import { TaskCard } from '../components/TaskCard';
import { PRIORITY_LABELS, RECURRENCE_LABELS, STATUS_LABELS, TaskForm } from '../components/TaskForm';
import { SubtaskPanel } from '../components/SubtaskPanel';
import {
  changeStatus, filterTasks, groupByAssignee, isDone, kanbanColumns, sortTasks, subtaskProgress, subtasksOf,
  taskCategories, taskUrgency, topLevel,
} from '../lib/tasks';
import type { RecurringDraft, TaskFilter, TaskSort } from '../lib/tasks';
import { ASSIGNEES, emptyTaskForm, PRIORITIES, STATUSES, validateTask } from '../lib/taskForms';
import type { TaskPayload } from '../lib/taskForms';
import { formatDateJhb, todayJhbISO } from '../lib/time';
import type { Assignee, Task } from '../types';
import styles from '../wedding.module.css';

type View = 'list' | 'board';
type StatusFilter = 'open' | 'all' | 'done';
type Editing = { mode: 'closed' } | { mode: 'new' } | { mode: 'edit'; task: Task };

export function TasksPage() {
  const { wedding, member } = useWedding();
  const { user } = useAuthUser();
  const tasksQuery = useTasks(wedding.id);
  const labels = usePayerLabels();
  // Both writes of a completion report through one toast, so the default error toast is off.
  const saveTask = useSaveRow<Task>('wedding_tasks', wedding.id, [], { silent: true });
  const deleteTask = useDeleteRow('wedding_tasks', wedding.id);
  const logActivity = useLogActivity();
  const [params, setParams] = useSearchParams();

  const [view, setView] = useState<View>('list');
  const [mine, setMine] = useState(false);
  const [catchUpOnly, setCatchUpOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [priority, setPriority] = useState('all');
  const [status, setStatus] = useState<StatusFilter>('open');
  const [sort, setSort] = useState<TaskSort>('due');
  const [editing, setEditing] = useState<Editing>({ mode: 'closed' });
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [quickTitle, setQuickTitle] = useState('');
  const [quickAssignee, setQuickAssignee] = useState<Assignee>('both');
  const [quickError, setQuickError] = useState('');

  const today = todayJhbISO(useNow(60000));
  const all = useMemo(() => tasksQuery.data ?? [], [tasksQuery.data]);
  const tops = useMemo(() => topLevel(all), [all]);
  const categories = useMemo(() => taskCategories(tops), [tops]);
  const assigneeLabels: Record<Assignee, string> = {
    groom: labels.groom, bride: labels.bride, both: 'Both of us',
  };

  const selectedId = params.get('task');
  const selectedRow = all.find((t) => t.id === selectedId) ?? null;
  // A subtask link (e.g. from the calendar) opens its parent task.
  const selected = selectedRow?.parent_task_id
    ? tops.find((t) => t.id === selectedRow.parent_task_id) ?? null
    : selectedRow;
  const openTask = (id: string | null) => {
    setEditing({ mode: 'closed' });
    setParams(id ? { task: id } : {});
  };

  const filtered = useMemo(() => {
    const f: TaskFilter = {
      search: query,
      category,
      priority: priority as TaskFilter['priority'],
      // The board's columns are the statuses, so its status filter is "all".
      status: view === 'board' ? 'all' : status,
      catchUpOnly,
      ...(mine ? { mineRole: member.role } : {}),
    };
    return sortTasks(filterTasks(tops, f), sort);
  }, [tops, query, category, priority, status, catchUpOnly, mine, member.role, sort, view]);

  const filtersActive = query.trim() !== '' || category !== 'all' || priority !== 'all' || status !== 'open' || catchUpOnly || mine;
  const clearFilters = () => {
    setQuery(''); setCategory('all'); setPriority('all'); setStatus('open'); setCatchUpOnly(false); setMine(false);
  };

  // Writes a task change and then, for a repeating task being completed, the next
  // occurrence - in that order, stopping at the first failure with one honest message.
  const persist = async (
    id: string | undefined, values: Record<string, unknown>, next: RecurringDraft | null, title: string, okMessage: string
  ): Promise<boolean> => {
    try {
      await saveTask.mutateAsync({ id, values });
    } catch {
      notify.error(`Could not save "${title}". Nothing was changed.`);
      return false;
    }
    if (next) {
      try {
        await saveTask.mutateAsync({ values: { ...next } });
      } catch {
        notify.error(`"${title}" is saved as done, but its next repeat could not be created. Add it again by hand.`);
        return false;
      }
      notify.success(`${okMessage} Next repeat added for ${formatDateJhb(next.due_on, { day: 'numeric', month: 'short' })}.`);
      return true;
    }
    notify.success(okMessage);
    return true;
  };

  const moveTask = async (task: Task, to: Task['status']) => {
    if (task.status === to) return;
    const change = changeStatus(task, to, new Date(), user?.id ?? null);
    setBusyId(task.id);
    const ok = await persist(task.id, change.patch, change.next, task.title, to === 'done' ? 'Task done.' : 'Task updated.');
    if (ok && to === 'done') logActivity('Completed a task', task.title);
    setBusyId(null);
  };
  const toggleTask = (task: Task) => void moveTask(task, isDone(task) ? 'todo' : 'done');

  const submitTask = async (payload: TaskPayload, catchUp: boolean) => {
    const existing = editing.mode === 'edit' ? editing.task : null;
    const now = new Date();
    let values: Record<string, unknown> = { ...payload, catch_up: catchUp };
    let next: RecurringDraft | null = null;
    if (existing && payload.status !== existing.status) {
      const change = changeStatus({ ...existing, ...payload, status: existing.status }, payload.status, now, user?.id ?? null);
      values = { ...values, ...change.patch };
      next = change.next;
    } else if (!existing && payload.status === 'done') {
      values = { ...values, completed_at: now.toISOString(), completed_by: user?.id ?? null };
    }
    setSaving(true);
    const ok = await persist(existing?.id, values, next, payload.title, 'Task saved.');
    setSaving(false);
    if (ok) setEditing({ mode: 'closed' });
  };

  const quickAdd = async (e: FormEvent) => {
    e.preventDefault();
    const r = validateTask({ ...emptyTaskForm(quickAssignee), title: quickTitle });
    if (!r.ok) {
      setQuickError(r.errors.title ?? 'Give the task a title.');
      return;
    }
    setQuickError('');
    setSaving(true);
    const ok = await persist(undefined, { ...r.value, catch_up: false }, null, r.value.title, 'Task added.');
    setSaving(false);
    if (ok) setQuickTitle('');
  };

  const removeTask = (task: Task) => {
    const n = subtasksOf(task.id, all).length;
    const msg = `Delete "${task.title}"` + (n ? ` and its ${n} subtask${n === 1 ? '' : 's'}` : '') + '? This cannot be undone.';
    if (!window.confirm(msg)) return;
    deleteTask.mutate(task.id, {
      onSuccess: () => {
        notify.success('Task deleted');
        setEditing({ mode: 'closed' });
        if (selectedId === task.id) openTask(null);
      },
    });
  };

  const addSubtask = async (parent: Task, title: string): Promise<boolean> => {
    const subs = subtasksOf(parent.id, all);
    const values = {
      title, parent_task_id: parent.id, assignee: parent.assignee, priority: 'medium', status: 'todo',
      sort_order: subs.length + 1, catch_up: false,
    };
    return persist(undefined, values, null, title, 'Subtask added.');
  };
  const renameSubtask = (sub: Task, title: string) => persist(sub.id, { title }, null, title, 'Subtask saved.');
  const removeSubtask = (sub: Task) => {
    if (!window.confirm(`Delete the subtask "${sub.title}"?`)) return;
    deleteTask.mutate(sub.id, { onSuccess: () => notify.success('Subtask deleted') });
  };

  if (tasksQuery.isLoading) {
    return <><Skeleton height={56} /><Skeleton height={120} /><Skeleton height={120} /></>;
  }
  if (tasksQuery.isError && tasksQuery.data === undefined) {
    return (
      <div className={styles.card}>
        <ErrorRetry message="Could not load tasks." onRetry={() => void tasksQuery.refetch()} />
      </div>
    );
  }

  // ------------------------------------------------------------ detail view
  if (selectedId) {
    if (!selected) {
      return (
        <div className={styles.card}>
          <p className={styles.muted}>That task no longer exists.</p>
          <button type="button" className={styles.btn} onClick={() => openTask(null)}>Back to tasks</button>
        </div>
      );
    }
    const subs = sortTasks(subtasksOf(selected.id, all), 'manual');
    const urgency = taskUrgency(selected, today);
    return (
      <>
        <button type="button" className={styles.btn} onClick={() => openTask(null)}>Back to tasks</button>
        {editing.mode === 'edit' ? (
          <TaskForm key={selected.id} initial={selected} assigneeLabels={assigneeLabels} categories={categories}
            saving={saving} onSubmit={(p, c) => void submitTask(p, c)} onCancel={() => setEditing({ mode: 'closed' })}
            onDelete={() => removeTask(selected)} />
        ) : (
          <section className={`${styles.card} ${isDone(selected) ? styles.taskDone : ''}`} aria-label="Task details">
            <h2 className={styles.h2}>{selected.title}</h2>
            <div className={styles.chipRow}>
              <span className={styles.chip}>{STATUS_LABELS[selected.status]}</span>
              <span className={styles.chip}>{assigneeLabels[selected.assignee]}</span>
              {selected.category && <span className={styles.chip}>{selected.category}</span>}
              <span className={`${styles.chip} ${selected.priority === 'high' ? styles.chipHigh : ''}`}>
                {PRIORITY_LABELS[selected.priority]}
              </span>
              {selected.catch_up && <span className={`${styles.chip} ${styles.chipCatch}`}>catch up</span>}
              {selected.recurrence && <span className={styles.chip}>{RECURRENCE_LABELS[selected.recurrence]}</span>}
            </div>
            {selected.due_on && (
              <p className={urgency === 'overdue' ? styles.red : urgency === 'soon' ? styles.amberText : styles.muted}>
                {urgency === 'overdue' ? 'Overdue · ' : 'Due '}{formatDateJhb(selected.due_on)}
              </p>
            )}
            {selected.description && <p className={styles.notes}>{selected.description}</p>}
            <div className={styles.actions}>
              <button type="button" className={styles.btnPrimary} disabled={busyId === selected.id}
                onClick={() => toggleTask(selected)}>
                {isDone(selected) ? 'Mark not done' : 'Mark done'}
              </button>
              <button type="button" className={styles.btn} onClick={() => setEditing({ mode: 'edit', task: selected })}>
                Edit task
              </button>
              <button type="button" className={styles.btnDanger} onClick={() => removeTask(selected)}>Delete task</button>
            </div>
          </section>
        )}
        <SubtaskPanel subtasks={subs} busyId={busyId} onAdd={(t) => addSubtask(selected, t)}
          onToggle={toggleTask} onRename={renameSubtask} onDelete={removeSubtask} />
      </>
    );
  }

  // -------------------------------------------------------------- list view
  const card = (t: Task, board: boolean) => (
    <TaskCard key={t.id} task={t} today={today} assigneeLabels={assigneeLabels}
      progress={subtaskProgress(t.id, all)} busy={busyId === t.id} onToggle={toggleTask} onOpen={(x) => openTask(x.id)}
      {...(board ? { moveTo: STATUSES.filter((s) => s !== t.status), onMove: (x: Task, s: Task['status']) => void moveTask(x, s) } : {})} />
  );

  const groups = groupByAssignee(filtered);
  const columns = kanbanColumns(filtered);

  return (
    <>
      {editing.mode === 'closed' ? (
        <section className={styles.card} aria-label="Quick add">
          <form className={styles.quickAdd} onSubmit={(e) => void quickAdd(e)} noValidate>
            <input className={styles.input} value={quickTitle} placeholder="Add a task" aria-label="Quick add task title"
              maxLength={160} onChange={(e) => setQuickTitle(e.target.value)} />
            <select className={`${styles.input} ${styles.quickSelect}`} value={quickAssignee} aria-label="Quick add for"
              onChange={(e) => setQuickAssignee(e.target.value as Assignee)}>
              {ASSIGNEES.map((a) => <option key={a} value={a}>{assigneeLabels[a]}</option>)}
            </select>
            <button type="submit" className={styles.btnPrimary} disabled={saving}>Add</button>
          </form>
          {quickError && <p className={styles.error} role="alert">{quickError}</p>}
          <button type="button" className={styles.linkButton} onClick={() => setEditing({ mode: 'new' })}>
            More options
          </button>
        </section>
      ) : (
        <TaskForm key="new" assigneeLabels={assigneeLabels} categories={categories} saving={saving}
          onSubmit={(p, c) => void submitTask(p, c)} onCancel={() => setEditing({ mode: 'closed' })} />
      )}

      <div className={styles.segmented} role="group" aria-label="Task view">
        {(['list', 'board'] as const).map((v) => (
          <button key={v} type="button" aria-pressed={view === v}
            className={`${styles.segment} ${view === v ? styles.segmentActive : ''}`} onClick={() => setView(v)}>
            {v === 'list' ? 'List' : 'Board'}
          </button>
        ))}
      </div>

      <div className={styles.toolbar}>
        <input className={styles.input} type="search" placeholder="Search tasks" value={query}
          aria-label="Search tasks" onChange={(e) => setQuery(e.target.value)} />
        <select className={styles.input} value={category} aria-label="Filter by category"
          onChange={(e) => setCategory(e.target.value)}>
          <option value="all">All categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className={styles.input} value={priority} aria-label="Filter by priority"
          onChange={(e) => setPriority(e.target.value)}>
          <option value="all">Any priority</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
        </select>
        {view === 'list' && (
          <select className={styles.input} value={status} aria-label="Filter by status"
            onChange={(e) => setStatus(e.target.value as StatusFilter)}>
            <option value="open">Open tasks</option>
            <option value="all">All tasks</option>
            <option value="done">Done</option>
          </select>
        )}
        <select className={styles.input} value={sort} aria-label="Sort tasks"
          onChange={(e) => setSort(e.target.value as TaskSort)}>
          <option value="due">Sort: Due date</option>
          <option value="priority">Sort: Priority</option>
          <option value="manual">Sort: Manual</option>
        </select>
      </div>
      <div className={styles.chipToggles}>
        <button type="button" className={`${styles.toggleChip} ${mine ? styles.toggleChipOn : ''}`} aria-pressed={mine}
          onClick={() => setMine(!mine)}>My tasks</button>
        <button type="button" className={`${styles.toggleChip} ${catchUpOnly ? styles.toggleChipOn : ''}`}
          aria-pressed={catchUpOnly} onClick={() => setCatchUpOnly(!catchUpOnly)}>Catch up only</button>
        {filtersActive && <button type="button" className={styles.linkButton} onClick={clearFilters}>Clear filters</button>}
      </div>

      {filtered.length === 0 ? (
        <div className={styles.card}>
          <p className={styles.muted}>
            {tops.length === 0
              ? 'No tasks yet. Add your first one above.'
              : 'No tasks match those filters.'}
          </p>
        </div>
      ) : view === 'list' ? (
        ASSIGNEES.filter((a) => groups[a].length > 0).map((a) => (
          <section key={a} className={styles.stack} aria-label={`Tasks for ${assigneeLabels[a]}`}>
            <h2 className={styles.h2}>{assigneeLabels[a]} <span className={styles.count}>{groups[a].length}</span></h2>
            {groups[a].map((t) => card(t, false))}
          </section>
        ))
      ) : (
        <div className={styles.board} role="list" aria-label="Task board" tabIndex={0}>
          {STATUSES.map((s) => (
            <section key={s} className={styles.boardCol} aria-label={STATUS_LABELS[s]} role="listitem">
              <h2 className={styles.h2}>{STATUS_LABELS[s]} <span className={styles.count}>{columns[s].length}</span></h2>
              {columns[s].length === 0 ? <p className={styles.muted}>Nothing here.</p> : columns[s].map((t) => card(t, true))}
            </section>
          ))}
        </div>
      )}
    </>
  );
}
