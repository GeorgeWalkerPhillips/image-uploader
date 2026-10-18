import { useState } from 'react';
import type { FormEvent } from 'react';
import { CATEGORY_COLORS, emptyCategoryForm, validateCategory } from '../lib/categoryForm';
import type { CategoryFormValues, CategoryPayload } from '../lib/categoryForm';
import type { FieldErrors } from '../lib/validators';
import type { Category, Scope } from '../types';
import { SelectField, TextField } from './fields';
import styles from '../wedding.module.css';

interface Props {
  existing: readonly Category[];
  initial?: Category;
  defaultScope: Scope;
  saving?: boolean;
  onSubmit: (payload: CategoryPayload) => void;
  onCancel: () => void;
}

export function CategoryForm({ existing, initial, defaultScope, saving = false, onSubmit, onCancel }: Props) {
  const [v, setV] = useState<CategoryFormValues>(() =>
    initial ? { name: initial.name, scope: initial.scope, color: initial.color ?? '' } : emptyCategoryForm(defaultScope)
  );
  const [errors, setErrors] = useState<FieldErrors>({});

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const r = validateCategory(v, existing, initial?.id);
    if (!r.ok) {
      setErrors(r.errors);
      return;
    }
    setErrors({});
    onSubmit(r.value);
  };

  return (
    <form className={styles.card} onSubmit={submit} noValidate aria-label={initial ? 'Edit category' : 'Add category'}>
      <h2 className={styles.h2}>{initial ? 'Edit category' : 'New category'}</h2>
      <TextField label="Category name" value={v.name} maxLength={60} error={errors.name}
        onChange={(name) => setV((p) => ({ ...p, name }))} />
      <SelectField label="Belongs to" value={v.scope} error={errors.scope}
        onChange={(scope) => setV((p) => ({ ...p, scope: scope as Scope }))}>
        <option value="wedding">Wedding</option>
        <option value="honeymoon">Honeymoon</option>
      </SelectField>
      <div className={styles.fieldWrap}>
        <span className={styles.fieldLabel} id="cat-colour-label">Colour (optional)</span>
        <div className={styles.swatches} role="group" aria-labelledby="cat-colour-label">
          <button type="button" className={`${styles.swatch} ${v.color === '' ? styles.swatchOn : ''}`}
            aria-pressed={v.color === ''} aria-label="Automatic colour" onClick={() => setV((p) => ({ ...p, color: '' }))}>
            <span className={styles.swatchDot} style={{ background: 'transparent', border: '2px dashed #999' }} />
          </button>
          {CATEGORY_COLORS.map((c) => (
            <button key={c} type="button" className={`${styles.swatch} ${v.color === c ? styles.swatchOn : ''}`}
              aria-pressed={v.color === c} aria-label={`Colour ${c}`} onClick={() => setV((p) => ({ ...p, color: c }))}>
              <span className={styles.swatchDot} style={{ background: c }} />
            </button>
          ))}
        </div>
        {errors.color && <span className={styles.error} role="alert">{errors.color}</span>}
      </div>
      <div className={styles.actions}>
        <button type="submit" className={styles.btnPrimary} disabled={saving}>
          {saving ? 'Saving...' : 'Save category'}
        </button>
        <button type="button" className={styles.btn} onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
