import React from "react";
import { Routes, Route, Link } from "react-router-dom";
import CameraCapture from "./CameraCapture";   // The camera UI
import Home from "./Home" ; 

function App() {
  return (
    <div>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/camera" element={<CameraCapture />} />
        <Route path="/admin-setup-3782" element={<EventSetup />} />
      </Routes>
    </div>
  );
}

export default App;
