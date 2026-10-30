import PageHeader from '../components/common/PageHeader.jsx';
import Timeline from '../components/timeline/Timeline.jsx';
import { formatKoreanDate } from '../utils/time.js';

export default function HomePage({ onOpenMy }) {
  return (
    <>
      <PageHeader title="좋은 하루예요" subtitle={formatKoreanDate(new Date())} onOpenMy={onOpenMy} />
      <div className="page-body">
        <section className="card card-dark">
          <div className="card-label">마감 임박</div>
          <h3>가장 가까운 마감이 여기에 표시돼요</h3>
          <div className="card-meta">남은 할 일 0개</div>
        </section>

        <section className="section">
          <h2>오늘 할 일</h2>
          <p className="placeholder">투두리스트 (완료 · 미루기 · 미완)</p>
        </section>

        <section className="section">
          <h2>오늘 일정</h2>
          <Timeline />
        </section>
      </div>
    </>
  );
}
