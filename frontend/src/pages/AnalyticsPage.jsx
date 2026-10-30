import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
const labels = { report: '보고서', coding: '코딩', exam: '시험', presentation: '발표', reading: '읽기', etc: '기타' };
const colors = ['#111', '#555', '#888', '#aaa', '#ccc', '#e5e5e5'];
const hours = (minutes) => `${Number((minutes / 60).toFixed(1))}시간`;
const statuses = { planned: '예정', done: '완료', missed: '완료 미확인' };
function shiftPeriod(from, mode, direction) {
  const date = new Date(from + 'T00:00:00Z');
  if (mode === 'month') date.setUTCMonth(date.getUTCMonth() + direction);
  else date.setUTCDate(date.getUTCDate() + direction * 7);
  return date.toISOString().slice(0, 10);
}
export default function AnalyticsPage({ onBack, onOpenSettings }) {
  const [mode, setMode] = useState('week');
  const [from, setFrom] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [day, setDay] = useState(null);
  const [patterns, setPatterns] = useState(false);
  useEffect(() => {
    let active = true; setLoading(true); setError(''); setDay(null);
    api.getAnalytics(mode, from).then((result) => { if (active) setData(result); })
      .catch((err) => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [mode, from, retry]);
  const categories = data ? Object.entries(data.categoryMinutes) : [];
  let cumulative = 0;
  const gradient = categories.map(([, minutes], index) => { const start = cumulative; cumulative += data.scheduledMinutes ? minutes / data.scheduledMinutes * 100 : 0; return `${colors[index]} ${start}% ${cumulative}%`; }).join(',');
  const selectedDay = data?.daily.find((item) => item.date === day);
  const max = Math.max(1, ...(data?.daily.map((item) => item.minutes) || []));
  return <div className="analysis-page">
    <header className="analysis-heading"><button type="button" className="analysis-back" aria-label={patterns ? '분석 요약으로 돌아가기' : '마이로 돌아가기'} onClick={() => patterns ? setPatterns(false) : onBack()}>‹</button><h1>{patterns ? '내 작업 패턴' : mode === 'week' ? '주간 분석' : '월간 분석'}</h1><div className="analysis-switch">{[['week', '주'], ['month', '월']].map(([id, label]) => <button type="button" aria-pressed={mode === id} key={id} onClick={() => { setMode(id); setFrom(null); }}>{label}</button>)}</div></header>
    <p className="analysis-demo">저장된 작업·배치·완료 기록 기준 · 한국 시간</p>
    {data && <div className="analysis-period"><button type="button" aria-label="이전 기간" disabled={loading} onClick={() => setFrom(shiftPeriod(data.from, mode, -1))}>‹</button><span>{data.from} — {data.to}</span><button type="button" aria-label="다음 기간" disabled={loading} onClick={() => setFrom(shiftPeriod(data.from, mode, 1))}>›</button></div>}
    {loading ? <p role="status">분석 기록을 불러오는 중이에요…</p> : error ? <div role="alert"><p>분석을 불러오지 못했어요. {error}</p><button type="button" className="primary-button" onClick={() => setRetry(retry + 1)}>다시 시도</button></div> : data && <>
      {!patterns ? <>
        <div className="analysis-totals"><div><span>완료한 작업</span><strong>{data.completedTasks}개</strong></div><div><span>계획된 작업 시간</span><strong>{hours(data.scheduledMinutes)}</strong><small>현재 저장된 배치 기준</small></div></div>
        <section className="analysis-section"><h2>기간 내 마감 작업 완료 현황</h2><p className="analysis-copy"><strong>{data.dueTasks.completed} / {data.dueTasks.total}개{data.dueTasks.total ? ` (${Math.round(data.dueTasks.completed / data.dueTasks.total * 100)}%)` : ''}</strong></p><p className="analysis-note">분모: 이 기간 마감인 작업 · 분자: 현재 완료 상태인 작업. 기한 내 완료율이나 최초 주간 계획 달성률이 아니에요.</p></section>
        <section className="analysis-section"><h2>계획 시간 배분</h2>{data.scheduledMinutes ? <div className="analysis-ratio"><div className="analysis-donut" style={{ background: `conic-gradient(${gradient})` }} role="img" aria-label={categories.map(([type, minutes]) => `${labels[type]} ${minutes}분`).join(', ')}><div><strong>{Number((data.scheduledMinutes / 60).toFixed(1))}h</strong><span>계획 시간</span></div></div><ul className="analysis-legend">{categories.filter(([, minutes]) => minutes > 0).map(([type, minutes]) => <li key={type}><i style={{ background: colors[categories.findIndex(([id]) => id === type)] }} /><span>{labels[type]}</span><small>{hours(minutes)} · {Math.round(minutes / data.scheduledMinutes * 100)}%</small></li>)}</ul></div> : <p className="analysis-note">이 기간에 저장된 작업 배치가 없어요.</p>}<p className="analysis-note">{data.notes[0]} 실제 사용 시간 통계가 아니에요.</p></section>
        <section className="analysis-section"><h2>요일별 작업 현황</h2><div className={`analysis-bars ${mode === 'month' ? 'is-month' : ''}`}>{data.daily.map((item) => <button type="button" className="analysis-bar-column analysis-day-button" key={item.date} aria-pressed={day === item.date} aria-label={`${item.date} 계획 ${item.minutes}분, 완료 작업 ${item.completedTasks}개, 완료 미확인 블록 ${item.missedBlocks}개`} onClick={() => setDay(item.date)}><span>{Number((item.minutes / 60).toFixed(1))}h</span><div className="analysis-bar-track"><i style={{ height: `${item.minutes / max * 100}%` }} /></div><small>{mode === 'week' ? ['일', '월', '화', '수', '목', '금', '토'][new Date(item.date + 'T00:00:00Z').getUTCDay()] : item.date.slice(8)}</small></button>)}</div><p className="analysis-note">요일을 누르면 계획·완료 현황을 확인할 수 있어요.</p>
          {selectedDay && <div className="analysis-day-detail"><h3>{selectedDay.date}</h3><p className="analysis-copy">계획 {hours(selectedDay.minutes)} · 완료 작업 {selectedDay.completedTasks}개 · 완료 미확인 블록 {selectedDay.missedBlocks}개</p>{selectedDay.blocks.length ? selectedDay.blocks.map((block, index) => <div className="analysis-record" key={block.id || index}><div><strong>{block.title}</strong><span>{block.start}–{block.end}</span><span>{statuses[block.status] || '상태 미확인'}</span></div></div>) : <p className="analysis-note">이 날짜에 저장된 배치가 없어요.</p>}</div>}
        </section>
        <section className="analysis-section"><h2>{mode === 'week' ? '이번 주' : '이번 달'} 마감 작업</h2><p className="analysis-note">별도 주간 목표 저장 기능이 없어 마감 작업으로 표시해요.</p>{data.dueTasks.items.length ? <ul className="analysis-due-list">{data.dueTasks.items.map((task) => <li key={task.id}><span aria-hidden="true">{task.status === 'done' ? '✓' : '○'}</span><div><strong>{task.title}</strong><small>마감 {new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric' }).format(new Date(task.deadline.length === 10 ? task.deadline + 'T12:00:00+09:00' : task.deadline))} · {task.status === 'done' ? '완료' : '미완료'}</small></div></li>)}</ul> : <p className="analysis-copy">이 기간에 마감인 작업이 없어요.</p>}</section>
        <section className="analysis-section"><h2>미완료 및 지연 현황</h2><div className="analysis-bands"><div><span>미확인 블록</span><strong>{data.missedBlocks}개</strong></div><div><span>연결된 작업</span><strong>{data.missedTasks}개</strong></div><div><span>기한 지난 미완료</span><strong>{data.overdueTasks}개</strong></div></div><p className="analysis-note">{data.notes[1]}</p></section>
        <section className="analysis-section"><button type="button" className="analysis-pattern-link" onClick={() => { setPatterns(true); document.querySelector('.app-main')?.scrollTo(0, 0); }}><span>내 작업 패턴 자세히 보기</span><span aria-hidden="true">›</span></button></section>
        <section className="analysis-section"><h2>제이의 분석 결과</h2>{data.suggestions.map((message) => <p className="analysis-copy" key={message}>{message}</p>)}<p className="analysis-note">저장된 통계에 따른 안내예요. 설정이나 일정을 자동 변경하지 않아요.</p></section>
      </> : <>
        <section className="analysis-section"><h2>작업 유형별 완료·미확인</h2>{data.patterns.map((item) => <div className="analysis-speed-row" key={item.type}><strong>{labels[item.type]}</strong><span>완료 작업 {item.completedTasks}개 · 미확인 블록 {item.missedBlocks}개</span></div>)}<p className="analysis-note">완료 작업은 완료 기록 기준, 미확인 블록은 현재 저장된 배치 기준이에요.</p></section>
        <section className="analysis-section"><h2>내 작업 속도</h2>{data.patterns.filter((item) => item.validActualRecords > 0).map((item) => <p className="analysis-copy" key={item.type}>{labels[item.type]}: 유효한 시간 보고 기록 {item.validActualRecords}개</p>)}<p className="analysis-copy">{data.patterns.some((item) => item.validActualRecords) ? '시간 보고 기록은 있지만, 기존 스케줄러의 개인 보정 함수가 아직 구현되지 않아 계수를 표시하지 않아요.' : '아직 작업 속도를 분석할 기록이 부족해요.'}</p><p className="analysis-note">실제시간이 보고되지 않았거나 0인 기록은 제외해요. 분석 화면에서 별도 보정 공식을 만들지 않아요.</p></section>
        <section className="analysis-section"><h2>배치 시간대별 완료 현황</h2>{data.bands.map((band) => <div className="analysis-speed-row" key={band.label}><strong>{band.label}</strong><span>{hours(band.minutes)} · 완료 블록 {band.done}/{band.total}</span></div>)}<p className="analysis-note">블록 시작 시각 기준(오전 06–12시, 오후 12–18시, 그 외 저녁·밤). 실제 집중시간을 측정한 결과가 아니에요.</p></section>
        <section className="analysis-section"><h2>개인화 연동 범위</h2><p className="analysis-copy">{data.notes[2]}</p><p className="analysis-note">수면·희망 시간대 저장과 진행 보고 이력, 지연 원인 및 단원별 이해도 분석은 별도 확장이 필요해요.</p><button type="button" className="analysis-text-button" onClick={onOpenSettings}>생활 패턴 설정 확인하기 ›</button></section>
      </>}
    </>}
  </div>;
}
