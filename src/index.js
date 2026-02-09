import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './modern.css';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Register service worker for basic offline / installable behaviour
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(reg => {
      console.log('Service worker registered.', reg);
    }).catch(err => {
      console.warn('Service worker registration failed:', err);
    });
  });
}