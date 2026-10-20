import { formatDateJhb } from '../lib/time';
import { isDone, taskUrgency } from '../lib/tasks';
import type { Assignee, Task } from '../types';
import { PRIORITY_LABELS, RECURRENCE_LABELS, STATUS_LABELS } from './TaskForm';
import styles from '../wedding.module.css';

interface Props {
  task: Task;
  today: string;
  assigneeLabels: Record<Assignee, string>;
  progress: { done: number; total: number };
  // "Assigned to Sam", or null/undefined when nobody is assigned.
  assignedLabel?: string | null;
  busy?: boolean;
  onToggle: (task: Task) => void;
  onOpen: (task: Task) => void;
  // Board cards: "Move to ..." buttons for the other columns.
  moveTo?: readonly Task['status'][];
  onMove?: (task: Task, status: Task['status']) => void;
}

export function TaskCard({ task, today, assigneeLabels, progress, assignedLabel, busy = false, onToggle, onOpen, moveTo, onMove }: Props) {
  const done = isDone(task);
  const urgency = taskUrgency(task, today);
  const dueClass = urgency === 'overdue' ? styles.red : urgency === 'soon' ? styles.amberText : styles.muted;
  return (
    <article className={`${styles.card} ${styles.taskCard} ${done ? styles.taskDone : ''}`} aria-label={task.title}>
      <div className={styles.taskTop}>
        <label className={styles.checkTap}>
          <input type="checkbox" className={styles.check} checked={done} disabled={busy}
            aria-label={done ? `Mark "${task.title}" not done` : `Mark "${task.title}" done`}
            onChange={() => onToggle(task)} />
        </label>
        <div className={styles.taskMain}>
          <button type="button" className={styles.taskTitle} onClick={() => onOpen(task)}>
            {task.title}
          </button>
          {task.due_on && (
            <p className={`${styles.taskDue} ${dueClass}`}>
              {urgency === 'overdue' ? 'Overdue · ' : urgency === 'soon' ? 'Due soon · ' : 'Due '}
              {formatDateJhb(task.due_on, { day: 'numeric', month: 'short' })}
            </p>
          )}
        </div>
      </div>
      <div className={styles.chipRow}>
        <span className={styles.chip}>{assigneeLabels[task.assignee]}</span>
        {assignedLabel && <span className={`${styles.chip} ${styles.chipAssigned}`}>{assignedLabel}</span>}
        {task.category && <span className={styles.chip}>{task.category}</span>}
        <span className={`${styles.chip} ${task.priority === 'high' ? styles.chipHigh : ''}`}>
          {PRIORITY_LABELS[task.priority]}
        </span>
        {task.catch_up && <span className={`${styles.chip} ${styles.chipCatch}`}>catch up</span>}
        {task.recurrence && <span className={styles.chip}>{RECURRENCE_LABELS[task.recurrence]}</span>}
        {progress.total > 0 && (
          <span className={styles.chip} aria-label={`${progress.done} of ${progress.total} subtasks done`}>
            {progress.done}/{progress.total}
          </span>
        )}
      </div>
      {moveTo && onMove && (
        <div className={styles.moveRow}>
          {moveTo.map((s) => (
            <button key={s} type="button" className={styles.btn} disabled={busy}
              aria-label={`Move "${task.title}" to ${STATUS_LABELS[s]}`} onClick={() => onMove(task, s)}>
              Move to {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      )}
    </article>
  );
}
