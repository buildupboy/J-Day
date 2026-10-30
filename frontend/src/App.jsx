import { useState } from 'react';
import BottomNav from './components/common/BottomNav.jsx';
import VoiceScreen from './components/voice/VoiceScreen.jsx';
import HomePage from './pages/HomePage.jsx';
import CalendarPage from './pages/CalendarPage.jsx';
import TasksPage from './pages/TasksPage.jsx';
import MyPage from './pages/MyPage.jsx';
import AnalyticsPage from './pages/AnalyticsPage.jsx';

export default function App() {
  const [tab, setTab] = useState('home');
  const [showMy, setShowMy] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  const openMy = () => setShowMy(true);
  const selectTab = (id) => {
    if (id === 'my') {
      setShowMy(true);
      return;
    }
    setShowMy(false);
    setTab(id);
  };

  let page;
  if (showMy) {
    page = <MyPage onBack={() => setShowMy(false)} />;
  } else if (tab === 'calendar') {
    page = <CalendarPage onOpenMy={openMy} />;
  } else if (tab === 'tasks') {
    page = <TasksPage onClose={() => selectTab('home')} />;
  } else if (tab === 'analytics') {
    page = <AnalyticsPage onOpenMy={openMy} />;
  } else {
    page = <HomePage onOpenMy={openMy} onNavigate={selectTab} />;
  }

  return (
    <div className="app">
      <main className="app-main">{page}</main>
      <BottomNav active={showMy ? 'my' : tab} onSelect={selectTab} onMic={() => setChatOpen(true)} />
      {chatOpen && <VoiceScreen onClose={() => setChatOpen(false)} />}
    </div>
  );
}
