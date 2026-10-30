import { useEffect, useRef, useState } from 'react';
import { UserIcon, CalendarIcon, ChartIcon } from '../components/common/Icons.jsx';
import AnalyticsPage from './AnalyticsPage.jsx';
import FixedSchedulePage from './FixedSchedulePage.jsx';
import { api } from '../api/client.js';
import PatternSettingsPage, { patternSummary } from './PatternSettingsPage.jsx';
import { scheduleChanged } from '../hooks/useLiveSchedule.js';

const DEMO_USER = { name: '민지', email: 'demo@jday.com', password: '1234' };
const SESSION_KEY = 'jday-demo-login';
const groups = [
  { title: '내 하루 설정', items: [
    { id: 'fixed', label: '고정 일정', icon: 'calendar', value: '월~금 09:00–18:00', hint: '수업, 알바 등 매주 반복되는 일정을 입력해 주세요.' },
    { id: 'break', label: '휴게 시간', icon: 'coffee', value: '12:00–13:00', hint: '식사나 휴식을 위한 시간을 입력해 주세요.' },
    { id: 'sleep', label: '수면 시간', icon: 'moon', value: '23:00–07:00', hint: '평소 잠들고 일어나는 시간을 입력해 주세요.' },
    { id: 'available', label: '작업 가능 시간', icon: 'clock', value: '09:00–22:00', hint: '작업을 배치할 수 있는 시간을 입력해 주세요.' },
  ] },
  { title: 'AI 맞춤 설정', items: [
    { id: 'preferred', label: '희망 작업 시간대', icon: 'sun', options: ['아침', '낮', '저녁', '새벽'] },
    { id: 'style', label: '나의 작업 스타일', icon: 'brain', value: '짧게 나누어 집중하기', options: ['짧게 나누어 집중하기', '오래 몰입하기', '여유 있게 진행하기'] },
    { id: 'personal', label: 'AI 개인화 정보', icon: 'sparkles', value: '어려운 작업은 오전에 하고 싶어요.', hint: '제이가 알아두면 좋을 나의 습관이나 선호를 적어 주세요.' },
  ] },
];
const allSettings = groups.flatMap((group) => group.items);
function readStorage(key, fallback) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function Icon({ name }) {
  if (name === 'calendar') return <CalendarIcon />;
  const paths = {
    gear: <><path d="M9.5 3h5l.6 2.5 2 .9 2.3-.8 2.5 4.3-1.8 1.7v.8l1.8 1.7-2.5 4.3-2.3-.8-2 .9-.6 2.5h-5l-.6-2.5-2-.9-2.3.8-2.5-4.3 1.8-1.7v-.8L2.1 9.9l2.5-4.3 2.3.8 2-.9Z" /><circle cx="12" cy="12" r="3.2" /></>,
    coffee: <><path d="M4 9h13v7a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM17 10h2a3 3 0 0 1 0 6h-2M6 3v3M10 2v4M14 3v3" /></>,
    moon: <path d="M20 14A9 9 0 0 1 10 3a9 9 0 1 0 10 11Z" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5" /></>,
    brain: <><path d="M12 5c-3-5-8-1-6 2-5 0-5 7-2 8-2 4 3 7 5 5 0 3 3 2 3 0V5Zm0 0c3-5 8-1 6 2 5 0 5 7 2 8 2 4-3 7-5 5 0 3-3 2-3 0M8 8l1 3-2 2M16 8l-1 3 2 2M8 17h1M15 17h1" /></>,
    sparkles: <><path d="m10 5 2.5 6.5L19 14l-6.5 2.5L10 23l-2.5-6.5L1 14l6.5-2.5ZM19 1l1 3 3 1-3 1-1 3-1-3-3-1 3-1Z" /></>,
  };
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
function Modal({ title, children, onClose }) {
  const ref = useRef(null);
  useEffect(() => { const dialog = ref.current; dialog.showModal(); return () => dialog.close(); }, []);
  return <dialog className="my-dialog" ref={ref} onCancel={onClose} onClick={(event) => { if (event.target === ref.current) onClose(); }}>
    <div className="my-dialog-heading"><h2>{title}</h2><button type="button" onClick={onClose} aria-label="닫기">×</button></div>
    {children}
  </dialog>;
}

export default function MyPage() {
  const [loggedIn, setLoggedIn] = useState(() => readStorage(SESSION_KEY, 'false') === 'true');
  const [email, setEmail] = useState(DEMO_USER.email);
  const [password, setPassword] = useState(DEMO_USER.password);
  const [error, setError] = useState('');
  const [panel, setPanel] = useState(null);
  const [weeklyReport, setWeeklyReport] = useState(null);
  const [reportError, setReportError] = useState('');
  const [reload, setReload] = useState(0);
  const [settingsSnapshot, setSettingsSnapshot] = useState(null);
  const [settingsError, setSettingsError] = useState('');
  const [saveResult, setSaveResult] = useState(null);
  useEffect(() => {
    let active = true;
    setSettingsError('');
    api.getUserSettings().then((data) => { if (active) setSettingsSnapshot(data); })
      .catch(() => { if (active) setSettingsError('설정을 불러오지 못했어요.'); });
    return () => { active = false; };
  }, [panel, reload]);
  useEffect(() => {
    let active = true;
    setReportError('');
    api.getAnalytics().then((data) => { if (active) setWeeklyReport(data); })
      .catch(() => { if (active) setReportError('주간 리포트를 불러오지 못했어요.'); });
    return () => { active = false; };
  }, [panel, reload]);
  const selected = allSettings.find((item) => item.id === panel);
  if (['break', 'sleep', 'available', 'style', 'preferred'].includes(panel)) return <PatternSettingsPage kind={panel} onBack={() => setPanel(null)} onSaved={(result) => { setSettingsSnapshot(result); setSaveResult(result); setPanel(null); scheduleChanged(); }} />;
  if (panel === 'fixed') return <FixedSchedulePage onBack={() => setPanel(null)} />;
  function login(event) {
    event.preventDefault();
    if (email.trim() !== DEMO_USER.email || password !== DEMO_USER.password) {
      setError('체험용 이메일과 비밀번호를 확인해 주세요.');
      return;
    }
    setError(''); setLoggedIn(true); setPassword(''); setPanel(null);
    try { localStorage.setItem(SESSION_KEY, 'true'); } catch { /* 현재 세션에서 유지 */ }
  }
  function logout() {
    setLoggedIn(false); setPassword(DEMO_USER.password); setError(''); setPanel(null);
    try { localStorage.removeItem(SESSION_KEY); } catch { /* 현재 세션에서 유지 */ }
  }
  if (panel === 'report') return <AnalyticsPage onBack={() => setPanel(null)} onOpenSettings={() => { setPanel(null); requestAnimationFrame(() => document.querySelector('.my-preferences')?.scrollIntoView({ behavior: 'smooth' })); }} />;
  return <div className="my-page">
    <header className="my-heading"><h1>마이</h1><button className="my-settings-button" type="button" aria-label="계정 설정" onClick={() => setPanel('account')}><Icon name="gear" /></button></header>
    <button type="button" className="my-profile" onClick={() => setPanel('account')}>
      <span className="my-avatar"><UserIcon size={29} /></span>
      <span><strong>{weeklyReport?.profile.name || '사용자'} 님</strong><span className="my-profile-description">제이가 나에게 맞는 하루를 만들어 드려요.</span></span>
    </button>
    <section className="my-report" aria-labelledby="my-report-title">
      <button type="button" className="my-report-heading" onClick={() => setPanel('report')}><h2 id="my-report-title">나의 주간 리포트</h2><span className="my-chevron" aria-hidden="true">›</span></button>
      {reportError ? <p role="alert">{reportError} <button type="button" className="analysis-text-button" onClick={() => setReload(reload + 1)}>다시 시도</button></p> : weeklyReport ? <div className="my-report-stats"><div><span>완료한 작업</span><strong>{weeklyReport.completedTasks}개</strong></div><div><span>계획된 작업 시간</span><strong>{Number((weeklyReport.scheduledMinutes / 60).toFixed(1))}시간</strong></div></div> : <p className="analysis-note" role="status">리포트를 불러오는 중이에요…</p>}
      <button type="button" className="my-report-link" onClick={() => setPanel('report')}><ChartIcon size={22} /><span>이번 주 분석 자세히 보기</span><span className="my-chevron" aria-hidden="true">›</span></button>
    </section>
    {groups.map((group) => <section className="my-preferences" key={group.title} aria-label={group.title}>
      <h2>{group.title}</h2><div className="my-menu">{group.items.map((item) => <button type="button" className="my-menu-row" key={item.id} onClick={() => { setSaveResult(null); setPanel(item.id); }}><span className="my-menu-icon"><Icon name={item.icon} /></span><span>{item.label}</span><small className="my-setting-value">{patternSummary(item.id, settingsSnapshot)}</small><span className="my-chevron" aria-hidden="true">›</span></button>)}</div>
    </section>)}
    {settingsError && <p className="pattern-error" role="alert">{settingsError} <button type="button" onClick={() => setReload(reload + 1)}>다시 시도</button></p>}
    {saveResult && <div className="pattern-receipt" role="status"><strong>설정을 저장하고 남은 작업을 재배치했어요.</strong>{saveResult.unplaced.length > 0 && <><p>일부 작업을 마감 전까지 배치하지 못했어요. 작업량·마감·작업 가능 시간을 확인해 주세요.</p><ul>{saveResult.unplaced.map((item) => <li key={item.taskId}>{item.title}: {item.remainingMinutes}분 미배치</li>)}</ul></>}{saveResult.ongoingBlocks > 0 && <p>이미 진행 중인 블록은 기존 시간대로 유지했어요.</p>}</div>}
    {panel === 'account' && <Modal title="계정 설정" onClose={() => setPanel(null)}>
      <div className="demo-account"><p className="my-dialog-description">체험용 계정</p>{loggedIn ? <><h3>{DEMO_USER.name} 님</h3><p>{DEMO_USER.email}</p><button type="button" className="primary-button" onClick={logout}>로그아웃</button></> : <><p className="my-dialog-description">이메일 demo@jday.com · 비밀번호 1234</p><form className="demo-login-form" onSubmit={login}><label htmlFor="demo-email">이메일</label><input id="demo-email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required /><label htmlFor="demo-password">비밀번호</label><input id="demo-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />{error && <p className="chat-error" role="alert">{error}</p>}<button className="primary-button" type="submit">로그인</button></form></>}</div>
    </Modal>}
    {selected && <Modal title={selected.label} onClose={() => setPanel(null)}>
      <p className="my-dialog-description">이 항목은 별도 저장 필드와 일정 배치 연동 확장이 필요해요.</p>
      <p className="my-dialog-description">이전 체험용 브라우저 설정은 실제 일정에 적용하지 않아요.</p>
    </Modal>}
  </div>;
}
