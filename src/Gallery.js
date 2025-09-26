import React, { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import {
    FaHome, FaHeart, FaCamera, FaCog, FaVideo, FaImages, FaPhotoVideo, FaUser
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
    const eventId = queryParams.get("event");   // event ID from URL (?event=abc)

    const [photos, setPhotos] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchPhotos = async () => {
            if (!eventId) {
                console.warn("No event ID provided in URL");
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

            {/* Gallery Section */}
            {loading ? (
                <p>Loading photos...</p>
            ) : photos.length === 0 ? (
                <p>No photos uploaded yet.</p>
            ) : (
                <div className="gallery-section">
                    <h3 className="gallery-date">Latest Uploads</h3>
                    <div className="gallery-grid">
                        {photos.map((photo) => (
                            <div key={photo.id} className="gallery-item">
                                <img src={photo.url} alt={`photo-${photo.id}`} />
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Bottom Nav */}
            <nav className="bottom-nav">
                <Link to="/"><FaHome /></Link>
                <Link to="/favorites"><FaHeart /></Link>
                <Link to="/camera" className="camera-btn"><FaCamera /></Link>
                <Link to={`/gallery?event=${eventId}`}><FaPhotoVideo /></Link>
                <Link to="/settings"><FaCog /></Link>
            </nav>
        </div>
    );
}

export default Gallery;
