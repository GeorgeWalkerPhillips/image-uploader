import { useId, useRef, useState } from 'react';
import { FILE_ACCEPT, validateFile } from '../lib/files';
import { AttachmentLink } from './AttachmentLink';
import styles from '../wedding.module.css';

interface Props {
  label: string;
  file: File | null;
  onFile: (file: File | null) => void;
  existingPath: string | null;
  removeExisting: boolean;
  onRemoveExisting: (remove: boolean) => void;
  disabled?: boolean;
}

// Choose / replace / remove one attachment. Bad files are refused here with a
// friendly message; the bucket's own limits are the real guard.
export function FileField({ label, file, onFile, existingPath, removeExisting, onRemoveExisting, disabled }: Props) {
  const errorId = `err-${useId()}`;
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const choose = (picked: File | undefined) => {
    if (!picked) return;
    const problem = validateFile(picked);
    if (problem) {
      setError(problem);
      onFile(null);
      if (input.current) input.current.value = '';
      return;
    }
    setError(null);
    onRemoveExisting(false);
    onFile(picked);
  };

  return (
    <div className={styles.fieldWrap}>
      <label className={styles.field}>
        <span>{label} (PDF or image, up to 10 MB)</span>
        <input ref={input} className={`${styles.input} ${styles.fileInput}`} type="file" accept={FILE_ACCEPT}
          disabled={disabled} aria-invalid={!!error} aria-describedby={error ? errorId : undefined}
          onChange={(e) => choose(e.target.files?.[0])} />
      </label>
      {error && (
        <span className={styles.error} id={errorId} role="alert">
          {error}
        </span>
      )}
      {file && (
        <div className={styles.fileRow}>
          <span className={styles.muted}>Ready to upload: {file.name}</span>
          <button type="button" className={styles.linkButton} disabled={disabled}
            onClick={() => { onFile(null); if (input.current) input.current.value = ''; }}>
            Clear
          </button>
        </div>
      )}
      {!file && existingPath && (
        <div className={styles.fileRow}>
          {removeExisting ? (
            <>
              <span className={styles.muted}>The current file will be removed when you save.</span>
              <button type="button" className={styles.linkButton} onClick={() => onRemoveExisting(false)}>Undo</button>
            </>
          ) : (
            <>
              <AttachmentLink path={existingPath} label="View current file" />
              <button type="button" className={styles.linkButton} disabled={disabled}
                onClick={() => onRemoveExisting(true)}>
                Remove
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
