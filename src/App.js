import React from "react";
import { Routes, Route, Link } from "react-router-dom";
import CameraCapture from "./CameraCapture";
import Home from "./Home";
import AdminEventManager from "./AdminEventManager"; 
import Login from "./Login";

function App() {
  return (
    <div>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/camera" element={<CameraCapture />} />
        <Route path="/login" element={<Login />} />
        <Route path="/admin" element={<AdminEventManager />} />  {/* ✅ new admin route */}
        <Route path="/unauthorized" element={<div>🚫 Unauthorized Access</div>} /> {/* Optional */}
      </Routes>
    </div>
  );
}

export default App;
