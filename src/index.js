import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { logError } from './services/errorLogger';
import reportWebVitals from './reportWebVitals';

// Catches anything outside React's own render cycle — raw JS errors and
// unhandled promise rejections — so nothing critical goes unlogged.
window.addEventListener('error', (event) => {
  logError('window.onerror', event.error || event.message, { severity: 'critical' });
});

window.addEventListener('unhandledrejection', (event) => {
  logError('unhandledrejection', event.reason, { severity: 'critical' });
});

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);

reportWebVitals();
