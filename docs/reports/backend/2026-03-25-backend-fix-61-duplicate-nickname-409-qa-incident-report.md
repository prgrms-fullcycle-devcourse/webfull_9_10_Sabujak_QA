# 백엔드 `fix/61-duplicate-nickname-409` QA 장애보고서

- 점검 일시: 2026-03-25
- 점검 대상 저장소: `/Users/a2485/PJ/programmers/webfull_9_10_Sabujak_BE`
- 기준 브랜치: `origin/fix/61-duplicate-nickname-409`
- 실행 환경: 로컬 Docker Compose API (`http://127.0.0.1:3000`), QA 레포 Playwright (`/Users/a2485/PJ/programmers/webfull_9_10_Sabujak_QA`)
- 범위: 변경 코드 리뷰, 단위 테스트, 타입 검사, 실서버 API 블랙박스 QA, QA 자동화 회귀 확인

## 1. 요약

이번 브랜치의 목표였던 duplicate nickname 장애는 재현되지 않았고, 실제 API 기준으로 정상 복구를 확인했습니다.

- 동일 캡슐에 같은 닉네임으로 두 번째 메시지 작성 시 `409 DUPLICATE_NICKNAME` 반환 확인
- Drizzle 래퍼 예외를 포함하는 단위 테스트 `31/31` 통과
- `pnpm typecheck` 통과

다만, 브랜치 자체 결함과는 별개로 기존 QA 자동화 시나리오 3건이 현재 API 계약과 맞지 않아 실패했습니다. 이 항목들은 이번 브랜치의 수정 실패가 아니라 QA 자산 정합성 이슈로 분리 관리가 필요합니다.

## 2. 수행 내역

실행 및 확인 완료:

- `pnpm test -- capsules.repository.test.ts`
- `pnpm typecheck`
- `docker compose up -d db redis api`
- `curl http://127.0.0.1:3000/healthCheck`
- slug 예약 -> 캡슐 생성 -> 메시지 2회 작성 시나리오 수동 재현
- `npm run qa:preflight`
- `npm run qa:test`

핵심 수동 재현 결과:

- slug 예약: `201`
- 예약 토큰 기반 캡슐 생성: `201`
- 첫 번째 메시지 작성: `201`
- 동일 닉네임 두 번째 메시지 작성: `409`
- 응답 바디: `{"error":{"code":"DUPLICATE_NICKNAME","message":"중복된 닉네임입니다."}}`

## 3. 브랜치 검증 결과

### PASS. duplicate nickname `500` -> `409` 복구 확인

- 재현 절차:
  - 신규 slug 예약
  - 예약 토큰으로 캡슐 생성
  - 같은 `nickname`으로 메시지 2회 작성
- 실제 결과:
  - 1차 작성 `201`
  - 2차 작성 `409 DUPLICATE_NICKNAME`
- 판단:
  - `DrizzleQueryError -> cause.code/cause.constraint` 추적 로직이 실환경에서도 정상 동작함
  - 이번 브랜치의 핵심 장애는 해소된 상태로 판단

### PASS. slug unique 충돌 매핑 로직도 함께 보강됨

- 코드 diff 기준으로 `capsules_slug_unq`, `messages_capsule_id_nickname_unq`를 constraint 단위로 구분하고 있음
- 단순 `23505` 전체를 도메인 예외로 덮어쓰지 않기 때문에 다른 unique constraint를 잘못 `SlugAlreadyInUseException` 또는 `DuplicateNicknameException`으로 오인할 위험이 줄어듦

### PASS. 예약 정리 실패가 생성 성공 응답을 깨지 않도록 방어됨

- `createCapsule` 이후 Redis 예약 정리 실패를 별도 `try/catch`로 분리
- 캡슐 생성 성공 후 부수 작업 실패 때문에 사용자 요청이 실패 처리되는 문제를 방지함

## 4. 이번 QA에서 추가로 확인된 이슈

### [QA 자산 이슈] Playwright 시나리오가 이미 생성한 slug를 다시 예약하려고 함

- 실패 위치:
  - `/Users/a2485/PJ/programmers/webfull_9_10_Sabujak_QA/tests/sabujak.qa.spec.mjs:67`
- 실제 결과:
  - `beforeAll`에서 이미 `workingSlug` 캡슐을 생성한 뒤, 본 테스트에서 같은 slug를 다시 예약해 `409` 발생
- 기대 결과:
  - staging/real 시나리오에서는 재예약 대신 별도 slug를 사용하거나 해당 테스트를 분기해야 함
- 영향:
  - 백엔드 정상 동작을 false negative로 오판할 수 있음

### [QA 자산 이슈] 메시지 닉네임이 현재 API 최대 길이 20자를 초과할 수 있음

- 실패 위치:
  - `/Users/a2485/PJ/programmers/webfull_9_10_Sabujak_QA/tests/sabujak.qa.spec.mjs:138`
  - `/Users/a2485/PJ/programmers/webfull_9_10_Sabujak_BE/src/modules/capsules/dto/shared.dto.ts:24`
- 실제 결과:
  - 테스트 닉네임 `qa-nick-${Date.now()}`는 길이가 21자를 넘어 `400`이 발생할 수 있음
- 기대 결과:
  - 닉네임 길이 제한(`max(20)`) 안에서 unique 값을 생성해야 함
- 영향:
  - duplicate nickname 검증 전에 입력 검증에서 실패해, 핵심 회귀 시나리오가 흔들림

### [기존 백엔드 이슈] 비밀번호 verify API가 여전히 항상 성공함

- 실패 위치:
  - `/Users/a2485/PJ/programmers/webfull_9_10_Sabujak_QA/tests/sabujak.qa.spec.mjs:174`
- 실제 결과:
  - `POST /capsules/{slug}/verify` with wrong password -> `200 {"verified":true}`
- 기대 결과:
  - 잘못된 비밀번호면 `403 FORBIDDEN_PASSWORD`
- 판단:
  - 이 문제는 이번 브랜치의 duplicate nickname 수정 범위 밖이지만, 기존 main QA에서 지적된 중대 이슈가 아직 남아 있음

## 5. 결론

`origin/fix/61-duplicate-nickname-409` 브랜치는 본래 장애였던 duplicate nickname `500` 문제를 정상적으로 해결했습니다. 실서버 API 재현과 단위 테스트 모두에서 기대한 `409 DUPLICATE_NICKNAME` 응답을 확인했습니다.

현재 남아 있는 실패는 이번 브랜치 회귀라기보다 두 가지로 분리됩니다.

- QA 레포 시나리오 자체의 입력/절차 불일치
- 기존 백엔드 미해결 이슈인 verify API 항상 성공 문제

따라서 이번 브랜치는 duplicate nickname 장애 대응 관점에서는 `QA PASS`, 전체 회귀 자동화 관점에서는 `조건부 PASS`로 판단합니다.
