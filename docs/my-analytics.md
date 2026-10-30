# 마이·분석 구현 범위

## 확인한 현재 체크아웃

- `J-Day_scheduler_spec_v1.0.md`와 스케줄러 58개 테스트는 현재 작업 트리에 없음.
- `scheduler/estimator.js`의 computeCorrectionFactors는 빈 객체를 반환하는 TODO.
- 작업 생성·진행 보고·오늘 일정·재배치 API는 기존 501 TODO 상태. 변경하지 않음.
- 주간 일정 조회 및 사용자 설정 수정 API 없음.
- Task, ScheduledBlock, HistoryRecord는 기존 JSON 저장소 구조를 그대로 사용.

## 추가한 읽기 전용 API

`GET /api/analytics/week?from=YYYY-MM-DD`
`GET /api/analytics/month?from=YYYY-MM-DD`

from 생략 시 한국 날짜 기준 현재 기간. 주간은 월요일–일요일, 월간은 해당 월.
분석 과정은 readDb만 호출하며 배치나 설정을 변경하지 않음.

- 완료 수: 완료 이력 중 taskId 기준 중복 제거. 동일 작업은 최신 완료 기록 사용.
- 구 기록: history id 기준 중복 제거. id가 없으면 제목·유형·완료일·시간 값이 같은 행을 통합. 서로 다른 구 id가 같은 실제 작업인지는 판별 불가.
- subtaskId가 있는 하위 작업 기록은 전체 완료 수에서 제외.
- 계획 시간: 현재 저장된 블록을 id(없으면 복합 키)로 중복 제거 후 합산. 24:00 종료 지원.
- 마감 완료 현황: 기간 내 마감 작업 중 현재 status=done인 수. 정시 완료나 최초 계획 달성률로 표현하지 않음.
- 미확인 블록 수와 연결 작업 수를 별도로 반환. 실제 작업 여부는 추정하지 않음.
- 사용자 보고 actualMinutes와 estimatedMinutes가 모두 양수인 기록 수만 표시. 미구현 스케줄러를 대신하는 보정 공식은 추가하지 않음.
- 시간대별 현황은 블록 시작 시각 기준. 집중력을 추정하지 않음.
- 제이의 안내는 저장된 통계로 만드는 규칙 기반 메시지이며 외부 AI 호출 및 자동 설정 적용 없음.

## 설정·확장

고정 일정 사진 가져오기는 기존 구현 유지. 생활 패턴은 저장소의 실제 설정을 조회하며,
설정 수정 API가 없는 항목에는 저장 버튼을 제공하지 않음.
수면·희망 시간대·주간 목표·진행 보고 이력·단원 이해도 분석은 확장 필요로 표시.
이전 브라우저 예시 기록과 가상 목표·보정 수치는 분석에서 사용하지 않음.
저장소 자체에 초기 seed 데이터가 있으면 그 데이터가 조회됨. 신규 가상 기록은 생성하지 않음.

## 검증

`node --test backend/src/services/analytics.test.js backend/src/services/timetable.test.js`
`npm run build --prefix frontend`

분석 테스트는 KST 경계, 중복 제거, 하위 작업 제외, 블록·작업 구분,
재배치로 사라진 블록, 실제시간 누락, 읽기 전용, 빈 데이터, 월 경계를 확인.
