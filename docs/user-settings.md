# 생활 패턴·작업 스타일 설정

## 범위와 UI

기존 마이 메인 레이아웃, 고정 일정/사진 인식/수정/삭제, 희망 시간대, AI 개인화 정보,
주간 분석 로직은 유지한다. 휴게 시간·수면·작업 가능 시간·작업 스타일만 별도 상세 화면으로 연결했다.
설정은 서버 JSON 저장소에 보관하며 브라우저 저장소에 의존하지 않는다.
상세 화면의 수정은 초안이며, 뒤로가면 저장하지 않는다. 메뉴 우측 요약은 저장된 값이다.
이 체크아웃에서 `J-Day_scheduler_spec_v1.0.md`는 발견되지 않아 실제 allocator/rescheduler,
docs/api.md, 기존 테스트 규칙을 기준으로 구현했다.

## API

- `GET /api/user/settings`: 유효 설정값, 저장된 필드 목록, 고정 일정 수, 미래 예정/진행 중 블록 수.
- `PATCH /api/user/settings`: `{settings: {...변경 필드}, confirmReschedule: true}`.
- 수정 허용 필드: breakMinutes, sleep, dayStart, dayEnd, maxBlockMinutes, maxDailyMinutes, distribution.
- sleep은 `{start: '23:30', end: '07:00'}` 또는 null(미설정).
- 종료는 작업 가능 시간에서만 24:00 허용. 수면 취침/기상 동일값은 거절.
- 확인 플래그 없으면 409, 유효하지 않은 설정은 400.
- 응답에는 새 설정과 changes, unplaced(작업명 포함)가 들어간다.

설정 병합과 기존 reschedule(manual), scheduledBlocks 교체를 기존 updateDb의 단일 갱신 안에서
계산·저장한다. 계산이나 파일 저장 실패 시 부분 저장하지 않는다. 관련 없는 사용자 설정과
고정 일정, 작업, 완료 이력, 다른 DB 필드는 유지한다. 현재의 원자적 JSON 파일 교체와
프로세스 내 갱신 직렬화 규약을 그대로 이용한다.

## 배치 연동

allocator.findFreeSlots에 sleepIntervals만 점유 구간으로 추가했다.
자정 초과 수면은 00:00~기상, 취침~24:00의 매일 반복 구간으로 나눈다.
이미 존재하는 점유 구간 합집합 로직으로 수면과 고정 일정 중첩을 한 번만 차감한다.
고정 일정 저장소에 수면 블록을 생성하지 않으므로 고정 일정 목록에 중복되지 않는다.

나머지는 기존 breakMinutes, dayStart/dayEnd, maxBlockMinutes, maxDailyMinutes,
bufferMinutes, distribution의 동작을 재사용한다. 새 작업·수동 재배치·미수행 재배치 등
기존 allocator 경로가 모두 저장된 수면 설정을 반영한다.

기존 rescheduler의 보존 정책에 따라 지난/완료/진행 중 블록은 지우거나 옮기지 않는다.
따라서 설정 변경 시 이미 진행 중인 블록은 새 시간 범위나 수면과 겹쳐도 그대로 남을 수 있다.
UI에 이를 명시하고 미래 planned 블록 변경에 동의를 받아 저장한다.
unplaced는 실패로 숨기지 않고 마이 화면에 작업명과 미배치 분량을 안내한다.
스케줄 변경 후 기존 schedule-changed 이벤트로 홈·캘린더 갱신을 알린다.

## 검증

`node --test backend/test/user-settings.test.js`
`npm test --prefix backend`
`npm run build --prefix frontend`

새 테스트: 자정/낮 수면, 고정 일정 중첩, 작업 가능 범위, 휴식/블록/하루 한도,
early/balanced 재사용, 입력 검증, 변경 필드만 병합, API 저장·재조회,
확인/계산/쓰기 실패, 진행·완료 기록 보존과 unplaced.
실사용 DB를 테스트 설정으로 변경하지 않고 임시 JSON 저장소로 검증한다.

## 지정 휴식 시간대 확장

휴게 시간 상세 화면에서 `restPeriods: [{start: '12:00', end: '13:00'}]`를 추가·수정·삭제한다.
최대 8개, 매일 반복이며 자정을 넘기는 구간도 지원한다. 빈 배열로 저장하면 해제한다.
작업 사이 휴식 길이인 breakMinutes와 함께 저장하지만 서로 별개로 적용한다.
allocator는 restIntervals를 수면·고정 일정·기존 작업과 합집합으로 제외하며 중복 차감하지 않는다.
기존 고정 일정 CRUD나 저장 목록은 변경하지 않는다. 저장 확인·원자적 재배치·미배치 안내는
기존 설정 API와 동일하게 적용한다. 이미 진행 중인 블록은 이전 보존 규칙을 따른다.

## 희망 작업 시간대

preferredPeriod는 morning(06~12), daytime(12~18), evening(18~24), dawn(00~06) 중 하나다.
미설정 null은 기존 시간순 배치를 유지한다. 상세 화면에서 선택·저장하면 기존 확인 절차를 거쳐
재배치하며 마이 메뉴에 저장된 시간대를 표시한다. 선택한 구간은 날짜 내 우선순위이며
작업 가능 범위·수면·휴식·고정 일정·하루 한도·마감·하위작업 순서를 우회하지 않는다.
선호 구간부터 처리할 때 변경된 휴식 점유를 다음 후보에 재확인한다. 시간대 경계 분할로
미배치량이 늘면 기존 배치와 비교하여 높은 우선순위 작업을 덜 놓치는 결과를 사용한다.
