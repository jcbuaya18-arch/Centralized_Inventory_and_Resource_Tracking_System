
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Register Service Worker for offline capability
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => console.log('[Service Worker] Scope registered:', reg.scope))
      .catch((err) => console.warn('[Service Worker] Registration failure:', err));
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
