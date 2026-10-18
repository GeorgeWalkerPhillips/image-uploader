import { useState } from 'react';
import type { FormEvent } from 'react';
import { isDone } from '../lib/tasks';
import type { Task } from '../types';
import styles from '../wedding.module.css';

interface Props {
  subtasks: readonly Task[];
  busyId: string | null;
  onAdd: (title: string) => Promise<boolean>;
  onToggle: (task: Task) => void;
  onRename: (task: Task, title: string) => Promise<boolean>;
  onDelete: (task: Task) => void;
}

export function SubtaskPanel({ subtasks, busyId, onAdd, onToggle, onRename, onDelete }: Props) {
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const done = subtasks.filter(isDone).length;
  const pct = subtasks.length > 0 ? Math.round((done / subtasks.length) * 100) : 0;

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Type a subtask first.');
      return;
    }
    setError('');
    setAdding(true);
    if (await onAdd(title.trim())) setTitle('');
    setAdding(false);
  };

  const saveEdit = async (task: Task) => {
    if (!editText.trim()) {
      setError('Give the subtask a title.');
      return;
    }
    setError('');
    if (await onRename(task, editText.trim())) setEditId(null);
  };

  return (
    <section className={styles.card} aria-label="Subtasks">
      <div className={styles.rowBetween}>
        <h2 className={styles.h2}>Subtasks</h2>
        {subtasks.length > 0 && <span className={styles.chip} aria-label={`${done} of ${subtasks.length} done`}>{done}/{subtasks.length}</span>}
      </div>
      {subtasks.length > 0 && (
        <div className={styles.bar} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}
          aria-label="Subtasks done">
          <div className={`${styles.barFill} ${done === subtasks.length ? styles.fill_reached : styles.fill_on_track}`}
            style={{ width: `${pct}%` }} />
        </div>
      )}
      {subtasks.length === 0 ? (
        <p className={styles.muted}>No subtasks yet. Break this task into smaller steps.</p>
      ) : (
        <ul className={styles.list}>
          {subtasks.map((s) => (
            <li key={s.id} className={`${styles.subRow} ${isDone(s) ? styles.taskDone : ''}`}>
              <label className={styles.checkTap}>
                <input type="checkbox" className={styles.check} checked={isDone(s)} disabled={busyId === s.id}
                  aria-label={isDone(s) ? `Mark subtask "${s.title}" not done` : `Mark subtask "${s.title}" done`}
                  onChange={() => onToggle(s)} />
              </label>
              {editId === s.id ? (
                <>
                  <input className={styles.input} value={editText} aria-label="Subtask title" maxLength={160}
                    onChange={(e) => setEditText(e.target.value)} />
                  <button type="button" className={styles.linkButton} onClick={() => void saveEdit(s)}>Save</button>
                  <button type="button" className={styles.linkButton} onClick={() => setEditId(null)}>Cancel</button>
                </>
              ) : (
                <>
                  <span className={styles.subTitle}>{s.title}</span>
                  <button type="button" className={styles.linkButton} aria-label={`Edit subtask "${s.title}"`}
                    onClick={() => { setEditId(s.id); setEditText(s.title); setError(''); }}>Edit</button>
                  <button type="button" className={styles.linkButton} aria-label={`Delete subtask "${s.title}"`}
                    onClick={() => onDelete(s)}>Delete</button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <form className={styles.quickAdd} onSubmit={(e) => void add(e)} noValidate>
        <input className={styles.input} value={title} placeholder="Add a subtask" aria-label="New subtask"
          maxLength={160} onChange={(e) => setTitle(e.target.value)} />
        <button type="submit" className={styles.btnPrimary} disabled={adding}>Add</button>
      </form>
      {error && <p className={styles.error} role="alert">{error}</p>}
    </section>
  );
}
