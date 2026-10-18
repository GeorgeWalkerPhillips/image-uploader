import { useState } from 'react';
import { useWedding } from '../WeddingContext';
import { createFileUrl } from '../storage';
import { notify } from '../notify';
import styles from '../wedding.module.css';

// Opens a private file through a 5 minute signed URL created on click.
export function AttachmentLink({ path, label = 'View file' }: { path: string; label?: string }) {
  const { wedding } = useWedding();
  const [busy, setBusy] = useState(false);

  const open = async () => {
    setBusy(true);
    // Open the tab inside the click so iOS Safari does not block it, then
    // point it at the signed URL once we have it.
    const tab = window.open('about:blank', '_blank');
    try {
      const url = await createFileUrl(wedding.id, path);
      if (tab) {
        tab.opener = null;
        tab.location.href = url;
      } else {
        window.location.assign(url);
      }
    } catch (e) {
      tab?.close();
      notify.error(e instanceof Error ? e.message : 'Could not open the file.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button type="button" className={styles.linkButton} onClick={() => void open()} disabled={busy}>
      {busy ? 'Opening...' : label}
    </button>
  );
}
