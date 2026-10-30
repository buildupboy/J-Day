import { ClockIcon, ChevronIcon, SparkIcon, PlusCircleIcon, CalendarIcon } from '../common/Icons.jsx';
import { fromMinutes, formatDuration } from '../../utils/time.js';

// 오늘의 여유 시간 시트: 총합, 시간대 목록, 제이의 한마디, 활용 버튼
export default function FreeTimeSheet({ slots, total, suggestTask, onNavigate, onClose }) {
  const best = slots.reduce((a, b) => (!a || b.minutes > a.minutes ? b : a), null);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section className="sheet sheet-auto free-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="todo-sheet-title">
          <h2>오늘의 여유 시간</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>

        <div className="free-total">
          <ClockIcon size={32} />
          <strong>총 {formatDuration(total)}</strong>
          <p>
            현재 일정 기준으로, 오늘 추가로 사용할 수 있는 시간이에요.
            {total > 0 && (
              <>
                <br />
                일정이 밀려도 약 {formatDuration(total)}의 여유가 있어요.
              </>
            )}
          </p>
        </div>

        <div className="free-head">
          <h3>여유 시간대</h3>
          <span>총 {formatDuration(total)}</span>
        </div>
        {slots.length === 0 ? (
          <p className="placeholder">오늘은 남은 여유 시간이 없어요.</p>
        ) : (
          <ul className="free-list">
            {slots.map((sl) => (
              <li key={sl.start}>
                <button type="button" onClick={() => onNavigate('calendar')}>
                  <span className="free-clock">
                    <ClockIcon size={22} />
                  </span>
                  <strong>
                    {fromMinutes(sl.start)} - {fromMinutes(sl.end)}
                  </strong>
                  <em>{formatDuration(sl.minutes)}</em>
                  <ChevronIcon size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="jay-note">
          <h3>
            <SparkIcon size={16} /> 제이의 한마디
          </h3>
          <p>
            {best ? (
              <>
                {fromMinutes(best.start)}~{fromMinutes(best.end)} 사이에 {formatDuration(best.minutes)} 정도의
                여유가 있어요!
                {suggestTask && (
                  <>
                    <br />
                    {suggestTask} 작업을 이 시간에 배치하면 좋을 것 같아요.
                  </>
                )}
              </>
            ) : (
              '오늘은 일정이 가득 찼어요. 급하지 않은 일은 내일로 미뤄 볼까요?'
            )}
          </p>
        </div>

        <h3 className="free-use-title">여유 시간 활용하기</h3>
        <div className="free-actions">
          <button type="button" onClick={() => onNavigate('tasks')}>
            <PlusCircleIcon size={20} /> 새 작업 추가하기
          </button>
          <button type="button" onClick={() => onNavigate('tasks')}>
            <CalendarIcon size={20} /> 일정 자동 배치하기
          </button>
        </div>
      </section>
    </div>
  );
}
