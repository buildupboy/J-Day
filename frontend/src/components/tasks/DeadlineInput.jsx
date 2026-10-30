import { useEffect, useState } from 'react';
import { toIsoDate, formatDeadline } from '../../utils/parseTaskText.js';

// 입력한 월·일로 날짜를 만든다. 올해 날짜가 이미 지났으면 내년으로 본다. 존재하지 않는 날짜면 null.
function buildDate(month, day) {
  const m = Number(month);
  const d = Number(day);
  if (!month || !day || !Number.isInteger(m) || !Number.isInteger(d)) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (const year of [today.getFullYear(), today.getFullYear() + 1]) {
    const date = new Date(year, m - 1, d);
    const valid = date.getMonth() === m - 1 && date.getDate() === d; // 2월 30일 같은 날짜 걸러내기
    if (valid && date >= today) return toIsoDate(date);
    if (!valid) return null;
  }
  return null;
}

// 마감일·시각을 직접 입력한다: [월] 월 [일] 일  [시] : [분]
// date는 'YYYY-MM-DD'(잘못된 입력이면 ''), time은 'HH:mm'
export default function DeadlineInput({ date, time, onDateChange, onTimeChange }) {
  const [month, setMonth] = useState('');
  const [day, setDay] = useState('');
  const [hour, setHour] = useState(time.slice(0, 2));
  const [minute, setMinute] = useState(time.slice(3, 5));

  // 말로 채우는 등 바깥에서 날짜가 바뀌면 입력칸에도 반영한다
  useEffect(() => {
    if (date && date !== buildDate(month, day)) {
      const d = new Date(`${date}T00:00:00`);
      setMonth(String(d.getMonth() + 1));
      setDay(String(d.getDate()));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const typedDate = Boolean(month || day);
  const dateInvalid = typedDate && !date;

  const changeDate = (nextMonth, nextDay) => {
    setMonth(nextMonth);
    setDay(nextDay);
    onDateChange(buildDate(nextMonth, nextDay) ?? '');
  };

  const changeTime = (nextHour, nextMinute) => {
    setHour(nextHour);
    setMinute(nextMinute);
    const h = Number(nextHour);
    const m = Number(nextMinute);
    if (nextHour !== '' && nextMinute !== '' && h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      onTimeChange(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    } else if (nextHour === '' && nextMinute === '') {
      onTimeChange('23:59'); // 비우면 기본 시각
    }
  };

  const digits = (v) => v.replace(/\D/g, '').slice(0, 2);

  return (
    <div className="deadline-input">
      <div className="deadline-row">
        <label className="deadline-field">
          <input
            inputMode="numeric"
            placeholder="월"
            value={month}
            onChange={(e) => changeDate(digits(e.target.value), day)}
            aria-label="마감 월"
          />
          <span className="unit">월</span>
        </label>
        <label className="deadline-field">
          <input
            inputMode="numeric"
            placeholder="일"
            value={day}
            onChange={(e) => changeDate(month, digits(e.target.value))}
            aria-label="마감 일"
          />
          <span className="unit">일</span>
        </label>
        <label className="deadline-field time">
          <input
            inputMode="numeric"
            placeholder="23"
            value={hour}
            onChange={(e) => changeTime(digits(e.target.value), minute)}
            aria-label="마감 시"
          />
          <span className="unit">:</span>
          <input
            inputMode="numeric"
            placeholder="59"
            value={minute}
            onChange={(e) => changeTime(hour, digits(e.target.value))}
            aria-label="마감 분"
          />
        </label>
      </div>
      <p className={`deadline-preview ${dateInvalid ? 'is-error' : ''}`}>
        {date
          ? `${formatDeadline(date)} ${time}까지`
          : dateInvalid
            ? '존재하지 않거나 이미 지난 날짜예요. 월·일을 확인해 주세요.'
            : '예: 11월 27일 · 시각은 비우면 23:59예요.'}
      </p>
    </div>
  );
}
