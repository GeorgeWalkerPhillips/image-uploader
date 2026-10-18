import { formatZar, formatZarCompact, formatZarShort } from '../lib/money';
import type { MonthPoint } from '../lib/spending';
import styles from '../wedding.module.css';

// Hand-rolled SVG charts (no chart dependency). Colours come from the caller
// (the category palette) or from the HQ palette in the stylesheet.

export interface Slice {
  label: string;
  value: number;
  color: string;
}

const pct = (n: number, total: number): number => (total > 0 ? Math.round((n / total) * 100) : 0);

// ------------------------------------------------------------------ donut

const R = 36;
const C = 2 * Math.PI * R;

export function DonutChart({ slices, centerTop, centerBottom, ariaLabel }: {
  slices: readonly Slice[];
  centerTop: string;
  centerBottom: string;
  ariaLabel: string;
}) {
  const shown = slices.filter((s) => s.value > 0);
  const total = shown.reduce((t, s) => t + s.value, 0);
  let offset = 0;
  return (
    <div className={styles.donutWrap}>
      <svg viewBox="0 0 100 100" className={styles.donut} role="img" aria-label={ariaLabel}>
        <g transform="rotate(-90 50 50)" fill="none" strokeWidth="14">
          <circle cx="50" cy="50" r={R} className={styles.ringTrack} />
          {shown.map((s) => {
            const len = (s.value / total) * C;
            const el = (
              <circle key={s.label} cx="50" cy="50" r={R} stroke={s.color}
                strokeDasharray={`${Math.max(0, len - (shown.length > 1 ? 1.2 : 0))} ${C}`}
                strokeDashoffset={-offset} />
            );
            offset += len;
            return el;
          })}
        </g>
        <text x="50" y="49" textAnchor="middle" className={styles.chartCenterTop}>{centerTop}</text>
        <text x="50" y="61" textAnchor="middle" className={styles.chartCenterBottom}>{centerBottom}</text>
      </svg>
      <ul className={styles.legend}>
        {shown.map((s) => (
          <li key={s.label} className={styles.legendItem}>
            <span className={styles.legendDot} style={{ background: s.color }} aria-hidden="true" />
            <span className={styles.legendName}>{s.label}</span>
            <span className={styles.legendValue}>{formatZarShort(s.value)} · {pct(s.value, total)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ------------------------------------------------- planned vs actual bars

export interface BarRow {
  name: string;
  estimated: number;
  committed: number;
  paid: number;
}

const W = 340;
const LABEL_X = 0;
const BAR_X = 0;
const BAR_MAX = 236;
const ROW_H = 66;

export function PlannedActualBars({ rows }: { rows: readonly BarRow[] }) {
  const max = Math.max(1, ...rows.flatMap((r) => [r.estimated, r.committed, r.paid]));
  const len = (n: number) => (n <= 0 ? 0 : Math.max(2, (n / max) * BAR_MAX));
  const series = [
    { key: 'estimated', cls: styles.barEstimated },
    { key: 'committed', cls: styles.barCommitted },
    { key: 'paid', cls: styles.barPaid },
  ] as const;
  return (
    <div>
      <ul className={`${styles.legend} ${styles.legendInline}`}>
        <li className={styles.legendItem}><span className={`${styles.legendDot} ${styles.barEstimated}`} />Estimated</li>
        <li className={styles.legendItem}><span className={`${styles.legendDot} ${styles.barCommitted}`} />Committed</li>
        <li className={styles.legendItem}><span className={`${styles.legendDot} ${styles.barPaid}`} />Paid</li>
      </ul>
      <svg viewBox={`0 0 ${W} ${rows.length * ROW_H}`} className={styles.barsSvg} role="img"
        aria-label={`Estimated, committed and paid for ${rows.length} categories`}>
        {rows.map((r, i) => (
          <g key={r.name + i} transform={`translate(0 ${i * ROW_H})`}>
            <text x={LABEL_X} y="13" className={styles.chartLabel}>
              {r.name.length > 30 ? `${r.name.slice(0, 29)}…` : r.name}
            </text>
            {series.map((s, j) => {
              const value = r[s.key];
              const y = 20 + j * 14;
              return (
                <g key={s.key}>
                  <rect x={BAR_X} y={y} width={BAR_MAX} height="10" rx="5" className={styles.barTrack} />
                  <rect x={BAR_X} y={y} width={len(value)} height="10" rx="5"
                    className={s.key === 'committed' && r.committed > r.estimated && r.estimated > 0 ? styles.barOver : s.cls}>
                    <title>{`${s.key}: ${formatZar(value)}`}</title>
                  </rect>
                  <text x={BAR_MAX + 8} y={y + 9} className={styles.chartValue}>{formatZarShort(value)}</text>
                </g>
              );
            })}
          </g>
        ))}
      </svg>
    </div>
  );
}

// ------------------------------------------------------------ monthly bars


const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function MonthlyBars({ points, currentMonth }: { points: readonly MonthPoint[]; currentMonth: string }) {
  const COL = 44;
  const H = 190;
  const TOP = 22;
  const BASE = H - 30;
  const width = Math.max(320, points.length * COL);
  const max = Math.max(1, ...points.flatMap((p) => [p.paidCents, p.dueCents]));
  const h = (n: number) => (n <= 0 ? 0 : Math.max(3, (n / max) * (BASE - TOP)));
  return (
    <div>
      <ul className={`${styles.legend} ${styles.legendInline}`}>
        <li className={styles.legendItem}><span className={`${styles.legendDot} ${styles.barPaid}`} />Paid</li>
        <li className={styles.legendItem}><span className={`${styles.legendDot} ${styles.barDue}`} />Still due</li>
      </ul>
      <div className={styles.hScroll} tabIndex={0} aria-label="Monthly spending graph, scrolls sideways">
        <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} className={styles.monthSvg} role="img"
          aria-label={`Paid and still due by month, ${points.length} months`}>
          <line x1="0" x2={width} y1={BASE} y2={BASE} className={styles.axis} />
          {points.map((p, i) => {
            const x = i * COL + COL / 2;
            const [year = '', month = '1'] = p.month.split('-');
            const label = MONTHS[Number(month) - 1] ?? p.month;
            const first = i === 0 || month === '01';
            return (
              <g key={p.month}>
                {p.paidCents > 0 && (
                  <>
                    <rect x={x - 15} y={BASE - h(p.paidCents)} width="14" height={h(p.paidCents)} rx="4" className={styles.barPaid} />
                    <text x={x - 8} y={BASE - h(p.paidCents) - 4} textAnchor="middle" className={styles.chartTiny}>{formatZarCompact(p.paidCents)}</text>
                  </>
                )}
                {p.dueCents > 0 && (
                  <>
                    <rect x={x + 1} y={BASE - h(p.dueCents)} width="14" height={h(p.dueCents)} rx="4" className={styles.barDue} />
                    <text x={x + 8} y={BASE - h(p.dueCents) - 4} textAnchor="middle" className={styles.chartTiny}>{formatZarCompact(p.dueCents)}</text>
                  </>
                )}
                <text x={x} y={BASE + 14} textAnchor="middle"
                  className={p.month === currentMonth ? styles.chartMonthNow : styles.chartMonth}>{label}</text>
                {first && <text x={x} y={BASE + 26} textAnchor="middle" className={styles.chartTiny}>{year}</text>}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
