import { useEffect, useRef } from 'react';

const ITEM_H = 40; // px. CSS의 .wheel-item 높이와 같아야 한다

// 스크롤해서 고르는 휠 선택기. 가운데 줄에 걸린 항목이 선택값이다.
export default function WheelPicker({ items, value, onChange, label }) {
  const ref = useRef(null);
  const timer = useRef(null);
  const index = Math.max(
    0,
    items.findIndex((it) => it.value === value)
  );

  // 값이 바깥에서 바뀌면(말로 채우기 등) 그 위치로 스크롤한다
  useEffect(() => {
    const el = ref.current;
    if (el && Math.round(el.scrollTop / ITEM_H) !== index) el.scrollTop = index * ITEM_H;
  }, [index, items.length]);

  useEffect(() => () => clearTimeout(timer.current), []);

  // 스크롤이 멈춘 뒤 가운데 항목을 선택값으로 확정한다
  const onScroll = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const next = items[Math.min(items.length - 1, Math.max(0, Math.round(ref.current.scrollTop / ITEM_H)))];
      if (next && next.value !== value) onChange(next.value);
    }, 90);
  };

  return (
    <div className="wheel" role="listbox" aria-label={label}>
      <div className="wheel-band" aria-hidden="true" />
      <ul ref={ref} onScroll={onScroll}>
        {items.map((it, i) => (
          <li
            key={it.value}
            role="option"
            aria-selected={i === index}
            className={`wheel-item ${i === index ? 'is-on' : ''}`}
            onClick={() => onChange(it.value)}
          >
            {it.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
