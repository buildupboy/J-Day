import Timeline from '../components/timeline/Timeline.jsx';
import ChatPanel from '../components/chat/ChatPanel.jsx';
import { formatKoreanDate } from '../utils/time.js';

export default function HomePage() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>J-Day</h1>
        <span className="app-date">{formatKoreanDate(new Date())}</span>
      </header>
      <main className="app-main">
        <section className="panel panel-timeline">
          <h2>오늘 타임라인</h2>
          <Timeline />
        </section>
        <section className="panel panel-chat">
          <h2>제이</h2>
          <ChatPanel />
        </section>
      </main>
    </div>
  );
}
