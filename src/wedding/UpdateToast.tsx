import { toast } from 'react-toastify';
import styles from './wedding.module.css';

function UpdateToast({ onReload }: { onReload: () => void }) {
  return (
    <div className={styles.updateToast}>
      <span>Update available.</span>
      <button type="button" className={styles.btn} onClick={onReload}>
        Reload
      </button>
    </div>
  );
}

export function showUpdateToast(onReload: () => void): void {
  toast.info(<UpdateToast onReload={onReload} />, {
    position: 'top-center',
    toastId: 'hq-update',
    autoClose: false,
    closeOnClick: false,
    className: styles.hqToast,
  });
}
