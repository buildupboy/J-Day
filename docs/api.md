# J-Day API & 데이터 구조

> 초안입니다. 구현하면서 바뀌면 이 문서를 같이 고쳐 주세요.

## 공통 규칙

- 시간: `HH:mm` (24시간제, 하루 끝은 `24:00` 허용)
- 날짜: `YYYY-MM-DD`
- 일시: ISO 8601, KST 오프셋 포함 (`2026-11-04T23:59:00+09:00`)
- 요일: JS `Date.getDay()` 기준 숫자 — `0=일, 1=월, … 6=토`
- 시간량: 분 단위 정수 (`estimatedMinutes`, `actualMinutes`)
- 에러 응답: `{ "error": "메시지" }` + 적절한 HTTP 상태 코드

## 데이터 구조

### FixedBlock — 고정 일정 (수업·알바·루틴)

매주 반복되는, 스케줄러가 건드리지 않는 시간.

| 필드 | 타입 | 설명 |
|---|---|---|
| `id` | string | |
| `kind` | `'class' \| 'job' \| 'routine'` | 수업 / 알바 / 루틴 |
| `title` | string | 예: "자료구조" |
| `location` | string? | |
| `dayOfWeek` | number[] | 반복 요일 (0=일 … 6=토) |
| `start` | `HH:mm` | |
| `end` | `HH:mm` | |

```json
{ "id": "fb-job", "kind": "job", "title": "편의점 알바", "dayOfWeek": [2, 4], "start": "19:00", "end": "23:00" }
```

### Task — 작업 (과제·할 일)

| 필드 | 타입 | 설명 |
|---|---|---|
| `id` | string | |
| `title` | string | |
| `deadline` | ISO datetime | 마감 |
| `notBefore` | ISO datetime? | 시작 가능 시각 |
| `reviewOf` | string? | 복습의 원본 시험 ID |
| `importance` | number? | 1=낮음, 2=보통(기본), 3=높음 |
| `type` | `'report' \| 'coding' \| 'exam' \| 'presentation' \| 'reading' \| 'etc'` | 과제 유형 (개인 보정 계수의 기준) |
| `subtasks` | `Subtask[]` | 하위작업 |
| `estimatedMinutes` | number | 보정 후 총 추정시간 |
| `baseEstimatedMinutes` | number? | 원본 추정시간 |
| `actualMinutes` | number? | 누적 수행시간 |
| `progress` | number | 0 ~ 1 |
| `status` | `'todo' \| 'in_progress' \| 'done'` | |
| `createdAt` | ISO datetime | |

`Subtask`: `{ id, title, estimatedMinutes, done: boolean }`

### ScheduledBlock — 배치된 작업 블록

스케줄러(allocator/rescheduler)가 만든, 특정 날짜에 작업을 하기로 한 시간.

| 필드 | 타입 | 설명 |
|---|---|---|
| `id` | string | |
| `taskId` | string | Task.id |
| `subtaskId` | string? | 특정 하위작업에 배치한 경우 |
| `date` | `YYYY-MM-DD` | |
| `start` | `HH:mm` | |
| `end` | `HH:mm` | |
| `status` | `'planned' \| 'done' \| 'missed'` | |

### HistoryRecord — 과거 수행 기록 (보정 계수 계산용)

`{ id, taskTitle, type, estimatedMinutes, actualMinutes, completedAt }`

### db.json 최상위 구조

```json
{ "user": { "settings": {} }, "fixedBlocks": [], "tasks": [], "scheduledBlocks": [], "history": [] }
```

`user.settings`: `dayStart`, `dayEnd`, `minSlotMinutes`, `maxBlockMinutes`, `breakMinutes`

## API 목록

| 상태 | 메서드 | 경로 | 설명 |
|---|---|---|---|
| ✅ | GET | `/api/health` | 헬스체크 |
| ✅ | GET | `/api/tasks` | 작업 목록 |
| TODO | POST | `/api/chat/interpret` | 음성 텍스트 해석 |
| ✅ | GET | `/api/schedule/today` | 오늘 타임라인 조회 |
| ✅ | GET | `/api/schedule/week` | 주간 타임라인 조회 |
| ✅ | POST | `/api/tasks` | 작업 등록·자동 배치 |
| ✅ | POST | `/api/tasks/:id/reviews` | 복습 등록 |
| ✅ | PATCH | `/api/tasks/:id/progress` | 진행 보고·자동 재배치 |
| ✅ | POST | `/api/schedule/reschedule` | 재배치·저장 |

### POST /api/chat/interpret — 음성 텍스트 해석

```jsonc
// req
{ "text": "헤이 제이, 금요일까지 운영체제 과제 있어" }
// res
{
  "intent": "add_task",          // add_task | report_progress | query_schedule | reschedule | smalltalk
  "reply": "운영체제 과제를 등록했어요. 약 5시간 걸릴 것 같아서 오늘 저녁부터 나눠 넣었어요.",
  "result": { }                   // 의도별 처리 결과 (생성된 Task, 바뀐 블록 등)
}
```

### GET /api/schedule/today — 오늘 타임라인 조회

```jsonc
// res
{
  "date": "2026-10-30",
  "items": [
    { "source": "fixed", "kind": "routine", "title": "아침 운동", "start": "07:00", "end": "07:40" },
    { "source": "scheduled", "taskId": "t-db-report", "title": "ERD 작성", "start": "14:00", "end": "15:30", "status": "planned" }
  ]
}
```

### PATCH /api/tasks/:id/progress — 진행 보고

```jsonc
// req
{ "progress": 0.6, "actualMinutes": 80, "subtaskId": "st-2" }
// res
{ "task": { }, "rescheduled": true, "changes": [ ] }
```

### POST /api/schedule/reschedule — 재스케줄링

```jsonc
// req
{ "reason": "missed" }           // new_task | missed | progress | manual
// res
{ "scheduledBlocks": [ ], "changes": [ ], "unplaced": [ { "taskId": "t-os-hw", "remainingMinutes": 60 } ] }
```


## 스케줄러 allocator (내부 함수)

`backend/src/scheduler/allocator.js`는 DB나 LLM 호출 없이 입력을 변경하지 않고 계산한다.
기존 HTTP 응답 및 데이터 필드 규약은 유지한다. HTTP 연결과 저장은 후속 API 브랜치에서 구현한다.

```js
findFreeSlots(date, fixedBlocks, scheduledBlocks, settings)
// => [{ start: '09:00', end: '10:00' }]
allocate(tasks, fixedBlocks, { from, to, settings, existingBlocks: [], now })
// => { blocks: ScheduledBlock[], unplaced: [{ taskId, remainingMinutes }] }
```

- `from`, `to`는 양 끝을 포함하는 `YYYY-MM-DD`이다. 선택적 `now: Date`를 전달하면 현재 시각을 분 단위로 올림하여 그 이후만 배치한다. 생략하면 전체 날짜 범위를 사용한다. 시스템 시계는 자동 참조하지 않는다.
- 날짜와 마감은 KST 기준으로 계산한다. 마감 초 단위는 분으로 내림하며 마감 이후에는 배치하지 않는다.
- 고정 일정은 반복 요일에만 적용한다. 기존 블록은 상태와 무관하게 해당 날짜의 점유 시간으로 유지한다. 겹치거나 맞닿은 구간을 합치고 하루 범위 밖은 제외한다.
- 우선순위는 마감 시각 임박 → importance 높은 순 → 남은 작업시간 짧은 순이다. 모두 같으면 입력 순서를 유지한다. 중요도는 마감 날짜뿐 아니라 정확한 마감 시각이 같을 때 적용한다. 생략하면 2(보통)이며 null·문자열·범위 밖 값은 RangeError로 거부한다. 중요도는 호출자가 전달하고 스케줄러는 추정하지 않는다.
- 하위작업이 없으면 남은 작업량은 `max(0, ceil(estimatedMinutes * (1 - progress)) - 기존 planned 예약량)`이다. `now`가 있으면 현재 이후의 예약분만 차감한다. `done` 작업은 제외한다. 완료 블록은 진행률에 반영된 것으로 보아 다시 차감하지 않는다. 하위작업이 있으면 아래 하위작업 계산 규칙을 따른다.
- `existingBlocks`는 유지할 블록만 전달한다. `now` 생략 시 범위 밖 planned도 예약량으로 차감한다. `now`가 있으면 지난 시간은 차감하지 않는다. 종료된 미완료 블록의 missed 상태 갱신은 rescheduler가 담당한다.
- 최소 빈 구간은 `minSlotMinutes`, 최대 작업 블록은 `maxBlockMinutes`이다. 남은 작업이 최소 길이보다 짧으면 최소 길이 이상의 빈 구간 안에 짧은 완료 블록을 허용한다.
- 작업 블록 전후에는 `breakMinutes`를 확보한다. 휴식은 별도 ScheduledBlock으로 반환하지 않으며 고정 일정에는 별도 휴식을 붙이지 않는다. 하루 경계를 넘는 휴식은 계산하지 않는다.
- 하위작업이 있으면 `subtaskId`를 생성하고 배열 순서를 지킨다. 이미 예약된 선행 하위작업이 있으면 후속 하위작업은 그 종료와 휴식 이후 배치한다. 기존 예약 자체는 변경하지 않으므로 기존 블록의 순서 일관성은 호출자가 유지해야 한다.
- 반환 blocks는 새로 만든 블록만 포함하며 날짜/시작 순으로 정렬한다. ID는 입력에 대해 결정적이고 기존 ID와 충돌하지 않는다.
- 같은 날짜 안에서 시작 < 종료여야 한다. 자정을 넘는 고정 일정은 요일별 두 구간으로 나눈다. 잘못된 날짜·시간·설정·진행률은 RangeError를 발생시킨다.

테스트: 저장소 루트에서 `npm test --prefix backend` 실행.

### 선택적 하루 작업량 제한과 여유 시간

- user.settings.maxDailyMinutes: 하루 전체 작업의 최대 분 합계(0~1440 정수). 생략 시 1440으로 기존 동작 유지. 0이면 새 작업을 배치하지 않는다. 기존 planned/done 블록도 작업량에 포함하며 missed·고정 일정·휴식은 제외한다. 이미 한도를 넘은 기존 블록을 삭제하지 않는다.
- user.settings.bufferMinutes: 돌발 상황용 여유 시간(0~1440 정수, 생략 시 0). 하루의 늦은 빈 구간부터 확보하며 필요하면 여러 구간으로 나눈다. 기존 일정과 휴식을 제외한 빈 시간이 부족하면 확보 가능한 만큼만 비운다. 별도 ScheduledBlock은 생성하지 않는다. findFreeSlots는 원래의 점유 여부만 계산하고 이 정책은 allocate에서 적용한다.
- 작업량 한도에 도달하면 다음 날로 넘긴다. 마감 때문에 넘길 수 없으면 unplaced로 반환하며 한도/여유 시간을 자동 해제하지 않는다. 완전한 균등 분산이 아니라 하루 최대량에 따른 분산이다.
- 한도에 남은 분이 minSlotMinutes보다 작으면 최소 길이 이상의 빈 구간 안에서 그만큼 짧은 작업 블록을 허용한다.
- reschedule에서도 같은 설정을 적용한다. 오늘은 현재 시각 이후의 빈 시간에서 여유 시간을 확보하며, 이미 완료한 오늘 작업량도 한도에 포함한다.
- 예: maxDailyMinutes=180, bufferMinutes=60이면 하루 작업은 최대 3시간이고 늦은 빈 시간에서 최대 1시간을 비워 둔다. seed의 기본값은 기존 동작 보존을 위해 1440/0이다.

### 하위작업별 작업량 계산

- Task.estimatedMinutes는 보정된 전체 작업량이다. 이를 Subtask.estimatedMinutes의 비중에 따라 분 단위로 배분하고 나머지는 입력 순서로 배분한다. 하위작업 시간과 전체 시간이 같으면 원래 하위작업 시간을 사용한다.
- Subtask.done으로 계산한 완료량과 Task.progress로 계산한 완료량 중 더 큰 값을 채택한다. 두 값을 합쳐 중복 차감하지 않는다. progress의 추가 완료량은 미완료 하위작업의 앞부분부터 소진한다.
- 예: 총 270분, 하위작업 60/120/90분, 첫 작업 done, progress=0.2이면 남은 시간은 210분이다. 이전 작업 단위 계산의 216분과 달라진다.
- 기존 planned의 subtaskId가 있으면 해당 하위작업 예약량을 차감하고, 없는 기존 블록은 앞 하위작업부터 차감한다. ID 없는 기존 블록만으로 하위작업 선후관계를 추론하지 않는다.
- 완료 블록만으로 progress를 자동 수정하지 않는다. 진행 보고 처리에서 Task.progress와 Subtask.done, ScheduledBlock.status를 일관되게 갱신해야 한다.
- 하위작업 ID는 작업 내에서 고유해야 하고 추정시간은 0 이상 정수이다. 전체 시간이 양수인데 하위작업 시간 합이 0이면 RangeError이다.

### 날짜별 분산 옵션

- user.settings.distribution은 early(기본) 또는 balanced이다. early는 기존처럼 가장 이른 빈 시간부터 배치한다.
- balanced는 각 과제의 남은 작업량을 마감 전 배치 가능한 날짜 수로 나누어 일별 목표량을 계산한다. 전체 과제의 전역 최적 균등 분산을 보장하는 방식은 아니다.
- 고정 일정, 하위작업 순서, 하루 한도 등의 영향으로 미배치량이 생기면 early 결과와 비교한다. 우선순위가 높은 과제부터 미배치량을 비교하여 더 적은 쪽을 선택한다. 마감 준수가 균등 분산보다 우선한다.
- 분산 목표량이 최소 구간보다 작아도 최소 구간 이상의 빈 시간 안에서는 짧은 블록을 허용한다.


### 개인별 처리 속도 보정

estimator.js의 computeCorrectionFactors(history)는 유형별 실제 시간 합 / 기본 추정시간 합을 반환한다. 기록이 없는 유형은 applyCorrection에서 1배로 처리한다. 잘못된 유형, 0 이하 시간, 정수가 아닌 기록은 제외하며 유효한 기록에 임의의 이상치 제거/최근 가중치는 적용하지 않는다.

applyCorrection(baseMinutes, type, factors)는 양의 보정 계수를 곱하고 1분 단위로 올림한다. 과제 등록/추정 갱신 때 원본 LLM 추정시간에 한 번만 적용하여 Task.estimatedMinutes에 저장한다. allocator/rescheduler는 이미 보정된 값을 사용하므로 history를 다시 곱하지 않는다. HistoryRecord.estimatedMinutes에는 비교 기준인 원본 추정시간을 기록해야 한다.


## 재스케줄러 rescheduler (내부 함수)

`reschedule(db, { now: Date, reason })`는 `{ scheduledBlocks, changes, unplaced }`를 반환한다. DB와 입력 객체를 변경하지 않으며 HTTP 연결/저장/자동 호출은 별도 작업이다.

- reason은 `new_task | missed | progress | manual`이며 변경 기록에 남긴다. 배치 우선순위는 allocator와 동일하다.
- KST 기준 현재 시각 이후부터 미완료 작업의 가장 늦은 마감 날짜까지 배치한다. 초가 있으면 다음 분부터 시작하며 다음 날에는 원래 dayStart를 사용한다.
- 시작 시각이 현재보다 이른 블록, done/missed 기록은 보존한다. 미래 planned만 제거하여 다시 계산한다. 정확히 현재 시각에 시작하는 planned는 재배치 대상이다.
- `detectMissedBlocks(scheduledBlocks, tasks, now)`는 종료 시각 <= now인 planned 중 연결된 작업이 미완료(status != done, progress < 1)인 블록을 반환한다. 이미 missed인 기록, 연결 작업이 없는 기록, 완료된 하위작업의 블록과 모든 하위작업이 완료된 작업은 제외한다.
- 감지된 블록은 시간과 ID를 유지하고 상태만 missed로 갱신한다. 전체 진행률만으로 특정 블록의 완료 여부를 추측하지 않으므로 호출자는 완료한 블록의 status를 done으로 관리해야 한다.
- 진행 중인 planned 블록은 원래 시간·ID를 보존하되, 남은 작업량에서는 now를 분 단위로 올림한 이후의 예약분만 차감한다. 경과 시간만으로 실제 수행을 추정하지 않는다. Task.progress는 호출 시점에 보고된 완료율이다.
- 과거 planned는 반환 이력으로 보존하되 새 배치의 예약량에서 차감하지 않는다. 완료 수행량은 Task.progress가 기준이다.
- changes 항목은 `{ type: 'added', reason, after }`, `{ type: 'removed', reason, before }`, `{ type: 'updated', reason, before, after }`이다. before/after는 ScheduledBlock이며 ID 기준으로 비교한다. 이동/분할된 블록은 제거+추가로 나타날 수 있다.
- 동일한 DB와 now로 반복 실행하면 같은 배치가 나오며 변경이 없으면 changes는 빈 배열이다.


### 시험 전 복습 생성

reviews.js의 createExamReviewTasks(examTask, { daysBefore: [7, 3, 1], minutes: 30 })는 별도 복습 Task 배열을 반환한다. 옵션 생략 시 시험 7일/3일/1일 전 각 30분이다. 유틸리티 자체는 자동 호출하지 않으며, 후속 과제 API에서 명시적으로 선택하여 호출한다.

- 시험의 KST 날짜를 기준으로 계산하고 notBefore와 deadline으로 해당 하루에만 배치한다. reviewOf는 시험 ID이다.
- 복습 시간은 원본 시험 공부 시간과 별도로 추가된다. 사용자가 설정한 복습 시간을 개인 보정으로 다시 늘리지 않는다.
- ID는 원본 시험 ID와 간격으로 결정된다. 저장 시 ID 기준으로 중복 추가를 막아야 한다. 시험 날짜 변경 시 호출자가 기존 복습을 갱신해야 한다.
- 지난 복습 날짜나 빈 시간이 없는 날짜는 unplaced로 반환하며 다른 날짜로 임의 이동하지 않는다.


### 배치 설명

explanations.js의 explainSchedule(tasks, result, { settings, now })는 { blocks, unplaced } 형태의 설명 자료를 반환한다. result는 allocate 또는 reschedule 반환값이다. 원래 반환 규약과 ScheduledBlock은 변경하지 않는다.

- blocks에는 blockId, taskId, title, estimatedMinutes(해당 블록 길이), deadline, importance, reasons, message가 포함된다.
- reasons는 적용하는 배치 규칙 설명이다. 특정 시간 선택의 유일한 원인을 역추정하지 않는다.
- unplaced는 deadline_passed 또는 constraints_prevent_placement와 설명을 제공한다. 후자는 여러 제약 중 하나가 원인이라고 임의로 단정하지 않는다.
- 한국어 설명은 규칙 기반이며 LLM 호출이 없다. API 응답/화면 연결 시 호출자가 이 자료를 활용한다.


### POST /api/tasks — 구조화된 과제 등록

LLM 호출은 포함하지 않는다. LLM/프런트엔드 담당자는 이미 추출·추정한 아래 JSON을 전달한다. 저장된 Task의 estimatedMinutes는 보정 후 값이며, 등록 요청은 보정 전 baseEstimatedMinutes를 사용하여 이중 보정을 방지한다.

~~~json
{
  "id": "optional-client-id",
  "title": "운영체제 과제",
  "type": "coding",
  "deadline": "2026-11-04T23:59:00+09:00",
  "baseEstimatedMinutes": 180,
  "importance": 2,
  "subtasks": [
    { "id": "design", "title": "설계", "estimatedMinutes": 60 },
    { "id": "code", "title": "구현", "estimatedMinutes": 120 }
  ]
}
~~~

- title/type/deadline/baseEstimatedMinutes는 필수이다. id와 하위작업 id를 생략하면 서버가 생성한다. importance 기본값은 2, subtasks 기본값은 빈 배열이다. notBefore는 선택적 시작 가능 일시이다.
- 새 작업은 progress=0, status=todo, 모든 하위작업 done=false로 등록한다. createdAt은 서버의 KST 시각이다. 실제 누적시간은 0으로 시작한다.
- 추정시간은 0~1,000,000 정수, 중요도는 1~3이다. 빈 제목·잘못된 일시·중복 하위작업 ID·잘못된 하위작업 시간은 400이다. 기존 작업 ID 중복은 409이며 덮어쓰지 않는다.
- 성공은 201과 { task, reviewTasks, rescheduled: true, scheduledBlocks, changes, unplaced }이다. 과제 추가와 재배치 결과를 하나의 updateDb에서 저장하며 실패 시 둘 다 저장하지 않는다. 과거 마감도 등록되지만 남은 시간은 unplaced에 나온다.
- 시험(type=exam)에 review:true 또는 review:{daysBefore:[7,3,1],minutes:30}을 추가하면 복습 작업을 함께 생성한다. 생략/false이면 생성하지 않는다. 시험 외 유형에 review를 요청하면 400이다.
- 복습 작업은 입력한 분량을 그대로 쓰며 개인 보정을 다시 적용하지 않는다. 복습은 원본 시험 작업량 외에 추가되는 시간이다.

### POST /api/tasks/:id/reviews — 기존 시험의 복습 등록

- JSON 본문은 {}(기본값) 또는 {daysBefore:[3,1],minutes:30}이다. 간격은 1~365일의 정수, 최대 30개이며 중복 간격은 하나로 처리한다. 복습시간은 1~1440분이다.
- 200과 {task,reviewTasks,rescheduled:true,scheduledBlocks,changes,unplaced}를 반환한다. 없는 작업은 404, 시험이 아니면 400이다.
- 동일한 시험·간격·시간으로 재요청하면 기존 복습의 진행률과 완료 상태를 유지하고 중복 생성하지 않는다. 같은 복습 ID의 날짜/시간 설정이 달라지면 409로 거부한다. 복습 일정 재설정/시험 날짜 수정 API는 별도 범위이다.

### PATCH /api/tasks/:id/progress — 진행·수행 보고

기존 progress/actualMinutes/subtaskId 요청을 유지하며 선택적으로 subtaskDone, blockId, blockStatus를 확장한다.

~~~json
{ "progress": 0.6, "actualMinutes": 80, "subtaskId": "code" }
~~~

~~~json
{ "subtaskId": "code", "subtaskDone": true, "actualMinutes": 130 }
~~~

- progress(0~1), actualMinutes(0~1,000,000 정수), subtaskDone, blockStatus 중 하나 이상이 필요하다. 없는 작업/하위작업/블록은 404이다.
- actualMinutes는 해당 작업 전체의 누적 분량이며 보고할 때마다 더하는 값이 아니다. 같은 값의 재전송은 중복 가산되지 않는다. 하위작업별 시간을 따로 저장하지 않는다.
- subtaskId만 보내면 맥락 지정이며 완료 표시하지 않는다. 완료 표시에는 subtaskDone:true를 함께 보낸다. 완료된 하위작업을 되돌리거나 progress를 낮추는 요청은 409이다.
- 하위작업 완료 비중보다 progress가 작으면 완료 비중까지 올린다. 모든 하위작업 완료 또는 progress=1이면 Task는 done이고 모든 하위작업도 done이다. 실제 시간이 있거나 진행률이 양수이면 in_progress이다.
- 특정 수행 기록을 표시하려면 blockId와 blockStatus(done|missed)를 함께 보낸다. 아직 시작하지 않은 블록은 400이다. 블록 상태 보고만으로 Task.progress를 추측하지 않는다.
- 작업 또는 하위작업이 완료되면 이미 시작한 해당 planned 블록을 done으로 바꾸고 미래 예정은 재배치 시 제거한다. 이미 done/missed인 이력은 유지한다. 진행 중 블록을 조기 완료해도 기록의 원래 종료 시각은 보존한다.
- 성공은 200과 {task,historyRecorded,rescheduled:true,scheduledBlocks,changes,unplaced}이다. 변경 내역에는 수행 상태 갱신도 포함한다.
- 일반 작업 완료 시 history-taskId라는 결정적 ID로 기록한다. 반복 보고로 중복하지 않으며 완료 후 actualMinutes를 정정하면 같은 기록의 실제시간을 갱신한다. completedAt은 최초 완료 시각을 유지한다.
- 기록의 estimatedMinutes는 baseEstimatedMinutes가 있으면 원본, 없으면 기존 estimatedMinutes를 사용한다. 원본을 알 수 없는 기존 과제의 보정 기준에는 한계가 있다. 실제시간 미보고 시 0을 기록하고 estimator는 0인 기록을 학습에 사용하지 않는다.
- 자동 생성된 복습은 개인 보정용 history에서 제외한다. 작업·수행 기록·재배치를 한 번에 저장한다.

설명은 등록/진행/복습 요청의 ?explain=true로 추가한다. 저장소는 단일 프로세스에서 갱신을 직렬화하고 완성된 임시 파일을 rename으로 교체한다. updateDb 내부에서 같은 저장소의 readDb/updateDb를 중첩 호출하지 않는다.


### GET /api/schedule/today와 /week

- today는 서버 현재 시각의 KST 날짜에 해당하는 {date,items}를 반환한다.
- week는 ?from=YYYY-MM-DD부터 7일을 반환한다. from을 생략하면 현재 KST 주의 월요일부터 일요일이다. 응답은 {from,to,days:[{date,items},...]}이다. 잘못된 날짜는 400이다.
- items는 시작/종료 시각으로 정렬한다. fixed 항목에는 source,id,kind,title,start,end,선택적 location이 포함된다. scheduled 항목에는 source와 ScheduledBlock 필드, 하위작업명(없으면 작업명)이 포함된다.
- 예정·완료·미수행 블록을 모두 조회하며 실제 저장 기록을 표시한다. 읽기 요청은 재배치하거나 저장하지 않는다.

### 설명 응답

- 과제 등록/진행 보고/복습 등록/재배치/오늘·주간 조회에 ?explain=true를 붙이면 explanations를 추가한다. 생략 또는 false이면 기존 필드를 유지한다. 다른 값은 400이다.
- 주간 조회는 각 days 항목에 explanations가 추가된다. 설명 생성 실패 시 변경 API는 저장을 완료하지 않는다.

POST /api/schedule/reschedule은 {reason:new_task|missed|progress|manual}을 받아 최신 DB를 읽고 서버 시각으로 재배치한 뒤 저장하고 {scheduledBlocks,changes,unplaced}를 반환한다. 잘못된 요청은 400, 읽기/계산/저장 오류는 500이다. 설명은 ?explain=true로 추가한다.
