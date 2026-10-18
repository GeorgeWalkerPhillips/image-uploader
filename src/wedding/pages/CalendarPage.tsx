import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useWedding } from '../WeddingContext';
import { useBudgetData, useDeleteRow, useEvents, useItinerary, useSaveRow, useTasks } from '../hooks';
import { notify } from '../notify';
import { Skeleton } from '../components/Skeleton';
import { ErrorRetry } from '../components/ErrorRetry';
import { useNow } from '../components/useNow';
import { EventForm } from '../components/EventForm';
import {
  agenda, buildCalendarItems, filterLayers, itemsByDate, LAYERS, monthGrid, shiftMonth, weekDays,
} from '../lib/calendar';
import type { CalendarEventRow, CalendarItem, Layer } from '../lib/calendar';
import type { EventPayload } from '../lib/eventForm';
import { buildICS } from '../lib/ics';
import { downloadTextFile } from '../lib/download';
import { formatZar } from '../lib/money';
import { addDaysISO, formatDateJhb, TZ, todayJhbISO } from '../lib/time';
import styles from '../wedding.module.css';

type View = 'month' | 'week' | 'agenda';
type Editing = { mode: 'closed' } | { mode: 'new'; date: string } | { mode: 'edit'; event: CalendarEventRow };

export const LAYER_LABELS: Record<Layer, string> = {
  events: 'Events', tasks: 'Tasks', payments: 'Payments', honeymoon: 'Honeymoon',
};
const LAYER_CLASS: Record<Layer, string> = {
  events: styles.layer_events ?? '',
  tasks: styles.layer_tasks ?? '',
  payments: styles.layer_payments ?? '',
  honeymoon: styles.layer_honeymoon ?? '',
};

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const AGENDA_DAYS = 60;

const timeFmt = new Intl.DateTimeFormat('en-ZA', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
const itemTime = (i: CalendarItem): string | null => (i.allDay || !i.startsAt ? null : timeFmt.format(new Date(i.startsAt)));
const monthTitle = (year: number, month1: number): string =>
  formatDateJhb(`${year}-${String(month1).padStart(2, '0')}-15`, { month: 'long', year: 'numeric' });

export function CalendarPage() {
  const { wedding } = useWedding();
  const eventsQuery = useEvents(wedding.id);
  const tasksQuery = useTasks(wedding.id);
  const itineraryQuery = useItinerary(wedding.id);
  const budget = useBudgetData(wedding.id);
  const saveEvent = useSaveRow<CalendarEventRow>('wedding_events', wedding.id);
  const deleteEvent = useDeleteRow('wedding_events', wedding.id);

  const today = todayJhbISO(useNow(60000));
  const [view, setView] = useState<View>('month');
  const [cursor, setCursor] = useState(() => ({ year: Number(today.slice(0, 4)), month1: Number(today.slice(5, 7)) }));
  const [weekOf, setWeekOf] = useState(today);
  const [selected, setSelected] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<Layer[]>([...LAYERS]);
  const [editing, setEditing] = useState<Editing>({ mode: 'closed' });
  const [saving, setSaving] = useState(false);

  const events = useMemo(() => eventsQuery.data ?? [], [eventsQuery.data]);
  const tasks = useMemo(() => tasksQuery.data ?? [], [tasksQuery.data]);
  const itinerary = useMemo(() => itineraryQuery.data ?? [], [itineraryQuery.data]);
  const { invoices, payments } = budget;

  const allItems = useMemo(
    () =>
      buildCalendarItems({
        events, tasks, invoices, payments, itinerary,
        weddingDate: wedding.wedding_date,
        honeymoonStart: wedding.honeymoon_start,
        honeymoonDays: wedding.honeymoon_days,
        todayISO: today,
      }),
    [events, tasks, invoices, payments, itinerary, wedding.wedding_date, wedding.honeymoon_start, wedding.honeymoon_days, today]
  );
  const items = useMemo(() => filterLayers(allItems, enabled), [allItems, enabled]);
  const byDate = useMemo(() => itemsByDate(items), [items]);

  const toggleLayer = (layer: Layer) =>
    setEnabled((cur) => (cur.includes(layer) ? cur.filter((l) => l !== layer) : [...cur, layer]));

  const exportIcs = () => {
    const ics = buildICS(items, { calendarName: 'Wedding HQ' });
    downloadTextFile('wedding-hq.ics', ics, 'text/calendar;charset=utf-8');
  };

  const submitEvent = async (payload: EventPayload) => {
    const existing = editing.mode === 'edit' ? editing.event : null;
    setSaving(true);
    try {
      await saveEvent.mutateAsync({ id: existing?.id, values: { ...payload } });
      notify.success('Event saved');
      setEditing({ mode: 'closed' });
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Could not save the event.');
    } finally {
      setSaving(false);
    }
  };

  const removeEvent = (event: CalendarEventRow) => {
    if (!window.confirm(`Delete "${event.title}"? This cannot be undone.`)) return;
    deleteEvent.mutate(event.id, {
      onSuccess: () => {
        notify.success('Event deleted');
        setEditing({ mode: 'closed' });
      },
    });
  };

  const loading = eventsQuery.isLoading || tasksQuery.isLoading || itineraryQuery.isLoading || budget.loading;
  if (loading) return <><Skeleton height={56} /><Skeleton height={340} /></>;

  const failed = [eventsQuery, tasksQuery, itineraryQuery].filter((q) => q.isError && q.data === undefined);
  if (failed.length > 0 || budget.isError) {
    return (
      <div className={styles.card}>
        <ErrorRetry
          message="Could not load the calendar."
          onRetry={() => {
            failed.forEach((q) => void q.refetch());
            budget.refetch();
          }}
        />
      </div>
    );
  }

  if (editing.mode !== 'closed') {
    const event = editing.mode === 'edit' ? editing.event : undefined;
    return (
      <EventForm key={event?.id ?? 'new'} {...(event ? { initial: event } : { defaultDate: editing.mode === 'new' ? editing.date : '' })}
        saving={saving} onSubmit={(p) => void submitEvent(p)} onCancel={() => setEditing({ mode: 'closed' })}
        {...(event ? { onDelete: () => removeEvent(event) } : {})} />
    );
  }

  const editFor = (item: CalendarItem): CalendarEventRow | null =>
    item.source === 'event' ? events.find((e) => `event:${e.id}` === item.id) ?? null : null;

  const itemRow = (item: CalendarItem, keySuffix = '') => {
    const time = itemTime(item);
    const event = editFor(item);
    const link = item.source === 'task' ? `/hq/tasks?task=${item.id.slice(5)}`
      : item.source === 'invoice' ? `/hq/invoices?invoice=${item.id.slice(8)}` : null;
    const body = (
      <>
        <span className={`${styles.layerDot} ${LAYER_CLASS[item.layer]}`} aria-hidden="true" />
        <span className={styles.itemMain}>
          <strong className={item.done ? styles.taskDone : undefined}>{item.title}</strong>
          <span className={styles.muted}>
            {[
              LAYER_LABELS[item.layer],
              item.allDay ? (item.date !== item.endDate ? `${formatDateJhb(item.date, { day: 'numeric', month: 'short' })} to ${formatDateJhb(item.endDate, { day: 'numeric', month: 'short' })}` : 'All day') : time,
              item.subtitle,
              item.location,
            ].filter(Boolean).join(' · ')}
          </span>
        </span>
        {item.amountCents !== null && <span className={styles.timelineAmount}>{formatZar(item.amountCents)}</span>}
      </>
    );
    const cls = `${styles.itemRow} ${item.urgency === 'overdue' && !item.done ? styles.itemOverdue : ''}`;
    return (
      <li key={`${item.id}${keySuffix}`}>
        {event ? (
          <button type="button" className={cls} aria-label={`Edit event ${item.title}`}
            onClick={() => setEditing({ mode: 'edit', event })}>{body}</button>
        ) : link ? (
          <Link to={link} className={cls}>{body}</Link>
        ) : (
          <div className={cls}>{body}</div>
        )}
      </li>
    );
  };

  const dayList = (date: string) => {
    const list = byDate.get(date) ?? [];
    return list.length === 0 ? (
      <p className={styles.muted}>Nothing on this day.</p>
    ) : (
      <ul className={styles.itemList}>{list.map((i) => itemRow(i, `@${date}`))}</ul>
    );
  };

  const dayHeading = (date: string) => formatDateJhb(date, { weekday: 'long', day: 'numeric', month: 'long' });

  const detail = selected && (
    <section className={styles.card} aria-label={`Day detail ${selected}`}>
      <div className={styles.rowBetween}>
        <h2 className={styles.h2}>{dayHeading(selected)}</h2>
        <button type="button" className={styles.linkButton} onClick={() => setSelected(null)}>Close</button>
      </div>
      {dayList(selected)}
      <div className={styles.actions}>
        <button type="button" className={styles.btn} onClick={() => setEditing({ mode: 'new', date: selected })}>
          Add event on this day
        </button>
      </div>
    </section>
  );

  const weeks = monthGrid(cursor.year, cursor.month1);

  return (
    <>
      <button type="button" className={styles.btnPrimary} onClick={() => setEditing({ mode: 'new', date: selected ?? today })}>
        Add event
      </button>

      <div className={styles.segmented} role="group" aria-label="Calendar view">
        {(['month', 'week', 'agenda'] as const).map((v) => (
          <button key={v} type="button" aria-pressed={view === v}
            className={`${styles.segment} ${view === v ? styles.segmentActive : ''}`} onClick={() => setView(v)}>
            {v === 'month' ? 'Month' : v === 'week' ? 'Week' : 'Agenda'}
          </button>
        ))}
      </div>

      <div className={styles.chipToggles} role="group" aria-label="Layers">
        {LAYERS.map((l) => (
          <button key={l} type="button" aria-pressed={enabled.includes(l)}
            className={`${styles.toggleChip} ${enabled.includes(l) ? styles.toggleChipOn : ''}`}
            onClick={() => toggleLayer(l)}>
            <span className={`${styles.layerDot} ${LAYER_CLASS[l]}`} aria-hidden="true" />
            {LAYER_LABELS[l]}
          </button>
        ))}
      </div>

      {view === 'month' && (
        <section className={styles.card} aria-label="Month">
          <div className={styles.calNav}>
            <button type="button" className={styles.calArrow} aria-label="Previous month"
              onClick={() => setCursor(shiftMonth(cursor.year, cursor.month1, -1))}>‹</button>
            <h2 className={styles.calTitle}>{monthTitle(cursor.year, cursor.month1)}</h2>
            <button type="button" className={styles.calArrow} aria-label="Next month"
              onClick={() => setCursor(shiftMonth(cursor.year, cursor.month1, 1))}>›</button>
          </div>
          <div className={styles.calHead} aria-hidden="true">
            {WEEKDAYS.map((d) => <span key={d}>{d}</span>)}
          </div>
          <div className={styles.calGrid}>
            {weeks.flat().map((day) => {
              const list = byDate.get(day.date) ?? [];
              const layersHere = LAYERS.filter((l) => list.some((i) => i.layer === l));
              const label = `${dayHeading(day.date)}, ${list.length} ${list.length === 1 ? 'item' : 'items'}`;
              return (
                <button key={day.date} type="button" aria-label={label} aria-pressed={selected === day.date}
                  className={`${styles.calDay} ${day.inMonth ? '' : styles.calOut} ${day.date === today ? styles.calToday : ''} ${selected === day.date ? styles.calSelected : ''}`}
                  onClick={() => setSelected(selected === day.date ? null : day.date)}>
                  <span className={styles.calNum}>{day.day}</span>
                  <span className={styles.calDots} aria-hidden="true">
                    {layersHere.map((l) => <span key={l} className={`${styles.layerDot} ${LAYER_CLASS[l]}`} />)}
                    {list.length > layersHere.length && <span className={styles.calMore}>+{list.length - layersHere.length}</span>}
                  </span>
                </button>
              );
            })}
          </div>
          <div className={styles.actions}>
            <button type="button" className={styles.btn} onClick={() => {
              setCursor({ year: Number(today.slice(0, 4)), month1: Number(today.slice(5, 7)) });
              setSelected(today);
            }}>Today</button>
          </div>
        </section>
      )}

      {view === 'month' && detail}

      {view === 'week' && (
        <>
          <div className={styles.calNav}>
            <button type="button" className={styles.calArrow} aria-label="Previous week"
              onClick={() => setWeekOf(addDaysISO(weekOf, -7))}>‹</button>
            <h2 className={styles.calTitle}>
              {formatDateJhb(weekDays(weekOf)[0] ?? weekOf, { day: 'numeric', month: 'short' })} to{' '}
              {formatDateJhb(weekDays(weekOf)[6] ?? weekOf, { day: 'numeric', month: 'short' })}
            </h2>
            <button type="button" className={styles.calArrow} aria-label="Next week"
              onClick={() => setWeekOf(addDaysISO(weekOf, 7))}>›</button>
          </div>
          {weekDays(weekOf).map((date) => (
            <section key={date} className={`${styles.card} ${date === today ? styles.weekToday : ''}`} aria-label={`Week day ${date}`}>
              <h3 className={styles.h3}>{dayHeading(date)}{date === today ? ' · Today' : ''}</h3>
              {dayList(date)}
            </section>
          ))}
          <div className={styles.actions}>
            <button type="button" className={styles.btn} onClick={() => setWeekOf(today)}>This week</button>
          </div>
        </>
      )}

      {view === 'agenda' && (
        <section className={styles.stack} aria-label="Agenda">
          {(() => {
            const days = agenda(items, today, AGENDA_DAYS);
            if (days.length === 0) {
              return <div className={styles.card}><p className={styles.muted}>Nothing in the next {AGENDA_DAYS} days.</p></div>;
            }
            return days.map((d) => (
              <div key={d.date} className={styles.card}>
                <h3 className={styles.h3}>{dayHeading(d.date)}{d.date === today ? ' · Today' : ''}</h3>
                <ul className={styles.itemList}>{d.items.map((i) => itemRow(i, `@${d.date}`))}</ul>
              </div>
            ));
          })()}
        </section>
      )}

      <section className={styles.card} aria-label="Export">
        <h2 className={styles.h2}>Phone calendar</h2>
        <button type="button" className={styles.btn} onClick={exportIcs}>Add to my phone calendar (.ics)</button>
        <p className={styles.muted}>Includes the layers switched on above. On iPhone, open the file and choose Add All.</p>
      </section>
    </>
  );
}
