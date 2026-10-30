import { useState } from 'react';

const presets = [120, 240, 360, 480];
export function dailyDuration(minutes) {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1440) return '시간을 입력해 주세요';
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  return [hours ? hours + '시간' : '', rest || !hours ? rest + '분' : ''].filter(Boolean).join(' ');
}

export default function DailyWorkloadPicker({ value, onChange }) {
  const [custom, setCustom] = useState(() => !presets.includes(value));
  const [hours, setHours] = useState(() => String(Math.floor(value / 60)));
  const [minutes, setMinutes] = useState(() => String(value % 60));
  function change(nextHours, nextMinutes) {
    setHours(nextHours); setMinutes(nextMinutes);
    const h = Number(nextHours), m = Number(nextMinutes);
    const valid = /^\d+$/.test(nextHours) && /^\d+$/.test(nextMinutes) && h <= 24 && m <= 59 && h * 60 + m <= 1440;
    onChange(valid ? h * 60 + m : '');
  }
  return <>
    <div className="pattern-choices is-vertical" role="group" aria-label="하루 작업량">
      {['가볍게', '적당히', '집중해서', '많이'].map((label, index) => <button type="button" key={label} aria-pressed={!custom && value === presets[index]} onClick={() => {
        setCustom(false); setHours(String(presets[index] / 60)); setMinutes('0'); onChange(presets[index]);
      }}><strong>{label}</strong><small>{dailyDuration(presets[index])}</small></button>)}
      <button type="button" aria-pressed={custom} aria-expanded={custom} aria-controls="daily-custom-fields" onClick={() => setCustom(true)}><strong>직접 설정하기</strong><small>{custom ? dailyDuration(value) : '원하는 시간과 분을 입력해요'}</small></button>
    </div>
    {custom && <div id="daily-custom-fields" className="pattern-daily-custom">
      <div className="pattern-daily-inputs">
        <label>시간<input type="number" inputMode="numeric" min="0" max="24" step="1" required value={hours} onChange={event => change(event.target.value, minutes)} /></label>
        <label>분<input type="number" inputMode="numeric" min="0" max="59" step="1" required value={minutes} onChange={event => change(hours, event.target.value)} /></label>
      </div>
      <p className="pattern-help">0시간 0분부터 24시간 0분까지 설정할 수 있어요. 0분이면 새 작업을 배치하지 않아요.</p>
    </div>}
  </>;
}
