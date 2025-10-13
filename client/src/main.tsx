import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
// Install a global fetch wrapper for auth handling
import './setup-fetch';
// Enable bypass for ProtectedRoute in E2E runs; server will still enforce writes
if (import.meta.env.MODE === 'test' || (window as any).__PLAYWRIGHT__) {
  (window as any).__E2E_BYPASS_PROTECTED__ = true;
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename="/">
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
