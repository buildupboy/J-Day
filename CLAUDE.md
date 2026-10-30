# CLAUDE.md

## 프로젝트 개요

J-Day(제이데이)는 24시간 해커톤(DONG-A HACKATHON 2026)용 음성 중심 AI 일정 비서다. AI 비서 이름은 **제이**, 호출어는 **"헤이 제이"**.
사용자가 말로 과제·일정을 등록하면 AI가 작업량을 추정하고, 시간표·알바·루틴 같은 고정 일정 사이 빈 시간에 작업을 배치하며, 미완료·새 작업이 생기면 재배치한다. 1차 타깃은 대학생.

자세한 기획은 [docs/planning.md](docs/planning.md), 데이터 구조와 API는 [docs/api.md](docs/api.md).

## 스택

- JavaScript (ES Modules) 전용 — TypeScript 쓰지 않음
- frontend: React + Vite (5173), `/api` 요청은 vite 프록시로 백엔드에 전달
- backend: Node.js + Express (3001), dotenv, cors
- 저장: JSON 파일 (`backend/data/db.json`, git에 올리지 않음 / `seed.json`으로 초기화)
- 음성: 브라우저 Web Speech API, `ko-KR`, 크롬 기준
- LLM: 제공자 미정, `backend/src/services/llm.js`의 함수만 통해서 호출

## 실행

```bash
npm run install:all
npm run dev
```

## 폴더별 역할

| 경로 | 역할 |
|---|---|
| `frontend/src/components/timeline` | 오늘 타임라인 UI |
| `frontend/src/components/chat` | 제이 대화창 UI |
| `frontend/src/components/common` | 공용 UI (MicButton 등) |
| `frontend/src/hooks` | 음성 인식·합성 훅 |
| `frontend/src/api/client.js` | 백엔드 호출은 전부 여기를 거친다 |
| `frontend/src/utils` | 시간 계산 등 순수 함수 |
| `backend/src/routes` | HTTP 핸들러. 얇게 유지하고 로직은 services/scheduler로 |
| `backend/src/services/llm.js` | LLM 공통 인터페이스 (`complete`, `interpretUtterance`, `breakdownTask`) |
| `backend/src/prompts` | LLM 프롬프트 문자열 |
| `backend/src/scheduler` | `estimator`(개인 보정 계수), `allocator`(빈 시간 배치), `rescheduler`(재배치) — 규칙 기반 순수 함수 |
| `backend/src/store` | `readDb`/`writeDb`/`updateDb`. 파일 접근은 여기서만 |
| `backend/data/seed.json` | 시연용 대학생 예시 데이터 |

## 코딩 규칙

- **LLM은 이해·추정만 한다.** 발화 해석, 하위작업 분해, 소요시간 추정, 응답 문장 생성까지.
  **시간 배치는 규칙 기반 스케줄러(`backend/src/scheduler`)가 담당**한다. LLM에게 시간표를 짜게 하지 않는다.
- **API 키는 백엔드에서만** `process.env`로 읽는다. 프론트엔드 코드, `VITE_` 환경변수, 커밋에 절대 넣지 않는다.
- 스케줄러 함수는 DB·네트워크에 의존하지 않는 순수 함수로 작성해 테스트하기 쉽게 한다.
- 데이터 구조를 바꾸면 `docs/api.md`와 `seed.json`을 같이 고친다.
- 한국어 주석 허용.
- 기능은 작게 나눠 커밋한다. 커밋 메시지는 `feat|fix|chore|docs|style: 내용`.
- `main`은 항상 시연 가능해야 한다. 기능은 `feat/*` 브랜치에서 작업한다.
