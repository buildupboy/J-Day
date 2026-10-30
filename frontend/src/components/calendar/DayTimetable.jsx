import { useLayoutEffect, useRef } from 'react';
import { toMinutes } from '../../utils/time.js';
import { isSameDay } from '../../utils/calendar.js';

const START_HOUR = 0;
const END_HOUR = 24;
const HOUR_HEIGHT = 48; // px (1시간 48px)

const top = (minutes) => ((minutes - START_HOUR * 60) / 60) * HOUR_HEIGHT + 8;
const SCROLL_MARGIN = 20; // 기준 시각 위로 남겨 둘 여백(px)

// 하루 타임테이블. 블록은 시작·종료 시각으로 절대 위치를 잡는다
export default function DayTimetable({ date, blocks = [], selectedId, onSelectBlock, statusOf }) {
  const scrollRef = useRef(null);
  const dayKey = date.toDateString();

  // 오늘이면 현재 시각, 다른 날이면 첫 일정 시작 시각부터 보이도록 스크롤
  useLayoutEffect(() => {
    const now = new Date();
    const first = blocks.length ? Math.min(...blocks.map((b) => toMinutes(b.start))) : 8 * 60;
    const target = isSameDay(date, now) ? now.getHours() * 60 + now.getMinutes() - 60 : first;
    scrollRef.current.scrollTop = Math.max(top(target) - SCROLL_MARGIN, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayKey, blocks.length]);

  const hours = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const showNow = isSameDay(date, now);

  return (
    <section className="timetable-scroll" ref={scrollRef} aria-label="하루 타임테이블">
      <div className="timetable" style={{ height: (END_HOUR - START_HOUR) * HOUR_HEIGHT + 16 }}>
        {hours.map((h) => (
          <div key={h} className="tt-hour" style={{ top: top(h * 60) }}>
            <span>{String(h % 24).padStart(2, '0')}</span>
          </div>
        ))}

        {blocks.map((b) => {
          const s = toMinutes(b.start);
          const e = toMinutes(b.end);
          const status = statusOf?.(b.id) ?? b.status;
          return (
            <button
              key={b.id}
              type="button"
              aria-pressed={b.id === selectedId}
              onClick={() => onSelectBlock?.(b)}
              className={`tt-block tt-${b.kind} ${e - s <= 60 ? 'is-compact' : ''} ${status ? `is-${status}` : ''} ${b.id === selectedId ? 'is-selected' : ''}`}
              style={{ top: top(s), height: Math.max(top(e) - top(s) - 2, 12) }}
            >
              <strong>{b.title}</strong>
              <span>
                {b.start}–{b.end}
                {status === 'done' && ' · 완료'}
                {status === 'missed' && ' · 미수행'}
                {status === 'postponed' && ' · 미룸'}
              </span>
            </button>
          );
        })}

        {showNow && (
          <div
            className="tt-now"
            role="img"
            aria-label={`현재 시각 ${now.getHours()}시 ${now.getMinutes()}분`}
            style={{ top: top(nowMinutes) }}
          />
        )}
      </div>
    </section>
  );
}
