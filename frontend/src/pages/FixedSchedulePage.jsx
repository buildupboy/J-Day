import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client.js';
import WeekTimetable, { WEEKDAYS } from '../components/timetable/WeekTimetable.jsx';

export default function FixedSchedulePage({ onBack }) {
  const [lessons, setLessons] = useState([]);
  const [image, setImage] = useState('');
  const [fileName, setFileName] = useState('');
  const [warnings, setWarnings] = useState([]);
  const [busy, setBusy] = useState('loading');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const mounted = useRef(true);
  const fileInput = useRef(null);
  useEffect(() => {
    mounted.current = true;
    api.getTimetable().then((data) => { if (mounted.current) { setLessons(data.lessons); setLoaded(true); } }).catch(() => { if (mounted.current) setError('저장된 시간표를 불러오지 못했어요. 백엔드 서버를 확인하고 다시 열어 주세요.'); }).finally(() => { if (mounted.current) setBusy(''); });
    return () => { mounted.current = false; };
  }, []);
  function update(id, patch) { setLessons((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item)); setDirty(true); setNotice(''); }
  async function chooseFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(''); setNotice(''); setWarnings([]); setImage(''); setFileName('');
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) { setError('5MB 이하의 PNG, JPG, WebP 사진을 선택해 주세요.'); event.target.value = ''; return; }
    setBusy('reading');
    const reader = new FileReader();
    reader.onload = () => { if (mounted.current) { setImage(reader.result); setFileName(file.name); setBusy(''); } };
    reader.onerror = () => { if (mounted.current) { setError('사진을 읽지 못했어요. 다시 선택해 주세요.'); setBusy(''); } };
    reader.readAsDataURL(file);
  }
  async function extract() {
    setBusy('extract'); setError(''); setNotice('');
    try {
      const data = await api.extractTimetable(image);
      if (!mounted.current) return;
      setWarnings(data.warnings);
      if (!data.lessons.length) { setError('수업을 찾지 못했어요. 요일과 시간축이 모두 보이는 사진을 올리거나 직접 입력해 주세요.'); return; }
      setLessons(data.lessons); setDirty(true);
      setNotice(`${data.lessons.length}개의 수업을 읽었어요. 원본 사진과 비교하고 저장해 주세요.`);
    } catch (err) { if (mounted.current) setError(err.message); }
    finally { if (mounted.current) setBusy(''); }
  }
  const invalid = lessons.some((item) => !item.title.trim() || !item.dayOfWeek.length || !item.start || !item.end || item.start >= item.end);
  const conflicts = lessons.some((a, i) => lessons.slice(i + 1).some((b) => a.dayOfWeek.some((day) => b.dayOfWeek.includes(day)) && a.start < b.end && b.start < a.end));
  async function save(event) {
    event.preventDefault(); setBusy('saving'); setError(''); setNotice('');
    try { const data = await api.saveTimetable(lessons); if (mounted.current) { setLessons(data.lessons); setDirty(false); setNotice('매주 반복되는 고정 시간표를 저장했어요. 캘린더에서도 확인할 수 있어요.'); } }
    catch (err) { if (mounted.current) setError(err.message); }
    finally { if (mounted.current) setBusy(''); }
  }
  return <div className="fixed-page">
    <header className="analysis-heading"><button type="button" className="analysis-back" aria-label="마이로 돌아가기" onClick={onBack}>‹</button><h1>고정 일정</h1></header>
    <section className="fixed-upload"><span className="fixed-upload-symbol" aria-hidden="true">▦</span><h2>에타 시간표를 그대로 가져오기</h2><p>요일과 시간 눈금이 모두 보이는<br />시간표 캡처를 선택해 주세요.</p><input ref={fileInput} id="timetable-photo" type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseFile} disabled={!!busy || !loaded} /><label htmlFor="timetable-photo" className={`fixed-upload-label${busy || !loaded ? ' is-disabled' : ''}`}>시간표 사진 선택</label><small>PNG · JPG · WebP / 최대 5MB</small></section>
    {image && <section className="fixed-image-preview"><img src={image} alt="업로드한 원본 시간표" /><small>{fileName}</small><p className="analysis-note">분석하기를 누르면 사진이 OpenAI로 전송돼요. 사진 원본은 앱 서버에 저장하지 않아요.</p><p className="analysis-note">분석 결과가 아래 수업 목록을 대체해요. 저장 전까지 기존 시간표는 유지돼요.</p><button type="button" className="primary-button" disabled={!!busy || !loaded} onClick={extract}>{busy === 'extract' ? '시간표를 읽고 있어요…' : '사진에서 시간표 만들기'}</button></section>}
    {busy === 'loading' && <p role="status">저장된 시간표를 불러오는 중이에요…</p>}
    {busy === 'reading' && <p role="status">사진을 불러오는 중이에요…</p>}
    {error && <p className="fixed-error" role="alert">{error}</p>}
    {notice && <p className="fixed-notice" role="status">{notice}</p>}
    {warnings.length > 0 && <div className="fixed-warnings"><strong>확인이 필요해요</strong><ul>{warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul></div>}
    {loaded && <form onSubmit={save}>
      <div className="fixed-section-heading"><h2>나의 고정 시간표</h2><span>{lessons.length}개 수업{dirty ? ' · 저장 전' : ''}</span></div>
      {lessons.length ? <WeekTimetable lessons={lessons} /> : <p className="analysis-note">사진으로 가져오거나 수업을 직접 추가해 보세요.</p>}
      <p className="analysis-note">매주 반복되는 수업이에요. 인식된 요일·시간·강의실을 확인해 주세요.</p>
      {conflicts && <p className="fixed-error">같은 요일에 시간이 겹치는 수업이 있어요. 저장 전에 확인해 주세요.</p>}
      <div className="fixed-lesson-list">{lessons.map((lesson, index) => <fieldset className="fixed-lesson" key={lesson.id} disabled={!!busy}><legend>수업 {index + 1}</legend><label>수업 이름<input value={lesson.title} required maxLength={100} onChange={(event) => update(lesson.id, { title: event.target.value })} /></label><label>강의실<input value={lesson.location || ''} maxLength={150} placeholder="예: 공학관 205" onChange={(event) => update(lesson.id, { location: event.target.value })} /></label><div className="fixed-days" role="group" aria-label={`수업 ${index + 1} 반복 요일`}>{[1, 2, 3, 4, 5, 6, 0].map((day) => <button type="button" key={day} aria-pressed={lesson.dayOfWeek.includes(day)} onClick={() => update(lesson.id, { dayOfWeek: lesson.dayOfWeek.includes(day) ? lesson.dayOfWeek.filter((d) => d !== day) : [...lesson.dayOfWeek, day] })}>{WEEKDAYS[day]}</button>)}</div><div className="fixed-times"><label>시작<input type="time" value={lesson.start} required onChange={(event) => update(lesson.id, { start: event.target.value })} /></label><label>종료<input type="time" value={lesson.end} required min={lesson.start} onChange={(event) => update(lesson.id, { end: event.target.value })} /></label></div><button type="button" className="fixed-delete" onClick={() => { setLessons((items) => items.filter((item) => item.id !== lesson.id)); setDirty(true); }}>수업 삭제</button></fieldset>)}</div>
      <button type="button" className="fixed-add" disabled={!!busy || lessons.length >= 100} onClick={() => { setLessons((items) => [...items, { id: crypto.randomUUID(), title: '', location: '', dayOfWeek: [1], start: '09:00', end: '10:00' }]); setDirty(true); }}>+ 수업 직접 추가</button>
      <p className="analysis-note">저장하면 기존 수업 시간표를 이 목록으로 교체해요. 알바·루틴 일정은 유지돼요.</p>
      <button type="submit" className="primary-button fixed-save" disabled={!!busy || invalid || !dirty}>{busy === 'saving' ? '저장 중…' : '고정 시간표 저장하기'}</button>
    </form>}
  </div>;
}
