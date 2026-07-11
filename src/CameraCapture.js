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
  FaRedo,
} from 'react-icons/fa';
import { useAuth } from './context/AuthContext';
import { supabase } from './supabaseClient';
import { uploadImage } from './services/uploadService';
import { joinEventAsGuest, setGuestDisplayName } from './services/eventAccessService';
import { applyVideoFilters, applyCanvasFilters, FILTER_ORDER } from './components/CameraFilters';
import { TimerCountdownOverlay } from './components/CameraTimer';
import { CameraSettingsSheet } from './components/CameraSettingsSheet';
import { GuestNamePrompt } from './components/GuestNamePrompt';
import './CameraCapture.css';

const FILTER_LABELS = { normal: 'Normal', bw: 'B&W', sepia: 'Sepia' };
const GUEST_NAME_STORAGE_KEY = 'capture_guest_name';

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
  const [photoCap, setPhotoCap] = useState(null);
  const [myUploadCount, setMyUploadCount] = useState(0);
  // Each item: { id, previewUrl, file, status: 'pending' | 'uploading' | 'failed' }
  // Items are removed as soon as they upload successfully — this list is
  // only ever "things still in flight or that need attention."
  const [pendingUploads, setPendingUploads] = useState([]);
  const [showGallery, setShowGallery] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [displayName, setDisplayName] = useState(null);
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [cachedName] = useState(() => {
    try {
      return localStorage.getItem(GUEST_NAME_STORAGE_KEY) || '';
    } catch (err) {
      return '';
    }
  });

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

  // Tracks the per-guest shot quota (a competitive, POV-style scarcity
  // mechanic on lower tiers) so the shutter can show/enforce it live.
  const refreshMyUploadCount = React.useCallback(async () => {
    if (!eventId || !user) return;
    const { count, error } = await supabase
      .from('photos')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .eq('uploaded_by', user.id);
    if (!error && typeof count === 'number') setMyUploadCount(count);
  }, [eventId, user]);

  useEffect(() => {
    if (!eventId || !user) return;

    const fetchPhotoCap = async () => {
      const { data, error } = await supabase
        .from('events')
        .select('photo_cap_per_guest')
        .eq('id', eventId)
        .single();
      if (!error) setPhotoCap(data?.photo_cap_per_guest ?? null);
    };

    fetchPhotoCap();
    refreshMyUploadCount();
  }, [eventId, user, refreshMyUploadCount]);

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
    setJoinError(null);

    joinEventAsGuest(eventId, signInAsGuest)
      .then(({ displayName: savedName }) => {
        if (cancelled) return;
        if (savedName) {
          setDisplayName(savedName);
        } else {
          setShowNamePrompt(true);
        }
      })
      .catch((err) => {
        console.error('Error joining event:', err);
        if (!cancelled) {
          setJoinError(err.message || 'Could not join this event');
          toast.error(err.message || 'Could not join this event');
        }
      })
      .finally(() => {
        if (!cancelled) setJoining(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  const handleNameSubmit = async (name) => {
    setShowNamePrompt(false);
    setDisplayName(name);
    try {
      localStorage.setItem(GUEST_NAME_STORAGE_KEY, name);
    } catch (err) {
      // Private browsing / storage disabled — fine, it just won't be
      // pre-filled next time.
    }

    if (user) {
      try {
        await setGuestDisplayName(eventId, user.id, name);
      } catch (err) {
        toast.error("Couldn't save your name, but you can still upload");
      }
    }
  };

  const handleNameSkip = () => {
    setShowNamePrompt(false);
    setDisplayName('Guest');
  };

  const startCamera = React.useCallback(async () => {
    try {
      // Without explicit width/height constraints, browsers often default
      // to a modest video resolution — far below what the phone's camera
      // can actually do — so every photo starts life already soft before
      // any compression happens. Ask for the highest resolution available;
      // the browser negotiates down to whatever the device truly supports.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: 3840 },
          height: { ideal: 2160 },
        },
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

  // Uploads a single item in the background the moment it's captured/picked
  // — guests never have to remember to hit a separate "upload" button.
  const uploadItem = React.useCallback(
    async (item) => {
      if (joinError) {
        // Never got an event_access row, so this would only fail RLS —
        // surfacing that raw error is more confusing than the blocking
        // join-error screen the guest is already looking at.
        setPendingUploads((prev) =>
          prev.map((p) => (p.id === item.id ? { ...p, status: 'failed' } : p))
        );
        return;
      }

      if (!eventId || !user) {
        setPendingUploads((prev) =>
          prev.map((p) => (p.id === item.id ? { ...p, status: 'pending' } : p))
        );
        return;
      }

      setPendingUploads((prev) =>
        prev.map((p) => (p.id === item.id ? { ...p, status: 'uploading' } : p))
      );

      try {
        const result = await uploadImage(item.file, eventId, user.id, null, displayName);

        if (result.success) {
          setPendingUploads((prev) => prev.filter((p) => p.id !== item.id));
          setMyUploadCount((prev) => prev + 1);
          refreshGuestCount();
        } else {
          toast.error(`Upload failed: ${result.error}`);
          setPendingUploads((prev) =>
            prev.map((p) => (p.id === item.id ? { ...p, status: 'failed' } : p))
          );
        }
      } catch (error) {
        toast.error(`Upload failed: ${error.message}`);
        setPendingUploads((prev) =>
          prev.map((p) => (p.id === item.id ? { ...p, status: 'failed' } : p))
        );
      }
    },
    [eventId, user, refreshGuestCount, displayName, joinError]
  );

  // Flushes any photos captured before the guest session finished joining.
  useEffect(() => {
    if (joining || !user) return;
    pendingUploads
      .filter((item) => item.status === 'pending')
      .forEach((item) => uploadItem(item));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joining, user]);

  const captureImage = async () => {
    if (photoCap != null && myUploadCount >= photoCap) {
      toast.error(`You've used all ${photoCap} of your photos for this event.`);
      return;
    }

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

    // JPEG, not PNG: at up to 4K, a lossless PNG of a busy scene can easily
    // clear the 10MB upload cap before compression ever gets a chance to
    // shrink it, so captures would fail validation outright.
    const imageDataUrl = canvas.toDataURL('image/jpeg', 0.92);
    const blob = await fetch(imageDataUrl).then((res) => res.blob());
    const file = new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' });
    const item = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      previewUrl: imageDataUrl,
      file,
      status: 'pending',
    };

    setPendingUploads((prev) => {
      const next = [...prev, item];
      setCurrentIndex(next.length - 1);
      return next;
    });
    toast.success('Photo captured');
    uploadItem(item);
  };

  const handleShutterPress = () => {
    if (photoCap != null && myUploadCount >= photoCap) {
      toast.error(`You've used all ${photoCap} of your photos for this event.`);
      return;
    }

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

    if (photoCap != null) {
      const remaining = Math.max(0, photoCap - myUploadCount);
      if (remaining === 0) {
        toast.error(`You've used all ${photoCap} of your photos for this event.`);
        e.target.value = '';
        return;
      }
      if (files.length > remaining) {
        toast.warning(`Only ${remaining} more photo(s) allowed — uploading the first ${remaining}.`);
        files.length = remaining;
      }
    }

    const newItems = files.map((file, i) => ({
      id: `${Date.now()}-${i}`,
      previewUrl: URL.createObjectURL(file),
      file,
      status: 'pending',
    }));

    setPendingUploads((prev) => [...prev, ...newItems]);
    setShowGallery(true);
    newItems.forEach((item) => uploadItem(item));
    e.target.value = '';
  };

  const retryItem = (item) => uploadItem(item);

  const discardItem = (index) => {
    setPendingUploads((prev) => prev.filter((_, i) => i !== index));
    if (currentIndex >= pendingUploads.length - 1) {
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

  if (joinError) {
    return (
      <div className="camera-fullscreen">
        <div className="no-event-message">
          <p>{joinError}</p>
          <button onClick={() => navigate(`/gallery?event=${eventId}`)}>
            View Gallery Instead
          </button>
        </div>
      </div>
    );
  }

  const failedCount = pendingUploads.filter((i) => i.status === 'failed').length;
  const currentItem = pendingUploads[currentIndex];
  const remainingShots = photoCap == null ? null : Math.max(0, photoCap - myUploadCount);
  const outOfShots = remainingShots === 0;

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
          {(guestCount !== null || remainingShots !== null) && (
            <span className="event-participants">
              {guestCount !== null && `${guestCount} ${guestCount === 1 ? 'guest' : 'guests'}`}
              {guestCount !== null && remainingShots !== null && ' · '}
              {remainingShots !== null && `${remainingShots} shots left`}
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

      <GuestNamePrompt
        open={showNamePrompt}
        defaultValue={cachedName}
        onSubmit={handleNameSubmit}
        onSkip={handleNameSkip}
      />

      {showGallery && currentItem && (
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
              {currentIndex + 1} / {pendingUploads.length}
            </span>
            <button
              className="delete-btn"
              onClick={() => discardItem(currentIndex)}
              title="Discard"
            >
              🗑️
            </button>
          </div>

          <img
            src={currentItem.previewUrl}
            alt="Captured"
            className="preview-image"
          />

          <div className="upload-status">
            {currentItem.status === 'uploading' && <span>Uploading…</span>}
            {currentItem.status === 'pending' && <span>Waiting to upload…</span>}
            {currentItem.status === 'failed' && (
              <button className="retry-btn" onClick={() => retryItem(currentItem)}>
                <FaRedo /> Upload failed — Retry
              </button>
            )}
          </div>

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
                setCurrentIndex(Math.min(pendingUploads.length - 1, currentIndex + 1))
              }
              disabled={currentIndex === pendingUploads.length - 1}
              title="Next"
            >
              <FaChevronRight />
            </button>
          </div>
        </div>
      )}

      <div className="shutter-row">
        <button className="filter-pill" onClick={cycleFilter} title="Cycle filter">
          {FILTER_LABELS[filter]}
        </button>

        <button
          className="shutter-button"
          onClick={handleShutterPress}
          title={outOfShots ? "You've used all your shots for this event" : 'Capture'}
          disabled={outOfShots}
        >
          <FaCamera />
        </button>

        <button className="flip-button" onClick={flipCamera} title="Flip camera">
          <FaSyncAlt />
        </button>
      </div>

      <div className="bottom-info-bar">
        <button
          className={`info-pill ${failedCount > 0 ? 'info-pill-alert' : ''}`}
          onClick={() =>
            pendingUploads.length > 0 ? setShowGallery(true) : fileInputRef.current?.click()
          }
          title={
            pendingUploads.length > 0
              ? 'Review uploads'
              : outOfShots
              ? "You've used all your shots for this event"
              : 'Choose from camera roll'
          }
          disabled={pendingUploads.length === 0 && outOfShots}
        >
          {pendingUploads.length > 0 ? (
            <>
              <img
                src={pendingUploads[pendingUploads.length - 1].previewUrl}
                alt=""
                className="info-pill-thumb"
              />
              {failedCount > 0
                ? `${failedCount} failed — tap to retry`
                : `Uploading ${pendingUploads.length}…`}
            </>
          ) : outOfShots ? (
            'Out of shots'
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
