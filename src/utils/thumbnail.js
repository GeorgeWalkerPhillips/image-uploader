// Gallery thumbnails. The grid used to load every full-resolution original
// (avg ~4.5 MB each), which blew the project's CDN egress quota; a ~600px JPEG
// is ~40-80 KB. The full photo is only fetched when someone opens it.

export const THUMB_MAX_EDGE = 600;
export const THUMB_QUALITY = 0.72;

// The DB CHECK constraint photos_thumb_path_matches_storage_path requires
// exactly this value (photo-thumbnails-2026-11.sql). Keep the two in sync.
export const thumbPathFor = (storagePath) => `${storagePath}.thumb.jpg`;

// Largest size that fits inside maxEdge on its longest side, never upscaling.
export const fitWithin = (width, height, maxEdge = THUMB_MAX_EDGE) => {
  if (!width || !height || width <= 0 || height <= 0) return null;
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
};

const loadImage = (blob) =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read image for thumbnail'));
    };
    img.src = url;
  });

// Resolves to a JPEG Blob, or rejects. Callers must treat a failure as
// non-fatal: a photo without a thumbnail still works (the app falls back to the
// original), it is just heavier to show.
export const createThumbnail = async (blob) => {
  const img = await loadImage(blob);
  const size = fitWithin(img.naturalWidth || img.width, img.naturalHeight || img.height);
  if (!size) throw new Error('Image has no dimensions');

  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.drawImage(img, 0, 0, size.width, size.height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (out) => {
        if (!out || out.size === 0) {
          reject(new Error('Thumbnail encode produced an empty file'));
          return;
        }
        resolve(out);
      },
      'image/jpeg',
      THUMB_QUALITY
    );
  });
};
