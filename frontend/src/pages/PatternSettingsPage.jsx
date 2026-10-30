import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client.js';
const titles = { break: '휴게 시간', sleep: '수면 시간', available: '작업 가능 시간', style: '나의 작업 스타일', preferred: '희망 작업 시간대' };
const descriptions = { break: '작업 사이의 짧은 휴식과 매일 꼭 쉬고 싶은 시간대를 설정해 주세요.', sleep: '잠자는 시간을 설정하면 해당 시간에는 작업을 배치하지 않아요.', available: '하루 중 제이가 할 일을 배치할 수 있는 시간대를 설정해 주세요.', style: '제이가 나에게 맞는 방식으로 일정을 배치할 수 있도록 알려주세요.', preferred: '가장 편한 시간대를 선택해 주세요. 하루를 6시간씩 나누어 선택한 구간을 우선 사용해요.' };
function at(minutes) { return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`; }
function ChoiceGroup({ label, options, value, onChange, vertical = false }) {
  const values = options.some((option) => option.value === value) ? options : [...options, { value, label: `기존 설정 ${value}분` }];
  return <div className={`pattern-choices${vertical ? ' is-vertical' : ''}`} role="group" aria-label={label}>{values.map((option) => <button type="button" key={option.value} aria-pressed={value === option.value} onClick={() => onChange(option.value)}><strong>{option.label}</strong>{option.description && <small>{option.description}</small>}</button>)}</div>;
}
export function patternSummary(id, snapshot) {
  const settings = snapshot?.settings, fields = snapshot?.configuredFields || [];
  if (id === 'fixed') return snapshot ? `${snapshot.fixedCount}개 등록` : '';
  if (!settings) return ['break','sleep','available','style','preferred'].includes(id) ? '설정하기' : '';
  if (id === 'break') return fields.includes('breakMinutes') || settings.restPeriods?.length ? `${settings.breakMinutes}분${settings.restPeriods?.length ? ` · 지정 ${settings.restPeriods.length}개` : ''}` : '설정하기';
  if (id === 'preferred') return ({ morning: '아침 06~12시', daytime: '낮 12~18시', evening: '저녁 18~24시', dawn: '새벽 00~06시' })[settings.preferredPeriod] || '설정하기';
  if (id === 'sleep') return settings.sleep ? `${settings.sleep.start}~${settings.sleep.end}` : '설정하기';
  if (id === 'available') return fields.includes('dayStart') ? `${settings.dayStart}~${settings.dayEnd}` : '설정하기';
  if (id === 'style') return fields.includes('maxBlockMinutes') ? `${settings.maxBlockMinutes}분 · ${settings.distribution === 'balanced' ? '나누어 하기' : '미리 끝내기'}` : '설정하기';
  return '';
}
export default function PatternSettingsPage({ kind, onBack, onSaved }) {
  const root = useRef(null);
  const [snapshot, setSnapshot] = useState(null);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    if (root.current?.parentElement) root.current.parentElement.scrollTop = 0;
    setError(''); setDraft(null); setConfirmed(false);
    api.getUserSettings().then((data) => {
      if (!active) return;
      setSnapshot(data);
      setDraft({ ...data.settings, restPeriods: (data.settings.restPeriods || []).map((period) => ({ ...period })), sleep: data.settings.sleep ? { ...data.settings.sleep } : { start: '23:30', end: '07:00' } });
    }).catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [kind, retry]);
  function update(patch) { setDraft((value) => ({ ...value, ...patch })); setError(''); }
  async function save(event) {
    event.preventDefault();
    if (!confirmed) { setError('재배치 안내를 확인해 주세요.'); return; }
    const patch = kind === 'preferred' ? { preferredPeriod: draft.preferredPeriod } : kind === 'break' ? { breakMinutes: draft.breakMinutes, restPeriods: draft.restPeriods } : kind === 'sleep' ? { sleep: draft.sleep } : kind === 'available' ? { dayStart: draft.dayStart, dayEnd: draft.dayEnd } : { maxBlockMinutes: draft.maxBlockMinutes, maxDailyMinutes: draft.maxDailyMinutes, distribution: draft.distribution };
    setSaving(true); setError('');
    try { onSaved(await api.saveUserSettings(patch)); }
    catch (err) { setError(err.message); setSaving(false); }
  }
  const invalid = draft && (kind === 'preferred' ? !draft.preferredPeriod : kind === 'break' ? draft.restPeriods.some((period) => !period.start || !period.end || period.start === period.end) : kind === 'sleep' ? !draft.sleep.start || !draft.sleep.end || draft.sleep.start === draft.sleep.end : kind === 'available' ? !draft.dayStart || !draft.dayEnd || draft.dayStart >= draft.dayEnd : kind === 'style' ? draft.maxBlockMinutes < draft.minSlotMinutes : false);
  return <div className="pattern-page" ref={root}>
    <header className="pattern-header"><button type="button" disabled={saving} onClick={onBack} aria-label="마이로 돌아가기">‹</button><h1>{titles[kind]}</h1></header>
    <p className="pattern-description">{descriptions[kind]}</p>
    {!draft && !error && <p role="status">설정을 불러오는 중이에요…</p>}
    {error && <p className="pattern-error" role="alert">{error}</p>}
    {!draft && error && <button type="button" className="primary-button" onClick={() => setRetry(retry + 1)}>다시 시도</button>}
    {draft && <form onSubmit={save}><fieldset className="pattern-fields" disabled={saving}>
      {kind === 'preferred' && <section>
        <h2>언제 작업하는 게 편한가요?</h2>
        <div className="pattern-choices is-vertical" role="group" aria-label="희망 작업 시간대">{[{value:'morning',label:'아침',time:'06:00–12:00'},{value:'daytime',label:'낮',time:'12:00–18:00'},{value:'evening',label:'저녁',time:'18:00–24:00'},{value:'dawn',label:'새벽',time:'00:00–06:00'}].map((period)=><button type="button" key={period.value} aria-pressed={draft.preferredPeriod===period.value} onClick={()=>update({preferredPeriod:period.value})}><strong>{period.label}</strong><small>{period.time} · 6시간</small></button>)}</div>
        <p className="pattern-help">작업 가능 시간 안에서 선택한 시간대를 우선 사용해요. 수면·지정 휴식·고정 일정과 마감은 먼저 지키고, 시간이 부족하면 다른 시간대도 사용해요.</p>
      </section>}
      {kind === 'break' && <>
        <section><h2>작업 사이에 쉬는 시간</h2><ChoiceGroup label="휴식 시간" value={draft.breakMinutes} options={[5,10,15,20].map((value) => ({ value, label: `${value}분` }))} onChange={(breakMinutes) => update({ breakMinutes })} /></section>
        <section className="pattern-summary"><h2>이렇게 배치해요 <small>설명용 예시</small></h2><ul><li>14:00–15:00 알고리즘 공부</li><li>15:00–{at(900 + draft.breakMinutes)} 휴식</li><li>{at(900 + draft.breakMinutes)}–{at(960 + draft.breakMinutes)} 보고서 작성</li></ul><p>제이가 작업 블록 사이에 {draft.breakMinutes}분의 휴식을 확보해요. 고정 일정 자체에 휴식이 추가되지는 않아요.</p></section>
        <section className="pattern-rest-periods"><h2>매일 꼭 쉬고 싶은 시간</h2><p className="pattern-help">점심이나 저녁처럼 정해진 시간에는 새 작업을 배치하지 않아요.</p>
          {draft.restPeriods.map((period, index) => <div className="pattern-rest-card" key={index}><div className="pattern-time-row"><label>휴식 {index + 1} 시작<input type="time" required value={period.start} onChange={(event) => update({ restPeriods: draft.restPeriods.map((item, i) => i === index ? { ...item, start: event.target.value } : item) })} /></label><label>종료<input type="time" required value={period.end} onChange={(event) => update({ restPeriods: draft.restPeriods.map((item, i) => i === index ? { ...item, end: event.target.value } : item) })} /></label></div><p className="pattern-help">매일 {period.start} ~ {period.start > period.end ? '다음 날 ' : ''}{period.end} 휴식</p><button type="button" className="pattern-rest-remove" aria-label={`휴식 ${index + 1} 삭제`} onClick={() => update({ restPeriods: draft.restPeriods.filter((_, i) => i !== index) })}>삭제</button></div>)}
          <button type="button" className="pattern-rest-add" disabled={draft.restPeriods.length >= 8} onClick={() => update({ restPeriods: [...draft.restPeriods, { start: '12:00', end: '13:00' }] })}>+ 휴식 시간대 추가</button>
          {invalid && <p className="pattern-error">휴식 시작과 종료를 서로 다르게 입력해 주세요.</p>}
          <p className="pattern-help">수면이나 고정 일정과 겹치는 시간은 한 번만 제외해요. 모두 삭제하면 지정 휴식 없이 작업 사이 휴식만 적용해요.</p>
        </section>
      </>}
      {kind === 'sleep' && <>
        <div className="pattern-time-row"><label>취침 시간<input type="time" required value={draft.sleep.start} onChange={(event) => update({ sleep: { ...draft.sleep, start: event.target.value } })} /></label><label>기상 시간<input type="time" required value={draft.sleep.end} onChange={(event) => update({ sleep: { ...draft.sleep, end: event.target.value } })} /></label></div>
        <section className="pattern-summary"><h2>나의 수면 시간</h2><strong>{draft.sleep.start} ~ {draft.sleep.start > draft.sleep.end ? '다음 날 ' : ''}{draft.sleep.end}</strong><p>매일 해당 시간에는 새로운 작업을 배치하지 않아요. 작업 가능 시간과 겹치더라도 수면을 우선 보호해요.</p></section>
        {invalid && <p className="pattern-error">취침과 기상 시각은 다르게 선택해 주세요.</p>}
      </>}
      {kind === 'available' && <>
        <div className="pattern-time-row"><label>시작 시간<input type="time" required value={draft.dayStart} onChange={(event) => update({ dayStart: event.target.value })} /></label><label>종료 시간<input type="time" required value={draft.dayEnd === '24:00' ? '23:59' : draft.dayEnd} disabled={draft.dayEnd === '24:00'} onChange={(event) => update({ dayEnd: event.target.value })} /><span className="pattern-midnight"><input type="checkbox" checked={draft.dayEnd === '24:00'} onChange={(event) => update({ dayEnd: event.target.checked ? '24:00' : '22:00' })} />24:00 (자정)까지</span></label></div>
        <section className="pattern-summary"><h2>나의 작업 가능 시간</h2><strong>{draft.dayStart}–{draft.dayEnd} · 매일</strong><p>이 범위 안에서 고정 일정·수면·기존 작업·휴식·하루 한도와 예비 시간을 고려해 배치해요. 선택한 시간 전체를 작업으로 채우지는 않아요.</p></section>
        {invalid && <p className="pattern-error">종료 시간은 시작 시간보다 늦어야 해요.</p>}
      </>}
      {kind === 'style' && <>
        <section><h2>한 번에 얼마나 작업하고 싶나요?</h2><ChoiceGroup label="연속 작업 시간" options={[30,45,60,90].map((value) => ({ value, label: `${value}분` }))} value={draft.maxBlockMinutes} onChange={(maxBlockMinutes) => update({ maxBlockMinutes })} /><p className="pattern-help">긴 작업은 최대 {draft.maxBlockMinutes}분 단위로 나누어요. 현재 최소 작업 단위는 {draft.minSlotMinutes}분이에요.</p>{invalid && <p className="pattern-error">최소 작업 단위 이상의 시간을 선택해 주세요.</p>}</section>
        <section><h2>하루에 어느 정도 작업하고 싶나요?</h2><ChoiceGroup label="하루 작업량" vertical options={[{value:120,label:'가볍게',description:'2시간'},{value:240,label:'적당히',description:'4시간'},{value:360,label:'집중해서',description:'6시간'},{value:480,label:'많이',description:'8시간'}]} value={draft.maxDailyMinutes} onChange={(maxDailyMinutes) => update({ maxDailyMinutes })} /><p className="pattern-help">고정 일정은 작업량 한도에 포함하지 않아요. 기존 진행·완료 기록은 보존해요.</p></section>
        <section><h2>일정을 어떻게 배치할까요?</h2><ChoiceGroup label="배치 방식" vertical options={[{value:'early',label:'미리 끝내기',description:'가능한 빠른 빈 시간부터 배치해요.'},{value:'balanced',label:'나누어 하기',description:'마감 전까지 여러 날짜에 분산을 시도해요.'}]} value={draft.distribution} onChange={(distribution) => update({ distribution })} /><p className="pattern-help">나누어 하기는 마감과 빈 시간에 따라 균등하지 않을 수 있어요.</p></section>
        <section className="pattern-summary"><h2>나의 작업 스타일</h2><strong>{draft.maxBlockMinutes}분씩 · 하루 최대 {draft.maxDailyMinutes / 60}시간<br />{draft.distribution === 'early' ? '미리 끝내기' : '나누어 하기'}</strong></section>
      </>}
      <section className="pattern-confirm"><label><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>저장하면 새 조건으로 남은 작업을 배치하고 미래 예정 블록 {snapshot.futurePlannedBlocks}개를 재배치하는 데 동의해요.</span></label><p>진행 중인 블록 {snapshot.ongoingBlocks}개와 지난 기록·완료 기록은 유지해요. 마감 전 배치하지 못한 작업은 저장 후 안내해요.</p></section>
      <button type="submit" className="primary-button pattern-save" disabled={!confirmed || invalid || saving}>{saving ? '저장·재배치 중…' : '저장하기'}</button>
    </fieldset></form>}
  </div>;
}
