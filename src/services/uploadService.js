import { supabase } from '../supabaseClient';
import {
  validateImage,
  getImageDimensions,
  compressImage,
} from '../utils/imageValidation';
import { checkRateLimit } from '../utils/rateLimiter';

export const uploadImage = async (
  file,
  eventId,
  userId,
  onProgress = null
) => {
  try {
    checkRateLimit();

    const validationErrors = validateImage(file);
    if (validationErrors.length > 0) {
      throw new Error(validationErrors.join(', '));
    }

    const compressedFile = await compressImage(file);

    const { width, height } = await getImageDimensions(compressedFile);

    const fileName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${compressedFile.name}`;
    const storagePath = `${eventId}/${fileName}`;

    const { data, error: uploadError } = await supabase.storage
      .from('event-photos')
      .upload(storagePath, compressedFile, {
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const { error: dbError } = await supabase.from('photos').insert({
      event_id: eventId,
      uploaded_by: userId,
      storage_path: storagePath,
      file_name: compressedFile.name,
      file_size: compressedFile.size,
      mime_type: compressedFile.type,
      width,
      height,
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
