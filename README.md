# Sabujak QA Repository

이 레포는 사부작 타임캡슐 서비스의 E2E QA 자동화를 별도 관리하기 위한 QA 전용 저장소다. 프론트엔드와 백엔드 구현 레포와 분리해서 Playwright 기반 테스트, GitHub Actions 워크플로, Codex QA 스킬을 운영한다.

## Quick Start

처음 실행할 때는 아래 순서를 권장한다.

1. FE와 BE 실행 환경 준비
2. `cp .env.example .env`
3. `npm install`
4. `npm run qa:install`
5. `npm run qa:preflight`
6. `npm run qa:test`

## 1. 이 QA 레포의 목적

- QA 레포 자체에서 자동화 워크플로와 테스트 자산을 관리한다.
- 사부작 도메인 규칙 중심의 회귀 QA를 FE/BE 구현 변경과 분리해 유지한다.
- Codex가 반복적으로 동일한 기준으로 mock, local, staging, real 환경을 검증할 수 있게 한다.
- 완전 자동이 어려운 부분은 스켈레톤으로 숨기지 않고 현재 가능한 수준을 문서화한다.

## 2. FE/BE 레포와의 관계

같은 상위 디렉토리에 아래 레포가 함께 있다.

- `../webfull_9_10_Sabujak_FE`
- `../webfull_9_10_Sabujak_BE`

역할은 명확히 분리한다.

- FE 레포: Vite/React 기반 사용자 화면 구현
- BE 레포: Express 기반 타임캡슐 API와 도메인 규칙 구현
- QA 레포: 외부 환경을 대상으로 실행하는 Playwright QA, GitHub Actions, Codex 운영 가이드

이 QA 레포는 FE/BE 코드를 직접 소유하거나 CI에서 자동으로 띄우는 것을 전제로 하지 않는다.

현재 README의 동기화 기준은 아래 최신 main 자산이다.

- BE main의 `docs/API_SPEC.md`
- BE main의 `src/modules/capsules/capsules.routes.ts`
- FE main의 `src/App.tsx`
- FE main의 `src/features/capsule/components/ui/CapsuleViewUpcoming.tsx`

즉, 이 문서는 특정 PR 초안이 아니라 현재 `main`에 반영된 API/화면 계약을 기준으로 유지한다.

## 3. 선택한 자동화 전략

현재는 `A. FE/BE는 별도로 떠 있는 환경(local/staging)을 대상으로 QA 실행` 전략을 선택했다.

이유는 다음과 같다.

- QA 레포는 FE/BE 소스의 실행 책임을 갖지 않는다.
- GitHub Actions에서 인접 디렉토리 `../webfull_9_10_Sabujak_FE`, `../webfull_9_10_Sabujak_BE`를 직접 참조하는 방식은 로컬에서는 가능해도 원격 CI에서는 재현성이 낮다.
- 백엔드는 DB, Redis, 환경 변수 같은 인프라 의존성이 있어 QA 레포만으로 완전 자동 부팅을 약속하기 어렵다.
- 이미 FE README에는 Vercel 배포 주소가 있고, BE README에는 Render/Swagger 주소가 있어 외부 실행 환경을 QA 대상으로 삼는 편이 더 현실적이다.

즉, 로컬에서는 사람이 FE/BE를 띄운 뒤 이 레포의 테스트를 붙이고, CI에서는 staging 또는 이미 떠 있는 대상 환경에 대해 자동 QA를 수행한다.

## 4. 자동 QA가 도는 환경

자동 QA는 아래 환경 변수를 기준으로 외부 대상 환경에 붙는다.

- `APP_BASE_URL`: 프론트엔드 접근 주소
- `API_BASE_URL`: API 기본 주소
- `QA_ENV`: `mock`, `staging`, `real` 중 하나
- `TEST_CAPSULE_SLUG`: QA용 slug prefix
- `TEST_ADMIN_PASSWORD`: QA용 관리자 비밀번호
- `ENABLE_MESSAGE_COUNT_SSE_QA`: `true`일 때만 messageCount SSE QA 실행
- `ENABLE_LIVE_COUNT_UI_E2E`: `true`일 때만 브라우저 상세 페이지 시나리오 실행
- `CAPSULE_DETAIL_PATH_TEMPLATE`: 상세 페이지 path template. 기본값 `/capsules/{slug}`
- `MESSAGE_COUNT_SELECTOR`: 상세 페이지에서 count를 읽을 selector. 비워두면 QA가 `[data-testid="capsule-message-count"]`, `.total-heart`, 텍스트 매칭 순으로 자동 탐지

권장 기준은 다음과 같다.

- `mock`: mock API 동작 차이를 확인하는 빠른 회귀
- `staging`: CI 기본 대상. 배포된 FE/BE 통합 검증
- `real`: 실제 운영 환경 또는 운영과 유사한 실서버 검증

## 5. local / staging / CI 사용 방법

### local

로컬에서는 FE/BE를 각각 사람이 직접 실행한다.

권장 기준:

- FE는 프론트엔드 레포에서 `pnpm dev`
- BE는 가능하면 백엔드 레포에서 `docker compose up --build`
- BE를 `pnpm run dev`로 직접 띄우려면 백엔드 README의 환경 변수와 DB/Redis 연결 조건을 먼저 맞춘다.

예시:

```bash
# FE 레포
cd ../webfull_9_10_Sabujak_FE
pnpm install
pnpm dev

# BE 레포
cd ../webfull_9_10_Sabujak_BE
pnpm install
docker compose up --build
```

그 다음 QA 레포에서 실행한다.

```bash
cp .env.example .env
npm install
npm run qa:install
npm run qa:preflight
npm run qa:test
```

messageCount SSE 시나리오까지 켜려면 아래 값을 함께 설정한다.

```bash
ENABLE_MESSAGE_COUNT_SSE_QA=true
ENABLE_LIVE_COUNT_UI_E2E=true
CAPSULE_DETAIL_PATH_TEMPLATE=/capsules/{slug}
# MESSAGE_COUNT_SELECTOR=.total-heart
```

단, 이 값들은 대상 백엔드가 `GET /capsules/{slug}/message-count/stream`를 실제로 제공할 때만 켜야 한다. 현재 기준으로는 BE `main` 계약이 반영된 로컬 브랜치 또는 해당 내용이 이미 배포된 환경에서만 활성화하는 편이 안전하다.

### staging

staging에서는 배포된 FE/BE 주소를 `.env` 또는 GitHub repository variables/secrets로 넣고 동일한 명령을 사용한다.

```bash
npm run qa:preflight
npm run qa:test
```

staging 환경이 아직 최신 BE `main` 계약 배포 이전이라면 SSE 관련 flag는 끄고 core 회귀만 실행하는 것이 맞다.

### CI

GitHub Actions 워크플로는 `.github/workflows/qa.yml`에 있다.

- `workflow_dispatch`: 수동 실행 가능
- `pull_request`: main 대상 PR에서 실행 시도

단, CI는 FE/BE를 직접 띄우지 않는다. `APP_BASE_URL`, `API_BASE_URL`, `TEST_CAPSULE_SLUG`, `TEST_ADMIN_PASSWORD`가 repository vars/secrets 또는 수동 실행 input으로 주어졌을 때만 실제 QA job이 실행된다. 값이 없으면 preflight job만 돌고 QA job은 스킵된다.

현재 기본 workflow는 core 회귀 실행 기준으로 작성되어 있다. 따라서 SSE 전용 flag를 CI에 연결하려면 대상 환경에 최신 BE `main` 계약이 반영되어 있는지 먼저 확인한 뒤 workflow env도 함께 확장하는 편이 안전하다.

## 6. QA 실행 엔트리포인트

가장 단순한 실행 진입점은 아래 3개다.

1. 환경 변수 준비

```bash
cp .env.example .env
```

2. Playwright 브라우저 설치

```bash
npm run qa:install
```

3. 사전 점검

```bash
npm run qa:preflight
```

4. QA 실행

```bash
npm run qa:test
```

headless 브라우저 대신 직접 화면을 보고 싶으면 다음을 사용한다.

```bash
npm run qa:test:headed
```

## 7. 현재 자동화가 검증하는 도메인 기준

- slug 선점 후 `reservationToken`과 선택적 `reservationSessionToken`으로 capsule 생성이 이어지는지
- 공개 전/후 capsule 조회가 환경별 규칙에 맞게 분기되는지
- message 작성이 가능한지
- duplicate nickname 차단이 real/staging에서 동작하는지
- 관리자 비밀번호 검증 후 수정/삭제가 동작하는지
- `openAt` 변경 시 `expiresAt`이 7일 기준으로 재계산되는지
- mock 환경과 real 환경 차이가 테스트와 문서에 반영되어 있는지
- messageCount SSE 초기 snapshot과 상세 조회 값이 충돌 없이 맞춰지는지
- 메시지 작성 성공 직후 최신 `messageCount`가 SSE로 전파되는지
- 선택적으로 상세 페이지가 SSE 연결 중에도 새로고침 없이 count를 갱신하는지

현재 `tests/sabujak.qa.spec.mjs`는 mock 환경과 real/staging 환경을 분기해서 검증한다.

- mock: 문서상 현재 구현 차이를 확인하고, 미구현 보안/중복 규칙은 gap으로 기록
- staging/real: 실제 도메인 규칙을 검증

추가로 `tests/capsule-message-count.sse.spec.mjs`는 현재 main 계약의 SSE 기능을 별도 검증한다.

- 기준 백엔드 범위: BE `main`
  - 기존 `GET /capsules/:slug` 상세 조회는 유지
  - `GET /capsules/:slug/message-count/stream`이 초기 snapshot과 후속 증가 event를 제공
  - `POST /capsules/:slug/messages` 성공 후 DB 기준 최신 count를 push
  - heartbeat comment로 연결 유지
  - mock 환경은 실제 SSE 미지원
- 기준 프론트 범위: FE `main`
  - 상세 페이지 route는 `/capsules/:slug`
  - 공개 전 상세 화면은 SSE로 `messageCount` 숫자를 갱신
  - FE main에는 count 전용 `data-testid`가 없으므로 QA는 기본적으로 자동 selector fallback을 사용
- 주의:
  - 현재 BE `main`에는 메시지 삭제 API가 없으므로 삭제 기반 감소 시나리오는 QA 공식 범위에서 제거했다.
  - 따라서 현재 공식 지원 범위는 "초기 snapshot 정합성"과 "생성 이후 count 증가 동기화"다.

- API suite:
  - `GET /capsules/:slug`의 `messageCount`와 SSE 초기 event가 일치하는지
  - 메시지 생성 후 SSE event가 count 증가를 push하는지
- UI suite:
  - feature flag를 켠 경우에만 실행
  - 상세 페이지 최초 진입 후 detail API는 1회만 호출되고, 이후 SSE로만 count가 갱신되는지 확인
  - 브라우저 `EventSource` 연결과 page error를 함께 기록해 화면 안정성을 점검

## 8. Codex에게 요청하는 방식

아래처럼 요청하면 된다.

1. `staging 환경에서 slug 선점부터 reservationToken 기반 capsule 생성까지 자동 QA를 수행해라.`
2. `mock 환경에서 공개 전 capsule 조회와 opened-capsule 조회 차이를 검증해라.`
3. `real 환경에서 duplicate nickname 차단과 관리자 비밀번호 실패 케이스를 확인해라.`
4. `staging 환경에서 openAt 변경 시 expiresAt 재계산까지 포함해 캡슐 수정/삭제 QA를 해라.`
5. `mock과 real 차이를 중심으로 사부작 타임캡슐 회귀 QA를 실행하고 차이를 보고해라.`

## 9. 현재 한계와 확장 방향

현재 한계는 명확하다.

- QA 레포만으로 FE/BE와 DB/Redis를 완전 자동 부팅하지는 않는다.
- mock 환경은 duplicate nickname 차단, reservationToken 강제, 관리자 비밀번호 실패 같은 실제 규칙을 아직 보장하지 않는다.
- FE 화면 셀렉터 기반의 세밀한 사용자 여정 테스트는 프론트 UI 구조가 더 안정되면 확장하는 편이 안전하다.

현재 가능한 최선은 다음과 같다.

- QA 레포에서 Playwright 테스트와 GitHub Actions를 독립 운영한다.
- local과 staging에서 같은 테스트 코드를 재사용한다.
- CI는 외부 환경이 준비되었을 때만 안전하게 자동 QA를 수행한다.

messageCount SSE QA의 안정성 메모:

- 신규 API가 아직 배포되지 않은 환경에서는 `ENABLE_MESSAGE_COUNT_SSE_QA=false`로 두어야 한다.
- mock 환경은 현재 main 계약 기준으로도 실제 SSE를 아직 지원하지 않는다.
- UI 시나리오는 상세 페이지 route와 count selector가 안정적으로 고정되어야 한다.
- FE main 기준 기본 count 영역은 `.total-heart`이므로 selector를 명시하지 않으면 QA가 자동 fallback으로 읽는다.
- 특히 `MESSAGE_COUNT_SELECTOR`를 직접 지정할 때는 숫자 파싱이 가능한 단일 요소로 유지하는 편이 flakiness가 낮다.
- 현재 BE `main` 범위는 `messageCount` 실시간 증가 반영에 한정되며, 삭제 기반 감소 전파는 현 계약 밖으로 본다.

앞으로의 확장 방향은 다음과 같다.

- staging 전용 테스트 데이터와 초기화 API를 도입해 더 안정적인 반복 실행 보장
- PR 라벨 또는 입력값에 따라 mock/staging 분기 실행
- 필요 시 FE/BE 레포를 별도로 checkout하고 기동하는 통합 workflow 추가
- 사용자 흐름 중심 UI 시나리오를 점진적으로 확대
