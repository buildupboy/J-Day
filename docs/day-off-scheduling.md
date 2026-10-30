# 날짜별 휴무 요청

사용자 발화 “토요일 쉬고 싶은데 일정 빼줘”는 intent=reschedule과 다음 slots로 추출합니다.

```json
{"unavailableDates":["2026-10-31"],"availabilityAction":"block"}
```

일반 요청에서는 두 값이 null입니다. 취소는 availabilityAction=unblock입니다. 날짜는 KST 기준으로 해석하며 매주 반복 휴무는 이번 작업에서 지원하지 않습니다. 한 요청은 최대 31개 날짜, 변경은 앞으로 31일 이내입니다. 모호한 날짜/기간은 질문합니다.

## 저장 및 전달

- db.schedulingConstraints.unavailableDates에 날짜 목록을 보관합니다. 설정·과제·시간표 변경 이후의 재배치에서도 이 제약을 계속 사용합니다.
- planningContext와 settings에 unavailableDates를 전달합니다. 해당 날짜의 days[].slots는 비어 있고 blockedWindows에는 day_off로 하루 전체를 표시합니다.
- 요청 날짜가 기본 14일 밖이면 최대 31일 범위에서 계획 기간을 늘려 그 날짜의 기존 미래 블록도 교체할 수 있게 합니다.
- sourceRevision에 schedulingConstraints를 포함하여 제약 변경 전 AI 응답을 거부합니다.
- acceptAiPlan에서 휴무 날짜의 신규 작업을 거부합니다. 실제 시각 선택은 계속 AI가 수행합니다.
- 고정 일정·이미 시작한 작업·완료/과거 기록은 삭제하지 않으며 답변에도 보존 사실을 알립니다.
- 마감 전 모두 옮기지 못하면 unplaced를 반환하고 안내합니다. AI/검증/저장 실패 시 휴무 설정도 일부만 저장하지 않습니다.

## 응답

성공한 후에만 “알겠어요. 10월 31일 (토)에는 새 작업을 넣지 않도록 일정을 조정했어요. … 편안한 주말 보내세요!”처럼 날짜와 결과에 맞는 답변을 만듭니다. 별도 답변 생성 AI 호출을 추가하지 않습니다. 대기 상태에서는 완료됐다고 말하지 않습니다.

직접 API에서도 POST /api/schedule/reschedule의 reason/horizonDays와 함께 unavailableDates/availabilityAction을 보낼 수 있습니다. 적용 상태 조회는 기존 /api/schedule/context를 사용합니다.

## 검증

임시 저장소 테스트로 요청 재시도 멱등성, 날짜 제외/해제, 기록 보존, 잔량 안내, 실패 시 원복, 14일 밖 요청의 범위 확장을 확인했습니다. 전체 자동 테스트 112개 통과.

공통 가상 목업에서 실제 발화 해석과 AI 배치를 호출해 약 15.3초에 완료했고, 토요일의 미래 planned 블록은 0개였습니다. 실제 사용자 DB에는 요청을 적용하지 않았습니다.

이번 변경은 날짜별 휴무 기능에 한정합니다. 앞서 원복한 고정 일정 이후 max(이동,휴식) 계산 로직은 다시 적용하지 않았습니다.
