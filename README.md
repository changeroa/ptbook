# ptbook

수면을 참고한 오늘 계획을 적용하고, 세트 기록과 다음 행동을 함께 이어가는
한국어 PT 에이전트입니다. Guuey의 기존 대화·사용자 home·GGUI를 재사용합니다.

체험: https://app.guuey.com/agent/78537711-e685-469d-b2fe-8bf378b1cdfc

Start Chat으로 시작하세요. 게스트는 같은 대화 안에서 계획·세트·식단을
이어갈 수 있지만, 원장은 임시 저장이며 재배포 후에는 초기화됩니다.

## 현재 구현

- 수면: 승인된 Healine D1 스냅샷을 owner에게만 조회합니다. 다른 사용자는
  별도의 체험용 수면 예시를 받습니다.
- 계획: 초안과 적용된 계획을 분리합니다. 짧은 수면에는 보조운동을 각
  1세트 줄이는 데모 규칙을 제안하며 사용자가 적용/유지를 선택합니다.
- 세트: 중복 요청을 한 번만 반영하고 계획 완료 수를 다시 계산합니다.
- 코칭: 실제 SKT A.X K2가 사용자 보고에 근거한 짧은 한국어 피드백을 만듭니다.
- 영상 근거: 김성환·짐승철·황철순의 검증된 19개 원본 구간을 검색합니다.
- 식단: 실제 OpenAI vision이 공개 식사 사진 샘플을 분석합니다.
  음식·분량 **텍스트** 입력은 A.X K2 경로를 사용합니다.
  확인 후 기록하고, 같은 식사 수정은 중복 합산하지 않습니다.
- 스쿼트: 소유자가 제공한 15.59초 영상의 선택 6프레임을 실제 OpenAI로
  분석한 결과를 캐시했습니다. A.X K2 코칭과 함께 저장된 분석임을 표시합니다.
- UI: 계획·수면·세트·영상·식단의 대표 GGUI 카드 5개를 사용합니다.

새 사진/영상 업로드는 현재 미지원입니다. 식사 사진은 허용된 공개 샘플,
영상은 소유자가 승인한 샘플만 지원합니다. 원본 영상과 프레임은 커밋하거나
공개하지 않습니다. 텍스트 추정과 저장된 분석을 새 이미지 분석으로 표시하지 않습니다.

## 구조

```text
Guuey Claude Agent SDK
  ├─ GGUI: 계획 / 수면 / 세트 / 영상 / 식단 카드
  ├─ ledger: 사용자 home의 날짜별 JSON 저장·재조회
  └─ Cloudflare Worker MCP /mcp/
       ├─ D1 DB: owner의 가져온 Healine 수면, SELECT 전용
       ├─ 상태 입력 → 계산 → nextState 반환
       ├─ 19개 원본 영상 구간 JSON
       ├─ OpenAI vision: 공개 식사 사진 / 선택 프레임 분석
       └─ A.X K2: 한국어 피드백 / 텍스트 영양 추정
```

Worker는 세트·식사를 저장하지 않습니다. 에이전트가 자신의 Guuey home
`ptbook/days/YYYY-MM-DD.json`을 읽고 nextState를 원자적으로 저장한 뒤
재조회합니다. 로그인 사용자는 영속, 게스트는 임시 저장입니다.
동시 다중 writer는 지원하지 않으며 한 활성 쓰기 대화가 전제입니다.

## MCP 도구

`get_sleep`, `get_workout_plan`, `get_today_plan`, `propose_workout_plan`,
`apply_workout_plan`, `log_set`, `get_recent_sets`, `find_reference_clips`,
`estimate_meal`, `log_meal`, `get_daily_nutrition`, `set_feedback`,
`analyze_squat_video`.

13개 모두 실제 배포 endpoint에 curl JSON-RPC 호출로 검증했습니다.
`analyze_squat_video`는 `sample_id:"owner-squat-20261107"`의 저장된 분석만
반환하며 그 외 입력에는 `UNSUPPORTED_MEDIA`를 반환합니다. 상태 변경 도구에는
현재 `state`와 고유 `requestId`를 전달하고, `commitRequired:true`일 때만
반환 `nextState`를 저장합니다.

## 설치와 검증

```sh
pnpm install
pnpm typecheck
pnpm --filter @ptbook/mcp typecheck
bun test tests mcps/ptbook/tests
pnpm build
pnpm --filter @ptbook/web build
pnpm --filter @ptbook/mcp build
```

루트는 Guuey 호스트, `mcps/ptbook`은 별도 Cloudflare Worker입니다.
Guuey CLI와 Wrangler는 프로젝트 로컬 의존성입니다.

```sh
# 로그인된 계정으로 호스트 배포
pnpm exec guuey deploy --code

# 별도 MCP 배포
pnpm --filter @ptbook/mcp deploy

# 배포된 에이전트와 연결한 제품 셸
pnpm bootstrap -- --link
pnpm --filter @ptbook/web dev
```

Guuey 배포와 Vite 정적 사이트 배포는 별개입니다. 공식 Portal을 제품
진입점으로 사용하고, 로컬 제품 셸을 호스팅된 사이트라고 소개하지 않습니다.

## 인증과 비밀정보

Worker: https://ptbook-mcp.changeroa.workers.dev

- `/health`는 개인정보 없는 상태 확인입니다.
- `/mcp/`는 bearer token 필수입니다.
- Guuey federation은 RS256, JWKS, issuer, 정확한 audience, expiry,
  app ID를 검증합니다. owner subject만 D1 계정과 서버에서 연결합니다.
- 비공개 operator token은 curl 검증 전용이며 Guuey 고객에게 배포하지 않습니다.
- `PTBOOK_AX_KEY`, `PTBOOK_OPENAI_KEY`, `PTBOOK_ADMIN_TOKEN`,
  `PTBOOK_APP_ID`, `PTBOOK_OWNER_SUB`, `PTBOOK_HEALINE_SUB`는 Wrangler secrets입니다.
- `.dev.vars`, `.env*`, 키 파일과 원본 건강 덤프는 커밋하지 않습니다.

키 값은 프롬프트·props·로그에 넣지 않습니다. A.X 해커톤 키는 제공 조건상
2026-11-08 00:00 KST 만료 예정입니다.

## 실제 연결과 예시의 경계

| 항목 | 실제 실행 | 제한 |
| --- | --- | --- |
| Healine 수면 | D1 SELECT | 11/1–11/7 덤프, 실제 수면은 11/4–7; live sync 아님 |
| 게스트 수면 | 분리된 고정 예시 | owner 건강 기록 아님 |
| 운동·식사 저장 | Guuey 사용자 home | 게스트 임시, 단일 활성 writer |
| 코칭 | A.X K2 실제 API | 기록 기반, 자세 관찰 아님 |
| 식사 사진 | OpenAI vision 실제 API | 공개 샘플, 분량·영양 추정 |
| 텍스트 식단 | A.X K2 실제 API | 텍스트와 분량 기반, 사진 미분석 |
| 영상 검색 | 제공된 원본 19구간 | 자동자막 기반, 웹 전체 검색 아님 |
| 스쿼트 분석 | OpenAI 6프레임 결과 캐시 | 소유자 승인 샘플, 새 호출·전체 영상 판정 아님 |
| 영양 계산 | 서버 4/4/9 계산 | 모델 kcal와 macro 환산 kcal 차이도 표시 |

## 데모 순서

1. "2026-11-07 오늘 하체 계획 짜줘."
2. 수면 근거와 계획 초안을 확인한 뒤 "적용".
3. "스쿼트 60kg 8회, RPE 8, 통증 없음"을 데모 기록으로 입력.
4. "소유자 스쿼트 샘플 분석 보여줘" 후 "발목 관련 설명 영상 찾아줘".
5. 다음 세트를 기록하고 계획 완료 수 갱신 확인.
6. "샐러드 사진 샘플 분석해줘" → 확인 → "기록".
7. 하루 원장과 누적 영양을 다시 읽기.

데모 중량은 사용자의 실제 목표가 아니라 명시적으로 입력한 예시입니다.
수면 규칙과 식단 추정은 의학적 처방이 아닙니다.
