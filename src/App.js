import React from "react";
import { Routes, Route, Link } from "react-router-dom";
import FileUploadPage from "./FileUploadPage"; // Your current upload UI
import CameraCapture from "./CameraCapture";   // The camera UI

function App() {
  return (
    <div>
      <Routes>
        <Route path="/" element={<FileUploadPage />} />
        <Route path="/camera" element={<CameraCapture />} />
      </Routes>
    </div>
  );
}

export default App;
