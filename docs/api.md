# J-Day API & 데이터 구조

> 현재는 AI가 배치 시각을 결정하고 백엔드가 입력 준비·검증을 담당합니다. 상세 계약은 ai-scheduling.md를 기준으로 합니다.

## 공통 규칙

- 시간: `HH:mm` (24시간제, 하루 끝은 `24:00` 허용)
- 날짜: `YYYY-MM-DD`
- 일시: ISO 8601, KST 오프셋 포함 (`2026-11-04T23:59:00+09:00`)
- 요일: JS `Date.getDay()` 기준 숫자 — `0=일, 1=월, … 6=토`
- 시간량: 분 단위 정수 (`estimatedMinutes`, `actualMinutes`)
- 에러 응답: `{ "error": "메시지" }` + 적절한 HTTP 상태 코드

## 데이터 구조

### FixedBlock — 고정 일정 (수업·알바·루틴·일정)

스케줄러가 건드리지 않는 시간. `date`가 없으면 `dayOfWeek`마다 반복하고, 있으면 그날 하루만 있다(`scheduler/time.js`의 `occursOn`).

| 필드 | 타입 | 설명 |
|---|---|---|
| `id` | string | |
| `kind` | `'class' \| 'job' \| 'fixed' \| 'routine' \| 'event'` | 수업 / 알바 / 기타 고정 일정 / 루틴 / 일정 |
| `title` | string | 예: "자료구조" |
| `location` | string? | |
| `dayOfWeek` | number[] | 반복 요일 (0=일 … 6=토). `date`가 있으면 그날의 요일 |
| `date` | `YYYY-MM-DD`? | 하루만 있는 일정의 날짜 |
| `start` | `HH:mm` | |
| `end` | `HH:mm` | |
| `openEnd` | boolean? | 끝 시간을 정하지 않은 일정. `end`에는 그날 다음 고정 일정 시작(없으면 23:59)을 저장 |
| `memo` | string? | 메모 (1000자 이하). 없으면 생략하며, 값이 있으면 타임라인 항목에도 그대로 실린다 |

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
| `memo` | string? | 메모 (1000자 이하, 앞뒤 공백 제거, 비면 저장 안 함) |
| `estimatedMinutes` | number | 보정 후 총 추정시간 |
| `baseEstimatedMinutes` | number? | 원본 추정시간 |
| `actualMinutes` | number? | 누적 수행시간 |
| `progress` | number | 0 ~ 1 |
| `status` | `'todo' \| 'in_progress' \| 'done'` | |
| `memo` | string? | 메모 (1000자 이하). 없으면 생략 |
| `reminders` | object[]? | 알림 목록(최대 4개). 항목은 `{ mode: 'beforeDeadline', minutes: 1440\|60\|30 }`(종류별 하나) 또는 `{ mode: 'at', at: ISO datetime }`(하나). 없으면 알림 없음 |
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
{ "user": { "settings": {} }, "fixedBlocks": [], "tasks": [], "scheduledBlocks": [], "history": [], "voiceCommands": [], "schedulerRequests": [] }
```

`user.settings`: `dayStart`, `dayEnd`, `minSlotMinutes`, `maxBlockMinutes`, `breakMinutes`

## API 목록

| 상태 | 메서드 | 경로 | 설명 |
|---|---|---|---|
| ✅ | GET | `/api/health` | 헬스체크 |
| ✅ | GET | `/api/tasks` | 작업 목록 |
| ✅ | POST | `/api/chat/interpret` | 음성 해석·작업 저장·배치 요청 (requestId 필수) |
| ✅ | POST | `/api/chat/scheduler/dispatch` | 대기 배치 요청 전달 |
| ✅ | GET | `/api/schedule/today` | 오늘 타임라인 조회 |
| ✅ | GET | `/api/schedule/week` | 주간 타임라인 조회 |
| ✅ | POST | `/api/tasks` | 작업 등록·AI 입력 준비 |
| ✅ | POST | `/api/tasks/:id/reviews` | 복습 등록 |
| ✅ | PATCH | `/api/tasks/:id/progress` | 진행 보고·AI 입력 준비 |
| ✅ | POST | `/api/schedule/reschedule` | AI 배치 입력 준비 |
| ✅ | GET | `/api/schedule/context` | 준비 입력·대기 상태 조회 |
| ✅ | POST | `/api/schedule/apply` | AI 결과 검증·적용 |
| ✅ | GET | `/api/fixed-blocks` | 고정 일정 전체 목록 |
| ✅ | POST | `/api/fixed-blocks` | 일정·루틴·알바·수업 등록 후 AI 재배치 |
| ✅ | DELETE | `/api/fixed-blocks/:id` | 일정·루틴·알바 삭제 후 AI 재배치 (수업은 409) |

### POST /api/fixed-blocks — 일정·루틴 등록

요청: `{ kind: 'event' | 'routine' | 'fixed' | 'job' | 'class', title, start, end, date?, dayOfWeek?, location?, openEnd?, memo? }`.
수업(`class`)은 요일 반복만 가능하고, 시간표 저장과 같은 규칙으로 다른 반복 일정과 겹치면 409이다. 저장 시 `source: 'manual'`을 붙인다.
`date`를 주면 그날 하루만, 아니면 `dayOfWeek`(필수)마다 반복한다. 자정을 넘기는 일정(`start >= end`)은 400이다.
저장 직후 `planner(db, { reason: 'manual' })`로 다시 배치해 겹치는 작업을 옮긴다. 배치가 실패해도 일정은 저장한다.

응답 201: `{ block, rescheduled: true, unplaced }` 또는 배치 실패 시 `{ block, rescheduled: false, rescheduleError }`.
`DELETE /api/fixed-blocks/:id`도 같은 모양으로 200을 돌려준다.

### POST /api/chat/interpret — 음성 텍스트 해석

최신 명세는 [voice-backend.md](voice-backend.md)를 따른다. 기본 상태는 스케줄러 미연결로 배치 대기를 반환한다.

```jsonc
// req
{ "requestId": "voice-001", "text": "헤이 제이, 11월 4일까지 운영체제 과제 있어" }
// res
{
  "intent": "add_task",          // add_task | report_progress | query_schedule | reschedule | smalltalk
  "status": "pending_schedule",
  "reply": "저장했어요. 스케줄러 배치 요청은 대기 중이에요.",
  "result": { }                   // 의도별 처리 결과 (생성된 Task, 바뀐 블록 등)
}
```

한 발화에 과제가 여러 개면(최대 10개) `add_task` 하나로 처리한다. 의도 해석 결과는 첫 과제를 `slots`, 두 번째부터를 `extraTasks`(같은 필드)에 담는다. 응답 `result.task`는 첫 저장 과제이고, 둘 이상 저장하거나 이미 등록된 과제를 건너뛴 경우 `result.tasks`(저장한 과제)와 `result.duplicates`(이미 있던 과제)가 추가된다. 일부 과제의 마감이 없으면 아무것도 저장하지 않고 `needs_clarification`으로 해당 과제만 묻는다. 전체 재배치 요청은 한 번만 보낸다.

예상 시간을 말하지 않았고(`baseEstimatedMinutes`=null) 제이의 추정도 요청하지 않은(`estimateByAi`=false) 과제가 있으면 아무것도 저장하지 않고 `needs_clarification`으로 해당 과제들의 시간을 한 번에 묻는다. 사용자가 시간을 알려 주거나 "제이가 정해줘"라고 하면(`estimateByAi`=true) 저장한다. `estimateByAi`는 `slots`와 `extraTasks` 각 항목에 들어간다.

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
{ "task": { }, "rescheduled": false, "changes": [ ] }
```

### POST /api/schedule/reschedule — 재스케줄링

```jsonc
// req
{ "reason": "missed" }           // new_task | missed | progress | manual
// res
{ "rescheduled": false, "schedulingStatus": "awaiting_ai", "planningContext": {}, "scheduledBlocks": [], "changes": [], "unplaced": [] }
```


## AI 자동배치 지원으로 역할 변경 (2026-10-30)

스케줄러는 이제 실제 배치 시각을 생성하지 않는다. 우선순위·남은 작업량·빈 시간·제약을 AI에 전달하고, AI 결과를 검증하여 적용한다. 이전 규칙 기반 allocator 배치 명세는 더 이상 적용하지 않는다.

상세 입력·출력·검증·재시도 규약: [AI 자동배치 규약](ai-scheduling.md).

- POST /api/schedule/reschedule: 입력 준비 및 저장. rescheduled=false, schedulingStatus=awaiting_ai, planningContext를 반환한다.
- GET /api/schedule/context: 최근 입력과 대기/적용 상태, stale 여부를 조회한다.
- POST /api/schedule/apply: {contextId,blocks}를 검증하고 저장한다. 이 단계에서만 rescheduled=true가 된다.
- 과제 등록·진행 보고·복습 등록도 입력 준비까지만 실행한다. 준비 단계의 unplaced=[]는 배치 성공을 의미하지 않는다.
- 개인 보정, 완료 기록, 복습 Task 생성, 조회, JSON 저장 기능은 유지한다.

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
- 성공은 201과 { task, reviewTasks, rescheduled: false, scheduledBlocks, changes, unplaced }이다. 과제 추가와 AI 입력을 하나의 updateDb에서 저장하며 실패 시 둘 다 저장하지 않는다. 과거 마감도 AI 입력에 포함되며, 미배치량은 AI 결과 적용 때 계산한다.
- 시험(type=exam)에 review:true 또는 review:{daysBefore:[7,3,1],minutes:30}을 추가하면 복습 작업을 함께 생성한다. 생략/false이면 생성하지 않는다. 시험 외 유형에 review를 요청하면 400이다.
- 복습 작업은 입력한 분량을 그대로 쓰며 개인 보정을 다시 적용하지 않는다. 복습은 원본 시험 작업량 외에 추가되는 시간이다.

### POST /api/tasks/:id/reviews — 기존 시험의 복습 등록

- JSON 본문은 {}(기본값) 또는 {daysBefore:[3,1],minutes:30}이다. 간격은 1~365일의 정수, 최대 30개이며 중복 간격은 하나로 처리한다. 복습시간은 1~1440분이다.
- 200과 {task,reviewTasks,rescheduled:false,scheduledBlocks,changes,unplaced}를 반환한다. 없는 작업은 404, 시험이 아니면 400이다.
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
- 특정 수행 기록을 표시하려면 blockId와 blockStatus(done|missed)를 함께 보낸다. 아직 시작하지 않은 블록도 done(미리 완료)은 받고, missed는 400이다. 블록 상태 보고만으로 Task.progress를 추측하지 않는다.
- 예정 종료 전에 done으로 보고한 블록에는 completedAt(KST)을 남긴다. 다음 재배치에서 시작 전에 끝낸 블록은 지우고, 진행 중에 끝낸 블록은 end를 완료 시각까지로 줄이며 원래 종료는 plannedEnd에 둔다. 비워진 시간은 다시 배치할 수 있다.
- reschedule:false(boolean)를 보내면 기록만 저장하고 재배치하지 않는다. 응답은 {task,historyRecorded,rescheduled:false,deferred:true,scheduledBlocks,changes,unplaced:[]}이다. 홈은 체크 후 10초 동안 더 체크가 없으면 POST /api/schedule/reschedule {reason:'progress'}를 한 번 보낸다.
- 작업 또는 하위작업이 완료되면 이미 시작한 해당 planned 블록을 done으로 바꾸고 미래 예정은 재배치 시 제거한다. 이미 done/missed인 이력은 유지한다. 진행 중 블록을 조기 완료해도 기록의 원래 종료 시각은 보존한다.
- 성공은 200과 {task,historyRecorded,rescheduled:false,scheduledBlocks,changes,unplaced}이다. 변경 내역에는 수행 상태 갱신도 포함한다.
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

POST /api/schedule/reschedule은 {reason:new_task|missed|progress|manual,horizonDays?:1~31}로 AI 배치 입력을 준비한다. 기본 범위는 14일이며 기존 일정과 planningContext를 반환한다. 잘못된 요청은 400, 읽기/계산/저장 오류는 500이다. 설명은 ?explain=true로 추가한다.


### 미수행 자동 확인

- backend/src/index.js로 서버를 실행하면 60초 간격으로 확인한다. 첫 확인은 서버 시작 60초 후이다. LLM 호출이나 별도 HTTP 호출 없이 저장소와 스케줄러를 사용한다.
- 미수행 후보가 없으면 저장하지 않는다. 후보가 있으면 DB 갱신 차례에 다시 확인하여 missed 상태와 AI 배치 입력을 저장한다. 실제 시각을 배치하지 않는다. 중복 실행은 하나로 합친다.
- 오류는 서버 로그에 기록하고 다음 확인에서 다시 시도한다. 서버 종료 시 감시를 중지한다. 서버가 실행되지 않는 동안에는 확인하지 않는다.
- AUTO_RESCHEDULE_ENABLED=false로 주기 확인을 끌 수 있다. 값이 없으면 켜진다. 라우터/테스트 모듈 import만으로는 주기 작업을 시작하지 않는다.
- 단일 서버 프로세스용이다. 같은 JSON 파일을 사용하는 서버를 여러 개 실행하는 운영 방식은 지원하지 않는다.

LLM의 자연어 해석·실제 모델 호출과 프런트엔드 화면 연결은 팀원 담당으로 남겨둔다. 고정 일정 CRUD, 작업 수정/삭제, 시험 날짜 변경 API도 이번 연결 범위에 포함하지 않는다.


DB에는 선택적 aiScheduling 상태를 저장한다. AI가 만든 ScheduledBlock은 source=ai와 선택적 placementReason을 포함한다. 기존 필드 이름은 유지하며, 조회 타임라인의 source=fixed/scheduled와 충돌하지 않도록 placementSource=ai를 별도로 반환한다.

### 작업·하위작업 편집 (2026-10-30)

배치는 AI가 정하므로 아래 호출은 데이터만 바꾸고 재배치를 요청하지 않는다. 하위작업이 바뀌면 `baseEstimatedMinutes`는 하위작업 합계로 다시 계산한다.

| 메서드·경로 | 본문 | 설명 |
|---|---|---|
| `PATCH /api/tasks/:id` | `title`, `deadline`, `importance`, `reminders`(빈 배열이면 해제), `memo`(빈 문자열이면 삭제) 중 일부 | 상위 작업 수정. 다른 필드는 400 |
| `DELETE /api/tasks/:id` | — | 상위 작업과 그 배치 블록, 딸린 복습 작업을 삭제. 수행 기록(history)은 보존 |
| `POST /api/tasks/:id/subtasks` | `{ title, estimatedMinutes }` | 하위작업 추가 (201) |
| `PATCH /api/tasks/:id/subtasks/:subtaskId` | `title`, `estimatedMinutes` 중 일부 | 하위작업 수정 |
| `DELETE /api/tasks/:id/subtasks/:subtaskId` | — | 하위작업과 그 하위작업에 배치된 블록 삭제 |

### 고정 일정 수정 (2026-10-30)

| 메서드·경로 | 본문 | 설명 |
|---|---|---|
| `PATCH /api/schedule/fixed/:id` | `title`, `location`, `start`, `end`, `dayOfWeek`, `memo` 중 일부 | 수업·알바·루틴 수정. 반복 원본을 바꾸므로 모든 반복에 적용. 다른 고정 일정과 겹치면 409. 재배치는 요청하지 않음. 빈 `memo`는 메모 삭제 |

`GET /api/schedule/week·today`의 고정 일정 항목에는 `dayOfWeek`와 `memo`(있을 때)가 함께 내려간다. 매일 쉬고 싶은 시간(`settings.restPeriods`)은 `source: 'rest'`, `kind: 'break'` 항목으로 내려가며 이 API로 수정하지 않는다(마이 설정에서 수정).

### 작업 블록 미루기 (2026-10-30)

| 메서드·경로 | 본문 | 설명 |
|---|---|---|
| `POST /api/schedule/blocks/postpone` | `{ blockIds: string[], date: 'YYYY-MM-DD', start: 'HH:mm' }` | 같은 작업의 배치 블록을 사용자가 고른 시각부터 같은 길이·간격으로 옮김. 이동한 블록은 `postponed: true`, `status: 'planned'`. 과거 시각, 완료 블록, 마감 초과, 고정 일정·수면·휴식 또는 다른 작업과 겹침(작업 사이 휴식 포함)은 400/409 |

### 생활 설정 저장과 AI 재배치 결과

- PATCH /api/user/settings는 {settings: {...변경 필드}, confirmReschedule: true}를 받는다.
- 확인 누락은 409, 입력 오류는 400이며 저장하지 않는다. 파일 저장 실패도 오류 응답을 반환한다.
- 유효한 설정은 AI 재배치 실패와 관계없이 저장한다. AI 실패 시 기존 일정·작업·완료 이력을 유지하고 이전 aiScheduling은 null로 무효화한다.
- HTTP 200 응답에 settingsSaved: true, schedulingStatus(applied / awaiting_ai / failed), changes, unplaced를 포함한다.
- failed는 schedulingError 안내를 포함한다. 이때 changes와 unplaced는 빈 배열이며 배치 성공이나 잔량 없음을 의미하지 않는다.
- 재배치 재시도는 POST /api/schedule/reschedule의 reason: manual을 사용한다. 설정 저장 응답은 AI 시도 완료까지 기다릴 수 있다.
- 분석 API의 capabilities.settingsWrite는 true이다. correction: true는 작업 속도 분석 제공을 뜻한다. 새 작업 등록 시 개인 보정 계산도 사용한다.

- PATCH /api/user/settings에 restPeriods가 포함되면 매일 반복 휴식과 최신 fixedBlocks를 비교한다. 수업·알바·루틴과 겹치면 일정명·시간 및 다른 시간 선택 안내를 담은 {error}와 HTTP 409를 반환한다. 설정 저장이나 AI 재배치 전에 검사하며, 자정 초과는 나누어 검사하고 경계가 맞닿는 것은 허용한다.


### 분석 API의 작업 속도

GET /api/analytics/week와 /month의 patterns[]에 유형별 estimatedMinutes, actualMinutes,
correctionFactor(실제 합계 / 예상 합계), differencePercent(비율 차이 %, 정수 반올림)를 추가한다.
선택한 기간의 중복 제거된 전체 작업 완료 이력 중 두 시간이 모두 양의 정수인 기록만 사용한다.
기존 estimator.computeCorrectionFactors를 재사용하며, 개별 기록 비율의 단순 평균을 내지 않는다.
유효 기록이 없으면 validActualRecords와 두 합계는 0, correctionFactor/differencePercent는 null이다.
차이가 양수면 예상보다 오래, 음수면 적게 걸린 것이다. 0%는 반올림 기준 거의 비슷한 경우다.
이 API는 조회 전용이며 DB나 새 작업 보정 방식을 변경하지 않는다. 신규 작업 보정은 전체 이력 기준이므로 선택 기간의 표시값과 다를 수 있다.


### 작업 유형별 마감 작업 완료 현황

분석 API patterns[]의 dueCompletedTasks는 선택 기간에 마감하는 완료 작업 수,
incompleteTasks는 선택 기간에 마감하는 status가 done이 아닌 작업 수다.
작업 ID 중복을 제거한 뒤 집계하며, 같은 작업에 여러 missed 블록이 있어도 작업 수는 늘지 않는다.
이 두 필드의 유형별 합은 dueTasks.completed와 dueTasks.total - dueTasks.completed에 각각 일치한다.
기존 completedTasks(기간 내 완료 이력 수)와 missedBlocks는 유지한다. 작업 속도 계산도 완료 이력 기준을 유지한다.

## Web Push·알림 복귀 (2026-10-31)

- `db.pushSubscriptions`: `[{ endpoint, keys: { p256dh, auth } }]` — 푸시 구독 목록(endpoint 중복 없음).
- `GET /api/push/key` → `{ enabled, publicKey }` (VAPID 키 미설정이면 `enabled:false`)
- `POST /api/push/subscribe` — body: 브라우저 `PushSubscription.toJSON()`
- `DELETE /api/push/subscribe` — body: `{ endpoint }`
- `POST /api/push/test` — 구독된 기기로 알림 발송 `{ sent }`
- 알림 payload: `{ title, body, url }`. 클릭하면 서비스워커가 `url`(기본 `/chat?source=notification`)을 연다.
- 환경변수(백엔드): `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`

### 배치 뒤로 미루기 (채팅 등록)

`/api/chat/interpret`는 `add_task`·`update_task`를 저장한 뒤 AI 일정 배치를 기다리지 않고 바로 응답한다(`status: pending_schedule`, `schedulingInBackground: true`). 배치는 서버가 뒤에서 한 번에 하나씩 실행하며, 저장소 잠금을 쥐지 않고 사본으로 계획한 뒤 그동안 작업·고정 일정·설정·블록이 바뀌지 않았을 때만 반영한다(바뀌었으면 결과를 버리고 최대 3번 다시 계산). 실패해도 과제는 저장돼 있고 배치 요청은 대기로 남는다.

- `GET /api/chat/scheduler/status` → `{ running, error, pending }`
- `POST /api/chat/scheduler/run` → `{ started }` 배치 재시도

`POST /api/tasks`(직접 작업 추가)도 같은 방식이다. 저장 후 `201`과 함께 `schedulingInBackground: true`, `rescheduled: false`를 돌려주고, 배치는 채팅 등록과 공유하는 담당이 뒤에서 처리한다. 진행 상태는 `GET /api/chat/scheduler/status`로 확인한다.
