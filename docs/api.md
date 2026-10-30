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
