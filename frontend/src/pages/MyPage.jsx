import { useEffect, useRef, useState } from 'react';
import {
  UserIcon,
  CalendarIcon,
  ChartIcon,
  GearIcon,
  CoffeeIcon,
  MoonIcon,
  ClockIcon,
  SunIcon,
  BarsIcon,
  SpeakerIcon,
  ChevronIcon,
} from '../components/common/Icons.jsx';
import AnalyticsPage from './AnalyticsPage.jsx';
import { api } from '../api/client.js';
import PatternSettingsPage, { patternSummary } from './PatternSettingsPage.jsx';
import { scheduleChanged } from '../hooks/useLiveSchedule.js';

const DEMO_USER = { name: '민지', email: 'demo@jday.com', password: '1234' };
const SESSION_KEY = 'jday-demo-login';

function readStorage(key, fallback) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

const shortDate = (iso) => `${Number(iso.slice(5, 7))}월 ${Number(iso.slice(8, 10))}일`;
const clockOf = (hhmm) => (hhmm === '24:00' ? '00:00' : hhmm);

// 표시와 편집은 팀 공통 /api/user/settings를 사용한다.
function settingRows(settings, timetable) {
  const s = settings ?? {};
  const classes = timetable?.lessons.length ?? 0;
  const jobs = timetable?.otherBlocks.filter((b) => b.kind === 'job').length ?? 0;
  return {
    day: [
      { id: 'fixed', label: '고정 일정', icon: <CalendarIcon size={20} />, value: timetable ? `수업 ${classes} · 알바 ${jobs}` : '' },
      { id: 'break', label: '휴게 시간', icon: <CoffeeIcon size={20} />, value: s.breakMinutes != null ? `작업 사이 ${s.breakMinutes}분` : '' },
      { id: 'sleep', label: '수면 시간', icon: <MoonIcon size={20} />, value: s.dayEnd ? `${clockOf(s.dayEnd)} – ${s.dayStart}` : '' },
      {
        id: 'available',
        label: '작업 가능 시간',
        icon: <ClockIcon size={20} />,
        value:
          s.maxDailyMinutes && s.maxDailyMinutes < 1440
            ? `하루 최대 ${Number((s.maxDailyMinutes / 60).toFixed(1))}시간`
            : s.dayStart
              ? `${s.dayStart} – ${clockOf(s.dayEnd)}`
              : '',
      },
    ],
    ai: [
      { id: 'preferred', label: '희망 작업 시간대', icon: <SunIcon size={20} />, value: settings ? (s.distribution === 'even' ? '고르게 나누기' : '가능한 일찍') : '' },
      {
        id: 'style',
        label: '나의 작업 스타일',
        icon: <BarsIcon size={20} />,
        value: s.maxBlockMinutes ? `${s.maxBlockMinutes}분 집중 · ${s.breakMinutes}분 휴식` : '',
      },
      { id: 'voice', label: '제이 음성 · 알림', icon: <SpeakerIcon size={20} />, value: '기본' },
    ],
  };
}

const DETAIL = {
  break: (s) => `현재 블록 사이 휴식: ${s?.breakMinutes ?? '미설정'}분`,
  sleep: (s) => `작업을 넣지 않는 시간: ${clockOf(s?.dayEnd ?? '미설정')} – ${s?.dayStart ?? '미설정'}`,
  available: (s) => `작업 가능 시간: ${s?.dayStart ?? '미설정'} – ${clockOf(s?.dayEnd ?? '미설정')}`,
  preferred: (s) => `배치 방식: ${s?.distribution === 'even' ? '마감까지 고르게 나눠요' : '가능한 일찍 끝내도록 앞쪽부터 넣어요'}`,
  style: (s) => `최소 작업 단위: ${s?.minSlotMinutes ?? '미설정'}분 · 최대 연속 블록: ${s?.maxBlockMinutes ?? '미설정'}분`,
  voice: () => '제이 대화창 오른쪽 위 스피커 버튼으로 음성 응답을 켜고 끌 수 있어요.',
};

function Modal({ title, children, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      className="my-dialog"
      ref={ref}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="my-dialog-heading">
        <h2>{title}</h2>
        <button type="button" onClick={onClose} aria-label="닫기">
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}

// 05 마이: 프로필 · 주간 리포트 · 하루 설정 · AI 맞춤 설정
export default function MyPage({ nav }) {
  const [loggedIn, setLoggedIn] = useState(() => readStorage(SESSION_KEY, 'false') === 'true');
  const [email, setEmail] = useState(DEMO_USER.email);
  const [password, setPassword] = useState(DEMO_USER.password);
  const [error, setError] = useState('');
  const [panel, setPanel] = useState(null);
  const [report, setReport] = useState(null);
  const [reportError, setReportError] = useState('');
  const [timetable, setTimetable] = useState(null);
  const [reload, setReload] = useState(0);
  const [settingsSnapshot, setSettingsSnapshot] = useState(null);
  const [settingsError, setSettingsError] = useState('');
  const [saveResult, setSaveResult] = useState(null);
  useEffect(() => {
    let active = true;
    setSettingsError('');
    api.getUserSettings().then(data => { if (active) setSettingsSnapshot(data); })
      .catch(() => { if (active) setSettingsError('설정을 불러오지 못했어요.'); });
    return () => { active = false; };
  }, [reload]);

  useEffect(() => {
    let active = true;
    setReportError('');
    api
      .getAnalytics()
      .then((data) => active && setReport(data))
      .catch(() => active && setReportError('주간 리포트를 불러오지 못했어요.'));
    api
      .getTimetable()
      .then((data) => active && setTimetable(data))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [reload]);

  if (['break', 'sleep', 'available', 'style', 'preferred'].includes(panel)) return <PatternSettingsPage kind={panel} onBack={() => setPanel(null)} onSaved={result => {
    setSettingsSnapshot(result); setSaveResult(result); setPanel(null); setReload(value => value + 1); scheduleChanged();
  }} />;
  if (panel === 'report') return <AnalyticsPage onBack={() => setPanel(null)} onOpenSettings={() => setPanel(null)} />;

  const settings = settingsSnapshot?.settings ?? report?.profile?.settings;
  const rows = settingRows(settings, timetable);
  const selected = [...rows.day, ...rows.ai].find((item) => item.id === panel);

  function login(event) {
    event.preventDefault();
    if (email.trim() !== DEMO_USER.email || password !== DEMO_USER.password) {
      setError('체험용 이메일과 비밀번호를 확인해 주세요.');
      return;
    }
    setError('');
    setLoggedIn(true);
    setPassword('');
    setPanel(null);
    try {
      localStorage.setItem(SESSION_KEY, 'true');
    } catch {
      /* 현재 세션에서 유지 */
    }
  }
  function logout() {
    setLoggedIn(false);
    setPassword(DEMO_USER.password);
    setError('');
    setPanel(null);
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {
      /* 현재 세션에서 유지 */
    }
  }

  const openRow = (id) => { setSaveResult(null); if (id === 'fixed') nav.tab('tasks', 'setup'); else setPanel(id); };

  const menu = (title, items) => (
    <section className="d-section" aria-label={title}>
      <h2 className="d-h2">{title}</h2>
      <div className="d-card d-menu">
        {items.map((item) => (
          <button type="button" className="menu-row" key={item.id} onClick={() => openRow(item.id)}>
            <span className="menu-icon">{item.icon}</span>
            <span className="menu-label">{item.label}</span>
            <span className="d-meta">{['break', 'sleep', 'available', 'style', 'preferred'].includes(item.id) ? patternSummary(item.id, settingsSnapshot) : item.value}</span>
            <ChevronIcon size={16} />
          </button>
        ))}
      </div>
    </section>
  );

  return (
    <div className="d-page my">
      <header className="d-header is-center">
        <h1 className="d-title is-xl">마이</h1>
        <button type="button" className="d-icon-btn" aria-label="설정" onClick={() => setPanel('account')}>
          <GearIcon size={20} />
        </button>
      </header>

      <button type="button" className="profile" onClick={() => setPanel('account')}>
        <span className="profile-avatar" aria-hidden="true">
          <UserIcon size={26} />
        </span>
        <span>
          <strong>{report?.profile?.name || (loggedIn ? DEMO_USER.name : '사용자')} 님</strong>
          <small>제이가 나에게 맞는 하루를 만들어 드려요</small>
        </span>
      </button>

      <section className="d-card report" aria-label="나의 주간 리포트">
        <div className="report-head">
          <h2>나의 주간 리포트</h2>
          {report && (
            <span className="d-meta">
              {shortDate(report.from)} – {Number(report.to.slice(8, 10))}일
            </span>
          )}
        </div>
        {reportError ? (
          <p role="alert" className="d-meta">
            {reportError}{' '}
            <button type="button" className="d-link" onClick={() => setReload((r) => r + 1)}>
              다시 시도
            </button>
          </p>
        ) : report ? (
          <div className="report-stats">
            <div>
              <p className="d-meta">완료한 작업</p>
              <p className="report-num">{report.completedTasks}개</p>
            </div>
            <div>
              <p className="d-meta">계획된 작업 시간</p>
              <p className="report-num">{Number((report.scheduledMinutes / 60).toFixed(1))}시간</p>
            </div>
          </div>
        ) : (
          <p className="d-meta" role="status">
            리포트를 불러오는 중이에요…
          </p>
        )}
        <button type="button" className="report-link" onClick={() => setPanel('report')}>
          <ChartIcon size={20} />
          <span>이번 주 분석 자세히 보기</span>
          <ChevronIcon size={16} />
        </button>
      </section>

      {menu('내 하루 설정', rows.day)}
      {menu('AI 맞춤 설정', rows.ai)}
      {settingsError && <p className="d-error" role="alert">{settingsError} <button type="button" className="d-link" onClick={() => setReload(value => value + 1)}>다시 시도</button></p>}
      {saveResult && <section className="d-card" role="status"><p>설정을 저장하고 남은 작업을 재배치했어요.</p>{saveResult.unplaced?.length > 0 && <><p>마감 전에 배치하지 못한 작업이 있어요.</p><ul>{saveResult.unplaced.map(item => <li key={item.taskId}>{item.title}: {item.remainingMinutes}분 미배치</li>)}</ul></>}</section>}

      {panel === 'account' && (
        <Modal title="계정 설정" onClose={() => setPanel(null)}>
          <div className="demo-account">
            <p className="my-dialog-description">체험용 계정</p>
            {loggedIn ? (
              <>
                <h3>{DEMO_USER.name} 님</h3>
                <p>{DEMO_USER.email}</p>
                <button type="button" className="d-btn d-btn-dark d-btn-lg" onClick={logout}>
                  로그아웃
                </button>
              </>
            ) : (
              <>
                <p className="my-dialog-description">이메일 demo@jday.com · 비밀번호 1234</p>
                <form className="demo-login-form" onSubmit={login}>
                  <label htmlFor="demo-email">이메일</label>
                  <input
                    id="demo-email"
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                  />
                  <label htmlFor="demo-password">비밀번호</label>
                  <input
                    id="demo-password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                  />
                  {error && (
                    <p className="d-error" role="alert">
                      {error}
                    </p>
                  )}
                  <button className="d-btn d-btn-dark d-btn-lg" type="submit">
                    로그인
                  </button>
                </form>
              </>
            )}
          </div>
        </Modal>
      )}
      {selected && (
        <Modal title={selected.label} onClose={() => setPanel(null)}>
          <p className="my-dialog-description">{DETAIL[selected.id]?.(settings)}</p>

        </Modal>
      )}
    </div>
  );
}
