import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { ChevronIcon, ChevronLeftIcon } from '../components/common/Icons.jsx';
import AnalyticsTaskDetail from '../components/tasks/AnalyticsTaskDetail.jsx';
const labels = { report: '보고서', coding: '코딩', exam: '시험', presentation: '발표', reading: '읽기', etc: '기타' };
const colors = ['#111', '#555', '#888', '#aaa', '#ccc', '#e5e5e5'];
const hours = (minutes) => `${Number((minutes / 60).toFixed(1))}시간`;
const statuses = { planned: '예정', done: '완료', missed: '완료 확인 필요' };
function durationText(minutes) {
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return h ? h + '시간' + (m ? ' ' + m + '분' : '') : m + '분';
}
function speedText(percent) {
  if (percent === 0) return '예상한 시간과 거의 비슷하게 걸렸어요.';
  return '예상보다 약 ' + Math.abs(percent) + '% ' + (percent > 0 ? '더 걸렸어요.' : '적게 걸렸어요.');
}
function shiftPeriod(from, mode, direction) {
  const date = new Date(from + 'T00:00:00Z');
  if (mode === 'month') date.setUTCMonth(date.getUTCMonth() + direction);
  else date.setUTCDate(date.getUTCDate() + direction * 7);
  return date.toISOString().slice(0, 10);
}
export default function AnalyticsPage({ onBack }) {
  const [mode, setMode] = useState('week');
  const [from, setFrom] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [day, setDay] = useState(null);
  const [patterns, setPatterns] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  useEffect(() => {
    let active = true; setLoading(true); setError(''); setDay(null); setSelectedTaskId(null);
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
    <header className="analysis-heading"><button type="button" className="analysis-back" aria-label={patterns ? '분석 요약으로 돌아가기' : '마이로 돌아가기'} onClick={() => patterns ? setPatterns(false) : onBack()}><ChevronLeftIcon size={26} /></button><h1>{patterns ? '내 작업 패턴' : mode === 'week' ? '주간 분석' : '월간 분석'}</h1><div className="analysis-switch">{[['week', '주'], ['month', '월']].map(([id, label]) => <button type="button" aria-pressed={mode === id} key={id} onClick={() => { setMode(id); setFrom(null); }}>{label}</button>)}</div></header>
    <p className="analysis-demo">선택한 기간의 작업 기록 · 한국 시간</p>
    {data && <div className="analysis-period"><button type="button" aria-label="이전 기간" disabled={loading} onClick={() => setFrom(shiftPeriod(data.from, mode, -1))}><ChevronLeftIcon size={22} /></button><span>{data.from} — {data.to}</span><button type="button" aria-label="다음 기간" disabled={loading} onClick={() => setFrom(shiftPeriod(data.from, mode, 1))}><ChevronIcon size={22} /></button></div>}
    {loading ? <p role="status">분석 기록을 불러오는 중이에요…</p> : error ? <div role="alert"><p>분석을 불러오지 못했어요. {error}</p><button type="button" className="primary-button" onClick={() => setRetry(retry + 1)}>다시 시도</button></div> : data && <>
      {!patterns ? <>
        <div className="analysis-totals"><div><span>완료한 작업</span><strong>{data.completedTasks}개</strong></div><div><span>계획된 작업 시간</span><strong>{hours(data.scheduledMinutes)}</strong><small>일정에 배치된 시간</small></div></div>
        <section className="analysis-section"><h2>계획 시간 배분</h2>{data.scheduledMinutes ? <div className="analysis-ratio"><div className="analysis-donut" style={{ background: `conic-gradient(${gradient})` }} role="img" aria-label={categories.map(([type, minutes]) => `${labels[type]} ${minutes}분`).join(', ')}><div><strong>{Number((data.scheduledMinutes / 60).toFixed(1))}h</strong><span>계획 시간</span></div></div><ul className="analysis-legend">{categories.filter(([, minutes]) => minutes > 0).map(([type, minutes]) => <li key={type}><i style={{ background: colors[categories.findIndex(([id]) => id === type)] }} /><span>{labels[type]}</span><small>{hours(minutes)} · {Math.round(minutes / data.scheduledMinutes * 100)}%</small></li>)}</ul></div> : <p className="analysis-note">이 기간에 저장된 작업 배치가 없어요.</p>}<p className="analysis-note">일정에 배치된 작업 시간이며, 실제 소요 시간과는 다를 수 있어요.</p></section>
        <section className="analysis-section"><h2>요일별 작업 현황</h2><div className={`analysis-bars ${mode === 'month' ? 'is-month' : ''}`}>{data.daily.map((item) => <button type="button" className="analysis-bar-column analysis-day-button" key={item.date} aria-pressed={day === item.date} aria-label={`${item.date} 계획 ${item.minutes}분, 완료 작업 ${item.completedTasks}개, 완료 확인 필요 일정 ${item.missedBlocks}개`} onClick={() => setDay(item.date)}><span>{Number((item.minutes / 60).toFixed(1))}h</span><div className="analysis-bar-track"><i style={{ height: `${item.minutes / max * 100}%` }} /></div><small>{mode === 'week' ? ['일', '월', '화', '수', '목', '금', '토'][new Date(item.date + 'T00:00:00Z').getUTCDay()] : item.date.slice(8)}</small></button>)}</div><p className="analysis-note">요일을 누르면 계획·완료 현황을 확인할 수 있어요.</p>
          {selectedDay && <div className="analysis-day-detail"><h3>{selectedDay.date}</h3><p className="analysis-copy">계획 {hours(selectedDay.minutes)} · 완료 작업 {selectedDay.completedTasks}개 · 완료 확인 필요 일정 {selectedDay.missedBlocks}개</p>{selectedDay.blocks.length ? selectedDay.blocks.map((block, index) => <div className="analysis-record" key={block.id || index}><div><strong>{block.title}</strong><span>{block.start}–{block.end}</span><span>{statuses[block.status] || '상태 미확인'}</span></div></div>) : <p className="analysis-note">이 날짜에 저장된 배치가 없어요.</p>}</div>}
        </section>
        <section className="analysis-section"><h2>마감 작업 완료 현황</h2>{data.dueTasks.total > 0 && <p className="analysis-copy"><strong>전체 {data.dueTasks.total}개 중 {data.dueTasks.completed}개 완료</strong></p>}{data.dueTasks.items.length ? <ul className="analysis-due-list">{data.dueTasks.items.map((task) => <li key={task.id}><button type="button" className="analysis-due-button" onClick={() => setSelectedTaskId(task.id)} aria-label={task.title + ' 상세 보기'}><span className="analysis-task-status" aria-hidden="true">{task.status === 'done' ? '✓' : '×'}</span><div><strong>{task.title}</strong><small>마감 {new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric' }).format(new Date(task.deadline.length === 10 ? task.deadline + 'T12:00:00+09:00' : task.deadline))} · {task.status === 'done' ? '완료' : '미완료'}</small></div><span className="analysis-due-chevron" aria-hidden="true"><ChevronIcon size={20} /></span></button></li>)}</ul> : <p className="analysis-copy">이 기간에 마감인 작업이 없어요.</p>}</section>
        <section className="analysis-section"><button type="button" className="analysis-pattern-link" onClick={() => { setPatterns(true); document.querySelector('.app-main')?.scrollTo(0, 0); }}><span>내 작업 패턴 자세히 보기</span><span className="analysis-due-chevron" aria-hidden="true"><ChevronIcon size={20} /></span></button></section>
        <section className="analysis-section"><h2>제이의 분석 결과</h2>{data.suggestions.map((message) => <p className="analysis-copy" key={message}>{message}</p>)}</section>
      </> : <>
        <section className="analysis-section"><h2>작업 유형별 완료 현황</h2>{data.patterns.map((item) => <div className="analysis-speed-row" key={item.type}><strong>{labels[item.type]}</strong><span>완료 작업 {item.dueCompletedTasks}개 · 미완료 작업 {item.incompleteTasks}개</span></div>)}<p className="analysis-note">선택한 기간에 마감하는 작업을 완료 여부로 나눠 보여줘요.</p></section>
        <section className="analysis-section"><h2>내 작업 속도</h2>
          {data.patterns.filter(item => item.validActualRecords > 0 && Number.isFinite(item.differencePercent)).map(item => <div className="analysis-speed-summary" key={item.type}>
            <h3>{labels[item.type]}</h3>
            <p className="analysis-copy">{speedText(item.differencePercent)}</p>
            <p className="analysis-note">예상 {durationText(item.estimatedMinutes)} · 실제 {durationText(item.actualMinutes)} · 완료 기록 {item.validActualRecords}개</p>
          </div>)}
          {!data.patterns.some(item => item.validActualRecords > 0 && Number.isFinite(item.differencePercent)) && <p className="analysis-copy">이 기간에는 비교할 완료 기록이 없어요. 작업을 완료할 때 실제로 걸린 시간을 남겨 주세요.</p>}
          <p className="analysis-note">선택한 기간의 예상·실제 소요 시간 합계를 비교해요. 두 시간이 모두 입력된 완료 기록만 사용하며, 0분인 기록은 제외해요.</p>
        </section>
        <section className="analysis-section"><h2>배치 시간대별 완료 현황</h2>{data.bands.map((band) => <div className="analysis-speed-row" key={band.label}><strong>{band.label}</strong><span>{hours(band.minutes)} · 완료 일정 {band.done}/{band.total}</span></div>)}<p className="analysis-note">일정 시작 시각으로 구분해요. 오전 06–12시, 오후 12–18시, 그 외는 저녁·밤이에요.</p></section>
      </>}
    </>}
    {selectedTaskId && data && <AnalyticsTaskDetail taskId={selectedTaskId} from={data.from} to={data.to} onClose={() => setSelectedTaskId(null)} />}
  </div>;
}
