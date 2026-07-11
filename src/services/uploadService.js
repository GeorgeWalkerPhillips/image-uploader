import { supabase } from '../supabaseClient';
import {
  validateImage,
  getImageDimensions,
  compressImage,
} from '../utils/imageValidation';
import { checkRateLimit } from '../utils/rateLimiter';
import { logError } from './errorLogger';

export const uploadImage = async (
  file,
  eventId,
  userId,
  onProgress = null,
  uploaderName = null
) => {
  // Tracks which step we were on so a failure log says exactly where it
  // broke (cap check vs. storage upload vs. DB insert), not just "it failed".
  let stage = 'validate';

  try {
    checkRateLimit();

    const validationErrors = validateImage(file);
    if (validationErrors.length > 0) {
      throw new Error(validationErrors.join(', '));
    }

    // Fail fast with a friendly message if this guest is already at their
    // event's per-guest photo limit — the real enforcement is a DB trigger
    // (can't be bypassed), this just avoids wasting a storage upload on a
    // photo that would get rejected anyway.
    stage = 'check_photo_cap';
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('photo_cap_per_guest')
      .eq('id', eventId)
      .single();

    if (eventError) throw eventError;

    if (event?.photo_cap_per_guest != null) {
      const { count, error: countError } = await supabase
        .from('photos')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', eventId)
        .eq('uploaded_by', userId);

      if (countError) throw countError;

      if (count >= event.photo_cap_per_guest) {
        throw new Error(
          `You've reached the ${event.photo_cap_per_guest}-photo limit for this event.`
        );
      }
    }

    stage = 'compress';
    const compressedFile = await compressImage(file);

    const { width, height } = await getImageDimensions(compressedFile);

    // The original filename comes straight from the client and can contain
    // anything (slashes, unicode, control characters) — never build a
    // storage path out of it unsanitized.
    const safeName = compressedFile.name
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(-100) || 'photo.jpg';
    const fileName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${safeName}`;
    const storagePath = `${eventId}/${fileName}`;

    stage = 'storage_upload';
    const { data, error: uploadError } = await supabase.storage
      .from('event-photos')
      .upload(storagePath, compressedFile, {
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) throw uploadError;

    stage = 'db_insert';
    const { error: dbError } = await supabase.from('photos').insert({
      event_id: eventId,
      uploaded_by: userId,
      storage_path: storagePath,
      file_name: compressedFile.name,
      file_size: compressedFile.size,
      mime_type: compressedFile.type,
      width,
      height,
      uploader_name: uploaderName,
    });

    if (dbError) {
      await supabase.storage
        .from('event-photos')
        .remove([storagePath]);

      throw dbError;
    }

    return {
      success: true,
      data: data,
      message: 'Image uploaded successfully',
    };
  } catch (error) {
    console.error('Upload failed:', error);
    logError('uploadImage', error, { stage, eventId, userId });
    return {
      success: false,
      error: error.message,
    };
  }
};

export const getEventPhotos = async (eventId, limit = 50, offset = 0) => {
  try {
    const { data, error } = await supabase
      .from('photos')
      .select('*')
      .eq('event_id', eventId)
      .order('uploaded_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return {
      success: true,
      data: data || [],
    };
  } catch (error) {
    console.error('Failed to fetch photos:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};

export const deletePhoto = async (photoId, storagePath) => {
  try {
    const { error: storageError } = await supabase.storage
      .from('event-photos')
      .remove([storagePath]);

    if (storageError) throw storageError;

    const { error: dbError } = await supabase
      .from('photos')
      .delete()
      .eq('id', photoId);

    if (dbError) throw dbError;

    return {
      success: true,
      message: 'Photo deleted successfully',
    };
  } catch (error) {
    console.error('Delete failed:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};

export const getPublicPhotoUrl = (storagePath) => {
  const { data } = supabase.storage
    .from('event-photos')
    .getPublicUrl(storagePath);

  return data?.publicUrl || null;
};
