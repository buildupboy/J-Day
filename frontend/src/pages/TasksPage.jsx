import PageHeader from '../components/common/PageHeader.jsx';

export default function TasksPage({ onOpenMy }) {
  return (
    <>
      <PageHeader title="작업" onOpenMy={onOpenMy} />
      <div className="page-body">
        <p className="placeholder">작업 목록 · 새 작업 등록 (음성 / 직접 입력)</p>
        <ul className="stub-list">
          <li>작업 이름</li>
          <li>마감일</li>
          <li>중요도</li>
          <li>예상 소요 시간 · 진행 상황</li>
        </ul>
        <button type="button" className="primary-button">
          빈 시간에 자동 배치
        </button>
      </div>
    </>
  );
}
