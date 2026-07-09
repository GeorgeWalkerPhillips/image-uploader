import React, { useRef, useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
  FaTimes,
  FaCog,
  FaSyncAlt,
  FaCamera,
  FaImages,
  FaPhotoVideo,
  FaChevronLeft,
  FaChevronRight,
} from 'react-icons/fa';
import { useAuth } from './context/AuthContext';
import { supabase } from './supabaseClient';
import { uploadImage } from './services/uploadService';
import { joinEventAsGuest } from './services/eventAccessService';
import { applyVideoFilters, applyCanvasFilters, FILTER_ORDER } from './components/CameraFilters';
import { TimerCountdownOverlay } from './components/CameraTimer';
import { CameraSettingsSheet } from './components/CameraSettingsSheet';
import './CameraCapture.css';

const FILTER_LABELS = { normal: 'Normal', bw: 'B&W', sepia: 'Sepia' };

function CameraCapture() {
  const [searchParams] = useSearchParams();
  const eventId = searchParams.get('event');
  const navigate = useNavigate();
  const { user, signInAsGuest } = useAuth();

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);

  const [facingMode, setFacingMode] = useState('user');
  const [eventName, setEventName] = useState('');
  const [guestCount, setGuestCount] = useState(null);
  const [capturedImages, setCapturedImages] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [showGallery, setShowGallery] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [joining, setJoining] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Filter/timer states
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [filter, setFilter] = useState('normal');
  const [showGrid, setShowGrid] = useState(false);
  const [armedSeconds, setArmedSeconds] = useState(null);
  const [countdown, setCountdown] = useState(null);

  const refreshGuestCount = React.useCallback(async () => {
    if (!eventId) return;
    const { data, error } = await supabase.rpc('get_event_guest_count', {
      p_event_id: eventId,
    });
    if (!error && typeof data === 'number') setGuestCount(data);
  }, [eventId]);

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
    refreshGuestCount();
  }, [eventId, refreshGuestCount]);

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

  const startCamera = React.useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode },
        audio: false,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      toast.error('Could not access camera');
      console.error('Camera error:', err);
    }
  }, [facingMode]);

  useEffect(() => {
    startCamera();
    const video = videoRef.current;
    return () => {
      if (video?.srcObject) {
        video.srcObject.getTracks().forEach((track) => track.stop());
      }
    };
  }, [startCamera]);

  // Apply filters to video feed
  useEffect(() => {
    if (videoRef.current) {
      applyVideoFilters(videoRef.current, brightness, contrast, filter);
    }
  }, [brightness, contrast, filter]);

  const captureImage = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Apply filters to captured image
    let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    applyCanvasFilters(canvas, ctx, imageData, brightness, contrast, filter);

    const imageDataUrl = canvas.toDataURL('image/png');
    const blob = await fetch(imageDataUrl).then((res) => res.blob());
    const file = new File([blob], `capture-${Date.now()}.png`, { type: 'image/png' });

    setCapturedImages((prev) => {
      const next = [...prev, { id: `${Date.now()}-${prev.length}`, previewUrl: imageDataUrl, file }];
      setCurrentIndex(next.length - 1);
      return next;
    });

    toast.success('Photo captured');
  };

  const handleShutterPress = () => {
    if (armedSeconds) {
      setCountdown(armedSeconds);
    } else {
      captureImage();
    }
  };

  // Countdown ticks down once armed, capturing on reaching zero.
  useEffect(() => {
    if (countdown === null) return;

    if (countdown === 0) {
      captureImage();
      setCountdown(null);
      return;
    }

    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown]);

  const cycleFilter = () => {
    const currentIdx = FILTER_ORDER.indexOf(filter);
    setFilter(FILTER_ORDER[(currentIdx + 1) % FILTER_ORDER.length]);
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const newItems = files.map((file, i) => ({
      id: `${Date.now()}-${i}`,
      previewUrl: URL.createObjectURL(file),
      file,
    }));

    setCapturedImages((prev) => [...prev, ...newItems]);
    setShowGallery(true);
    e.target.value = '';
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
        const result = await uploadImage(capturedImages[i].file, eventId, user.id);

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
    refreshGuestCount();

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
        <button
          className="icon-button"
          onClick={() => navigate(`/gallery?event=${eventId}`)}
          title="Close"
        >
          <FaTimes />
        </button>
        <div className="event-name-block">
          <span className="event-name">{eventName || 'Camera'}</span>
          {guestCount !== null && (
            <span className="event-participants">
              {guestCount} {guestCount === 1 ? 'guest' : 'guests'}
            </span>
          )}
        </div>
        <button
          className="icon-button"
          onClick={() => setShowSettings(true)}
          title="Camera settings"
        >
          <FaCog />
        </button>
      </div>

      <video ref={videoRef} autoPlay playsInline className="video-feed" />
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {showGrid && <div className="grid-overlay" />}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic"
        multiple
        style={{ display: 'none' }}
        onChange={handleFileSelect}
      />

      <CameraSettingsSheet
        open={showSettings}
        onClose={() => setShowSettings(false)}
        brightness={brightness}
        contrast={contrast}
        filter={filter}
        showGrid={showGrid}
        onBrightnessChange={setBrightness}
        onContrastChange={setContrast}
        onFilterChange={setFilter}
        onGridToggle={() => setShowGrid(!showGrid)}
        armedSeconds={armedSeconds}
        onArmTimer={setArmedSeconds}
      />

      <TimerCountdownOverlay countdown={countdown} onCancel={() => setCountdown(null)} />

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
            src={capturedImages[currentIndex].previewUrl}
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
            disabled={uploading || joining || capturedImages.length === 0}
          >
            {uploading ? `Uploading... ${uploadProgress}%` : joining ? 'Joining event…' : 'Upload All'}
          </button>
        </div>
      )}

      <div className="shutter-row">
        <button className="filter-pill" onClick={cycleFilter} title="Cycle filter">
          {FILTER_LABELS[filter]}
        </button>

        <button className="shutter-button" onClick={handleShutterPress} title="Capture">
          <FaCamera />
        </button>

        <button className="flip-button" onClick={flipCamera} title="Flip camera">
          <FaSyncAlt />
        </button>
      </div>

      <div className="bottom-info-bar">
        <button
          className="info-pill"
          onClick={() => (capturedImages.length > 0 ? setShowGallery(true) : fileInputRef.current?.click())}
          title={capturedImages.length > 0 ? 'Review photos' : 'Choose from camera roll'}
        >
          {capturedImages.length > 0 ? (
            <>
              <img src={capturedImages[capturedImages.length - 1].previewUrl} alt="" className="info-pill-thumb" />
              {capturedImages.length} ready
            </>
          ) : (
            <>
              <FaImages /> Camera roll
            </>
          )}
        </button>

        <button
          className="info-pill"
          onClick={() => navigate(`/gallery?event=${eventId}`)}
          title="View shared gallery"
        >
          <FaPhotoVideo /> Gallery
        </button>
      </div>
    </div>
  );
}

export default CameraCapture;
