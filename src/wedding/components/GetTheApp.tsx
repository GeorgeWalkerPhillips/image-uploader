import { InstallAppCard } from './InstallAppCard';
import { OfflineSaveCard } from './OfflineSaveCard';
import styles from '../wedding.module.css';
import s from './install.module.css';

// The permanent "Get the app" block: More (couple) and the helper app's footer.
export function GetTheApp({ weddingId, variant }: { weddingId: string; variant: 'partner' | 'helper' }) {
  return (
    <section className={styles.stack} aria-labelledby="hq-getapp-heading">
      <h2 id="hq-getapp-heading" className={`${styles.h2} ${s.getAppHeading}`}>Get the app</h2>
      <InstallAppCard variant="section" />
      <OfflineSaveCard weddingId={weddingId} variant={variant} />
    </section>
  );
}
