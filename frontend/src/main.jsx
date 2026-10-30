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

// 푸시 알림은 서비스워커가 있어야 하므로 개발 서버에서도 등록한다(localhost는 허용됨).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));
}
