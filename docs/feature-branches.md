# 기능별 브랜치

기존 통합본은 archive/scheduler-integration에 보존했다. main은 변경하지 않는다.

| 작업 브랜치 | PR 비교 기준 |
|---|---|
| feat/allocator | main |
| feat/estimator | feat/allocator |
| feat/rescheduler | feat/estimator |
| feat/reviews | feat/rescheduler |
| feat/schedule-explanations | feat/reviews |
| feat/tasks-api | feat/schedule-explanations |
| feat/schedule-api | feat/tasks-api |
| feat/auto-reschedule | feat/schedule-api |

의존 기능 때문에 다음 브랜치는 앞 브랜치의 코드를 포함한다. GitHub에서 PR 비교 기준을 표와 같이 지정하면 해당 기능의 변경만 검토할 수 있다. 병합은 위에서 아래 순서로 진행하고 앞 브랜치가 main에 병합되면 다음 PR의 대상을 main으로 바꾼다.

feat/allocator의 기존 원격 이력은 보존하고 정리 커밋을 추가했다. 강제 푸시는 하지 않는다. 전체 실행 상태는 feat/auto-reschedule에 있다.
