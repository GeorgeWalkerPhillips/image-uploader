import React, { useRef, useState, useEffect } from 'react';
import './CameraCapture.css';
import { FaSyncAlt } from 'react-icons/fa';

function CameraCapture() {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const [capturedImage, setCapturedImage] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [facingMode, setFacingMode] = useState("user");
    const [capturedImages, setCapturedImages] = useState([]);
    const [showGallery, setShowGallery] = useState(false);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [zoom, setZoom] = useState(1);

    // --- 1. Add zoomLevel state ---
    const [zoomLevel, setZoomLevel] = useState(1);
    
    useEffect(() => {
        startCamera();
        return () => {
            if (videoRef.current?.srcObject) {
                videoRef.current.srcObject.getTracks().forEach(track => track.stop());
            }
        };
    }, [facingMode]);

    useEffect(() => {
        applyZoom();
    }, [zoom]);

    const startCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode }
            });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                applyZoom(); // Apply zoom if applicable
            }
        } catch (err) {
            console.error("Error starting camera:", err);
        }
    };

    const applyZoom = async () => {
        const stream = videoRef.current?.srcObject;
        const track = stream?.getVideoTracks()[0];
        if (!track) return;

        const capabilities = track.getCapabilities();
        if (capabilities.zoom) {
            try {
                await track.applyConstraints({
                    advanced: [{ zoom: zoom }]
                });
            } catch (err) {
                console.error("Zoom apply failed:", err);
            }
        }
    };

    const flipCamera = () => {
        setFacingMode(prev => (prev === "user" ? "environment" : "user"));
    };

    const captureImage = () => {
        const canvas = canvasRef.current;
        const video = videoRef.current;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        const context = canvas.getContext('2d');
        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        const imageData = canvas.toDataURL('image/png');
        setCapturedImages(prev => [...prev, imageData]);
        setCurrentIndex(capturedImages.length);
        autoUpload(imageData);
    };

    const autoUpload = async (imageData) => {
        setUploading(true);
        const base64 = imageData.replace("data:image/png;base64,", "");
        const formData = new FormData();
        formData.append("image", base64);

        try {
            const response = await fetch("https://script.google.com/macros/s/AKfycbyKY9Ndbchu1dMwYTTMOJ_hJLwQ76Vu-bWkGuF3Y7wD53Lsodj3ecdtyjQhr4uGRQH9Wg/exec", {
                method: "POST",
                body: formData,
            });
            const result = await response.json();
            console.log("Auto upload success:", result);
        } catch (error) {
            console.error("Auto upload failed:", error);
        } finally {
            setUploading(false);
        }
    };

    const enableFlash = () => {
        const stream = videoRef.current?.srcObject;
        const track = stream?.getVideoTracks()[0];
        if (track) {
            const capabilities = track.getCapabilities();
            if (capabilities.torch) {
                track.applyConstraints({ advanced: [{ torch: true }] })
                    .catch(e => console.error('Torch failed:', e));
            } else {
                alert('Flash/torch is not supported on this device/browser.');
            }
        }
    };

    return (
        <div className="camera-fullscreen">
            <div className="top-bar">
                <button className="icon-button" onClick={enableFlash}>⚡</button>
                <span className="event-name">Chloe & Tyler</span>
                <button className="icon-button">☰</button>
            </div>

            <div className="camera-viewfinder">
                <video ref={videoRef} autoPlay playsInline className="video-feed" />
            </div>
            <canvas ref={canvasRef} width="400" height="300" style={{ display: 'none' }} />

            {/* Zoom Options */}
            <div className="zoom-controls">
                {[0.5, 1, 3].map((z) => (
                    <button
                        key={z}
                        className={`zoom-button ${zoom === z ? 'active' : ''}`}
                        onClick={() => setZoom(z)}
                    >
                        {z}x
                    </button>
                ))}
            </div>

            <div className="bottom-bar">
                {capturedImages.length > 0 ? (
                    <div className="thumbnail-stack" onClick={() => {
                        setShowGallery(true);
                        setCurrentIndex(capturedImages.length - 1);
                    }}>
                        {capturedImages.slice(-3).map((img, i) => (
                            <img key={i} src={img} alt="Thumb" className="thumbnail"
                                style={{ position: 'absolute', left: `${i * 6}px`, zIndex: i }} />
                        ))}
                    </div>
                ) : <div style={{ width: '60px' }}></div>}

                <button className="shutter-button" onClick={captureImage}></button>

                <button className="flip-button" onClick={flipCamera}>
                    <FaSyncAlt />
                </button>
            </div>

            {showGallery && (
                <div className="preview-overlay">
                    <img src={capturedImages[currentIndex]} alt="Preview" />
                    <div style={{ display: "flex", gap: "10px" }}>
                        <button onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))} disabled={currentIndex === 0}>◀</button>
                        <button onClick={() => setCurrentIndex((prev) => Math.min(capturedImages.length - 1, prev + 1))} disabled={currentIndex === capturedImages.length - 1}>▶</button>
                    </div>
                    <button onClick={() => setShowGallery(false)}>Close</button>
                </div>
            )}
        </div>
    );
}

export default CameraCapture;
