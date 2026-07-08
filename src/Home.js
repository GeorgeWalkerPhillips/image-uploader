import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
  FaUpload,
  FaHome,
  FaPhotoVideo,
  FaCog,
  FaSignOutAlt,
} from 'react-icons/fa';
import { useAuth } from './context/AuthContext';
import { supabase } from './supabaseClient';
import { uploadImage } from './services/uploadService';
import { joinEventAsGuest } from './services/eventAccessService';
import LandingPage from './LandingPage';
import './Home.css';

function Home() {
  const [searchParams] = useSearchParams();
  const eventId = searchParams.get('event');
  const navigate = useNavigate();
  const { user, signInAsGuest, signOut } = useAuth();

  const [eventName, setEventName] = useState('');
  const [eventInfo, setEventInfo] = useState(null);
  const [images, setImages] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (!eventId) return;

    let cancelled = false;
    setJoining(true);

    joinEventAsGuest(eventId, signInAsGuest)
      .catch((err) => {
        console.error('Error joining event:', err);
        if (!cancelled) toast.error(err.message || 'Could not join this event');
      })
      .finally(() => {
        if (!cancelled) setJoining(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  useEffect(() => {
    const fetchEvent = async () => {
      if (!eventId) return;

      try {
        const { data, error } = await supabase
          .from('events')
          .select('*')
          .eq('id', eventId)
          .single();

        if (error) throw error;

        if (data) {
          setEventName(data.name);
          setEventInfo({
            id: data.id,
            name: data.name,
            description: data.description || 'Upload your photos to be part of the shared gallery!',
            startDate: data.start_date,
            endDate: data.end_date,
          });
        }
      } catch (err) {
        toast.error('Event not found');
        console.error('Error fetching event:', err);
      }
    };

    fetchEvent();
  }, [eventId]);

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    setImages(files);
  };

  const handleUpload = async () => {
    if (!eventId || !user) {
      toast.error('Missing event or user information');
      return;
    }

    if (images.length === 0) {
      toast.error('Please select photos to upload');
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    let successCount = 0;
    const totalCount = images.length;

    for (let i = 0; i < images.length; i++) {
      try {
        const result = await uploadImage(images[i], eventId, user.id);

        if (result.success) {
          successCount++;
          toast.success(`Photo ${i + 1}/${totalCount} uploaded`);
        } else {
          toast.error(`Failed: ${result.error}`);
        }

        setUploadProgress(Math.round(((i + 1) / totalCount) * 100));
      } catch (error) {
        toast.error(`Upload failed: ${error.message}`);
      }
    }

    setUploading(false);
    setUploadProgress(0);
    setImages([]);

    if (successCount === totalCount) {
      toast.success(`All ${successCount} photos uploaded!`);
    } else {
      toast.warning(
        `${successCount}/${totalCount} photos uploaded successfully`
      );
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      toast.success('Signed out');
      navigate('/');
    } catch (error) {
      toast.error('Sign out failed');
    }
  };

  if (!eventId) {
    return <LandingPage />;
  }

  return (
    <div className="home-container event-page">
      <div className="hero">
        <h1>{eventName || 'Welcome to Capture'}</h1>
        <p className="tagline">Share your best moments with everyone</p>
      </div>

      {eventInfo && (
        <div className="event-card">
          <p>
            <strong>Event:</strong> {eventInfo.name}
          </p>
          <p>
            <strong>Description:</strong> {eventInfo.description}
          </p>
          {eventInfo.startDate && (
            <p>
              <strong>Date:</strong>{' '}
              {new Date(eventInfo.startDate).toLocaleDateString()}
            </p>
          )}
        </div>
      )}

      <div className="upload-card">
        {joining && <p className="joining-notice">Joining event…</p>}

        <label className="file-btn" disabled={!eventId || uploading}>
          <input
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,image/heic"
            onChange={handleFileChange}
            disabled={!eventId || uploading}
          />
          <FaUpload /> Choose Photos
        </label>

        {images.length > 0 && (
          <div className="file-list">
            <p>{images.length} file(s) selected</p>
            <div className="preview-row">
              {images.slice(0, 3).map((image, index) => (
                <img
                  key={index}
                  src={URL.createObjectURL(image)}
                  alt="preview"
                  className="thumbnail"
                />
              ))}
            </div>
          </div>
        )}

        {uploading && (
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${uploadProgress}%` }}
            />
            <span className="progress-text">{uploadProgress}%</span>
          </div>
        )}

        <button
          className="upload-btn"
          onClick={handleUpload}
          disabled={!eventId || uploading || joining || images.length === 0}
        >
          <FaUpload /> {uploading ? `Uploading... ${uploadProgress}%` : 'Upload'}
        </button>
      </div>

      <nav className="bottom-nav">
        <button className="nav-btn" title="Home">
          <FaHome />
        </button>
        <button
          className="nav-btn"
          onClick={() => (eventId ? navigate(`/gallery?event=${eventId}`) : null)}
          title="Gallery"
          disabled={!eventId}
        >
          <FaPhotoVideo />
        </button>
        <button className="nav-btn" title="Settings">
          <FaCog />
        </button>
        {user && (
          <button className="nav-btn logout-btn" onClick={handleSignOut} title="Sign Out">
            <FaSignOutAlt />
          </button>
        )}
      </nav>
    </div>
  );
}

export default Home;
