import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/quicksand/500.css';
import '@fontsource/quicksand/600.css';
import '@fontsource/quicksand/700.css';
import './styles/tokens.css';
import './styles/app.css';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);

// Service Worker für Offline-Nutzung (nur im Build; im Dev-Server stört er beim Entwickeln).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
