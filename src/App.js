import React, { useState } from "react";
import "./App.css";

function App() {
  const [images, setImages] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [fileNames, setFileNames] = useState([]);
  const [uploadComplete, setUploadComplete] = useState(false);

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
    <div className="App-header">
      <h1>Zani & Stian's Wedding</h1>
      <p>Upload your beautiful moments to our wedding album! 📸</p>

      <div className="picker-container">
        {/* Custom file picker */}
        <label className="custom-file-upload">
          <input type="file" multiple onChange={handleFileChange} />
          Choose Photos
        </label>

        {/* Display selected file names */}
        {fileNames.length > 0 && (
          <p className="file-names">{fileNames.join(", ")}</p>
        )}

        {/* Upload Button */}
        <button className="button-36" onClick={handleUpload}>Upload to Zani & Stian</button>
      </div>

      {/* Loading popup */}
      {uploading && (
        <div className="popup">
          <div className="popup-content">
            <div className="spinner"></div>
            <p>Uploading... Please do not leave this page.</p>
          </div>
        </div>
      )}

      {/* Success popup */}
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

export default App;
