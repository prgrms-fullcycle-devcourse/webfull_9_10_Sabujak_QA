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

### staging

staging에서는 배포된 FE/BE 주소를 `.env` 또는 GitHub repository variables/secrets로 넣고 동일한 명령을 사용한다.

```bash
npm run qa:preflight
npm run qa:test
```

### CI

GitHub Actions 워크플로는 `.github/workflows/qa.yml`에 있다.

- `workflow_dispatch`: 수동 실행 가능
- `pull_request`: main 대상 PR에서 실행 시도

단, CI는 FE/BE를 직접 띄우지 않는다. `APP_BASE_URL`, `API_BASE_URL`, `TEST_CAPSULE_SLUG`, `TEST_ADMIN_PASSWORD`가 repository vars/secrets 또는 수동 실행 input으로 주어졌을 때만 실제 QA job이 실행된다. 값이 없으면 preflight job만 돌고 QA job은 스킵된다.

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

- slug 선점 후 `reservationToken`으로 capsule 생성이 이어지는지
- 공개 전/후 capsule 조회가 환경별 규칙에 맞게 분기되는지
- message 작성이 가능한지
- duplicate nickname 차단이 real/staging에서 동작하는지
- 관리자 비밀번호 검증 후 수정/삭제가 동작하는지
- `openAt` 변경 시 `expiresAt`이 7일 기준으로 재계산되는지
- mock 환경과 real 환경 차이가 테스트와 문서에 반영되어 있는지

현재 `tests/sabujak.qa.spec.mjs`는 mock 환경과 real/staging 환경을 분기해서 검증한다.

- mock: 문서상 현재 구현 차이를 확인하고, 미구현 보안/중복 규칙은 gap으로 기록
- staging/real: 실제 도메인 규칙을 검증

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

앞으로의 확장 방향은 다음과 같다.

- staging 전용 테스트 데이터와 초기화 API를 도입해 더 안정적인 반복 실행 보장
- PR 라벨 또는 입력값에 따라 mock/staging 분기 실행
- 필요 시 FE/BE 레포를 별도로 checkout하고 기동하는 통합 workflow 추가
- 사용자 흐름 중심 UI 시나리오를 점진적으로 확대
