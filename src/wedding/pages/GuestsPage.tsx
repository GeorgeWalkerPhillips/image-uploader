import { useMemo, useState } from 'react';
import { useWedding } from '../WeddingContext';
import { useDeleteRow, useSaveRow } from '../hooks';
import { useGuests, useImportGuests, useLogActivity } from '../extrasHooks';
import { notify } from '../notify';
import { Skeleton } from '../components/Skeleton';
import { ErrorRetry } from '../components/ErrorRetry';
import { GuestForm } from '../components/GuestForm';
import { GuestImport } from '../components/GuestImport';
import { ContactLinks } from '../components/ContactLinks';
import { filterGuests, guestTotals, RSVP_LABEL, RSVPS } from '../lib/guests';
import type { GuestFilter, GuestPayload } from '../lib/guests';
import type { Guest, Rsvp } from '../types';
import styles from '../wedding.module.css';
import x from '../extras.module.css';

type Mode = { kind: 'closed' } | { kind: 'new' } | { kind: 'edit'; guest: Guest } | { kind: 'import' };

const SIDE_LABEL = { groom: 'Groom', bride: 'Bride', both: 'Both' } as const;

export function GuestsPage() {
  const { wedding } = useWedding();
  const query = useGuests(wedding.id);
  const save = useSaveRow<Guest>('wedding_guests', wedding.id);
  const remove = useDeleteRow('wedding_guests', wedding.id);
  const importer = useImportGuests(wedding.id);
  const log = useLogActivity();
  const [mode, setMode] = useState<Mode>({ kind: 'closed' });
  const [filter, setFilter] = useState<GuestFilter>({ query: '', side: 'all', rsvp: 'all' });

  const guests = useMemo(() => query.data ?? [], [query.data]);
  const totals = useMemo(() => guestTotals(guests), [guests]);
  const shown = useMemo(() => filterGuests(guests, filter), [guests, filter]);

  if (query.isLoading) return <><Skeleton height={160} /><Skeleton height={120} /></>;
  if (query.isError && query.data === undefined) {
    return <div className={styles.card}><ErrorRetry message="Could not load the guest list." onRetry={() => void query.refetch()} /></div>;
  }

  const submit = (payload: GuestPayload) => {
    const existing = mode.kind === 'edit' ? mode.guest : null;
    save.mutate(
      { id: existing?.id, values: { ...payload } },
      {
        onSuccess: () => {
          notify.success('Guest saved');
          if (existing && existing.rsvp_status !== payload.rsvp_status) log('Updated an RSVP');
          setMode({ kind: 'closed' });
        },
      }
    );
  };

  const setRsvp = (g: Guest, rsvp: Rsvp) => {
    if (g.rsvp_status === rsvp) return;
    save.mutate(
      { id: g.id, values: { rsvp_status: rsvp } },
      { onSuccess: () => log('Updated an RSVP') }
    );
  };

  const confirmDelete = (g: Guest) => {
    if (!window.confirm(`Delete ${g.name} from the guest list? This cannot be undone.`)) return;
    remove.mutate(g.id, { onSuccess: () => notify.success('Guest deleted') });
  };

  const runImport = (rows: GuestPayload[]) => {
    importer.mutate(rows.map((r) => ({ ...r })), {
      onSuccess: (saved) => {
        notify.success(`Imported ${saved.length} guest${saved.length === 1 ? '' : 's'}`);
        log('Imported guests', `${saved.length} guests`);
        setMode({ kind: 'closed' });
      },
      onError: (e) => notify.error(`The import may not have completed. Check the guest list before trying again. ${e instanceof Error ? e.message : ''}`.trim()),
    });
  };

  const filtersActive = filter.query.trim() !== '' || filter.side !== 'all' || filter.rsvp !== 'all';
  const busyId = save.isPending ? save.variables?.id : undefined;

  return (
    <>
      <section className={styles.card} aria-label="Guest summary">
        <h2 className={styles.h2}>Guest list</h2>
        <dl className={x.summaryGrid}>
          <div><dt>Invited</dt><dd>{totals.headcount}<small>{totals.parties} {totals.parties === 1 ? 'party' : 'parties'}</small></dd></div>
          <div><dt>Coming</dt><dd>{totals.byRsvp.yes.headcount}<small>{totals.byRsvp.yes.parties} {totals.byRsvp.yes.parties === 1 ? 'party' : 'parties'}</small></dd></div>
          <div><dt>Maybe</dt><dd>{totals.byRsvp.maybe.headcount}<small>{totals.byRsvp.maybe.parties} {totals.byRsvp.maybe.parties === 1 ? 'party' : 'parties'}</small></dd></div>
          <div><dt>Waiting</dt><dd>{totals.byRsvp.pending.headcount}<small>{totals.byRsvp.pending.parties} {totals.byRsvp.pending.parties === 1 ? 'party' : 'parties'}</small></dd></div>
          <div><dt>Not coming</dt><dd>{totals.byRsvp.no.headcount}<small>{totals.byRsvp.no.parties} {totals.byRsvp.no.parties === 1 ? 'party' : 'parties'}</small></dd></div>
          <div><dt>Dietary</dt><dd>{totals.dietary}<small>{totals.dietary === 1 ? 'party' : 'parties'}</small></dd></div>
        </dl>
        <p className={styles.muted}>Headcount counts everyone in each party.</p>
        {mode.kind === 'closed' && (
          <div className={x.headActions}>
            <button type="button" className={styles.btnPrimary} onClick={() => setMode({ kind: 'new' })}>Add guest</button>
            <button type="button" className={styles.btn} onClick={() => setMode({ kind: 'import' })}>Import CSV</button>
          </div>
        )}
      </section>

      {mode.kind === 'edit' && (
        <GuestForm key={mode.guest.id} initial={mode.guest} saving={save.isPending} onSubmit={submit} onCancel={() => setMode({ kind: 'closed' })} />
      )}
      {mode.kind === 'new' && <GuestForm saving={save.isPending} onSubmit={submit} onCancel={() => setMode({ kind: 'closed' })} />}
      {mode.kind === 'import' && (
        <GuestImport existing={guests} importing={importer.isPending} onImport={runImport} onCancel={() => setMode({ kind: 'closed' })} />
      )}

      {guests.length > 0 && (
        <div className={styles.toolbar}>
          <input className={styles.input} type="search" aria-label="Search guests" placeholder="Search guests"
            value={filter.query} onChange={(e) => setFilter({ ...filter, query: e.target.value })} />
          <select className={styles.input} aria-label="Filter by side" value={filter.side}
            onChange={(e) => setFilter({ ...filter, side: e.target.value as GuestFilter['side'] })}>
            <option value="all">All sides</option>
            <option value="groom">Groom</option>
            <option value="bride">Bride</option>
            <option value="both">Both</option>
          </select>
          <select className={styles.input} aria-label="Filter by RSVP" value={filter.rsvp}
            onChange={(e) => setFilter({ ...filter, rsvp: e.target.value as GuestFilter['rsvp'] })}>
            <option value="all">Any RSVP</option>
            {RSVPS.map((r) => <option key={r} value={r}>{RSVP_LABEL[r]}</option>)}
          </select>
        </div>
      )}

      {guests.length === 0 && mode.kind !== 'new' && mode.kind !== 'import' ? (
        <div className={styles.card}>
          <p className={styles.muted}>No guests yet. Add them one at a time, or import a CSV from a spreadsheet.</p>
        </div>
      ) : shown.length === 0 && guests.length > 0 ? (
        <div className={styles.card}>
          <p className={styles.muted}>No guests match.</p>
          {filtersActive && (
            <button type="button" className={styles.btn} onClick={() => setFilter({ query: '', side: 'all', rsvp: 'all' })}>Clear filters</button>
          )}
        </div>
      ) : (
        <section className={styles.stack} aria-label="Guests">
          {shown.filter((g) => !(mode.kind === 'edit' && mode.guest.id === g.id)).map((g) =>
            (
              <article key={g.id} className={styles.card} aria-label={`Guest ${g.name}`}>
                <div className={styles.rowBetween}>
                  <h3 className={`${styles.h3} ${x.textWrap}`}>{g.name}{g.party_size > 1 ? ` +${g.party_size - 1}` : ''}</h3>
                  <span className={styles.chip}>{SIDE_LABEL[g.side]}</span>
                </div>
                <p className={styles.muted}>Party of {g.party_size}{g.table_label ? ` - ${g.table_label}` : ''}</p>
                <div className={x.rsvpRow} role="group" aria-label={`RSVP for ${g.name}`}>
                  {RSVPS.map((r) => (
                    <button key={r} type="button" aria-pressed={g.rsvp_status === r} disabled={busyId === g.id}
                      className={`${x.rsvpChip} ${g.rsvp_status === r ? x.rsvpChipOn : ''}`} onClick={() => setRsvp(g, r)}>
                      {RSVP_LABEL[r]}
                    </button>
                  ))}
                </div>
                {(g.email || g.phone) && (
                  <p className={x.contact}>
                    {g.email && <span>{g.email}</span>}
                    {g.phone && <span>{g.phone}</span>}
                  </p>
                )}
                <ContactLinks label={g.name} phone={g.phone} email={g.email} />
                {g.dietary_notes && <p className={styles.notes}>Dietary: {g.dietary_notes}</p>}
                {g.notes && <p className={styles.notes}>{g.notes}</p>}
                <div className={styles.actions}>
                  <button type="button" className={styles.btn} aria-label={`Edit ${g.name}`} onClick={() => setMode({ kind: 'edit', guest: g })}>Edit</button>
                  <button type="button" className={styles.btnDanger} aria-label={`Delete ${g.name}`} disabled={remove.isPending}
                    onClick={() => confirmDelete(g)}>Delete</button>
                </div>
              </article>
            )
          )}
        </section>
      )}
    </>
  );
}
