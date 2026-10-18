import { supabase } from '../supabaseClient';
import { isOwnPath } from './lib/files';
import type { AttachmentStore } from './lib/attachments';
import { assertOnline, isOnline } from './useOnline';

// The only place Wedding HQ touches Storage. The bucket is private: files are
// only ever viewed through short-lived signed URLs (never getPublicUrl).
export const BUCKET = 'wedding-files';
const SIGNED_URL_SECONDS = 300;

export const supabaseAttachmentStore: AttachmentStore = {
  async upload(path, file, contentType) {
    assertOnline();
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
      contentType,
      upsert: false,
      cacheControl: '3600',
    });
    if (error) throw new Error(error.message);
  },
  async remove(paths) {
    assertOnline();
    const { error } = await supabase.storage.from(BUCKET).remove(paths);
    if (error) throw new Error(error.message);
  },
};

// A 5 minute link to one of our own files.
export async function createFileUrl(weddingId: string, path: string): Promise<string> {
  if (!isOwnPath(path, weddingId)) throw new Error('That file is not available.');
  // Files are private and only opened through short-lived links, never cached.
  if (!isOnline()) throw new Error("You're offline. Files can only be opened when you're online.");
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS);
  if (error || !data?.signedUrl) throw new Error(error?.message ?? 'Could not open the file.');
  return data.signedUrl;
}
