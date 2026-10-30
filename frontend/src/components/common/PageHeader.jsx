import { BellIcon, UserIcon } from './Icons.jsx';

// 각 화면 상단 공통 헤더. 오른쪽에 알림(종) → 마이(사람) 순으로 배치
export default function PageHeader({ title, subtitle, onOpenMy, onBack }) {
  return (
    <header className="page-header">
      <div className="page-header-title">
        {onBack && (
          <button type="button" className="icon-button" onClick={onBack} aria-label="뒤로">
            ←
          </button>
        )}
        <div>
          {subtitle && <div className="page-header-sub">{subtitle}</div>}
          <h1>{title}</h1>
        </div>
      </div>
      <div className="page-header-actions">
        <button type="button" className="icon-button" aria-label="알림">
          <BellIcon />
        </button>
        {onOpenMy && (
          <button type="button" className="icon-button" onClick={onOpenMy} aria-label="마이">
            <UserIcon />
          </button>
        )}
      </div>
    </header>
  );
}
