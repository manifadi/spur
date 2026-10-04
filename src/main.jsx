import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/quicksand/500.css';
import '@fontsource/quicksand/600.css';
import '@fontsource/quicksand/700.css';
import './styles/tokens.css';
import './styles/app.css';
import App from './App.jsx';

const root = createRoot(document.getElementById('root'));
// Testlevel (/testlevel): nur im Dev-Server. Im Build ist import.meta.env.DEV false, der
// Zweig samt src/dev/ fällt komplett weg und landet nie im Deployment.
if (import.meta.env.DEV && /\/testlevel\/?$/.test(location.pathname)) {
  import('./dev/testlevel.jsx').then(({ TestApp }) => root.render(<StrictMode><TestApp /></StrictMode>));
} else {
  root.render(<StrictMode><App /></StrictMode>);
}

// Service Worker für Offline-Nutzung (nur im Build; im Dev-Server stört er beim Entwickeln).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
