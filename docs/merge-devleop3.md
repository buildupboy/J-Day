# devleop3 통합 및 다음 백엔드 병합 참고

## 유지하는 팀 공통 계약

- 우선순위/잔량/제약 입력은 scheduler/planning-context.js가 생성합니다.
- ID는 contextId, rankedTasks[].taskId, subtasks[].subtaskId를 사용합니다.
- 실제 AI 결과는 scheduler/ai-plan-schema.js의 AI_PLAN_SCHEMA를 사용합니다.
- 결과는 {contextId, blocks:[{taskId,subtaskId,date,start,end,placementReason}]}입니다.
- acceptAiPlan이 contextId/sourceRevision/현재 적용 시각/시간 충돌/잔량/선행 순서를 검사합니다.
- 상태는 awaiting_ai → applied이며 적용 성공 이후에만 대기 요청을 processed로 바꿉니다.
- 사용자 설정 API는 GET/PATCH /api/user/settings입니다. PATCH는 {settings:{...},confirmReschedule:true}를 받습니다.
- sleep, restPeriods, preferredPeriod, breakMinutes, bufferMinutes를 상대 명칭 그대로 사용합니다.
- 이동 기본 설정 travelMinutes와 고정 일정의 travelMinutes, 작업의 breakAfterMinutes를 추가 지원합니다. 이동/여유 시간은 API 필드이며 이번 병합에서 설정 화면의 추가 입력 UI는 만들지 않았습니다.

## 실제 모델 연결

backend/src/services/ai-planner.js만 실제 모델 호출과 교정 재시도를 담당합니다. 이 함수는 prepare 역할의 reschedule과 공식 acceptAiPlan을 연결하며 시간을 직접 채우지 않습니다.

실행 서버 index.js는 작업·진행 보고·음성·수동 재배치·미수행·사용자 설정 경로에 planSchedule을 주입합니다. 시간표 저장도 같은 함수를 사용합니다. 순수 지원 코드와 테스트의 기본 주입값 reschedule은 계속 AI 입력 준비까지만 실행합니다.

AI 완료 후 clock()으로 실제 시각을 다시 검사합니다. 409이면 입력을 다시 준비하고, 그 외 검증 실패는 같은 문맥에 오류/현재 시각을 전달해 한 번 교정합니다. 잔량이 남은 유효 계획도 한 번 재검토하며 우선순위별 미배치량이 더 적은 유효 계획을 선택합니다. 재검토 실패 시 최초 유효 계획을 현재 시각으로 재검증합니다. 유효 계획이 전혀 없으면 원자적 저장을 취소하여 기존 데이터를 유지합니다. AI 호출을 저장소 갱신 큐 안에서 실행하므로 요청 중 다른 쓰기가 유실되지는 않지만 조회/갱신이 AI 응답을 기다릴 수 있습니다.

## 통합하면서 보완한 부분

- blocked-windows.js를 추가하여 수면/지정 휴식/고정 일정/종료 후 이동을 빈 시간 계산과 결과 검증이 함께 사용하도록 했습니다.
- 날짜 경계를 넘는 이동과 작업 사이 휴식을 검사합니다.
- 사용자 설정 저장은 비동기 scheduler를 기다리고 pending 문맥 또는 applied 상태를 함께 보관합니다.
- task-service와 monitor가 AI 적용 완료 상태를 pending으로 덮어쓰지 않게 했습니다.
- timeline의 source=fixed/scheduled를 유지하며 AI 출처는 placementSource로 분리합니다.
- 기존 제이 중복 일정 변경 질문/수정과 캘린더 휴지통을 유지했습니다. 휴지통은 선택한 날짜의 표시를 숨기며 원본 작업을 제거하지 않습니다.
- 기존 별도 /schedule/settings API는 통일 과정에서 제거했습니다.

## 다음 병합에서 확인할 파일

- index.js: createTasksRouter/createScheduleRouter/createUserSettingsRouter/monitor 및 음성 progressReporter의 AI 주입 유지.
- scheduler/planning-context.js, ai-plan.js, ai-plan-schema.js: JSON 키와 contextId/revision 계약 유지.
- scheduler/blocked-windows.js 및 allocator.js: 수면/휴식/이동 공통 처리 유지. allocate는 비활성 상태 유지.
- services/ai-planner.js: 실제 모델 호출/재시도/적용 상태 유지.
- routes/user-settings.js: 비동기 scheduler 및 aiScheduling 저장 유지.
- services/task-service.js, scheduler-gateway.js, voice-command-service.js: async/await와 적용 전후 큐 상태 유지.
- routes/schedule.js와 timeline.js: context/apply 경로, 삭제 경로, 표시 출처 및 삭제 필터 유지.

## 검증

npm test --prefix backend, npm run build --prefix frontend를 사용합니다. 실제 AI 검증은 별도 메모리 데이터로 수행하며 사용자 DB에는 저장하지 않습니다.

## 로컬 Git

병합 직전 작업은 커밋 d70293a와 backup/pre-devleop3-integration-20261030 브랜치로 보존했습니다. 중첩 haru-biseo/ 폴더는 병합에 포함하지 않았습니다. 원격 push는 별도 요청 전까지 하지 않습니다.
