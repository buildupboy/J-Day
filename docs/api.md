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
| `importance` | number? | 1=낮음, 2=보통(기본), 3=높음 |
| `type` | `'report' \| 'coding' \| 'exam' \| 'presentation' \| 'reading' \| 'etc'` | 과제 유형 (개인 보정 계수의 기준) |
| `subtasks` | `Subtask[]` | 하위작업 |
| `estimatedMinutes` | number | 보정 후 총 추정시간 |
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
| TODO | GET | `/api/schedule/today` | 오늘 타임라인 조회 |
| TODO | POST | `/api/tasks` | 작업 등록 |
| TODO | PATCH | `/api/tasks/:id/progress` | 진행 보고 |
| TODO | POST | `/api/schedule/reschedule` | 재스케줄링 |

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
- 우선순위는 마감 시각 임박 → importance 높은 순 → 남은 작업량 큰 순이다. 모두 같으면 입력 순서를 유지한다. 중요도는 마감 날짜뿐 아니라 정확한 마감 시각이 같을 때 적용한다. 생략하면 2(보통)이며 null·문자열·범위 밖 값은 RangeError로 거부한다. 중요도는 호출자가 전달하고 스케줄러는 추정하지 않는다.
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
