import PageHeader from '../components/common/PageHeader.jsx';

export default function AnalyticsPage({ onOpenMy }) {
  return (
    <>
      <PageHeader title="이번 주" onOpenMy={onOpenMy} />
      <div className="page-body">
        <div className="stat-row">
          <div className="card">
            <div className="card-label">계획 달성률</div>
            <strong>-%</strong>
          </div>
          <div className="card">
            <div className="card-label">집중한 시간</div>
            <strong>-h</strong>
          </div>
        </div>
        <section className="section">
          <h2>계획 vs 실제</h2>
          <p className="placeholder">일별 막대 그래프</p>
        </section>
        <section className="section">
          <h2>내 작업 속도</h2>
          <p className="placeholder">예상 대비 실제 소요 시간</p>
        </section>
      </div>
    </>
  );
}
