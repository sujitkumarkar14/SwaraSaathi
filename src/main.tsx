import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Register standard PWA offline support service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => console.log('[SwaraSaathi] ServiceWorker active under scope:', reg.scope))
      .catch((err) => console.error('[SwaraSaathi] ServiceWorker activation failed:', err));
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
