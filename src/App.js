import React from "react";
import { Routes, Route, Link } from "react-router-dom";
import FileUploadPage from "./Home"; // Your current upload UI
import CameraCapture from "./CameraCapture";   // The camera UI
import Home from "./Home";

function App() {
  return (
    <div>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/camera" element={<CameraCapture />} />
      </Routes>
    </div>
  );
}

export default App;
