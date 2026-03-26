# 백엔드 로컬 main 전수 QA 장애보고서

- 작성일: 2026-03-25
- 대상 브랜치: `main`
- 대상 저장소: `/Users/a2485/PJ/programmers/webfull_9_10_Sabujak_BE`
- 실행 환경: 로컬 Docker Compose 기동 API (`http://localhost:3000`)
- 범위: 문서 점검, 정적 검사, 단위 테스트, OpenAPI 검증, 실서버 API 블랙박스 QA

## 1. 요약

정적 검사와 단위 테스트는 모두 통과했지만, 실제 API 호출 기준으로는 즉시 조치가 필요한 장애 2건과 운영/연동 리스크 3건이 확인되었습니다.

가장 치명적인 문제는 관리자 비밀번호 검증 API가 존재하지 않는 slug와 잘못된 비밀번호에도 항상 성공한다는 점입니다. 또한 메시지 중복 닉네임 충돌이 명세상 `409 DUPLICATE_NICKNAME`이어야 하나 실제로는 `500 INTERNAL_SERVER_ERROR`로 노출되고 있습니다.

## 2. 수행 내역

실행 및 확인 완료:

- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm run test`
- `pnpm run openapi:check`
- `pnpm run build`
- `curl` 기반 실서버 시나리오 점검
- `docker compose logs api` 기반 서버 로그 확인

통과:

- 타입 검사 통과
- 린트 통과
- Jest 단위 테스트 `30/30` 통과
- OpenAPI 산출물 최신 상태 확인
- 빌드 통과
- 정상 플로우 일부 확인
  - slug 예약 생성 `201`
  - 동일 slug 재예약 차단 `409`
  - 캡슐 생성 `201`
  - 공개 전 조회 `200`
  - 메시지 1건 생성 `201`
  - 캡슐 수정 비밀번호 실패 `403`
  - 캡슐 수정 성공 및 `expiresAt` 재계산 확인
  - 캡슐 삭제 비밀번호 실패 `403`
  - 캡슐 삭제 성공 `204`
  - `/healthCheck` rate limit 동작 확인

## 3. 장애 목록

### [P1] `POST /capsules/{slug}/verify`가 모든 요청을 성공 처리함

- 실제 결과:
  - `POST /capsules/nonexistent-<ts>/verify` with `{"password":"9999"}` -> `200 {"verified":true}`
  - 존재하지 않는 slug와 오답 비밀번호 조합에서도 성공 응답이 내려왔습니다.
- 기대 결과:
  - 존재하지 않는 캡슐이면 `404 CAPSULE_NOT_FOUND`
  - 비밀번호 불일치면 `403 FORBIDDEN_PASSWORD`
- 코드 근거:
  - [`src/modules/capsules/capsules.repository.ts:277`](/Users/a2485/PJ/programmers/webfull_9_10_Sabujak_BE/src/modules/capsules/capsules.repository.ts#L277)
  - [`src/modules/capsules/capsules.repository.ts:279`](/Users/a2485/PJ/programmers/webfull_9_10_Sabujak_BE/src/modules/capsules/capsules.repository.ts#L279)
  - 구현이 입력을 버리고 `buildVerifyPasswordMock()`만 반환하고 있습니다.
- 문서 근거:
  - [`docs/API_SPEC.md:60`](/Users/a2485/PJ/programmers/webfull_9_10_Sabujak_BE/docs/API_SPEC.md#L60)
  - [`docs/API_SPEC.md:217`](/Users/a2485/PJ/programmers/webfull_9_10_Sabujak_BE/docs/API_SPEC.md#L217)
- 영향:
  - 수정/삭제 전 관리자 인증 흐름을 신뢰할 수 없습니다.
  - 프론트엔드가 이 API 응답만 믿고 UX를 설계할 경우 보안 검증이 무력화됩니다.

### [P1] 중복 닉네임 충돌이 `409`가 아니라 `500`으로 노출됨

- 실제 결과:
  - 동일 캡슐에 같은 nickname으로 두 번째 메시지 작성 시 `500 INTERNAL_SERVER_ERROR`
  - 명세상 기대값은 `409 DUPLICATE_NICKNAME`
- 기대 결과:
  - DB unique 충돌이 `DuplicateNicknameException`으로 변환되어 `409` 응답이어야 합니다.
- 코드 근거:
  - [`src/modules/capsules/capsules.repository.ts:424`](/Users/a2485/PJ/programmers/webfull_9_10_Sabujak_BE/src/modules/capsules/capsules.repository.ts#L424)
  - [`src/modules/capsules/capsules.repository.ts:429`](/Users/a2485/PJ/programmers/webfull_9_10_Sabujak_BE/src/modules/capsules/capsules.repository.ts#L429)
  - catch 문이 `error.code === "23505"`만 확인하지만, 실제 런타임에서는 top-level 에러가 `DrizzleQueryError`이고 PostgreSQL 에러 코드는 `error.cause.code`에 들어 있습니다.
- 로그 근거:
  - `docker compose logs --tail=80 api`에서 top-level 에러가 `DrizzleQueryError`로 출력됨
  - 같은 로그에서 실제 PostgreSQL 충돌 정보는 `cause.code: '23505'`, `constraint: 'messages_capsule_id_nickname_unq'`로 확인됨
- 문서 근거:
  - [`docs/API_SPEC.md:352`](/Users/a2485/PJ/programmers/webfull_9_10_Sabujak_BE/docs/API_SPEC.md#L352)
  - [`src/openapi/registry.ts:335`](/Users/a2485/PJ/programmers/webfull_9_10_Sabujak_BE/src/openapi/registry.ts#L335)
- 추가 리스크:
  - 동일한 패턴이 캡슐 생성의 slug unique 충돌 처리에도 존재합니다.
  - [`src/modules/capsules/capsules.repository.ts:190`](/Users/a2485/PJ/programmers/webfull_9_10_Sabujak_BE/src/modules/capsules/capsules.repository.ts#L190)
  - 경쟁 상황에서 slug unique 충돌이 발생하면 `409` 대신 `500`이 될 가능성이 높습니다.

### [P2] API 문서와 실제 라우트가 어긋나 있어 연동/QA가 오작동할 수 있음

- 실제 결과:
  - `GET /health` -> `404`
  - `GET /api/v3/capsules/test` -> `404`
  - 실제 엔드포인트는 `/healthCheck`, `/capsules/*` 입니다.
- 문서 근거:
  - [`docs/API_SPEC.md:5`](/Users/a2485/PJ/programmers/webfull_9_10_Sabujak_BE/docs/API_SPEC.md#L5)
  - [`docs/API_SPEC.md:60`](/Users/a2485/PJ/programmers/webfull_9_10_Sabujak_BE/docs/API_SPEC.md#L60)
  - [`docs/API_SPEC.md:73`](/Users/a2485/PJ/programmers/webfull_9_10_Sabujak_BE/docs/API_SPEC.md#L73)
- 실제 라우트 근거:
  - [`src/routes.ts:7`](/Users/a2485/PJ/programmers/webfull_9_10_Sabujak_BE/src/routes.ts#L7)
  - [`src/modules/system/system.routes.ts:35`](/Users/a2485/PJ/programmers/webfull_9_10_Sabujak_BE/src/modules/system/system.routes.ts#L35)
  - [`README.md:180`](/Users/a2485/PJ/programmers/webfull_9_10_Sabujak_BE/README.md#L180)
- 영향:
  - 문서 기준으로 붙는 FE/QA/외부 소비자는 첫 호출부터 404를 받습니다.
  - OpenAPI/README/API_SPEC 사이의 기준점이 갈라져 회귀 검증 자동화가 불안정해집니다.

### [P2] 테스트 구성이 실제 장애를 잡지 못하는 구조임

- 현재 테스트 파일은 2개뿐입니다.
  - [`src/db/pool.test.ts:1`](/Users/a2485/PJ/programmers/webfull_9_10_Sabujak_BE/src/db/pool.test.ts#L1)
  - [`src/modules/capsules/capsules.repository.test.ts:1`](/Users/a2485/PJ/programmers/webfull_9_10_Sabujak_BE/src/modules/capsules/capsules.repository.test.ts#L1)
- 확인된 문제:
  - `verify` 경로에 대한 테스트가 없습니다.
  - controller/route/integration 레벨 테스트가 없습니다.
  - DB 충돌 테스트가 실제 `DrizzleQueryError` 형태가 아니라 단순 `{ code: "23505" }` mock이라서 런타임 불일치를 놓쳤습니다.
  - 예시:
    - [`src/modules/capsules/capsules.repository.test.ts:207`](/Users/a2485/PJ/programmers/webfull_9_10_Sabujak_BE/src/modules/capsules/capsules.repository.test.ts#L207)
    - [`src/modules/capsules/capsules.repository.test.ts:458`](/Users/a2485/PJ/programmers/webfull_9_10_Sabujak_BE/src/modules/capsules/capsules.repository.test.ts#L458)
- 영향:
  - 현재처럼 단위 테스트가 모두 녹색이어도 실서버에서는 즉시 장애가 발생할 수 있습니다.

### [P3] 비도커 로컬 실행 가이드가 실제 설정과 맞지 않음

- 문서 근거:
  - [`README.md:154`](/Users/a2485/PJ/programmers/webfull_9_10_Sabujak_BE/README.md#L154)
  - README는 DB와 Redis만 준비되면 `pnpm run dev`로 로컬 실행 가능하다고 안내합니다.
- 설정 근거:
  - [`src/db/pool.ts:25`](/Users/a2485/PJ/programmers/webfull_9_10_Sabujak_BE/src/db/pool.ts#L25)
  - [`src/db/pool.ts:26`](/Users/a2485/PJ/programmers/webfull_9_10_Sabujak_BE/src/db/pool.ts#L26)
  - [`src/db/pool.ts:27`](/Users/a2485/PJ/programmers/webfull_9_10_Sabujak_BE/src/db/pool.ts#L27)
  - `DATABASE_URL`이 비어 있으면 host를 `db`로 고정합니다.
- 환경 템플릿 근거:
  - [`.env.example:34`](/Users/a2485/PJ/programmers/webfull_9_10_Sabujak_BE/.env.example#L34)
  - 예제값이 placeholder라서 그대로 복사하면 호스트 실행 시 정상 연결을 보장하지 못합니다.
- 실제 재현 메모:
  - 호스트에서 `node --import tsx` 기반 모듈 호출 시 `getaddrinfo ENOTFOUND db` 발생
- 영향:
  - 개발자 온보딩과 로컬 재현성이 낮습니다.
  - “로컬에서 바로 재현”해야 하는 QA 흐름이 Docker 내부 실행에 사실상 종속됩니다.

## 4. 정책 확인이 필요한 리스크

### [확인 필요] 캡슐 생성 시 과거 `openAt`이 허용됨

- 실제 결과:
  - `openAt=2020-01-01T00:00:00.000Z`로도 캡슐 생성이 `201` 성공
- 코드 근거:
  - [`src/modules/capsules/dto/create-capsule.dto.ts:16`](/Users/a2485/PJ/programmers/webfull_9_10_Sabujak_BE/src/modules/capsules/dto/create-capsule.dto.ts#L16)
  - [`src/modules/capsules/capsules.repository.ts:159`](/Users/a2485/PJ/programmers/webfull_9_10_Sabujak_BE/src/modules/capsules/capsules.repository.ts#L159)
- 메모:
  - 수정 API는 미래 시각만 허용하지만 생성 API는 동일 제약이 없습니다.
  - 의도된 정책이 아니라면 즉시 만료된 캡슐을 생성하는 우회 경로가 됩니다.

## 5. 권장 조치

1. `verifyCapsulePassword`를 mock 반환에서 실제 DB 조회 + password hash 검증으로 교체하고, `404/403/200` 케이스를 route 수준 테스트로 추가합니다.
2. `DrizzleQueryError`의 `cause.code`와 `cause.constraint`를 해석하도록 예외 변환 로직을 수정하고, duplicate nickname과 slug race 케이스를 통합 테스트로 보강합니다.
3. `docs/API_SPEC.md`, `README.md`, OpenAPI 문서의 base path와 health endpoint를 실제 구현과 일치시키거나 라우트를 문서 기준으로 맞춥니다.
4. 로컬 비도커 실행 정책을 명확히 정리합니다.
5. 생성 API의 `openAt` 미래 시각 정책 여부를 확정하고, 정책이 미래 시각 강제라면 DTO 검증에 반영합니다.

## 6. 결론

현재 `main`은 “정적 검사/단위 테스트는 통과하지만 실서버 기준으로는 주요 인증/예외 처리 장애가 남아 있는 상태”입니다. 특히 `verify` 항상 성공과 duplicate nickname의 `500` 노출은 우선순위 높게 수정해야 합니다.
