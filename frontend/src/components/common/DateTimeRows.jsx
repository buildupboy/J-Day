import { useMemo, useRef, useState } from 'react';
import WheelPicker from '../tasks/WheelPicker.jsx';
import { ChevronIcon, ChevronLeftIcon } from './Icons.jsx';
import { toIsoDate } from '../../utils/parseTaskText.js';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));
const YEARS_BEFORE = 1;
const YEARS_AFTER = 5;

const pad = (n) => String(n).padStart(2, '0');
const toItems = (values, suffix = '') => values.map((v) => ({ value: v, label: `${Number(v)}${suffix}` }));
const monthOf = (iso) => ({ year: Number(iso.slice(0, 4)), month: Number(iso.slice(5, 7)) - 1 });

/**
 * iOS 캘린더처럼 "라벨 · 날짜 칩 · 시각 칩" 줄을 쌓고, 칩을 누르면 바로 아래에 달력이나 시각 휠을 펼친다.
 * 한 번에 하나만 펼친다. rows: [{ id, label, date('YYYY-MM-DD', 없으면 시각만), time('HH:mm'), onDateChange, onTimeChange, disabled }]
 * minDate: 이 날짜보다 이른 날은 고를 수 없다. extraMinutes: 분 휠에 더할 값(예: 마감 '59')
 */
export default function DateTimeRows({ rows, minDate, extraMinutes = [] }) {
  const [open, setOpen] = useState(null); // { id, part: 'date' | 'time' }

  const toggle = (id, part) => setOpen((o) => (o && o.id === id && o.part === part ? null : { id, part }));

  return (
    <div className="dt-card">
      {rows.map((row) => {
        const openPart = open?.id === row.id && !row.disabled ? open.part : null;
        return (
          <div key={row.id} className={`dt-row-wrap ${row.disabled ? 'is-off' : ''}`}>
            <div className="dt-row">
              <span className="dt-label">{row.label}</span>
              <div className="dt-chips">
                {row.date !== undefined && (
                  <button
                    type="button"
                    className={`dt-chip ${openPart === 'date' ? 'is-on' : ''}`}
                    aria-expanded={openPart === 'date'}
                    aria-label={`${row.label} 날짜`}
                    disabled={row.disabled}
                    onClick={() => toggle(row.id, 'date')}
                  >
                    {row.date.replaceAll('-', '. ')}.
                  </button>
                )}
                <button
                  type="button"
                  className={`dt-chip ${openPart === 'time' ? 'is-on' : ''}`}
                  aria-expanded={openPart === 'time'}
                  aria-label={`${row.label} 시각`}
                  disabled={row.disabled}
                  onClick={() => toggle(row.id, 'time')}
                >
                  {row.time}
                </button>
              </div>
            </div>
            {openPart === 'date' && (
              <CalendarPanel
                value={row.date}
                minDate={minDate}
                onPick={(iso) => {
                  row.onDateChange(iso);
                  setOpen(null);
                }}
              />
            )}
            {openPart === 'time' && (
              <TimePanel value={row.time} onChange={row.onTimeChange} extraMinutes={extraMinutes} />
            )}
          </div>
        );
      })}
    </div>
  );
}

const DURATION_HOURS = Array.from({ length: 25 }, (_, h) => String(h));
const DURATION_MINUTES = Array.from({ length: 60 }, (_, i) => String(i)); // 1분 단위

/** "1시간 30분" 형식. 0이면 빈 문자열 */
export const durationText = (total) => {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return [h && `${h}시간`, m && `${m}분`].filter(Boolean).join(' ');
};

/** 시간·분 스크롤 휠(1분 단위). value·onChange는 총 분 */
export function DurationWheels({ value, onChange }) {
  const h = Math.floor(value / 60);
  const m = value % 60;
  const latest = useRef({ h, m });
  latest.current = { h, m };
  const set = (next) => {
    latest.current = next;
    onChange(next.h * 60 + next.m);
  };
  return (
    <div className="dt-wheels">
      <WheelPicker
        items={DURATION_HOURS.map((v) => ({ value: v, label: `${v}시간` }))}
        value={String(h)}
        onChange={(v) => set({ ...latest.current, h: Number(v) })}
        label="시간"
      />
      <WheelPicker
        items={DURATION_MINUTES.map((v) => ({ value: v, label: `${v}분` }))}
        value={String(m)}
        onChange={(v) => set({ ...latest.current, m: Number(v) })}
        label="분"
      />
    </div>
  );
}

/** 예상 소요 시간 한 줄: 칩에 "2시간 30분"을 보여 주고, 누르면 시간·분 휠을 펼친다. hours·minutes는 문자열 숫자 */
export function DurationRow({ label = '예상 시간', hours, minutes, onChange }) {
  const [open, setOpen] = useState(false);
  const total = (Number(hours) || 0) * 60 + (Number(minutes) || 0);

  return (
    <div className="dt-card">
      <div className="dt-row">
        <span className="dt-label">{label}</span>
        <button
          type="button"
          className={`dt-chip ${open ? 'is-on' : ''} ${total ? '' : 'is-empty'}`}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {durationText(total) || '선택'}
        </button>
      </div>
      {open && (
        <div className="dt-panel">
          <DurationWheels value={total} onChange={(next) => onChange(String(Math.floor(next / 60)), String(next % 60))} />
        </div>
      )}
    </div>
  );
}

// 달력. 위의 "2026년 10월 ›"을 누르면 년·월 휠로 바뀐다
function CalendarPanel({ value, minDate, onPick }) {
  const todayIso = useMemo(() => toIsoDate(new Date()), []);
  const [view, setView] = useState(() => monthOf(value));
  const [pickingMonth, setPickingMonth] = useState(false);

  const cells = useMemo(() => {
    const lead = new Date(view.year, view.month, 1).getDay();
    const days = new Date(view.year, view.month + 1, 0).getDate();
    return [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  }, [view]);

  const min = minDate ? monthOf(minDate) : null;
  const atMin = min && view.year === min.year && view.month === min.month;
  const moveMonth = (delta) =>
    setView((v) => {
      const d = new Date(v.year, v.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });

  const baseYear = Number(todayIso.slice(0, 4));
  const yearValues = useMemo(() => {
    const first = min ? Math.max(min.year, baseYear - YEARS_BEFORE) : baseYear - YEARS_BEFORE;
    const years = Array.from({ length: baseYear + YEARS_AFTER - first + 1 }, (_, i) => String(first + i));
    return years.includes(String(view.year)) ? years : [...years, String(view.year)].sort();
  }, [baseYear, min, view.year]);
  const monthValues = useMemo(() => {
    const first = min && view.year === min.year ? min.month : 0;
    return Array.from({ length: 12 - first }, (_, i) => String(first + i));
  }, [min, view.year]);

  return (
    <div className="dt-panel">
      <div className="dt-cal-head">
        <button
          type="button"
          className={`dt-cal-title ${pickingMonth ? 'is-on' : ''}`}
          aria-expanded={pickingMonth}
          onClick={() => setPickingMonth((p) => !p)}
        >
          {view.year}년 {view.month + 1}월
          <span className="dt-cal-caret" aria-hidden="true">
            <ChevronIcon size={18} />
          </span>
        </button>
        {!pickingMonth && (
          <div className="dt-cal-nav">
            <button type="button" onClick={() => moveMonth(-1)} disabled={atMin} aria-label="이전 달">
              <ChevronLeftIcon size={22} />
            </button>
            <button type="button" onClick={() => moveMonth(1)} aria-label="다음 달">
              <ChevronIcon size={22} />
            </button>
          </div>
        )}
      </div>

      {pickingMonth ? (
        <div className="dt-wheels">
          <WheelPicker
            items={toItems(yearValues, '년')}
            value={String(view.year)}
            onChange={(y) =>
              setView((v) => {
                const year = Number(y);
                const month = min && year === min.year ? Math.max(v.month, min.month) : v.month;
                return { year, month };
              })
            }
            label="년"
          />
          <WheelPicker
            items={monthValues.map((m) => ({ value: m, label: `${Number(m) + 1}월` }))}
            value={String(view.month)}
            onChange={(m) => setView((v) => ({ ...v, month: Number(m) }))}
            onPick={() => setPickingMonth(false)}
            label="월"
          />
        </div>
      ) : (
        <div className="dt-cal-grid">
          {WEEKDAYS.map((w) => (
            <span key={w} className="dt-weekday">
              {w}
            </span>
          ))}
          {cells.map((d, i) => {
            if (d === null) return <span key={`blank-${i}`} />;
            const iso = `${view.year}-${pad(view.month + 1)}-${pad(d)}`;
            return (
              <button
                key={iso}
                type="button"
                className={`dt-day ${iso === value ? 'is-selected' : ''} ${iso === todayIso ? 'is-today' : ''}`}
                aria-pressed={iso === value}
                disabled={Boolean(minDate) && iso < minDate}
                onClick={() => onPick(iso)}
              >
                {d}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// 시·분 휠. 두 휠이 거의 동시에 멈춰도 서로 덮어쓰지 않게 최신 값을 ref로 든다
function TimePanel({ value, onChange, extraMinutes }) {
  const latest = useRef(value);
  latest.current = value;
  const [hour, minute] = value.split(':');
  const minutes = [...new Set([...MINUTES, ...extraMinutes, minute])].sort();

  const change = (part, v) => {
    const [h, m] = latest.current.split(':');
    const next = part === 'hour' ? `${v}:${m}` : `${h}:${v}`;
    latest.current = next;
    onChange(next);
  };

  return (
    <div className="dt-panel">
      <div className="dt-wheels">
        <WheelPicker items={toItems(HOURS).map((it) => ({ ...it, label: it.value }))} value={hour} onChange={(h) => change('hour', h)} label="시" />
        <WheelPicker items={toItems(minutes).map((it) => ({ ...it, label: it.value }))} value={minute} onChange={(m) => change('minute', m)} label="분" />
      </div>
    </div>
  );
}
