# AI 배치 구현 안내

팀 공통 JSON은 docs/ai-scheduling.md, 병합 후 실제 모델 연결과 다음 병합 참고는 docs/merge-devleop3.md를 참조하세요.

기존 priorities/units/restWindows/reason/summary 규약은 devleop3 통합에서 제거했습니다. rankedTasks/subtasks/restPeriods/placementReason 및 contextId를 사용합니다. 설정 API는 /api/user/settings로 통일했습니다.

프롬프트: backend/src/prompts/planning.js
실제 모델 호출: backend/src/services/ai-planner.js
공식 입력: backend/src/scheduler/planning-context.js
공식 출력: backend/src/scheduler/ai-plan-schema.js
공식 검증: backend/src/scheduler/ai-plan.js
공통 점유 구간: backend/src/scheduler/blocked-windows.js

기존 OPENAI_API_KEY, OPENAI_MODEL, LLM_TIMEOUT_MS 환경설정을 사용하며 키를 프론트나 JSON 저장소에 전달하지 않습니다. 계획 범위는 팀 규약에 따라 기본 14일, 최대 31일이고 AI 출력은 최대 1000개 블록입니다.
