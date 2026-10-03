import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Suppress benign Vite HMR WebSocket errors (HMR is disabled in AI Studio preview environment)
window.addEventListener('unhandledrejection', (event) => {
  const reasonStr = String(event.reason?.message || event.reason || '');
  if (reasonStr.includes('WebSocket') || reasonStr.includes('websocket')) {
    event.preventDefault();
  }
});

window.addEventListener('error', (event) => {
  const msgStr = String(event.message || '');
  if (msgStr.includes('WebSocket') || msgStr.includes('websocket')) {
    event.preventDefault();
  }
});

createRoot(document.getElementById('root')!).render(<App />);
