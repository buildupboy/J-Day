# 미루기(postpone) → 리스케줄링 연결 안내

캘린더에서 사용자가 작업 블록을 **미루기** 하면 서버 데이터가 어떻게 바뀌는지, 스케줄링 쪽에서 무엇을 정해야 하는지 정리한 문서입니다.

## 한 줄 요약

미루기는 **사용자가 시각을 직접 정해서 블록을 옮기는 것**이고, 서버는 옮기기만 합니다. **리스케줄링은 호출하지 않습니다.**
그래서 다음 리스케줄링에서 이 블록이 다시 AI에게 맡겨져 옮겨질 수 있습니다. 이걸 막을지는 스케줄링 쪽에서 정해야 합니다.

## 1. 요청 (프론트 → 서버)

```http
POST /api/schedule/blocks/postpone
Content-Type: application/json

{ "blockIds": ["ai-6571310cc859619a211b-12", "ai-6571310cc859619a211b-13"], "date": "2026-11-02", "start": "17:00" }
```

- `blockIds`: 같은 작업(taskId)의 `scheduledBlocks` id 목록. 캘린더에서 하위작업 블록이 한 덩어리로 보이면 그 조각들이 전부 들어옵니다.
- `date`, `start`: 사용자가 고른 **새 시작 시각**. 맨 앞 블록의 시작이 이 시각이 되고, 나머지는 **블록 사이 간격과 길이를 그대로** 유지한 채 같이 움직입니다.
- 코드: `backend/src/services/postpone.js`, 라우트 `backend/src/routes/schedule.js`

## 2. 데이터가 바뀌는 방식 (`db.scheduledBlocks`)

바뀌는 필드는 4가지뿐입니다.

| 필드 | 변화 |
|---|---|
| `date`, `start`, `end` | 새 날짜·시각으로 교체 (길이는 유지, 날짜가 넘어가면 `date`도 바뀜) |
| `status` | `"planned"`로 설정 (원래 `missed`였어도 `planned`로 되돌아감) |
| `postponed` | `true` 추가 (**새 필드**) |
| `placementReason` | 삭제 (AI가 쓴 배치 이유가 더 이상 맞지 않으므로) |

그 외(`id`, `taskId`, `subtaskId`, `source` 등)와 `tasks`, `fixedBlocks`, `aiScheduling`은 **그대로**입니다.

예: 31일 `09:00–10:30`, `10:40–11:10` 두 블록을 11/2 `17:00`으로 미룬 경우

```diff
 { "id": "…-12", "taskId": "t1", "subtaskId": "s1",
-  "date": "2026-10-31", "start": "09:00", "end": "10:30",
+  "date": "2026-11-02", "start": "17:00", "end": "18:30",
   "status": "planned", "source": "ai",
-  "placementReason": "오전 집중 시간에 …" }
+  "postponed": true }

 { "id": "…-13", "taskId": "t1", "subtaskId": "s2",
-  "date": "2026-10-31", "start": "10:40", "end": "11:10",
+  "date": "2026-11-02", "start": "18:40", "end": "19:10",
   "status": "planned", "source": "ai",
-  "placementReason": "…" }
+  "postponed": true }
```

## 3. 서버가 옮기기 전에 검사하는 것

사용자가 고른 시각은 **자동으로 보정하지 않습니다.** 아래에 걸리면 400/409로 거절하고 데이터는 바꾸지 않습니다.

- 지금 이전 시각
- 이미 완료(`done`)한 블록
- 서로 다른 작업의 블록을 한 번에 요청
- 작업 마감(`deadline`)을 넘기는 경우 / `notBefore`보다 앞서는 경우
- 하루(24:00)를 넘기는 경우
- `blockedWindows`와 겹침 (고정 일정·이동시간·수면·지정 휴식, **고정 일정 앞뒤 `breakMinutes` 포함**)
- 다른 작업 블록과 겹치거나 `breakMinutes`만큼 쉬는 시간이 부족한 경우 (`missed` 블록은 제외)

즉, **미루기가 성공한 시점의 데이터는 `acceptAiPlan`의 검증 조건과 같은 제약을 만족**합니다.

## 4. 스케줄링 쪽에서 지금 일어나는 일 (확인해 주세요)

`planning-context.js`의 `protectedBlocks()`는 `status !== 'planned'`이거나 이미 시작한 블록만 보호합니다.
미룬 블록은 `status: "planned"` + 미래 시각이라 **보호되지 않고 `replaceableBlockIds`에 들어갑니다.**

```
미루기 → (리스케줄링 호출 없음) → 다음 reschedule / AI 계획 요청
        → 미룬 블록이 replaceableBlockIds에 포함
        → AI가 다른 시각으로 다시 배치할 수 있음 → 사용자가 고른 시각이 사라질 수 있음
```

참고로 `schedulingRevision(db)`는 `scheduledBlocks`를 포함하므로, 미루기 직후 기존 `aiScheduling.context`는 `stale: true`로 판정됩니다. 새 컨텍스트가 필요합니다.

## 5. 정해야 할 것 (제안)

**A. (추천) 미룬 블록은 사용자가 고정한 것으로 보호**
- `protectedBlocks()`에 `block.postponed === true`인 미래 블록도 포함
- 그러면 `protectedBlocks`·`blockedWindows`처럼 AI에게 "움직이지 말 것"으로 전달되고, 빈 시간 계산(`availableWindows`)에서도 빠집니다.
- 남은 작업량 계산은 기존 `planned` 블록과 동일하게 취급하면 됩니다. (미뤄도 배치량은 그대로이므로)
- `postponed` 플래그가 영원히 남지 않도록, 블록이 지나가거나 `done`/`missed`가 되면 보호가 풀리게 하면 됩니다. (이미 시작한 블록은 기존 규칙으로 보호됨)

**B. 보호하지 않고 힌트로만 전달**
- `postponed: true`를 `existingFutureBlocks`에 그대로 두고 프롬프트에 "사용자가 직접 옮긴 블록이니 가능하면 유지"만 추가
- AI가 바꿀 수 있으므로 사용자가 고른 시각이 보장되지 않습니다.

**C. 미루기 직후 리스케줄링을 바로 호출**
- 지금은 호출하지 않습니다. 필요하면 프론트에서 성공 후 `POST /api/schedule/reschedule`(reason `manual`)을 이어서 부르면 됩니다.
- 이 경우 A가 먼저 되어 있어야 방금 미룬 블록이 다시 움직이지 않습니다.

> 프론트/서버 쪽은 어떤 안이든 바로 맞출 수 있습니다. A로 가면 `postponed` 플래그를 그대로 쓰면 되고, 다른 이름이 필요하면 알려 주세요.

## 6. 확인용

- 테스트: `backend/test/postpone.test.js` (이동, 묶인 블록 간격 유지, 과거·마감·겹침·휴식 부족 거절)
- API 명세: `docs/api.md`의 "작업 블록 미루기"

---

## 팀원에게 보낼 메시지 (복사용)

> 캘린더에서 **미루기**를 만들었어요. 사용자가 날짜·시간을 고르면 `POST /api/schedule/blocks/postpone`으로 해당 `scheduledBlocks`의 `date/start/end`를 그 시각으로 옮기고, `status: planned`, `postponed: true`를 붙여요. (`placementReason`은 지워요) 겹침·마감·수면·휴식·`breakMinutes` 위반이면 서버가 거절해서 저장된 데이터는 항상 유효해요.
>
> 근데 **리스케줄링은 안 불러요.** 그리고 지금은 미룬 블록이 `planned` + 미래라서 다음 계획에서 `replaceableBlockIds`에 들어가 AI가 다시 옮길 수 있어요. 사용자가 고른 시각을 지키려면 `protectedBlocks()`에서 `postponed === true`인 미래 블록도 보호해 주세요. (자세한 건 `docs/postpone-reschedule.md`) 방식은 보호 / 힌트만 / 미루기 직후 재배치 중에서 어떻게 할지 정해 주세요!
