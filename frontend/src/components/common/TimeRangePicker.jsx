import { useEffect, useId, useRef, useState } from 'react';

const ROW_HEIGHT = 36;
const two = value => String(value).padStart(2, '0');

// 가운데 선택 줄의 높이와 스크롤 계산을 같은 값으로 유지한다.
function TimeColumn({ values, value, onChange, label, disabled, selectionRef }) {
  const list = useRef(null);
  const timer = useRef(null);
  const latest = useRef({ values, value, onChange, disabled });
  latest.current = { values, value, onChange, disabled };
  const selected = Math.max(0, values.indexOf(value));
  if (selectionRef) selectionRef.current = () => {
    const state = latest.current;
    const index = Math.max(0, Math.min(state.values.length - 1, Math.round((list.current?.scrollTop ?? selected * ROW_HEIGHT) / ROW_HEIGHT)));
    return state.values[index];
  };
  useEffect(() => {
    clearTimeout(timer.current);
    if (list.current) list.current.scrollTop = selected * ROW_HEIGHT;
  }, [selected, values.length]);
  useEffect(() => () => clearTimeout(timer.current), []);
  function pick(index) {
    const state = latest.current;
    if (state.disabled) return;
    clearTimeout(timer.current);
    const next = Math.max(0, Math.min(state.values.length - 1, index));
    state.onChange(state.values[next]);
    if (list.current) list.current.scrollTop = next * ROW_HEIGHT;
  }
  return <div className="pattern-time-wheel">
    <ul ref={list} role="listbox" aria-label={label} aria-disabled={disabled} tabIndex={disabled ? -1 : 0}
      onKeyDown={event => {
        const moves = { ArrowUp: -1, ArrowDown: 1, PageUp: -5, PageDown: 5 };
        if (event.key in moves) { event.preventDefault(); pick(selected + moves[event.key]); }
        else if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); pick(event.key === 'Home' ? 0 : values.length - 1); }
      }}
      onScroll={() => {
        clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          const state = latest.current;
          if (state.disabled || !list.current) return;
          const index = Math.max(0, Math.min(state.values.length - 1, Math.round(list.current.scrollTop / ROW_HEIGHT)));
          if (state.values[index] !== state.value) state.onChange(state.values[index]);
        }, 90);
      }}>
      {values.map(item => <li key={item} role="option" aria-selected={item === value} className={item === value ? 'is-selected' : ''} onClick={() => pick(values.indexOf(item))}>{two(item)}</li>)}
    </ul>
  </div>;
}

function TimeWheels({ value, onChange, label, allowMidnight, disabled, confirmRef }) {
  const hourSelection = useRef(null), minuteSelection = useRef(null);
  const [hour, minute] = value.split(':').map(Number);
  confirmRef.current = () => {
    const nextHour = hourSelection.current?.() ?? hour;
    const nextMinute = nextHour === 24 ? 0 : minuteSelection.current?.() ?? minute;
    onChange(two(nextHour) + ':' + two(nextMinute));
  };
  const hours = Array.from({ length: allowMidnight ? 25 : 24 }, (_, index) => index);
  // 5분 단위 밖의 기존 저장값도 임의로 반올림하지 않는다.
  const minutes = hour === 24 ? [0] : [...new Set([...Array.from({ length: 12 }, (_, index) => index * 5), minute])].sort((a, b) => a - b);
  return <div className="pattern-time-wheels">
    <TimeColumn selectionRef={hourSelection} values={hours} value={hour} label={label + ' 시'} disabled={disabled} onChange={next => onChange(two(next) + ':' + two(next === 24 ? 0 : minute))} />
    <TimeColumn selectionRef={minuteSelection} values={minutes} value={minute} label={label + ' 분'} disabled={disabled} onChange={next => onChange(two(hour) + ':' + two(next))} />
  </div>;
}

export default function TimeRangePicker({ start, end, onStartChange, onEndChange, startLabel = '시작', endLabel = '종료', label, allowEndOfDay = false, overnight = false, disabled = false }) {
  const [active, setActive] = useState('start');
  const confirmSelection = useRef(null);
  const id = useId();
  const rows = [
    { key: 'start', title: startLabel, value: start, change: onStartChange },
    { key: 'end', title: endLabel, value: end, change: onEndChange },
  ];
  return <div className="pattern-time-card" role="group" aria-label={label}>
    {rows.map(row => <div className="pattern-time-entry" key={row.key}>
      <div className="pattern-time-heading"><span>{row.title}</span><div className="pattern-time-value">
        {overnight && row.key === 'end' && start > end && <small>다음 날</small>}
        <button type="button" className="pattern-time-pill" disabled={disabled} aria-label={label + ' ' + row.title + ' ' + row.value} aria-expanded={active === row.key} aria-controls={id + row.key} onClick={() => setActive(active === row.key ? null : row.key)}>{row.value}</button>
      </div></div>
      {active === row.key && <div className="pattern-time-editor" id={id + row.key}>
        <TimeWheels confirmRef={confirmSelection} value={row.value} onChange={row.change} label={label + ' ' + row.title} allowMidnight={allowEndOfDay && row.key === 'end'} disabled={disabled} />
        <div className="pattern-time-actions"><button type="button" disabled={disabled} aria-label={label + ' ' + row.title + ' 시간 설정'} onClick={() => { confirmSelection.current?.(); setActive(null); }}>설정</button></div>
      </div>}
    </div>)}
  </div>;
}

export function RestDurationPicker({ value, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const durationSelection = useRef(null);
  const id = useId();
  const values = [...new Set([...Array.from({ length: 25 }, (_, index) => index * 5), value])].sort((a, b) => a - b);
  return <div className="pattern-time-card">
    <div className="pattern-time-heading"><span>휴식 길이</span><button type="button" className="pattern-time-pill" disabled={disabled} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>{value}분</button></div>
    {open && <div className="pattern-time-editor pattern-duration-editor" id={id}><div className="pattern-time-wheels"><TimeColumn selectionRef={durationSelection} values={values} value={value} onChange={onChange} label="작업 사이 휴식 분" disabled={disabled} /><span className="pattern-duration-unit" aria-hidden="true">분</span></div><div className="pattern-time-actions"><button type="button" disabled={disabled} aria-label="휴식 길이 설정" onClick={() => { onChange(durationSelection.current?.() ?? value); setOpen(false); }}>설정</button></div></div>}
  </div>;
}

// 길이(분)를 시간·분 휠로 고른다. 분은 5분 단위이고, 저장된 값이 5분 단위가 아니어도 그대로 보여 준다.
export function DurationPicker({ label, value, onChange, maxHours = 24, disabled }) {
  const [open, setOpen] = useState(false);
  const hourSelection = useRef(null), minuteSelection = useRef(null);
  const id = useId();
  const hour = Math.floor(value / 60), minute = value % 60;
  const hours = Array.from({ length: maxHours + 1 }, (_, index) => index);
  const minutes = hour === maxHours ? [0] : [...new Set([...Array.from({ length: 12 }, (_, index) => index * 5), minute])].sort((a, b) => a - b);
  const text = [hour ? `${hour}시간` : '', minute || !hour ? `${minute}분` : ''].filter(Boolean).join(' ');
  return <div className="pattern-time-card">
    <div className="pattern-time-heading"><span>{label}</span><button type="button" className="pattern-time-pill" disabled={disabled} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>{text}</button></div>
    {open && <div className="pattern-time-editor" id={id}>
      <div className="pattern-time-wheels">
        <div className="pattern-duration-col"><TimeColumn selectionRef={hourSelection} values={hours} value={hour} label={label + ' 시간'} disabled={disabled} onChange={next => onChange(next * 60 + (next === maxHours ? 0 : minute))} /><span className="pattern-duration-label" aria-hidden="true">시간</span></div>
        <div className="pattern-duration-col"><TimeColumn selectionRef={minuteSelection} values={minutes} value={minute} label={label + ' 분'} disabled={disabled} onChange={next => onChange(hour * 60 + next)} /><span className="pattern-duration-label" aria-hidden="true">분</span></div>
      </div>
      <div className="pattern-time-actions"><button type="button" disabled={disabled} aria-label={label + ' 설정'} onClick={() => {
        const nextHour = hourSelection.current?.() ?? hour;
        onChange(nextHour * 60 + (nextHour === maxHours ? 0 : minuteSelection.current?.() ?? minute));
        setOpen(false);
      }}>설정</button></div>
    </div>}
  </div>;
}
