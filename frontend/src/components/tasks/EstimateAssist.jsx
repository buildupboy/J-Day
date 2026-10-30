import { useState } from 'react';
import { PaperclipIcon } from '../common/Icons.jsx';
import { estimateTask } from '../../utils/estimateTask.js';

// "예상 시간을 모르겠어요" 영역: 과제 내용과 안내문 파일을 주면 제이가 예상 시간을 추천한다.
// TODO: 백엔드 LLM(breakdownTask)과 scheduler/estimator가 구현되면 estimateTask 대신 호출한다.
export default function EstimateAssist({ title, onApply }) {
  const [open, setOpen] = useState(true);
  const [content, setContent] = useState('');
  const [files, setFiles] = useState([]);
  const [result, setResult] = useState(null);

  const canAsk = Boolean(title.trim() || content.trim());

  const ask = () => setResult(estimateTask(`${title} ${content}`));

  const addFiles = (list) =>
    setFiles((prev) => [...prev, ...Array.from(list).map((f) => ({ id: `${f.name}-${f.lastModified}`, name: f.name }))]);

  return (
    <section className="assist">
      <button type="button" className="assist-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        예상 시간을 모르겠어요
        <span className={open ? 'is-open' : ''}>⌃</span>
      </button>

      {open && (
        <>
          <label className="assist-label" htmlFor="task-content">
            과제 내용
          </label>
          <textarea
            id="task-content"
            rows={3}
            value={content}
            placeholder="예: 고유값·고유벡터 문제 8개, 증명 2개. 풀이 과정까지 손글씨로 제출"
            onChange={(e) => setContent(e.target.value)}
          />

          <div className="assist-files">
            {files.map((f) => (
              <span key={f.id} className="file-chip">
                <PaperclipIcon size={16} />
                {f.name}
                <button
                  type="button"
                  onClick={() => setFiles((prev) => prev.filter((x) => x.id !== f.id))}
                  aria-label="첨부 삭제"
                >
                  ✕
                </button>
              </span>
            ))}
            <label className="file-add-chip">
              + 파일 첨부
              <input
                type="file"
                accept=".pdf,.txt,application/pdf,text/plain"
                multiple
                hidden
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = '';
                }}
              />
            </label>
          </div>

          <button type="button" className="primary-button" disabled={!canAsk} onClick={ask}>
            예상 시간 추천받기
          </button>

          {result && (
            <div className="assist-result">
              <div className="assist-title">
                <span className="j-badge">J</span>
                <strong>약 {result.totalHours}시간 걸릴 것 같아요</strong>
              </div>
              <p>
                범위 {result.minHours}~{result.maxHours}시간 ·{' '}
                {result.items.map((it) => `${it.title} ${it.hours}h`).join(', ')}
                {result.coef !== 1 && ` · 내 ${result.label} 속도 ×${result.coef} 반영`}
              </p>
              <button type="button" className="apply-chip" onClick={() => onApply(result)}>
                {result.totalHours}시간으로 적용
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
