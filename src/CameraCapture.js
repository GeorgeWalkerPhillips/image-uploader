import React, { useRef, useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
  FaSyncAlt,
  FaCamera,
  FaHome,
  FaPhotoVideo,
  FaCog,
  FaSignOutAlt,
  FaChevronLeft,
  FaChevronRight,
} from 'react-icons/fa';
import { useAuth } from './context/AuthContext';
import { supabase } from './supabaseClient';
import { uploadImage, getPublicPhotoUrl } from './services/uploadService';
import './CameraCapture.css';

function CameraCapture() {
  const [searchParams] = useSearchParams();
  const eventId = searchParams.get('event');
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const [facingMode, setFacingMode] = useState('user');
  const [eventName, setEventName] = useState('');
  const [capturedImages, setCapturedImages] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [showGallery, setShowGallery] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);

  useEffect(() => {
    const fetchEvent = async () => {
      if (!eventId) return;

      try {
        const { data, error } = await supabase
          .from('events')
          .select('name')
          .eq('id', eventId)
          .single();

        if (error) throw error;
        if (data) setEventName(data.name);
      } catch (err) {
        toast.error('Event not found');
        console.error('Error:', err);
      }
    };

    fetchEvent();
  }, [eventId]);

  useEffect(() => {
    startCamera();
    return () => {
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach((track) => track.stop());
      }
    };
  }, [facingMode]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      toast.error('Camera access denied');
      console.error('Camera error:', err);
    }
  };

  const captureImage = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = canvas.toDataURL('image/png');
    setCapturedImages((prev) => [...prev, imageData]);
    setCurrentIndex(capturedImages.length);

    toast.success('Photo captured');
  };

  const uploadCapturedImages = async () => {
    if (!eventId || !user) {
      toast.error('Missing event or user information');
      return;
    }

    if (capturedImages.length === 0) {
      toast.error('No photos to upload');
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    let successCount = 0;
    const totalCount = capturedImages.length;

    for (let i = 0; i < capturedImages.length; i++) {
      try {
        const blob = await fetch(capturedImages[i]).then((res) => res.blob());
        const file = new File([blob], `capture-${Date.now()}-${i}.png`, {
          type: 'image/png',
        });

        const result = await uploadImage(file, eventId, user.id);

        if (result.success) {
          successCount++;
          toast.success(`Photo ${i + 1}/${totalCount} uploaded`);
        } else {
          toast.error(`Upload failed: ${result.error}`);
        }

        setUploadProgress(Math.round(((i + 1) / totalCount) * 100));
      } catch (error) {
        toast.error(`Upload failed: ${error.message}`);
      }
    }

    setUploading(false);
    setUploadProgress(0);
    setCapturedImages([]);
    setShowGallery(false);

    if (successCount === totalCount) {
      toast.success(`All ${successCount} photos uploaded!`);
    } else {
      toast.warning(
        `${successCount}/${totalCount} photos uploaded successfully`
      );
    }
  };

  const deleteImage = (index) => {
    setCapturedImages((prev) => prev.filter((_, i) => i !== index));
    if (currentIndex >= capturedImages.length - 1) {
      setCurrentIndex(Math.max(0, currentIndex - 1));
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/');
    } catch (error) {
      toast.error('Sign out failed');
    }
  };

  const flipCamera = () => {
    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
  };

  if (!eventId) {
    return (
      <div className="camera-fullscreen">
        <div className="no-event-message">
          <p>No event selected</p>
          <button onClick={() => navigate('/')}>Go Back</button>
        </div>
      </div>
    );
  }

  return (
    <div className="camera-fullscreen">
      <div className="top-bar">
        <button className="icon-button" onClick={flipCamera} title="Flip camera">
          <FaSyncAlt />
        </button>
        <span className="event-name">{eventName || 'Camera'}</span>
        <button className="icon-button" onClick={handleSignOut} title="Sign Out">
          <FaSignOutAlt />
        </button>
      </div>

      <video ref={videoRef} autoPlay playsInline className="video-feed" />
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {showGallery && capturedImages.length > 0 && (
        <div className="preview-overlay">
          <div className="preview-header">
            <button
              className="close-btn"
              onClick={() => setShowGallery(false)}
              title="Close"
            >
              ✕
            </button>
            <span className="preview-counter">
              {currentIndex + 1} / {capturedImages.length}
            </span>
            <button
              className="delete-btn"
              onClick={() => deleteImage(currentIndex)}
              title="Delete"
            >
              🗑️
            </button>
          </div>

          <img
            src={capturedImages[currentIndex]}
            alt="Captured"
            className="preview-image"
          />

          <div className="gallery-controls">
            <button
              onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
              disabled={currentIndex === 0}
              title="Previous"
            >
              <FaChevronLeft />
            </button>
            <button
              onClick={() =>
                setCurrentIndex(Math.min(capturedImages.length - 1, currentIndex + 1))
              }
              disabled={currentIndex === capturedImages.length - 1}
              title="Next"
            >
              <FaChevronRight />
            </button>
          </div>

          {uploading && (
            <div className="upload-progress">
              <div
                className="progress-bar"
                style={{ width: `${uploadProgress}%` }}
              />
              <span>{uploadProgress}%</span>
            </div>
          )}

          <button
            className="upload-all-btn"
            onClick={uploadCapturedImages}
            disabled={uploading || capturedImages.length === 0}
          >
            {uploading ? `Uploading... ${uploadProgress}%` : 'Upload All'}
          </button>
        </div>
      )}

      <div className="bottom-bar">
        <div className="thumbnail-stack" onClick={() => setShowGallery(true)}>
          {capturedImages.slice(-3).map((img, i) => (
            <img key={i} src={img} alt="preview" className="thumbnail" />
          ))}
          {capturedImages.length > 0 && (
            <div className="photo-count">{capturedImages.length}</div>
          )}
        </div>
      </div>

      <button className="shutter-button" onClick={captureImage} title="Capture">
        <FaCamera />
      </button>

      <nav className="bottom-nav">
        <button className="nav-btn" onClick={() => navigate('/')} title="Home">
          <FaHome />
        </button>
        <button
          className="nav-btn"
          onClick={() => navigate(`/gallery?event=${eventId}`)}
          title="Gallery"
        >
          <FaPhotoVideo />
        </button>
        <button className="nav-btn" title="Settings">
          <FaCog />
        </button>
      </nav>
    </div>
  );
}

export default CameraCapture;
