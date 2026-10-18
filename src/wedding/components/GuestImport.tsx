import { useState } from 'react';
import { MAX_IMPORT_ROWS, parseGuestImport } from '../lib/guests';
import type { GuestPayload, ImportPreview } from '../lib/guests';
import styles from '../wedding.module.css';
import x from '../extras.module.css';

const MAX_FILE_BYTES = 1024 * 1024;
const EXAMPLE = 'name,email,phone,side,rsvp,party_size,dietary_notes,table,notes\nAda Test,ada@example.com,082 123 4567,bride,yes,2,Vegetarian,Table 1,';

interface Props {
  importing: boolean;
  onImport: (rows: GuestPayload[]) => void;
  onCancel: () => void;
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsText(file);
  });
}

// Paste or pick a CSV, check it, then confirm. Nothing is sent anywhere until
// the person presses the import button on a preview with at least one valid row.
export function GuestImport({ importing, onImport, onCancel }: Props) {
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [fileError, setFileError] = useState('');

  const check = (value: string) => setPreview(parseGuestImport(value));

  const pick = async (file: File | undefined) => {
    setFileError('');
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setFileError('That file is over 1 MB. Split it into smaller files.');
      return;
    }
    try {
      const content = await readFile(file);
      setText(content);
      check(content);
    } catch (e) {
      setFileError(e instanceof Error ? e.message : 'Could not read that file.');
    }
  };

  const valid = preview?.valid ?? [];
  const invalid = preview?.invalid ?? [];

  return (
    <section className={styles.card} aria-label="Import guests">
      <h2 className={styles.h2}>Import guests from CSV</h2>
      <p className={styles.muted}>
        The first row must name the columns: name (required), email, phone, side, rsvp, party_size, dietary_notes, table, notes.
        Up to {MAX_IMPORT_ROWS} guests at a time.
      </p>
      <label className={styles.field}>
        <span>Choose a .csv file</span>
        <input className={styles.input} type="file" accept=".csv,text/csv,text/plain"
          onChange={(e) => void pick(e.target.files?.[0])} />
      </label>
      {fileError && <p className={styles.error} role="alert">{fileError}</p>}
      <label className={styles.field}>
        <span>Or paste CSV text</span>
        <textarea className={`${styles.input} ${x.csvBox}`} rows={6} value={text} placeholder={EXAMPLE} spellCheck={false}
          onChange={(e) => { setText(e.target.value); setPreview(null); }} />
      </label>
      <div className={styles.actions}>
        <button type="button" className={styles.btnPrimary} onClick={() => check(text)} disabled={importing}>Check the data</button>
        <button type="button" className={styles.btn} onClick={onCancel} disabled={importing}>Cancel</button>
      </div>

      {preview?.fatal && <p className={styles.error} role="alert">{preview.fatal}</p>}

      {preview && !preview.fatal && (
        <div className={x.preview} aria-label="Import preview" role="region">
          <p role="status">
            <strong>{valid.length}</strong> ready to import, <strong>{invalid.length}</strong> with problems
            {preview.skippedOverCap > 0 ? `, ${preview.skippedOverCap} more over the ${MAX_IMPORT_ROWS} row limit ignored` : ''}.
          </p>
          {preview.warnings.map((w) => <p key={w} className={styles.amberText}>{w}</p>)}
          {invalid.length > 0 && (
            <>
              <h3 className={styles.h3}>Will be skipped</h3>
              <ul className={styles.list} aria-label="Rows with problems">
                {invalid.map((r) => (
                  <li key={r.line} className={`${styles.listItem} ${styles.due_overdue} ${x.previewRow}`}>
                    <strong>Row {r.line}{r.name ? `: ${r.name}` : ''}</strong>
                    <span className={styles.error}>{r.errors.join(' ')}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {valid.length > 0 && (
            <>
              <h3 className={styles.h3}>Ready</h3>
              <ul className={styles.list} aria-label="Rows ready to import">
                {valid.map((r) => (
                  <li key={r.line} className={`${styles.listItem} ${x.previewRow}`}>
                    <strong>{r.payload?.name}</strong>
                    <span className={styles.muted}>
                      {r.payload?.side}, {r.payload?.rsvp_status}, party of {r.payload?.party_size}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className={styles.actions}>
            <button type="button" className={styles.btnPrimary} disabled={valid.length === 0 || importing}
              onClick={() => onImport(valid.flatMap((r) => (r.payload ? [r.payload] : [])))}>
              {importing ? 'Importing...' : `Import ${valid.length} guest${valid.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
