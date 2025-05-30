import React, { useState, useEffect } from "react";
import "./Home.css";
import CameraCapture from "./CameraCapture";
import { Link } from "react-router-dom";
import { FaUpload, FaCamera } from "react-icons/fa";

function Home() {
    const [images, setImages] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [fileNames, setFileNames] = useState([]);
    const [uploadComplete, setUploadComplete] = useState(false);
    const [userEmail, setUserEmail] = useState(null);

    useEffect(() => {
        fetch("https://script.google.com/macros/s/AKfycbygdAxz0zjwvsYrfMQklZLRjgyWXZFzSue8mD1W8xwUm4iJD-iF63CYJRbSlYM4_ANs/exec", {
            method: "POST",
            credentials: "include", // ⬅️ This is IMPORTANT for Google to detect login
        })
            .then(res => res.json())
            .then(data => {
                if (data.email) {
                    setUserEmail(data.email);
                } else {
                    console.warn("No email returned.");
                }
            })
            .catch(err => {
                console.error("Login error:", err);
            });
    }, []);

    const handleFileChange = (e) => {
        const files = Array.from(e.target.files);
        setImages(files);
        setFileNames(files.map((file) => file.name));
    };

    const handleUpload = async () => {
        if (images.length === 0) {
            alert("Please select at least one file.");
            return;
        }

        setUploading(true);

        const formData = new FormData();
        for (const image of images) {
            const reader = new FileReader();
            reader.onloadend = async () => {
                const base64String = reader.result.replace("data:", "").replace(/^.+,/, "");
                formData.append("image", base64String);

                const response = await fetch("https://script.google.com/macros/s/AKfycbyKY9Ndbchu1dMwYTTMOJ_hJLwQ76Vu-bWkGuF3Y7wD53Lsodj3ecdtyjQhr4uGRQH9Wg/exec", {
                    method: "POST",
                    body: formData,
                });

                const result = await response.json();
                console.log(result);
                setUploading(false);
                setUploadComplete(true);
            };
            reader.readAsDataURL(image);
        }
    };

    const handleOk = () => {
        setUploadComplete(false);
        window.location.reload();
    };

    return (
        <div className="home-container">
            <h1 className="home-title">Capture by Val</h1>
            <p className="home-subtitle">Upload your moments to Val's lens</p>

            {userEmail ? (
                <p>Logged in as: <strong>{userEmail}</strong></p>
            ) : (
                <p>Please log into your Google Account to use the app.</p>
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

                <button className="button-36" onClick={handleUpload}>
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
                        <p>Upload complete! 🎉</p>
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
