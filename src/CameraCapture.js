import React, { useRef, useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { db, storage } from "./firebase";
import { ref, uploadBytes } from "firebase/storage";
import { collection, addDoc, serverTimestamp, doc, getDoc } from "firebase/firestore";
import {
    FaSyncAlt,
    FaCamera,
    FaHome,
    FaHeart,
    FaPhotoVideo,
    FaCog,
} from "react-icons/fa";
import "./CameraCapture.css";

function useQuery() {
    return new URLSearchParams(useLocation().search);
}

function CameraCapture() {
    const query = useQuery();
    const eventId = query.get("event");

    const videoRef = useRef(null);
    const canvasRef = useRef(null);

    const [facingMode, setFacingMode] = useState("user");
    const [eventName, setEventName] = useState("");
    const [capturedImages, setCapturedImages] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [showGallery, setShowGallery] = useState(false);
    const [currentIndex, setCurrentIndex] = useState(0);

    // fetch event info
    useEffect(() => {
        const fetchEvent = async () => {
            try {
                if (!eventId) return;
                const docRef = doc(db, "events", eventId);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    setEventName(docSnap.data().name);
                }
            } catch (err) {
                console.error("Failed to fetch event:", err);
            }
        };
        if (eventId) fetchEvent();
    }, [eventId]);

    // start camera
    useEffect(() => {
        startCamera();
        return () => {
            videoRef.current?.srcObject?.getTracks().forEach((track) => track.stop());
        };
    }, [facingMode]);

    const startCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode },
            });
            videoRef.current.srcObject = stream;
        } catch (err) {
            console.error("Camera error:", err);
        }
    };

    const captureImage = () => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        const ctx = canvas.getContext("2d");
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const imageData = canvas.toDataURL("image/png");
        setCapturedImages((prev) => {
            const next = [...prev, imageData];
            setCurrentIndex(next.length - 1);
            return next;
        });
        uploadToFirebase(imageData);
    };

    const uploadToFirebase = async (imageData) => {
        if (!eventId) return;

        try {
            const blob = await fetch(imageData).then((res) => res.blob());
            const fileName = `${Date.now()}.png`;
            const path = `events/${eventId}/${fileName}`;
            const storageRef = ref(storage, path);

            await uploadBytes(storageRef, blob);
            await addDoc(collection(db, `events/${eventId}/photos`), {
            storagePath: path,
            uploadedAt: serverTimestamp(),
            });

            console.log("Uploaded:", fileName);
        } catch (err) {
            console.error("Upload failed:", err);
        }
    };


    const flipCamera = () =>
        setFacingMode((prev) => (prev === "user" ? "environment" : "user"));

    return (
        <div className="camera-fullscreen">
            {/* Top bar */}
            <div className="top-bar">
                <button className="icon-button" onClick={flipCamera}>
                    <FaSyncAlt />
                </button>
                <span className="event-name">{eventName}</span>
                <button className="icon-button">☰</button>
            </div>

            {/* Video feed */}
            <video ref={videoRef} autoPlay playsInline className="video-feed" />
            <canvas ref={canvasRef} style={{ display: "none" }} />

            {/* Overlay gallery preview */}
            {showGallery && (
                <div className="preview-overlay">
                    <img src={capturedImages[currentIndex]} alt="Captured" />
                    <div className="gallery-controls">
                        <button
                            onClick={() =>
                                setCurrentIndex((prev) => Math.max(0, prev - 1))
                            }
                            disabled={currentIndex === 0}
                        >
                            ◀
                        </button>
                        <button
                            onClick={() =>
                                setCurrentIndex((prev) =>
                                    Math.min(capturedImages.length - 1, prev + 1)
                                )
                            }
                            disabled={currentIndex === capturedImages.length - 1}
                        >
                            ▶
                        </button>
                    </div>
                    <button onClick={() => setShowGallery(false)}>Close</button>
                </div>
            )}

            {/* Thumbnails preview bar */}
            <div className="bottom-bar">
                <div
                    className="thumbnail-stack"
                    onClick={() => setShowGallery(true)}
                >
                    {capturedImages.slice(-3).map((img, i) => (
                        <img key={i} src={img} alt="preview" className="thumbnail" />
                    ))}
                </div>
            </div>

            {/* Shutter button above nav */}
            <button className="shutter-button" onClick={captureImage}>
                <FaCamera />
            </button>

            {/* Floating bottom navigation */}
            <nav className="bottom-nav">
                <Link to="/"><FaHome /></Link>
                <Link to="/favorites"><FaHeart /></Link>
                <Link to={`/camera?event=${eventId}`} className="camera-btn"><FaCamera /></Link>
                <Link to={`/gallery?event=${eventId}`}><FaPhotoVideo /></Link>
                <Link to="/settings"><FaCog /></Link>
            </nav>

        </div>
    );
}

export default CameraCapture;