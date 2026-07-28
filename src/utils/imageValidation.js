const MAX_FILE_SIZE = parseInt(
  process.env.REACT_APP_MAX_FILE_SIZE || '31457280',
  10
); // 30MB default — enough headroom for an uncompressed phone photo

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

// Guests' phones already produce reasonably-sized JPEGs — resizing or
// re-encoding those on top would only throw away detail they actually
// captured, for no real benefit. The one format that genuinely needs
// touching is HEIC/HEIF: every browser except Safari fails to render it at
// all (in this camera roll picker, in the shared gallery's <img> tags,
// everywhere), so those get converted to a maximum-quality JPEG purely for
// compatibility — not compressed down.
const NEEDS_JPEG_CONVERSION = new Set(['image/heic', 'image/heif']);

// Not a real-world cap — actual phone photos never get near this. Purely a
// backstop against a canvas blowing up on a pathological input dimension.
const MAX_SAFE_DIMENSION = 8000;

export const normalizeImage = async (file) => {
  if (!NEEDS_JPEG_CONVERSION.has(file.type)) {
    return file;
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        let { width, height } = img;
        if (width > MAX_SAFE_DIMENSION || height > MAX_SAFE_DIMENSION) {
          const scale = MAX_SAFE_DIMENSION / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            resolve(
              new File([blob], file.name.replace(/\.(heic|heif)$/i, '.jpg'), {
                type: 'image/jpeg',
                lastModified: Date.now(),
              })
            );
          },
          'image/jpeg',
          1
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
