import { MicIcon, CalendarIcon, ListIcon, RepeatIcon, ChevronIcon } from './Icons.jsx';

const OPTIONS = [
  { id: 'newEvent', icon: <CalendarIcon size={22} />, title: '일정', hint: '시간이 정해진 약속·예약·시험' },
  { id: 'addTask', icon: <ListIcon size={22} />, title: '작업', hint: '마감까지 해야 할 과제·보고서 · 시간은 제이가 배치' },
  { id: 'repeat', icon: <RepeatIcon size={22} />, title: '고정 일정', hint: '요일마다 반복하는 일정·루틴' },
];

// 캘린더·일정 화면의 + 버튼이 여는 공통 선택창
export default function AddSheet({ nav, onClose }) {
  const pick = (id) => nav.open(id);

  return (
    <div className="d-sheet-backdrop" onClick={onClose}>
      <section className="d-sheet" aria-label="추가하기" onClick={(e) => e.stopPropagation()}>
        <span className="d-sheet-handle" aria-hidden="true" />
        <h2 className="d-sheet-title">무엇을 추가할까요?</h2>
        <button type="button" className="add-voice" onClick={() => nav.open('voice')}>
          <MicIcon size={22} />
          <span className="add-text">
            <strong>말로 추가하기</strong>
            <small>일정인지 작업인지 제이가 알아서 나눠요</small>
          </span>
        </button>
        <div className="add-list">
          {OPTIONS.map((o) => (
            <button key={o.id} type="button" className="add-row" onClick={() => pick(o.id)}>
              <span className="add-row-icon">{o.icon}</span>
              <span className="add-text">
                <strong>{o.title}</strong>
                <small>{o.hint}</small>
              </span>
              <ChevronIcon size={16} />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
