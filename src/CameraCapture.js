import React, { useRef, useState } from 'react';
import './CameraCapture.css';

function CameraCapture() {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const [capturedImage, setCapturedImage] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [uploadComplete, setUploadComplete] = useState(false);

    const startCamera = async () => {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        videoRef.current.srcObject = stream;
    };

    const captureImage = () => {
        const context = canvasRef.current.getContext('2d');
        context.drawImage(videoRef.current, 0, 0, 400, 300);
        const imageData = canvasRef.current.toDataURL('image/png');
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
        setUploadComplete(true);
    };

    const handleOk = () => {
        setUploadComplete(false);
        setCapturedImage(null);
    };

    return (
        <div className="camera-page">
            <h1>Capture by Val</h1>
            <p>Use your camera to upload a beautiful moment! 📸</p>

            <video ref={videoRef} width="400" height="300" autoPlay />
            <canvas ref={canvasRef} width="400" height="300" style={{ display: 'none' }} />

            <div className="buttons">
                <button onClick={startCamera}>Start Camera</button>
                <button onClick={captureImage}>Capture</button>

                {capturedImage && (
                    <>
                        <img src={capturedImage} alt="Captured" />
                        <button onClick={uploadImage} disabled={uploading}>
                            {uploading ? 'Uploading...' : 'Upload'}
                        </button>
                    </>
                )}
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
        </div>
    );
}

export default CameraCapture;
