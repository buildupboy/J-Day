import { HomeIcon, CalendarIcon, MicIcon, ListIcon, ChartIcon } from './Icons.jsx';

export const TABS = [
  { id: 'home', label: '홈', icon: <HomeIcon /> },
  { id: 'calendar', label: '캘린더', icon: <CalendarIcon /> },
  { id: 'mic', label: '제이', icon: <MicIcon /> },
  { id: 'tasks', label: '작업', icon: <ListIcon /> },
  { id: 'analytics', label: '분석', icon: <ChartIcon /> },
];

// 가운데 마이크 탭은 화면 이동이 아니라 제이 대화창을 연다
export default function BottomNav({ active, onSelect, onMic }) {
  return (
    <nav className="bottom-nav">
      {TABS.map((tab) =>
        tab.id === 'mic' ? (
          <button
            key={tab.id}
            type="button"
            className="nav-mic"
            onClick={onMic}
            aria-label="제이에게 말하기"
          >
            {tab.icon}
          </button>
        ) : (
          <button
            key={tab.id}
            type="button"
            className={`nav-item ${active === tab.id ? 'is-active' : ''}`}
            onClick={() => onSelect(tab.id)}
          >
            <span className="nav-icon">{tab.icon}</span>
            <span className="nav-label">{tab.label}</span>
          </button>
        )
      )}
    </nav>
  );
}
