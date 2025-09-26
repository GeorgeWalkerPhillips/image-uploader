import React, { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import {
    FaHome, FaHeart, FaCamera, FaCog, FaVideo, FaImages, FaPhotoVideo
} from "react-icons/fa";
import { db, storage } from "./firebase";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { ref, getDownloadURL } from "firebase/storage";
import "./Gallery.css";

function useQuery() {
    return new URLSearchParams(useLocation().search);
}

function Gallery() {
    const queryParams = useQuery();
    const eventId = queryParams.get("event");

    const [photos, setPhotos] = useState([]);
    const [loading, setLoading] = useState(true);

    // For popup viewer
    const [showViewer, setShowViewer] = useState(false);
    const [currentIndex, setCurrentIndex] = useState(0);

    useEffect(() => {
        const fetchPhotos = async () => {
            if (!eventId) {
                setLoading(false);
                return;
            }
            try {
                const photosRef = collection(db, `events/${eventId}/photos`);
                const q = query(photosRef, orderBy("uploadedAt", "desc"));
                const snapshot = await getDocs(q);

                const urls = await Promise.all(
                    snapshot.docs.map(async (docSnap) => {
                        const data = docSnap.data();
                        const storageRef = ref(storage, data.storagePath);
                        const url = await getDownloadURL(storageRef);
                        return {
                            id: docSnap.id,
                            url,
                            uploadedAt: data.uploadedAt?.toDate() || null,
                        };
                    })
                );

                setPhotos(urls);
            } catch (err) {
                console.error("Error fetching photos:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchPhotos();
    }, [eventId]);

    // Swipe handlers (basic)
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

    const [touchStart, setTouchStart] = useState(null);

    const prevImage = () =>
        setCurrentIndex((i) => Math.max(0, i - 1));
    const nextImage = () =>
        setCurrentIndex((i) => Math.min(photos.length - 1, i + 1));

    return (
        <div className="gallery-container">
            {/* Header */}
            <header className="gallery-header">
                <h2>Photo Gallery</h2>
                <div className="gallery-meta">
                    <span><FaVideo /> 0 Videos</span>
                    <span><FaImages /> {photos.length} Photos</span>
                </div>
            </header>

            {/* Scrollable grid */}
            <div className="gallery-scroll">
                {loading ? (
                    <p>Loading photos...</p>
                ) : photos.length === 0 ? (
                    <p>No photos uploaded yet.</p>
                ) : (
                    <div className="gallery-grid">
                        {photos.map((photo, index) => (
                            <div
                                key={photo.id}
                                className="gallery-item"
                                onClick={() => {
                                    setCurrentIndex(index);
                                    setShowViewer(true);
                                }}
                            >
                                <img src={photo.url} alt={`photo-${photo.id}`} />
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Image viewer popup */}
            {showViewer && photos.length > 0 && (
                <div
                    className="viewer-overlay"
                    onTouchStart={handleTouchStart}
                    onTouchEnd={handleTouchEnd}
                >
                    <button
                        className="viewer-close"
                        onClick={() => setShowViewer(false)}
                    >
                        ✕
                    </button>
                    <img
                        src={photos[currentIndex].url}
                        alt="full-view"
                        className="viewer-image"
                    />
                    <div className="viewer-controls">
                        <button onClick={prevImage} disabled={currentIndex === 0}>
                            ◀
                        </button>
                        <button
                            onClick={nextImage}
                            disabled={currentIndex === photos.length - 1}
                        >
                            ▶
                        </button>
                    </div>
                </div>
            )}

            {/* Bottom Nav */}
            <nav className="bottom-nav">
                <Link to="/"><FaHome /></Link>
                <Link to="/favorites"><FaHeart /></Link>
                <Link to={`/camera?event=${eventId}`} className="camera-btn"><FaCamera /></Link>
                <Link to={`/gallery?event=${eventId}`}><FaImages /></Link>
                <Link to="/settings"><FaCog /></Link>
            </nav>
        </div>
    );
}

export default Gallery;
