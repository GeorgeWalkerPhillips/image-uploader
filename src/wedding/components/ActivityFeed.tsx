import { Link } from 'react-router-dom';
import { useWedding } from '../WeddingContext';
import { useActivity } from '../extrasHooks';
import { formatActivityTime } from '../lib/activity';
import { useNow } from './useNow';
import { Skeleton } from './Skeleton';
import { ErrorRetry } from './ErrorRetry';
import styles from '../wedding.module.css';
import x from '../extras.module.css';

// "Recent activity" card: the latest entries, newest first. `limit` makes the
// compact Home version.
export function ActivityFeed({ limit, compact = false }: { limit: number; compact?: boolean }) {
  const { wedding } = useWedding();
  const query = useActivity(wedding.id);
  const now = useNow(60000);
  const entries = (query.data ?? []).slice(0, limit);

  return (
    <section className={styles.card} aria-label="Recent activity">
      <div className={styles.rowBetween}>
        <h2 className={styles.h2}>Recent activity</h2>
        {compact && <Link to="/hq/activity" className={styles.link}>See all</Link>}
      </div>
      {query.isLoading ? (
        <Skeleton height={compact ? 120 : 200} />
      ) : query.isError && query.data === undefined ? (
        <ErrorRetry message="Could not load recent activity." onRetry={() => void query.refetch()} />
      ) : entries.length === 0 ? (
        <p className={styles.muted}>Nothing yet. Finishing tasks, adding payments and accepting quotes will show up here.</p>
      ) : (
        <ul className={x.feed}>
          {entries.map((e) => (
            <li key={e.id} className={x.feedItem}>
              <span>
                <strong>{e.actor_name}</strong> {e.action.charAt(0).toLowerCase() + e.action.slice(1)}
                {e.subject ? `: ${e.subject}` : ''}
              </span>
              <span className={x.feedTime}>{formatActivityTime(e.created_at, now)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
