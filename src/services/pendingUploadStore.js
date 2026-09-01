// Local durability for in-flight captures. A capture is persisted here the
// instant it's taken/picked, before the upload attempt even starts, and
// removed only once the upload actually succeeds. If the tab gets
// backgrounded, loses network, or is closed outright mid-upload, the photo
// isn't lost — CameraCapture reloads whatever's still here for the current
// event on mount and resumes uploading it automatically.
//
// IndexedDB, not localStorage: the Blob itself needs to survive, and
// localStorage can't hold binary data (or Blobs aren't cloneable into it).

const DB_NAME = 'capture-by-val-uploads';
const DB_VERSION = 1;
const STORE_NAME = 'pending';

function openDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Private browsing modes, storage-disabled settings, or old browsers can
// make IndexedDB throw or silently no-op. None of that should ever be able
// to block an actual upload — it just means this particular capture won't
// survive a tab close, same as before this feature existed.
async function withStore(mode, run) {
  try {
    const db = await openDB();
    const result = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const request = run(tx.objectStore(STORE_NAME));
      tx.oncomplete = () => resolve(request?.result);
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return result;
  } catch (err) {
    console.error('pendingUploadStore failed:', err);
    return mode === 'readonly' ? [] : undefined;
  }
}

export const savePendingUpload = (item) =>
  withStore('readwrite', (store) => store.put(item));

export const deletePendingUpload = (id) =>
  withStore('readwrite', (store) => store.delete(id));

export const getPendingUploadsForEvent = async (eventId) => {
  const all = (await withStore('readonly', (store) => store.getAll())) || [];
  return all.filter((item) => item.eventId === eventId);
};
