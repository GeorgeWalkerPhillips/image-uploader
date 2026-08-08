const MAX_FILE_SIZE = parseInt(
  process.env.REACT_APP_MAX_FILE_SIZE || '10485760',
  10
); // 10MB default

const ALLOWED_MIME_TYPES = (
  process.env.REACT_APP_ALLOWED_MIME_TYPES ||
  'image/jpeg,image/png,image/webp,image/heic'
).split(',');

export const validateImage = (file) => {
  const errors = [];

  if (!file) {
    errors.push('No file provided');
    return errors;
  }

  // Mobile browsers can occasionally hand back a File with real metadata
  // (name/type) but no actual bytes — e.g. iOS Safari under memory
  // pressure after the native camera app returns control. Uploading that
  // straight to Supabase Storage fails with an opaque "No content
  // provided" error, so catch it here with a message that tells the guest
  // what to actually do about it.
  if (file.size === 0) {
    errors.push('This photo appears to be empty. Please retake it.');
    return errors;
  }

  if (file.size > MAX_FILE_SIZE) {
    errors.push(
      `File too large. Max size: ${Math.round(MAX_FILE_SIZE / 1024 / 1024)}MB`
    );
  }

  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    errors.push(`Invalid file type. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`);
  }

  const dangerousExtensions = ['.exe', '.bat', '.cmd', '.sh', '.app', '.js'];
  const fileName = file.name.toLowerCase();
  if (dangerousExtensions.some((ext) => fileName.endsWith(ext))) {
    errors.push('Dangerous file type not allowed');
  }

  return errors;
};

export const getImageDimensions = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        resolve({ width: img.width, height: img.height });
      };
      img.onerror = () => {
        reject(new Error('Invalid image'));
      };
      img.src = e.target.result;
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    reader.readAsDataURL(file);
  });
};

export const compressImage = async (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        const maxDimension = 3000;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxDimension) {
            height *= maxDimension / width;
            width = maxDimension;
          }
        } else {
          if (height > maxDimension) {
            width *= maxDimension / height;
            height = maxDimension;
          }
        }

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            // toBlob's own docs call this out: blob can come back null (or,
            // on some mobile WebKit versions, a non-null Blob with size 0)
            // "if the image is too large or if there is not enough
            // memory" — easy to hit when several full-resolution photos
            // are being compressed at once on a phone. Reject explicitly
            // instead of silently resolving a File wrapping no real image
            // data — the caller falls back to uploading the uncompressed
            // original rather than losing the photo.
            if (!blob || blob.size === 0) {
              reject(new Error('Image compression produced an empty file'));
              return;
            }

            resolve(
              new File([blob], file.name, {
                type: 'image/jpeg',
                lastModified: Date.now(),
              })
            );
          },
          'image/jpeg',
          0.92
        );
      };

      img.onerror = () => {
        reject(new Error('Failed to process image'));
      };

      img.src = e.target.result;
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    reader.readAsDataURL(file);
  });
};
