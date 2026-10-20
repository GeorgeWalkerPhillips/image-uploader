import React, { Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { PageSpinner } from './components/Spinner';
import { AuthCallbackRedirect } from './components/AuthCallbackRedirect';
import Home from './Home';
import CameraCapture from './CameraCapture';
import AdminEventManager from './AdminEventManager';
import Login from './Login';
import ResetPassword from './ResetPassword';
import Gallery from './Gallery';
import PrivacyPolicy from './PrivacyPolicy';
import Terms from './Terms';
import RefundPolicy from './RefundPolicy';
import WeddingPlanner from './WeddingPlanner';
import About from './About';
import { GuidesIndex, GuidePage } from './guides/Guides';
import { BlogIndex, BlogPostPage } from './blog/Blog';
import './App.css';

const WeddingApp = React.lazy(() => import('./wedding/WeddingApp'));

function App() {
  return (
    <AuthProvider>
      <AuthCallbackRedirect />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/camera" element={<CameraCapture />} />
        <Route path="/login" element={<Login />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <AdminEventManager />
            </ProtectedRoute>
          }
        />
        <Route path="/gallery" element={<Gallery />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/refund-policy" element={<RefundPolicy />} />
        <Route path="/wedding-planner" element={<WeddingPlanner />} />
        <Route path="/about" element={<About />} />
        <Route path="/guides" element={<GuidesIndex />} />
        <Route path="/guides/:slug" element={<GuidePage />} />
        <Route path="/blog" element={<BlogIndex />} />
        <Route path="/blog/:slug" element={<BlogPostPage />} />
        <Route
          path="/hq/*"
          element={
            // Not behind ProtectedRoute: Wedding HQ's own gate sends signed-out
            // visitors to /login?next=... (and /hq/join must be reachable first).
            <Suspense fallback={<PageSpinner />}>
              <WeddingApp />
            </Suspense>
          }
        />
      </Routes>
      <ToastContainer
        position="bottom-right"
        autoClose={4000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
      />
    </AuthProvider>
  );
}

export default App;
