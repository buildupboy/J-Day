import { useMemo } from 'react';
import WheelPicker from './WheelPicker.jsx';
import { toIsoDate } from '../../utils/parseTaskText.js';

const DAYS_AHEAD = 120;

// 오늘부터 120일 뒤까지 "11월 26일 (목)" 형식으로 고르는 날짜 휠. value는 'YYYY-MM-DD'
export default function DateWheel({ value, onChange, label = '날짜 선택' }) {
  const items = useMemo(() => {
    const start = new Date();
    return Array.from({ length: DAYS_AHEAD }, (_, i) => {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      const text = d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
      return { value: toIsoDate(d), label: text.replace(/\s\((.)\)$/, ' ($1)') };
    });
  }, []);
  return <WheelPicker items={items} value={value} onChange={onChange} label={label} />;
}
