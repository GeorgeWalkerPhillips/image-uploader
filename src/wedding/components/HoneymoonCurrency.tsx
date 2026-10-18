import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useWedding } from '../WeddingContext';
import { useUpdateWedding } from '../hooks';
import { notify } from '../notify';
import { MoneyField, TextField } from './fields';
import {
  convertText, formatRate, formatThb, normalizeRate, validateFxRate, zarCentsToThbSatang,
} from '../lib/fx';
import type { ConvertDirection } from '../lib/fx';
import { centsToGroupedInput, formatZar } from '../lib/money';
import { formatDateJhb } from '../lib/time';
import type { FieldErrors } from '../lib/validators';
import styles from '../wedding.module.css';

export function CurrencySection() {
  const { wedding } = useWedding();
  const update = useUpdateWedding();
  const rate = normalizeRate(wedding.fx_thb_per_zar);

  const [editingRate, setEditingRate] = useState(false);
  const [rateText, setRateText] = useState('');
  const [rateErrors, setRateErrors] = useState<FieldErrors>({});
  // Whichever box was typed in last drives the other one.
  const [typed, setTyped] = useState<{ side: 'zar' | 'thb'; text: string }>({ side: 'zar', text: '' });

  const direction: ConvertDirection = typed.side === 'zar' ? 'zarToThb' : 'thbToZar';
  const result = useMemo(
    () => (rate === null ? null : convertText(typed.text, direction, rate)),
    [typed, direction, rate]
  );
  const otherText = result && result.ok ? centsToGroupedInput(result.minor) : '';
  const zarText = typed.side === 'zar' ? typed.text : otherText;
  const thbText = typed.side === 'thb' ? typed.text : otherText;
  const error = result && !result.ok ? result.error : undefined;

  const budgetThb = rate !== null && wedding.honeymoon_budget_cents > 0
    ? zarCentsToThbSatang(wedding.honeymoon_budget_cents, rate)
    : null;

  const openRateEditor = () => {
    setRateText(rate === null ? '' : formatRate(rate));
    setRateErrors({});
    setEditingRate(true);
  };

  const saveRate = (e: FormEvent) => {
    e.preventDefault();
    const r = validateFxRate(rateText);
    if (!r.ok) {
      setRateErrors(r.errors);
      return;
    }
    setRateErrors({});
    update.mutate({ ...r.value }, {
      onSuccess: () => {
        notify.success('Rate saved');
        setEditingRate(false);
      },
    });
  };

  const showRateForm = editingRate || rate === null;

  return (
    <>
      <section className={styles.card} aria-label="Exchange rate">
        <h2 className={styles.h2}>Exchange rate</h2>
        {rate !== null && !showRateForm && (
          <>
            <p className={styles.heroNumber}>1 R = {formatRate(rate)} THB</p>
            <p className={styles.muted}>
              A rate you set by hand, not a live market rate.
              {wedding.updated_at ? ` Settings last saved ${formatDateJhb(wedding.updated_at)}.` : ''}
            </p>
            <div className={styles.actions}>
              <button type="button" className={styles.btn} onClick={openRateEditor}>Change rate</button>
            </div>
          </>
        )}
        {showRateForm && (
          <form onSubmit={saveRate} noValidate aria-label="Set exchange rate">
            {rate === null && (
              <p className={styles.hint}>No rate set yet. Enter how many Thai baht one rand buys, then check it before you travel.</p>
            )}
            <TextField label="THB per ZAR" inputMode="decimal" value={rateText} placeholder="1.85"
              error={rateErrors.rate} onChange={setRateText} />
            <div className={styles.actions}>
              <button type="submit" className={styles.btnPrimary} disabled={update.isPending}>
                {update.isPending ? 'Saving...' : 'Save rate'}
              </button>
              {rate !== null && (
                <button type="button" className={styles.btn} onClick={() => setEditingRate(false)} disabled={update.isPending}>
                  Cancel
                </button>
              )}
            </div>
          </form>
        )}
      </section>

      {rate !== null && (
        <section className={styles.card} aria-label="Converter">
          <h2 className={styles.h2}>Converter</h2>
          <MoneyField label="Rand (ZAR)" value={zarText} error={typed.side === 'zar' ? error : undefined}
            placeholder="1 000" onChange={(text) => setTyped({ side: 'zar', text })} />
          <MoneyField label="Baht (THB)" value={thbText} error={typed.side === 'thb' ? error : undefined}
            placeholder="1 850" onChange={(text) => setTyped({ side: 'thb', text })} />
          <p className={styles.muted} aria-live="polite">
            {result && result.ok
              ? direction === 'zarToThb'
                ? `${formatZar(result.inputMinor)} = ${formatThb(result.minor)}`
                : `${formatThb(result.inputMinor)} = ${formatZar(result.minor)}`
              : 'Type an amount in either box.'}
          </p>
          {budgetThb !== null && (
            <p className={styles.hint}>
              Honeymoon budget {formatZar(wedding.honeymoon_budget_cents)} is about {formatThb(budgetThb)} at this rate.
            </p>
          )}
        </section>
      )}
    </>
  );
}
