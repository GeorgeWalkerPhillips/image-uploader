import { buildStoragePath, resolveContentType, validateFile } from './files';
import type { FileKind } from './files';

// The storage calls, injectable so the ordering rules below are unit-testable.
export interface AttachmentStore {
  upload: (path: string, file: File, contentType: string) => Promise<void>;
  remove: (paths: string[]) => Promise<void>;
}

// Thrown for upload problems so the page can show a friendly message. Database
// errors are not wrapped: the mutation hooks already toast those.
export class AttachmentError extends Error {}

export interface SaveWithAttachmentArgs<T> {
  store: AttachmentStore;
  weddingId: string;
  kind: FileKind;
  file: File | null;
  removeExisting: boolean;
  oldPath: string | null;
  // Receives the new object path, null (clear the column) or undefined (leave
  // the column alone), and performs the database write.
  write: (path: string | null | undefined) => Promise<T>;
}

export async function removeBestEffort(store: AttachmentStore, paths: readonly (string | null)[]): Promise<void> {
  const real = paths.filter((p): p is string => !!p);
  if (real.length === 0) return;
  try {
    await store.remove(real);
  } catch {
    // An orphaned private object is harmless; never fail the user's action for it.
  }
}

// Order: validate -> upload -> database write. If the write fails the new
// object is removed again; only after it succeeds is the replaced or removed
// old object deleted (best effort), so a failure never loses the old file.
export async function saveWithAttachment<T>(a: SaveWithAttachmentArgs<T>): Promise<T> {
  let newPath: string | undefined;
  if (a.file) {
    const problem = validateFile(a.file);
    if (problem) throw new AttachmentError(problem);
    newPath = buildStoragePath(a.weddingId, a.kind, a.file.name);
    try {
      await a.store.upload(newPath, a.file, resolveContentType(a.file));
    } catch (e) {
      throw new AttachmentError(
        `Could not upload the file${e instanceof Error && e.message ? ` (${e.message})` : ''}. Nothing was saved.`
      );
    }
  }

  let result: T;
  try {
    result = await a.write(newPath ?? (a.removeExisting ? null : undefined));
  } catch (e) {
    if (newPath) await removeBestEffort(a.store, [newPath]);
    throw e;
  }

  if ((newPath || a.removeExisting) && a.oldPath && a.oldPath !== newPath) {
    await removeBestEffort(a.store, [a.oldPath]);
  }
  return result;
}
