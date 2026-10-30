import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client.js';
import WeekTimetable from '../components/timetable/WeekTimetable.jsx';
import LessonEditor from '../components/timetable/LessonEditor.jsx';
import { lessonConflicts } from '../utils/timetableConflicts.js';
import { scheduleChanged } from '../hooks/useLiveSchedule.js';
import { selectTimetableEmployee } from '../utils/selectTimetableEmployee.js';

export default function FixedSchedulePage({ onBack, autoAnalyze = false, inlineImport = false }) {
  const [lessons, setLessons] = useState([]);
  const [visibleDays, setVisibleDays] = useState([]);
  const [otherBlocks, setOtherBlocks] = useState([]);
  const [image, setImage] = useState('');
  const [fileName, setFileName] = useState('');
  const [warnings, setWarnings] = useState([]);
  const [reviewReasons, setReviewReasons] = useState([]);
  const [busy, setBusy] = useState('loading');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [editor, setEditor] = useState(null);
  const mounted = useRef(true);
  const fileInput = useRef(null);
  const initialLoad = useRef(null);
  useEffect(() => {
    mounted.current = true;
    initialLoad.current = api.getTimetable().then((data) => { if (mounted.current) { setLessons(data.lessons); setOtherBlocks(data.otherBlocks || []); setVisibleDays(data.visibleDays || []); setLoaded(true); } return true; }).catch(() => { if (mounted.current) setError('저장된 시간표를 불러오지 못했어요. 백엔드 서버를 확인하고 다시 열어 주세요.'); return false; }).finally(() => { if (mounted.current) setBusy((current) => current === 'loading' ? '' : current); });
    return () => { mounted.current = false; };
  }, []);
  function addLesson(day = 1, start = '09:00') {
    if (busy || lessons.length >= 100) return;
    const total = Math.min(23 * 60 + 59, Number(start.slice(0, 2)) * 60 + Number(start.slice(3)) + 60);
    const end = `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
    setEditor({ isNew: true, lesson: { id: crypto.randomUUID(), kind: 'event', title: '', location: '', dayOfWeek: [day], start, end } });
  }
  function applyLesson(lesson) {
    setLessons((items) => editor.isNew ? [...items, lesson] : items.map((item) => item.id === lesson.id ? lesson : item));
    setDirty(true); setNotice(''); setEditor(null);
  }
  async function chooseFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError(''); setNotice(''); setWarnings([]); setReviewReasons([]); setImage(''); setFileName('');
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) { setError('10MB 이하의 PNG, JPG, WebP 사진을 선택해 주세요.'); event.target.value = ''; return; }
    setBusy('reading');
    const reader = new FileReader();
    reader.onload = async () => {
      const ready = await initialLoad.current;
      if (!mounted.current) return;
      setImage(reader.result); setFileName(file.name);
      if (autoAnalyze && ready) await extract(reader.result);
      else setBusy('');
    };
    reader.onerror = () => { if (mounted.current) { setError('사진을 읽지 못했어요. 다시 선택해 주세요.'); setBusy(''); } };
    reader.readAsDataURL(file);
  }
  async function extract(photo = image) {
    setBusy('extract'); setError(''); setNotice('');
    try {
      const extracted = await api.extractTimetable(photo);
      if (!mounted.current) return;
      const data = selectTimetableEmployee(extracted);
      if (!data) return;
      setWarnings([...(data.reviewReasons ?? []), ...(data.warnings ?? []), ...(data.flexiblePlans ?? []).map((item) => `${item.title}: 유동 계획이므로 고정 시간표에서 제외했어요.`)]);
      setReviewReasons(data.reviewReasons ?? []);
      if (!data.lessons.length) { setError('일정을 찾지 못했어요. 요일과 시간축이 모두 보이는 사진을 올리거나 직접 입력해 주세요.'); return; }
      setLessons((items) => [...items, ...data.lessons]); setVisibleDays((days) => [...new Set([...days, ...(data.visibleDays || [])])]); setDirty(true);
      setNotice(`${data.lessons.length}개의 일정을 읽었어요. 원본 사진과 비교하고 저장해 주세요.`);
    } catch (err) { if (mounted.current) setError(err.message); }
    finally { if (mounted.current) setBusy(''); }
  }
  const invalid = lessons.some((item) => !item.title.trim() || !item.dayOfWeek.length || !item.start || !item.end || item.start >= item.end);
  const incompleteCount = lessons.filter((item) => !item.dayOfWeek.length || !item.start || !item.end || item.start >= item.end).length;
  const conflictLessons = lessons.filter((lesson) => lessonConflicts(lesson, [...lessons, ...otherBlocks]).length > 0);
  const conflicts = conflictLessons.length > 0;
  async function clearAll() {
    if (busy || !window.confirm('수업·근무·개인 일정 등 고정 시간표를 모두 삭제할까요? 저장 전 목록도 비웁니다. 과제·작업과 루틴은 유지됩니다.')) return;
    setBusy('clearing'); setError(''); setNotice('');
    try {
      await api.clearTimetable();
      if (mounted.current) {
        setLessons([]); setOtherBlocks((items) => items.filter((item) => item.kind === 'routine')); setVisibleDays([]);
        setImage(''); setFileName(''); setWarnings([]); setReviewReasons([]); setEditor(null); setDirty(false);
        setNotice('고정 시간표를 모두 지웠어요. 새 시간표를 추가할 수 있어요.');
      }
      scheduleChanged();
    } catch (err) { if (mounted.current) setError(err.message); }
    finally { if (mounted.current) setBusy(''); }
  }
  async function save(event) {
    event.preventDefault(); if (conflicts || invalid) { setError('겹치는 일정과 미확인 시간을 먼저 수정해 주세요.'); return; }
    if (reviewReasons.length && !window.confirm(`${reviewReasons.join('\n')}\n\n대상과 요일·시간을 확인했으며, 현재 목록을 매주 반복되는 고정 일정으로 저장할까요?`)) return;
    setBusy('saving'); setError(''); setNotice('');
    try {
      const data = await api.saveTimetable(lessons, visibleDays);
      scheduleChanged();
      if (mounted.current) {
        setLessons(data.lessons); setDirty(false); setImage(''); setFileName(''); setWarnings([]); setEditor(null);
        onBack?.();
      }
    }
    catch (err) { if (mounted.current) setError(err.message); }
    finally { if (mounted.current) setBusy(''); }
  }
  return <div className="fixed-page">
    {!inlineImport && <header className="analysis-heading"><button type="button" className="analysis-back" aria-label="마이로 돌아가기" onClick={onBack}>‹</button><h1>고정 일정</h1></header>}
    <input ref={fileInput} id={inlineImport ? 'schedule-timetable-photo' : 'timetable-photo'} type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseFile} hidden disabled={!!busy && busy !== 'loading'} />

    {busy === 'loading' && <p role="status">저장된 시간표를 불러오는 중이에요…</p>}
    {busy === 'reading' && <p role="status">사진을 불러오는 중이에요…</p>}
    {busy === 'extract' && <p role="status">시간표를 분석하는 중이에요…</p>}
    {error && <p className="fixed-error" role="alert">{error}</p>}
    {notice && <p className="fixed-notice" role="status">{notice}</p>}
    {warnings.length > 0 && <div className="fixed-warnings"><strong>확인이 필요해요</strong><ul>{warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul></div>}
    {loaded && <form onSubmit={save}>
      <div hidden={inlineImport && !image}>
      <div className="fixed-section-heading"><h2>나의 고정 시간표</h2><span>{lessons.length}개 일정{dirty ? ' · 저장 전' : ''}</span></div>
      {incompleteCount > 0 && <p className="fixed-warnings" role="status">{incompleteCount}개 일정의 요일·시간 확인이 필요해요. 일정은 아래 목록에 남겨두었어요. 빈칸을 채우면 미리보기와 저장에 반영돼요.</p>}
      <WeekTimetable visibleDays={visibleDays} lessons={lessons} onSelect={(lesson) => setEditor({ isNew: false, lesson })} onAdd={addLesson} disabled={!!busy} />
      <p className="analysis-note">일정을 누르면 수정·삭제할 수 있어요. 빈 시간 칸을 누르면 일정을 추가할 수 있어요.</p>
            {conflicts && <div className="fixed-error" role="alert">시간이 겹치는 일정은 저장할 수 없어요. 일정을 눌러 수정해 주세요.{conflictLessons.map((lesson) => <div key={lesson.id}><button type="button" className="analysis-text-button" disabled={!!busy} onClick={() => setEditor({isNew:false,lesson})}>{lesson.title} ({lesson.start}–{lesson.end}) 수정 ›</button><small>{lessonConflicts(lesson,[...lessons,...otherBlocks]).map((item)=>`${item.title} ${item.start}–${item.end}`).join(', ')}와 겹쳐요.</small></div>)}</div>}
      {incompleteCount > 0 && <div className="fixed-pending-list"><h3>확인이 필요한 일정</h3>{lessons.filter((item) => !item.dayOfWeek.length || !item.start || !item.end || item.start >= item.end).map((lesson) => <button type="button" key={lesson.id} disabled={!!busy} onClick={() => setEditor({ isNew: false, lesson })}><span>{lesson.title}</span><small>요일·시간 확인 ›</small></button>)}</div>}
      <button type="button" className="fixed-add" disabled={!!busy || lessons.length >= 100} onClick={() => addLesson()}>+ 일정 추가</button>
      <button type="button" className="fixed-delete" disabled={!!busy || (!lessons.length && !otherBlocks.some((item) => item.kind !== 'routine'))} onClick={clearAll}>{busy === 'clearing' ? '삭제 중…' : '고정 시간표 전체 지우기'}</button>
      </div>
      <section className={`fixed-upload fixed-upload-compact${image ? ' has-image' : ''}`} aria-label="사진으로 시간표 추가">
        <div className="fixed-upload-content">
          {image ? <div className="fixed-image-preview"><img src={image} alt="업로드한 원본 시간표" /><small title={fileName}>{fileName}</small></div> : <><span className="fixed-upload-symbol" aria-hidden="true">▦</span><h2>사진으로 시간표 추가</h2><p>업무·근무·수업 등 요일과 시간이 보이는 시간표를 선택해 주세요.</p></>}
        </div>
        <div className="fixed-upload-controls">
          <label htmlFor={inlineImport ? 'schedule-timetable-photo' : 'timetable-photo'} className={`fixed-upload-label${busy || !loaded ? ' is-disabled' : ''}`}>{image ? '사진 변경' : '시간표 사진 선택'}</label>
          {image && <button type="button" className="primary-button" disabled={!!busy || !loaded} onClick={() => extract()}>{busy === 'extract' ? '분석 중…' : '시간표 만들기'}</button>}
        </div>
        <p className="fixed-upload-caption">{image ? '분석 시 OpenAI로 전송하며 사진은 서버에 저장하지 않아요. 새 일정은 기존 시간표에 추가돼요.' : 'PNG · JPG · WebP / 최대 10MB'}</p>
      </section>
      <div hidden={inlineImport && !image}>
      <p className="analysis-note">사진에서 읽은 일정은 기존 시간표에 추가돼요. 겹치는 일정은 수정 후 저장해 주세요. 새로 시작하려면 ‘고정 시간표 전체 지우기’를 눌러 주세요.</p>
      <button type="submit" className="primary-button fixed-save" disabled={!!busy || invalid || conflicts || !dirty}>{busy === 'saving' ? '저장 중…' : '고정 시간표 저장하기'}</button>
      </div>
    </form>}

    {editor && <LessonEditor otherLessons={[...lessons, ...otherBlocks]} lesson={editor.lesson} isNew={editor.isNew} onApply={applyLesson} onClose={() => setEditor(null)} onDelete={(id) => { setLessons((items) => items.filter((item) => item.id !== id)); setDirty(true); setNotice(''); setEditor(null); }} />}
  </div>;
}
