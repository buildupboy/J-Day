# J-Day (제이데이)

말로 맡기는 AI 일정 비서 | DONG-A HACKATHON 2026

"헤이 제이"라고 부르고 과제나 일정을 말하면, AI 비서 **제이**가 작업량을 추정해 시간표·알바·루틴 사이 빈 시간에 배치하고, 밀리거나 새 일이 생기면 다시 짜 줍니다. 1차 타깃은 대학생입니다.

## AI 자동배치 역할 변경

실제 작업 시각은 AI가 결정한다. 백엔드는 우선순위·잔여량·빈 구간·제약을 준비하고 AI 결과를 검증한다. 현재 모델 배치 호출은 담당 팀원이 연결할 단계이며, 연결 전에는 기존 일정을 보존하고 배치 대기로 응답한다. 계약: [docs/ai-scheduling.md](docs/ai-scheduling.md).

## 기술 스택

- Frontend: React + Vite, Web Speech API (크롬 권장)
- Backend: Node.js + Express
- 저장소: JSON 파일 (`backend/data/db.json`, store 레이어로 분리)
- LLM: OpenAI Chat Completions 구조화 출력 (`backend/src/services/llm.js`, 키·모델 설정 필요)

## 실행 방법

Node.js 20 이상이 필요합니다.

```bash
npm run install:all                     # 루트·backend·frontend 의존성 설치
cp backend/.env.example backend/.env    # 환경변수 (LLM_API_KEY는 받은 뒤 입력)
npm run dev                             # 프론트(5173) + 백엔드(3001) 동시 실행
```

- 화면: http://localhost:5173
- 헬스체크: http://localhost:3001/api/health (프론트에서는 `/api/health`로 프록시)
- 처음 실행하면 `backend/data/seed.json`이 `db.json`으로 복사됩니다. 데이터를 초기화하려면 `db.json`을 지우세요.

## 폴더 구조

음성 해석·저장·스케줄러 전달: [docs/voice-backend.md](docs/voice-backend.md).
스케줄러의 빈 구현을 대체하기 전에는 `VOICE_SCHEDULER_ENABLED=false`를 유지한다.

```
J-Day/
├─ frontend/
│  └─ src/
│     ├─ components/
│     │  ├─ timeline/   오늘 타임라인
│     │  ├─ chat/       제이 대화창
│     │  └─ common/     버튼 등 공용 컴포넌트
│     ├─ hooks/         useSpeechRecognition, useSpeechSynthesis
│     ├─ api/           백엔드 호출 (client.js)
│     ├─ pages/         화면 단위
│     └─ utils/         시간 계산 등
├─ backend/
│  ├─ src/
│  │  ├─ routes/        tasks, schedule, chat 라우터
│  │  ├─ services/      llm.js (LLM 공통 인터페이스)
│  │  ├─ scheduler/     estimator, allocator, rescheduler (규칙 기반)
│  │  ├─ prompts/       LLM 프롬프트
│  │  └─ store/         JSON 파일 읽기·쓰기
│  └─ data/seed.json    예시 데이터 (대학생 1명)
└─ docs/
   ├─ planning.md       기획
   └─ api.md            데이터 구조·API 명세
```

## 브랜치 규칙

- `main`: **항상 시연 가능한 상태** 유지. 직접 push 하지 않고 PR로 머지.
- 기능 작업: `feat/<기능>` (예: `feat/allocator`, `feat/voice-input`)
- 버그 수정: `fix/<내용>`
- 머지 전 `npm run dev`로 화면과 `/api/health`가 뜨는지 확인.

## 커밋 규칙

`<type>: <내용>` 형식, 기능은 작게 나눠 자주 커밋합니다.

| type | 용도 |
|---|---|
| `feat` | 새 기능 |
| `fix` | 버그 수정 |
| `chore` | 설정, 의존성, 빌드 |
| `docs` | 문서 |
| `style` | 포맷·스타일 (동작 변화 없음) |

예: `feat: 빈 시간 계산(findFreeSlots) 구현`

## License

MIT
