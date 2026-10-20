import { useState } from 'react';
import type { FormEvent } from 'react';
import { Shell } from '../Shell';
import { TextField } from '../components/fields';
import { useCreateWedding } from '../teamHooks';
import { useSignOut } from '../useSignOut';
import { notify } from '../notify';
import { emptySetup, rpcErrorMessage, validateSetup } from '../lib/planner';
import type { SetupValues } from '../lib/planner';
import type { FieldErrors } from '../lib/validators';
import type { Role } from '../types';
import styles from '../wedding.module.css';

const ROLES: ReadonlyArray<{ value: Role; label: string }> = [
  { value: 'groom', label: 'Groom' },
  { value: 'bride', label: 'Bride' },
];

// For someone who has bought the planner but has no wedding yet.
export function SetupPage() {
  const create = useCreateWedding();
  const signOut = useSignOut();
  const [v, setV] = useState<SetupValues>(emptySetup);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState('');
  const set = <K extends keyof SetupValues>(key: K) => (value: SetupValues[K]) => setV((p) => ({ ...p, [key]: value }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (create.isPending) return; // double-submit guard
    const r = validateSetup(v);
    if (!r.ok) {
      setErrors(r.errors);
      return;
    }
    setErrors({});
    setServerError('');
    create.mutate(r.value, {
      onSuccess: () => notify.success('Your wedding is ready'),
      onError: (err) => setServerError(rpcErrorMessage(err, 'Could not set up your wedding. Please try again.')),
    });
  };

  return (
    <Shell title="Set up your wedding" subtitle="Your planner is ready. Tell us the basics.">
      <form className={styles.card} onSubmit={submit} noValidate aria-label="Set up your wedding">
        <TextField label="Wedding name" value={v.name} maxLength={120} error={errors.name} onChange={set('name')}
          placeholder="Ada and Ben's wedding" />
        <TextField label="Wedding date" type="date" value={v.weddingDate} error={errors.weddingDate}
          onChange={set('weddingDate')} />
        <fieldset className={styles.radioGroup} aria-describedby={errors.role ? 'err-setup-role' : undefined}>
          <legend className={styles.fieldLabel}>I am the…</legend>
          <div className={styles.radioRow}>
            {ROLES.map((r) => (
              <label key={r.value} className={`${styles.radioOption} ${v.role === r.value ? styles.radioOn : ''}`}>
                <input type="radio" name="my-role" value={r.value} checked={v.role === r.value}
                  onChange={() => set('role')(r.value)} />
                <span>{r.label}</span>
              </label>
            ))}
          </div>
          {errors.role && <span className={styles.error} id="err-setup-role" role="alert">{errors.role}</span>}
        </fieldset>
        <TextField label="My name (shown to your partner and helpers)" value={v.displayName} maxLength={80}
          error={errors.displayName} onChange={set('displayName')} />
        <p className={styles.muted}>
          You can change the name, date, budget and everything else later in Settings. You can invite your partner
          and helpers once you are in.
        </p>
        {serverError && <p className={styles.error} role="alert">{serverError}</p>}
        <div className={styles.actions}>
          <button type="submit" className={styles.btnPrimary} disabled={create.isPending}>
            {create.isPending ? 'Setting up...' : 'Create my wedding'}
          </button>
        </div>
      </form>
      <button type="button" className={styles.linkButton} onClick={() => void signOut()}>Sign out</button>
    </Shell>
  );
}
