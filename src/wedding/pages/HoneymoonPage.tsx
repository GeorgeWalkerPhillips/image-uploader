import { useSearchParams } from 'react-router-dom';
import { BudgetPage } from './BudgetPage';
import { ItinerarySection } from '../components/HoneymoonItinerary';
import { BookingsSection } from '../components/HoneymoonBookings';
import { PackingSection } from '../components/HoneymoonPacking';
import { DocsSection } from '../components/HoneymoonDocs';
import { CurrencySection } from '../components/HoneymoonCurrency';
import styles from '../wedding.module.css';

const TABS = [
  { key: 'budget', label: 'Budget' },
  { key: 'itinerary', label: 'Itinerary' },
  { key: 'bookings', label: 'Bookings' },
  { key: 'packing', label: 'Packing' },
  { key: 'documents', label: 'Documents' },
  { key: 'currency', label: 'Currency' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

const isTab = (v: string | null): v is TabKey => TABS.some((t) => t.key === v);

// The honeymoon planner. Each tab loads only its own data, so one failing
// table never blanks the others.
export function HoneymoonPage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab: TabKey = isTab(raw) ? raw : 'budget';

  return (
    <>
      <div className={styles.sectionChips} role="group" aria-label="Honeymoon sections">
        {TABS.map((t) => (
          <button key={t.key} type="button" aria-pressed={tab === t.key}
            className={`${styles.toggleChip} ${tab === t.key ? styles.toggleChipOn : ''}`}
            onClick={() => setParams(t.key === 'budget' ? {} : { tab: t.key }, { replace: true })}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'budget' && <BudgetPage fixedScope="honeymoon" />}
      {tab === 'itinerary' && <ItinerarySection />}
      {tab === 'bookings' && <BookingsSection />}
      {tab === 'packing' && <PackingSection />}
      {tab === 'documents' && <DocsSection />}
      {tab === 'currency' && <CurrencySection />}
    </>
  );
}
