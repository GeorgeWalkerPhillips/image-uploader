import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { FaHome, FaCamera, FaCog, FaSignOutAlt, FaChevronLeft, FaChevronRight, FaTimes } from 'react-icons/fa';
import { useAuth } from './context/AuthContext';
import { supabase } from './supabaseClient';
import { getPublicPhotoUrl } from './services/uploadService';
import './Gallery.css';

function Gallery() {
  const [searchParams] = useSearchParams();
  const eventId = searchParams.get('event');
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [showViewer, setShowViewer] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [touchStart, setTouchStart] = useState(null);

  const PHOTOS_PER_PAGE = 20;

  const fetchPhotosCallback = React.useCallback(async (newOffset) => {
    if (!eventId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('photos')
        .select('id, storage_path, uploaded_at, width, height')
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

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/');
    } catch (error) {
      toast.error('Sign out failed');
    }
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
          {user && (
            <button className="logout-btn" onClick={handleSignOut}>
              <FaSignOutAlt />
            </button>
          )}
        </div>
      </div>

      <div className="gallery-scroll">
        {loading && photos.length === 0 ? (
          <p className="loading-text">Loading photos...</p>
        ) : photos.length === 0 ? (
          <p className="empty-text">No photos uploaded yet.</p>
        ) : (
          <>
            <div className="gallery-grid">
              {photos.map((photo, index) => (
                <div key={photo.id} className="gallery-item-wrapper">
                  <div
                    className="gallery-item"
                    onClick={() => {
                      setCurrentIndex(index);
                      setShowViewer(true);
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    <img
                      src={photo.url}
                      alt={`photo-${photo.id}`}
                      loading="lazy"
                    />
                  </div>
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
                </div>
              ))}
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

      <nav className="bottom-nav">
        <button className="nav-btn" onClick={() => navigate('/')} title="Home">
          <FaHome />
        </button>
        <button className="nav-btn" title="Camera" onClick={() => navigate(`/camera?event=${eventId}`)}>
          <FaCamera />
        </button>
        <button className="nav-btn" title="Settings">
          <FaCog />
        </button>
      </nav>
    </div>
  );
}

export default Gallery;
