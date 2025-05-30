import React, { useState, useEffect } from "react";
import { useLocation, Link } from "react-router-dom";
import "./Home.css";
import { FaUpload, FaCamera } from "react-icons/fa";

function useQuery() {
    return new URLSearchParams(useLocation().search);
}

function Home() {
    const query = useQuery();
    const eventId = query.get("event");

    // State to hold fetched event name
    const [eventName, setEventName] = useState("");

    const [images, setImages] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [fileNames, setFileNames] = useState([]);
    const [uploadComplete, setUploadComplete] = useState(false);

    // Fetch event name from Google Apps Script when eventId changes
    useEffect(() => {
        if (!eventId) {
            alert("No event ID found. Please use a valid QR code or link.");
            return;
        }

        // Fetch event details using your doGet endpoint
        fetch(`https://script.google.com/macros/s/AKfycbygdAxz0zjwvsYrfMQklZLRjgyWXZFzSue8mD1W8xwUm4iJD-iF63CYJRbSlYM4_ANs/exec?id=${eventId}`)
            .then((res) => res.json())
            .then((data) => {
                if (data.success) {
                    setEventName(data.event.name);
                } else {
                    alert("Event not found for this ID.");
                }
            })
            .catch((err) => {
                console.error("Error fetching event info:", err);
                alert("Error fetching event info.");
            });
    }, [eventId]);

    const handleFileChange = (e) => {
        const files = Array.from(e.target.files);
        setImages(files);
        setFileNames(files.map((file) => file.name));
    };

    const handleUpload = async () => {
        if (!eventId) {
            alert("Missing event ID. Please use a valid QR code.");
            return;
        }

        if (images.length === 0) {
            alert("Please select at least one file.");
            return;
        }

        setUploading(true);

        for (const image of images) {
            const reader = new FileReader();

            await new Promise((resolve, reject) => {
                reader.onloadend = async () => {
                    try {
                        const base64String = reader.result
                            .replace("data:", "")
                            .replace(/^.+,/, "");

                        const formData = new FormData();
                        formData.append("image", base64String);
                        formData.append("event", eventId);

                        const response = await fetch(
                            "https://script.google.com/macros/s/AKfycbyKY9Ndbchu1dMwYTTMOJ_hJLwQ76Vu-bWkGuF3Y7wD53Lsodj3ecdtyjQhr4uGRQH9Wg/exec",
                            {
                                method: "POST",
                                body: formData,
                            }
                        );

                        const result = await response.json();
                        console.log(result);
                        resolve();
                    } catch (err) {
                        console.error("Upload error:", err);
                        reject(err);
                    }
                };
                reader.readAsDataURL(image);
            });
        }

        setUploading(false);
        setUploadComplete(true);
    };

    const handleOk = () => {
        setUploadComplete(false);
        window.location.reload();
    };

    return (
        <div className="home-container">
            <h1 className="home-title">Capture by Val</h1>
            <p className="home-subtitle">Upload your moments to Val's lens</p>

            {eventId ? (
                <>
                    {eventName ? (
                        <p className="event-name-banner">
                            Event: <strong>{eventName}</strong> (ID: {eventId})
                        </p>
                    ) : (
                        <p>Loading event info...</p>
                    )}
                </>
            ) : (
                <p className="warning">
                    No event ID detected. Please use the correct QR code or event link.
                </p>
            )}

            <div className="upload-section">
                <label className="custom-file-upload">
                    <input type="file" multiple onChange={handleFileChange} />
                    <FaUpload className="icon" /> Choose Photos
                </label>

                {fileNames.length > 0 && (
                    <div className="thumbnail-preview">
                        {images.slice(0, 3).map((image, index) => (
                            <div
                                key={index}
                                className="thumbnail"
                                style={{ left: `${index * 20}px`, zIndex: 3 - index }}
                            >
                                <img src={URL.createObjectURL(image)} alt={`thumb-${index}`} />
                            </div>
                        ))}
                    </div>
                )}

                <button className="button-36" onClick={handleUpload} disabled={uploading}>
                    <FaUpload className="icon" /> Upload to Val
                </button>
            </div>

            {uploading && (
                <div className="popup">
                    <div className="popup-content">
                        <div className="spinner"></div>
                        <p>Uploading... Please do not leave this page.</p>
                    </div>
                </div>
            )}

            {uploadComplete && (
                <div className="popup">
                    <div className="popup-content">
                        <p>Upload complete!</p>
                        <button onClick={handleOk}>OK</button>
                    </div>
                </div>
            )}

            <Link to="/camera">
                <button className="button-36">
                    <FaCamera className="icon" /> Use Camera
                </button>
            </Link>
        </div>
    );
}

export default Home;
