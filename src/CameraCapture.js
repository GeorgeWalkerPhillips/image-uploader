import React, { useRef, useState, useEffect } from 'react';
import './CameraCapture.css';
import { FaSyncAlt } from 'react-icons/fa';

function CameraCapture() {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const [capturedImage, setCapturedImage] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [facingMode, setFacingMode] = useState("user"); // "user" or "environment"

    useEffect(() => {
        startCamera();
        // Cleanup camera stream on unmount
        return () => {
            if (videoRef.current?.srcObject) {
                videoRef.current.srcObject.getTracks().forEach(track => track.stop());
            }
        };
    }, [facingMode]);

    const startCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode }
            });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }
        } catch (err) {
            console.error("Error starting camera:", err);
        }
    };

    const flipCamera = () => {
        setFacingMode(prev => (prev === "user" ? "environment" : "user"));
    }; 

    const captureImage = () => {
        const canvas = canvasRef.current;
        const video = videoRef.current;

        const context = canvas.getContext('2d');
        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        const imageData = canvas.toDataURL('image/png');
        setCapturedImage(imageData);
    };

    const uploadImage = async () => {
        if (!capturedImage) return;
        setUploading(true);

        const base64 = capturedImage.replace("data:image/png;base64,", "");
        const formData = new FormData();
        formData.append("image", base64);

        const response = await fetch("https://script.google.com/macros/s/AKfycbyKY9Ndbchu1dMwYTTMOJ_hJLwQ76Vu-bWkGuF3Y7wD53Lsodj3ecdtyjQhr4uGRQH9Wg/exec", {
            method: "POST",
            body: formData,
        });

        const result = await response.json();
        console.log(result);
        setUploading(false);
        alert("Upload complete!");
    };

    return (
        <div className="camera-fullscreen">
            <video ref={videoRef} autoPlay playsInline className="video-feed" />
            <canvas ref={canvasRef} width="400" height="300" style={{ display: 'none' }} />

            {/* Flip Camera Button */}
            <button className="flip-button" onClick={flipCamera}>
                <FaSyncAlt />
            </button>

            {/* Shutter Button */}
            <button className="shutter-button" onClick={captureImage}></button>

            {/* Preview & Upload */}
            {capturedImage && (
                <div className="preview-overlay">
                    <img src={capturedImage} alt="Captured" />
                    <button onClick={uploadImage} disabled={uploading}>
                        {uploading ? "Uploading..." : "Upload"}
                    </button>
                </div>
            )}
        </div>
    );
}

export default CameraCapture;
