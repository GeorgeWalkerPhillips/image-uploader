import { Link } from 'react-router-dom';
import { Shell } from '../Shell';
import { useSignOut } from '../useSignOut';
import styles from '../wedding.module.css';

// A signed-in account that has not bought the planner and has not been invited.
// Shown instead of silently bouncing to "/", so nobody is left guessing.
export function GetPlannerPage() {
  const signOut = useSignOut();
  return (
    <Shell title="Get the Wedding Planner">
      <section className={styles.card} aria-label="Get the Wedding Planner">
        <h2 className={styles.h2}>A private planner for two</h2>
        <p>
          The Wedding Planner keeps your budget, tasks, guest list, vendors and files in one place, shared only with
          your partner and the helpers you choose. It is a one-time purchase.
        </p>
        <div className={styles.actions}>
          <Link to="/wedding-planner" className={styles.btnPrimary}>See the Wedding Planner</Link>
        </div>
      </section>
      <section className={styles.card} aria-label="Were you invited?">
        <h2 className={styles.h2}>Were you invited to help?</h2>
        <p className={styles.muted}>
          Open the invitation link from your email on this device. You do not need to buy anything to join as a
          partner or helper.
        </p>
      </section>
      <button type="button" className={styles.linkButton} onClick={() => void signOut()}>Sign out</button>
    </Shell>
  );
}
