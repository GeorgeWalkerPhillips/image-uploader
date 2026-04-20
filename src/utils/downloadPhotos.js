import JSZip from 'jszip';

export const downloadPhotosAsZip = async (eventName, photos) => {
  if (photos.length === 0) {
    throw new Error('No photos to download');
  }

  const zip = new JSZip();
  const folder = zip.folder(eventName || 'event-photos');

  try {
    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i];
      const response = await fetch(photo.url);
      const blob = await response.blob();

      const fileName = `photo-${String(i + 1).padStart(3, '0')}.jpg`;
      folder.file(fileName, blob);
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${eventName || 'photos'}-${new Date().toISOString().split('T')[0]}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    return true;
  } catch (error) {
    console.error('ZIP creation failed:', error);
    throw new Error('Failed to create ZIP file');
  }
};
