# AI 자동 배치

실행 서버(index.js)는 모든 배치 경로에 planSchedule을 주입합니다. 기존 allocator는 회귀 테스트와 명시적 의존성 주입을 위한 코드로 남아 있으며 실행 서버의 배치에는 사용하지 않습니다. AI가 실패하면 기존 코드 배치로 대체하지 않습니다.

흐름: 작업/진행/수동 재배치/미수행/시간표/설정 변경 → 순위·잔량 JSON → AI 배치 → 서버 검증 → 오류 시 1회 교정 → 원자적 저장. 교정도 실패하면 502와 함께 변경 전 데이터를 유지합니다. 외부 AI 요청도 저장소 갱신 큐 안에서 수행하여 그 사이 작업이 유실되지 않게 합니다. 따라서 AI 대기 중 다른 갱신/조회도 기다릴 수 있습니다.

프롬프트: backend/src/prompts/planning.js
구현 및 검증: backend/src/services/ai-planner.js

## 설정 JSON

GET /api/schedule/settings 조회, PUT /api/schedule/settings 부분 변경 및 AI 재배치. 프론트 함수 api.getScheduleSettings / api.saveScheduleSettings 제공. 기존 마이 화면은 설정 값을 편집하는 화면이 아니므로 이 API와 연결해 사용합니다.

```json
{
  "dayStart": "09:00",
  "dayEnd": "23:00",
  "minSlotMinutes": 30,
  "maxBlockMinutes": 90,
  "maxDailyMinutes": 300,
  "breakMinutes": 10,
  "dailyRestMinutes": 60,
  "travelMinutes": 20,
  "distribution": "balanced",
  "restWindows": [
    { "dayOfWeek": [1, 2, 3, 4, 5], "start": "12:00", "end": "13:00" },
    { "date": "2026-10-31", "start": "18:00", "end": "19:00" }
  ]
}
```

- breakMinutes: 매 업무 블록 이후 확보하는 휴식. 작업 등록 JSON의 breakAfterMinutes로 해당 작업만 재정의할 수 있습니다.
- dailyRestMinutes: 업무 후 휴식·고정 약속·이동·고정 휴식을 제외하고 하루 활동 가능 시간에 추가로 비워 두는 여유시간. 미설정 시 기존 bufferMinutes를 사용합니다. 오늘은 현재 시각 이후 기준입니다.
- travelMinutes: 고정 일정 종료 후 이동시간. 시간표 수업 JSON의 travelMinutes로 수업별 재정의 가능합니다. 미설정은 0이며 AI가 임의로 추정하지 않습니다.
- restWindows: 특정 날짜 또는 요일에 지켜야 할 고정 휴식.
- 작업량은 보정된 estimatedMinutes에서 진행률·완료 하위작업·진행 중 예약분을 일관되게 차감합니다. 모델이 임의로 예상시간을 바꾸지 못합니다.
- 완료·과거·진행 중 블록은 보존하고 미래 예정만 바꿉니다. 하위작업 순서·마감·일일 한도·최대 연속작업·고정 약속·이동·휴식·잔량 보존을 검사합니다.
- AI 응답 planning.summary와 각 블록 reason은 조정 근거입니다. unplaced의 remainingMinutes는 서버 계산값입니다.
- 기존 OPENAI_API_KEY, OPENAI_MODEL, LLM_TIMEOUT_MS를 사용합니다. 장기 계획은 최대 366일, 응답은 최대 2000개 블록입니다. 긴 계획은 시간 초과/토큰 한도 때문에 실패할 수 있습니다.

## 검증

테스트는 고정 AI 응답을 주입하여 충돌, 이동, 업무 후 휴식, 하루 여유, 마감, 선행 순서, 미배치 잔량, 재시도, 원본 보존을 검증합니다. 실제 모델의 계획 품질은 설정한 모델과 입력에 따라 달라지며 자동 테스트는 실제 API를 호출하지 않습니다.
