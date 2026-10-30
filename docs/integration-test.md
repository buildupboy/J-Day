# 로컬 통합 테스트

브랜치: `test/voice-ui-integration`. main과 원격에는 반영하지 않았다.

## 통합한 작업

- `feat/voice-backend`: 로컬 작업을 6b9e3c9로 보존.
- `origin/feature/Schedule`: f61d302, 홈·캘린더·음성·작업 입력 화면.
- `origin/feat/auto-reschedule`: f76d4d4, 기존 스케줄러·작업·일정 API.
- `feature/My`는 별도 기능 브랜치이므로 이번 테스트에는 포함하지 않았다.
- 중첩된 `haru-biseo/haru-biseo` 저장소와 상위 donga_HACKA 저장소는 변경하지 않았다.

## 연결 변경

- 음성 API에 requestId와 최근 대화 전달. 실패 시 mockInterpret로 성공을 가장하지 않고 실제 오류·재시도 표시.
- 음성 API가 이미 등록한 작업을 카드 버튼으로 다시 등록하지 않음.
- ISO 마감·원본 예상시간·중요도를 실제 작업 API 규약으로 변환.
- 작업 등록 후 서버 타임라인 재조회. 홈·주간·월간 캘린더에서 샘플 블록 대신 서버 데이터 사용.
- 음성 진행 보고는 친구의 reportProgress 서비스에 전달해 진행 중 블록 상태/완료 기록을 일관되게 처리.
- 프론트의 고정 개인계수를 제거해 백엔드 개인 보정과 중복되지 않도록 함.
- 직접 입력 화면의 시간 추천과 파일 첨부는 여전히 기본 예시 기능임을 표시. 음성 경로의 추정은 실제 LLM 호출.
- 스케줄러 내부 파일은 원격 브랜치와 동일하며 수정하지 않음.

## 확인 결과

- 백엔드 77개 테스트 통과. 신규 통합 테스트는 모델 호출 응답만 주입하고 실제 JSON 파일·친구의 스케줄러·일정 HTTP 조회를 사용.
- 프론트 프로덕션 빌드 통과.
- 브라우저: 작업 입력 → 저장·배치 완료 → 캘린더 실제 블록 표시 → 새로고침 후 홈에도 유지 확인.
- 키 누락 상태의 음성/텍스트 요청은 설정 오류와 재시도 버튼 표시. 임시 성공 응답으로 바꾸지 않음.
- 외부 LLM 키/모델과 실제 마이크 음성 해석 정확도는 아직 검증하지 못함.

## 현재 실행 환경

- 화면: http://localhost:5173
- 백엔드: http://localhost:3001
- 테스트 DB: `/Users/mac/Documents/Codex/2026-10-30/pdf-9-10/work/integration-data/db.json`
- 원래 `backend/data/db.json`을 복사해 별도 파일로 테스트했으며 원본은 사용하지 않음.
- `VOICE_SCHEDULER_ENABLED=true`, `AUTO_RESCHEDULE_ENABLED=false`로 실행.
- 개발용 node --watch가 EMFILE로 종료되어 백엔드는 npm start로 실행. 프론트는 Vite 개발 서버.

## 재실행

이미 서버가 실행 중이면 추가 실행하지 않는다. 재시작 전 기존 서버부터 종료한다.
키는 채팅이나 프론트가 아니라 backend/.env에 직접 설정한다.

```bash
cd /Users/mac/Desktop/donga_HACKA/haru-biseo
cp -n backend/.env.example backend/.env
```

backend/.env에 OPENAI_API_KEY, OPENAI_MODEL을 채우고 VOICE_SCHEDULER_ENABLED=true로 설정한다.
표준 npm start는 `backend/data/db.json`을 사용한다. 테스트 파일을 유지하려면 아래처럼 명시한다.

터미널 1:

```bash
cd /Users/mac/Desktop/donga_HACKA/haru-biseo/backend
VOICE_SCHEDULER_ENABLED=true AUTO_RESCHEDULE_ENABLED=false J_DAY_DB_PATH=/Users/mac/Documents/Codex/2026-10-30/pdf-9-10/work/integration-data/db.json npm start
```

터미널 2:

```bash
cd /Users/mac/Desktop/donga_HACKA/haru-biseo
npm run dev:frontend
```

자연어 예시: "11월 4일까지 테스트 보고서 작성해야 해. 두 시간 정도 걸려."
회의·미용실 같은 고정 약속은 현재 음성 등록 범위 밖이다.

화면 세부 메모·첨부·일부 편집 동작에는 기존 프론트의 로컬 상태 기능이 남아 있다. 이번 검증은 작업 등록·음성 API 연결·캘린더 최신화 범위다.
