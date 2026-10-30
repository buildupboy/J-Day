import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { AppDialogsProvider } from './components/common/AppDialogs.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppDialogsProvider><App /></AppDialogsProvider>
  </React.StrictMode>
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));
}
