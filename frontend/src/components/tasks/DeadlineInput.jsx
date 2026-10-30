import { useEffect, useMemo, useRef, useState } from 'react';
import WheelPicker from './WheelPicker.jsx';
import { ChevronIcon } from '../common/Icons.jsx';
import { toIsoDate, formatDeadline } from '../../utils/parseTaskText.js';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'));
const MINUTES = [...Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0')), '59']; // 5분 단위 + 23:59 같은 하루 끝
const YEAR_SPAN = 5; // 올해부터 몇 년 뒤까지 고를 수 있는지

const pad = (n) => String(n).padStart(2, '0');
const toItems = (values, suffix = '') => values.map((v) => ({ value: v, label: `${v}${suffix}` }));

/** 'YYYY-MM-DD' → { year, month(0~11) } */
function monthOf(iso) {
  const [y, m] = iso.split('-').map(Number);
  return { year: y, month: m - 1 };
}

// 마감일·시각 선택: 날짜/시각 칩을 누르면 달력 또는 스크롤 휠이 펼쳐진다.
// 달력 위의 "2026년 10월"을 누르면 년·월을 스크롤로 고르는 휠로 바뀐다.
// date는 'YYYY-MM-DD'(아직 안 골랐으면 ''), time은 'HH:mm'
export default function DeadlineInput({ date, time, onDateChange, onTimeChange }) {
  const todayIso = useMemo(() => toIsoDate(new Date()), []);
  const today = useMemo(() => monthOf(todayIso), [todayIso]);

  const [panel, setPanel] = useState(null); // 'date' | 'time' | null
  const [view, setView] = useState(() => monthOf(date || todayIso)); // 달력에 보이는 달
  const [pickingMonth, setPickingMonth] = useState(false); // 년·월 휠을 보여 주는 중인지

  // 말로 채우는 등 바깥에서 날짜가 바뀌면 달력도 그 달로 옮긴다
  useEffect(() => {
    if (date) setView(monthOf(date));
  }, [date]);

  const [hour, minute] = time.split(':');

  // 시와 분 휠이 거의 동시에 멈춰도 서로의 값을 덮어쓰지 않도록 최신 시각을 ref로 들고 있는다
  const timeRef = useRef(time);
  timeRef.current = time;
  const changeTime = (part, value) => {
    const [h, m] = timeRef.current.split(':');
    const next = part === 'hour' ? `${value}:${m}` : `${h}:${value}`;
    timeRef.current = next;
    onTimeChange(next);
  };
  const minuteValues = MINUTES.includes(minute) ? MINUTES : [...MINUTES, minute].sort();

  const isCurrentMonth = view.year === today.year && view.month === today.month;
  const moveMonth = (delta) =>
    setView((v) => {
      const d = new Date(v.year, v.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });

  // 달력 칸: 앞쪽 빈 칸(요일 맞춤) + 1일~말일
  const cells = useMemo(() => {
    const lead = new Date(view.year, view.month, 1).getDay();
    const days = new Date(view.year, view.month + 1, 0).getDate();
    return [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  }, [view]);

  // 올해에는 이미 지난 달을 보여 주지 않는다
  const monthItems = useMemo(() => {
    const first = view.year === today.year ? today.month : 0;
    return Array.from({ length: 12 - first }, (_, i) => ({ value: String(first + i), label: `${first + i + 1}월` }));
  }, [view.year, today.year, today.month]);

  const yearValues = useMemo(() => {
    const years = Array.from({ length: YEAR_SPAN + 1 }, (_, i) => today.year + i);
    if (!years.includes(view.year)) years.push(view.year);
    return years.sort((a, b) => a - b).map(String);
  }, [today.year, view.year]);

  const toggle = (name) => {
    setPanel((p) => (p === name ? null : name));
    setPickingMonth(false);
  };

  return (
    <div className="deadline-input">
      <div className="deadline-pills">
        <button
          type="button"
          className={`pill ${panel === 'date' ? 'is-on' : ''} ${date ? '' : 'is-empty'}`}
          onClick={() => toggle('date')}
          aria-expanded={panel === 'date'}
        >
          {date ? date.replaceAll('-', '. ') + '.' : '날짜 선택'}
        </button>
        <button
          type="button"
          className={`pill ${panel === 'time' ? 'is-on' : ''}`}
          onClick={() => toggle('time')}
          aria-expanded={panel === 'time'}
        >
          {time}
        </button>
      </div>

      {panel === 'date' && (
        <div className="picker-panel">
          <div className="cal-head">
            <button type="button" className="cal-title" onClick={() => setPickingMonth((p) => !p)}>
              {view.year}년 {view.month + 1}월
              <span className={pickingMonth ? 'is-open' : ''}>
                <ChevronIcon size={16} />
              </span>
            </button>
            {!pickingMonth && (
              <div className="cal-nav">
                <button type="button" onClick={() => moveMonth(-1)} disabled={isCurrentMonth} aria-label="이전 달">
                  <ChevronIcon size={20} />
                </button>
                <button type="button" onClick={() => moveMonth(1)} aria-label="다음 달">
                  <ChevronIcon size={20} />
                </button>
              </div>
            )}
          </div>

          {pickingMonth ? (
            <div className="wheel-row two">
              <WheelPicker
                items={toItems(yearValues, '년')}
                value={String(view.year)}
                onChange={(y) =>
                  setView((v) => {
                    const year = Number(y);
                    // 올해로 돌아오면 이미 지난 달은 고를 수 없으니 이번 달로 맞춘다
                    return { year, month: year === today.year ? Math.max(v.month, today.month) : v.month };
                  })
                }
                label="년"
              />
              <WheelPicker
                items={monthItems}
                value={String(view.month)}
                onChange={(m) => setView((v) => ({ ...v, month: Number(m) }))}
                onPick={() => setPickingMonth(false)} // 월을 누르면 그 달의 달력으로 돌아간다
                label="월"
              />
            </div>
          ) : (
            <div className="cal-grid">
              {WEEKDAYS.map((w, i) => (
                <span key={w} className={`cal-weekday ${i === 0 ? 'is-sun' : ''}`}>
                  {w}
                </span>
              ))}
              {cells.map((d, i) => {
                if (d === null) return <span key={`blank-${i}`} />;
                const iso = `${view.year}-${pad(view.month + 1)}-${pad(d)}`;
                const classes = ['cal-day', iso === date ? 'is-selected' : '', iso === todayIso ? 'is-today' : ''].join(' ');
                return (
                  <button
                    key={iso}
                    type="button"
                    className={classes}
                    disabled={iso < todayIso}
                    onClick={() => {
                      onDateChange(iso);
                      setPanel('time'); // 날짜를 고르면 이어서 시각을 고르게 한다
                    }}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {panel === 'time' && (
        <div className="picker-panel">
          <div className="wheel-row two">
            <WheelPicker
              items={toItems(HOURS)}
              value={hour}
              onChange={(h) => changeTime('hour', h)}
              label="시"
            />
            <WheelPicker
              items={toItems(minuteValues)}
              value={minute}
              onChange={(m) => changeTime('minute', m)}
              label="분"
            />
          </div>
        </div>
      )}

      <p className="deadline-preview">
        {date ? `${formatDeadline(date)} ${time}까지` : '마감 날짜를 골라 주세요. 시각은 기본 23:59예요.'}
      </p>
    </div>
  );
}
