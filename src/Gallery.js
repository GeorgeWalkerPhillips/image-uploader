import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { FaChevronLeft, FaChevronRight, FaTimes, FaDownload, FaCheckSquare, FaThLarge, FaUserFriends } from 'react-icons/fa';
import { supabase } from './supabaseClient';
import { getPublicPhotoUrl } from './services/uploadService';
import { downloadPhotosAsZip } from './utils/downloadPhotos';
import { BottomNav } from './components/BottomNav';
import { useAuth } from './context/AuthContext';
import './Gallery.css';

const UNNAMED_ALBUM = 'Guest';

function Gallery() {
  const [searchParams] = useSearchParams();
  const eventId = searchParams.get('event');
  const { user } = useAuth();

  const [eventName, setEventName] = useState('');
  const [eventOwnerId, setEventOwnerId] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [showViewer, setShowViewer] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [touchStart, setTouchStart] = useState(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [downloading, setDownloading] = useState(false);
  const [viewMode, setViewMode] = useState('albums'); // 'albums' | 'all'

  const PHOTOS_PER_PAGE = 20;

  useEffect(() => {
    if (!eventId) return;

    const fetchEventName = async () => {
      const { data } = await supabase
        .from('events')
        .select('name, created_by')
        .eq('id', eventId)
        .single();
      if (data) {
        setEventName(data.name);
        setEventOwnerId(data.created_by);
      }
    };

    fetchEventName();
  }, [eventId]);

  const fetchPhotosCallback = React.useCallback(async (newOffset) => {
    if (!eventId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('photos')
        .select('id, storage_path, uploaded_at, width, height, uploader_name')
        .eq('event_id', eventId)
        .order('uploaded_at', { ascending: false })
        .range(newOffset, newOffset + PHOTOS_PER_PAGE - 1);

      if (error) throw error;

      const photosWithUrls = data.map((photo) => ({
        id: photo.id,
        url: getPublicPhotoUrl(photo.storage_path),
        storagePath: photo.storage_path,
        uploadedAt: photo.uploaded_at,
        width: photo.width,
        height: photo.height,
        uploaderName: photo.uploader_name || UNNAMED_ALBUM,
      }));

      if (newOffset === 0) {
        setPhotos(photosWithUrls);
      } else {
        setPhotos((prev) => [...prev, ...photosWithUrls]);
      }

      setOffset(newOffset + PHOTOS_PER_PAGE);
      setHasMore(photosWithUrls.length === PHOTOS_PER_PAGE);
    } catch (err) {
      console.error('Error fetching photos:', err);
      toast.error('Failed to load photos');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    fetchPhotosCallback(0);
  }, [eventId, fetchPhotosCallback]);

  const loadMore = () => {
    fetchPhotosCallback(offset);
  };

  const handleTouchStart = (e) => {
    setTouchStart(e.touches[0].clientX);
  };

  const handleTouchEnd = (e) => {
    if (!touchStart) return;
    const delta = e.changedTouches[0].clientX - touchStart;
    if (delta > 50) prevImage();
    if (delta < -50) nextImage();
    setTouchStart(null);
  };

  const prevImage = () => {
    setCurrentIndex((i) => Math.max(0, i - 1));
  };

  const nextImage = () => {
    setCurrentIndex((i) => Math.min(photos.length - 1, i + 1));
  };

  const deletePhoto = async (photoId, storagePath) => {
    if (!window.confirm('Delete this photo? This cannot be undone.')) return;

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

      setPhotos((prev) => prev.filter((p) => p.id !== photoId));
      toast.success('Photo deleted');
    } catch (error) {
      toast.error('Failed to delete photo');
      console.error('Error:', error);
    }
  };

  const toggleSelectMode = () => {
    setSelectMode((prev) => !prev);
    setSelectedIds(new Set());
  };

  const toggleSelected = (photoId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(photoId)) {
        next.delete(photoId);
      } else {
        next.add(photoId);
      }
      return next;
    });
  };

  const downloadPhotos = async (photosToDownload) => {
    if (photosToDownload.length === 0) {
      toast.error('No photos to download');
      return;
    }

    setDownloading(true);
    try {
      toast.info(`Preparing ${photosToDownload.length} photo(s)...`);
      await downloadPhotosAsZip(eventName, photosToDownload);
      toast.success('Download started!');
    } catch (error) {
      toast.error('Download failed: ' + error.message);
      console.error('Download error:', error);
    } finally {
      setDownloading(false);
    }
  };

  const handleDownloadAll = () => downloadPhotos(photos);

  const handleDownloadSelected = () => {
    const selected = photos.filter((p) => selectedIds.has(p.id));
    downloadPhotos(selected).then(() => {
      setSelectMode(false);
      setSelectedIds(new Set());
    });
  };

  const albums = useMemo(() => {
    const byName = new Map();
    for (const photo of photos) {
      const name = photo.uploaderName;
      if (!byName.has(name)) byName.set(name, []);
      byName.get(name).push(photo);
    }

    return [...byName.entries()]
      .map(([name, albumPhotos]) => ({ name, photos: albumPhotos }))
      .sort((a, b) => {
        if (a.name === UNNAMED_ALBUM) return 1;
        if (b.name === UNNAMED_ALBUM) return -1;
        return a.name.localeCompare(b.name);
      });
  }, [photos]);

  const isOwner = Boolean(user && eventOwnerId && user.id === eventOwnerId);

  const renderPhotoTile = (photo, index) => (
    <div key={photo.id} className="gallery-item-wrapper">
      <div
        className="gallery-item"
        onClick={() => {
          if (selectMode) {
            toggleSelected(photo.id);
          } else {
            setCurrentIndex(index);
            setShowViewer(true);
          }
        }}
        style={{ cursor: 'pointer' }}
      >
        <img src={photo.url} alt={`photo-${photo.id}`} loading="lazy" />
        {selectMode && (
          <div className={`select-checkbox ${selectedIds.has(photo.id) ? 'checked' : ''}`}>
            {selectedIds.has(photo.id) && <FaCheckSquare />}
          </div>
        )}
      </div>
      {!selectMode && isOwner && (
        <button
          className="delete-photo-btn"
          onClick={(e) => {
            e.stopPropagation();
            deletePhoto(photo.id, photo.storagePath);
          }}
          title="Delete photo"
        >
          🗑️
        </button>
      )}
    </div>
  );

  if (!eventId) {
    return (
      <div className="gallery-container">
        <div className="gallery-header">
          <h2>Photo Gallery</h2>
        </div>
        <div className="gallery-notice">
          <p>No event selected.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="gallery-container">
      <div className="gallery-header">
        <h2>Photo Gallery</h2>
        <div className="gallery-stats">
          <span>{photos.length} photos</span>
          {photos.length > 0 && (
            <>
              <button
                className="view-toggle-btn"
                onClick={() => setViewMode((m) => (m === 'albums' ? 'all' : 'albums'))}
                title={viewMode === 'albums' ? 'Show all photos in one grid' : 'Group by guest'}
              >
                {viewMode === 'albums' ? <FaThLarge /> : <FaUserFriends />}
                {viewMode === 'albums' ? 'All' : 'Albums'}
              </button>
              <button
                className="select-toggle-btn"
                onClick={toggleSelectMode}
                title={selectMode ? 'Cancel selection' : 'Select photos'}
              >
                <FaCheckSquare /> {selectMode ? 'Cancel' : 'Select'}
              </button>
              <button
                className="download-all-btn"
                onClick={handleDownloadAll}
                disabled={downloading}
                title="Download all photos"
              >
                <FaDownload /> All
              </button>
            </>
          )}
        </div>
      </div>

      <div className="gallery-scroll">
        {loading && photos.length === 0 ? (
          <p className="loading-text">Loading photos...</p>
        ) : photos.length === 0 ? (
          <p className="empty-text">No photos uploaded yet.</p>
        ) : viewMode === 'albums' ? (
          <>
            {albums.map((album) => (
              <div key={album.name} className="album-section">
                <div className="album-header">
                  <h3>{album.name} <span className="album-count">· {album.photos.length}</span></h3>
                  <button
                    className="album-download-btn"
                    onClick={() => downloadPhotos(album.photos)}
                    disabled={downloading}
                    title={`Download ${album.name}'s photos`}
                  >
                    <FaDownload />
                  </button>
                </div>
                <div className="gallery-grid">
                  {album.photos.map((photo) =>
                    renderPhotoTile(photo, photos.findIndex((p) => p.id === photo.id))
                  )}
                </div>
              </div>
            ))}

            {hasMore && (
              <div className="load-more-container">
                <button className="load-more-btn" onClick={loadMore}>
                  Load More Photos
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="gallery-grid">
              {photos.map((photo, index) => renderPhotoTile(photo, index))}
            </div>

            {hasMore && (
              <div className="load-more-container">
                <button className="load-more-btn" onClick={loadMore}>
                  Load More Photos
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {selectMode && (
        <div className="selection-bar">
          <span>{selectedIds.size} selected</span>
          <button
            className="download-selected-btn"
            onClick={handleDownloadSelected}
            disabled={downloading || selectedIds.size === 0}
          >
            <FaDownload /> Download Selected
          </button>
        </div>
      )}

      {showViewer && photos.length > 0 && (
        <div
          className="viewer-overlay"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <button
            className="viewer-close"
            onClick={() => setShowViewer(false)}
            title="Close"
          >
            <FaTimes />
          </button>

          <div className="viewer-image-container">
            <img
              src={photos[currentIndex].url}
              alt="full-view"
              className="viewer-image"
            />
          </div>

          <div className="viewer-controls">
            <button
              className="viewer-btn"
              onClick={prevImage}
              disabled={currentIndex === 0}
              title="Previous"
            >
              <FaChevronLeft />
            </button>
            <span className="viewer-counter">
              {currentIndex + 1} / {photos.length}
            </span>
            <button
              className="viewer-btn"
              onClick={nextImage}
              disabled={currentIndex === photos.length - 1}
              title="Next"
            >
              <FaChevronRight />
            </button>
          </div>
        </div>
      )}

      <BottomNav eventId={eventId} active="gallery" />
    </div>
  );
}

export default Gallery;
