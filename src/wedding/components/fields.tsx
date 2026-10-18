import { useId } from 'react';
import type { ReactNode } from 'react';
import { formatAmountText } from '../lib/money';
import styles from '../wedding.module.css';

interface Common {
  label: string;
  error?: string;
}

function Wrap({ label, error, errorId, children }: Common & { errorId: string; children: ReactNode }) {
  return (
    <div className={styles.fieldWrap}>
      <label className={styles.field}>
        <span>{label}</span>
        {children}
      </label>
      {error && (
        <span className={styles.error} id={errorId} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

interface TextProps extends Common {
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'date' | 'email';
  inputMode?: 'decimal' | 'numeric';
  placeholder?: string;
  maxLength?: number;
  list?: string;
  disabled?: boolean;
}

export function TextField({ label, error, value, onChange, type = 'text', inputMode, placeholder, maxLength, list, disabled }: TextProps) {
  const errorId = `err-${useId()}`;
  return (
    <Wrap label={label} error={error} errorId={errorId}>
      <input className={styles.input} type={type} inputMode={inputMode} value={value} placeholder={placeholder}
        maxLength={maxLength} list={list} disabled={disabled} aria-invalid={!!error} aria-describedby={error ? errorId : undefined}
        onChange={(e) => onChange(e.target.value)} />
    </Wrap>
  );
}

// A rand amount: tidied to "43 500" when the field loses focus.
export function MoneyField({ label, error, value, onChange, placeholder = '0' }: Common & {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const errorId = `err-${useId()}`;
  return (
    <Wrap label={label} error={error} errorId={errorId}>
      <input className={styles.input} inputMode="decimal" value={value} placeholder={placeholder}
        aria-invalid={!!error} aria-describedby={error ? errorId : undefined}
        onChange={(e) => onChange(e.target.value)} onBlur={() => onChange(formatAmountText(value))} />
    </Wrap>
  );
}

export function SelectField({ label, error, value, onChange, children }: Common & {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  const errorId = `err-${useId()}`;
  return (
    <Wrap label={label} error={error} errorId={errorId}>
      <select className={styles.input} value={value} aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
    </Wrap>
  );
}

export function TextAreaField({ label, error, value, onChange, maxLength = 1000 }: Common & {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
}) {
  const errorId = `err-${useId()}`;
  return (
    <Wrap label={label} error={error} errorId={errorId}>
      <textarea className={styles.input} rows={3} value={value} maxLength={maxLength}
        aria-invalid={!!error} aria-describedby={error ? errorId : undefined}
        onChange={(e) => onChange(e.target.value)} />
    </Wrap>
  );
}
