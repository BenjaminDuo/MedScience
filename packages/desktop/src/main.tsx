import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { installApiClient } from './runtime/apiClient';
import './index.css';

// Electron's preload or the loopback web bridge -- whichever is present --
// is wired up before React mounts, so the first render can already call it.
installApiClient();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
