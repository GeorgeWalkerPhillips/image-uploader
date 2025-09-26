import React, { useState, useEffect } from "react";
import { useLocation, Link } from "react-router-dom";
import { FaUpload, FaCamera, FaHome, FaHeart, FaUser, FaCog, FaPhotoVideo } from "react-icons/fa";
import "./Home.css";
import { db, storage } from './firebase';
import { ref, uploadBytes } from 'firebase/storage';
import { collection, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';

function useQuery() {
    return new URLSearchParams(useLocation().search);
}

function Home() {
    const query = useQuery();
    const eventId = query.get("event");

    const [eventName, setEventName] = useState("");
    const [images, setImages] = useState([]);
    const [fileNames, setFileNames] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [uploadComplete, setUploadComplete] = useState(false);

    useEffect(() => {
        const fetchEvent = async () => {
            if (!eventId) return;
            try {
                const docRef = doc(db, "events", eventId);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    setEventName(docSnap.data().name);
                }
            } catch (err) {
                console.error("Error fetching event:", err);
            }
        };
        fetchEvent();
    }, [eventId]);

    const handleFileChange = (e) => {
        const files = Array.from(e.target.files);
        setImages(files);
        setFileNames(files.map(file => file.name));
    };

    const handleUpload = async () => {
        if (!eventId || images.length === 0) return;
        setUploading(true);
        for (const image of images) {
            try {
                const fileName = `${Date.now()}_${image.name}`;
                const storagePath = `events/${eventId}/${fileName}`;
                const storageRef = ref(storage, storagePath);
                await uploadBytes(storageRef, image);
                await addDoc(collection(db, `events/${eventId}/photos`), {
                    storagePath,
                    uploadedAt: serverTimestamp()
                });
            } catch (err) {
                console.error("Upload error:", err);
            }
        }
        setUploading(false);
        setUploadComplete(true);
    };

    return (
        <div className="home-container">

            <div className="hero">
                {/* Logo under the heading */}
                <div className="logo-wrapper">
                    <img src="/val_logo_offblack.png" alt="VAL Logo" className="val-logo" />
                </div>
                <h1>{eventName || "Welcome to Capture"}</h1>
                <p className="tagline">Share your best moments with everyone</p>
            </div>

            {/* Event Info */}
            {eventId && (
                <div className="event-card">
                    <p><strong>Event ID:</strong> {eventId}</p>
                    <p><strong>Date:</strong> 25 Sept 2025</p>
                    <p><strong>Location:</strong> Cape Town Convention Centre</p>
                    <p className="desc">
                        Join us for a night full of energy, music, and unforgettable memories.
                        Upload your photos to be part of the shared gallery!
                    </p>
                </div>
            )}

            {/* Upload Section */}
            <div className="upload-card">
                <label className="file-btn">
                    <input type="file" multiple onChange={handleFileChange} />
                    <FaUpload /> Choose Photos
                </label>

                {fileNames.length > 0 && (
                    <div className="preview-row">
                        {images.slice(0, 3).map((image, index) => (
                            <img key={index} src={URL.createObjectURL(image)} alt="thumb" />
                        ))}
                    </div>
                )}

                <button className="upload-btn" onClick={handleUpload} disabled={uploading}>
                    <FaUpload /> Upload
                </button>
            </div>

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

export default Home;
