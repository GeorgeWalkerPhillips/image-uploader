import React from 'react';
import { useSearchParams, Navigate } from 'react-router-dom';
import LandingPage from './LandingPage';

function Home() {
  const [searchParams] = useSearchParams();
  const eventId = searchParams.get('event');

  if (eventId) {
    // Guests joining via QR code / event link land straight in the camera,
    // like scanning a disposable camera at a wedding — not a bare upload form.
    return <Navigate to={`/camera?event=${eventId}`} replace />;
  }

  return <LandingPage />;
}

export default Home;
