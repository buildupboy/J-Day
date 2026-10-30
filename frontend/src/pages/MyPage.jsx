import PageHeader from '../components/common/PageHeader.jsx';

export default function MyPage({ onBack }) {
  return (
    <>
      <PageHeader title="마이" onBack={onBack} />
      <div className="page-body">
        <section className="section">
          <h2>고정 시간</h2>
          <p className="placeholder">시간표 · 알바 · 루틴 등록</p>
        </section>
        <section className="section">
          <h2>휴게 시간</h2>
          <p className="placeholder">식사 · 휴식 시간 등록</p>
        </section>
        <section className="section">
          <h2>내 능력치</h2>
          <p className="placeholder">자기 평가 · 선호 시간대 · 집중 지속 시간</p>
        </section>
      </div>
    </>
  );
}
