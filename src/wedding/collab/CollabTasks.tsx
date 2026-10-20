import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchRows } from '../api';
import { useSaveRow } from '../hooks';
import { useLeaveWedding, useWeddingPeople } from '../teamHooks';
import { useAuthUser } from '../useAuthUser';
import { notify } from '../notify';
import { Skeleton } from '../components/Skeleton';
import { ErrorRetry } from '../components/ErrorRetry';
import { useNow } from '../components/useNow';
import { TaskCard } from '../components/TaskCard';
import { PRIORITY_LABELS, STATUS_LABELS } from '../components/TaskForm';
import { changeStatus, isDone, sortTasks, taskUrgency } from '../lib/tasks';
import { STATUSES } from '../lib/taskForms';
import { ROW_ORDER } from '../lib/rowOrder';
import { forLabel } from '../lib/assignment';
import { rpcErrorMessage } from '../lib/planner';
import { formatDateJhb, todayJhbISO } from '../lib/time';
import type { Assignee, Task } from '../types';
import styles from '../wedding.module.css';

const NO_PROGRESS = { done: 0, total: 0 };

// A helper's whole app: the tasks the couple assigned to them. The database
// only returns those rows (RLS), and only lets them change status, completed_at
// and completed_by - so that is all this ever sends.
export function CollabTasks({ weddingId }: { weddingId: string }) {
  const { user } = useAuthUser();
  const userId = user?.id ?? '';
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const today = todayJhbISO(useNow(60000));

  const tasksQuery = useQuery({
    queryKey: ['wedding_tasks', weddingId],
    queryFn: () => fetchRows<Task>('wedding_tasks', weddingId, ROW_ORDER.wedding_tasks),
    // No realtime for helpers: pick up changes whenever they come back to the app.
    refetchOnWindowFocus: true,
  });
  const people = useWeddingPeople(weddingId);
  const save = useSaveRow<Task>('wedding_tasks', weddingId, [], { silent: true });
  const leave = useLeaveWedding();

  const tasks = useMemo(() => sortTasks(tasksQuery.data ?? [], 'due'), [tasksQuery.data]);
  const open = tasks.filter((t) => !isDone(t));
  const done = tasks.filter(isDone);
  const team = people.data ?? [];
  const forLabels: Record<Assignee, string> = {
    groom: forLabel(team, 'groom'), bride: forLabel(team, 'bride'), both: forLabel(team, 'both'),
  };

  const selectedId = params.get('task');
  const selected = tasks.find((t) => t.id === selectedId) ?? null;
  const openTask = (id: string | null) => setParams(id ? { task: id } : {});

  const setStatus = (task: Task, to: Task['status']) => {
    if (task.status === to || save.isPending) return;
    // The patch is exactly { status, completed_at, completed_by }; any extra
    // column would be refused by the database.
    const { patch } = changeStatus(task, to, new Date(), userId || null);
    save.mutate(
      { id: task.id, values: patch },
      {
        onSuccess: () => notify.success(to === 'done' ? 'Marked done' : 'Task updated'),
        onError: (e) => notify.error(rpcErrorMessage(e, `Could not update "${task.title}". Nothing was changed.`)),
      }
    );
  };
  const toggle = (task: Task) => setStatus(task, isDone(task) ? 'todo' : 'done');
  const busyId = save.isPending ? save.variables?.id ?? null : null;

  const leaveWedding = () => {
    if (leave.isPending) return;
    if (!window.confirm('Leave this wedding? You will lose access to your tasks and can only rejoin if the couple invites you again.')) {
      return;
    }
    leave.mutate(undefined, {
      onSuccess: () => {
        notify.success('You have left the wedding');
        navigate('/hq/', { replace: true });
      },
      onError: (e) => notify.error(rpcErrorMessage(e, 'Could not leave the wedding. Please try again.')),
    });
  };

  if (tasksQuery.isLoading) return <><Skeleton height={56} /><Skeleton height={120} /></>;
  if (tasksQuery.isError && tasksQuery.data === undefined) {
    return (
      <div className={styles.card}>
        <ErrorRetry message="Could not load your tasks." onRetry={() => void tasksQuery.refetch()} />
      </div>
    );
  }

  const privacy = (
    <section className={styles.card} aria-label="Your privacy">
      <h2 className={styles.h2}>What you can see</h2>
      <p className={styles.muted}>
        You only see tasks assigned to you. The couple's budget, files, guest list, calendar and settings stay private.
      </p>
      <div className={styles.actions}>
        <button type="button" className={styles.btnDanger} disabled={leave.isPending} onClick={leaveWedding}>
          {leave.isPending ? 'Leaving...' : 'Leave this wedding'}
        </button>
      </div>
    </section>
  );

  if (selectedId) {
    if (!selected) {
      return (
        <div className={styles.card}>
          <p className={styles.muted}>That task is no longer assigned to you.</p>
          <button type="button" className={styles.btn} onClick={() => openTask(null)}>Back to my tasks</button>
        </div>
      );
    }
    const urgency = taskUrgency(selected, today);
    return (
      <>
        <button type="button" className={styles.btn} onClick={() => openTask(null)}>Back to my tasks</button>
        <section className={`${styles.card} ${isDone(selected) ? styles.taskDone : ''}`} aria-label="Task details">
          <h2 className={styles.h2}>{selected.title}</h2>
          <div className={styles.chipRow}>
            <span className={styles.chip}>{STATUS_LABELS[selected.status]}</span>
            <span className={styles.chip}>{forLabels[selected.assignee]}</span>
            {selected.category && <span className={styles.chip}>{selected.category}</span>}
            <span className={`${styles.chip} ${selected.priority === 'high' ? styles.chipHigh : ''}`}>
              {PRIORITY_LABELS[selected.priority]}
            </span>
          </div>
          {selected.due_on && (
            <p className={urgency === 'overdue' ? styles.red : urgency === 'soon' ? styles.amberText : styles.muted}>
              {urgency === 'overdue' ? 'Overdue · ' : 'Due '}{formatDateJhb(selected.due_on)}
            </p>
          )}
          {selected.description && <p className={styles.notes}>{selected.description}</p>}
          <div className={styles.segmented} role="group" aria-label="Task status">
            {STATUSES.map((s) => (
              <button key={s} type="button" aria-pressed={selected.status === s} disabled={save.isPending}
                className={`${styles.segment} ${selected.status === s ? styles.segmentActive : ''}`}
                onClick={() => setStatus(selected, s)}>
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </section>
      </>
    );
  }

  const card = (t: Task) => (
    <TaskCard key={t.id} task={t} today={today} assigneeLabels={forLabels} progress={NO_PROGRESS}
      busy={busyId === t.id} onToggle={toggle} onOpen={(x) => openTask(x.id)} />
  );

  return (
    <>
      {tasks.length === 0 ? (
        <section className={styles.card} aria-label="My tasks">
          <h2 className={styles.h2}>My tasks</h2>
          <p className={styles.muted}>Nothing is assigned to you right now. New tasks show up here.</p>
        </section>
      ) : (
        <>
          <section className={styles.stack} aria-label="Open tasks">
            <h2 className={styles.h2}>To do <span className={styles.count}>{open.length}</span></h2>
            {open.length === 0 ? <p className={styles.muted}>All done. Thank you!</p> : open.map(card)}
          </section>
          {done.length > 0 && (
            <section className={styles.stack} aria-label="Done tasks">
              <h2 className={styles.h2}>Done <span className={styles.count}>{done.length}</span></h2>
              {done.map(card)}
            </section>
          )}
        </>
      )}
      <button type="button" className={styles.linkButton} disabled={tasksQuery.isFetching}
        onClick={() => void tasksQuery.refetch()}>
        {tasksQuery.isFetching ? 'Refreshing...' : 'Refresh my tasks'}
      </button>
      {privacy}
    </>
  );
}
