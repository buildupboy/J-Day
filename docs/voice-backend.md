# 음성 텍스트 → 작업 저장 → 스케줄러 전달

통합 테스트 브랜치에서는 실제 화면과 친구의 스케줄러를 연결했다. 현재 실행·검증 결과는 [integration-test.md](integration-test.md)를 참고한다.

## 범위

브라우저 Web Speech API가 인식한 한국어 **텍스트**를 받는다. 음성 파일 업로드/STT 서버는 이번 범위가 아니다.
LLM은 의도·기본 작업량만 추출하고 배치 시각을 만들지 않는다. 스케줄러 함수는 구현하거나 수정하지 않았다.
기본 상태에서는 Task와 배치 요청을 db.json에 저장하고 `pending_schedule`을 반환한다.
스케줄러가 연결되기 전에는 scheduledBlocks를 변경하지 않는다.

## 설정

Node.js 20 이상. 프로젝트 루트에서:

```bash
npm run install:all
cp -n backend/.env.example backend/.env
```

backend/.env에 키와 **Chat Completions의 strict JSON Schema를 지원하는 모델**을 설정한다.

```dotenv
OPENAI_API_KEY=발급받은_키
OPENAI_MODEL=사용할_모델_ID
LLM_TIMEOUT_MS=30000
VOICE_SCHEDULER_ENABLED=false
```

키를 frontend 또는 VITE_ 변수에 넣지 않는다. 공식 OpenAI Chat Completions를 호출한다.
설정 후 `npm run dev:backend`로 실행한다. db.json은 최초 저장소 접근 시 seed로 초기화된다.
기존 db.json은 초기화하지 않으며 신규 배열은 첫 변경 때 추가한다.

## POST /api/chat/interpret

```json
{
  "requestId": "voice-20261030-001",
  "text": "11월 4일까지 보고서 끝내야 해. 두 시간 정도 걸려",
  "conversation": []
}
```

- requestId: 필수, 1~100자. 한 사용자 동작마다 새 UUID, 네트워크 재시도에는 같은 ID 사용.
- text: 필수, 1~1000자. 인식이 확정된 텍스트.
- conversation: 선택. 최대 12개 `{role: "user"|"assistant", content: "..."}`.
- 질문에 답할 때는 이전 발화/질문을 conversation에 포함하고 새 requestId를 쓴다.
- 시각과 기존 작업 목록은 서버가 조회한다. 클라이언트가 추출 결과나 now를 지정할 수 없다.

HTTP 200 응답 예시 (주요 필드):

```json
{
  "requestId": "voice-20261030-001",
  "intent": "add_task",
  "status": "pending_schedule",
  "reply": "저장했어요. 스케줄러 배치 요청은 대기 중이에요.",
  "assumptions": ["마감 시각은 23:59로 적용"],
  "result": {
    "task": {
      "id": "서버에서 생성한 ID",
      "title": "보고서",
      "type": "report",
      "deadline": "2026-11-04T23:59:00+09:00",
      "baseEstimatedMinutes": 120,
      "estimatedMinutes": 120,
      "importance": 2,
      "progress": 0,
      "status": "todo",
      "actualMinutes": 0
    },
    "rescheduled": false,
    "estimate": {"baseEstimatedMinutes": 120, "rangeMinutes": [100, 160]}
  },
  "schedulerRequest": {
    "id": "배치 요청 ID",
    "commandId": "voice-20261030-001",
    "taskId": "서버에서 생성한 ID",
    "reason": "new_task",
    "status": "pending",
    "createdAt": "2026-10-30T06:00:00.000Z",
    "processedAt": null
  }
}
```

실제 작업에는 하위작업 배열, 서버 생성 ID, 생성 시각도 포함된다.
보정은 기존 estimator 인터페이스를 호출한다. main의 estimator가 빈 구현이면 1배이며 친구의 구현 연결 후에는 등록 시 한 번 적용된다.
이미 등록된 대기 작업에 나중에 보정을 소급 적용하지 않는다.

| intent | 처리 |
|---|---|
| add_task | 필수값 검증 → 작업 분해·기본시간 추정 → Task 저장 → new_task 요청 |
| report_progress | 기존 작업 검증 → 진행률·누적 실제시간·완료 기록 저장 → progress 요청 |
| reschedule | manual 요청 저장 |
| query_schedule | 해당 날짜의 저장된 fixedBlocks/scheduledBlocks 조회 |
| clarify | 질문 반환, 작업/배치 요청 저장 없음 |
| unsupported | 미지원 안내, 저장 없음 |

내부 actualMinutes는 누적이다. '이번에 30분 더'는 increment로 추출해 최신 값에 한 번 더한다.
'총 두 시간'은 cumulative로 120을 저장한다. 시간 미보고 시 예정시간으로 채우지 않는다.
완료 기록은 `history-<taskId>`로 중복을 막는다. 진행률 하락은 409이다.
개별 블록/하위작업 수행 보고는 이번 음성 경로에서 미지원이다. 친구의 진행 API와 연결 후 확장한다.
고정 약속/반복 일정/마감 변경·삭제는 작업으로 오등록하지 않고 unsupported를 반환한다.

## 스케줄러 담당자 연결

1. 친구의 allocator/estimator/rescheduler 구현을 통합한다. 현재 빈 함수에서 활성화하지 않는다.
2. 규약 `reschedule(db, { now, reason })`를 유지한다.
3. `.env`에서 `VOICE_SCHEDULER_ENABLED=true`로 바꾸고 서버를 재시작한다.
4. 기존 대기 요청을 아래 API로 전달한다. 이후 음성 변경은 저장 트랜잭션 안에서 즉시 전달된다.

```http
POST /api/chat/scheduler/dispatch
Content-Type: application/json

{}
```

gateway는 최신 db의 tasks/fixedBlocks/history/user.settings를 넘긴다.
스케줄러는 `{scheduledBlocks, changes, unplaced}`를 반환한다. DB 저장은 호출자가 담당하므로
스케줄러 안에서 readDb/updateDb를 중첩 호출하지 않는다.
여러 pending 요청은 전체 최신 상태를 한 번 재배치해 처리한다. 처리 후 processed로 바뀌며 반복 전달하지 않는다.
미연결이면 503, pending은 유지한다. 연결된 함수가 실패하면 작업/진행/배치 변경을 부분 저장하지 않는다.
시작된 블록의 수행 상태 판정과 실제 시간 배치는 스케줄러 담당이다.

## 프론트 담당자 연결

현재 api.interpret(text)에는 requestId가 없으므로 아래 형식으로 확장해야 한다.
이번 변경은 백엔드 범위이며 ChatPanel/VoiceScreen 자동 연결은 포함하지 않는다.

```js
const requestId = crypto.randomUUID();
const response = await fetch('/api/chat/interpret', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ text: finalTranscript, requestId, conversation: [] }),
});
const data = await response.json();
if (!response.ok) throw new Error(data.error);
// reply 표시. pending_schedule은 저장됨·배치 대기로 표시.
// scheduled이면 /api/schedule/today 또는 /week를 다시 조회해 캘린더 갱신.
// 네트워크 재시도에는 같은 requestId 사용.
```

## 저장과 오류

- voiceCommands: requestId/hash/처리 시각/응답. 재시작 후에도 동일 요청 중복 방지.
- schedulerRequests: pending/processed 전달 목록. 기존 최상위 필드는 유지.
- 같은 requestId에 다른 text/conversation은 409.
- 질문과 조회는 command에 저장하지 않는다. 대화는 클라이언트가 이어서 전달한다.
- LLM 호출은 파일 갱신 밖에서 수행하고, 저장은 최신 DB에 직렬화·임시 파일 rename으로 반영한다.
- 단일 서버 프로세스 전제다. 다중 서버/외부 편집기의 동시 쓰기는 지원하지 않는다.
- 재시도 응답의 result는 최초 처리 스냅샷이고 schedulerRequest는 최신 상태다. 최신 일정은 조회 API 사용.

400: 잘못된 요청/날짜/시간, 404: 대상 작업 없음, 409: ID 충돌/진행률 하락,
502: AI JSON/시간 합계 불일치/제공자 오류, 503: 설정 누락/사용 한도/스케줄러 미연결, 504: AI timeout.
오류 응답은 `{ "error": "메시지" }`. API 키·제공자 원문 오류는 반환하지 않는다.

```bash
npm test --prefix backend
```

테스트는 임시 JSON·별도 포트·주입된 LLM/스케줄러를 사용한다. 사용자 DB·유료 API를 변경/호출하지 않는다.
실제 해석 정확도는 키·모델 설정 후 시연 발화로 검증해야 한다.
