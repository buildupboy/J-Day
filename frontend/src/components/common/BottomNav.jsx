import { HomeIcon, CalendarIcon, MicIcon, ListIcon, UserIcon } from './Icons.jsx';

export const TABS = [
  { id: 'home', label: '홈', icon: <HomeIcon size={22} /> },
  { id: 'calendar', label: '캘린더', icon: <CalendarIcon size={22} /> },
  { id: 'mic', label: '제이', icon: <MicIcon size={24} /> },
  { id: 'tasks', label: '일정', icon: <ListIcon size={22} /> },
  { id: 'my', label: '마이', icon: <UserIcon size={22} /> },
];

// 가운데 마이크 탭은 화면 이동이 아니라 제이 대화창을 연다
export default function BottomNav({ active, onSelect, onMic }) {
  return (
    <nav className="bottom-nav" aria-label="주요 메뉴">
      {TABS.map((tab) =>
        tab.id === 'mic' ? (
          <button key={tab.id} type="button" className="nav-mic-slot" onClick={onMic} aria-label="제이에게 말하기">
            <span className="nav-mic">{tab.icon}</span>
          </button>
        ) : (
          <button
            key={tab.id}
            type="button"
            className={`nav-item ${active === tab.id ? 'is-active' : ''}`}
            aria-current={active === tab.id ? 'page' : undefined}
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
