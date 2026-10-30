# AI 자동배치 전달·검증 규약

작성일: 2026-10-30 · 브랜치: feat/ai-scheduling-support

## 1. 변경된 역할

이 문서는 기존 규칙 기반 시간 배치 명세를 대체한다.

| 담당 | 역할 |
|---|---|
| 입력·LLM 담당 | 음성 이해, 작업 분해·추정, **실제 배치 날짜와 시작·종료 시각 선택**, 검증 실패 시 재요청 |
| 스케줄러 지원 코드 | 남은 작업량·참고 우선순위·빈 구간·일정 제약 정리, AI 결과 검증 |
| API·저장소 | 과제·진행 저장, AI 대기 상태 보관, 검증된 결과만 저장 |

서버는 빈 시간을 직접 작업으로 채우거나 AI가 선택한 시각을 자동으로 옮기지 않는다. 기존 allocate 함수는 RULE_BASED_ALLOCATION_DISABLED 오류를 발생시킨다. devleop3 통합 후 실행 서버에서는 services/ai-planner.js와 prompts/planning.js가 실제 모델 호출과 검증 후 적용을 연결한다. 순수 reschedule 함수는 계속 입력 준비만 담당한다. 추가 통합 내역은 docs/merge-devleop3.md를 참조한다.

## 2. 호출 흐름

1. 과제 등록·진행 보고·복습 등록 또는 POST /api/schedule/reschedule을 실행한다.
2. rescheduled=false, schedulingStatus=awaiting_ai, planningContext를 받는다.
3. LLM 담당 코드가 planningContext를 모델에 전달하고 blocks 배열을 받는다.
4. POST /api/schedule/apply에 contextId와 blocks를 보낸다.
5. 검증 통과 후에만 rescheduled=true, schedulingStatus=applied를 반환한다.

기존 예정 블록은 AI 결과를 적용할 때까지 보존한다. 예외로 완료된 작업/하위작업의 불필요한 미래 planned는 제거하고, 종료된 미완료 기록은 missed로 갱신한다. 과거·진행 중·완료·missed 기록과 계획 범위 밖의 기존 미래 블록은 AI가 교체하지 못한다.

## 3. 입력 준비 API

~~~http
POST /api/schedule/reschedule
Content-Type: application/json

{"reason":"manual","horizonDays":14}
~~~

reason은 new_task / missed / progress / manual이다. horizonDays는 1~31, 기본 14이다. 과제 등록·진행 보고에서는 기본 14일 범위를 준비한다. 시간 범위를 넘어선 작업량도 rankedTasks에 남아 있으며, AI가 전부 배치할 의무는 없다.

~~~json
{
  "rescheduled": false,
  "schedulingStatus": "awaiting_ai",
  "scheduledBlocks": [],
  "changes": [],
  "unplaced": [],
  "planningContext": {
    "schemaVersion": 1,
    "contextId": "서버가 생성한 값",
    "sourceRevision": "입력 스냅샷 해시",
    "generatedAt": "2026-10-30T15:00:30+09:00",
    "timezone": "Asia/Seoul",
    "window": { "from": "2026-10-30", "to": "2026-11-12" },
    "priorityIsAdvisory": true,
    "rankedTasks": [],
    "fixedBlocks": [],
    "protectedBlocks": [],
    "replaceableBlockIds": [],
    "days": [],
    "settings": {}
  }
}
~~~

위 배열은 구조 예시이다. 실제 응답에는 DB의 작업·고정 일정·보존 블록·빈 구간이 들어간다. 준비 단계의 unplaced=[]는 배치 성공이나 남은 작업 0을 뜻하지 않는다. 아직 AI 결과를 받지 않았기 때문에 미배치량을 확정하지 않는 상태이다.

GET /api/schedule/context는 최근 준비한 planningContext, schedulingStatus, stale을 읽기 전용으로 반환한다. 준비 이력이 없으면 not_requested와 planningContext=null이다. 최초 준비나 stale 갱신은 POST /reschedule로 실행한다. 조회는 새 입력을 만들지 않는다.

## 4. planningContext 내용

| 필드 | 의미 |
|---|---|
| contextId | 요청 식별자. 결과 적용 시 그대로 전달 |
| sourceRevision | 작업·설정·고정 일정·저장된 블록의 스냅샷 |
| rankedTasks | 미완료 작업과 하위작업별 남은 분량, priorityScore(0~100), priorityRank |
| priorityPolicy | priorityScore 높은 순 → (동점) 마감 빠른 순 → 중요도 높은 순 → 남은 시간 짧은 순 → 입력 순서 |
| priorityIsAdvisory | true. AI의 참고 순서이며 해당 순서로 시각을 강제하지 않음 |
| recommendedSlotMinutes | 기존 minSlotMinutes를 AI의 권장 작업 단위로 전달. 결과 검증의 최소 블록 길이로 강제하지 않음 |
| fixedBlocks | 요일별 반복 고정 일정. AI가 수정할 수 없음 |
| protectedBlocks | 기존 과거·진행 중·완료·missed 및 계획 범위 밖 블록. 그대로 보존 |
| replaceableBlockIds | AI 결과 적용 시 교체할 수 있는 미래 planned의 ID |
| days[].slots | 고정 일정·보존 블록·보존 블록 전후 휴식을 제외한 빈 구간. 현재 이전은 제외 |
| days[].freeMinutes | 해당 빈 구간의 분 합계. 작업량 목표가 아님 |
| days[].existingWorkMinutes | 보존되는 planned/done 작업량 |
| days[].remainingDailyMinutes | 하루 한도에서 보존 작업량을 뺀 값 |
| days[].requiredBufferMinutes | 확보 가능한 빈 시간 범위에서 유지할 여유 시간 |
| settings | 하루 시간 범위, 최대 블록, 휴식, 하루 한도, 여유 시간 등 |
| planningInstructions | 빈 시간을 전부 채우지 말고 식사·개인 시간·선호를 고려하라는 안내 |

priorityScore는 `backend/src/scheduler/weight.js`의 `schedulingWeight`로 계산한다. 마감 임박도 0.4 + 작업량 압박(남은 분 ÷ 마감까지 쓸 수 있는 시간, 하루 480분 가정) 0.2 + 중요도 0.3 + 짧은 작업 0.1 가중합이며, 마감이 지난 작업은 100이다. 마감이 하루 늦더라도 훨씬 중요하거나 작업량이 큰 작업이 앞설 수 있다.

rankedTasks의 remainingMinutes는 보정된 작업량, progress, Subtask.done, 진행 중인 보존 예약의 현재 이후 분량을 반영한다. 교체할 미래 planned는 남은 작업량에서 빼지 않는다. 하위작업별 reservedUntil은 이미 예약된 선행 작업의 종료 시각이며 예약이 없으면 null이다.

## 5. AI 결과 적용 API

~~~http
POST /api/schedule/apply?explain=true
Content-Type: application/json
~~~

~~~json
{
  "contextId": "준비 응답의 contextId",
  "blocks": [
    {
      "taskId": "실제 작업 ID",
      "subtaskId": "실제 하위작업 ID",
      "date": "2026-10-31",
      "start": "14:00",
      "end": "15:00",
      "placementReason": "오전 수업 이후 휴식과 식사를 고려했어요."
    }
  ]
}
~~~

- blocks는 최대 1,000개이다. 전체 새 미래 계획을 전달한다. 기존 미래 계획에 추가하는 delta 방식이 아니다.
- protectedBlocks를 다시 넣지 않는다. 서버가 보존 기록과 새 blocks를 합친다.
- id는 생략할 수 있고 서버가 contextId와 인덱스로 결정적으로 생성한다.
- 하위작업이 있는 작업은 subtaskId가 필수이다. 없는 작업은 생략하거나 null을 보낸다.
- status는 생략하거나 planned만 허용한다. source=ai는 서버가 설정한다.
- placementReason은 선택적 설명이며 서버가 저장·전달한다.
- 일부만 배치하거나 blocks=[]를 보내도 된다. 남은 작업량은 서버가 unplaced로 계산한다.
- 클라이언트가 보낸 unplaced 등 다른 계산값은 신뢰하지 않고 사용하지 않는다.

구조화된 모델 응답에 사용할 JSON Schema는 backend/src/scheduler/ai-plan-schema.js의 AI_PLAN_SCHEMA에 제공한다. Schema는 출력 구조용이며 시간 충돌·작업량·오래된 요청 검증은 적용 API가 수행한다. Schema를 쓸 때 하위작업이 없으면 subtaskId=null, placementReason은 빈 문자열이 아닌 설명을 반환한다.

## 6. 검증 항목

검증은 거부 또는 수락만 한다. 시각을 자동 수정하거나 빈 구간에 추가로 채우지 않는다.

1. 현재 pending 요청의 contextId와 일치하는가.
2. 준비 이후 작업·고정 일정·설정·저장 블록이 바뀌지 않았는가.
3. 교체 대상이었던 기존 블록이 이미 시작하지 않았는가.
4. 작업·하위작업 ID와 블록 ID가 올바른가.
5. 날짜 형식, 시작 < 종료, KST 하루 시간 범위와 준비한 기간을 지키는가.
6. 적용 시점의 현재 시각을 분으로 올림한 이후이며 notBefore 이후, 마감 이내인가.
7. 고정 일정·보존 기록·다른 AI 블록과 겹치지 않고 같은 날의 블록 간 휴식을 지키는가.
8. 한 블록이 maxBlockMinutes를 초과하지 않는가.
9. 보존 planned/done을 합친 하루 작업량이 maxDailyMinutes를 초과하지 않는가.
10. 남은 빈 구간에서 bufferMinutes를 확보 가능한 만큼 유지하는가.
11. 작업·하위작업별 남은 시간보다 많이 배치하지 않았는가.
12. 선행 하위작업의 미완료량을 남겨둔 채 후속 작업을 넣거나, 선행 종료와 휴식 이전에 후속 작업을 넣지 않았는가.

minSlotMinutes와 distribution은 AI 참고 설정이다. 짧은 작업 블록 자체를 금지하거나 balanced 알고리즘으로 시각을 재분배하지 않는다. 하루 한도·여유 시간이 기존 기본값(1440/0)이라면 강한 총부담 제한이 없는 상태이므로, LLM 담당자는 빈 시간 전체를 채우지 않도록 사용자 선호와 실행 가능한 분량을 배치 프롬프트에 반영해야 한다.

## 7. 응답·오류·재시도

수락 시 200과 {rescheduled:true,schedulingStatus:applied,scheduledBlocks,changes,unplaced}를 반환한다. explain=true이면 설명도 추가한다. 타임라인의 source는 기존처럼 fixed/scheduled이며 AI 배치 출처는 placementSource=ai로 구분한다.

- 400: 잘못된 블록이나 일정 제약 위반. 같은 contextId로 제안을 수정해 다시 보낼 수 있다.
- 409: 다른 contextId, 입력 변경, 기존 블록 시작, 이미 적용한 요청에 다른 결과 제출. POST /reschedule로 새 입력을 준비하고 AI를 다시 호출한다.
- 500: DB 읽기·저장 등 처리 실패. 기존 파일에 일부만 저장하지 않는다.
- 동일 contextId와 동일 blocks를 재전송하고 상태가 바뀌지 않았다면 중복 추가하지 않고 changes=[]로 응답한다.

AI가 응답하는 동안 시간이 지나면 과거가 된 새 블록은 400으로 거부될 수 있다. 생성 시각 바로 다음 분을 시작으로 잡기보다 응답 지연을 고려한 시각을 제안해야 한다. 모델 재호출 정책은 LLM 담당자가 구현한다.

## 8. 음성·자동 확인 연결

- 음성 입력의 이해·추정은 기존 흐름을 유지한다.
- 서버의 scheduler 주입은 이제 AI 입력 준비기이며 실제 배치를 하지 않는다. 기존 VOICE_SCHEDULER_ENABLED 값으로 규칙 배치가 살아나지 않는다.
- 음성 응답은 pending_schedule이고 schedulerRequests는 pending을 유지한다.
- 검증된 AI 결과를 /schedule/apply로 적용한 뒤에만 대기 큐를 processed로 바꾼다.
- 60초 미수행 확인도 상태 갱신과 AI 입력 준비까지만 수행한다. 모델을 호출하거나 작업을 배치하지 않는다.
- 실행 서버는 planSchedule을 주입하여 실제 AI 배치와 검증 후 적용까지 연결한다. 순수 지원 함수의 기본 동작은 위 준비/대기 규약을 유지한다.

## 9. 저장 형식

db.json에는 선택적 aiScheduling 메타데이터를 추가한다.

~~~json
{
  "aiScheduling": {
    "status": "pending",
    "context": { "contextId": "서버 생성 값", "sourceRevision": "입력 해시" }
  }
}
~~~

실제 context는 전체 입력이다. 적용 후 status=applied, planHash, appliedAt, appliedRevision, unplaced를 저장한다. 이 메타데이터는 오래된 응답 거부와 멱등 처리를 위한 것이다. 비밀 API 키는 저장하지 않는다.

## 10. 테스트

규칙이 시간을 자동 배치한다는 이전 테스트는 새 역할에 맞는 준비·검증·대기·적용 테스트로 교체했다. 기존 시간 추정·수행 보고·저장·음성·조회·분석·시간표 테스트도 유지한다.

~~~powershell
cd C:\Users\wmfao\J-Day\backend
node --test
~~~

모델·실제 DB 대신 임시 DB와 모델 응답 대역을 사용한다. UI 화면은 이 작업의 검증 범위에 포함하지 않는다.

## 짧은 작업 묶기 (30분 미만)

배치가 끝난 직후, 남은 작업 전체가 30분 미만 블록 하나에 들어 있는 서로 다른 작업이 쉬는 시간만 두고 나란히 놓이면 제이가 "이어서 하시겠어요?"라고 묻는다. 후보 탐색은 `backend/src/scheduler/short-merge.js`의 순수 함수 `findShortMergeGroups`가 하며, 진행 중이거나 완료 기록이 있는 작업, 블록이 여러 개로 나뉜 작업, 지난 블록, 거절한 묶음은 제외한다.

| API | 설명 |
|---|---|
| GET /api/schedule/merge-suggestions | 현재 묶기 후보 `{ groups: [{ id, date, blockIds, titles, minutes, totalMinutes }] }` |
| POST /api/schedule/merge-short `{ blockIds }` | 수락. 작업들을 `기타 작업`(type=etc, 마감=가장 이른 마감, 중요도=가장 높은 값) 하나의 하위작업으로 옮기고 블록을 쉬는 시간 없이 이어 붙인다. 원래 작업은 제거된다 |
| POST /api/schedule/merge-short/decline `{ id }` | 거절. 같은 묶음은 다시 묻지 않는다 (`shortMergeDeclined`) |

묶인 작업에는 `skipInnerBreak: true`가 붙고, 이후 AI 재배치와 검증은 이 작업의 하위작업 블록 사이에 휴식을 요구하지 않는다. 마지막 블록 뒤와 다른 작업 사이에는 기존 휴식 규칙이 적용된다. 프론트는 앱 전체에서 `schedule-changed` 이벤트·재배치 종료·화면 복귀 시 후보를 조회해 어느 화면에서든 팝업(`ShortMergePrompt`)으로 묻는다. "나중에"는 이번 접속에서만 숨긴다.
