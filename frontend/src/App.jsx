import { useState } from 'react';
import BottomNav from './components/common/BottomNav.jsx';
import AddSheet from './components/common/AddSheet.jsx';
import VoiceScreen from './components/voice/VoiceScreen.jsx';
import HomePage from './pages/HomePage.jsx';
import CalendarPage from './pages/CalendarPage.jsx';
import SchedulePage from './pages/SchedulePage.jsx';
import TasksPage from './pages/TasksPage.jsx';
import NewEventPage from './pages/NewEventPage.jsx';
import RepeatEventPage from './pages/RepeatEventPage.jsx';
import FixedSchedulePage from './pages/FixedSchedulePage.jsx';
import FinishTaskPage from './pages/FinishTaskPage.jsx';
import MyPage from './pages/MyPage.jsx';
import useReminders from './hooks/useReminders.js';

// 탭 4개(홈·캘린더·일정·마이) + 가운데 마이크. 추가 선택창·등록 화면·제이 대화는 탭 위에 겹쳐 연다.
export default function App() {
  const [tab, setTab] = useState('home');
  const [scheduleView, setScheduleView] = useState('upcoming'); // 일정 탭: 'upcoming' | 'setup'
  const [overlay, setOverlay] = useState(null); // 'add' | 'newEvent' | 'repeat' | 'addTask' | 'fixed' | 'voice' | 'finish'
  const [finishing, setFinishing] = useState(null); // 작업 종료 화면에 넘길 { block, blocks, taskById }
  const [failedImport, setFailedImport] = useState(null);

  const reminderMessage = useReminders();

  const close = () => { setOverlay(null); setFailedImport(null); };
  const nav = {
    tab: (id, view) => {
      if (view) setScheduleView(view);
      setTab(id);
      setOverlay(null);
    },
    open: (id) => { setFailedImport(null); setOverlay(id); },
    importFailed: (context) => {
      setFailedImport(context);
      setTab('my');
      setOverlay('fixed');
    },
    // 작업 종료 화면: 끝낸 블록과 그날 블록 목록으로 남은/초과 시간을 계산한다
    finish: (context) => {
      setFinishing(context);
      setOverlay('finish');
    },
  };

  let page;
  if (tab === 'calendar') page = <CalendarPage nav={nav} />;
  else if (tab === 'tasks') page = <SchedulePage nav={nav} view={scheduleView} onViewChange={setScheduleView} />;
  else if (tab === 'my') page = <MyPage nav={nav} />;
  else page = <HomePage nav={nav} />;

  return (
    <div className="app">
      <main className="app-main">{page}</main>
      <BottomNav active={tab} onSelect={(id) => nav.tab(id)} onMic={() => setOverlay('voice')} />
      {overlay === 'add' && <AddSheet nav={nav} onClose={close} />}
      {overlay === 'newEvent' && (
        <div className="screen-overlay">
          <NewEventPage nav={nav} onClose={close} />
        </div>
      )}
      {overlay === 'repeat' && (
        <div className="screen-overlay">
          <RepeatEventPage nav={nav} onClose={close} />
        </div>
      )}
      {overlay === 'addTask' && (
        <div className="screen-overlay">
          <TasksPage nav={nav} onClose={close} />
        </div>
      )}
      {overlay === 'fixed' && (
        <div className="screen-overlay">
          <FixedSchedulePage onBack={close} initialImport={failedImport} />
        </div>
      )}
      {overlay === 'finish' && finishing && (
        <div className="screen-overlay">
          <FinishTaskPage {...finishing} nav={nav} onClose={close} />
        </div>
      )}
      {reminderMessage && <div className="toast" role="status">{reminderMessage}</div>}
      {overlay === 'voice' && <VoiceScreen nav={nav} onClose={close} />}
    </div>
  );
}
